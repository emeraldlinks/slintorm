import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
import { Migrator } from "./migrator.js";
import path from "path";

const getPaths = (dir = "/src") => {
  return path.join(process.cwd(), dir)
};

export async function createORM(
  cfg: { driver?: string; databaseUrl?: string, dir?: string } = {},

) {
  const adapter = new DBAdapter({
    driver: cfg.driver as any,
    databaseUrl: cfg.databaseUrl,
  });
const sqlDriver = ["sqlite", "postgres", "mysql"].includes(adapter.driver!)
  ? adapter.driver as "sqlite" | "postgres" | "mysql"
  : undefined;
  // Always generate schema before model factory
  const schema = await generateSchema(getPaths(cfg.dir));
    const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);
for (const modelName of Object.keys(schema)) {
      const model = schema[modelName];
      await migrator.ensureTable(model.table || modelName.toLowerCase(), model.fields);
    }
  const defineModel = await createModelFactory(adapter);
  return { adapter, defineModel };
}

let schemaGenerated = false;

type driver =  "sqlite" | "postgres" | "mysql" | "mongodb" | undefined
export default class ORMManager {
  cfg: { driver?: driver; databaseUrl?: string; dir?: string };
  adapter: DBAdapter;

  constructor(cfg: { driver?: driver; databaseUrl?: string; dir?: string }) {
    this.cfg = cfg;
    this.adapter = new DBAdapter({
      driver: this.cfg.driver as any,
      databaseUrl: this.cfg.databaseUrl,
      dir: this.cfg.dir || "src"
    });
  }

  async migrate() {
  if (!schemaGenerated) {
    schemaGenerated = true;
    const schemaPath = getPaths(this.cfg.dir);
    const schema = await generateSchema(schemaPath);
    console.log("✅ Schema generated:", schemaPath);
const sqlDriver = ["sqlite", "postgres", "mysql"].includes(this.adapter.driver!)
  ? this.adapter.driver as "sqlite" | "postgres" | "mysql"
  : undefined;
  const migrator = new Migrator(this.adapter.exec.bind(this.adapter), sqlDriver);
  for (const modelName of Object.keys(schema)) {
    
    const model = schema[modelName];
    // console.log(model.table || modelName, model,  model?.relations)

      await migrator.ensureTable(model.table || modelName, model?.fields,  model?.relations);
    }
  }
}


  async defineModel<T extends Record<string, any>>(
    table: string,
    modelName: string,
    hooks?: {
      onCreateBefore?: (item: T) => (T | void | Promise<T | void>);
      onCreateAfter?: (item: T) => (void | Promise<void>);

      onUpdateBefore?: (
        oldData: T | null,
        newData: Partial<T>
      ) => (Partial<T> | void | Promise<Partial<T> | void>);
      onUpdateAfter?: (
        oldData: T | null,
        newData: Partial<T>
      ) => (void | Promise<void>);

      onDeleteBefore?: (deleted: Partial<T>) => (void | Promise<void>);
      onDeleteAfter?: (deleted: Partial<T>) => (void | Promise<void>);
    }) {

    const defineModel = await createModelFactory(this.adapter);
    
    // Pass hooks directly to the model factory
    return defineModel<T>(table, modelName, hooks);
  }
}

