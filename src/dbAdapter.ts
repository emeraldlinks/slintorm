import type { SQLExecResult, DBDriver, ExecFn } from "./types.ts";

// ─── DBAdapter ────────────────────────────────────────────────────────────────
// SERVERLESS / EDGE CHANGES:
//  1. Removed `spawnSync` / auto-install entirely — no child_process in edge.
//  2. connect() is now lazy-async; no Node-specific globals at module load time.
//  3. All driver imports are dynamic (import()) so bundlers can tree-shake them.
//  4. `autoInstallDrivers` option removed — was the root cause of crashes in
//     restricted runtimes (Vercel Edge, CF Workers, Deno, Bun).
//  5. Prepared-statement cache kept for sqlite only (it's still valid in Node).
// ─────────────────────────────────────────────────────────────────────────────

export class DBAdapter {
  driver?: DBDriver;
  dir?: string;
  schema?: Record<string, any>;
  customExec: ExecFn | null = null;
  private sqliteDb: any = null;
  private mysqlConn: any = null;
  private pgClient: any = null;
  private mongoClient: any = null;
  private mongoDb: any = null;
  private connected = false;
  private stmtCache: Map<string, any> = new Map();
  private stmtCacheMax = 200;

  // Read replicas
  private replicaPools: { sqlite?: any; mysql?: any[]; pg?: any[] } = {};
  private replicaIndex = 0;

  private config: {
    driver?: DBDriver;
    databaseUrl?: string;
    databaseName?: string;
    dir?: string;
    logs?: boolean;
    replicas?: string[];  // connection URLs for read replicas
    poolSize?: number;    // connection pool size (PG/MySQL)
    exec?: ExecFn;        // custom exec function (bypasses TCP — use in edge/serverless)
    [key: string]: any;
  } = {};

  private logs = false;

  constructor(
    config: {
      driver?: DBDriver;
      databaseUrl?: string;
      databaseName?: string;
      dir?: string;
      logs?: boolean;
      exec?: ExecFn;
      [key: string]: any;
    } = {}
  ) {
    this.config = config;
    this.driver = config.driver ?? "sqlite";
    this.dir = config.dir;
    this.schema = config.schema;
    this.logs = !!config.logs;
    if (config.exec) {
      this.customExec = config.exec;
      this.connected = true;
    }
    // NOTE: autoInstallDrivers intentionally removed. Install your driver
    // (pg, mysql2, mongodb) as a normal dependency. sqlite3/sqlite are
    // optional — only needed when driver="sqlite".
  }

  onConnect?: () => Promise<void>;

  private async defaultExport<T = any>(mod: any): Promise<T> {
    return mod?.default ?? mod;
  }

  async connect() {
    if (this.connected) return;

    switch (this.driver) {
      case "sqlite": {
        const filename = this.config.databaseUrl || ":memory:";

        // Fallback chain:
        //   1. node:sqlite (Node 22.5+) — built-in, zero deps
        //   2. better-sqlite3 — sync, fast
        //   3. sqlite3 + sqlite — async wrapper
        //   4. Helpful install error

        let sqliteErr: any;

        // --- 1. Try node:sqlite (Node 22.5+) ---
        try {
          // @ts-ignore — node:sqlite is available from Node 22.5+
          const { DatabaseSync } = await import("node:sqlite");
          const db = new DatabaseSync(filename);
          db.exec("PRAGMA journal_mode = WAL");
          db.exec("PRAGMA foreign_keys = ON");

          const toSqlParam = (v: any) => typeof v === "boolean" ? Number(v) : v;
          this.sqliteDb = {
            _db: db,
            async all(sql: string, params: any[]) {
              const stmt = db.prepare(sql);
              const rows = stmt.all(...params.map(toSqlParam));
              return rows;
            },
            async run(sql: string, params: any[]) {
              const stmt = db.prepare(sql);
              const r = stmt.run(...params.map(toSqlParam));
              return { changes: r.changes, lastID: Number(r.lastInsertRowid) };
            },
            async close() { db.close(); },
            _isNodeSqlite: true,
          };
          break;
        } catch (e) {
          sqliteErr = e;
        }

        // --- 2. Try better-sqlite3 ---
        try {
          // @ts-ignore -- optional peer dep, not in devDependencies
          const mod = await import("better-sqlite3");
          const Database = await this.defaultExport<any>(mod);
          const db = new Database(filename);
          db.pragma("journal_mode = WAL");
          db.pragma("foreign_keys = ON");

          this.sqliteDb = {
            _db: db,
            async all(sql: string, params: any[]) {
              return db.prepare(sql).all(...params);
            },
            async run(sql: string, params: any[]) {
              const r = db.prepare(sql).run(...params);
              return { changes: r.changes, lastID: r.lastInsertRowid };
            },
            async close() { db.close(); },
            _isBetterSqlite: true,
          };
          break;
        } catch {
          // fall through
        }

        // --- 3. Try sqlite3 + sqlite (async wrapper) ---
        try {
          // @ts-ignore -- optional peer deps, not in devDependencies
          const sqlite3Mod = await import("sqlite3");
          const sqlite3 = await this.defaultExport<any>(sqlite3Mod);
          // @ts-ignore -- optional peer dep
          const sqliteMod = await import("sqlite");
          const sqlite = sqliteMod as any;
          this.sqliteDb = await sqlite.open({ filename, driver: sqlite3.Database });
          break;
        } catch {
          // fall through
        }

        // --- 4. Nothing worked — clear error ---
        throw new Error(
          `No SQLite driver found.\n\n` +
          `  Your Node version: ${process.version}\n` +
          `  (node:sqlite requires Node 22.5+)\n\n` +
          `Install one of:\n` +
          `  npm install better-sqlite3    (recommended)\n` +
          `  npm install sqlite3 sqlite     (async wrapper)\n` +
          `  # Or upgrade to Node 22.5+ to use the built-in driver.\n` +
          `\nOriginal error: ${(sqliteErr as any)?.message ?? sqliteErr}`
        );
      }

      case "mysql": {
        try {
          const mod = await import("mysql2/promise");
          const mysql = await this.defaultExport<any>(mod);
          this.mysqlConn = await mysql.createConnection({
            uri: this.config.databaseUrl,
          });
        } catch (err) {
          throw new Error(
            `MySQL driver not found. Install it:\n  npm install mysql2\n\nOriginal error: ${(err as any)?.message ?? err}`
          );
        }
        break;
      }

      case "postgres": {
        try {
          const mod = await import("pg");
          const pg = await this.defaultExport<any>(mod);
          const PgClient = pg.Client ?? pg;
          this.pgClient = new PgClient({
            connectionString: this.config.databaseUrl,
          });
          await this.pgClient.connect();
        } catch (err) {
          throw new Error(
            `Postgres driver not found. Install it:\n  npm install pg\n\nOriginal error: ${(err as any)?.message ?? err}`
          );
        }
        break;
      }

      case "mongodb": {
        try {
          const mod = await import("mongodb");
          const mongodb = await this.defaultExport<any>(mod);
          const MongoClientClass = mongodb.MongoClient ?? mongodb;
          this.mongoClient = new MongoClientClass(this.config.databaseUrl!);
          await this.mongoClient.connect();
          this.mongoDb = this.mongoClient.db(this.config.databaseName);
        } catch (err) {
          throw new Error(
            `MongoDB driver not found. Install it:\n  npm install mongodb\n\nOriginal error: ${(err as any)?.message ?? err}`
          );
        }
        break;
      }

      default:
        throw new Error(`Driver "${this.driver}" not implemented`);
    }

    this.connected = true;
    if (this.onConnect) await this.onConnect();
  }

  async exec(sqlOrOp: string, params: any[] = []): Promise<SQLExecResult> {
    if (this.customExec) {
      return this.customExec(sqlOrOp, params);
    }
    await this.connect();

    switch (this.driver) {
      case "sqlite": {
        const sql = sqlOrOp.trim();
        try {
          if (/^(SELECT|PRAGMA|WITH)/i.test(sql)) {
            if (this.logs) console.log("EXEC (sqlite select):", sql, params);
            let stmt = this.stmtCache.get(sql);
            if (!stmt) {
              stmt = { _prepared: sql }; // placeholder for cache key
              this.stmtCache.set(sql, stmt);
              if (this.stmtCache.size > this.stmtCacheMax) {
                const first = this.stmtCache.keys().next();
                if (!first.done) this.stmtCache.delete(first.value);
              }
            }
            const rows = await this.sqliteDb!.all(sql, params);
            return { rows: Array.isArray(rows) ? rows : [] };
          } else {
            if (this.logs) console.log("EXEC (sqlite run):", sql, params);
            const result = await this.sqliteDb!.run(sql, params);
            return { rows: [], changes: result?.changes, lastID: result?.lastID ?? result?.lastInsertRowid };
          }
        } catch (err) {
          if (this.logs) console.error("SQL ERROR:", sql, params, (err as any)?.message ?? err);
          throw err;
        }
      }

      case "mysql": {
        if (this.logs) console.log("EXEC (mysql):", sqlOrOp, params);
        const [result] = await this.mysqlConn!.execute(sqlOrOp, params);
        if (Array.isArray(result)) {
          return { rows: result };
        } else {
          return { rows: [], changes: (result as any).affectedRows, lastID: (result as any).insertId };
        }
      }

      case "postgres": {
        if (this.logs) console.log("EXEC (postgres):", sqlOrOp, params);
        const res = await this.pgClient!.query(sqlOrOp, params);
        return { rows: res.rows, changes: res.rowCount ?? 0 };
      }

      case "mongodb": {
        if (this.logs) console.log("EXEC (mongodb):", sqlOrOp, params);
        if (!this.mongoDb) throw new Error("MongoDB not initialized");
        const cmd = JSON.parse(sqlOrOp);
        const col = this.mongoDb.collection(cmd.collection);
        switch (cmd.action) {
          case "find":
            return { rows: await col.find(cmd.filter || {}).toArray() };
          case "insert":
            await col.insertMany(cmd.data);
            return { rows: cmd.data };
          case "update": {
            const r = await col.updateMany(cmd.filter, { $set: cmd.data });
            return { rows: [], changes: r.modifiedCount };
          }
          case "delete": {
            const r = await col.deleteMany(cmd.filter);
            return { rows: [], changes: r.deletedCount };
          }
          default:
            throw new Error(`Unknown Mongo action ${cmd.action}`);
        }
      }

      default:
        throw new Error(`Unsupported driver: ${this.driver}`);
    }
  }

  async close() {
    switch (this.driver) {
      case "sqlite":
        if (this.sqliteDb?.close) await this.sqliteDb.close();
        break;
      case "mysql":
        if (this.mysqlConn) await this.mysqlConn.end();
        break;
      case "postgres":
        if (this.pgClient) await this.pgClient.end();
        break;
      case "mongodb":
        if (this.mongoClient) await this.mongoClient.close();
        break;
    }
    this.connected = false;
  }

  async connectReplicas() {
    const replicaUrls = this.config.replicas;
    if (!replicaUrls?.length) return;
    for (const url of replicaUrls) {
      try {
        if (this.driver === "postgres") {
          const mod = await import("pg");
          const pg = await this.defaultExport<any>(mod);
          const client = new (pg.Client ?? pg)({ connectionString: url });
          await client.connect();
          if (!this.replicaPools.pg) this.replicaPools.pg = [];
          this.replicaPools.pg.push(client);
        } else if (this.driver === "mysql") {
          const mod = await import("mysql2/promise");
          const mysql = await this.defaultExport<any>(mod);
          const conn = await mysql.createConnection({ uri: url });
          if (!this.replicaPools.mysql) this.replicaPools.mysql = [];
          this.replicaPools.mysql.push(conn);
        }
      } catch {}
    }
  }

  async execRead(sqlOrOp: string, params: any[] = []): Promise<SQLExecResult> {
    await this.connect();
    const replicas = this.driver === "postgres" ? this.replicaPools.pg
      : this.driver === "mysql" ? this.replicaPools.mysql
      : null;
    if (!replicas?.length) return this.exec(sqlOrOp, params);

    this.replicaIndex = (this.replicaIndex + 1) % replicas.length;
    const replica = replicas[this.replicaIndex];

    if (this.logs) console.log("EXEC (read replica):", sqlOrOp, params);
    try {
      if (this.driver === "postgres") {
        const res = await replica.query(sqlOrOp, params);
        return { rows: res.rows, changes: res.rowCount ?? 0 };
      } else if (this.driver === "mysql") {
        const [result] = await replica.execute(sqlOrOp, params);
        return { rows: Array.isArray(result) ? result : [] };
      }
    } catch {
      return this.exec(sqlOrOp, params);
    }
    return this.exec(sqlOrOp, params);
  }

  async getTableInfo(table: string) {
    await this.connect();
    switch (this.driver) {
      case "sqlite":
        return await this.sqliteDb!.all(`PRAGMA table_info(${table})`, []);
      case "mysql":
        return (await this.mysqlConn!.execute(`DESCRIBE ${table}`))[0];
      case "postgres": {
        const res = await this.pgClient!.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1`,
          [table]
        );
        return res.rows;
      }
      case "mongodb":
        if (!this.mongoDb) return [];
        const sample = await this.mongoDb.collection(table).findOne({});
        return sample ? Object.keys(sample).map((k) => ({ name: k })) : [];
      default:
        return [];
    }
  }
}
