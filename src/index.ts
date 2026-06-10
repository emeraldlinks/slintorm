import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory, type ModelAPI } from "./model.js";
import type { ModelMap } from "./schema/generated.js";
import generateSchema from "./generator.js";
import { Migrator } from "./migrator.js";
import path from "path";

const getPaths = (dir = "src") => {
  return path.join(process.cwd(), dir)
};

export async function createORM(
  cfg: { driver?: string; databaseUrl?: string; dir?: string; logs?: boolean; schema?: Record<string, any> } = {},

) {
  const adapter = new DBAdapter({
    driver: cfg.driver as any,
    databaseUrl: cfg.databaseUrl,
    dir: cfg.dir || "src",
    logs: cfg.logs,
    schema: cfg.schema,
  });
  const sqlDriver = ["sqlite", "postgres", "mysql"].includes(adapter.driver!)
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

type driver =  "sqlite" | "postgres" | "mysql" | "mongodb" | undefined

type KnownModelName = keyof ModelMap;

type DBStore = {
  [M in KnownModelName]: ModelAPI<ModelMap[M]>;
};

export type ReadonlyDBStore = Readonly<DBStore>;

export default class ORMManager {
  cfg: { driver?: driver; databaseUrl?: string; dir?: string; logs?: boolean; schema?: Record<string, any> };
  adapter: DBAdapter;
  readonly DB: ReadonlyDBStore = {} as ReadonlyDBStore;

  constructor(cfg: { driver?: driver; databaseUrl?: string; dir?: string; logs?: boolean; schema?: Record<string, any> }) {
    this.cfg = cfg;
    this.adapter = new DBAdapter({
      driver: this.cfg.driver as any,
      databaseUrl: this.cfg.databaseUrl,
      dir: this.cfg.dir || "src",
      logs: this.cfg.logs,
      schema: this.cfg.schema,
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
      const sqlDriver = ["sqlite", "postgres", "mysql"].includes(this.adapter.driver!)
        ? this.adapter.driver as "sqlite" | "postgres" | "mysql"
        : undefined;
      const migrator = new Migrator(this.adapter.exec.bind(this.adapter), sqlDriver);
      // Use migrateSchema which also auto-creates pivot tables for many-to-many
      await migrator.migrateSchema(schema as any);
    }
  }


  async defineModel<M extends KnownModelName>(
    table: string,
    modelName: M,
    hooks?: {
      onCreateBefore?: (item: ModelMap[M]) => ModelMap[M] | void | Promise<ModelMap[M] | void>;
      onCreateAfter?: (item: ModelMap[M]) => void | Promise<void>;

      onUpdateBefore?: (
        oldData: ModelMap[M] | null,
        newData: Partial<ModelMap[M]>
      ) => Partial<ModelMap[M]> | void | Promise<Partial<ModelMap[M]> | void>;
      onUpdateAfter?: (
        oldData: ModelMap[M] | null,
        newData: Partial<ModelMap[M]>
      ) => void | Promise<void>;

      onDeleteBefore?: (deleted: Partial<ModelMap[M]>) => void | Promise<void>;
      onDeleteAfter?: (deleted: Partial<ModelMap[M]>) => void | Promise<void>;
    }
  ): Promise<ModelAPI<ModelMap[M]>>;
  async defineModel<T extends Record<string, any>>(
    table: string,
    modelName?: string,
    hooks?: {
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
    }
  ): Promise<ModelAPI<T>>;
  async defineModel<T extends Record<string, any>>(
    table: string,
    modelName?: string,
    hooks?: any
  ): Promise<ModelAPI<T>> {

    const defineModel = await createModelFactory(this.adapter, this.cfg.schema);

    // Pass hooks directly to the model factory
    const model = defineModel<T>(table, modelName as any, hooks);

    if (typeof modelName === 'string') {
      const writableDB = this.DB as unknown as Record<string, ModelAPI<any>>;
      writableDB[modelName] = model as ModelAPI<any>;
    }

    return model;
  }
}

