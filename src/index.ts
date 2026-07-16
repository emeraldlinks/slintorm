// SERVERLESS / EDGE CHANGES:
//   1. Removed `import path from "node:path"` — path is not available in V8
//      isolates (Vercel Edge, Cloudflare Workers, Deno Deploy). All path ops
//      now use URL-relative logic or are delegated to the generator (Node-only).
//   2. getPaths() is kept but only used in the Node migrate() path — edge
//      callers pass `schema` directly and never touch the filesystem.
//   3. generateSchema is dynamically imported only when needed (Node migrate()),
//      so the V8 bundle never includes fs/ts-morph.
//   4. migration-history is likewise dynamically imported only in migrate().

import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory, type ModelAPI } from "./model.js";
import { Migrator, type SchemaModel } from "./migrator.js";
import { wrapExec } from "./db-error.js";
import type { DBDriver, ExecFn } from "./types.js";
import type { DataMigration } from "./migration-history.js";
import type { Plugin, PluginEventType, OrmContext } from "./types.js";
export type { HashField } from "./security.js";
export type { DataMigration } from "./migration-history.js";

export type AnyModelMap = Record<string, object>;

export type ORMManagerConfig<TModelMap extends AnyModelMap = AnyModelMap> = {
  driver?: DBDriver;
  databaseUrl?: string;
  databaseName?: string;
  dir?: string;
  logs?: boolean;
  /** Pre-built schema — required when using the ORM in edge/serverless runtimes
   *  that have no filesystem access. Run `npx slintorm generate` during your
   *  build step, import the generated JSON, and pass it here. */
  schema?: Record<string, SchemaModel>;
  modelMap?: TModelMap;
  /** Read replica connection URLs (round-robin) */
  replicas?: string[];
  /** Connection pool size for PostgreSQL/MySQL */
  poolSize?: number;
  /** Custom exec function — bypasses TCP-based driver connection.
   *  Use in edge/serverless to tunnel SQL through HTTP via proxyExec()
   *  from "slintorm/proxy" or any other fetch-based ExecFn. */
  exec?: ExecFn;
  /** Master encryption key for @encrypt annotations (AES-256-GCM).
   *  Must be at least 32 characters long. Pass the same key to all
   *  instances that share a database — key rotation requires re-encrypting
   *  all @encrypt fields. */
  encryptionKey?: string;
  /** Enable Row-Level Security support (PostgreSQL only).
   *  When true, every query sets PostgreSQL session parameters from the
   *  current OrmContext (keys prefixed with "rls."), so RLS policies
   *  referencing current_setting('rls.xxx') work automatically.
   *  Use orm.withContext({ tenant_id: "abc" }) to set values.
   *  NOTE: The database user must NOT have the BYPASSRLS attribute
   *  (superusers bypass RLS). Use a dedicated application role. */
  rls?: boolean;
};

export type ModelHooks<T extends object> = {
  onCreateBefore?: (item: T) => T | void | Promise<T | void>;
  onCreateAfter?: (item: T) => void | Promise<void>;
  onUpdateBefore?: (
    oldData: T | null,
    newData: Partial<T>
  ) => Partial<T> | void | Promise<Partial<T> | void>;
  onUpdateAfter?: (
    oldData: T | null,
    newData: Partial<T>
  ) => void | Promise<void>;
  onDeleteBefore?: (deleted: Partial<T>) => void | Promise<void>;
  onDeleteAfter?: (deleted: Partial<T>) => void | Promise<void>;
};

function resolveDriver(
  driver: string | undefined
): "sqlite" | "postgres" | "mysql" | undefined {
  if (driver === "sqlite" || driver === "postgres" || driver === "mysql")
    return driver;
  return undefined;
}

// ─── createORM (functional API) ───────────────────────────────────────────────
export async function createORM<TModelMap extends AnyModelMap = AnyModelMap>(
  cfg: ORMManagerConfig<TModelMap> = {}
) {
  const adapter = new DBAdapter({
    driver: cfg.driver,
    databaseUrl: cfg.databaseUrl,
    dir: cfg.dir || "src",
    logs: cfg.logs,
    schema: cfg.schema,
    modelMap: cfg.modelMap,
    replicas: cfg.replicas,
    poolSize: cfg.poolSize,
    exec: cfg.exec,
  });

  const sqlDriver = resolveDriver(adapter.driver);
  if (sqlDriver && !cfg.exec) {
    adapter.exec = wrapExec(adapter.exec.bind(adapter), sqlDriver);
  }

  // If schema provided, migrate immediately. Otherwise delegate to caller.
  if (cfg.schema) {
    const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);
    for (const modelName of Object.keys(cfg.schema)) {
      const model = cfg.schema[modelName];
      await migrator.ensureTable(
        model.table || modelName.toLowerCase(),
        model.fields
      );
    }
  }

  const defineModel = await createModelFactory(adapter, cfg.schema, async (event: any) => {
    // No global hooks available in functional API
  }, undefined, cfg.encryptionKey);
  return { adapter, defineModel };
}

let schemaGenerated = false;

type KnownModelName<TModelMap extends AnyModelMap> = Extract<
  keyof TModelMap,
  string
>;

export type DBStore<TModelMap extends AnyModelMap> = {
  [M in KnownModelName<TModelMap>]: ModelAPI<TModelMap[M]>;
};

export type ReadonlyDBStore<TModelMap extends AnyModelMap = AnyModelMap> =
  Readonly<DBStore<TModelMap>>;

// ─── ORMManager (class API) ───────────────────────────────────────────────────
export type GlobalHookEvent = {
  type: "beforeInsert" | "afterInsert" | "beforeUpdate" | "afterUpdate" | "beforeDelete" | "afterDelete";
  model: string;
  table: string;
  data?: any;
  filter?: any;
};

export default class ORMManager<
  TModelMap extends AnyModelMap = AnyModelMap
> {
  cfg: ORMManagerConfig<TModelMap>;
  adapter: DBAdapter;
  readonly DB: ReadonlyDBStore<TModelMap> = {} as ReadonlyDBStore<TModelMap>;
  private _globalHooks: Map<string, ((event: GlobalHookEvent) => void | Promise<void>)[]> = new Map();
  private _plugins: Plugin[] = [];
  private _context: OrmContext = {};
  private _preparedMode = false;
  private _rls = false;
  /** Named database connections for Database Resolver */
  private _databases: Map<string, { exec: any; driver?: string; adapter?: DBAdapter }> = new Map();

  constructor(cfg: ORMManagerConfig<TModelMap> = {}) {
    this.cfg = cfg;
    this.adapter = new DBAdapter({
      driver: this.cfg.driver,
      databaseUrl: this.cfg.databaseUrl,
      databaseName: this.cfg.databaseName,
      dir: this.cfg.dir || "src",
      logs: this.cfg.logs,
      schema: this.cfg.schema,
      modelMap: this.cfg.modelMap,
      replicas: this.cfg.replicas,
      poolSize: this.cfg.poolSize,
      exec: this.cfg.exec,
    });

    const sqlDriver = resolveDriver(this.adapter.driver);
    if (sqlDriver && !this.cfg.exec) {
      this.adapter.exec = wrapExec(
        this.adapter.exec.bind(this.adapter),
        sqlDriver
      );
    }

    this._rls = !!this.cfg.rls;
    if (this._rls && sqlDriver === "postgres") {
      const origExec = this.adapter.exec.bind(this.adapter);
      const lastRls: Record<string, string> = {};
      this.adapter.exec = async (sql: string, params?: any[]) => {
        const ctx = this._context;
        const keys = Object.keys(ctx).filter(k => ctx[k] != null);
        for (const key of keys) {
          const val = String(ctx[key]);
          if (lastRls[key] !== val) {
            await origExec("SELECT set_config($1, $2, false)", [
              `rls.${key}`,
              val,
            ]);
            lastRls[key] = val;
          }
        }
        // Clear any previously-set keys that are no longer in context
        for (const prevKey of Object.keys(lastRls)) {
          if (!(prevKey in ctx) || ctx[prevKey] == null) {
            delete lastRls[prevKey];
          }
        }
        return origExec(sql, params);
      };
    }
  }

  // ── migrate() — Node-only path ──────────────────────────────────────────────
  // In serverless/edge: do NOT call migrate(). Instead:
  //   1. Run `npx slintorm generate` at build time.
  //   2. Import the generated schema JSON.
  //   3. Pass it as `schema` in the constructor.
  //   4. Call defineModel() directly — migrations run automatically per-table
  //      the first time each model is used (schema is already known).
  async migrate() {
    if (!schemaGenerated) {
      schemaGenerated = true;

      // Dynamic imports — keeps the edge bundle free of Node APIs
      const [
        { default: generateSchema },
        { snapshotCurrentGeneratedSchema, runMigrations },
        pathMod,
      ] = await Promise.all([
        import("./generator.js"),
        import("./migration-history.js"),
        import("node:path"),
      ]);

      const schemaPath = pathMod.join(
        process.cwd(),
        this.cfg.dir || "src"
      );

      await snapshotCurrentGeneratedSchema({
        exec: this.adapter.exec,
        driver: this.cfg.driver,
        dir: this.cfg.dir || "src",
      });

      const schema =
        this.cfg.schema ?? (await generateSchema(schemaPath));
      if (!this.cfg.schema) {
        console.log("✅ Schema generated:", schemaPath);
      }

      await runMigrations({
        exec: this.adapter.exec,
        driver: this.cfg.driver,
        dir: this.cfg.dir || "src",
        schema: schema as Record<string, SchemaModel>,
      });
    }
  }

  async migrateData(migrations: DataMigration[]): Promise<{ applied: number; names: string[] }> {
    const { runDataMigrations } = await import("./migration-history.js");
    return runDataMigrations({
      exec: this.adapter.exec.bind(this.adapter),
      driver: this.cfg.driver,
      migrations,
    });
  }

  async defineModel<M extends KnownModelName<TModelMap>>(
    table: string,
    modelName: M,
    hooks?: ModelHooks<TModelMap[M]>
  ): Promise<ModelAPI<TModelMap[M]>>;
  async defineModel<T extends object>(
    table: string,
    modelName?: string,
    hooks?: ModelHooks<T>
  ): Promise<ModelAPI<T>>;
  async defineModel<T extends object>(
    table: string,
    modelName?: string,
    hooks?: ModelHooks<T>
  ): Promise<ModelAPI<T>> {
    const self = this;
    const defineModel = await createModelFactory(
      this.adapter,
      this.cfg.schema,
      async (event: any) => self._emitGlobal(event),
      (name: string) => self._databases.get(name),
      this.cfg.encryptionKey
    );
    const model = defineModel<T>(table, modelName, hooks);

    if (typeof modelName === "string") {
      const writableDB = this.DB as unknown as Record<string, unknown>;
      writableDB[modelName] = model as unknown;
    }

    return model;
  }

  async transaction<T>(
    callback: (trx: { exec: ExecFn; savepoint: (name: string) => Promise<void>; rollbackTo: (name: string) => Promise<void> }) => Promise<T>
  ): Promise<T> {
    const driver = this.adapter.driver;
    if (driver === "mongodb") {
      await this.adapter.startMongoTransaction();
    } else {
      await this.adapter.exec("BEGIN", []);
    }
    let spCounter = 0;
    const trx = {
      exec: this.adapter.exec.bind(this.adapter),
      savepoint: async (name?: string) => {
        if (driver === "mongodb") return;
        const sp = name || `sp_${++spCounter}`;
        await this.adapter.exec(`SAVEPOINT ${sp}`, []);
      },
      rollbackTo: async (name: string) => {
        if (driver === "mongodb") return;
        await this.adapter.exec(`ROLLBACK TO SAVEPOINT ${name}`, []);
      },
    };
    try {
      const result = await callback(trx);
      if (driver === "mongodb") {
        await this.adapter.commitMongoTransaction();
      } else {
        await this.adapter.exec("COMMIT", []);
      }
      return result;
    } catch (err) {
      if (driver === "mongodb") {
        await this.adapter.abortMongoTransaction();
      } else {
        await this.adapter.exec("ROLLBACK", []);
      }
      throw err;
    }
  }

  async batch(statements: { sql: string; params?: any[] }[]): Promise<void> {
    await this.transaction(async (trx) => {
      for (const stmt of statements) {
        await trx.exec(stmt.sql, stmt.params ?? []);
      }
    });
  }

  // ── Execute raw SQL with params ────────────────────────────────────
  async execRaw(sql: string, params: any[] = []): Promise<any> {
    return this.adapter.exec(sql, params);
  }

  // ── Global event system ────────────────────────────────────────────
  on(event: GlobalHookEvent["type"], handler: (event: GlobalHookEvent) => void | Promise<void>) {
    const handlers = this._globalHooks.get(event) || [];
    handlers.push(handler);
    this._globalHooks.set(event, handlers);
    return this;
  }

  off(event: GlobalHookEvent["type"], handler: (event: GlobalHookEvent) => void | Promise<void>) {
    const handlers = this._globalHooks.get(event);
    if (!handlers) return this;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
    if (!handlers.length) this._globalHooks.delete(event);
    return this;
  }

  async _emitGlobal(event: GlobalHookEvent) {
    const handlers = this._globalHooks.get(event.type);
    if (!handlers?.length) return;
    for (const handler of handlers) {
      await handler(event);
    }
    await this._emitPlugin(event.type as PluginEventType, event);
  }

  // ── Plugin system ──────────────────────────────────────────────
  use(plugin: Plugin): this {
    // Don't register duplicates
    if (this._plugins.some((p) => p.name === plugin.name)) return this;
    this._plugins.push(plugin);
    // Sort by priority (lower number = higher priority)
    this._plugins.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
    plugin.install(this);
    return this;
  }

  async _emitPlugin(event: PluginEventType, ctx: any = {}) {
    for (const plugin of this._plugins) {
      if (plugin.on) {
        await plugin.on(event, { ...ctx, context: this._context, orm: this });
      }
    }
  }

  // ── Context propagation ────────────────────────────────────────
  withContext(ctx: OrmContext): this {
    this._context = { ...this._context, ...ctx };
    return this;
  }

  getContext(): OrmContext {
    return { ...this._context };
  }

  clearContext(): this {
    this._context = {};
    return this;
  }

  rlsEnabled(): boolean {
    return this._rls;
  }

  // ── Prepared Statement Mode ────────────────────────────────────
  preparedMode(enabled: boolean): this {
    this._preparedMode = enabled;
    return this;
  }

  isPreparedMode(): boolean {
    return this._preparedMode;
  }

  // ── Database Resolver (multiple named databases) ───────────────
  /**
   * Register a named database connection.
   * @param name - logical database name (e.g. "archive", "analytics")
   * @param config - driver and connection URL or custom exec function
   */
  addDatabase(name: string, config: { driver?: DBDriver; databaseUrl?: string; exec?: any; logs?: boolean }): this {
    if (config.exec) {
      this._databases.set(name, { exec: config.exec, driver: config.driver });
    } else {
      const adapter = new DBAdapter({
        driver: config.driver,
        databaseUrl: config.databaseUrl,
        logs: config.logs,
      });
      this._databases.set(name, {
        exec: adapter.exec.bind(adapter),
        driver: config.driver,
        adapter,
      });
    }
    return this;
  }

  getDatabase(name: string): { exec: any; driver?: string; adapter?: DBAdapter } | undefined {
    return this._databases.get(name);
  }

  removeDatabase(name: string): boolean {
    return this._databases.delete(name);
  }

  resolveDb(name: string): { exec: any; driver?: string; adapter?: DBAdapter } | undefined {
    return this._databases.get(name);
  }

  /** Execute a query on a named database */
  async execOn(dbName: string, sql: string, params: any[] = []): Promise<any> {
    const db = this._databases.get(dbName);
    if (!db) throw new Error(`Database "${dbName}" not found. Register it with addDatabase()`);
    return db.exec(sql, params);
  }

  // ── Audit logging helper ──────────────────────────────────────────
  /**
   * Enable automatic audit logging. Creates (or uses) a table named `_audit_logs`
   * and records all create/update/delete operations.
   */
  async enableAuditLogging(options: { tableName?: string; excludeModels?: string[] } = {}) {
    const tableName = options.tableName || "_audit_logs";
    const exclude = new Set(options.excludeModels || ["_audit_logs"]);
    const driver = this.adapter.driver || "sqlite";
    const q = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
    const ph = (i: number) => driver === "postgres" ? `$${i + 1}` : "?";

    const idType = driver === "postgres" ? "SERIAL PRIMARY KEY"
      : driver === "mysql" ? "INT AUTO_INCREMENT PRIMARY KEY"
      : "INTEGER PRIMARY KEY AUTOINCREMENT";
    const changedType = driver === "postgres" ? "TIMESTAMPTZ"
      : "DATETIME";

    await this.adapter.exec(
      `CREATE TABLE IF NOT EXISTS ${q(tableName)} (
        ${q("id")} ${idType},
        ${q("model")} TEXT NOT NULL,
        ${q("action")} TEXT NOT NULL,
        ${q("recordId")} TEXT,
        ${q("oldData")} TEXT,
        ${q("newData")} TEXT,
        ${q("changedAt")} ${changedType} NOT NULL
      )`, []
    );

    this.on("afterInsert", async (event) => {
      if (exclude.has(event.model)) return;
      await this.adapter.exec(
        `INSERT INTO ${q(tableName)} (${q("model")}, ${q("action")}, ${q("recordId")}, ${q("newData")}, ${q("changedAt")}) VALUES (${ph(0)}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)})`,
        [event.model, "INSERT", String(event.data?.id ?? ""), JSON.stringify(event.data), new Date().toISOString()]
      );
    });

    this.on("afterUpdate", async (event) => {
      if (exclude.has(event.model)) return;
      await this.adapter.exec(
        `INSERT INTO ${q(tableName)} (${q("model")}, ${q("action")}, ${q("recordId")}, ${q("newData")}, ${q("oldData")}, ${q("changedAt")}) VALUES (${ph(0)}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)})`,
        [event.model, "UPDATE", String(event.data?.id ?? JSON.stringify(event.filter)), JSON.stringify(event.data), JSON.stringify(event.filter), new Date().toISOString()]
      );
    });

    this.on("afterDelete", async (event) => {
      if (exclude.has(event.model)) return;
      await this.adapter.exec(
        `INSERT INTO ${q(tableName)} (${q("model")}, ${q("action")}, ${q("recordId")}, ${q("oldData")}, ${q("changedAt")}) VALUES (${ph(0)}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)})`,
        [event.model, "DELETE", String(event.data?.id ?? JSON.stringify(event.filter)), JSON.stringify(event.data), new Date().toISOString()]
      );
    });
  }

  // ── Seeding helpers ───────────────────────────────────────────────
  /**
   * Register a seed function that can be invoked via `npx slintorm seed`.
   * seedFn receives the ORM instance and an optional logger.
   */
  private _seeders: Map<string, (orm: any, log: (msg: string) => void) => Promise<void>> = new Map();

  seeder(name: string, fn: (orm: any, log: (msg: string) => void) => Promise<void>) {
    this._seeders.set(name, fn);
    return this;
  }

  async runSeed(name: string) {
    const fn = this._seeders.get(name);
    if (!fn) throw new Error(`Seeder "${name}" not found`);
    await fn(this, (msg: string) => console.log(`[seed:${name}] ${msg}`));
  }

  async runAllSeeds() {
    for (const [name, fn] of Array.from(this._seeders)) {
      console.log(`Running seeder: ${name}...`);
      await fn(this, (msg: string) => console.log(`[seed:${name}] ${msg}`));
    }
  }
}
