// queryBuilder.ts
import type { ExecFn, OpComparison } from "./types.ts";
import path from "path";
import fs from "fs";

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
};

type PreloadPath<T> =
  | (keyof T & string)
  | `${Extract<keyof T, string>}.${string}`;

type WhereCondition<T> =
  | Partial<T>
  | {
      [K in keyof T]?: { op: OpComparison; value: T[K] };
    };

export class QueryBuilder<T extends Record<string, any>> {
  protected _selects: (keyof T | string)[] | null = null;
  protected _where: {
    raw?: string;
    column?: keyof T | string;
    op?: OpComparison;
    value?: any;
  }[] = [];
  protected _orderBy: string[] = [];
  protected _limit: number | null = null;
  protected _offset: number | null = null;
  protected _joins: string[] = [];
  protected _preloads: string[] = [];
  // store excludes as strings internally for simplicity
  protected _exclude: string[] = [];

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
    if (!dir) {
      throw new Error("QueryBuilder requires a valid directory for schema.");
    }

    this.table = table;
    this.exec = exec;
    this.orm = orm;
    this.dir = dir;
    this.schema = schema;
    this.modelName = modelName;
    if (!schema) {
      throw new Error("Schema not found");
    }
    if (!this.modelName) {
      throw new Error("modelName not found");
    }
  }

  private normalizeModelName(name: string, explicit?: string) {
    if (explicit && this.schema[explicit]) return explicit;

    const normalized = name[0].toUpperCase() + name.slice(1);
    if (this.schema[normalized]) return normalized;

    const singular = normalized.endsWith("s")
      ? normalized.slice(0, -1)
      : normalized;
    if (this.schema[singular]) return singular;
    console.log("model name: ", normalized);
    console.log("model explicit: ", explicit);
    console.log("model normalized: ", normalized);

    return normalized;
  }

  /**
   * Select columns to fetch.
   * @template K - Keys of the table
   * @param cols - Columns to select
   * @returns The current builder instance
   * @example
   * builder.select("id", "name").get();
   */
  select<K extends keyof T>(...cols: K[]) {
    this._selects = cols as (keyof T | string)[];
    return this;
  }

  /**
   * Add a WHERE condition.
   * @param column - Column name
   * @param op - Comparison operator (e.g., '=', '>', '<')
   * @param value - Value to compare
   * @returns The current builder instance
   * @example
   * builder.where("age", ">", 18).get();
   */
  where<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value });
    return this;
  }

  /**
   * Add raw SQL WHERE clause.
   * @param sql - Raw SQL string
   * @returns The current builder instance
   * @example
   * builder.whereRaw("age > 18 AND active = true").get();
   */
  whereRaw(sql: string) {
    this._where.push({ raw: sql });
    return this;
  }

  /**
   * Add ORDER BY clause.
   * @param column - Column name
   * @param dir - Direction: "asc" (default) or "desc"
   * @returns The current builder instance
   * @example
   * builder.orderBy("created_at", "desc").get();
   */
  orderBy<K extends keyof T>(column: K, dir: "asc" | "desc" = "asc") {
    this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
    return this;
  }

  /**
   * Limit number of rows returned.
   * @param n - Number of rows
   * @returns The current builder instance
   * @example
   * builder.limit(10).get();
   */
  limit(n: number) {
    this._limit = n;
    return this;
  }

  /**
   * Skip a number of rows (for pagination).
   * @param n - Number of rows to skip
   * @returns The current builder instance
   * @example
   * builder.offset(20).get();
   */
  offset(n: number) {
    this._offset = n;
    return this;
  }

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
  join(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

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
  leftJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  /**
   * Exclude columns from results (top-level only).
   * @param columns - Columns to exclude, can be dotted strings
   * @returns The current builder instance
   * @example
   * builder.exclude("password", "profile.secret").get();
   */
  exclude(...columns: (keyof T | `${string}.${string}`)[]) {
    this._exclude.push(...columns.map((c) => String(c)));
    return this;
  }

  /**
   * Preload relations for eager loading.
   * @param relation - Relation path
   * @returns The current builder instance
   * @example
   * builder.preload("posts").get();
   */
  preload<K extends PreloadPath<T>>(relation: K) {
    this._preloads.push(relation as string);
    return this;
  }

  /**
   * Case-insensitive LIKE search (ILike).
   * @param column - Column to search
   * @param value - Value to match
   * @returns The current builder instance
   * @example
   * builder.ILike("name", "john").get();
   */
  ILike<K extends keyof T>(column: K, value: string) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const clause = dialect.caseInsensitiveLike(
      String(column),
      this._where.length
    );
    const val = `%${value}%`;
    this._where.push({ raw: clause, value: val });
    return this;
  }

  /**
   * Build the SQL query string and parameters.
   * @returns Object with `sql` and `params`
   * @example
   * const { sql, params } = builder.buildSql();
   */
  protected buildSql() {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    let sql = "SELECT ";
    sql += this._selects?.length
      ? (this._selects as string[])
          .map((c) => dialect.quoteIdentifier(c))
          .join(", ")
      : "*";
    sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");

    const params: any[] = [];
    let paramIndex = 0;

    if (this._where.length) {
      sql +=
        " WHERE " +
        this._where
          .map((w) => {
            if (w.raw) {
              if (w.value !== undefined) params.push(w.value);
              return w.raw;
            }
            params.push(w.value);
            const placeholder = dialect.formatPlaceholder(paramIndex);
            paramIndex++;
            return `${dialect.quoteIdentifier(String(w.column))} ${
              w.op
            } ${placeholder}`;
          })
          .join(" AND ");
    }

    if (this._orderBy.length) {
      sql +=
        " ORDER BY " +
        this._orderBy
          .map((c) => {
            const [col, dir] = c.split(" ");
            return `${dialect.quoteIdentifier(col)} ${dir || ""}`;
          })
          .join(", ");
    }

    if (this._limit != null) sql += " LIMIT " + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    return { sql, params };
  }

  /**
   * Execute the query and return rows.
   * Applies preloads and excludes.
   * @returns Promise resolving to array of rows
   * @example
   * const users = await builder.get();
   */
  async get(): Promise<T[]> {
    const { sql, params } = this.buildSql();
    const res = await this.exec(sql, params);
    let rows = (res.rows || []) as T[];

    if (this._preloads.length) {
      rows = await this.applyPreloads(rows);
    }

    const schemaFields = this.schema![this.modelName].fields;
    rows = rows.map((r) => mapBooleans(r, schemaFields));

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

  /**
   * Fetch the first row matching a condition.
   * @param condition - Optional WHERE condition as object or raw SQL string
   * @returns Promise resolving to a single row or null
   * @example
   * const user = await builder.first({ id: 1 });
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
              new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`, "g"),
              quoted
            );
          }
        }
        this._where.push({ raw: sql });
      }

      if (typeof condition === "object") {
        for (const key of Object.keys(condition) as (keyof T)[]) {
          const val = (condition as any)[key];
          if (val !== null && typeof val !== "object") {
            this.where(key as any, "=", val as T[keyof T]);
          } else if (
            val &&
            typeof val === "object" &&
            "op" in val &&
            "value" in val
          ) {
            this.where(
              key as any,
              (val as any).op as OpComparison,
              (val as any).value
            );
          }
        }
      }
    }

    if (!this._limit) this.limit(1);
    const rows = await this.get();
    return rows[0] || null;
  }

  // add this helper inside the QueryBuilder class (near other helpers)
  private cleanRow(row: any, targetSchema: any, root?: string) {
    // convert booleans
    let clean = mapBooleans(row, targetSchema.fields || {});
    // apply nested excludes for this relation (e.g., "user.profile.email")
    if (root) {
      const nestedExcludes = this._nestedExcludes(root);
      if (nestedExcludes.length)
        clean = this.removeExcluded(clean, nestedExcludes);
    }
    return clean;
  }

 // ---------------------------
// applyPreloads (handles nested & circular)
// ---------------------------
private async applyPreloads(
  rows: any[],
  visited = new Set<string>()
): Promise<any[]> {
  if (!rows.length) return rows;

  const modelSchema = this.schema![this.modelName];
  if (!modelSchema) return rows;

  const dialect = Dialects[this.orm?.dialect || "sqlite"];
  const rootPK = modelSchema.primaryKey;

  // Build relation metadata
  const relations: RelationMeta[] = modelSchema.relations.map((r: any) => ({
    fieldName: r.fieldName,
    kind: r.kind,
    targetModel: r.targetModel,
    foreignKey: r.foreignKey,
    relatedKey: r.relatedKey,
    through: r.through,
  }));

  if (!relations.length) return rows;

  // Group nested preloads
  const grouped: Record<string, string[]> = {};
  for (const preload of this._preloads) {
    const parts = preload.split(".");
    const root = parts.shift()!;
    if (!grouped[root]) grouped[root] = [];
    if (parts.length) grouped[root].push(parts.join("."));
  }

  const hasValues = (arr: any[]) => Array.isArray(arr) && arr.length > 0;

  const fetchRelation = async (relation: RelationMeta, parentRows: any[]) => {
    const cycleKey = `${this.modelName}:${relation.fieldName}`;
    if (visited.has(cycleKey)) return [];
    visited.add(cycleKey);

    const targetSchema = this.schema![relation.targetModel];
    if (!targetSchema) return [];

    const targetPK = targetSchema.primaryKey || "id";
    const { kind, foreignKey, relatedKey, through } = relation;

    const parentIds = Array.from(
      new Set(parentRows.map((r) => r[rootPK]).filter(Boolean))
    );
    if (!hasValues(parentIds)) {
      parentRows.forEach(
        (r) => (r[relation.fieldName] = kind.includes("many") ? [] : null)
      );
      return [];
    }

    let relatedRows: any[] = [];

    if (kind === "onetomany") {
      const ph = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const sql = `SELECT * FROM ${dialect.quoteIdentifier(
        targetSchema.table
      )} WHERE ${dialect.quoteIdentifier(foreignKey!)} IN (${ph})`;
      relatedRows = (await this.exec(sql, parentIds)).rows || [];

      const map = new Map<number, any[]>();
      relatedRows.forEach((r) => {
        const key = r[foreignKey!];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
      });
      parentRows.forEach(
        (r) => (r[relation.fieldName] = map.get(r[rootPK]) || [])
      );
    } else if (kind === "onetoone") {
      const parentIdsList = Array.from(
        new Set(parentRows.map((r) => r[rootPK]).filter(Boolean))
      );
      if (!hasValues(parentIdsList)) {
        parentRows.forEach((r) => (r[relation.fieldName] = null));
        return [];
      }

      const parentHasFK = parentRows.some((r) => r.hasOwnProperty(foreignKey));

      // Reverse lookup (child holds FK: child.fk = parent.id)
      if (!parentHasFK) {
        const ph = parentIdsList.map((_, i) => dialect.formatPlaceholder(i)).join(",");
        const sql = `SELECT * FROM ${dialect.quoteIdentifier(
          targetSchema.table
        )} WHERE ${dialect.quoteIdentifier(foreignKey!)} IN (${ph})`;

        relatedRows = (await this.exec(sql, parentIdsList)).rows || [];
        const map = new Map(relatedRows.map((r) => [r[foreignKey!], r]));

        parentRows.forEach((r) => {
          r[relation.fieldName] = map.get(r[rootPK]) || null;
        });

        return relatedRows;
      }

      // Forward lookup (parent has FK: parent.fk = child.id)
      const fkValues = Array.from(
        new Set(parentRows.map((r) => r[foreignKey!]).filter(Boolean))
      );
      if (!hasValues(fkValues)) {
        parentRows.forEach((r) => (r[relation.fieldName] = null));
        return [];
      }

      const ph = fkValues.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const sql = `SELECT * FROM ${dialect.quoteIdentifier(
        targetSchema.table
      )} WHERE ${dialect.quoteIdentifier(targetPK)} IN (${ph})`;

      relatedRows = (await this.exec(sql, fkValues)).rows || [];
      const map = new Map(relatedRows.map((r) => [r[targetPK], r]));

      parentRows.forEach((r) => {
        r[relation.fieldName] = map.get(r[foreignKey!]) || null;
      });

      return relatedRows;
    } else if (kind === "manytomany") {
      if (!through || !foreignKey || !relatedKey) return [];
      const ph = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const junctionSql = `SELECT * FROM ${dialect.quoteIdentifier(
        through
      )} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${ph})`;
      const junction = (await this.exec(junctionSql, parentIds)).rows || [];

      const targetIds = [...new Set(junction.map((j) => j[relatedKey]))];
      if (!hasValues(targetIds)) {
        parentRows.forEach((r) => (r[relation.fieldName] = []));
        return [];
      }

      const tph = targetIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const tSql = `SELECT * FROM ${dialect.quoteIdentifier(
        targetSchema.table
      )} WHERE ${dialect.quoteIdentifier(targetPK)} IN (${tph})`;
      relatedRows = (await this.exec(tSql, targetIds)).rows || [];

      const targetMap = new Map(relatedRows.map((r) => [r[targetPK], r]));
      const parentMap = new Map<number, any[]>();
      junction.forEach((j) => {
        const arr = parentMap.get(j[foreignKey]) || [];
        if (targetMap.has(j[relatedKey])) arr.push(targetMap.get(j[relatedKey]));
        parentMap.set(j[foreignKey], arr);
      });
      parentRows.forEach(
        (r) => (r[relation.fieldName] = parentMap.get(r[rootPK]) || [])
      );
    }

    // Nested preloads
    const nested = grouped[relation.fieldName];
    if (nested.length && hasValues(relatedRows)) {
      const qb = new QueryBuilder(
        targetSchema.table,
        this.dir,
        this.exec,
        relation.targetModel,
        this.schema,
        this.orm
      );
      qb._preloads = nested;
      qb._exclude = this._nestedExcludes(relation.fieldName);
      await qb.applyPreloads(relatedRows, visited); // pass visited!
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


  // recursive removeExcluded that handles nested dot-path excludes (["password", "profile.email", ...])
  removeExcluded(obj: any, excludes: string[]): any {
    if (!obj || typeof obj !== "object") return obj;
    // If obj is an array, map individually
    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeExcluded(item, excludes));
    }

    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      // build nested excludes for this key (e.g., "profile.email" => nested ["email"])
      const nested = excludes
        .filter((e) => e.startsWith(key + "."))
        .map((e) => e.slice(key.length + 1));

      // if key itself is excluded at this level, skip it
      if (excludes.includes(key)) continue;

      const val = obj[key];
      if (Array.isArray(val)) {
        result[key] = val.map((v) => this.removeExcluded(v, nested));
      } else if (val && typeof val === "object") {
        result[key] = this.removeExcluded(val, nested);
      } else {
        result[key] = val;
      }
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
