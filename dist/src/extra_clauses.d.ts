import { QueryBuilder } from "./queryBuilder.js";
/**
 * AdvancedQueryBuilder extends QueryBuilder to provide
 * additional SQL features like DISTINCT, GROUP BY, HAVING,
 * JOINs, aggregates, window functions, and subqueries.
 *
 * @template T - The record type representing table columns
 */
export declare class AdvancedQueryBuilder<T extends Record<string, any>> extends QueryBuilder<T> {
    protected _params: any[];
    protected _distinct: boolean;
    protected _groupBy: string[];
    protected _having: {
        raw: string;
        params: any[];
    } | null;
    protected _aggregates: string[];
    protected _window: string | null;
    protected _joins: string[];
    /**
     * Safely calls buildSql on a subquery.
     * @param sub - Subquery to build
     * @returns SQL and parameters from the subquery
     * @throws If sub is not AdvancedQueryBuilder
     */
    protected _build(sub: QueryBuilder<any>): {
        sql: string;
        params: any[];
    };
    /**
     * Apply DISTINCT to the query.
     * @param columns - Optional columns to select with DISTINCT
     * @returns The current builder instance
     * @example
     * builder.distinct("name", "email").buildSql();
     */
    distinct(...columns: (keyof T | string)[]): this;
    /**
     * Apply GROUP BY clause.
     * @param columns - Columns to group by
     * @returns The current builder instance
     * @example
     * builder.groupBy("department").buildSql();
     */
    groupBy(...columns: (keyof T | string)[]): this;
    /**
     * Apply HAVING clause.
     * @param rawSql - Raw SQL for HAVING
     * @param params - Parameters for raw SQL
     * @returns The current builder instance
     * @example
     * builder.having("COUNT(id) > ?", [5]).buildSql();
     */
    having(rawSql: string, params?: any[]): this;
    /**
     * Add a RIGHT JOIN clause.
     * @param table - Table to join
     * @param onLeft - Left side of ON
     * @param op - Operator (e.g., =)
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.rightJoin("employees", "users.id", "=", "employees.user_id");
     */
    rightJoin(table: string, onLeft: string, op: string, onRight: string): this;
    /**
     * Add a FULL OUTER JOIN clause.
     * @param table - Table to join
     * @param onLeft - Left side of ON
     * @param op - Operator
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.fullOuterJoin("departments", "users.dept_id", "=", "departments.id");
     */
    fullOuterJoin(table: string, onLeft: string, op: string, onRight: string): this;
    /**
     * Add COUNT aggregate.
     * @param column - Column to count or "*" for all
     * @returns The current builder instance
     * @example
     * builder.count("id").buildSql();
     */
    count(column: keyof T | "*"): this;
    /**
     * Add SUM aggregate.
     * @param column - Column to sum
     * @returns The current builder instance
     * @example
     * builder.sum("salary").buildSql();
     */
    sum(column: keyof T): this;
    /**
     * Add AVG aggregate.
     * @param column - Column to average
     * @returns The current builder instance
     * @example
     * builder.avg("score").buildSql();
     */
    avg(column: keyof T): this;
    /**
     * Add a window function.
     * @param fn - Window function (e.g., ROW_NUMBER())
     * @param over - OVER clause (e.g., "PARTITION BY dept_id ORDER BY salary DESC")
     * @returns The current builder instance
     * @example
     * builder.window("ROW_NUMBER()", "PARTITION BY dept_id ORDER BY salary DESC");
     */
    window(fn: string, over: string): this;
    /**
     * Add a subquery in SELECT.
     * @param sub - Subquery to include
     * @param alias - Alias for the subquery
     * @returns The current builder instance
     * @example
     * builder.selectSubquery(subQuery, "avg_salary");
     */
    selectSubquery(sub: AdvancedQueryBuilder<any>, alias: string): this;
    /**
     * Add EXISTS clause.
     * @param sub - Subquery to check existence
     * @returns The current builder instance
     * @example
     * builder.exists(subQuery).buildSql();
     */
    exists(sub: AdvancedQueryBuilder<any>): this;
    /**
     * Add NOT EXISTS clause.
     * @param sub - Subquery to check non-existence
     * @returns The current builder instance
     * @example
     * builder.notExists(subQuery).buildSql();
     */
    notExists(sub: AdvancedQueryBuilder<any>): this;
    /**
     * Build the final SQL query including all advanced clauses.
     * @returns Object containing `sql` string and `params` array
     * @example
     * const { sql, params } = builder.buildSql();
     */
    protected buildSql(): {
        sql: string;
        params: any[];
    };
    /**
     * Combine multiple queries using UNION.
     * @param queries - Array of queries to union
     * @param all - If true, use UNION ALL
     * @returns Combined SQL string
     * @example
     * const combined = AdvancedQueryBuilder.union([q1, q2], true);
     */
    static union<T extends Record<string, any>>(queries: AdvancedQueryBuilder<T>[], all?: boolean): string;
}
