import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory, type ModelAPI } from "./model.js";
import generateSchema from "./generator.js";
import { Migrator, type SchemaModel } from "./migrator.js";
import { runMigrations, snapshotCurrentGeneratedSchema } from "./migration-history.js";
import { wrapExec } from "./db-error.js";          // ← ADD THIS
import path from "node:path";
import type { DBDriver, ExecFn } from "./types.js";

const getPaths = (dir = "src") => {
  return path.join(process.cwd(), dir);
};

export type AnyModelMap = Record<string, object>;

export type ORMManagerConfig<TModelMap extends AnyModelMap = AnyModelMap> = {
  driver?: DBDriver;
  databaseUrl?: string;
  dir?: string;
  logs?: boolean;
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

// ----------------------------------------------------------------
// resolveDriver — narrows the adapter driver string to the three
// SQL drivers we know about so TypeScript and wrapExec are happy.
// ----------------------------------------------------------------
function resolveDriver(
  driver: string | undefined
): "sqlite" | "postgres" | "mysql" | undefined {
  if (driver === "sqlite" || driver === "postgres" || driver === "mysql")
    return driver;
  return undefined;
}

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

  // Wrap exec once here — all migrator / model / query code that goes
  // through this adapter instance will now get readable ORMErrors.
  if (sqlDriver) {
    adapter.exec = wrapExec(adapter.exec.bind(adapter), sqlDriver);
  }

  const schema = cfg.schema ?? (await generateSchema(getPaths(cfg.dir)));
  const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);
  for (const modelName of Object.keys(schema)) {
    const model = schema[modelName];
    await migrator.ensureTable(
      model.table || modelName.toLowerCase(),
      model.fields
    );
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

    // ---- Wrap exec immediately after the adapter is created ----------
    // Every call that goes through this.adapter.exec — migrations,
    // inserts, updates, queries — will now throw ORMError instead of
    // the raw driver error, giving the caller a readable message plus
    // table/column/value context.
    const sqlDriver = resolveDriver(this.adapter.driver);
    if (sqlDriver) {
      this.adapter.exec = wrapExec(
        this.adapter.exec.bind(this.adapter),
        sqlDriver
      );
    }
  }

  async migrate() {
    if (!schemaGenerated) {
      schemaGenerated = true;
      await snapshotCurrentGeneratedSchema({
        exec: this.adapter.exec,
        driver: this.cfg.driver,
        dir: this.cfg.dir || "src",
      });
      const schemaPath = getPaths(this.cfg.dir);
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
    // createModelFactory uses adapter.exec internally — already wrapped
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
    // trx.exec is the already-wrapped adapter.exec
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