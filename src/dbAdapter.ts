import type { SQLExecResult, DBDriver } from "./types.ts";
import { spawnSync } from "child_process";

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

  // Prepared statement cache (keyed by SQL text). For sqlite we keep
  // prepared Statement objects to avoid re-preparing on repeated queries.
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
  private autoInstallDrivers = true;

  constructor(
    config: {
      driver?: DBDriver;
      databaseUrl?: string;
      databaseName?: string;
      dir?: string;
      logs?: boolean;
      autoInstallDrivers?: boolean;
      [key: string]: any;
    } = {}
  ) {
    this.config = config;
    this.driver = config.driver ?? "sqlite";
    this.dir = config.dir;
    this.schema = config.schema;
    this.logs = !!config.logs;
    this.autoInstallDrivers = config.autoInstallDrivers !== false;
  }

  onConnect?: () => Promise<void>;

  private async defaultExport<T = any>(mod: any): Promise<T> {
    return mod?.default ?? mod;
  }

  private async isMissingModuleError(err: unknown) {
    return (
      !!err &&
      typeof err === "object" &&
      (("code" in err && (err as any).code === "ERR_MODULE_NOT_FOUND") ||
        /Cannot find module/.test(String(err)))
    );
  }

  private detectPackageManager() {
    const ua = process.env.npm_config_user_agent || "";
    if (ua.startsWith("pnpm")) return "pnpm";
    if (ua.startsWith("yarn")) return "yarn";
    return "npm";
  }

  private installPackage(pkg: string) {
    const pm = this.detectPackageManager();
    const installArgs = pm === "pnpm"
      ? ["add", pkg, "--no-save"]
      : pm === "yarn"
      ? ["add", pkg, "--no-lockfile"]
      : ["install", pkg, "--no-save"];

    const result = spawnSync(pm, installArgs, {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: false,
    });

    if (result.error || result.status !== 0) {
      throw new Error(`Unable to install package ${pkg}. Command: ${pm} ${installArgs.join(" ")}`);
    }
  }

  private async importDriver<T = any>(pkg: string): Promise<T> {
    try {
      const mod = await import(pkg);
      return await this.defaultExport<T>(mod);
    } catch (err) {
      if (this.autoInstallDrivers && (await this.isMissingModuleError(err))) {
        this.installPackage(pkg);
        const mod = await import(pkg);
        return await this.defaultExport<T>(mod);
      }
      throw err;
    }
  }

  async connect() {
    if (this.connected) return;

    switch (this.driver) {
      case "sqlite": {
        const filename = this.config.databaseUrl || ":memory:";
        const sqlite3 = await this.importDriver("sqlite3");
        const sqlite = await import("sqlite");
        this.sqliteDb = await sqlite.open({ filename, driver: sqlite3.Database });
        break;
      }

      case "mysql": {
        const mysql = await this.importDriver("mysql2/promise");
        this.mysqlConn = await mysql.createConnection({
          uri: this.config.databaseUrl,
        });
        break;
      }

      case "postgres": {
        const PgClientFactory = await this.importDriver("pg");
        const PgClient = PgClientFactory.Client ?? PgClientFactory;
        this.pgClient = new PgClient({
          connectionString: this.config.databaseUrl,
        });
        await this.pgClient.connect();
        break;
      }

      case "mongodb": {
        const mongodb = await this.importDriver("mongodb");
        const MongoClientClass = mongodb.MongoClient ?? mongodb.default ?? mongodb;
        this.mongoClient = new MongoClientClass(this.config.databaseUrl!);
        await this.mongoClient.connect();
        this.mongoDb = this.mongoClient.db(this.config.databaseName);
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
        // Use a simple prepared-statement cache for sqlite to reduce
        // repeated prepare overhead for frequently-used queries.
        try {
          // For SELECTs use .all, else run
          if (sql.toUpperCase().startsWith("SELECT")) {
            if (this.logs) console.log('EXEC (sqlite select):', sql, params);
            let stmt = this.stmtCache.get(sql);
            if (!stmt) {
              stmt = await this.sqliteDb!.prepare(sql);
              this.stmtCache.set(sql, stmt);
              if (this.stmtCache.size > this.stmtCacheMax) {
                // evict oldest
                const iter = this.stmtCache.keys();
                const first = iter.next();
                if (!first.done && first.value) {
                  const keyToEvict = first.value as string;
                  const s = this.stmtCache.get(keyToEvict);
                  try { if (s && s.finalize) s.finalize(); } catch {}
                  this.stmtCache.delete(keyToEvict);
                }
              }
            }
            const rows = await stmt.all(params);
            return { rows };
          } else {
            if (this.logs) console.log('EXEC (sqlite run):', sql, params);
            try {
              const result = await this.sqliteDb!.run(sql, params);
              return { rows: [], changes: result.changes, lastID: (result as any).lastID };
            } catch (err) {
              if (this.logs) console.error('SQL ERROR:', sql, params, (err as any)?.message ?? err);
              throw err;
            }
          }
        } catch (err) {
          // Fallback: run direct if prepared path fails for any reason
          try {
            if (sql.toUpperCase().startsWith("SELECT")) {
              const rows = await this.sqliteDb!.all(sql, params);
              return { rows };
            } else {
              const result = await this.sqliteDb!.run(sql, params);
              return { rows: [], changes: result.changes, lastID: (result as any).lastID };
            }
          } catch (inner) {
            throw inner;
          }
        }
      }

      case "mysql": {
        if (this.logs) console.log('EXEC (mysql):', sqlOrOp, params);
        const [result] = await this.mysqlConn!.execute(sqlOrOp, params);
        if (Array.isArray(result)) {
          return { rows: result };
        } else {
          return { rows: [], changes: result.affectedRows };
        }
      }

      case "postgres": {
        if (this.logs) console.log('EXEC (postgres):', sqlOrOp, params);
        const res = await this.pgClient!.query(sqlOrOp, params);
        return { rows: res.rows, changes: res.rowCount };
      }

      case "mongodb": {
        if (this.logs) console.log('EXEC (mongodb):', sqlOrOp, params);
        if (!this.mongoDb) throw new Error("MongoDB not initialized");
        const cmd = JSON.parse(sqlOrOp);
        const col = this.mongoDb.collection(cmd.collection);
        switch (cmd.action) {
          case "find":
            return { rows: await col.find(cmd.filter || {}).toArray() };
          case "insert":
            await col.insertMany(cmd.data);
            return { rows: cmd.data };
          case "update":
            const updateResult = await col.updateMany(cmd.filter, { $set: cmd.data });
            return { rows: [], changes: updateResult.modifiedCount };
          case "delete":
            const deleteResult = await col.deleteMany(cmd.filter);
            return { rows: [], changes: deleteResult.deletedCount };
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
        if (this.sqliteDb) await this.sqliteDb.close();
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
        return await this.sqliteDb!.all(`PRAGMA table_info(${table})`);
      case "mysql":
        return await this.mysqlConn!.query(`DESCRIBE ${table}`);
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
  // returns nothing here
}
