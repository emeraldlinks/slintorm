import { QueryBuilder } from "./queryBuilder.js";
/**
 * AdvancedQueryBuilder extends QueryBuilder to provide
 * additional SQL features like DISTINCT, GROUP BY, HAVING,
 * JOINs, aggregates, window functions, and subqueries.
 *
 * @template T - The record type representing table columns
 */
export class AdvancedQueryBuilder extends QueryBuilder {
    _params = [];
    _distinct = false;
    _groupBy = [];
    _having = null;
    _aggregates = [];
    _window = null;
    _joins = [];
    /**
     * Safely calls buildSql on a subquery.
     * @param sub - Subquery to build
     * @returns SQL and parameters from the subquery
     * @throws If sub is not AdvancedQueryBuilder
     */
    _build(sub) {
        if (sub instanceof AdvancedQueryBuilder) {
            return sub.buildSql();
        }
        throw new Error("Subquery must be AdvancedQueryBuilder to access protected buildSql");
    }
    /**
     * Apply DISTINCT to the query.
     * @param columns - Optional columns to select with DISTINCT
     * @returns The current builder instance
     * @example
     * builder.distinct("name", "email").buildSql();
     */
    distinct(...columns) {
        this._distinct = true;
        if (columns.length)
            this._selects = columns.map(String);
        return this;
    }
    /**
     * Apply GROUP BY clause.
     * @param columns - Columns to group by
     * @returns The current builder instance
     * @example
     * builder.groupBy("department").buildSql();
     */
    groupBy(...columns) {
        this._groupBy = columns.map(String);
        return this;
    }
    /**
     * Apply HAVING clause.
     * @param rawSql - Raw SQL for HAVING
     * @param params - Parameters for raw SQL
     * @returns The current builder instance
     * @example
     * builder.having("COUNT(id) > ?", [5]).buildSql();
     */
    having(rawSql, params = []) {
        this._having = { raw: rawSql, params };
        return this;
    }
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
    rightJoin(table, onLeft, op, onRight) {
        this._joins.push(`RIGHT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
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
    fullOuterJoin(table, onLeft, op, onRight) {
        this._joins.push(`FULL OUTER JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
    /**
     * Add COUNT aggregate.
     * @param column - Column to count or "*" for all
     * @returns The current builder instance
     * @example
     * builder.count("id").buildSql();
     */
    count(column) {
        this._aggregates.push(`COUNT(${String(column)})`);
        return this;
    }
    /**
     * Add SUM aggregate.
     * @param column - Column to sum
     * @returns The current builder instance
     * @example
     * builder.sum("salary").buildSql();
     */
    sum(column) {
        this._aggregates.push(`SUM(${String(column)})`);
        return this;
    }
    /**
     * Add AVG aggregate.
     * @param column - Column to average
     * @returns The current builder instance
     * @example
     * builder.avg("score").buildSql();
     */
    avg(column) {
        this._aggregates.push(`AVG(${String(column)})`);
        return this;
    }
    /**
     * Add a window function.
     * @param fn - Window function (e.g., ROW_NUMBER())
     * @param over - OVER clause (e.g., "PARTITION BY dept_id ORDER BY salary DESC")
     * @returns The current builder instance
     * @example
     * builder.window("ROW_NUMBER()", "PARTITION BY dept_id ORDER BY salary DESC");
     */
    window(fn, over) {
        this._window = `${fn} OVER (${over})`;
        return this;
    }
    /**
     * Add a subquery in SELECT.
     * @param sub - Subquery to include
     * @param alias - Alias for the subquery
     * @returns The current builder instance
     * @example
     * builder.selectSubquery(subQuery, "avg_salary");
     */
    selectSubquery(sub, alias) {
        const { sql, params } = this._build(sub);
        if (!this._selects)
            this._selects = [];
        this._selects.push(`(${sql}) AS ${alias}`);
        this._params.push(...params);
        return this;
    }
    /**
     * Add EXISTS clause.
     * @param sub - Subquery to check existence
     * @returns The current builder instance
     * @example
     * builder.exists(subQuery).buildSql();
     */
    exists(sub) {
        const { sql, params } = this._build(sub);
        if (!this._where)
            this._where = [];
        this._where.push({ raw: `EXISTS(${sql})`, value: params });
        return this;
    }
    /**
     * Add NOT EXISTS clause.
     * @param sub - Subquery to check non-existence
     * @returns The current builder instance
     * @example
     * builder.notExists(subQuery).buildSql();
     */
    notExists(sub) {
        const { sql, params } = this._build(sub);
        if (!this._where)
            this._where = [];
        this._where.push({ raw: `NOT EXISTS(${sql})`, value: params });
        return this;
    }
    /**
     * Build the final SQL query including all advanced clauses.
     * @returns Object containing `sql` string and `params` array
     * @example
     * const { sql, params } = builder.buildSql();
     */
    buildSql() {
        const base = super.buildSql();
        let sql = base.sql;
        const params = base.params.slice();
        let selectClause = this._selects?.length ? this._selects.map(c => `"${String(c)}"`).join(", ") : "*";
        if (this._aggregates.length) {
            selectClause = this._aggregates.join(", ") + (selectClause !== "*" ? ", " + selectClause : "");
        }
        if (this._window)
            selectClause += ", " + this._window;
        sql = sql.replace(/^SELECT\s.*?\sFROM/i, `SELECT ${selectClause} FROM`);
        if (this._distinct)
            sql = sql.replace(/^SELECT/i, "SELECT DISTINCT");
        if (this._joins.length)
            sql += " " + this._joins.join(" ");
        if (this._groupBy.length)
            sql += " GROUP BY " + this._groupBy.map(c => `"${c}"`).join(", ");
        if (this._having) {
            sql += " HAVING " + this._having.raw;
            params.push(...this._having.params);
        }
        return { sql, params };
    }
    /**
     * Combine multiple queries using UNION.
     * @param queries - Array of queries to union
     * @param all - If true, use UNION ALL
     * @returns Combined SQL string
     * @example
     * const combined = AdvancedQueryBuilder.union([q1, q2], true);
     */
    static union(queries, all = false) {
        const sqls = queries.map(q => q.buildSql().sql);
        return sqls.join(all ? " UNION ALL " : " UNION ");
    }
}
