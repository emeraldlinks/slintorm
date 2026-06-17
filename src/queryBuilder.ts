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
    kind?: "and" | "or" | "in" | "notin" | "null" | "notnull" | "between";
  }[] = [];
  protected _orderBy: string[] = [];
  protected _limit: number | null = null;
  protected _offset: number | null = null;
  protected _joins: string[] = [];
  protected _preloads: string[] = [];
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

  private normalizeModelName(name: string, explicit?: string) {
    if (explicit && this.schema[explicit]) return explicit;
    const normalized = name[0].toUpperCase() + name.slice(1);
    if (this.schema[normalized]) return normalized;
    const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
    if (this.schema[singular]) return singular;
    return normalized;
  }

  select<K extends keyof T>(...cols: K[]) {
    this._selects = cols as (keyof T | string)[];
    return this;
  }

  where<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value, kind: "and" });
    return this;
  }

  orWhere<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value, kind: "or" });
    return this;
  }

  whereRaw(sql: string) {
    this._where.push({ raw: sql, kind: "and" });
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

  orderBy<K extends keyof T>(column: K, dir: "asc" | "desc" = "asc") {
    this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  offset(n: number) {
    this._offset = n;
    return this;
  }

  paginate(page: number, perPage: number) {
    this._limit = perPage;
    this._offset = (page - 1) * perPage;
    return this;
  }

  join(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  leftJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  exclude(...columns: (keyof T | `${string}.${string}`)[]) {
    this._exclude.push(...columns.map((c) => String(c)));
    return this;
  }

  preload<K extends PreloadPath<T>>(relation: K) {
    this._preloads.push(relation as string);
    return this;
  }

  ILike<K extends keyof T>(column: K, value: string) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    // count params already accumulated so placeholder index is correct
    const paramIndex = this._where.reduce((acc, w) => {
      if (w.kind === "in" || w.kind === "notin" || w.kind === "between") return acc + (w.value?.length ?? 0);
      if (w.raw && w.value !== undefined) return acc + (Array.isArray(w.value) ? w.value.length : 1);
      if (w.kind === "null" || w.kind === "notnull") return acc;
      return acc + 1;
    }, 0);
    const clause = dialect.caseInsensitiveLike(String(column), paramIndex);
    this._where.push({ raw: clause, value: `%${value}%`, kind: "and" });
    return this;
  }

  // ---- MongoDB filter builder ----
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
      if (w.kind === "null") { filter[w.column as string] = null; continue; }
      if (w.kind === "notnull") { filter[w.column as string] = { $ne: null }; continue; }
      if (w.kind === "in") { filter[w.column as string] = { $in: w.value }; continue; }
      if (w.kind === "notin") { filter[w.column as string] = { $nin: w.value }; continue; }
      if (w.kind === "between") { filter[w.column as string] = { $gte: w.value[0], $lte: w.value[1] }; continue; }
      if (w.raw) {
        // raw not supported in mongo filter — skip silently
        continue;
      }
      filter[w.column as string] = this._mongoOp(w.op!, w.value);
    }

    if (orClauses.length) {
      filter["$or"] = orClauses;
    }

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

  protected buildSql(): { sql: string; params: any[] } {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    if (isMongo) {
      // Return a serialised command the exec shim understands
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

    const params: any[] = [];
    let paramIndex = 0;

    if (this._where.length) {
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
          const placeholders = (w.value as any[]).map(() => {
            const ph = dialect.formatPlaceholder(paramIndex++);
            return ph;
          });
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
      sql += " WHERE " + parts.join("");
    }

    if (this._orderBy.length) {
      sql += " ORDER BY " + this._orderBy.map((c) => {
        const [col, dir] = c.split(" ");
        return `${dialect.quoteIdentifier(col)} ${dir || ""}`;
      }).join(", ");
    }

    if (this._limit != null) sql += " LIMIT " + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    return { sql, params };
  }

  async getPaginated(page: number, perPage: number): Promise<{ data: T[]; total: number; page: number; lastPage: number }> {
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";

    let total = 0;
    if (isMongo) {
      const countCmd = JSON.stringify({ collection: this.table, action: "count", filter: this.buildMongoFilter() });
      const countRes = await this.exec(countCmd, []);
      total = countRes.rows?.[0]?.count ?? 0;
    } else {
      const dialect = Dialects[this.orm?.dialect || "sqlite"];
      const { params } = this.buildSql();
      // Build WHERE-only sql for count
      let countSql = `SELECT COUNT(*) as count FROM ${dialect.quoteIdentifier(this.table)}`;
      const whereClauses = this._buildWhereOnly();
      if (whereClauses.sql) countSql += " WHERE " + whereClauses.sql;
      const countRes = await this.exec(countSql, whereClauses.params);
      total = parseInt(countRes.rows?.[0]?.count ?? "0", 10);
    }

    this.paginate(page, perPage);
    const data = await this.get();
    const lastPage = Math.ceil(total / perPage);
    return { data, total, page, lastPage };
  }

  private _buildWhereOnly(): { sql: string; params: any[] } {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const params: any[] = [];
    let paramIndex = 0;
    if (!this._where.length) return { sql: "", params: [] };

    const parts: string[] = [];
    for (let i = 0; i < this._where.length; i++) {
      const w = this._where[i];
      const connector = i === 0 ? "" : w.kind === "or" ? " OR " : " AND ";
      if (w.kind === "null") { parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} IS NULL`); continue; }
      if (w.kind === "notnull") { parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} IS NOT NULL`); continue; }
      if (w.kind === "in" || w.kind === "notin") {
        const phs = (w.value as any[]).map(() => dialect.formatPlaceholder(paramIndex++));
        params.push(...w.value);
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} ${w.kind === "in" ? "IN" : "NOT IN"} (${phs.join(", ")})`);
        continue;
      }
      if (w.kind === "between") {
        params.push(w.value[0], w.value[1]);
        parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} BETWEEN ${dialect.formatPlaceholder(paramIndex++)} AND ${dialect.formatPlaceholder(paramIndex++)}`);
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
      params.push(w.value);
      parts.push(`${connector}${dialect.quoteIdentifier(String(w.column))} ${w.op} ${dialect.formatPlaceholder(paramIndex++)}`);
    }
    return { sql: parts.join(""), params };
  }

  async get(): Promise<T[]> {
    const { sql, params } = this.buildSql();
    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";

    let rows: T[];
    if (isMongo) {
      const res = await this.exec(sql, params);
      rows = (res.rows || []) as T[];
    } else {
      const res = await this.exec(sql, params);
      rows = (res.rows || []) as T[];
    }

    if (this._preloads.length) rows = await this.applyPreloads(rows);

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
            sql = sql.replace(new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`, "g"), quoted);
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
      const fieldMeta = schemaFields[key]?.meta;
      if (fieldMeta?.json && typeof out[key] === "string") {
        try { out[key] = JSON.parse(out[key]); } catch {}
      }
    }
    return out;
  }

  private async applyPreloads(rows: any[], visited = new Set<string>()): Promise<any[]> {
    if (!rows.length) return rows;
    const modelSchema = this.schema![this.modelName];
    if (!modelSchema) return rows;

    const isMongo = (this.orm?.dialect || "sqlite") === "mongodb";
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const rootPK = modelSchema.primaryKey;

    const relations: RelationMeta[] = modelSchema.relations.map((r: any) => ({
      fieldName: r.fieldName,
      kind: r.kind,
      targetModel: r.targetModel,
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

    const mongoFetch = async (targetTable: string, filter: Record<string, any>) => {
      const cmd = JSON.stringify({ collection: targetTable, action: "find", filter });
      return (await this.exec(cmd, [])).rows || [];
    };

    const sqlFetch = async (targetTable: string, colName: string, ids: any[]) => {
      const ph = ids.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetTable)} WHERE ${dialect.quoteIdentifier(colName)} IN (${ph})`;
      return (await this.exec(sql, ids)).rows || [];
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

  if (kind === "onetomany") {
    const parentIds = Array.from(new Set(parentRows.map((r) => r[rootPK]).filter(Boolean)));
    if (!hasValues(parentIds)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }

    relatedRows = isMongo
      ? await mongoFetch(targetSchema.table, { [foreignKey]: { $in: parentIds } })
      : await sqlFetch(targetSchema.table, foreignKey, parentIds);

    relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
    const map = new Map<any, any[]>();
    relatedRows.forEach((r) => {
      const key = r[foreignKey];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || []));

  } else if (kind === "manytoone") {
    const fkValues = Array.from(new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean)));
    if (!hasValues(fkValues)) { parentRows.forEach((r) => (r[relation.fieldName] = null)); return []; }

    relatedRows = isMongo
      ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
      : await sqlFetch(targetSchema.table, targetPK, fkValues);

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
        : await sqlFetch(targetSchema.table, foreignKey, parentIds);

      relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
      const map = new Map(relatedRows.map((r) => [r[foreignKey] as PropertyKey, r]));
      parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[rootPK]) || null));
    } else {
      const fkValues = Array.from(new Set(parentRows.map((r) => r[foreignKey]).filter(Boolean)));
      if (!hasValues(fkValues)) { parentRows.forEach((r) => (r[relation.fieldName] = null)); return []; }

      relatedRows = isMongo
        ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: fkValues } })
        : await sqlFetch(targetSchema.table, targetPK, fkValues);

      relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
      const map = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
      parentRows.forEach((r) => (r[relation.fieldName] = map.get(r[foreignKey]) || null));
    }

  } else if (kind === "manytomany") {
    if (!through || !foreignKey || !relatedKey) return [];

    const parentIds = Array.from(new Set(parentRows.map((r) => r[rootPK]).filter(Boolean)));
    if (!hasValues(parentIds)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }

    let junction: any[] = [];
    if (isMongo) {
      junction = await mongoFetch(through, { [foreignKey]: { $in: parentIds } });
    } else {
      const ph = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
      const jSql = `SELECT * FROM ${dialect.quoteIdentifier(through)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${ph})`;
      junction = (await this.exec(jSql, parentIds)).rows || [];
    }

    const targetIds = [...new Set(junction.map((j) => j[relatedKey]))];
    if (!hasValues(targetIds)) { parentRows.forEach((r) => (r[relation.fieldName] = [])); return []; }

    relatedRows = isMongo
      ? await mongoFetch(targetSchema.table, { [targetPK]: { $in: targetIds } })
      : await sqlFetch(targetSchema.table, targetPK, targetIds);

    relatedRows = relatedRows.map((r) => this.cleanRow(r, targetSchema, relation.fieldName));
    const targetMap = new Map(relatedRows.map((r) => [r[targetPK] as PropertyKey, r]));
    const parentMap = new Map<any, any[]>();
    junction.forEach((j) => {
      const arr = parentMap.get(j[foreignKey]) || [];
      if (targetMap.has(j[relatedKey])) arr.push(targetMap.get(j[relatedKey]));
      parentMap.set(j[foreignKey], arr);
    });
    parentRows.forEach((r) => (r[relation.fieldName] = parentMap.get(r[rootPK]) || []));
  }

  const nested = grouped[relation.fieldName];
  if (nested?.length && hasValues(relatedRows)) {
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
    await qb.applyPreloads(relatedRows, visited);
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