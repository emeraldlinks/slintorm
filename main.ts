// slint-orm-full.ts
// Minimal, fully-typed multi-driver ORM prototype
// Supports: sqlite | postgres | mysql | mongo
// Auto-generates schema from `sample` object (no manual schema files).
//
// Note: Types are compile-time only; we use `sample` runtime hints to infer SQL types.
// For stronger runtime validation use Zod and pass zod schema to defineModel().

import type { Client as PGClient } from "pg";
import type { Connection as MySQLConnection } from "mysql2/promise";
import type { Db as MongoDb, MongoClient } from "mongodb";

type DBDriver = "sqlite" | "postgres" | "mysql" | "mongo" | undefined;

type SQLExecResult = { rows: any[] };
type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;

// Helper: normalize placeholders for Postgres ($1, $2)
function normalizePlaceholders(sql: string, driver?: DBDriver) {
  if (driver === "postgres") {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  return sql;
}

function mapJSTypeToSQL(value: any, driver?: DBDriver) {
  if (value === null || value === undefined) return driver === "postgres" || driver === "mysql" ? "TEXT" : "TEXT";
  const t = typeof value;
  if (t === "number") return Number.isInteger(value) ? "INTEGER" : (driver === "postgres" ? "REAL" : "REAL");
  if (t === "boolean") return driver === "postgres" ? "BOOLEAN" : "BOOLEAN";
  if (t === "object") return "JSON";
  return driver === "postgres" || driver === "mysql" ? "VARCHAR(255)" : "TEXT";
}

function fingerprintFromSchema(schema: Record<string, string>) {
  return JSON.stringify(Object.entries(schema).sort());
}

class DBAdapter {
  driver?: DBDriver;
  private _pg: any = null;
  private _mysql: any = null;
  private _sqlite: any = null;
  private _mongoClient: MongoClient | null = null;
  private _mongoDb: MongoDb | null = null;
  private connected = false;

  constructor(private config: { driver?: DBDriver; databaseUrl?: string } = {}) {
    this.driver = config.driver;
  }

  async connect() {
    if (this.connected) return;
    if (!this.driver) return;
    if (this.driver === "postgres") {
      const { Client } = await import("pg");
      const cs = this.config.databaseUrl || process.env.DATABASE_URL;
      if (!cs) throw new Error("Missing DATABASE_URL for postgres");
      this._pg = new Client({ connectionString: cs });
      await this._pg.connect();
    } else if (this.driver === "mysql") {
      const mysql = await import("mysql2/promise");
      this._mysql = await mysql.createConnection({ uri: this.config.databaseUrl || process.env.DATABASE_URL });
    } else if (this.driver === "sqlite") {
      const sqlite3 = await import("sqlite3");
      const { open } = await import("sqlite");
      const filename = this.config.databaseUrl || ":memory:";
      
this._sqlite = await open({ filename, driver: sqlite3.default.Database });
    } else if (this.driver === "mongo") {
      const { MongoClient } = await import("mongodb");
      const cs = this.config.databaseUrl || process.env.DATABASE_URL || "mongodb://localhost:27017";
      this._mongoClient = new MongoClient(cs);
      await this._mongoClient.connect();
      const dbName = (new URL(cs).pathname || "").replace("/", "") || "test";
      this._mongoDb = this._mongoClient.db(dbName);
    }
    this.connected = true;
  }

  async exec(sqlOrOp: string, params: any[] = []): Promise<SQLExecResult> {
    if (!this.driver) return { rows: [] };
    await this.connect();
    if (this.driver === "postgres") {
      const sql = normalizePlaceholders(sqlOrOp, this.driver);
      const res = await this._pg.query(sql, params);
      return { rows: res.rows };
    }
    if (this.driver === "mysql") {
      const [rows] = await this._mysql.execute(sqlOrOp, params);
      return { rows };
    }
    if (this.driver === "sqlite") {
      const t = sqlOrOp.trim().toUpperCase();
      if (t.startsWith("SELECT")) {
        const rows = await this._sqlite.all(sqlOrOp, params);
        return { rows };
      }
      await this._sqlite.run(sqlOrOp, params);
      return { rows: [] };
    }
    // For Mongo, sqlOrOp is a JSON-stringified payload instructing operation
    if (this.driver === "mongo") {
      // We expect caller to pass an op string like: "COLLECTION:<name>:FIND" and params [query, opts]
      const [verb, collName, op] = sqlOrOp.split(":");
      const coll = this._mongoDb!.collection(collName);
      if (op === "FIND") {
        const [query, opts] = params;
        const docs = await coll.find(query || {}, opts || {}).toArray();
        return { rows: docs };
      }
      if (op === "INSERT") {
        const [doc] = params;
        const r = await coll.insertOne(doc);
        return { rows: [{ insertedId: r.insertedId }] };
      }
      if (op === "UPDATE") {
        const [filter, update, opts] = params;
        const r = await coll.updateMany(filter, update, opts || {});
        return { rows: [{ matchedCount: r.matchedCount, modifiedCount: r.modifiedCount }] };
      }
      if (op === "DELETE") {
        const [filter] = params;
        const r = await coll.deleteMany(filter);
        return { rows: [{ deletedCount: r.deletedCount }] };
      }
      if (op === "AGG") {
        const [pipeline] = params;
        const docs = await coll.aggregate(pipeline).toArray();
        return { rows: docs };
      }
      // raw fallback
      return { rows: [] };
    }
    return { rows: [] };
  }

  async close() {
    if (!this.driver) return;
    if (this.driver === "postgres" && this._pg) await this._pg.end();
    if (this.driver === "mysql" && this._mysql) await this._mysql.end();
    if (this.driver === "sqlite" && this._sqlite) await this._sqlite.close();
    if (this.driver === "mongo" && this._mongoClient) await this._mongoClient.close();
    this.connected = false;
  }

  getMongoDb() {
    return this._mongoDb;
  }
}

type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";

type WhereClause<T> =
  | { type: "basic"; column: keyof T | string; op: OpComparison; value: any }
  | { type: "raw"; sql: string; params?: any[] }
  | { type: "nested"; clauses: WhereClause<T>[]; bool: "and" | "or" };

class QueryBuilder<T extends Record<string, any>> {
  private _selects: (keyof T | string)[] | null = null;
  private _where: WhereClause<T>[] = [];
  private _joins: { type: "join" | "left" | "right"; table: string; on: string }[] = [];
  private _groupBy: string[] = [];
  private _having: string[] = [];
  private _orderBy: string[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _distinct = false;
  private _aggregates: { fn: string; column?: string; alias?: string }[] = [];
  private _rawSql: { sql: string; params?: any[] } | null = null;

  constructor(
    private table: string,
    private keyPath: string,
    private driver: DBDriver | undefined,
    private exec: ExecFn
  ) {}

  select(...cols: (keyof T | string)[]) {
    this._selects = cols;
    return this;
  }

  distinct() {
    this._distinct = true;
    return this;
  }

where<K extends keyof T>(
  columnOrRaw: K | { sql: string; params?: any[] },
  op?: OpComparison | T[K],
  val?: T[K]
): this {
  // handle raw SQL
  if (typeof columnOrRaw === "object" && "sql" in columnOrRaw) {
    this._where.push({ type: "raw", sql: columnOrRaw.sql, params: columnOrRaw.params });
    return this;
  }

  // shorthand form: where(column, value)
  if (val === undefined && op !== undefined && typeof op !== "string") {
    this._where.push({ type: "basic", column: columnOrRaw as string, op: "=", value: op });
    return this;
  }

  // full form: where(column, operator, value)
  if (val !== undefined && typeof op === "string") {
    this._where.push({ type: "basic", column: columnOrRaw as string, op: op as OpComparison, value: val });
    return this;
  }

  throw new Error("Invalid where() usage. correct usage: where(column, operator, value)");
}

  andWhere<K extends keyof T>(columnOrRaw: keyof T | string | { sql: string; params?: any[] }, op?: OpComparison | T[K], val?: T[K]) {
    return this.where(columnOrRaw, op as any, val);
  }

  orWhere<K extends keyof T>(columnOrRaw: keyof T | string | { sql: string; params?: any[] }, op?: OpComparison | T[K], val?: T[K]) {
    // wrap last and this into nested OR if needed
    this._where.push({ type: "nested", clauses: [{ type: "basic", column: columnOrRaw as string, op: op as OpComparison, value: val }], bool: "or" });
    return this;
  }

  raw(sql: string, params?: any[]) {
    this._rawSql = { sql, params };
    return this;
  }

  // joins (SQL only)
  join(table: string, on: string) { this._joins.push({ type: "join", table, on }); return this; }
  leftJoin(table: string, on: string) { this._joins.push({ type: "left", table, on }); return this; }
  rightJoin(table: string, on: string) { this._joins.push({ type: "right", table, on }); return this; }

  groupBy(...cols: string[]) { this._groupBy.push(...cols); return this; }
  having(rawSql: string) { this._having.push(rawSql); return this; }

  orderBy(col: string, dir: "asc" | "desc" = "asc") { this._orderBy.push(`${col} ${dir.toUpperCase()}`); return this; }
  limit(n: number) { this._limit = n; return this; }
  offset(n: number) { this._offset = n; return this; }

  count(column?: keyof T | string, alias = "count") { this._aggregates.push({ fn: "COUNT", column: column as string | undefined, alias }); return this; }
  sum(column: keyof T | string, alias?: string) { this._aggregates.push({ fn: "SUM", column: column as string, alias }); return this; }
  avg(column: keyof T | string, alias?: string) { this._aggregates.push({ fn: "AVG", column: column as string, alias }); return this; }
  min(column: keyof T | string, alias?: string) { this._aggregates.push({ fn: "MIN", column: column as string, alias }); return this; }
  max(column: keyof T | string, alias?: string) { this._aggregates.push({ fn: "MAX", column: column as string, alias }); return this; }

  async get(): Promise<T[]> {
    if (this.driver === "mongo") {
      // Convert builder into Mongo find or aggregation
      const collOp = this.table;
      // Build match from where clauses (only supports basic AND/OR)
      const mongoFilter: any = {};
      const or: any[] = [];
      for (const w of this._where) {
        if (w.type === "basic") {
          const col = String(w.column);
          const op = w.op;
          if (op === "=") mongoFilter[col] = w.value;
          else if (op === "!=") mongoFilter[col] = { $ne: w.value };
          else if (op === "<") mongoFilter[col] = { $lt: w.value };
          else if (op === "<=") mongoFilter[col] = { $lte: w.value };
          else if (op === ">") mongoFilter[col] = { $gt: w.value };
          else if (op === ">=") mongoFilter[col] = { $gte: w.value };
          else if (op === "IN") mongoFilter[col] = { $in: w.value };
          else if (op === "NOT IN") mongoFilter[col] = { $nin: w.value };
          else if (op === "LIKE" || op === "ILIKE") mongoFilter[col] = { $regex: w.value, $options: op === "ILIKE" ? "i" : "" };
        } else if (w.type === "nested" && w.bool === "or") {
          const subOr: any = {};
          for (const sc of w.clauses) {
            if (sc.type === "basic") subOr[sc.column] = sc.value;
          }
          or.push(subOr);
        } else if (w.type === "raw") {
          // no-op for raw in mongo
        }
      }
      const filter = or.length ? { $or: or, ...mongoFilter } : mongoFilter;
      const opString = `COLLECTION:${collOp}:FIND`;
      const params = [filter, { projection: this._selects ? Object.fromEntries((this._selects as string[]).map(s => [s, 1])) : undefined }];
      const res = await this.exec(opString, params);
      return res.rows as T[];
    }

    if (this._rawSql) {
      return (await this.exec(this._rawSql.sql, this._rawSql.params || [])).rows as T[];
    }

    // Build SQL
    let sql = "SELECT ";
    if (this._distinct) sql += "DISTINCT ";
    if (this._aggregates.length) {
      sql += this._aggregates.map(a => `${a.fn}(${a.column ?? "*"})${a.alias ? ` AS ${a.alias}` : ""}`).join(", ");
    } else if (this._selects && this._selects.length > 0) {
      sql += this._selects.join(", ");
    } else {
      sql += "*";
    }
    sql += ` FROM ${this.table}`;

    // joins
    for (const j of this._joins) {
      if (j.type === "join") sql += ` JOIN ${j.table} ON ${j.on}`;
      if (j.type === "left") sql += ` LEFT JOIN ${j.table} ON ${j.on}`;
      if (j.type === "right") sql += ` RIGHT JOIN ${j.table} ON ${j.on}`;
    }

    // where
    const whereParts: string[] = [];
    const params: any[] = [];
    for (const w of this._where) {
      if (w.type === "basic") {
        if (w.op === "IN" || w.op === "NOT IN") {
          const vals = (w.value || []) as any[];
          const placeholders = vals.map(() => "?").join(", ");
          whereParts.push(`${String(w.column)} ${w.op} (${placeholders})`);
          params.push(...vals);
        } else if (w.op === "ILIKE") {
          // Postgres ILIKE, emulate in others using LOWER() comparisons
          if (this.driver === "postgres") whereParts.push(`${String(w.column)} ILIKE ?`), params.push(w.value);
          else whereParts.push(`LOWER(${String(w.column)}) LIKE LOWER(?)`), params.push(w.value);
        } else {
          whereParts.push(`${String(w.column)} ${w.op} ?`);
          params.push(w.value);
        }
      } else if (w.type === "raw") {
        whereParts.push(w.sql);
        if (w.params) params.push(...w.params);
      } else if (w.type === "nested") {
        // only handle simple OR nested
        const nestedParts: string[] = [];
        for (const sc of w.clauses) {
          if (sc.type === "basic") {
            nestedParts.push(`${String(sc.column)} ${sc.op} ?`);
            params.push(sc.value);
          }
        }
        if (nestedParts.length) whereParts.push(`(${nestedParts.join(" OR ")})`);
      }
    }
    if (whereParts.length) sql += " WHERE " + whereParts.join(" AND ");

    if (this._groupBy.length) sql += " GROUP BY " + this._groupBy.join(", ");
    if (this._having.length) sql += " HAVING " + this._having.join(" AND ");
    if (this._orderBy.length) sql += " ORDER BY " + this._orderBy.join(", ");
    if (this._limit != null) sql += " LIMIT " + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    const res = await this.exec(sql, params);
    return res.rows as T[];
  }

  async first(): Promise<T | null> {
    this.limit(1);
    const r = await this.get();
    return r[0] || null;
  }
}

// Migrator: create SQL tables or Mongo collections
class Migrator {
  private migrationsTable = "__slint_migrations__";
  constructor(private driver: DBDriver | undefined, private exec: ExecFn) {}

  async ensureMigrationTable() {
    if (this.driver === "mongo") return;
    const sql = this.driver === "mysql"
      ? `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name VARCHAR(255) PRIMARY KEY, fingerprint TEXT)`
      : `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name TEXT PRIMARY KEY, fingerprint TEXT)`;
    await this.exec(sql);
  }

  async getFingerprint(table: string) {
    if (this.driver === "mongo") {
      // store in a special collection
      const res = await this.exec(`COLLECTION:${this.migrationsTable}:FIND`, [{ table_name: table }]);
      return res.rows[0]?.fingerprint || null;
    }
    await this.ensureMigrationTable();
    const res = await this.exec(`SELECT fingerprint FROM ${this.migrationsTable} WHERE table_name = ?`, [table]);
    return res.rows[0]?.fingerprint || null;
  }

  async setFingerprint(table: string, fingerprint: string) {
    if (this.driver === "mongo") {
      await this.exec(`COLLECTION:${this.migrationsTable}:INSERT`, [{ table_name: table, fingerprint }]);
      return;
    }
    if (this.driver === "postgres") {
      await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES($1,$2) ON CONFLICT(table_name) DO UPDATE SET fingerprint = $2`, [table, fingerprint]);
    } else if (this.driver === "mysql") {
      await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES(?,?) ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint)`, [table, fingerprint]);
    } else {
      await this.exec(`UPDATE ${this.migrationsTable} SET fingerprint = ? WHERE table_name = ?`, [fingerprint, table]);
      try { await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES(?,?)`, [table, fingerprint]); } catch (e) {}
    }
  }

  async sync(table: string, schema: Record<string, string>) {
    const fp = fingerprintFromSchema(schema);
    const existing = await this.getFingerprint(table);
    if (existing === fp) return { changed: false };
    if (this.driver === "mongo") {
      // Mongo: ensure collection exists by creating an index on _id if needed
      await this.exec(`COLLECTION:${table}:FIND`, [{}]);
      await this.setFingerprint(table, fp);
      return { changed: true };
    }
    // SQL: create if not exists (conservative: doesn't alter existing columns)
    const cols = Object.entries(schema).map(([k, t]) => `${k} ${t}`).join(", ");
    await this.exec(`CREATE TABLE IF NOT EXISTS ${table} (${cols})`);
    await this.setFingerprint(table, fp);
    return { changed: true };
  }
}

function inferSchemaFromSample(sample: Record<string, any> | undefined, driver?: DBDriver, keyPath = "id") {
  const s: Record<string, string> = {};
  if (sample) {
    for (const [k, v] of Object.entries(sample)) {
      if (v == null) continue;
      s[k] = mapJSTypeToSQL(v, driver);
    }
  }
  if (!s[keyPath]) s[keyPath] = driver === "postgres" || driver === "mysql" ? "VARCHAR(36)" : "TEXT";
  s[keyPath] += " PRIMARY KEY";
  return s;
}

export class SlintORM {
  private adapter: DBAdapter;
  constructor(private config: { driver?: DBDriver; databaseUrl?: string } = {}) {
    this.adapter = new DBAdapter(config);
    console.log("Driver received:", config.driver);
  }

  async close() { await this.adapter.close(); }

  defineModel<T extends Record<string, any>>(table: string, opts: { sample?: Partial<T>; keyPath?: keyof T | string } = {}) {
    const driver = this.config.driver;
    const keyPath = (opts.keyPath as string) || "id";
    let schema: Record<string, string> | null = null;
    let migrator: Migrator | null = null;

   const getMigrator = () => {
  if (!migrator) migrator = new Migrator(driver, (sql, params) => this.adapter.exec(sql, params));
  return migrator;
};

    async function ensureTable(sample?: Partial<T>) {
      if (schema) return;
      schema = inferSchemaFromSample(sample as Record<string, any> | undefined, driver, keyPath);
      const m = getMigrator();
      if (m && schema) await m.sync(table, schema);
    }

    const model = {
      async insert(item: T) {
        await ensureTable(item as Partial<T>);
        if (driver === "mongo") {
          const op = `COLLECTION:${table}:INSERT`;
          const res = await (this as any).adapter.exec(op, [item]);
          return res.rows;
        }
        const cols = Object.keys(item);
        const placeholders = cols.map(() => "?").join(", ");
        const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
        await (this as any).adapter.exec(sql, cols.map(c => (item as any)[c]));
        return item;
      },

      async update(idOrFilter: any, partial?: Partial<T>) {
        await ensureTable();
        if (driver === "mongo") {
          const filter = partial ? { [keyPath]: idOrFilter } : idOrFilter;
          const updateDoc = partial ? { $set: partial } : { $set: idOrFilter };
          const res = await (this as any).adapter.exec(`COLLECTION:${table}:UPDATE`, [filter, updateDoc, {}]);
          return res.rows;
        }
        let id: any; let data: Partial<T>;
        if (partial === undefined) { id = (idOrFilter as any)[keyPath]; data = idOrFilter; }
        else { id = idOrFilter; data = partial; }
        const cols = Object.keys(data);
        if (cols.length === 0) return null;
        const set = cols.map(c => `${c} = ?`).join(", ");
        const sql = `UPDATE ${table} SET ${set} WHERE ${keyPath} = ?`;
        const params = [...cols.map(c => (data as any)[c]), id];
        await (this as any).adapter.exec(sql, params);
        return { [keyPath]: id, ...data } as T;
      },

      async delete(idOrFilter: any) {
        await ensureTable();
        if (driver === "mongo") {
          const filter = idOrFilter;
          const res = await (this as any).adapter.exec(`COLLECTION:${table}:DELETE`, [filter]);
          return res.rows;
        }
        await (this as any).adapter.exec(`DELETE FROM ${table} WHERE ${keyPath} = ?`, [idOrFilter]);
        return idOrFilter;
      },

      async get(id: any) {
        await ensureTable();
        if (driver === "mongo") {
          const res = await (this as any).adapter.exec(`COLLECTION:${table}:FIND`, [{ [keyPath]: id }]);
          return res.rows[0] || null;
        }
        const res = await (this as any).adapter.exec(`SELECT * FROM ${table} WHERE ${keyPath} = ?`, [id]);
        return res.rows[0] || null;
      },

      async getAll() {
        await ensureTable();
        if (driver === "mongo") {
          const res = await (this as any).adapter.exec(`COLLECTION:${table}:FIND`, [{}]);
          return res.rows;
        }
        const res = await (this as any).adapter.exec(`SELECT * FROM ${table}`);
        return res.rows;
      },

      query() {
        return new QueryBuilder<T>(table, keyPath, driver, (sql, params) => (this as any).adapter.exec(sql, params));
      },

      raw(sqlOrOp: string, params?: any[]) {
        return (this as any).adapter.exec(sqlOrOp, params || []);
      }
    };

    // bind adapter into model so methods can access it via `this.adapter`
    (model as any).adapter = this.adapter;

    return model as {
      insert(item: T): Promise<any>;
      update(idOrFilter: any, partial?: Partial<T>): Promise<any>;
      delete(idOrFilter: any): Promise<any>;
      get(id: any): Promise<T | null>;
      getAll(): Promise<T[]>;
      query(): QueryBuilder<T>;
      raw(sqlOrOp: string, params?: any[]): Promise<SQLExecResult>;
    };
  }
}

export default SlintORM;
