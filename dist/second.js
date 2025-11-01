"use strict";
// // mini-orm-full-with-migrations.ts
// // Fully featured TypeScript ORM (zero deps in core) with memory fallback, caching,
// // SQL generation, like(), migrator, drop table, DB auto-connection and lifecycle hooks.
// //
// // NOTE: To run against real DBs you must install the corresponding client packages:
// // postgres -> npm i pg
// // mysql     -> npm i mysql2
// // sqlite    -> npm i sqlite sqlite3
// type DBDriver = "sqlite" | "postgres" | "mysql" | undefined; // undefined = memory only
// type Operator = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN" | "IS" | "IS NOT" | "BETWEEN";
// type Value = string | number | boolean | null | Array<string | number | boolean>;
// type FilterTuple = { column: string; op: Operator; value: Value | [Value, Value] };
// interface DBStoreOptions {
//   tableName: string;
//   driver?: DBDriver;
//   keyPath?: string;
//   cache?: boolean;
//   schema?: Record<string, string>; // runtime column -> SQL type (for migrator)
//   exec?: (sql: string, params?: any[]) => Promise<any>;
//   hooks?: Partial<Record<HookName, HookCallback<any>[]>>;
// }
// interface SlintManagerOptions {
//   driver?: DBDriver;
//   databaseUrl?: string; // optional database url
//   cache?: boolean;
//   keyPath?: string;
// }
// type HookCallback<T> = (payload: T) => Promise<T> | T;
// type HookName = "beforeCreate" | "afterCreate" | "beforeUpdate" | "afterUpdate" | "beforeDelete" | "afterDelete";
// function isPlainObject(v: any) { return v !== null && typeof v === "object" && !Array.isArray(v); }
// function quoteIdentifier(ident: string, driver?: DBDriver) {
//   if (driver === "mysql") return `\`${ident.replace(/`/g, "``")}\``;
//   return `"${ident.replace(/"/g, '""')}"`;
// }
// function formatPlaceholders(sql: string, params: any[], driver?: DBDriver) {
//   // Convert '?' placeholders to $1, $2... for Postgres, keep '?' for others.
//   if (driver === "postgres") {
//     let i = 0;
//     return { sql: sql.replace(/\?/g, () => `$${++i}`), params };
//   }
//   return { sql, params };
// }
// const QueryCache = new Map<string, any>();
// // Generic exec wrapper (provided by SlintManager)
// async function safeExec(execFn: ((sql: string, params?: any[]) => Promise<any>) | undefined, sql: string, params: any[] = []) {
//   if (!execFn) return null;
//   return execFn(sql, params);
// }
// // ---------------- QueryBuilder ----------------
// class QueryBuilder<T extends Record<string, any>> {
//   private table: string;
//   private driver?: DBDriver;
//   private selects: string[] | null = null;
//   private filters: Array<{ type: "and" | "or"; tuple?: FilterTuple; raw?: { sql: string; params: any[] } }> = [];
//   private joins: string[] = [];
//   private groups: string[] = [];
//   private havings: Array<{ sql: string; params: any[] }> = [];
//   private orders: string[] = [];
//   private unions: Array<{ type: "UNION" | "UNION ALL" | "INTERSECT" | "EXCEPT"; builder: QueryBuilder<any> }> = [];
//   private lim?: number;
//   private off?: number;
//   private distinctFlag = false;
//   private useCache = false;
//   private forceCache = false;
//   private forLock: string | null = null;
//   private memory?: Map<string, T>;
//   private execFn?: (sql: string, params?: any[]) => Promise<any>;
//   constructor(table: string, driver?: DBDriver, memory?: Map<string, T>, execFn?: (sql: string, params?: any[]) => Promise<any>) {
//     this.table = table;
//     this.driver = driver;
//     this.memory = memory;
//     this.execFn = execFn;
//   }
//   async get(): Promise<T[]> {
//     const { sql, params } = this.toSqlAndParams();
//     const key = sql + JSON.stringify(params);
//     if (this.useCache && !this.forceCache) {
//       const cached = QueryCache.get(key);
//       if (cached) return cached as T[];
//     }
//     let result: T[] = [];
//     if (!this.driver && this.memory) {
//       // Use memory fallback with very basic filtering support
//       let rows = Array.from(this.memory.values());
//       if (this.filters.length) {
//         rows = rows.filter(r => {
//           for (const f of this.filters) {
//             if (f.tuple) {
//               const { column, op, value } = f.tuple;
//               const v = (r as any)[column];
//               if (op === "=" && v !== value) return false;
//               if (op === "!=" && v === value) return false;
//               if (op === "IN" && Array.isArray(value) && !value.includes(v)) return false;
//               // skip other ops
//             }
//           }
//           return true;
//         });
//       }
//       result = rows as T[];
//     } else {
//       // execute SQL with provided exec function if available
//       if (this.execFn) {
//         const raw = await this.execFn(sql, params);
//         result = Array.isArray(raw) ? raw : (raw && raw.rows) ? raw.rows : [];
//       } else {
//         result = [];
//       }
//     }
//     if (this.useCache) QueryCache.set(key, result);
//     return result;
//   }
//   // SELECT / DISTINCT
//   select(...cols: (keyof T | string)[]) { this.selects = cols.map(c => String(c)); return this; }
//   distinct() { this.distinctFlag = true; return this; }
//   // WHERE / FILTERS
//   where(colOrObj: string | Partial<T>, op?: Operator, value?: Value | [Value, Value]) {
//     if (typeof colOrObj === "string") {
//       if (!op) throw new Error("Operator required for string where");
//       this.filters.push({ type: "and", tuple: { column: colOrObj, op, value: value as Value } });
//     } else {
//       for (const [k, v] of Object.entries(colOrObj)) this.filters.push({ type: "and", tuple: { column: k, op: "=", value: v } });
//     }
//     return this;
//   }
//   orWhere(colOrObj: string | Partial<T>, op?: Operator, value?: Value | [Value, Value]) {
//     if (typeof colOrObj === "string") {
//       if (!op) throw new Error("Operator required for string orWhere");
//       this.filters.push({ type: "or", tuple: { column: colOrObj, op, value: value as Value } });
//     } else {
//       for (const [k, v] of Object.entries(colOrObj)) this.filters.push({ type: "or", tuple: { column: k, op: "=", value: v } });
//     }
//     return this;
//   }
//   whereRaw(sql: string, params: any[] = []) { this.filters.push({ type: "and", raw: { sql, params } }); return this; }
//   orWhereRaw(sql: string, params: any[] = []) { this.filters.push({ type: "or", raw: { sql, params } }); return this; }
//   in(column: string, values: Array<string | number | boolean>) { return this.where(column, "IN", values); }
//   notIn(column: string, values: Array<string | number | boolean>) { return this.where(column, "NOT IN", values); }
//   between(column: string, min: Value, max: Value) { return this.where(column, "BETWEEN", [min, max]); }
//   isNull(column: string) { return this.where(column, "IS", null); }
//   isNotNull(column: string) { return this.where(column, "IS NOT", null); }
//   // LIKE convenience: auto ILIKE for Postgres
//   like(column: string, value: string) {
//     const op: Operator = this.driver === "postgres" ? "ILIKE" : "LIKE";
//     return this.where(column, op, `%${value}%`);
//   }
//   exists(subquery: QueryBuilder<any>) { return this.whereRaw(`EXISTS (${subquery.toSqlAndParams().sql})`, subquery.toSqlAndParams().params); }
//   // JOINs
//   join(joinTable: string, leftExpr: string, rightExpr: string, type: "INNER" | "LEFT" | "RIGHT" | "FULL" = "INNER") {
//     this.joins.push(`${type} JOIN ${joinTable} ON ${leftExpr} = ${rightExpr}`);
//     return this;
//   }
//   leftJoin(jt: string, l: string, r: string) { return this.join(jt, l, r, "LEFT"); }
//   rightJoin(jt: string, l: string, r: string) { return this.join(jt, l, r, "RIGHT"); }
//   fullJoin(jt: string, l: string, r: string) { return this.join(jt, l, r, "FULL"); }
//   crossJoin(jt: string) { this.joins.push(`CROSS JOIN ${jt}`); return this; }
//   // GROUP / HAVING
//   groupBy(...cols: (keyof T | string)[]) { this.groups.push(...cols.map(c => String(c))); return this; }
//   havingRaw(sql: string, params: any[] = []) { this.havings.push({ sql, params }); return this; }
//   // ORDER / LIMIT / OFFSET
//   orderBy(col: keyof T | string, dir: "ASC" | "DESC" = "ASC") { this.orders.push(`${String(col)} ${dir}`); return this; }
//   orderByRaw(sql: string) { this.orders.push(sql); return this; }
//   limit(n: number) { this.lim = n; return this; }
//   offset(n: number) { this.off = n; return this; }
//   // UNION / INTERSECT / EXCEPT
//   union(builder: QueryBuilder<any>) { this.unions.push({ type: "UNION", builder }); return this; }
//   unionAll(builder: QueryBuilder<any>) { this.unions.push({ type: "UNION ALL", builder }); return this; }
//   intersect(builder: QueryBuilder<any>) { this.unions.push({ type: "INTERSECT", builder }); return this; }
//   except(builder: QueryBuilder<any>) { this.unions.push({ type: "EXCEPT", builder }); return this; }
//   // LOCKING
//   forUpdate() { this.forLock = "FOR UPDATE"; return this; }
//   forShare() { this.forLock = "FOR SHARE"; return this; }
//   // Caching
//   cache(enabled: boolean = true) { this.useCache = enabled; return this; }
//   force() { this.forceCache = true; return this; }
//   async first(): Promise<T | null> {
//     const rows = await this.get();
//     return rows.length ? rows[0] : null;
//   }
//   async find(id: string | number): Promise<T | null> {
//     if (!this.driver && this.memory) {
//       return this.memory.get(String(id)) || null;
//     }
//     if (!this.driver) return null;
//     const sql = `SELECT * FROM ${this.table} WHERE id = ? LIMIT 1;`;
//     const params = [id];
//     if (this.execFn) {
//       const raw = await this.execFn(sql, params);
//       const rows = Array.isArray(raw) ? raw : (raw && raw.rows) ? raw.rows : [];
//       return rows.length ? rows[0] : null;
//     }
//     return null;
//   }
//   // CASE / RAW helpers
//   case(expr?: string) { return new CaseBuilder(expr); }
//   raw(sql: string, params: any[] = []) { return { sql, params }; }
//   // BUILD SQL
//   toSqlAndParams(): { sql: string; params: any[] } {
//     const params: any[] = [];
//     let sel = this.selects ? this.selects.join(", ") : "*";
//     if (this.distinctFlag) sel = `DISTINCT ${sel}`;
//     let sql = `SELECT ${sel} FROM ${this.table}`;
//     if (this.joins.length) sql += " " + this.joins.join(" ");
//     if (this.filters.length) {
//       let whereSql = "";
//       for (const f of this.filters) {
//         const prefix = whereSql ? (f.type === "and" ? " AND " : " OR ") : "";
//         if (f.raw) { whereSql += prefix + `(${f.raw.sql})`; params.push(...f.raw.params); }
//         else if (f.tuple) {
//           const { column, op, value } = f.tuple;
//           if (op === "IN" || op === "NOT IN") {
//             if (!Array.isArray(value)) throw new Error(`${op} requires array`);
//             whereSql += prefix + `${column} ${op} (${value.map(() => "?").join(", ")})`;
//             params.push(...(value as any[]));
//           } else if (op === "BETWEEN") {
//             const [min, max] = value as [Value, Value];
//             whereSql += prefix + `${column} BETWEEN ? AND ?`;
//             params.push(min, max);
//           } else if ((op === "IS" || op === "IS NOT") && value === null) whereSql += prefix + `${column} ${op} NULL`;
//           else { whereSql += prefix + `${column} ${op} ?`; params.push(value); }
//         }
//       }
//       sql += " WHERE " + whereSql;
//     }
//     if (this.groups.length) sql += " GROUP BY " + this.groups.join(", ");
//     if (this.havings.length) { const hs = this.havings.map(h => `(${h.sql})`); hs.forEach((h, i) => params.push(...this.havings[i].params)); sql += " HAVING " + hs.join(" AND "); }
//     if (this.orders.length) sql += " ORDER BY " + this.orders.join(", ");
//     if (this.lim !== undefined) sql += ` LIMIT ${this.lim}`;
//     if (this.off !== undefined) sql += ` OFFSET ${this.off}`;
//     if (this.unions.length) {
//       for (const u of this.unions) {
//         const { sql: uSql, params: uParams } = u.builder.toSqlAndParams();
//         sql = `(${sql}) ${u.type} (${uSql})`;
//         params.push(...uParams);
//       }
//     }
//     if (this.forLock) sql += ` ${this.forLock}`;
//     sql += ";";
//     return formatPlaceholders(sql, params, this.driver);
//   }
// }
// // ---------------- CASE BUILDER ----------------
// class CaseBuilder {
//   private expr?: string;
//   private whens: Array<{ cond: string; val: any }> = [];
//   private elseVal?: any;
//   constructor(expr?: string) { this.expr = expr; }
//   when(cond: string, val: any) { this.whens.push({ cond, val }); return this; }
//   else(val: any) { this.elseVal = val; return this; }
//   toSql() {
//     let sql = "CASE";
//     if (this.expr) sql += ` ${this.expr}`;
//     for (const w of this.whens) sql += ` WHEN ${w.cond} THEN ${w.val}`;
//     if (this.elseVal !== undefined) sql += ` ELSE ${this.elseVal}`;
//     sql += " END";
//     return sql;
//   }
// }
// // ---------------- MIGRATOR ----------------
// class Migrator {
//   private exec?: (sql: string, params?: any[]) => Promise<any>;
//   private driver?: DBDriver;
//   private migrationsTable = "__slint_migrations__";
//   constructor(driver?: DBDriver, exec?: (sql: string, params?: any[]) => Promise<any>) {
//     this.driver = driver;
//     this.exec = exec;
//   }
//   async ensureMigrationTable() {
//     if (!this.exec) return;
//     const createSql = this.driver === "mysql"
//       ? `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name VARCHAR(255) PRIMARY KEY, fingerprint TEXT);`
//       : `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name TEXT PRIMARY KEY, fingerprint TEXT);`;
//     await safeExec(this.exec, createSql);
//   }
//   async getFingerprint(table: string): Promise<string | null> {
//     if (!this.exec) return null;
//     const q = `SELECT fingerprint FROM ${this.migrationsTable} WHERE table_name = ? LIMIT 1;`;
//     const res: any = await this.exec(q, [table]);
//     const rows = Array.isArray(res) ? res : (res && res.rows) ? res.rows : [];
//     if (!rows || rows.length === 0) return null;
//     const r = rows[0];
//     return r && r.fingerprint ? r.fingerprint : (Array.isArray(r) ? r[0] : null);
//   }
//   async setFingerprint(table: string, fingerprint: string) {
//     if (!this.exec) return;
//     if (this.driver === "postgres") {
//       await this.exec(
//         `INSERT INTO ${this.migrationsTable}(table_name, fingerprint) VALUES(?, ?) ON CONFLICT(table_name) DO UPDATE SET fingerprint = EXCLUDED.fingerprint;`,
//         [table, fingerprint]
//       );
//     } else if (this.driver === "mysql") {
//       await this.exec(
//         `INSERT INTO ${this.migrationsTable}(table_name, fingerprint) VALUES(?, ?) ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint);`,
//         [table, fingerprint]
//       );
//     } else {
//       await this.exec(`UPDATE ${this.migrationsTable} SET fingerprint = ? WHERE table_name = ?;`, [fingerprint, table]);
//       try {
//         await this.exec(`INSERT INTO ${this.migrationsTable}(table_name, fingerprint) VALUES(?, ?);`, [table, fingerprint]);
//       } catch (e) { /* ignore duplicate */ }
//     }
//   }
//   async createTableIfNotExists(table: string, schema: Record<string, string>) {
//     if (!this.exec) return;
//     const cols = Object.entries(schema).map(([k, t]) => `${k} ${t}`).join(", ");
//     const sql = `CREATE TABLE IF NOT EXISTS ${table} (${cols});`;
//     await safeExec(this.exec, sql);
//   }
//   async addMissingColumns(table: string, schema: Record<string, string>) {
//     if (!this.exec) return;
//     for (const [col, sqlType] of Object.entries(schema)) {
//       const alterSql = `ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType};`;
//       try {
//         await safeExec(this.exec, alterSql);
//       } catch (e) {
//         // ignore errors (column exists or unsupported)
//       }
//     }
//   }
//   fingerprintFor(schema: Record<string, string>) {
//     const keys = Object.keys(schema).sort();
//     const obj: Record<string, string> = {};
//     for (const k of keys) obj[k] = schema[k];
//     return JSON.stringify(obj);
//   }
//   async sync(table: string, schema: Record<string, string>) {
//     if (!this.exec) return { changed: false, reason: "no exec" };
//     await this.ensureMigrationTable();
//     const fp = this.fingerprintFor(schema);
//     const existing = await this.getFingerprint(table);
//     if (existing === fp) return { changed: false };
//     await this.createTableIfNotExists(table, schema);
//     await this.addMissingColumns(table, schema);
//     await this.setFingerprint(table, fp);
//     return { changed: true };
//   }
// }
// // ---------------- STORE ----------------
// function createDBStore<T extends Record<string, any>>(opts: DBStoreOptions & { exec?: (sql: string, params?: any[]) => Promise<any>, driver?: DBDriver, hooks?: Partial<Record<HookName, HookCallback<any>[]> > }) {
//   const table = opts.tableName;
//   const driver = opts.driver;
//   const keyPath = opts.keyPath || "id";
//   const memory = new Map<string, T>();
//   const storeCache = opts.cache || false;
//   const schema = opts.schema || {};
//   const execFn = opts.exec;
//   const hooks: Partial<Record<HookName, HookCallback<any>[]>> = opts.hooks || {};
//   // hook helpers
//   async function runHooks<H extends HookName, P>(name: H, payload: P): Promise<P> {
//     const list = hooks[name] || [];
//     let current = payload;
//     for (const fn of list!) {
//       // @ts-ignore
//       const res = await fn(current);
//       if (res !== undefined) current = res;
//     }
//     return current;
//   }
//   function buildInsert(item: Partial<T>) {
//     const cols = Object.keys(item);
//     const placeholders = cols.map(() => "?").join(", ");
//     return formatPlaceholders(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders});`, cols.map(c => (item as any)[c]), driver);
//   }
//   function buildUpdate(id: any, partial: Partial<T>) {
//     const cols = Object.keys(partial);
//     const set = cols.map(c => `${c} = ?`).join(", ");
//     return formatPlaceholders(`UPDATE ${table} SET ${set} WHERE ${keyPath} = ?;`, cols.map(c => (partial as any)[c]).concat([id]), driver);
//   }
//   return {
//     async add(item: T) {
//       // run beforeCreate hooks (allow modification)
//       const payload = await runHooks("beforeCreate", item);
//       const id = String((payload as any)[keyPath] || "");
//       memory.set(id, payload as T);
//       if (!driver || !execFn) return payload;
//       const q = buildInsert(payload);
//       await execFn(q.sql, q.params);
//       // afterCreate
//       const out = await runHooks("afterCreate", payload);
//       return out;
//     },
//     async update(idOrItem: string | T, partial?: Partial<T>) {
//       let id: any, data: Partial<T>;
//       if (typeof idOrItem === "string") { id = idOrItem; data = partial || {}; } else { id = (idOrItem as any)[keyPath]; data = idOrItem as Partial<T>; }
//       const existing = memory.get(String(id)) || {} as T;
//       const merged = { ...existing, ...data } as T;
//       // beforeUpdate
//       const before = await runHooks("beforeUpdate", merged);
//       memory.set(String(id), before as T);
//       if (!driver || !execFn) return before;
//       const q = buildUpdate(id, data);
//       await execFn(q.sql, q.params);
//       const after = await runHooks("afterUpdate", before);
//       return after;
//     },
//     async get(id: any) {
//       if (driver && execFn) {
//         const formatted = formatPlaceholders(`SELECT * FROM ${table} WHERE ${keyPath} = ? LIMIT 1;`, [id], driver);
//         const raw = await execFn(formatted.sql, formatted.params);
//         const rows = Array.isArray(raw) ? raw : (raw && raw.rows) ? raw.rows : [];
//         return rows[0] || null;
//       }
//       return memory.get(String(id)) || null;
//     },
//     async getAll() {
//       if (driver && execFn) {
//         const formatted = formatPlaceholders(`SELECT * FROM ${table};`, [], driver);
//         const raw = await execFn(formatted.sql, formatted.params);
//         return Array.isArray(raw) ? raw : (raw && raw.rows) ? raw.rows : [];
//       }
//       return Array.from(memory.values());
//     },
//     async remove(id: any) {
//       const existing = memory.get(String(id));
//       if (!existing) return null;
//       // beforeDelete
//       const payload = await runHooks("beforeDelete", existing);
//       memory.delete(String(id));
//       if (!driver || !execFn) return payload;
//       const formatted = formatPlaceholders(`DELETE FROM ${table} WHERE ${keyPath} = ?;`, [id], driver);
//       await execFn(formatted.sql, formatted.params);
//       const after = await runHooks("afterDelete", payload);
//       return after;
//     },
//     async clear() { memory.clear(); if (!driver || !execFn) return null; const formatted = formatPlaceholders(`DELETE FROM ${table};`, [], driver); return await safeExec(execFn, formatted.sql, formatted.params); },
//     async truncate() { memory.clear(); if (!driver || !execFn) return null; const formatted = formatPlaceholders(`TRUNCATE TABLE ${table};`, [], driver); return await safeExec(execFn, formatted.sql, formatted.params); },
//     async dropTable() { memory.clear(); if (!driver || !execFn) return null; const formatted = formatPlaceholders(`DROP TABLE IF EXISTS ${table};`, [], driver); return await safeExec(execFn, formatted.sql, formatted.params); },
//     query(execOverride?: (sql: string, params?: any[]) => Promise<any>) {
//       return new QueryBuilder<T>(table, driver, memory, execOverride || execFn);
//     },
//     raw(sql: string, params: any[] = []) { return formatPlaceholders(sql, params, driver); },
//     _dumpMemory() { return Array.from(memory.entries()); },
//     // migration helpers
//     async migrate(migrator: Migrator) {
//       if (!schema) return { changed: false, reason: "no schema provided" };
//       return migrator.sync(table, schema);
//     },
//     schema,
//     // expose hooks registration for this store
//     on<H extends HookName>(hook: H, fn: HookCallback<any>) {
//       hooks[hook] = hooks[hook] || [];
//       hooks[hook]!.push(fn);
//       return () => {
//         hooks[hook] = (hooks[hook] || []).filter(x => x !== fn);
//       };
//     },
//     // the hooks object (for introspection)
//     _hooks: hooks
//   };
// }
// // ---------------- SLINT MANAGER ----------------
// export class SlintManager {
//   private opts: SlintManagerOptions;
//   private migrator?: Migrator;
//   private driver?: DBDriver;
//   private databaseUrl?: string;
//   private client: any = null;
//   private connected = false;
//   constructor (opts: SlintManagerOptions = {}) {
//     this.opts = opts;
//     this.driver = opts.driver;
//     this.databaseUrl = opts.databaseUrl;
//     // migrator will be created once exec is available
//   }
//   // Connect lazily. Call connect() early during app bootstrap.
//   async connect() {
//     if (this.connected) return;
//     if (!this.driver || !this.databaseUrl) {
//       // nothing to connect (memory mode)
//       this.migrator = new Migrator(this.driver, undefined);
//       this.connected = true;
//       return;
//     }
//     if (this.driver === "postgres") {
//       try {
//         const { Client } = await import("pg");
//         const client = new Client({ connectionString: this.databaseUrl });
//         await client.connect();
//         this.client = client;
//         // exec function
//         const exec = async (sql: string, params: any[] = []) => {
//           const { sql: s, params: p } = formatPlaceholders(sql, params, "postgres");
//           return client.query(s, p);
//         };
//         this.migrator = new Migrator("postgres", exec);
//         this.connected = true;
//         return;
//       } catch (e: any) {
//         throw new Error("Postgres client not available. Install 'pg' and ensure environment supports dynamic imports. " + e.message);
//       }
//     } else if (this.driver === "mysql") {
//       try {
//         const mysql = await import("mysql2/promise");
//         const conn = await mysql.createConnection(this.databaseUrl);
//         this.client = conn;
//         const exec = async (sql: string, params: any[] = []) => {
//           const { sql: s, params: p } = formatPlaceholders(sql, params, "mysql");
//           const [rows] = await conn.execute(s, p);
//           return rows;
//         };
//         this.migrator = new Migrator("mysql", exec);
//         this.connected = true;
//         return;
//       } catch (e: any) {
//         throw new Error("MySQL client not available. Install 'mysql2'. " + e.message);
//       }
//     } else if (this.driver === "sqlite") {
//       try {
//         // sqlite wrapper that provides open() (npm i sqlite sqlite3)
//         const sqlite = await import("sqlite");
//         const sqlite3 = await import("sqlite3");
//         const db = await sqlite.open({ filename: this.databaseUrl || ":memory:", driver: sqlite3.Database });
//         this.client = db;
//         const exec = async (sql: string, params: any[] = []) => {
//           const { sql: s, params: p } = formatPlaceholders(sql, params, "sqlite");
//           // try to run SELECT (all) vs run for non-select
//           const lc = s.trim().toUpperCase().split(/\s+/)[0];
//           if (lc === "SELECT") {
//             return db.all(s, p);
//           } else {
//             return db.run(s, p);
//           }
//         };
//         this.migrator = new Migrator("sqlite", exec);
//         this.connected = true;
//         return;
//       } catch (e: any) {
//         throw new Error("SQLite client not available. Install 'sqlite' and 'sqlite3'. " + e.message);
//       }
//     } else {
//       // unknown driver -> memory-only
//       this.migrator = new Migrator(this.driver, undefined);
//       this.connected = true;
//       return;
//     }
//   }
//   // Generic exec for stores and query builders
//   async exec(sql: string, params: any[] = []) {
//     if (!this.connected) await this.connect();
//     if (!this.migrator || !this.migrator['exec']) {
//       // migrator.exec is private; instead build an exec from client
//       if (!this.client) return null;
//     }
//     if (!this.client) return null;
//     if (this.driver === "postgres") {
//       const client = this.client;
//       const { sql: s, params: p } = formatPlaceholders(sql, params, "postgres");
//       return client.query(s, p);
//     } else if (this.driver === "mysql") {
//       const conn = this.client;
//       const { sql: s, params: p } = formatPlaceholders(sql, params, "mysql");
//       const [rows] = await conn.execute(s, p);
//       return rows;
//     } else if (this.driver === "sqlite") {
//       const db = this.client;
//       const { sql: s, params: p } = formatPlaceholders(sql, params, "sqlite");
//       const lc = s.trim().toUpperCase().split(/\s+/)[0];
//       if (lc === "SELECT") return db.all(s, p);
//       return db.run(s, p);
//     }
//     return null;
//   }
//   new<T extends Record<string, any>>(table: string, storeOpts?: { schema?: Record<string, string>, keyPath?: string, hooks?: Partial<Record<HookName, HookCallback<any>[]>> }) {
//     if (!table) throw new Error("no table name provided, please provide one.");
//     const merged: DBStoreOptions & { exec?: (sql: string, params?: any[]) => Promise<any> } = {
//       tableName: table,
//       driver: this.driver,
//       cache: this.opts.cache,
//       keyPath: storeOpts?.keyPath || this.opts.keyPath || "id",
//       schema: storeOpts?.schema || {},
//       exec: async (sql: string, params?: any[]) => {
//         // If user calls store.exec directly, forward to manager.exec
//         await this.connect(); // ensure connected
//         return this.exec(sql, params || []);
//       },
//       hooks: storeOpts?.hooks
//     };
//     return createDBStore<T>(merged);
//   }
//   // run migrations for a set of stores: pass array of { table, schema }
//   async migrateAll(stores: Array<{ table: string, schema: Record<string, string> }>) {
//     if (!this.migrator) await this.connect();
//     if (!this.migrator) throw new Error("migrator not available");
//     const results = [];
//     for (const s of stores) {
//       const r = await this.migrator!.sync(s.table, s.schema);
//       results.push({ table: s.table, ...r });
//     }
//     return results;
//   }
//   getMigrator() {
//     if (!this.migrator) throw new Error("migrator not ready - call connect() first");
//     return this.migrator;
//   }
//   // close connection (best-effort)
//   async close() {
//     if (!this.connected) return;
//     try {
//       if (this.driver === "postgres" && this.client) await this.client.end();
//       if (this.driver === "mysql" && this.client) await this.client.end();
//       if (this.driver === "sqlite" && this.client) await this.client.close();
//     } catch (e) { /* ignore */ }
//     this.connected = false;
//   }
// }
// // ---------------- USAGE EXAMPLE ----------------
// // (Place in your app bootstrap)
// // import SlintManager from './mini-orm-full-with-migrations'
// // const manager = new SlintManager({ driver: "postgres", databaseUrl: process.env.DATABASE_URL });
// // await manager.connect();
// // const users = manager.new<{ id: string; name: string; age?: number }>("users", { schema: { id: "VARCHAR(36) PRIMARY KEY", name: "TEXT", age: "INT" } });
// // await manager.migrateAll([{ table: "users", schema: { id: "VARCHAR(36) PRIMARY KEY", name: "TEXT", age: "INT" } }]);
// // users.on("beforeCreate", async (payload) => { /* validate or mutate */ return payload; });
// // const created = await users.add({ id: "1", name: "Joe", age: 23 });
// // const q = users.query().select("id","name").like("name", "Ada");
// // console.log(q.toSqlAndParams());
// // const rows = await q.get(); // runs against DB
// export default SlintManager;
