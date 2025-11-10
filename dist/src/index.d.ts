import { DBAdapter } from "./dbAdapter.js";
export declare function createORM(cfg?: {
    driver?: string;
    databaseUrl?: string;
}, dir?: string): Promise<{
    adapter: DBAdapter;
    defineModel: <T extends Record<string, any>>(table: string, modelName?: string) => {
        insert(item: T): Promise<T>;
        update(filter: Partial<T>, partial: Partial<T>): Promise<T | null>;
        delete(filter: Partial<T>): Promise<Partial<T>>;
        get(filter: Partial<T>): Promise<T | null>;
        getAll(): Promise<T[]>;
        query(): import("./queryBuilder.js").QueryBuilder<T>;
        count(filter?: Partial<T> | undefined): Promise<number>;
        exists(filter: Partial<T>): Promise<boolean>;
        truncate(): Promise<void>;
        withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
        withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
        preload<K extends keyof T & string>(relation: K): Promise<void>;
    };
}>;
export default class ORMManager {
    cfg: {
        driver?: string;
        databaseUrl?: string;
        dir?: string;
    };
    adapter: DBAdapter;
    constructor(cfg: {
        driver?: string;
        databaseUrl?: string;
        dir?: string;
    });
    init(): Promise<void>;
    defineModel<T extends Record<string, any>>(table: string, modelName: string): Promise<{
        insert(item: T): Promise<T>;
        update(filter: Partial<T>, partial: Partial<T>): Promise<T | null>;
        delete(filter: Partial<T>): Promise<Partial<T>>;
        get(filter: Partial<T>): Promise<T | null>;
        getAll(): Promise<T[]>;
        query(): import("./queryBuilder.js").QueryBuilder<T>;
        count(filter?: Partial<T> | undefined): Promise<number>;
        exists(filter: Partial<T>): Promise<boolean>;
        truncate(): Promise<void>;
        withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
        withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
        preload<K extends keyof T & string>(relation: K): Promise<void>;
    }>;
}
