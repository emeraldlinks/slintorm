// queryBuilder.ts
import type { ExecFn, OpComparison } from "./types.ts";

type RelationMeta = {
  fieldName: string;
  kind: "onetomany" | "manytoone" | "onetoone" | "manytomany";
  targetModel: string;
  foreignKey?: string;
  relatedKey?: string;
  through?: string;
};

export function mapBooleans<T extends Record<string, any>>(
  row: T,
  schemaFields: Record<string, any>
): T {
  const newRow = { ...row } as Record<string, any>;
  for (const key of Object.keys(schemaFields)) {
    const fieldType = String(schemaFields[key]?.type || "").toLowerCase();
    if (fieldType.includes("boolean") && key in newRow) {
      const val = newRow[key];
      newRow[key] = val === 1 || val === true || val === "1" ? true : false;
    }
  }
  return newRow as T;
}

type DialectAdapter = {
  formatPlaceholder: (index: number) => string;
  caseInsensitiveLike: (column: string, index: number) => string;
  quoteIdentifier: (name: string) => string;
};

export const Dialects: Record<string, DialectAdapter> = {
  sqlite: {
    formatPlaceholder: () => "?",
    caseInsensitiveLike: (col) => `LOWER(${col}) LIKE LOWER(?)`,
    quoteIdentifier: (n) => `"${n}"`,
  },
  postgres: {
    formatPlaceholder: (i) => `$${i + 1}`,
    caseInsensitiveLike: (col, i) => `${col} ILIKE $${i + 1}`,
    quoteIdentifier: (n) => `"${n}"`,
  },
  mysql: {
    formatPlaceholder: () => "?",
    caseInsensitiveLike: (col) => `${col} LIKE ?`,
    quoteIdentifier: (n) => `\`${n}\``,
  },
  mongodb: {
    formatPlaceholder: () => "?",
    caseInsensitiveLike: (col) => col,
    quoteIdentifier: (n) => n,
  },
};

type PreloadPath<T> =
  | (keyof T & string)
  | `${Extract<keyof T, string>}.${string}`;

type RelationPath<T> =
  | (keyof T & string)
  | `${Extract<keyof T, string>}.${string}`;

type WhereCondition<T> =
  | Partial<T>
  | {
      [K in keyof T]?: { op: OpComparison; value: T[K] };
    };

// Internal where clause descriptor
interface WhereClause {
  raw?: string;
  column?: string;
  op?: OpComparison;
  value?: any;
  kind?: "and" | "or" | "in" | "notin" | "null" | "notnull" | "between";
}

export class QueryBuilder<T extends Record<string, any>> {
  protected _selects: (keyof T | string)[] | null = null;
  protected _where: WhereClause[] = [];
  protected _orderBy: string[] = [];
  protected _limit: number | null = null;
  protected _offset: number | null = null;
  protected _joins: string[] = [];
  protected _preloads: string[] = [];
  protected _exclude: string[] = [];

  private _preloadCache = new Map<string, any[]>();

  protected table: string;
  protected exec: ExecFn;
  protected orm: { dialect?: string } | undefined;
  protected modelName: string;
  protected dir: string;
  protected schema: Record<string, any> | any;

  constructor(
    table: string,
    dir: string,
    exec: ExecFn,
    modelName: string,
    schema: Record<string, any>,
    orm?: { dialect?: string }
  ) {
    if (!dir) throw new Error("QueryBuilder requires a valid directory for schema.");
    this.table = table;
    this.exec = exec;
    this.orm = orm;
    this.dir = dir;
    this.schema = schema;
    this.modelName = modelName;
    if (!schema) throw new Error("Schema not found");
    if (!this.modelName) throw new Error("modelName not found");
  }

  // ----------------------------------------------------------------
  // SELECT
  // ----------------------------------------------------------------

  /**
   * Specify which columns to select. Defaults to all columns (*).
   *
   * @example
   * const users = await db.User.query()
   *   .select("id", "name", "email")
   *   .get();
   */
  select<K extends keyof T>(...cols: K[]) {
    this._selects = cols as (keyof T | string)[];
    return this;
  }

  // ----------------------------------------------------------------
  // WHERE helpers
  // ----------------------------------------------------------------

  /**
   * Add an AND WHERE condition.
   *
   * @example
   * const users = await db.User.query()
   *   .where("status", "=", "active")
   *   .get();
   */
  where<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value, kind: "and" });
    return this;
  }

  /**
   * Add an OR WHERE condition.
   *
   * @example
   * const users = await db.User.query()
   *   .where("role", "=", "admin")
   *   .orWhere("role", "=", "tutor")
   *   .get();
   */
  orWhere<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value, kind: "or" });
    return this;
  }

  /**
   * Add a raw SQL WHERE condition. Useful for cross-table conditions
   * after joins, or anything the typed helpers can't express.
   *
   * @example
   * const results = await db.Assessment.query()
   *   .join("modules", "modules.id", "=", "assessments.moduleId")
   *   .whereRaw("modules.trackId = 3")
   *   .get();
   */
  whereRaw(sql: string) {
    this._where.push({ raw: sql, kind: "and" });
    return this;
  }

  /**
   * Filter rows where a column's value is in the given array.
   *
   * @example
   * const cohorts = await db.Cohort.query()
   *   .whereIn("status", ["active", "upcoming"])
   *   .get();
   */
  whereIn<K extends keyof T>(column: K, values: T[K][]) {
    this._where.push({ column: column as string, value: values, kind: "in" });
    return this;
  }

  /**
   * Filter rows where a column's value is NOT in the given array.
   *
   * @example
   * const cohorts = await db.Cohort.query()
   *   .whereNotIn("status", ["cancelled", "completed"])
   *   .get();
   */
  whereNotIn<K extends keyof T>(column: K, values: T[K][]) {
    this._where.push({ column: column as string, value: values, kind: "notin" });
    return this;
  }

  /**
   * Filter rows where a column is NULL.
   *
   * @example
   * const enrollments = await db.Enrollment.query()
   *   .whereNull("completedAt")
   *   .get();
   */
  whereNull<K extends keyof T>(column: K) {
    this._where.push({ column: column as string, kind: "null" });
    return this;
  }

  /**
   * Filter rows where a column is NOT NULL.
   *
   * @example
   * const enrollments = await db.Enrollment.query()
   *   .whereNotNull("paidAt")
   *   .get();
   */
  whereNotNull<K extends keyof T>(column: K) {
    this._where.push({ column: column as string, kind: "notnull" });
    return this;
  }

  /**
   * Filter rows where a column's value falls between min and max (inclusive).
   *
   * @example
   * const submissions = await db.Submission.query()
   *   .whereBetween("score", 50, 100)
   *   .get();
   */
  whereBetween<K extends keyof T>(column: K, min: T[K], max: T[K]) {
    this._where.push({ column: column as string, value: [min, max], kind: "between" });
    return this;
  }

  // ----------------------------------------------------------------
  // ORDER / LIMIT / OFFSET / PAGINATE
  // ----------------------------------------------------------------

  /**
   * Order results by a column.
   *
   * @example
   * const users = await db.User.query()
   *   .orderBy("createdAt", "desc")
   *   .get();
   */
  orderBy<K extends keyof T>(column: K, dir: "asc" | "desc" = "asc") {
    this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
    return this;
  }

  /**
   * Limit the number of rows returned.
   *
   * @example
   * const top5 = await db.Enrollment.query()
   *   .orderBy("overallScore", "desc")
   *   .limit(5)
   *   .get();
   */
  limit(n: number) {
    this._limit = n;
    return this;
  }

  /**
   * Skip a number of rows before returning results.
   *
   * @example
   * const results = await db.User.query()
   *   .offset(20)
   *   .limit(10)
   *   .get();
   */
  offset(n: number) {
    this._offset = n;
    return this;
  }

  /**
   * Shorthand for limit + offset based pagination.
   *
   * @example
   * const page2 = await db.User.query()
   *   .paginate(2, 10)
   *   .get();
   */
  paginate(page: number, perPage: number) {
    this._limit = perPage;
    this._offset = (page - 1) * perPage;
    return this;
  }

  // ----------------------------------------------------------------
  // JOINS
  // ----------------------------------------------------------------

  /**
   * Add an INNER JOIN clause.
   *
   * @example
   * const results = await db.Assessment.query()
   *   .join("modules", "modules.id", "=", "assessments.moduleId")
   *   .get();
   */
  join(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  /**
   * Add a LEFT JOIN clause.
   *
   * @example
   * const results = await db.Cohort.query()
   *   .leftJoin("enrollments", "enrollments.cohortId", "=", "cohorts.id")
   *   .get();
   */
  leftJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  // ----------------------------------------------------------------
  // EXCLUDE / PRELOAD
  // ----------------------------------------------------------------

  /**
   * Exclude specific columns from the result. Supports dot notation
   * to exclude nested relation fields.
   *
   * @example
   * const users = await db.User.query()
   *   .exclude("password", "enrollment.paymentRef")
   *   .get();
   */
  exclude(...columns: (keyof T | `${string}.${string}`)[]) {
    this._exclude.push(...columns.map((c) => String(c)));
    return this;
  }

  /**
   * Eagerly load a relation alongside the main query results.
   * Supports dot notation for nested relations.
   *
   * @example
   * const cohorts = await db.Cohort.query()
   *   .preload("track")
   *   .preload("enrollments")
   *   .get();
   *
   * // Nested:
   * const cohorts = await db.Cohort.query()
   *   .preload("enrollments.user")
   *   .get();
   */
  preload<K extends PreloadPath<T>>(relation: K) {
    this._preloads.push(relation as string);
    return this;
  }

  // ----------------------------------------------------------------
  // ILike
  // ----------------------------------------------------------------

  /**
   * Case-insensitive LIKE filter. Uses LOWER()..LIKE on SQLite,
   * ILIKE on Postgres, and plain LIKE on MySQL.
   *
   * @example
   * const users = await db.User.query()
   *   .ILike("name", "john")
   *   .get();
   */
  ILike<K extends keyof T>(column: K, value: string) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const paramIndex = this._countParams();
    const clause = dialect.caseInsensitiveLike(String(column), paramIndex);
    this._where.push({ raw: clause, value: `%${value}%`, kind: "and" });
    return this;
  }

  private _countParams(): number {
    return this._where.reduce((acc, w) => {
      if (w.kind === "in" || w.kind === "notin") return acc + (w.value?.length ?? 0);
      if (w.kind === "between") return acc + 2;
      if (w.kind === "null" || w.kind === "notnull") return acc;
      if (w.raw && w.value !== undefined)
        return acc + (Array.isArray(w.value) ? w.value.length : 1);
      if (!w.raw) return acc + 1;
      return acc;
    }, 0);
  }

  // ----------------------------------------------------------------
  // RELATION TRAVERSAL HELPERS
  // ----------------------------------------------------------------

  /**
   * Resolve a relation field name to its schema metadata for the given model.
   * Returns undefined if the relation doesn't exist.
   */
  private _resolveRelation(
    modelName: string,
    fieldName: string
  ): { relation: any; targetSchema: any; currentSchema: any } | undefined {
    const currentSchema = this.schema[modelName];
    if (!currentSchema) return undefined;
    const relation = (currentSchema.relations || []).find(
      (r: any) => r.fieldName === fieldName
    );
    if (!relation) return undefined;
    const targetSchema = this.schema[relation.targetModel];
    if (!targetSchema) return undefined;
    return { relation, targetSchema, currentSchema };
  }

  /**
   * Traverse a dot-separated relation path and apply all intermediate
   * JOIN clauses automatically based on schema relation metadata.
   * Returns `this` so you can keep chaining `.where()`, `.get()`, etc.
   *
   * Use this when you need joins but still want to write the final
   * WHERE condition yourself.
   *
   * @param path - Dot-separated relation field names to traverse,
   *   e.g. `"module.cohort.enrollment"`.
   *
   * @example
   * const assessments = await db.Assessment.query()
   *   .throughRelation("module.cohort.enrollment")
   *   .where("enrollments.userId", "=", session.id)
   *   .preload("module")
   *   .get();
   */

  throughRelation<K extends RelationPath<T>> (path: K) {
    const parts = path.split(".");
    let currentModelName = this.modelName;

    for (const part of parts) {
      const resolved = this._resolveRelation(currentModelName, part);
      if (!resolved) break;

      const { relation, targetSchema, currentSchema } = resolved;
      const foreignKey =
        relation.foreignKey ||
        relation.meta?.foreignKey ||
        relation.meta?.foreignkey;
      const targetTable = targetSchema.table;
      const currentTable = currentSchema.table;
      const targetPK = targetSchema.primaryKey || "id";
      const currentPK = currentSchema.primaryKey || "id";

      const parentHasFK =
        currentSchema.fields && foreignKey in currentSchema.fields;

      if (parentHasFK) {
        this._joins.push(
          `JOIN ${targetTable} ON ${targetTable}.${targetPK} = ${currentTable}.${foreignKey}`
        );
      } else {
        this._joins.push(
          `JOIN ${targetTable} ON ${targetTable}.${foreignKey} = ${currentTable}.${currentPK}`
        );
      }

      currentModelName = relation.targetModel;
    }

    return this;
  }

  /**
   * Traverse a dot-separated relation path, apply all intermediate JOINs
   * automatically, then filter by a column on the final table.
   *
   * Combines `throughRelation` + a WHERE in one call.
   *
   * @param path - Dot-separated relation field names, e.g. `"module.cohort.enrollment"`.
   * @param column - Column name on the final relation's table to filter by.
   * @param value - Value to match against.
   *
   * @example
   * const assessments = await db.Assessment.query()
   *   .whereRelated("module.cohort.enrollment", "userId", session.id)
   *   .preload("module")
   *   .get();
   */
  whereRelated<K extends RelationPath<T>> (path: K, column: K, value: any) {
    this.throughRelation(path);

    // Walk the path to find the final model's table name
    const parts = path.split(".");
    let currentModelName = this.modelName;
    let finalTable: string | null = null;

    for (const part of parts) {
      const resolved = this._resolveRelation(currentModelName, part);
      if (!resolved) break;
      finalTable = resolved.targetSchema.table;
      currentModelName = resolved.relation.targetModel;
    }

    const targetTable = finalTable ?? parts[parts.length - 1] + "s";

    this._where.push({
      raw: `${targetTable}.${column} = ?`,
      value,
      kind: "and",
    });

    return this;
  }

  /**
   * Automatically find the join path between the current model and a
   * target model by traversing the schema relation graph (BFS), then
   * apply all intermediate JOINs and filter by a column on the target table.
   *
   * You only need to know the target model name — no path required.
   * Throws if no path exists between the two models.
   *
   * @param targetModelName - The model name to relate to, e.g. `"Enrollment"`.
   * @param column - Column on the target model's table to filter by.
   * @param value - Value to match against.
   *
   * @example
   * const assessments = await db.Assessment.query()
   *   .relatedTo("Enrollment", "userId", session.id)
   *   .preload("module")
   *   .get();
   */
    relatedTo<K extends RelationPath<T>> (targetModelName: K, column: K, value: any) {
    // BFS: find shortest relation path from current model to target model
    const queue: { modelName: string; path: string[] }[] = [
      { modelName: this.modelName, path: [] },
    ];
    const visited = new Set<string>();
    let foundPath: string[] | null = null;

    while (queue.length) {
      const { modelName, path } = queue.shift()!;
      if (visited.has(modelName)) continue;
      visited.add(modelName);

      if (modelName === targetModelName) {
        foundPath = path;
        break;
      }

      const modelSchema = this.schema[modelName];
      if (!modelSchema) continue;

      for (const relation of modelSchema.relations || []) {
        if (!visited.has(relation.targetModel)) {
          queue.push({
            modelName: relation.targetModel,
            path: [...path, relation.fieldName],
          });
        }
      }
    }

    if (!foundPath) {
      throw new Error(
        `relatedTo: no relation path found from "${this.modelName}" to "${targetModelName}"`
      );
    }

    return this.whereRelated(foundPath.join("."), column, value);
  }

  // ----------------------------------------------------------------
  // MongoDB helpers
  // ----------------------------------------------------------------

  private buildMongoFilter(): Record<string, any> {
    const filter: Record<string, any> = {};
    const orClauses: Record<string, any>[] = [];

    for (const w of this._where) {
      if (w.kind === "or") {
        const clause: Record<string, any> = {};
        clause[w.column as string] = this._mongoOp(w.op!, w.value);
        orClauses.push(clause);
        continue;
      }
      if (w.kind === "null")    { filter[w.column as string] = null; continue; }
      if (w.kind === "notnull") { filter[w.column as string] = { $ne: null }; continue; }
      if (w.kind === "in")      { filter[w.column as string] = { $in: w.value }; continue; }
      if (w.kind === "notin")   { filter[w.column as string] = { $nin: w.value }; continue; }
      if (w.kind === "between") {
        filter[w.column as string] = { $gte: w.value[0], $lte: w.value[1] };
        continue;
      }
      if (w.raw) continue;
      filter[w.column as string] = this._mongoOp(w.op!, w.value);
    }

    if (orClauses.length) filter["$or"] = orClauses;
    return filter;
  }

  private _mongoOp(op: OpComparison, value: any): any {
    switch (op) {
      case "=":    return value;
      case "!=":   return { $ne: value };
      case ">":    return { $gt: value };
      case ">=":   return { $gte: value };
      case "<":    return { $lt: value };
      case "<=":   return { $lte: value };
      case "LIKE": return { $regex: value.replace(/%/g, ".*"), $options: "i" };
      default:     return value;
    }
  }

  // ----------------------------------------------------------------
  // SQL builder
  // ----------------------------------------------------------------

  protected buildSql(): { sql: string; params: any[] } {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";

    if (isMongo) {
      const mongoCmd = {
        collection: this.table,
        action: "find",
        filter: this.buildMongoFilter(),
        projection: this._selects?.length
          ? Object.fromEntries((this._selects as string[]).map((c) => [c, 1]))
          : undefined,
        sort: this._orderBy.length
          ? Object.fromEntries(
              this._orderBy.map((o) => {
                const [col, dir] = o.split(" ");
                return [col, dir === "DESC" ? -1 : 1];
              })
            )
          : undefined,
        limit: this._limit ?? undefined,
        skip: this._offset ?? undefined,
      };
      return { sql: JSON.stringify(mongoCmd), params: [] };
    }

    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    let sql = "SELECT ";
    sql += this._selects?.length
      ? (this._selects as string[]).map((c) => dialect.quoteIdentifier(c)).join(", ")
      : "*";
    sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");

    const { sql: whereSql, params } = this._buildWhereSql(0);
    if (whereSql) sql += " WHERE " + whereSql;

    if (this._orderBy.length) {
      sql += " ORDER BY " + this._orderBy
        .map((c) => {
          const [col, dir] = c.split(" ");
          return `${dialect.quoteIdentifier(col)} ${dir || ""}`;
        })
        .join(", ");
    }

    if (this._limit  != null) sql += " LIMIT "  + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    return { sql, params };
  }

  protected _buildWhereSql(startIndex = 0): { sql: string; params: any[] } {
    if (!this._where.length) return { sql: "", params: [] };

    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const params: any[] = [];
    let paramIndex = startIndex;
    const parts: string[] = [];

    for (let i = 0; i < this._where.length; i++) {
      const w = this._where[i];
      const connector = i === 0 ? "" : w.kind === "or" ? " OR " : " AND ";

      if (w.kind === "null") {
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} IS NULL`);
        continue;
      }
      if (w.kind === "notnull") {
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} IS NOT NULL`);
        continue;
      }
      if (w.kind === "in" || w.kind === "notin") {
        const placeholders = (w.value as any[]).map(() => dialect.formatPlaceholder(paramIndex++));
        params.push(...w.value);
        const op = w.kind === "in" ? "IN" : "NOT IN";
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} ${op} (${placeholders.join(", ")})`);
        continue;
      }
      if (w.kind === "between") {
        const ph1 = dialect.formatPlaceholder(paramIndex++);
        const ph2 = dialect.formatPlaceholder(paramIndex++);
        params.push(w.value[0], w.value[1]);
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} BETWEEN ${ph1} AND ${ph2}`);
        continue;
      }
      if (w.raw) {
        if (w.value !== undefined) {
          if (Array.isArray(w.value)) { params.push(...w.value); paramIndex += w.value.length; }
          else { params.push(w.value); paramIndex++; }
        }
        parts.push(`${connector}${w.raw}`);
        continue;
      }
      const ph = dialect.formatPlaceholder(paramIndex++);
      params.push(w.value);
      parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} ${w.op} ${ph}`);
    }

    return { sql: parts.join(""), params };
  }

  // ----------------------------------------------------------------
  // getPaginated
  // ----------------------------------------------------------------

  /**
   * Fetch a paginated result set alongside the total row count.
   * Runs two queries: one COUNT and one SELECT with LIMIT/OFFSET.
   *
   * @example
   * const { data, total, page, lastPage } = await db.User.query()
   *   .where("status", "=", "active")
   *   .getPaginated(1, 20);
   */
  async getPaginated(
    page: number,
    perPage: number
  ): Promise<{ data: T[]; total: number; page: number; lastPage: number }> {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    let total = 0;

    if (isMongo) {
      const countCmd = JSON.stringify({
        collection: this.table,
        action: "count",
        filter: this.buildMongoFilter(),
      });
      const countRes = await this.exec(countCmd, []);
      total = parseInt(countRes.rows?.[0]?.count ?? "0", 10);
    } else {
      const dialect = Dialects[this.orm?.dialect || "sqlite"];
      const { sql: whereSql, params } = this._buildWhereSql(0);
      let countSql = `SELECT COUNT(*) as count FROM ${dialect.quoteIdentifier(this.table)}`;
      if (this._joins.length) countSql += " " + this._joins.join(" ");
      if (whereSql) countSql += " WHERE " + whereSql;
      const countRes = await this.exec(countSql, params);
      total = parseInt(countRes.rows?.[0]?.count ?? "0", 10);
    }

    this.paginate(page, perPage);
    const data = await this.get();
    const lastPage = Math.ceil(total / perPage) || 1;
    return { data, total, page, lastPage };
  }

  // ----------------------------------------------------------------
  // get
  // ----------------------------------------------------------------

  /**
   * Execute the query and return all matching rows.
   * Applies preloads, boolean mapping, JSON parsing, and excludes.
   *
   * @example
   * const cohorts = await db.Cohort.query()
   *   .where("status", "=", "active")
   *   .preload("track")
   *   .get();
   */
  async get(): Promise<T[]> {
    const { sql, params } = this.buildSql();
    const res = await this.exec(sql, params);
    let rows = (res.rows || []) as T[];

    if (this._preloads.length) {
      this._preloadCache.clear();
      rows = await this.applyPreloads(rows);
    }

    const schemaFields = this.schema![this.modelName]?.fields ?? {};
    rows = rows.map((r) => this.mapJson(mapBooleans(r, schemaFields), schemaFields)) as T[];

    if (this._exclude.length) {
      rows = rows.map((r) => {
        const copy: Record<string, any> = { ...r };
        for (const col of this._exclude) {
          if (!col.includes(".")) delete copy[col];
        }
        return copy as T;
      });
    }

    return rows;
  }

  // ----------------------------------------------------------------
  // first
  // ----------------------------------------------------------------

  /**
   * Execute the query and return the first matching row, or null.
   * Optionally accepts an inline condition (object or raw string).
   *
   * @example
   * const user = await db.User.query()
   *   .first({ email: "admin@cofoundracademy.ng" });
   *
   * const user = await db.User.query()
   *   .where("status", "=", "active")
   *   .first();
   */
  async first(condition?: WhereCondition<T> | string): Promise<T | null> {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const modelSchema = this.schema ? this.schema[this.modelName] : undefined;
    const modelCols = modelSchema ? Object.keys(modelSchema.fields || {}) : [];

    if (condition) {
      if (typeof condition === "string") {
        let sql = condition;
        if (modelCols.length) {
          for (const col of modelCols) {
            const quoted = dialect.quoteIdentifier(col);
            sql = sql.replace(
              new RegExp(`(?<![A-Za-z0-9_"])${col}(?![A-Za-z0-9_"])`, "g"),
              quoted
            );
          }
        }
        this._where.push({ raw: sql, kind: "and" });
      } else if (typeof condition === "object") {
        for (const key of Object.keys(condition) as (keyof T)[]) {
          const val = (condition as any)[key];
          if (val !== null && typeof val !== "object") {
            this.where(key as any, "=", val as T[keyof T]);
          } else if (val && typeof val === "object" && "op" in val && "value" in val) {
            this.where(key as any, (val as any).op as OpComparison, (val as any).value);
          }
        }
      }
    }

    if (!this._limit) this.limit(1);
    const rows = await this.get();
    return rows[0] || null;
  }

  // ----------------------------------------------------------------
  // Preload engine
  // ----------------------------------------------------------------

  private spawnChildBuilder(
    targetTable: string,
    targetModelName: string
  ): QueryBuilder<any> {
    const ChildClass = this.constructor as new (
      table: string,
      dir: string,
      exec: ExecFn,
      modelName: string,
      schema: Record<string, any>,
      orm?: { dialect?: string }
    ) => QueryBuilder<any>;

    return new ChildClass(
      targetTable,
      this.dir,
      this.exec,
      targetModelName,
      this.schema,
      this.orm
    );
  }

  protected async applyPreloads(
    rows: any[],
    visited = new Set<string>()
  ): Promise<any[]> {
    if (!rows.length) return rows;

    const modelSchema = this.schema![this.modelName];
    if (!modelSchema) return rows;

    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    const dialect  = Dialects[this.orm?.dialect || "sqlite"];
    const rootPK   = modelSchema.primaryKey || "id";

    const relations: RelationMeta[] = (modelSchema.relations || []).map((r: any) => ({
      fieldName:   r.fieldName,
      kind:        r.kind,
      targetModel: r.targetModel,
      foreignKey:  r.foreignKey  || r.meta?.foreignKey  || r.meta?.foreignkey,
      relatedKey:  r.relatedKey  || r.meta?.relatedKey  || r.meta?.relatedkey,
      through:     r.through     || r.meta?.through,
    }));

    if (!relations.length) return rows;

    const grouped: Record<string, string[]> = {};
    for (const preload of this._preloads) {
      const parts = preload.split(".");
      const root  = parts.shift()!;
      if (!grouped[root]) grouped[root] = [];
      if (parts.length) grouped[root].push(parts.join("."));
    }

    const hasValues = (arr: any[]) => Array.isArray(arr) && arr.length > 0;

    const mongoFetch = async (
      targetTable: string,
      filter: Record<string, any>
    ): Promise<any[]> => {
      const cmd = JSON.stringify({ collection: targetTable, action: "find", filter });
      return (await this.exec(cmd, [])).rows || [];
    };

    const sqlFetch = async (
      targetTable: string,
      colName: string,
      ids: any[]
    ): Promise<any[]> => {
      const cacheKey = `${targetTable}:${colName}:${ids.sort().join(",")}`;
      if (this._preloadCache.has(cacheKey)) {
        return this._preloadCache.get(cacheKey)!;
      }
      const ph  = ids.map((_, i) => dialect.formatPlaceholder(i)).join(", ");
      const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetTable)} WHERE ${dialect.quoteIdentifier(colName)} IN (${ph})`;
      const result = (await this.exec(sql, ids)).rows || [];
      this._preloadCache.set(cacheKey, result);
      return result;
    };

    const manyToManyJoinFetch = async (
      through: string,
      targetTable: string,
      targetPK: string,
      foreignKey: string,
      relatedKey: string,
      parentIds: any[]
    ): Promise<{ junctionRows: any[]; relatedRows: any[] }> => {
      if (isMongo) {
        const junction = await mongoFetch(through, { [foreignKey]: { $in: parentIds } });
        const targetIds = [...new Set(junction.map((j) => j[relatedKey]))];
        if (!hasValues(targetIds)) return { junctionRows: [], relatedRows: [] };
        const relatedRows = await mongoFetch(targetTable, { [targetPK]: { $in: targetIds } });
        return { junctionRows: junction, relatedRows };
      }

      const ph  = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(", ");
      const sql =
        `SELECT ${dialect.quoteIdentifier(targetTable)}.*, ` +
        `${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} AS __pivot_fk ` +
        `FROM ${dialect.quoteIdentifier(targetTable)} ` +
        `INNER JOIN ${dialect.quoteIdentifier(through)} ` +
        `ON ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(relatedKey)} = ` +
        `${dialect.quoteIdentifier(targetTable)}.${dialect.quoteIdentifier(targetPK)} ` +
        `WHERE ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} IN (${ph})`;

      const rows = (await this.exec(sql, parentIds)).rows || [];

      const junctionRows = rows.map((r: any) => ({
        [foreignKey]: r.__pivot_fk,
        [relatedKey]: r[targetPK],
      }));

      const relatedRows = rows.map((r: any) => {
        const copy = { ...r };
        delete copy.__pivot_fk;
        return copy;
      });

      return { junctionRows, relatedRows };
    };

    const fetchRelation = async (
      relation: RelationMeta,
      parentRows: any[]
    ): Promise<any[]> => {
      const cycleKey = `${this.modelName}:${relation.fieldName}`;
      if (visited.has(cycleKey)) return [];
      visited.add(cycleKey);

      const targetSchema = this.schema![relation.targetModel];
      if (!targetSchema) return [];

      const targetPK  = targetSchema.primaryKey || "id";
      const { kind, through } = relation;
      const foreignKey = relation.foreignKey as string;
      const relatedKey = relation.relatedKey as string;

      let relatedRows: any[] = [];

      if (kind === "onetomany") {
        const parentIds = Array.from(
          new Set(parentRows.map((r) => r[rootPK]).filter(Boolean))
        );
        if (!hasValues(parentIds)) {
          parentRows.forEach((r) => (r[relation.fieldName] = []));
          return [];
        }

        relatedRows = isMongo
          ? await mongoFetch(targetSchema.table, { [foreignKey]: { $in: parentIds } })
          : await sqlFetch(targetSchema.table, foreignKey, parentIds);

        relatedRows = relatedRows.map((r) =>
          this.cleanRow(r, targetSchema, relation.fieldName)
        );

        const map = new Map<any, any[]>();
        relatedRows.forEach((r) => {
          const key = r[foreignKey];
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(r);
        });
        parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || []));

      } else if (kind === "manytoone") {
        const fkValues = Array.from(
          new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean))
        );
        if (!hasValues(fkValues)) {
          parentRows.forEach((r) => (r[relation.fieldName] = null));
          return [];
        }

        relatedRows = isMongo
          ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
          : await sqlFetch(targetSchema.table, targetPK, fkValues);

        relatedRows = relatedRows.map((r) =>
          this.cleanRow(r, targetSchema, relation.fieldName)
        );

        const map = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
        parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[foreignKey]) || null));

      } else if (kind === "onetoone") {
        const parentHasFK = parentRows.some((r) =>
          Object.prototype.hasOwnProperty.call(r, foreignKey)
        );

        if (!parentHasFK) {
          const parentIds = Array.from(
            new Set(parentRows.map((r) => r[rootPK]).filter(Boolean))
          );
          if (!hasValues(parentIds)) {
            parentRows.forEach((r) => (r[relation.fieldName] = null));
            return [];
          }

          relatedRows = isMongo
            ? await mongoFetch(targetSchema.table, { [foreignKey]: { $in: parentIds } })
            : await sqlFetch(targetSchema.table, foreignKey, parentIds);

          relatedRows = relatedRows.map((r) =>
            this.cleanRow(r, targetSchema, relation.fieldName)
          );

          const map = new Map(relatedRows.map((r) => [r[foreignKey] as PropertyKey, r]));
          parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || null));
        } else {
          const fkValues = Array.from(
            new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean))
          );
          if (!hasValues(fkValues)) {
            parentRows.forEach((r) => (r[relation.fieldName] = null));
            return [];
          }

          relatedRows = isMongo
            ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
            : await sqlFetch(targetSchema.table, targetPK, fkValues);

          relatedRows = relatedRows.map((r) =>
            this.cleanRow(r, targetSchema, relation.fieldName)
          );

          const map = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
          parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[foreignKey]) || null));
        }

      } else if (kind === "manytomany") {
        if (!through || !foreignKey || !relatedKey) return [];

        const parentIds = Array.from(
          new Set(parentRows.map((r) => r[rootPK]).filter(Boolean))
        );
        if (!hasValues(parentIds)) {
          parentRows.forEach((r) => (r[relation.fieldName] = []));
          return [];
        }

        const { junctionRows, relatedRows: fetchedRows } = await manyToManyJoinFetch(
          through,
          targetSchema.table,
          targetPK,
          foreignKey,
          relatedKey,
          parentIds
        );

        if (!hasValues(fetchedRows)) {
          parentRows.forEach((r) => (r[relation.fieldName] = []));
          return [];
        }

        relatedRows = fetchedRows.map((r) =>
          this.cleanRow(r, targetSchema, relation.fieldName)
        );

        const targetMap = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
        const parentMap = new Map<any, any[]>();

        junctionRows.forEach((j) => {
          const arr = parentMap.get(j[foreignKey]) || [];
          if (targetMap.has(j[relatedKey])) arr.push(targetMap.get(j[relatedKey]));
          parentMap.set(j[foreignKey], arr);
        });

        parentRows.forEach((r) => (r[relation.fieldName] = parentMap.get(r[rootPK]) || []));
      }

      const nested = grouped[relation.fieldName];
      if (nested?.length && hasValues(relatedRows)) {
        const child = this.spawnChildBuilder(targetSchema.table, relation.targetModel);
        child._preloads = nested;
        child._exclude  = this._nestedExcludes(relation.fieldName);

        if ("_withTrashed"  in this) (child as any)._withTrashed  = (this as any)._withTrashed;
        if ("_onlyTrashed"  in this) (child as any)._onlyTrashed  = (this as any)._onlyTrashed;

        await child.applyPreloads(relatedRows, visited);
      }

      return relatedRows;
    };

    for (const root of Object.keys(grouped)) {
      const relation = relations.find((r) => r.fieldName === root);
      if (!relation) continue;
      await fetchRelation(relation, rows);
    }

    return rows.map((r) => this.applyExcludes(r));
  }

  // ----------------------------------------------------------------
  // Utility helpers
  // ----------------------------------------------------------------

  private cleanRow(row: any, targetSchema: any, root?: string) {
    let clean = mapBooleans(row, targetSchema.fields || {});
    clean = this.mapJson(clean, targetSchema.fields || {});
    if (root) {
      const nestedExcludes = this._nestedExcludes(root);
      if (nestedExcludes.length) clean = this.removeExcluded(clean, nestedExcludes);
    }
    return clean;
  }

  private mapJson(row: any, schemaFields: Record<string, any>) {
    const out = { ...row } as Record<string, any>;
    for (const key of Object.keys(schemaFields)) {
      const meta = schemaFields[key]?.meta;
      const isJson = !!(meta?.json || meta?.["@json"]);
      if (isJson && typeof out[key] === "string") {
        try { out[key] = JSON.parse(out[key]); } catch {}
      }
    }
    return out;
  }

  removeExcluded(obj: any, excludes: string[]): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.removeExcluded(item, excludes));

    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const nested = excludes
        .filter((e) => e.startsWith(key + "."))
        .map((e) => e.slice(key.length + 1));
      if (excludes.includes(key)) continue;
      const val = obj[key];
      if (Array.isArray(val))                  result[key] = val.map((v) => this.removeExcluded(v, nested));
      else if (val && typeof val === "object")  result[key] = this.removeExcluded(val, nested);
      else                                      result[key] = val;
    }
    return result;
  }

  private applyExcludes(row: any) {
    if (!this._exclude.length) return row;
    const copy = { ...row };
    for (const f of this._exclude) {
      if (!f.includes(".")) delete copy[f];
    }
    return copy;
  }

  private _nestedExcludes(root: string): string[] {
    return this._exclude
      .filter((f) => typeof f === "string" && f.startsWith(root + "."))
      .map((f) => f.slice(root.length + 1));
  }
}