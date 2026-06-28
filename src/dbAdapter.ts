import type { SQLExecResult, DBDriver } from "./types.ts";

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
  private sqliteDb: any = null;
  private mysqlConn: any = null;
  private pgClient: any = null;
  private mongoClient: any = null;
  private mongoDb: any = null;
  private connected = false;
  private stmtCache: Map<string, any> = new Map();
  private stmtCacheMax = 200;

  private config: {
    driver?: DBDriver;
    databaseUrl?: string;
    databaseName?: string;
    dir?: string;
    logs?: boolean;
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
      [key: string]: any;
    } = {}
  ) {
    this.config = config;
    this.driver = config.driver ?? "sqlite";
    this.dir = config.dir;
    this.schema = config.schema;
    this.logs = !!config.logs;
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
        // Try better-sqlite3 first (sync, faster), fall back to sqlite3/sqlite
        try {
          // @ts-ignore -- optional peer dep, not in devDependencies
          const mod = await import("better-sqlite3");
          const Database = await this.defaultExport<any>(mod);
          const db = new Database(filename);
          db.pragma("journal_mode = WAL");
          db.pragma("foreign_keys = ON");

          // Wrap sync better-sqlite3 API in an async interface
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
        } catch {
          // Fall back to async sqlite3/sqlite wrapper
          try {
            const sqlite3Mod = await import("sqlite3");
            const sqlite3 = await this.defaultExport<any>(sqlite3Mod);
            const sqliteMod = await import("sqlite");
            const sqlite = sqliteMod as any;
            this.sqliteDb = await sqlite.open({ filename, driver: sqlite3.Database });
          } catch (err) {
            throw new Error(
              `No SQLite driver found. Install one:\n  npm install better-sqlite3\n  # or\n  npm install sqlite3 sqlite\n\nOriginal error: ${(err as any)?.message ?? err}`
            );
          }
        }
        break;
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
