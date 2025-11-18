import { DBAdapter } from "./dbAdapter.js";
export declare function createORM(cfg?: {
    driver?: string;
    databaseUrl?: string;
    dir?: string;
}): Promise<{
    adapter: DBAdapter;
    defineModel: <T extends Record<string, any>>(table: string, modelName?: string, hooks?: {
        onCreateBefore?: (item: T) => T | void | Promise<T | void>;
        onCreateAfter?: (item: T) => void | Promise<void>;
        onUpdateBefore?: (oldData: T | null, newData: Partial<T>) => Partial<T> | void | Promise<Partial<T> | void>;
        onUpdateAfter?: (oldData: T | null, newData: Partial<T>) => void | Promise<void>;
        onDeleteBefore?: (deleted: Partial<T>) => void | Promise<void>;
        onDeleteAfter?: (deleted: Partial<T>) => void | Promise<void>;
    }) => {
        insert(item: T): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        update(filter: Partial<T>, partial: Partial<T>): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        delete(filter: Partial<T>): Promise<Partial<T>>;
        get(filter: Partial<T>): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        getAll(): Promise<T[]>;
        query(): import("./extra_clauses.js").AdvancedQueryBuilder<T>;
        count(filter?: Partial<T> | undefined): Promise<number>;
        exists(filter: Partial<T>): Promise<boolean>;
        truncate(): Promise<void>;
        withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
        withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
        preload<K extends keyof T & string>(relation: K): Promise<void>;
    };
}>;
type driver = "sqlite" | "postgres" | "mysql" | undefined;
export default class ORMManager {
    cfg: {
        driver?: driver;
        databaseUrl?: string;
        dir?: string;
    };
    adapter: DBAdapter;
    constructor(cfg: {
        driver?: driver;
        databaseUrl?: string;
        dir?: string;
    });
    migrate(): Promise<void>;
    defineModel<T extends Record<string, any>>(table: string, modelName: string, hooks?: {
        onCreateBefore?: (item: T) => (T | void | Promise<T | void>);
        onCreateAfter?: (item: T) => (void | Promise<void>);
        onUpdateBefore?: (oldData: T | null, newData: Partial<T>) => (Partial<T> | void | Promise<Partial<T> | void>);
        onUpdateAfter?: (oldData: T | null, newData: Partial<T>) => (void | Promise<void>);
        onDeleteBefore?: (deleted: Partial<T>) => (void | Promise<void>);
        onDeleteAfter?: (deleted: Partial<T>) => (void | Promise<void>);
    }): Promise<{
        insert(item: T): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        update(filter: Partial<T>, partial: Partial<T>): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        delete(filter: Partial<T>): Promise<Partial<T>>;
        get(filter: Partial<T>): Promise<import("./types.js").EntityWithUpdate<T> | null>;
        getAll(): Promise<T[]>;
        query(): import("./extra_clauses.js").AdvancedQueryBuilder<T>;
        count(filter?: Partial<T> | undefined): Promise<number>;
        exists(filter: Partial<T>): Promise<boolean>;
        truncate(): Promise<void>;
        withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
        withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
        preload<K extends keyof T & string>(relation: K): Promise<void>;
    }>;
}
export {};
