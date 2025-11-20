import { DBAdapter } from "./dbAdapter.js";
import { createModelFactory } from "./model.js";
import generateSchema from "./generator.js";
import { Migrator } from "./migrator.js";
import path from "path";
const getPaths = (dir = "/src") => {
    return path.join(process.cwd(), dir);
};
export async function createORM(cfg = {}) {
    const adapter = new DBAdapter({
        driver: cfg.driver,
        databaseUrl: cfg.databaseUrl,
    });
    const sqlDriver = ["sqlite", "postgres", "mysql"].includes(adapter.driver)
        ? adapter.driver
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
            const schema = await generateSchema(schemaPath);
            console.log("✅ Schema generated:", schemaPath);
            const sqlDriver = ["sqlite", "postgres", "mysql"].includes(this.adapter.driver)
                ? this.adapter.driver
                : undefined;
            const migrator = new Migrator(this.adapter.exec.bind(this.adapter), sqlDriver);
            for (const modelName of Object.keys(schema)) {
                const model = schema[modelName];
                await migrator.ensureTable(model.table || modelName, model.fields);
            }
        }
    }
    async defineModel(table, modelName, hooks) {
        const defineModel = await createModelFactory(this.adapter);
        // Pass hooks directly to the model factory
        return defineModel(table, modelName, hooks);
    }
}
