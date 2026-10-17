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
import { quoteIdentifier } from "./quoting.js";
import {
  canUseTcpDrivers,
  runtimeInfo,
  type RuntimeInfo,
} from "./runtime.js";
import {
  getCurrentContext,
  setCurrentContext,
  replaceCurrentContext,
  runWithContext,
  hasAsyncContext,
  Mutex,
} from "./context-store.js";
import type { DBDriver, ExecFn } from "./types.js";
import type { DataMigration } from "./migration-history.js";
import type { Plugin, PluginEventType, OrmContext } from "./types.js";
export type { HashField } from "./security.js";
export type { DataMigration } from "./migration-history.js";

export type AnyModelMap = Record<string, object>;

export type ORMManagerConfig<TModelMap extends AnyModelMap = AnyModelMap> = {
driver?: DBDriver;
  /**
   * PostgREST base URL. Required when `driver: "postgrest"`.
   * Supabase: `https://<project-ref>.supabase.co/rest/v1`.
   */
  postgrestUrl?: string;
  /** PostgREST api key — sent as `apikey` and as a Bearer token. */
  postgrestKey?: string;
  /** Postgres schema exposed by the service. Defaults to `public`. */
  postgrestSchema?: string;
  postgrestHeaders?: Record<string, string> | (() => Record<string, string>);
  /** Injectable fetch, for runtimes without a global one (or for tests). */
  fetch?: typeof fetch;
  databaseUrl?: string;
  databaseName?: string;
  dir?: string;
  logs?: boolean;
  /**
   * Log bound parameter VALUES in addition to SQL text. Defaults to false.
   * Bound values are user data (tokens, card numbers, emails), so `logs: true`
   * alone no longer writes them anywhere. Only enable in a local terminal.
   */
  /**
   * Propagate plugin failures instead of isolating them. Off by default: a
   * plugin observes the operation, so a bug in one should not break the write.
   */
  strictPlugins?: boolean;
  logParams?: boolean;
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
    logParams: cfg.logParams,
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
  private _onPluginError?: (info: { plugin: string; event: string; error: unknown }) => void;
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
      logParams: this.cfg.logParams,
      postgrestUrl: this.cfg.postgrestUrl,
      postgrestKey: this.cfg.postgrestKey,
      postgrestSchema: this.cfg.postgrestSchema,
      postgrestHeaders: this.cfg.postgrestHeaders,
      fetch: this.cfg.fetch,
      schema: this.cfg.schema,
      modelMap: this.cfg.modelMap,
      replicas: this.cfg.replicas,
      poolSize: this.cfg.poolSize,
      exec: this.cfg.exec,
    });

    // Connection pooling and RLS context propagation are mutually exclusive.
    //
    // RLS works by issuing `SELECT set_config('rls.tenant_id', ...)` on the
    // connection, which is SESSION-scoped. With a pool, the query that runs
    // next may be handed a different connection that never received the tenant
    // context — so it would execute under the previous tenant's identity, or
    // with none set at all. That is a cross-tenant data leak, so refuse the
    // combination rather than let it fail silently.
    if (this.cfg.rls && (Number(this.cfg.poolSize) || 0) > 1) {
      throw new Error(
        `ORMManager: poolSize > 1 cannot be combined with rls: true.\n\n` +
          `Row-level security propagates the tenant via a session-scoped ` +
          `set_config() on the connection. A pool hands each query whichever ` +
          `connection is free, so a query can run on a connection that never ` +
          `received the tenant context — leaking data across tenants.\n\n` +
          `Use a single dedicated connection (omit poolSize) for RLS, or ` +
          `enforce isolation in a way that is bound to the statement rather ` +
          `than the session.`,
      );
    }

    const sqlDriver = resolveDriver(this.adapter.driver);
    if (sqlDriver && !this.cfg.exec) {
      this.adapter.exec = wrapExec(
        this.adapter.exec.bind(this.adapter),
        sqlDriver
      );
    }

    this._rls = !!this.cfg.rls;

    if (this._rls) {
      // HIGH-3: the wrapper below was only installed when NO custom exec was
      // supplied, so `rls: true` + neonExec()/proxyExec()/etc. silently ran
      // every query with no tenant setting while rlsEnabled() still said true.
      // That is the worst possible failure shape: a security control that
      // reports itself as active and is not.
      if (sqlDriver !== "postgres") {
        throw new Error(
          `ORMManager: rls: true requires the postgres driver (got "${this.adapter.driver}"). ` +
          `Row-level security is implemented with Postgres set_config() and has no ` +
          `meaning for other databases. Either use postgres, or drop rls: true and ` +
          `enforce tenant isolation in application code.`,
        );
      }
      if (this.cfg.exec) {
        throw new Error(
          `ORMManager: rls: true cannot be combined with a custom \`exec\`.\n\n` +
          `The RLS wrapper sets the tenant context via \`SELECT set_config(...)\` on the ` +
          `adapter's own connection. A custom exec bypasses that entirely, so queries ` +
          `would run with no tenant context while rlsEnabled() still returned true.\n\n` +
          `This is exactly the combination used for edge deployments (neonExec, ` +
          `tursoExec, proxyExec), which is where RLS matters most.\n\n` +
          `Resolve it by either:\n` +
          `  - letting SlintORM own the connection (no \`exec\`), or\n` +
          `  - setting the tenant context yourself inside your exec, and dropping \`rls: true\`.`,
        );
      }

      const origExec = this.adapter.exec.bind(this.adapter);
      const lastRls: Record<string, string> = {};
      // 2.4: set_config and the query it scopes must not interleave with
      // another context's. A transaction-local set_config would remove the
      // need for this, but it requires wrapping every query in BEGIN/COMMIT,
      // which breaks queries already inside a user transaction. Serialise the
      // context-applying critical section instead.
      const rlsMutex = new Mutex();

      this.adapter.exec = async (sql: string, params?: any[]) => {
        // 2.2: read the context from THIS async execution context, not from a
        // single shared mutable field. Without this, two concurrent requests
        // overwrite each other's tenant between withContext() and exec().
        const ctx = getCurrentContext(this._context);
        const keys = Object.keys(ctx).filter(k => ctx[k] != null);

        // Nothing to apply and nothing stale to clear — run unserialised so
        // queries with no RLS context keep full concurrency.
        const stale = Object.keys(lastRls).filter(
          (k) => !(k in ctx) || ctx[k] == null,
        );
        if (keys.length === 0 && stale.length === 0) {
          return origExec(sql, params);
        }

        return rlsMutex.run(async () => {
          // HIGH-1: previously only the IN-MEMORY entry was deleted. The
          // Postgres session variable set by `set_config(..., false)` is
          // session-scoped and survived, so after clearContext() the next
          // request with no context issued no set_config at all and ran under
          // the PREVIOUS request's tenant. Fail-open cross-tenant leak.
          for (const key of stale) {
            await origExec("SELECT set_config($1, $2, false)", [`rls.${key}`, ""]);
            delete lastRls[key];
          }
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
          return origExec(sql, params);
        });
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
      // Refuse on a socketless runtime BEFORE touching node:path / the
      // filesystem. This used to import `node:path` and run
      // snapshotCurrentGeneratedSchema() (which statically imports node:fs)
      // unconditionally, so calling migrate() on Vercel Edge died with a raw
      // module-not-found instead of the documented advice.
      if (!canUseTcpDrivers() || typeof process === "undefined" || !process.cwd) {
        throw new Error(
          `ORMManager: migrate() cannot run in this runtime (${runtimeInfo().kind}).\n\n` +
          `Migrations read TypeScript sources from disk and write migration ` +
          `records, so they need node:fs and node:path. A V8 isolate has neither.\n\n` +
          `Run migrations as a separate build step on Node, then deploy:\n\n` +
          `  // scripts/migrate.ts  — Node only\n` +
          `  const orm = new ORMManager({ driver: 'postgres', databaseUrl, dir: 'src' });\n` +
          `  await orm.migrate();\n\n` +
          `  // package.json\n` +
          `  "build": "npm run migrate && next build"\n\n` +
          `In the edge function, pass the pre-generated schema instead:\n` +
          `  import schema from '../src/schema/generated.json' with { type: 'json' };\n` +
          `  new ORMManager({ driver: 'postgrest', postgrestUrl, postgrestKey, schema });`,
        );
      }

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
    if (handlers?.length) {
      for (const handler of handlers) {
        await handler(event);
      }
    }

    // Plugins must be dispatched unconditionally. This used to sit AFTER an
    // early `return` when no global handler was registered, so `use(plugin)`
    // silently did nothing unless the app had also called `orm.on(...)` for
    // that event type — which made the documented extension point a no-op.
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
      if (!plugin.on) continue;
      try {
        await plugin.on(event, { ...ctx, context: this._context, orm: this });
      } catch (err) {
        // A plugin observes the operation; it should not be able to break it.
        // A metrics or logging plugin that throws must not take down the write
        // it is watching. Failures are reported rather than swallowed, and
        // `strictPlugins: true` restores propagation for cases where a silent
        // plugin failure would be worse (e.g. compliance audit trails).
        if (this.cfg.strictPlugins) throw err;
        if (this._onPluginError) this._onPluginError({ plugin: plugin.name, event, error: err });
        else {
          console.warn(
            `[slintorm] plugin "${plugin.name}" threw during "${event}": ` +
            `${(err as Error)?.message ?? err}`,
          );
        }
      }
    }
  }

  /** Install a handler for plugin failures (instead of the console warning). */
  onPluginError(fn: (info: { plugin: string; event: string; error: unknown }) => void): this {
    this._onPluginError = fn;
    return this;
  }

  // ── Context propagation ────────────────────────────────────────

  /**
   * Merge values into the current request context — for TRACING.
   *
   * ⚠️ When `rls: true` is set these keys ALSO become `rls.*` authorization
   * settings in Postgres. That is why the identity path has its own method,
   * `runWithAuthContext()`. Prefer that for anything a policy reads.
   *
   * For pure tracing that must never influence authorization, keep RLS off, or
   * use a dedicated naming convention your policies never match.
   *
   * On Node this uses AsyncLocalStorage, so concurrent requests are isolated.
   * Prefer `runWithContext()` — `withContext()` changes the context for the
   * remainder of the current async scope, which is broader than one request.
   */
  withContext(ctx: OrmContext): this {
    setCurrentContext(ctx, this._context);
    return this;
  }

  /**
   * Set the ROW-LEVEL-SECURITY context: these values become `rls.*` session
   * settings that Postgres policies read.
   *
   * Use this for identity. Use `withContext()` for tracing. They are separate
   * methods because conflating them is a security footgun: a team using
   * `withContext({ userId })` purely to correlate logs would silently make
   * `userId` an authorization setting, and any request header becomes a
   * spoofable tenant.
   *
   * Only values you have authenticated may be passed here. Prefer
   * `runWithAuthContext()` so the scope is explicit.
   *
   * @example
   *   // identity comes from a verified session, never from the raw request
   *   orm.runWithAuthContext({ tenant_id: session.tenantId }, async () => {
   *     return db.Order.query().get();   // RLS filters by tenant
   *   });
   */
  runWithAuthContext<R>(ctx: OrmContext, fn: () => R): R {
    return runWithContext(ctx, this._context, fn);
  }

  /**
   * Run `fn` with an ISOLATED context. This is the safe form: the context is
   * scoped to `fn` and everything it awaits, so concurrent callers cannot
   * observe each other's tenant.
   *
   *   await orm.runWithContext({ tenant_id: t }, async () => {
   *     return db.Order.query().get();
   *   });
   */
  runWithContext<R>(ctx: OrmContext, fn: () => R): R {
    return runWithContext(ctx, this._context, fn);
  }

  getContext(): OrmContext {
    return { ...getCurrentContext(this._context) };
  }

  clearContext(): this {
    replaceCurrentContext({}, this._context);
    return this;
  }

  /** True when per-request context isolation (AsyncLocalStorage) is active. */
  hasIsolatedContext(): boolean {
    return hasAsyncContext();
  }

  /**
   * True when this runtime can run the configured driver's default connection
   * path. False means you are on a socketless runtime (Vercel Edge, Cloudflare
   * Workers, a browser) and need `postgrest` or a custom `exec`.
   */
  edgeReady(): boolean {
    return canUseTcpDrivers() || this.cfg.driver === "postgrest" || !!this.cfg.exec;
  }

  /** What SlintORM detected about the current runtime. */
  runtimeInfo(): RuntimeInfo {
    return runtimeInfo();
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

  /**
   * Release every connection this manager opened — the primary adapter plus
   * any added with addDatabase().
   *
   * Without this, a pg Pool keeps its sockets and idle timers alive, which
   * holds the Node event loop open: the process never exits. That is why the
   * test suite used to hang for the full 6-hour CI timeout even though every
   * assertion had already passed. Long-running servers leak connections the
   * same way.
   *
   * Safe to call more than once, and safe to call on a manager that never
   * connected.
   */
  async close(): Promise<void> {
    const seen = new Set<DBAdapter>();
    const closeOne = async (adapter: DBAdapter | undefined) => {
      if (!adapter || seen.has(adapter)) return;
      seen.add(adapter);
      try { await adapter.close(); } catch { /* already closed */ }
    };

    await closeOne(this.adapter);
    for (const [, entry] of this._databases) await closeOne(entry.adapter);
    this._databases.clear();
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

    // Audit logging is a SQL table plus INSERT statements. On MongoDB the exec
    // path parses its argument as a JSON command, so the CREATE TABLE below
    // surfaced as `Unexpected token 'C', "CREATE TAB"... is not valid JSON` —
    // an error that names neither the cause nor the fix. Refuse it up front.
    if (driver === "mongodb") {
      throw new Error(
        `enableAuditLogging() is not supported on MongoDB and was not enabled.\n` +
          `It provisions a SQL table and writes INSERT statements, which the Mongo command\n` +
          `format cannot express. Record changes in a Mongo collection yourself, or use a SQL driver.`,
      );
    }

    const q = (c: string) => quoteIdentifier((driver as any) ?? "sqlite", c);
    const ph = (i: number) => driver === "postgres" ? `$${i + 1}` : "?";

    const idType = driver === "postgres" ? "SERIAL PRIMARY KEY"
      : driver === "mysql" ? "INT AUTO_INCREMENT PRIMARY KEY"
      : "INTEGER PRIMARY KEY AUTOINCREMENT";
    const changedType = driver === "postgres" ? "TIMESTAMPTZ"
      : "DATETIME";

    // MySQL's DATETIME accepts only 'YYYY-MM-DD HH:MM:SS'. An ISO-8601 string
    // with a T and a trailing Z was rejected outright — "Incorrect datetime
    // value" — so every audit write failed on that driver. SQLite stores this
    // column as TEXT and Postgres takes TIMESTAMPTZ, so both keep ISO-8601.
    const nowStamp = () => {
      const iso = new Date().toISOString();
      return driver === "mysql" ? `${iso.slice(0, 19).replace("T", " ")}` : iso;
    };

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
        [event.model, "INSERT", String(event.data?.id ?? ""), JSON.stringify(event.data), nowStamp()]
      );
    });

    this.on("afterUpdate", async (event) => {
      if (exclude.has(event.model)) return;
      await this.adapter.exec(
        `INSERT INTO ${q(tableName)} (${q("model")}, ${q("action")}, ${q("recordId")}, ${q("newData")}, ${q("oldData")}, ${q("changedAt")}) VALUES (${ph(0)}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)})`,
        [event.model, "UPDATE", String(event.data?.id ?? JSON.stringify(event.filter)), JSON.stringify(event.data), JSON.stringify(event.filter), nowStamp()]
      );
    });

    this.on("afterDelete", async (event) => {
      if (exclude.has(event.model)) return;
      await this.adapter.exec(
        `INSERT INTO ${q(tableName)} (${q("model")}, ${q("action")}, ${q("recordId")}, ${q("oldData")}, ${q("changedAt")}) VALUES (${ph(0)}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)})`,
        [event.model, "DELETE", String(event.data?.id ?? JSON.stringify(event.filter)), JSON.stringify(event.data), nowStamp()]
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
