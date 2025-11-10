import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
import path from "path";

const getPaths = (dir = "/src") => {
  const affix = dir.length > 0 ? "/**/*.ts" : "";
  return path.join(process.cwd(), dir) + affix;
};

export async function createORM(
  cfg: { driver?: string; databaseUrl?: string } = {},
  dir = ""
) {
  const adapter = new DBAdapter({
    driver: cfg.driver as any,
    databaseUrl: cfg.databaseUrl,
  });

  // Always generate schema before model factory
  await generateSchema(getPaths(dir));

  const defineModel = await createModelFactory(adapter);
  return { adapter, defineModel };
}

let schemaGenerated = false;


export default class ORMManager {
  cfg: { driver?: string; databaseUrl?: string; dir?: string };
  adapter: DBAdapter;

  constructor(cfg: { driver?: string; databaseUrl?: string; dir?: string }) {
    this.cfg = cfg;
    this.adapter = new DBAdapter({
      driver: this.cfg.driver as any,
      databaseUrl: this.cfg.databaseUrl,
    });
  }

  private async ensureSchema() {
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
      onCreate?: (item: T) => Promise<void> | void;
      onUpdate?: (oldData: T | null, newData: Partial<T>) => Promise<void> | void;
      onDelete?: (deleted: Partial<T>) => Promise<void> | void;
    }
  ) {
    await this.ensureSchema();

    const defineModel = await createModelFactory(this.adapter);
    // Pass hooks directly to the model factory
    return defineModel<T>(table, modelName, hooks);
  }
}

