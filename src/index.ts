import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
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

  // Always generate schema before model factory
  await generateSchema(getPaths(cfg.dir));

  const defineModel = await createModelFactory(adapter);
  return { adapter, defineModel };
}

let schemaGenerated = false;

type driver = | "sqlite"
  | "postgres"
  | "mysql"
  | undefined;
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
      await generateSchema(schemaPath);
      console.log("✅ Schema generated:", schemaPath);
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

