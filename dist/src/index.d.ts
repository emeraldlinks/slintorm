import { DBAdapter } from "./dbAdapter";
export declare function createORM(cfg?: {
    driver?: string;
    databaseUrl?: string;
}): Promise<{
    adapter: DBAdapter;
    defineModel: <T extends Record<string, any>>(table: string, modelName?: string) => {
        insert(item: T): Promise<T>;
        update(filter: Partial<T>, partial: Partial<T>): Promise<T | null>;
        delete(filter: Partial<T>): Promise<Partial<T>>;
        get(filter: Partial<T>): Promise<T | null>;
        getAll(): Promise<T[]>;
        query(): import("./queryBuilder").QueryBuilder<T>;
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
    };
    adapter: DBAdapter | null;
    defineModel: any;
    constructor(cfg: {
        driver?: string;
        databaseUrl?: string;
    });
    init(): Promise<void>;
}
