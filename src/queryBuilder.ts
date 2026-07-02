// queryBuilder.ts
// BUG FIX #2: where("table.col") after join() no longer routes to the
//   relation resolver. It goes straight to _where when the left-hand side
//   of the dot is NOT a known relation on the current model's schema.
//
// BUG FIX #3: whereRaw() now accepts an optional params array so
//   parameterized subqueries don't silently lose their bound values.

import type { ExecFn, OpComparison, AfterFindHook } from "./types.ts";

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
      newRow[key] = val === 1 || val === true || val === "1";
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
  | { [K in keyof T]?: { op: OpComparison; value: T[K] } };

interface WhereClause {
  raw?: string;
  rawParams?: any[];   // ← NEW: holds params for parameterized whereRaw()
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
  protected _filteredPreloads: Map<string, WhereClause[]> = new Map();
  protected _exclude: string[] = [];
  protected _pendingRelated: { path: string; column: string; value: any; op?: OpComparison }[] = [];
  private _preloadCache = new Map<string, any[]>();
  protected _cacheKey: string | null = null;
  protected _cacheTTL: number | null = null;
  private static _resultCache = new Map<string, { data: any; expires: number }>();
  protected _afterFindHooks: AfterFindHook<T>[] = [];
  protected _hints: string[] = [];
  protected _dryRun = false;

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

  // ── SELECT ──────────────────────────────────────────────────────────────────
  select<K extends keyof T>(...cols: K[]) {
    this._selects = cols as (keyof T | string)[];
    return this;
  }

  /** Type-safe pick: select specific columns and return only those in the result */
  async pick<K extends keyof T>(...cols: K[]): Promise<Pick<T, K>[]> {
    this.select(...cols);
    return this.get() as Promise<Pick<T, K>[]>;
  }

  /** Get a single column's values as a flat array */
  async pluck<K extends keyof T>(col: K): Promise<T[K][]> {
    this.select(col);
    const rows = await this.get();
    return rows.map(r => r[col as string]) as T[K][];
  }

  // ── WHERE helpers ───────────────────────────────────────────────────────────

  // BUG FIX #2: where("joinedTable.column") now checks whether the left part of
  // the dot is actually a known relation in the schema before routing to
  // _pendingRelated. If it's not a known relation (e.g. "users.name" after a
  // manual .join("users",...)), it goes straight to _where as a raw qualified
  // column reference — which is what the developer intended.
  where<K extends keyof T>(column: K, op: OpComparison, value: T[K]): this;
  where(column: RelationPath<T>, op: OpComparison, value: any): this;
  where(column: string, op: OpComparison, value: any): this;
  where(column: string, op: OpComparison, value: any) {
    const col = column as string;
    if (col.includes(".")) {
      const lastDot = col.lastIndexOf(".");
      const leftPart = col.slice(0, lastDot);   // e.g. "user" or "users"
      const fieldName = col.slice(lastDot + 1);  // e.g. "name"

      // Check if leftPart is a known relation field name on the current model
      const isKnownRelation = (this.schema?.[this.modelName]?.relations || [])
        .some((r: any) => r.fieldName === leftPart);

      if (isKnownRelation) {
        // Relation path → async IN-subquery resolution
        this._pendingRelated.push({ path: leftPart, column: fieldName, value, op });
      } else {
        // Plain table.column reference after a manual JOIN → goes straight to SQL WHERE
        this._where.push({ column: col, op, value, kind: "and" });
      }
    } else {
      this._where.push({ column: col, op, value, kind: "and" });
    }
    return this;
  }

  orWhere<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value, kind: "or" });
    return this;
  }

  // BUG FIX #3: whereRaw() now accepts an optional params array.
  // This is essential when embedding subqueries with ? placeholders:
  //   const sub = db.User.query().select("id").where("active", "=", 1);
  //   const { sql, params } = sub.buildSql();
  //   await db.Post.query().whereRaw(`"userId" IN (${sql})`, params).get();
  whereRaw(sql: string, params?: any[]) {
    this._where.push({ raw: sql, rawParams: params ?? [], kind: "and" });
    return this;
  }

  whereIn<K extends keyof T>(column: K, values: T[K][]) {
    this._where.push({ column: column as string, value: values, kind: "in" });
    return this;
  }

  whereNotIn<K extends keyof T>(column: K, values: T[K][]) {
    this._where.push({ column: column as string, value: values, kind: "notin" });
    return this;
  }

  whereNull<K extends keyof T>(column: K) {
    this._where.push({ column: column as string, kind: "null" });
    return this;
  }

  whereNotNull<K extends keyof T>(column: K) {
    this._where.push({ column: column as string, kind: "notnull" });
    return this;
  }

  whereBetween<K extends keyof T>(column: K, min: T[K], max: T[K]) {
    this._where.push({ column: column as string, value: [min, max], kind: "between" });
    return this;
  }

  whereColumnsIn<K extends keyof T>(columns: K[], values: Array<Array<T[K]>>) {
    if (!columns.length || !values.length) return this;
    const ph = values.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const flat = values.flat();
    this._where.push({
      raw: `(${columns.map(String).join(", ")}) IN (${ph})`,
      rawParams: flat,
      kind: "and",
    });
    return this;
  }

  // ── ORDER / LIMIT / OFFSET / PAGINATE ───────────────────────────────────────
  orderBy<K extends keyof T>(column: K, dir: "asc" | "desc" = "asc") {
    this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
    return this;
  }

  limit(n: number) { this._limit = n; return this; }
  offset(n: number) { this._offset = n; return this; }

  hint(sql: string) {
    this._hints.push(sql);
    return this;
  }
  indexHint(...indexes: string[]) {
    this._hints.push(`USE INDEX (${indexes.join(", ")})`);
    return this;
  }
  commentHint(comment: string) {
    this._hints.push(`/* ${comment} */`);
    return this;
  }
  dryRun() {
    this._dryRun = true;
    return this;
  }
  toSql(): { sql: string; params: any[] } {
    return this.buildSql();
  }
  async *stream(batchSize = 100): AsyncGenerator<T[], void, undefined> {
    const originalLimit = this._limit;
    const originalOffset = this._offset ?? 0;
    let offset = originalOffset;
    let hasMore = true;
    while (hasMore) {
      this._limit = batchSize;
      this._offset = offset;
      const { sql, params } = this.buildSql();
      const res = await this.exec(sql, params);
      const rows = (res.rows || []) as T[];
      if (rows.length === 0) break;
      yield rows;
      offset += rows.length;
      hasMore = rows.length >= batchSize;
    }
    this._limit = originalLimit;
    this._offset = originalOffset;
  }

  paginate(page: number, perPage: number) {
    this._limit = perPage;
    this._offset = (page - 1) * perPage;
    return this;
  }

  // ── JOINS ────────────────────────────────────────────────────────────────────
  join(table: string, onLeft: string, op: string, onRight: string) {
    const clause = `JOIN ${table} ON ${onLeft} ${op} ${onRight}`;
    if (!this._joins.includes(clause)) this._joins.push(clause);
    return this;
  }

  leftJoin(table: string, onLeft: string, op: string, onRight: string) {
    const clause = `LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`;
    if (!this._joins.includes(clause)) this._joins.push(clause);
    return this;
  }

  // ── EXCLUDE / PRELOAD ────────────────────────────────────────────────────────
  exclude(...columns: (keyof T | `${string}.${string}`)[]) {
    this._exclude.push(...columns.map((c) => String(c)));
    return this;
  }

  preload<K extends PreloadPath<T>>(relation: K, filter?: (qb: QueryBuilder<T>) => void) {
    if (filter) {
      const nestedKey = relation as string;
      if (!this._filteredPreloads) this._filteredPreloads = new Map();
      const fakeQB = new QueryBuilder<T>(this.table, this.dir, this.exec, this.modelName, this.schema, this.orm);
      filter(fakeQB);
      this._filteredPreloads.set(nestedKey, fakeQB._where.slice());
    }
    this._preloads.push(relation as string);
    return this;
  }

  // ── ILike ────────────────────────────────────────────────────────────────────
  ILike<K extends keyof T>(column: K, value: string) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const paramIndex = this._countParams();
    const clause = dialect.caseInsensitiveLike(String(column), paramIndex);
    this._where.push({ raw: clause, rawParams: [`%${value}%`], kind: "and" });
    return this;
  }

  protected _countParams(): number {
    return this._where.reduce((acc, w) => {
      if (w.kind === "in" || w.kind === "notin") return acc + (w.value?.length ?? 0);
      if (w.kind === "between") return acc + 2;
      if (w.kind === "null" || w.kind === "notnull") return acc;
      if (w.raw) return acc + (w.rawParams?.length ?? (w.value !== undefined ? (Array.isArray(w.value) ? w.value.length : 1) : 0));
      return acc + 1;
    }, 0);
  }

  // ── RELATION TRAVERSAL ───────────────────────────────────────────────────────
  private _resolveRelation(
    modelName: string,
    fieldName: string
  ): { relation: any; targetSchema: any; currentSchema: any } | undefined {
    const currentSchema = this.schema[modelName];
    if (!currentSchema) return undefined;
    const relation = (currentSchema.relations || []).find((r: any) => r.fieldName === fieldName);
    if (!relation) return undefined;
    const targetSchema = this.schema[relation.targetModel];
    if (!targetSchema) return undefined;
    return { relation, targetSchema, currentSchema };
  }

  throughRelation<K extends RelationPath<T>>(path: K) {
    const parts = (path as string).split(".");
    let currentModelName = this.modelName;
    for (const part of parts) {
      const resolved = this._resolveRelation(currentModelName, part);
      if (!resolved) break;
      const { relation, targetSchema, currentSchema } = resolved;
      const foreignKey = relation.foreignKey || relation.meta?.foreignKey || relation.meta?.foreignkey;
      const targetTable = targetSchema.table;
      const currentTable = currentSchema.table;
      const targetPK = targetSchema.primaryKey || "id";
      const currentPK = currentSchema.primaryKey || "id";
      const parentHasFK = currentSchema.fields && foreignKey in currentSchema.fields;
      const clause = parentHasFK
        ? `JOIN ${targetTable} ON ${targetTable}.${targetPK} = ${currentTable}.${foreignKey}`
        : `JOIN ${targetTable} ON ${targetTable}.${foreignKey} = ${currentTable}.${currentPK}`;
      if (!this._joins.includes(clause)) this._joins.push(clause);
      currentModelName = relation.targetModel;
    }
    return this;
  }

  whereRelated<K extends RelationPath<T>>(path: K, column: string, value: any): this {
    this._pendingRelated.push({ path: path as string, column, value });
    return this;
  }

  private async _resolvePendingRelated(): Promise<void> {
    if (!this._pendingRelated.length) return;
    const dialect = Dialects[this.orm?.dialect || "sqlite"];

    for (const pending of this._pendingRelated) {
      const { path, column, value } = pending;
      const op = pending.op ?? "=";
      const parts = path.split(".");
      let currentModelName = this.modelName;

      type Step = {
        targetTable: string; targetPK: string; foreignKey: string;
        parentOwnsFK: boolean; currentTable: string; currentPK: string;
      };
      const steps: Step[] = [];

      for (const part of parts) {
        const resolved = this._resolveRelation(currentModelName, part);
        if (!resolved) break;
        const { relation, targetSchema, currentSchema } = resolved;
        const foreignKey = relation.foreignKey || relation.meta?.foreignKey || relation.meta?.foreignkey;
        steps.push({
          targetTable: targetSchema.table,
          targetPK: targetSchema.primaryKey || "id",
          foreignKey,
          parentOwnsFK: !!(currentSchema.fields && foreignKey in currentSchema.fields),
          currentTable: currentSchema.table,
          currentPK: currentSchema.primaryKey || "id",
        });
        currentModelName = relation.targetModel;
      }

      if (!steps.length) continue;

      const lastStep = steps[steps.length - 1];
      const finalSql = `SELECT ${dialect.quoteIdentifier(lastStep.targetPK)} FROM ${dialect.quoteIdentifier(lastStep.targetTable)} WHERE ${dialect.quoteIdentifier(column)} ${op} ${dialect.formatPlaceholder(0)}`;
      const finalRes = await this.exec(finalSql, [value]);
      let matchingIds: any[] = (finalRes.rows || []).map((r: any) => r[lastStep.targetPK]);

      if (!matchingIds.length) { this._where.push({ raw: "1 = 0", rawParams: [], kind: "and" }); continue; }

      for (let i = steps.length - 1; i >= 1; i--) {
        const step = steps[i];
        const ph = matchingIds.map((_: any, idx: number) => dialect.formatPlaceholder(idx)).join(", ");
        const sql = step.parentOwnsFK
          ? `SELECT ${dialect.quoteIdentifier(step.currentPK)} FROM ${dialect.quoteIdentifier(step.currentTable)} WHERE ${dialect.quoteIdentifier(step.foreignKey)} IN (${ph})`
          : `SELECT ${dialect.quoteIdentifier(step.foreignKey)} FROM ${dialect.quoteIdentifier(step.targetTable)} WHERE ${dialect.quoteIdentifier(step.targetPK)} IN (${ph})`;
        const res = await this.exec(sql, matchingIds);
        matchingIds = Array.from(new Set((res.rows || []).map((r: any) => Object.values(r)[0])));
        if (!matchingIds.length) { this._where.push({ raw: "1 = 0", rawParams: [], kind: "and" }); break; }
      }

      if (!matchingIds.length) continue;

      const firstStep = steps[0];
      const ph = matchingIds.map((_: any, idx: number) => dialect.formatPlaceholder(idx)).join(", ");
      const rootFilterSql = firstStep.parentOwnsFK
        ? `${dialect.quoteIdentifier(this.table)}.${dialect.quoteIdentifier(firstStep.foreignKey)} IN (${ph})`
        : `${dialect.quoteIdentifier(this.table)}.${dialect.quoteIdentifier(firstStep.currentPK)} IN (${ph})`;

      this._where.push({ raw: rootFilterSql, rawParams: matchingIds, kind: "and" });
    }

    this._pendingRelated = [];
  }

  relatedTo(targetModelName: string, column: string, value: any) {
    const queue: { modelName: string; path: string[] }[] = [{ modelName: this.modelName, path: [] }];
    const visited = new Set<string>();
    let foundPath: string[] | null = null;

    while (queue.length) {
      const { modelName, path } = queue.shift()!;
      if (visited.has(modelName)) continue;
      visited.add(modelName);
      if (modelName === targetModelName) { foundPath = path; break; }
      const modelSchema = this.schema[modelName];
      if (!modelSchema) continue;
      for (const relation of modelSchema.relations || []) {
        if (!visited.has(relation.targetModel)) {
          queue.push({ modelName: relation.targetModel, path: [...path, relation.fieldName] });
        }
      }
    }

    if (!foundPath) {
      throw new Error(`relatedTo: no relation path found from "${this.modelName}" to "${targetModelName}"`);
    }

    return this.whereRelated(foundPath.join("."), column, value);
  }

  // ── MongoDB helpers ──────────────────────────────────────────────────────────
  private buildMongoFilter(): Record<string, any> {
    const filter: Record<string, any> = {};
    const orClauses: Record<string, any>[] = [];
    for (const w of this._where) {
      if (w.kind === "or") { const c: Record<string, any> = {}; c[w.column as string] = this._mongoOp(w.op!, w.value); orClauses.push(c); continue; }
      if (w.kind === "null")    { filter[w.column as string] = null; continue; }
      if (w.kind === "notnull") { filter[w.column as string] = { $ne: null }; continue; }
      if (w.kind === "in")      { filter[w.column as string] = { $in: w.value }; continue; }
      if (w.kind === "notin")   { filter[w.column as string] = { $nin: w.value }; continue; }
      if (w.kind === "between") { filter[w.column as string] = { $gte: w.value[0], $lte: w.value[1] }; continue; }
      if (w.raw) continue;
      filter[w.column as string] = this._mongoOp(w.op!, w.value);
    }
    if (orClauses.length) filter["$or"] = orClauses;
    return filter;
  }

  private _mongoOp(op: OpComparison, value: any): any {
    switch (op) {
      case "=": return value;
      case "!=": return { $ne: value };
      case ">": return { $gt: value };
      case ">=": return { $gte: value };
      case "<": return { $lt: value };
      case "<=": return { $lte: value };
      case "LIKE": return { $regex: value.replace(/%/g, ".*"), $options: "i" };
      default: return value;
    }
  }

  // ── SQL builder ──────────────────────────────────────────────────────────────
  protected buildSql(): { sql: string; params: any[] } {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";

    if (isMongo) {
      const mongoCmd = {
        collection: this.table, action: "find",
        filter: this.buildMongoFilter(),
        projection: this._selects?.length ? Object.fromEntries((this._selects as string[]).map((c) => [c, 1])) : undefined,
        sort: this._orderBy.length ? Object.fromEntries(this._orderBy.map((o) => { const [col, dir] = o.split(" "); return [col, dir === "DESC" ? -1 : 1]; })) : undefined,
        limit: this._limit ?? undefined,
        skip: this._offset ?? undefined,
      };
      return { sql: JSON.stringify(mongoCmd), params: [] };
    }

    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    let sql = "SELECT ";

    if (this._selects?.length) {
      sql += (this._selects as string[]).map((c) => dialect.quoteIdentifier(c)).join(", ");
    } else if (this._joins.length) {
      sql += `${dialect.quoteIdentifier(this.table)}.*`;
    } else {
      sql += "*";
    }

    sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");

    const { sql: whereSql, params } = this._buildWhereSql(0);
    if (whereSql) sql += " WHERE " + whereSql;

    if (this._orderBy.length) {
      sql += " ORDER BY " + this._orderBy.map((c) => {
        const [col, dir] = c.split(" ");
        return `${dialect.quoteIdentifier(col)} ${dir || ""}`;
      }).join(", ");
    }

    if (this._limit != null) sql += " LIMIT " + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    if (this._hints.length) {
      const hintStr = this._hints.join(" ");
      sql = sql.replace("SELECT", `SELECT ${hintStr}`);
    }

    return { sql, params };
  }

  protected _buildWhereSql(startIndex = 0): { sql: string; params: any[] } {
    if (!this._where.length) return { sql: "", params: [] };

    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const params: any[] = [];
    let paramIndex = startIndex;
    const parts: string[] = [];

    // quoteRef: handles both plain "col" and dotted "table.col" refs
    const quoteRef = (ref: string): string =>
      ref.split(".").map((part) => dialect.quoteIdentifier(part)).join(".");

    const qualify = (col: string | undefined): string => {
      const c = String(col);
      // Only qualify unambiguous cols (no dot) when joins are present
      if (this._joins.length && !c.includes(".")) return `${this.table}.${c}`;
      return c;
    };

    for (let i = 0; i < this._where.length; i++) {
      const w = this._where[i];
      const connector = i === 0 ? "" : w.kind === "or" ? " OR " : " AND ";

      if (w.kind === "null") {
        parts.push(`${connector}${quoteRef(qualify(w.column))} IS NULL`);
        continue;
      }
      if (w.kind === "notnull") {
        parts.push(`${connector}${quoteRef(qualify(w.column))} IS NOT NULL`);
        continue;
      }
      if (w.kind === "in" || w.kind === "notin") {
        const placeholders = (w.value as any[]).map(() => dialect.formatPlaceholder(paramIndex++));
        params.push(...w.value);
        parts.push(`${connector}${quoteRef(qualify(w.column))} ${w.kind === "in" ? "IN" : "NOT IN"} (${placeholders.join(", ")})`);
        continue;
      }
      if (w.kind === "between") {
        const ph1 = dialect.formatPlaceholder(paramIndex++);
        const ph2 = dialect.formatPlaceholder(paramIndex++);
        params.push(w.value[0], w.value[1]);
        parts.push(`${connector}${quoteRef(qualify(w.column))} BETWEEN ${ph1} AND ${ph2}`);
        continue;
      }
      if (w.raw) {
        // BUG FIX #3 + ILike fix: prefer rawParams if present, fall back to
        // legacy w.value for backward compatibility
        if (w.rawParams && w.rawParams.length > 0) {
          params.push(...w.rawParams);
          paramIndex += w.rawParams.length;
        } else if (w.value !== undefined) {
          if (Array.isArray(w.value)) { params.push(...w.value); paramIndex += w.value.length; }
          else { params.push(w.value); paramIndex++; }
        }
        parts.push(`${connector}${w.raw}`);
        continue;
      }

      const ph = dialect.formatPlaceholder(paramIndex++);
      params.push(w.value);
      // quoteRef correctly handles dotted refs: "users.name" → "users"."name"
      parts.push(`${connector}${quoteRef(qualify(w.column))} ${w.op} ${ph}`);
    }

    return { sql: parts.join(""), params };
  }

  // ── getPaginated ──────────────────────────────────────────────────────────────
  async getPaginated(
    page: number,
    perPage: number
  ): Promise<{ data: T[]; total: number; page: number; lastPage: number }> {
    await this._resolvePendingRelated();
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    let total = 0;

    if (isMongo) {
      const countRes = await this.exec(JSON.stringify({ collection: this.table, action: "count", filter: this.buildMongoFilter() }), []);
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
    return { data, total, page, lastPage: Math.ceil(total / perPage) || 1 };
  }

  cache(key: string, ttlSeconds: number = 300) {
    this._cacheKey = key;
    this._cacheTTL = ttlSeconds;
    return this;
  }

  afterFind(hook: AfterFindHook<T>) {
    this._afterFindHooks.push(hook);
    return this;
  }

  static clearCache() {
    QueryBuilder._resultCache.clear();
  }

  // ── get ───────────────────────────────────────────────────────────────────────
  async get(): Promise<T[]> {
    await this._resolvePendingRelated();

    // Check result cache
    if (this._cacheKey) {
      const cached = QueryBuilder._resultCache.get(this._cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.data as T[];
      }
    }

    if (this._dryRun) {
      const { sql, params } = this.buildSql();
      return { sql, params } as any;
    }

    const { sql, params } = this.buildSql();
    const res = await this.exec(sql, params);
    let rows = (res.rows || []) as T[];

    // Store in cache
    if (this._cacheKey) {
      QueryBuilder._resultCache.set(this._cacheKey, {
        data: rows,
        expires: Date.now() + (this._cacheTTL ?? 300) * 1000,
      });
    }

    if (this._preloads.length) {
      this._preloadCache.clear();
      rows = await this.applyPreloads(rows);
    }

    const schemaFields = this.schema![this.modelName]?.fields ?? {};
    rows = rows.map((r) => this.mapJson(mapBooleans(r, schemaFields), schemaFields)) as T[];

    if (this._exclude.length) {
      rows = rows.map((r) => {
        const copy: Record<string, any> = { ...r };
        for (const col of this._exclude) if (!col.includes(".")) delete copy[col];
        return copy as T;
      });
    }

    // Apply afterFind hooks
    if (this._afterFindHooks.length) {
      for (const hook of this._afterFindHooks) {
        rows = await hook(rows);
      }
    }

    return rows;
  }

  // ── first ─────────────────────────────────────────────────────────────────────
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
            sql = sql.replace(new RegExp(`(?<![A-Za-z0-9_"])${col}(?![A-Za-z0-9_"])`, "g"), quoted);
          }
        }
        this._where.push({ raw: sql, rawParams: [], kind: "and" });
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

  // ── Preload engine ────────────────────────────────────────────────────────────
  private spawnChildBuilder(targetTable: string, targetModelName: string): QueryBuilder<any> {
    const ChildClass = this.constructor as new (
      table: string, dir: string, exec: ExecFn,
      modelName: string, schema: Record<string, any>, orm?: { dialect?: string }
    ) => QueryBuilder<any>;
    return new ChildClass(targetTable, this.dir, this.exec, targetModelName, this.schema, this.orm);
  }

  protected async applyPreloads(rows: any[], visited = new Set<string>()): Promise<any[]> {
    if (!rows.length) return rows;
    const modelSchema = this.schema![this.modelName];
    if (!modelSchema) return rows;

    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const rootPK = modelSchema.primaryKey || "id";

    const relations: RelationMeta[] = (modelSchema.relations || []).map((r: any) => ({
      fieldName: r.fieldName, kind: r.kind, targetModel: r.targetModel,
      foreignKey: r.foreignKey || r.meta?.foreignKey || r.meta?.foreignkey,
      relatedKey: r.relatedKey || r.meta?.relatedKey || r.meta?.relatedkey,
      through: r.through || r.meta?.through,
    }));

    if (!relations.length) return rows;

    const grouped: Record<string, string[]> = {};
    for (const preload of this._preloads) {
      const parts = preload.split(".");
      const root = parts.shift()!;
      if (!grouped[root]) grouped[root] = [];
      if (parts.length) grouped[root].push(parts.join("."));
    }

    const hasValues = (arr: any[]) => Array.isArray(arr) && arr.length > 0;

    const buildWhereClauseForPreload = (fieldName: string, targetTable: string): { sql: string; params: any[] } => {
      const filterWheres = this._filteredPreloads?.get(fieldName);
      if (!filterWheres?.length) return { sql: "", params: [] };
      const origWhere = this._where;
      this._where = filterWheres;
      const result = this._buildWhereSql(0);
      let sql = result.sql;
      for (const w of filterWheres) {
        if (w.column && !w.column.includes(".")) {
          sql = sql.replace(new RegExp(`\\b${w.column}\\b`, "g"), `${targetTable}.${w.column}`);
        }
      }
      this._where = origWhere;
      return { sql: sql ? ` AND (${sql})` : "", params: result.params };
    };

    const mongoFetch = async (targetTable: string, filter: Record<string, any>) =>
      (await this.exec(JSON.stringify({ collection: targetTable, action: "find", filter }), [])).rows || [];

    const sqlFetch = async (targetTable: string, colName: string, ids: any[], fieldName?: string) => {
      const fc = fieldName ? buildWhereClauseForPreload(fieldName, targetTable) : { sql: "", params: [] };
      const cacheKey = `${targetTable}:${colName}:${[...ids].sort().join(",")}:${fc.sql}`;
      if (this._preloadCache.has(cacheKey)) return this._preloadCache.get(cacheKey)!;
      const ph = ids.map((_, i) => dialect.formatPlaceholder(i)).join(", ");
      const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetTable)} WHERE ${dialect.quoteIdentifier(colName)} IN (${ph})${fc.sql}`;
      const params = ids.concat(fc.params);
      const result = (await this.exec(sql, params)).rows || [];
      this._preloadCache.set(cacheKey, result);
      return result;
    };

    const manyToManyJoinFetchWithFilter = async (
      through: string, targetTable: string, targetPK: string,
      foreignKey: string, relatedKey: string, parentIds: any[],
      fieldName?: string
    ) => {
      const fc = fieldName ? buildWhereClauseForPreload(fieldName, targetTable) : { sql: "", params: [] };
      if (isMongo) {
        const junction = await mongoFetch(through, { [foreignKey]: { $in: parentIds } });
        const targetIds = Array.from(new Set(junction.map((j) => j[relatedKey])));
        if (!hasValues(targetIds)) return { junctionRows: [], relatedRows: [] };
        return { junctionRows: junction, relatedRows: await mongoFetch(targetTable, { [targetPK]: { $in: targetIds }, ...(fc.sql ? {} : {}) }) };
      }
      const ph = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(", ");
      const sql =
        `SELECT ${dialect.quoteIdentifier(targetTable)}.*, ` +
        `${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} AS __pivot_fk ` +
        `FROM ${dialect.quoteIdentifier(targetTable)} ` +
        `INNER JOIN ${dialect.quoteIdentifier(through)} ` +
        `ON ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(relatedKey)} = ` +
        `${dialect.quoteIdentifier(targetTable)}.${dialect.quoteIdentifier(targetPK)} ` +
        `WHERE ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} IN (${ph})${fc.sql}`;
      const rows = (await this.exec(sql, parentIds.concat(fc.params))).rows || [];
      const junctionRows = rows.map((r: any) => ({ [foreignKey]: r.__pivot_fk, [relatedKey]: r[targetPK] }));
      const relatedRows = rows.map((r: any) => { const c = { ...r }; delete c.__pivot_fk; return c; });
      return { junctionRows, relatedRows };
    };

    const manyToManyJoinFetch = async (
      through: string, targetTable: string, targetPK: string,
      foreignKey: string, relatedKey: string, parentIds: any[]
    ) => {
      if (isMongo) {
        const junction = await mongoFetch(through, { [foreignKey]: { $in: parentIds } });
        const targetIds = Array.from(new Set(junction.map((j) => j[relatedKey])));
        if (!hasValues(targetIds)) return { junctionRows: [], relatedRows: [] };
        return { junctionRows: junction, relatedRows: await mongoFetch(targetTable, { [targetPK]: { $in: targetIds } }) };
      }
      const ph = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(", ");
      const sql =
        `SELECT ${dialect.quoteIdentifier(targetTable)}.*, ` +
        `${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} AS __pivot_fk ` +
        `FROM ${dialect.quoteIdentifier(targetTable)} ` +
        `INNER JOIN ${dialect.quoteIdentifier(through)} ` +
        `ON ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(relatedKey)} = ` +
        `${dialect.quoteIdentifier(targetTable)}.${dialect.quoteIdentifier(targetPK)} ` +
        `WHERE ${dialect.quoteIdentifier(through)}.${dialect.quoteIdentifier(foreignKey)} IN (${ph})`;
      const rows = (await this.exec(sql, parentIds)).rows || [];
      const junctionRows = rows.map((r: any) => ({ [foreignKey]: r.__pivot_fk, [relatedKey]: r[targetPK] }));
      const relatedRows = rows.map((r: any) => { const c = { ...r }; delete c.__pivot_fk; return c; });
      return { junctionRows, relatedRows };
    };

    const fetchRelation = async (relation: RelationMeta, parentRows: any[]) => {
      const cycleKey = `${this.modelName}:${relation.fieldName}`;
      if (visited.has(cycleKey)) return [];
      visited.add(cycleKey);

      const targetSchema = this.schema![relation.targetModel];
      if (!targetSchema) return [];
      const targetPK = targetSchema.primaryKey || "id";
      const { kind, through } = relation;
      const foreignKey = relation.foreignKey as string;
      const relatedKey = relation.relatedKey as string;
      let relatedRows: any[] = [];
      const filterClause = buildWhereClauseForPreload(relation.fieldName, targetSchema.table);

      if (kind === "onetomany") {
        const parentIds = Array.from(new Set(parentRows.map((r) => r[rootPK]).filter(Boolean)));
        if (!hasValues(parentIds)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }
        relatedRows = isMongo
          ? await mongoFetch(targetSchema.table, { [foreignKey]: { $in: parentIds } })
          : await sqlFetch(targetSchema.table, foreignKey, parentIds, relation.fieldName);
        relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
        const map = new Map<any, any[]>();
        relatedRows.forEach((r) => { const k = r[foreignKey]; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
        parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || []));

      } else if (kind === "manytoone") {
        const fkValues = Array.from(new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean)));
        if (!hasValues(fkValues)) { parentRows.forEach((r) => (r[relation.fieldName] = null)); return []; }
        relatedRows = isMongo
          ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
          : await sqlFetch(targetSchema.table, targetPK, fkValues, relation.fieldName);
        relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
        const map = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
        parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[foreignKey]) || null));

      } else if (kind === "onetoone") {
        const parentHasFK = parentRows.some((r) => Object.prototype.hasOwnProperty.call(r, foreignKey));
        if (!parentHasFK) {
          const parentIds = Array.from(new Set(parentRows.map((r) => r[rootPK]).filter(Boolean)));
          if (!hasValues(parentIds)) { parentRows.forEach((r) => (r[relation.fieldName] = null)); return []; }
          relatedRows = isMongo
            ? await mongoFetch(targetSchema.table, { [foreignKey]: { $in: parentIds } })
            : await sqlFetch(targetSchema.table, foreignKey, parentIds, relation.fieldName);
          relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
          const map = new Map(relatedRows.map((r) => [r[foreignKey] as PropertyKey, r]));
          parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || null));
        } else {
          const fkValues = Array.from(new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean)));
          if (!hasValues(fkValues)) { parentRows.forEach((r) => (r[relation.fieldName] = null)); return []; }
          relatedRows = isMongo
            ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
            : await sqlFetch(targetSchema.table, targetPK, fkValues, relation.fieldName);
          relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
          const map = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
          parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[foreignKey]) || null));
        }

      } else if (kind === "manytomany") {
        if (!through || !foreignKey || !relatedKey) return [];
        const parentIds = Array.from(new Set(parentRows.map((r) => r[rootPK]).filter(Boolean)));
        if (!hasValues(parentIds)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }
        const { junctionRows, relatedRows: fetchedRows } = await manyToManyJoinFetchWithFilter(through, targetSchema.table, targetPK, foreignKey, relatedKey, parentIds, relation.fieldName);
        if (!hasValues(fetchedRows)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }
        relatedRows = fetchedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
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
        child._exclude = this._nestedExcludes(relation.fieldName);
        if ("_withTrashed" in this) (child as any)._withTrashed = (this as any)._withTrashed;
        if ("_onlyTrashed" in this) (child as any)._onlyTrashed = (this as any)._onlyTrashed;
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

  // ── Utilities ─────────────────────────────────────────────────────────────────
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

  async countDistinct(column: keyof T & string): Promise<number> {
    await this._resolvePendingRelated();
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const { sql: whereSql, params } = this._buildWhereSql(0);
    let sql = `SELECT COUNT(DISTINCT ${dialect.quoteIdentifier(String(column))}) as count FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");
    if (whereSql) sql += " WHERE " + whereSql;
    const res = await this.exec(sql, params);
    return parseInt(res.rows?.[0]?.count ?? "0", 10);
  }

  removeExcluded(obj: any, excludes: string[]): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.removeExcluded(item, excludes));
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const nested = excludes.filter((e) => e.startsWith(key + ".")).map((e) => e.slice(key.length + 1));
      if (excludes.includes(key)) continue;
      const val = obj[key];
      if (Array.isArray(val)) result[key] = val.map((v) => this.removeExcluded(v, nested));
      else if (val && typeof val === "object") result[key] = this.removeExcluded(val, nested);
      else result[key] = val;
    }
    return result;
  }

  private applyExcludes(row: any) {
    if (!this._exclude.length) return row;
    const copy = { ...row };
    for (const f of this._exclude) if (!f.includes(".")) delete copy[f];
    return copy;
  }

  private _nestedExcludes(root: string): string[] {
    return this._exclude
      .filter((f) => typeof f === "string" && f.startsWith(root + "."))
      .map((f) => f.slice(root.length + 1));
  }
}
