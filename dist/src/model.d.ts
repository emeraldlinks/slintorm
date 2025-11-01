import { DBAdapter } from "./dbAdapter";
import { QueryBuilder } from "./queryBuilder";
type ModelAPI<T extends Record<string, any>> = {
    insert(item: T): Promise<T>;
    update(filter: Partial<T>, partial: Partial<T>): Promise<T | null>;
    delete(filter: Partial<T>): Promise<Partial<T>>;
    get(filter: Partial<T>): Promise<T | null>;
    getAll(): Promise<T[]>;
    query(): QueryBuilder<T>;
    count(filter?: Partial<T>): Promise<number>;
    exists(filter: Partial<T>): Promise<boolean>;
    truncate(): Promise<void>;
    withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
    withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
    preload<K extends keyof T & string>(relation: K): Promise<void>;
};
export declare function createModelFactory(adapter: DBAdapter): Promise<(<T extends Record<string, any>>(table: string, modelName?: string) => ModelAPI<T>)>;
export {};
