import { QueryBuilder, Dialects } from "./queryBuilder.js";
import type { OpComparison } from "./types.js";

type CTEDefinition = {
  name: string;
  query: AdvancedQueryBuilder<any>;
  recursive?: boolean;
};

export class AdvancedQueryBuilder<T extends Record<string, any>> extends QueryBuilder<T> {
  protected _params: any[] = [];
  protected _distinct = false;
  protected _groupBy: string[] = [];
  protected _having: { raw: string; params: any[] } | null = null;
  protected _aggregates: string[] = [];
  protected _window: string | null = null;
  protected _ctes: CTEDefinition[] = [];
  protected _union: { queries: AdvancedQueryBuilder<any>[]; all: boolean } | null = null;
  protected _intersect: { queries: AdvancedQueryBuilder<any>[]; all: boolean } | null = null;
  protected _except: { queries: AdvancedQueryBuilder<any>[]; all: boolean } | null = null;
  protected _forUpdate: boolean = false;
  protected _forShare: boolean = false;
  protected _forNoKeyUpdate: boolean = false;
  protected _skipLocked: boolean = false;
  protected _nowait: boolean = false;
  protected _lockTables: string[] = [];
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

    // ---- CTE (WITH clause) -----------------------------------------------
    if (this._ctes.length) {
      const parts = this._ctes.map(cte => {
        const { sql: cteSql, params: cteParams } = cte.query.buildSql();
        params.push(...cteParams);
        const maybeRecursive = cte.recursive ? "RECURSIVE " : "";
        return `${maybeRecursive}${cte.name} AS (${cteSql})`;
      });
      sql = `WITH ${parts.join(", ")} ${sql}`;
    }

    let selectClause = this._selects?.length
      ? (this._selects as string[]).map((c) => dialect.quoteIdentifier(String(c))).join(", ")
      : this._joins.length
        ? `${dialect.quoteIdentifier(this.table)}.*`
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

    // ---- UNION / INTERSECT / EXCEPT ------------------------------------------
    if (this._union) {
      const sqls = this._union.queries.map((q) => q.buildSql().sql);
      const unionAll = this._union.all ? " ALL" : "";
      sql = `(${sql})\nUNION${unionAll}\n(${sqls.join(`\nUNION${unionAll}\n`)})`;
    }
    if (this._intersect) {
      const sqls = this._intersect.queries.map((q) => q.buildSql().sql);
      const intersectAll = this._intersect.all ? " ALL" : "";
      sql = `(${sql})\nINTERSECT${intersectAll}\n(${sqls.join(`\nINTERSECT${intersectAll}\n`)})`;
    }
    if (this._except) {
      const sqls = this._except.queries.map((q) => q.buildSql().sql);
      const exceptAll = this._except.all ? " ALL" : "";
      sql = `(${sql})\nEXCEPT${exceptAll}\n(${sqls.join(`\nEXCEPT${exceptAll}\n`)})`;
    }

    // ---- Optimizer / Index / Comment hints ----------------------------------
    if ((this as any)._hints?.length) {
      const hintStr = (this as any)._hints.join(" ");
      sql = sql.replace(/^SELECT/i, `SELECT ${hintStr}`);
    }

    // ---- FOR UPDATE / FOR SHARE (row locking) --------------------------------
    if (this._forUpdate) {
      let lockClause = " FOR UPDATE";
      if (this._lockTables.length) {
        lockClause += " OF " + this._lockTables.map(t => dialect.quoteIdentifier(t)).join(", ");
      }
      if (this._nowait) lockClause += " NOWAIT";
      if (this._skipLocked) lockClause += " SKIP LOCKED";
      sql += lockClause;
    } else if (this._forNoKeyUpdate) {
      let lockClause = " FOR NO KEY UPDATE";
      if (this._lockTables.length) {
        lockClause += " OF " + this._lockTables.map(t => dialect.quoteIdentifier(t)).join(", ");
      }
      if (this._nowait) lockClause += " NOWAIT";
      if (this._skipLocked) lockClause += " SKIP LOCKED";
      sql += lockClause;
    } else if (this._forShare) {
      let lockClause = this.orm?.dialect === "postgres" ? " FOR SHARE" : " LOCK IN SHARE MODE";
      if (this._lockTables.length) {
        lockClause += " OF " + this._lockTables.map(t => dialect.quoteIdentifier(t)).join(", ");
      }
      if (this._nowait) lockClause += " NOWAIT";
      if (this._skipLocked) lockClause += " SKIP LOCKED";
      sql += lockClause;
    }

    return { sql, params };
  }

  // ── CTE (Common Table Expression / WITH clause) ──────────────────────────
  with(name: string, query: AdvancedQueryBuilder<any>, recursive = false) {
    this._ctes.push({ name, query, recursive });
    return this;
  }

  // ── UNION / INTERSECT / EXCEPT ──────────────────────────────────────────────
  union(queries: AdvancedQueryBuilder<T>[], all = false) {
    this._union = { queries, all };
    return this;
  }

  intersect(queries: AdvancedQueryBuilder<T>[], all = false) {
    this._intersect = { queries, all };
    return this;
  }

  except(queries: AdvancedQueryBuilder<T>[], all = false) {
    this._except = { queries, all };
    return this;
  }

  // ── Row Locking (FOR UPDATE / FOR SHARE) ──────────────────────────────────
  forUpdate(tables?: string[]) {
    this._forUpdate = true;
    if (tables) this._lockTables = tables;
    return this;
  }

  forShare(tables?: string[]) {
    this._forShare = true;
    if (tables) this._lockTables = tables;
    return this;
  }

  forNoKeyUpdate(tables?: string[]) {
    this._forNoKeyUpdate = true;
    if (tables) this._lockTables = tables;
    return this;
  }

  skipLocked() {
    this._skipLocked = true;
    return this;
  }

  noWait() {
    this._nowait = true;
    return this;
  }

  // ── Distinct / Group / Having (existing) ─────────────────────────────────
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

  // ── Joins ──────────────────────────────────────────────────────────────────
  rightJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`RIGHT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  fullOuterJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`FULL OUTER JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  lateralJoin(table: string, onLeft: string, op: string, onRight: string, lateralType: "INNER" | "LEFT" = "INNER") {
    this._joins.push(`${lateralType} JOIN LATERAL ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  crossJoin(table: string) {
    this._joins.push(`CROSS JOIN ${table}`);
    return this;
  }

  // ── Full-text search (PostgreSQL tsvector/tsquery) ────────────────────────
  fulltextSearch(column: string, query: string, config: string = "english") {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const idx = this._countParams();
    if (this.orm?.dialect === "postgres") {
      this._where.push({
        raw: `to_tsvector('${config}', ${dialect.quoteIdentifier(column)}) @@ plainto_tsquery('${config}', ${dialect.formatPlaceholder(idx)})`,
        rawParams: [query],
        kind: "and",
      });
    } else if (this.orm?.dialect === "mysql") {
      this._where.push({
        raw: `MATCH(${dialect.quoteIdentifier(column)}) AGAINST(${dialect.formatPlaceholder(idx)} IN BOOLEAN MODE)`,
        rawParams: [query],
        kind: "and",
      });
    } else {
      this._where.push({ raw: `${dialect.quoteIdentifier(column)} LIKE ${dialect.formatPlaceholder(idx)}`, rawParams: [`%${query}%`], kind: "and" });
    }
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
    this._where.push({ raw: `EXISTS(${sql})`, rawParams: params, kind: "and" });
    return this;
  }

  notExists(sub: AdvancedQueryBuilder<any>) {
    const { sql, params } = sub.buildSql();
    this._where.push({ raw: `NOT EXISTS(${sql})`, rawParams: params, kind: "and" });
    return this;
  }

  /**
   * Add a grouped AND condition: WHERE ( ... )
   * The callback receives a query builder where you add conditions,
   * and those conditions are wrapped in parentheses.
   */
  andWhereGroup(fn: (qb: AdvancedQueryBuilder<T>) => void) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const child = new AdvancedQueryBuilder<T>(
      this.table, this.dir, this.exec, this.modelName, this.schema, this.orm
    );
    fn(child);
    const { sql: groupSql, params: groupParams } = child._buildWhereSql(0);
    if (groupSql) {
      this._where.push({
        raw: `(${groupSql})`,
        rawParams: groupParams,
        kind: "and",
      });
    }
    return this;
  }

  /**
   * Add a grouped OR condition: WHERE ... OR ( ... )
   * The callback receives a query builder where you add conditions,
   * and those conditions are wrapped in parentheses.
   */
  orWhereGroup(fn: (qb: AdvancedQueryBuilder<T>) => void) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const child = new AdvancedQueryBuilder<T>(
      this.table, this.dir, this.exec, this.modelName, this.schema, this.orm
    );
    fn(child);
    const { sql: groupSql, params: groupParams } = child._buildWhereSql(0);
    if (groupSql) {
      this._where.push({
        raw: `(${groupSql})`,
        rawParams: groupParams,
        kind: "or",
      });
    }
    return this;
  }

  /**
   * Replace named placeholders (:name, :email) with positional ? placeholders
   * using the provided named params object.
   * Example: .whereRaw("name = :name AND email = :email", { name: "Alice", email: "a@b.com" })
   */
  namedWhere(rawSql: string, namedParams: Record<string, any>): this {
    const paramNames: string[] = [];
    const resolvedSql = rawSql.replace(/:([a-zA-Z_]\w*)/g, (_, name) => {
      paramNames.push(name);
      return "?";
    });
    const params = paramNames.map((n) => namedParams[n]);
    this._where.push({ raw: resolvedSql, rawParams: params, kind: "and" });
    return this;
  }

  /**
   * Count with DISTINCT and GROUP BY support.
   * Returns an array of { count, groupKey } for each group.
   */
  async countWithGroup(groupColumn: keyof T & string): Promise<{ count: number; [key: string]: any }[]> {
    await (this as any)._resolvePendingRelated();
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const quotedCol = dialect.quoteIdentifier(String(groupColumn));
    const { sql: whereSql, params } = this._buildWhereSql(0);
    let sql = `SELECT ${quotedCol}, COUNT(*) as count FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");
    if (whereSql) sql += " WHERE " + whereSql;
    sql += ` GROUP BY ${quotedCol}`;
    if (this._having) {
      sql += " HAVING " + this._having.raw;
      params.push(...this._having.params);
    }
    const res = await this.exec(sql, params);
    return (res.rows || []).map((r: any) => ({ ...r, count: parseInt(r.count, 10) }));
  }

  /**
   * LATERAL subquery join
   */
  lateralSubquery(sub: AdvancedQueryBuilder<any>, alias: string, lateralType: "INNER" | "LEFT" = "INNER") {
    const { sql, params } = sub.buildSql();
    this._params.push(...params);
    this._joins.push(`${lateralType} JOIN LATERAL (${sql}) AS ${alias} ON true`);
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
