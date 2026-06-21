import { QueryBuilder, Dialects } from "./queryBuilder.js";

export class AdvancedQueryBuilder<T extends Record<string, any>> extends QueryBuilder<T> {
  protected _params: any[] = [];
  protected _distinct = false;
  protected _groupBy: string[] = [];
  protected _having: { raw: string; params: any[] } | null = null;
  protected _aggregates: string[] = [];
  protected _window: string | null = null;
  // NOTE: _joins is already declared on QueryBuilder; do NOT redeclare it here.

  // Expose buildSql publicly so static union() can call it without TS errors.
  public buildSql() {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    if (isMongo) return super.buildSql();

    const base = super.buildSql();
    let sql = base.sql;
    const params = base.params.slice();

    if (this._params.length) params.push(...this._params);

    const dialect = Dialects[this.orm?.dialect || "sqlite"];


let selectClause = this._selects?.length
  ? (this._selects as string[]).map((c) => dialect.quoteIdentifier(String(c))).join(", ")
  : this._joins.length
    ? `${dialect.quoteIdentifier(this.table)}.*`   // match base class's collision-safe default
    : "*";

    if (this._aggregates.length) {
      selectClause =
        this._aggregates.join(", ") +
        (selectClause !== "*" ? ", " + selectClause : "");
    }

    if (this._window) selectClause += ", " + this._window;

    sql = sql.replace(/^SELECT\s.*?\sFROM/i, `SELECT ${selectClause} FROM`);

    if (this._distinct) sql = sql.replace(/^SELECT/i, "SELECT DISTINCT");

    if (this._groupBy.length)
      sql += " GROUP BY " + this._groupBy.map((c) => dialect.quoteIdentifier(c)).join(", ");

    if (this._having) {
      sql += " HAVING " + this._having.raw;
      params.push(...this._having.params);
    }

    return { sql, params };
  }

  distinct(...columns: (keyof T | string)[]) {
    this._distinct = true;
    if (columns.length) this._selects = columns.map(String);
    return this;
  }

  groupBy(...columns: (keyof T | string)[]) {
    this._groupBy = columns.map(String);
    return this;
  }

  having(rawSql: string, params: any[] = []) {
    this._having = { raw: rawSql, params };
    return this;
  }

  rightJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`RIGHT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  fullOuterJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`FULL OUTER JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  /**
   * Add COUNT aggregate to SELECT.
   * NOTE: This is an aggregate selector — it does NOT return a number directly.
   * Use ModelAPI.count() for a numeric count. Chain .get() here to get rows
   * with a COUNT column.
   */
  countAggregate(column: keyof T | "*" = "*") {
    this._aggregates.push(`COUNT(${String(column)})`);
    return this;
  }

  sum(column: keyof T) {
    this._aggregates.push(`SUM(${String(column)})`);
    return this;
  }

  avg(column: keyof T) {
    this._aggregates.push(`AVG(${String(column)})`);
    return this;
  }

  min(column: keyof T) {
    this._aggregates.push(`MIN(${String(column)})`);
    return this;
  }

  max(column: keyof T) {
    this._aggregates.push(`MAX(${String(column)})`);
    return this;
  }

  window(fn: string, over: string) {
    this._window = `${fn} OVER (${over})`;
    return this;
  }

  selectSubquery(sub: AdvancedQueryBuilder<any>, alias: string) {
    const { sql, params } = sub.buildSql();
    if (!this._selects) this._selects = [];
    this._selects.push(`(${sql}) AS ${alias}`);
    this._params.push(...params);
    return this;
  }

  exists(sub: AdvancedQueryBuilder<any>) {
    const { sql, params } = sub.buildSql();
    this._where.push({ raw: `EXISTS(${sql})`, value: params, kind: "and" });
    return this;
  }

  notExists(sub: AdvancedQueryBuilder<any>) {
    const { sql, params } = sub.buildSql();
    this._where.push({ raw: `NOT EXISTS(${sql})`, value: params, kind: "and" });
    return this;
  }

  static union<T extends Record<string, any>>(
    queries: AdvancedQueryBuilder<T>[],
    all = false
  ): string {
    const sqls = queries.map((q) => q.buildSql().sql);
    return sqls.join(all ? " UNION ALL " : " UNION ");
  }
}