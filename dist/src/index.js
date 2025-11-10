import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
import path from "path";
const getPaths = (dir = "/src") => {
    const affix = dir.length > 0 ? "/**/*.ts" : "";
    return path.join(process.cwd(), dir) + affix;
};
export async function createORM(cfg = {}, dir = "") {
    const adapter = new DBAdapter({
        driver: cfg.driver,
        databaseUrl: cfg.databaseUrl,
    });
    // Always generate schema before model factory
    await generateSchema(getPaths(dir));
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
        });
    }
    async init() {
        if (!schemaGenerated) {
            schemaGenerated = true;
            const schemaPath = getPaths(this.cfg.dir);
            await generateSchema(schemaPath);
            console.log("✅ Schema generated:", schemaPath);
        }
    }
    async defineModel(table, modelName) {
        await this.init(); // <-- make sure schema exists before defining
        const defineModel = await createModelFactory(this.adapter);
        return defineModel(table, modelName);
    }
}
