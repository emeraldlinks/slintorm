import type { ExecFn, OpComparison } from "./types.ts";
export declare function mapBooleans<T extends Record<string, any>>(row: T, schemaFields: Record<string, any>): T;
type DialectAdapter = {
    formatPlaceholder: (index: number) => string;
    caseInsensitiveLike: (column: string, index: number) => string;
    quoteIdentifier: (name: string) => string;
};
export declare const Dialects: Record<string, DialectAdapter>;
type PreloadPath<T> = (keyof T & string) | `${Extract<keyof T, string>}.${string}`;
type WhereCondition<T> = Partial<T> | {
    [K in keyof T]?: {
        op: OpComparison;
        value: T[K];
    };
};
export declare class QueryBuilder<T extends Record<string, any>> {
    protected _selects: (keyof T | string)[] | null;
    protected _where: {
        raw?: string;
        column?: keyof T | string;
        op?: OpComparison;
        value?: any;
    }[];
    protected _orderBy: string[];
    protected _limit: number | null;
    protected _offset: number | null;
    protected _joins: string[];
    protected _preloads: string[];
    protected _exclude: string[];
    protected table: string;
    protected exec: ExecFn;
    protected orm: {
        dialect?: string;
    } | undefined;
    protected modelName: string;
    protected dir: string;
    protected schema: Record<string, any> | any;
    constructor(table: string, dir: string, exec: ExecFn, modelName: string, schema: Record<string, any>, orm?: {
        dialect?: string;
    });
    private normalizeModelName;
    /**
     * Select columns to fetch.
     * @template K - Keys of the table
     * @param cols - Columns to select
     * @returns The current builder instance
     * @example
     * builder.select("id", "name").get();
     */
    select<K extends keyof T>(...cols: K[]): this;
    /**
     * Add a WHERE condition.
     * @param column - Column name
     * @param op - Comparison operator (e.g., '=', '>', '<')
     * @param value - Value to compare
     * @returns The current builder instance
     * @example
     * builder.where("age", ">", 18).get();
     */
    where<K extends keyof T>(column: K, op: OpComparison, value: T[K]): this;
    /**
     * Add raw SQL WHERE clause.
     * @param sql - Raw SQL string
     * @returns The current builder instance
     * @example
     * builder.whereRaw("age > 18 AND active = true").get();
     */
    whereRaw(sql: string): this;
    /**
     * Add ORDER BY clause.
     * @param column - Column name
     * @param dir - Direction: "asc" (default) or "desc"
     * @returns The current builder instance
     * @example
     * builder.orderBy("created_at", "desc").get();
     */
    orderBy<K extends keyof T>(column: K, dir?: "asc" | "desc"): this;
    /**
     * Limit number of rows returned.
     * @param n - Number of rows
     * @returns The current builder instance
     * @example
     * builder.limit(10).get();
     */
    limit(n: number): this;
    /**
     * Skip a number of rows (for pagination).
     * @param n - Number of rows to skip
     * @returns The current builder instance
     * @example
     * builder.offset(20).get();
     */
    offset(n: number): this;
    /**
     * Add INNER JOIN clause.
     * @param table - Table name
     * @param onLeft - Left side of ON
     * @param op - Operator
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.join("employees", "users.id", "=", "employees.user_id");
     */
    join(table: string, onLeft: string, op: string, onRight: string): this;
    /**
     * Add LEFT JOIN clause.
     * @param table - Table name
     * @param onLeft - Left side of ON
     * @param op - Operator
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.leftJoin("departments", "users.dept_id", "=", "departments.id");
     */
    leftJoin(table: string, onLeft: string, op: string, onRight: string): this;
    /**
     * Exclude columns from results (top-level only).
     * @param columns - Columns to exclude, can be dotted strings
     * @returns The current builder instance
     * @example
     * builder.exclude("password", "profile.secret").get();
     */
    exclude(...columns: (keyof T | `${string}.${string}`)[]): this;
    /**
     * Preload relations for eager loading.
     * @param relation - Relation path
     * @returns The current builder instance
     * @example
     * builder.preload("posts").get();
     */
    preload<K extends PreloadPath<T>>(relation: K): this;
    /**
     * Case-insensitive LIKE search (ILike).
     * @param column - Column to search
     * @param value - Value to match
     * @returns The current builder instance
     * @example
     * builder.ILike("name", "john").get();
     */
    ILike<K extends keyof T>(column: K, value: string): this;
    /**
     * Build the SQL query string and parameters.
     * @returns Object with `sql` and `params`
     * @example
     * const { sql, params } = builder.buildSql();
     */
    protected buildSql(): {
        sql: string;
        params: any[];
    };
    /**
     * Execute the query and return rows.
     * Applies preloads and excludes.
     * @returns Promise resolving to array of rows
     * @example
     * const users = await builder.get();
     */
    get(): Promise<T[]>;
    /**
     * Fetch the first row matching a condition.
     * @param condition - Optional WHERE condition as object or raw SQL string
     * @returns Promise resolving to a single row or null
     * @example
     * const user = await builder.first({ id: 1 });
     */
    first(condition?: WhereCondition<T> | string): Promise<T | null>;
    private cleanRow;
    private applyPreloads;
    removeExcluded(obj: any, excludes: string[]): any;
    private applyExcludes;
    private _nestedExcludes;
}
export {};
