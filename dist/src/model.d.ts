import { DBAdapter } from "./dbAdapter.js";
import type { EntityWithUpdate } from "./types";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
type ModelAPI<T extends Record<string, any>> = {
    /** Inserts a new record into the table */
    insert(item: T): Promise<EntityWithUpdate<T> | null>;
    /** Updates existing records matching the filter */
    update(filter: Partial<T>, partial: Partial<T>): Promise<EntityWithUpdate<T> | null>;
    /** Deletes records matching the filter */
    delete(filter: Partial<T>): Promise<Partial<T>>;
    /** Retrieves a single record matching the filter */
    get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null>;
    /** Retrieves all records from the table */
    getAll(): Promise<T[]>;
    /** Returns a query builder instance for custom queries */
    query(): AdvancedQueryBuilder<T>;
    /** Counts the number of records matching the filter */
    count(filter?: Partial<T>): Promise<number>;
    /** Checks if any record exists matching the filter */
    exists(filter: Partial<T>): Promise<boolean>;
    /** Deletes all records in the table */
    truncate(): Promise<void>;
    /** Loads a single related record */
    withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
    /** Loads multiple related records */
    withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
    /** Preloads a relation for future queries */
    preload<K extends keyof T & string>(relation: K): Promise<void>;
};
/**
 * Factory function to create models with CRUD and query capabilities.
 *
 * @param adapter - Database adapter instance
 * @returns A function to define a model with optional hooks
 */
export declare function createModelFactory(adapter: DBAdapter): Promise<(<T extends Record<string, any>>(table: string, modelName?: string, hooks?: {
    onCreateBefore?: (item: T) => T | void | Promise<T | void>;
    onCreateAfter?: (item: T) => void | Promise<void>;
    onUpdateBefore?: (oldData: T | null, newData: Partial<T>) => Partial<T> | void | Promise<Partial<T> | void>;
    onUpdateAfter?: (oldData: T | null, newData: Partial<T>) => void | Promise<void>;
    onDeleteBefore?: (deleted: Partial<T>) => void | Promise<void>;
    onDeleteAfter?: (deleted: Partial<T>) => void | Promise<void>;
}) => ModelAPI<T>)>;
export {};
