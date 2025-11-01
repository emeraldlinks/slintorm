import { DBAdapter } from "./dbAdapter";
import { createModelFactory } from "./model";
export async function createORM(cfg = {}) {
    const adapter = new DBAdapter({ driver: cfg.driver, databaseUrl: cfg.databaseUrl });
    const defineModel = await createModelFactory(adapter);
    // console.log("index adapter: ", adapter)
    return { adapter, defineModel };
}
export default class ORMManager {
    cfg;
    adapter = null;
    defineModel = null;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async init() {
        const { adapter, defineModel } = await createORM(this.cfg);
        this.adapter = adapter;
        this.defineModel = defineModel;
    }
}
const orm = new ORMManager({
    driver: "sqlite",
    databaseUrl: "file:./dev.db",
});
