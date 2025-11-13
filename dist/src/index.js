import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
import path from "path";
const getPaths = (dir = "/src") => {
    return path.join(process.cwd(), dir);
};
export async function createORM(cfg = {}) {
    const adapter = new DBAdapter({
        driver: cfg.driver,
        databaseUrl: cfg.databaseUrl,
    });
    // Always generate schema before model factory
    await generateSchema(getPaths(cfg.dir));
    const defineModel = await createModelFactory(adapter);
    return { adapter, defineModel };
}
let schemaGenerated = false;
export default class ORMManager {
    cfg;
    adapter;
    constructor(cfg) {
        this.cfg = cfg;
        this.adapter = new DBAdapter({
            driver: this.cfg.driver,
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
    async defineModel(table, modelName, hooks) {
        const defineModel = await createModelFactory(this.adapter);
        // Pass hooks directly to the model factory
        return defineModel(table, modelName, hooks);
    }
}
