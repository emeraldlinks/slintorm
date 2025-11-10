import type { ExecFn, OpComparison } from "./types.ts";
import path from "path";
import fs from "fs";

type RelationMeta = {
  fieldName: string;
  kind: "onetomany" | "manytoone" | "onetoone" | "manytomany";
  targetModel: string;
  foreignKey?: string;   // optional for manytomany
  relatedKey?: string;   // only for manytomany
  through?: string;      // only for manytomany
};


let schemaCache: Record<string, any> | null = null;

function getSchema() {
  if (!schemaCache) {
    const schemaPath = path.join(process.cwd(), "schema", "generated.json");
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }
    schemaCache = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  }
  return schemaCache!;
}

type DialectAdapter = {
  formatPlaceholder: (index: number) => string;
  caseInsensitiveLike: (column: string, index: number) => string;
  quoteIdentifier: (name: string) => string;
};

const Dialects: Record<string, DialectAdapter> = {
  sqlite: {
    formatPlaceholder: (i) => "?",
    caseInsensitiveLike: (col) => `LOWER(${col}) LIKE LOWER(?)`,
    quoteIdentifier: (n) => `"${n}"`, // ✅ use double quotes too, safe for sqlite
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

export class QueryBuilder<T extends Record<string, any>> {
  private _selects: (keyof T | string)[] | null = null;
  private _where: { raw?: string; column?: keyof T | string; op?: OpComparison; value?: any }[] = [];
  private _orderBy: string[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _joins: string[] = [];
  private _preloads: string[] = [];

  private table: string;
  private exec: ExecFn;
  private orm: { dialect?: string } | undefined;
  private modelName: string;

  constructor(table: string, exec: ExecFn, orm?: { dialect?: string }) {
    this.table = table;
    this.exec = exec;
    this.orm = orm;
    this.modelName = this.normalizeModelName(table);
  }

  private normalizeModelName(name: string) {
    const schema = getSchema();
    const normalized = name[0].toUpperCase() + name.slice(1);
    if (schema[normalized]) return normalized;
    const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
    if (schema[singular]) return singular;
    return normalized;
  }

  select<K extends keyof T>(...cols: K[]) {
    this._selects = cols;
    return this;
  }

  where<K extends keyof T>(column: K, op: OpComparison, value: T[K]) {
    this._where.push({ column: column as string, op, value });
    return this;
  }

  whereRaw(sql: string) {
    this._where.push({ raw: sql });
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

  join(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  leftJoin(table: string, onLeft: string, op: string, onRight: string) {
    this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
    return this;
  }

  preload<K extends PreloadPath<T>>(relation: K) {
    this._preloads.push(relation);
    return this;
  }

  ILike<K extends keyof T>(column: K, value: string) {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    const clause = dialect.caseInsensitiveLike(String(column), this._where.length);
    const val = `%${value}%`;
    this._where.push({ raw: clause, value: val });
    return this;
  }

  private buildSql() {
    const dialect = Dialects[this.orm?.dialect || "sqlite"];
    let sql = "SELECT ";
    sql += this._selects?.length ? (this._selects as string[]).join(", ") : "*";
    sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
    if (this._joins.length) sql += " " + this._joins.join(" ");

    const params: any[] = [];
    if (this._where.length) {
      sql +=
        " WHERE " +
        this._where
          .map((w, i) => {
            if (w.raw) {
              if (w.value !== undefined) params.push(w.value);
              return w.raw;
            }
            params.push(w.value);
            return `${dialect.quoteIdentifier(String(w.column))} ${w.op} ${dialect.formatPlaceholder(i)}`;
          })
          .join(" AND ");
    }

    if (this._orderBy.length) sql += " ORDER BY " + this._orderBy.join(", ");
    if (this._limit != null) sql += " LIMIT " + this._limit;
    if (this._offset != null) sql += " OFFSET " + this._offset;

    return { sql, params };
  }

  async get(): Promise<T[]> {
    const { sql, params } = this.buildSql();
    const res = await this.exec(sql, params);
    const rows = (res.rows || []) as T[];
    if (this._preloads.length) return await this.applyPreloads(rows);
    return rows;
  }

  async first(condition?: string): Promise<T | null> {
    if (condition) this.whereRaw(condition);
    this.limit(1);
    const rows = await this.get();
    return rows[0] || null;
  }

  private async applyPreloads(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;

  const schema = getSchema();
  const modelSchema = schema[this.modelName];
  if (!modelSchema) return rows;

  const dialect = Dialects[this.orm?.dialect || "sqlite"];

  // Collect relation metadata
  const relationFields: RelationMeta[] = [];
  for (const [field, fieldDef] of Object.entries(modelSchema.fields)) {
    const meta = (fieldDef as any)?.meta;
    if (!meta) continue;

    for (const key of Object.keys(meta)) {
      if (key.startsWith("relation") || key.startsWith("relationship")) {
        const kind = key.split(" ")[1] as "onetomany" | "manytoone" | "onetoone" | "manytomany";
        const targetModel = meta[key] as string;
        const foreignKey = meta.foreignKey as string | undefined;
        const relatedKey = meta.relatedKey as string | undefined;
        const through = meta.through as string | undefined;
        if (!targetModel) continue;

        relationFields.push({ fieldName: field, kind, targetModel, foreignKey, relatedKey, through });
      }
    }
  }

  // Group nested preloads
  const grouped: Record<string, string[]> = {};
  for (const preload of this._preloads) {
    const [root, ...rest] = preload.split(".");
    if (!grouped[root]) grouped[root] = [];
    if (rest.length) grouped[root].push(rest.join("."));
  }

  for (const root of Object.keys(grouped)) {
    const relation = relationFields.find(r => r.fieldName === root);
    if (!relation) continue;

    const targetSchema = schema[relation.targetModel];
    if (!targetSchema) continue;

    const { kind, foreignKey, relatedKey, through } = relation;
    const nestedPreloads = grouped[root];

    switch (kind) {
      case "onetomany": {
        if (!foreignKey) break;
        const parentIds = rows.map(r => r.id).filter(Boolean);
        if (!parentIds.length) break;

        const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
        const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
        const relatedRows = (await this.exec(sql, parentIds)).rows || [];

        for (const row of rows) {
          row[root] = relatedRows.filter(rel => rel[foreignKey] === row.id);
        }

        if (nestedPreloads.length && relatedRows.length) {
          const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
          qb._preloads = nestedPreloads;
          await qb.applyPreloads(relatedRows);
        }
        break;
      }

      case "manytoone":
case "onetoone": {
  if (!foreignKey) break;

  let relatedRows: any[] = []; // declare outside so available for nested preloads

  // Check if foreign key is on child (common case)
  const childFKOnRow = rows[0].hasOwnProperty(foreignKey);

  if (childFKOnRow) {
    // Child row has foreignKey → fetch parent
    const parentIds = rows.map(r => r[foreignKey]).filter(Boolean);
    if (!parentIds.length) break;

    const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${placeholders})`;
    relatedRows = (await this.exec(sql, parentIds)).rows || [];

    for (const row of rows) {
      row[root] = relatedRows.find(rel => rel.id === row[foreignKey]) || null;
    }
  } else {
    // Parent row has foreignKey → fetch child
    const parentIds = rows.map(r => r.id).filter(Boolean);
    if (!parentIds.length) break;

    const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
    relatedRows = (await this.exec(sql, parentIds)).rows || [];

    for (const row of rows) {
      row[root] = relatedRows.find(rel => rel[foreignKey] === row.id) || null;
    }
  }

  // Apply nested preloads
  if (nestedPreloads.length && relatedRows.length) {
    const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
    qb._preloads = nestedPreloads;
    await qb.applyPreloads(relatedRows);
  }

  break;
}


      case "manytomany": {
        if (!foreignKey || !relatedKey || !through) break;

        const parentIds = rows.map(r => r.id).filter(Boolean);
        if (!parentIds.length) break;

        const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
        const junctionSql = `SELECT * FROM ${dialect.quoteIdentifier(through)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
        const junctionRows = (await this.exec(junctionSql, parentIds)).rows || [];

        const targetIds = [...new Set(junctionRows.map(j => j[relatedKey]))];
        if (!targetIds.length) break;

        const targetPlaceholders = targetIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
        const targetSql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${targetPlaceholders})`;
        const targetRows = (await this.exec(targetSql, targetIds)).rows || [];

        for (const row of rows) {
          const relIds = junctionRows.filter(j => j[foreignKey] === row.id).map(j => j[relatedKey]);
          row[root] = targetRows.filter(t => relIds.includes(t.id));
        }

        if (nestedPreloads.length && targetRows.length) {
          const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
          qb._preloads = nestedPreloads;
          await qb.applyPreloads(targetRows);
        }
        break;
      }
    }
  }

  return rows;
}



}
