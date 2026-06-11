import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory, type ModelAPI } from "./model.js";
import generateSchema from "./generator.js";
import { Migrator, type SchemaModel } from "./migrator.js";
import path from "node:path";
import type { DBDriver } from "./types.js";

const getPaths = (dir = "src") => {
  return path.join(process.cwd(), dir)
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

export async function createORM<TModelMap extends AnyModelMap = AnyModelMap>(
  cfg: ORMManagerConfig<TModelMap> = {},

) {
  const adapter = new DBAdapter({
    driver: cfg.driver,
    databaseUrl: cfg.databaseUrl,
    dir: cfg.dir || "src",
    logs: cfg.logs,
    schema: cfg.schema,
    modelMap: cfg.modelMap,
  });
  const sqlDriver: "sqlite" | "postgres" | "mysql" | undefined = ["sqlite", "postgres", "mysql"].includes(adapter.driver!)
    ? adapter.driver as "sqlite" | "postgres" | "mysql"
    : undefined;

  const schema = cfg.schema ?? (await generateSchema(getPaths(cfg.dir)));
  const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);
  for (const modelName of Object.keys(schema)) {
    const model = schema[modelName];
    await migrator.ensureTable(model.table || modelName.toLowerCase(), model.fields);
  }
  const defineModel = await createModelFactory(adapter, cfg.schema);
  return { adapter, defineModel };
}

let schemaGenerated = false;

type KnownModelName<TModelMap extends AnyModelMap> = Extract<keyof TModelMap, string>;

export type DBStore<TModelMap extends AnyModelMap> = {
  [M in KnownModelName<TModelMap>]: ModelAPI<TModelMap[M]>;
};

export type ReadonlyDBStore<TModelMap extends AnyModelMap = AnyModelMap> = Readonly<DBStore<TModelMap>>;

export default class ORMManager<TModelMap extends AnyModelMap = AnyModelMap> {
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
  }

  async migrate() {
    if (!schemaGenerated) {
      schemaGenerated = true;
      const schemaPath = getPaths(this.cfg.dir);
      const schema = this.cfg.schema ?? (await generateSchema(schemaPath));
      if (!this.cfg.schema) {
        console.log("✅ Schema generated:", schemaPath);
      }
      const sqlDriver: "sqlite" | "postgres" | "mysql" | undefined = ["sqlite", "postgres", "mysql"].includes(this.adapter.driver!)
        ? this.adapter.driver as "sqlite" | "postgres" | "mysql"
        : undefined;
      const migrator = new Migrator(this.adapter.exec.bind(this.adapter), sqlDriver);
      // Use migrateSchema which also auto-creates pivot tables for many-to-many
      await migrator.migrateSchema(schema as Record<string, SchemaModel>);
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

    const defineModel = await createModelFactory(this.adapter, this.cfg.schema);

    const model = defineModel<T>(table, modelName, hooks);

    if (typeof modelName === 'string') {
      const writableDB = this.DB as unknown as Record<string, unknown>;
      writableDB[modelName] = model as unknown;
    }

    return model;
  }
}

