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

export type AnyModelMap = Record<string, object>;

export type ORMManagerConfig<TModelMap extends AnyModelMap = AnyModelMap> = {
  driver?: DBDriver;
  databaseUrl?: string;
  dir?: string;
  logs?: boolean;
  /** Pre-built schema — required when using the ORM in edge/serverless runtimes
   *  that have no filesystem access. Run `npx slintorm generate` during your
   *  build step, import the generated JSON, and pass it here. */
  schema?: Record<string, SchemaModel>;
  modelMap?: TModelMap;
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
  });

  const sqlDriver = resolveDriver(adapter.driver);
  if (sqlDriver) {
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

  const defineModel = await createModelFactory(adapter, cfg.schema);
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
export default class ORMManager<
  TModelMap extends AnyModelMap = AnyModelMap
> {
  cfg: ORMManagerConfig<TModelMap>;
  adapter: DBAdapter;
  readonly DB: ReadonlyDBStore<TModelMap> = {} as ReadonlyDBStore<TModelMap>;

  constructor(cfg: ORMManagerConfig<TModelMap> = {}) {
    this.cfg = cfg;
    this.adapter = new DBAdapter({
      driver: this.cfg.driver,
      databaseUrl: this.cfg.databaseUrl,
      dir: this.cfg.dir || "src",
      logs: this.cfg.logs,
      schema: this.cfg.schema,
      modelMap: this.cfg.modelMap,
    });

    const sqlDriver = resolveDriver(this.adapter.driver);
    if (sqlDriver) {
      this.adapter.exec = wrapExec(
        this.adapter.exec.bind(this.adapter),
        sqlDriver
      );
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
    const defineModel = await createModelFactory(
      this.adapter,
      this.cfg.schema
    );
    const model = defineModel<T>(table, modelName, hooks);

    if (typeof modelName === "string") {
      const writableDB = this.DB as unknown as Record<string, unknown>;
      writableDB[modelName] = model as unknown;
    }

    return model;
  }

  async transaction<T>(
    callback: (trx: { exec: ExecFn }) => Promise<T>
  ): Promise<T> {
    const driver = this.adapter.driver;
    if (driver !== "mongodb") await this.adapter.exec("BEGIN", []);
    const trx = { exec: this.adapter.exec };
    try {
      const result = await callback(trx);
      if (driver !== "mongodb") await this.adapter.exec("COMMIT", []);
      return result;
    } catch (err) {
      if (driver !== "mongodb") await this.adapter.exec("ROLLBACK", []);
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
}
