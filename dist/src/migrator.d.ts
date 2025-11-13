import type { ExecFn } from "./types.ts";
export interface FieldInfo {
    type: string;
    meta: Record<string, string | number | boolean | null>;
}
interface SchemaModel {
    fields: Record<string, FieldInfo>;
    relations: any[];
    table?: string;
}
export declare class Migrator {
    private exec;
    private driver;
    constructor(exec: ExecFn, driver?: "sqlite" | "postgres" | "mysql");
    migrateSchema(schema: Record<string, SchemaModel>): Promise<void>;
    private ensureTimestamps;
    ensureTable(table: string, schema: Record<string, FieldInfo>): Promise<void>;
    private applyDefaults;
    private tableExists;
    private getExistingColumns;
    private getExistingIndexes;
    private getExistingFKs;
}
export {};
