import { DBAdapter } from "./dbAdapter.js";
import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import type { RelationDef, EntityWithUpdate } from "./types.js";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
import { ExtendedQueryBuilder, Validator, ValidationError } from "./extensions.js";
import type { FieldRules } from "./extensions.js";

// SERVERLESS / EDGE CHANGES:
//   1. Removed `import { pathToFileURL } from "node:url"` from the top level.
//      pathToFileURL is now dynamically imported only inside loadSchema(), which
//      is itself only called when no schema is passed in (Node dev mode).
//   2. loadSchema() now gracefully handles environments with no `node:fs` by
//      catching the import error and throwing a clear "pass schema explicitly"
//      message — so edge runtimes get a helpful error instead of a crash.
//   3. entity.refresh/update/delete now close over the PRIMARY KEY value
//      (not the original filter) so refresh() still works after updating
//      a non-PK field.  [BUG FIX #1]

function q(driver: string, col: string) {
  if (driver === "postgres") return `"${col}"`;
  if (driver === "mysql") return `\`${col}\``;
  return col;
}

function placeholder(driver: string, index: number) {
  return driver === "postgres" ? `$${index}` : "?";
}

export type ModelAPI<T extends object> = {
  insert(item: T): Promise<EntityWithUpdate<T> | null>;
  update(filter: Partial<T>, partial: Partial<T>): Promise<EntityWithUpdate<T> | null>;
  delete(filter: Partial<T>): Promise<T | Partial<T>>;
  get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null>;
  getAll(): Promise<T[]>;
  query(): ExtendedQueryBuilder<T>;
  count(filter?: Partial<T>): Promise<number>;
  sum(column: keyof T & string, filter?: Partial<T>): Promise<number>;
  avg(column: keyof T & string, filter?: Partial<T>): Promise<number>;
  min(column: keyof T & string, filter?: Partial<T>): Promise<number>;
  max(column: keyof T & string, filter?: Partial<T>): Promise<number>;
  exists(filter: Partial<T>): Promise<boolean>;
  truncate(): Promise<void>;
  insertMany(items: T[]): Promise<number>;
  updateMany(filter: Partial<T>, data: Partial<T>): Promise<number>;
  deleteMany(filter: Partial<T>): Promise<number>;
  upsert(filter: Partial<T>, data: T): Promise<"inserted" | "updated">;
  findOrCreate(filter: Partial<T>, defaults: T): Promise<{ record: T; created: boolean }>;
  restore(filter: Partial<T>): Promise<void>;
  validate(data: Partial<T>, rules: FieldRules<T>): void;
  check(data: Partial<T>, rules: FieldRules<T>): Record<string, string> | null;
  withOne<K extends keyof T & string>(relation: K): Promise<T[K] | null>;
  withMany<K extends keyof T & string>(relation: K): Promise<T[K][]>;
  preload<K extends keyof T & string>(relation: K): Promise<void>;
  firstOrInit(filter: Partial<T>, defaults?: Partial<T>): Promise<EntityWithUpdate<T> | null>;
  findInBatches(filter: Partial<T> | null, batchSize: number, callback: (records: T[], batchNumber: number) => void | Promise<void>): Promise<void>;
  useDb(name: string): Promise<ModelAPI<T>>;
};

// ─── loadSchema ───────────────────────────────────────────────────────────────
// Only reached when no schema is passed in (local Node development).
// Gracefully fails in edge runtimes with a helpful error.
async function loadSchema(adapterDir: string) {
  try {
    const [fsMod, pathMod, { pathToFileURL }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
      import("node:url"),
    ]);
    const fs = fsMod as any;
    const path = pathMod as any;

    const base = path.join(process.cwd(), adapterDir, "schema");
    const jsonPath = path.join(base, "generated.json");
    const jsPath   = path.join(base, "generated.js");
    const tsPath   = path.join(base, "generated.ts");

    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    }
    if (fs.existsSync(jsPath)) {
      const { schema } = await import(/* webpackIgnore: true */ pathToFileURL(jsPath).href);
      return schema;
    }
    if (fs.existsSync(tsPath)) {
      const { schema } = await import(/* webpackIgnore: true */ pathToFileURL(tsPath).href);
      return schema;
    }
    throw new Error(`No schema file found in ${base} (tried .json, .js, .ts)`);
  } catch (err: any) {
    // node:fs unavailable → edge runtime
    if (err?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module.*node:fs/.test(String(err))) {
      throw new Error(
        "SlintORM: cannot load schema from disk in this runtime.\n" +
        "Generate the schema at build time (`npx slintorm generate`) and pass it " +
        "as the `schema` option:\n\n" +
        "  import schema from './src/schema/generated.json' assert { type: 'json' };\n" +
        "  const orm = new ORMManager({ driver: 'postgres', databaseUrl, schema });\n"
      );
    }
    throw err;
  }
}

let cachedSchema: Record<string, any> | null = null;

export async function createModelFactory(adapter: DBAdapter, schema?: Record<string, any>, emitGlobal?: (event: any) => Promise<void>, resolveNamedDb?: (name: string) => { adapter?: DBAdapter; exec: any; driver?: string } | undefined) {
  const schemas =
    schema ??
    adapter.schema ??
    (await loadSchema(adapter.dir!));

  function defineModel<T extends object = Record<string, any>>(
    table: string,
    modelName?: string,
    hooks?: {
      onCreateBefore?: (item: T) => T | void | Promise<T | void>;
      onCreateAfter?: (item: T) => void | Promise<void>;
      onUpdateBefore?: (oldData: T | null, newData: Partial<T>) => Partial<T> | void | Promise<Partial<T> | void>;
      onUpdateAfter?: (oldData: T | null, newData: Partial<T>) => void | Promise<void>;
      onDeleteBefore?: (deleted: Partial<T>) => void | Promise<void>;
      onDeleteAfter?: (deleted: Partial<T>) => void | Promise<void>;
    }
  ): ModelAPI<T> {
    const tableName = table;
    const name =
      modelName ||
      Object.keys(schemas).find((k) => schemas[k].table === tableName) ||
      tableName;

    const sqlDriver =
      adapter.driver === "sqlite" ||
      adapter.driver === "postgres" ||
      adapter.driver === "mysql"
        ? adapter.driver
        : undefined;

    const modelSchema = schemas[name] || { fields: {}, relations: [] as RelationDef[] };
    const versionField = Object.entries(modelSchema?.fields || {}).find(
      ([, f]: any) => f.meta?.version || f.meta?.["@version"]
    )?.[0];

    function inferFieldType(value: unknown) {
      if (value === null || value === undefined) return "string";
      if (typeof value === "number") return "number";
      if (typeof value === "boolean") return "boolean";
      if (value instanceof Date) return "Date";
      if (Array.isArray(value)) return "any[]";
      if (typeof value === "object") return "object";
      return typeof value;
    }

    function buildSchemaForItem(item?: Partial<T>) {
      if (!item || typeof item !== "object") return modelSchema;
      const inferredFields = Object.entries(item).reduce<Record<string, any>>((acc, [key, value]) => {
        if (value === undefined) return acc;
        const inferredType = inferFieldType(value);
        acc[key] = {
          type: inferredType,
          originalType: inferredType,
          optional: true,
          meta: inferredType === "object" ? { json: true } : {},
        };
        return acc;
      }, {});
      if (!Object.keys(inferredFields).length) return modelSchema;
      const merged = { ...modelSchema, fields: { ...(modelSchema.fields || {}), ...inferredFields } };
      // Ensure an id PK column exists when the schema is inferred (no explicit schema)
      if (!merged.fields.id) {
        merged.fields.id = { type: "INTEGER", meta: { primaryKey: true, auto: true } };
      }
      return merged;
    }

    const driver = adapter.driver as "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;
    const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);

    async function ensure(item?: Partial<T>) {
      const schemaForTable = buildSchemaForItem(item);
      await migrator.ensureTable(tableName, schemaForTable?.fields || {}, schemaForTable?.relations);
    }

    function buildWhereClause(filter: Partial<T>) {
      const keys = Object.keys(filter);
      if (!keys.length) throw new Error("Filter must contain at least one field");
      if (driver === "mongodb") return { mongoFilter: filter };
      const clause = keys
        .map((k, i) => driver === "postgres" ? `"${k}" = $${i + 1}` : `${k} = ?`)
        .join(" AND ");
      const params = keys.map((k) => filter[k as keyof T]);
      return { clause, params };
    }

    function isJsonMeta(meta: any) { return !!(meta?.json || meta?.["@json"]); }

    function serializeValue(col: string, value: any): any {
      if (value === undefined) return null;
      if (value instanceof Date) return value.toISOString();
      const fieldMeta = modelSchema.fields?.[col]?.meta;
      if (isJsonMeta(fieldMeta) && value !== null && typeof value === "object") {
        try { return JSON.stringify(value); } catch { return null; }
      }
      // Fallback: serialize plain objects as JSON even without schema metadata
      if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        try { return JSON.stringify(value); } catch { return value; }
      }
      return value;
    }

    async function scalarAggregate(fn: string, column: string, filter?: Partial<T>): Promise<number> {
      if (driver === "mongodb") {
        const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter ?? {} }));
        const rows: any[] = res.rows ?? [];
        const values = rows.map((r) => Number(r[column] ?? 0));
        if (fn === "SUM") return values.reduce((a, b) => a + b, 0);
        if (fn === "AVG") return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        if (fn === "MIN") return values.length ? Math.min(...values) : 0;
        if (fn === "MAX") return values.length ? Math.max(...values) : 0;
        return 0;
      }
      const isPg = driver === "postgres";
      const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
      const keys = filter ? Object.keys(filter) : [];
      const whereClause = keys.length
        ? "WHERE " + keys.map((k, i) => `${w(k)} = ${isPg ? `$${i + 1}` : "?"}`).join(" AND ")
        : "";
      const params = keys.map((k) => (filter as any)[k]);
      const res = await adapter.exec(`SELECT ${fn}(${w(column)}) as __val FROM ${w(tableName)} ${whereClause}`, params);
      return parseFloat(res.rows?.[0]?.__val ?? "0");
    }

    const emit = async (type: string, data?: any, filter?: any) => {
      if (emitGlobal) await emitGlobal({ type, model: name, table: tableName, data, filter });
    };

    function detectPolyFields() {
      const fields = modelSchema?.fields || {};
      let typeF: string | null = null;
      let idF: string | null = null;
      for (const [n, fdef] of Object.entries(fields)) {
        const meta = (fdef as any).meta || {};
        if (meta.polymorphicType) typeF = n;
        if (meta.polymorphicId) idF = n;
      }
      return { typeF, idF };
    }

    return {
      async insert(item: T) {
        await ensure(item);
        await emit("beforeInsert", item);
        const now = new Date().toISOString();
        if ((item as any).createdAt === undefined) (item as any).createdAt = now;
        if ((item as any).updatedAt === undefined) (item as any).updatedAt = now;

        if (hooks?.onCreateBefore) {
          const modified = await hooks.onCreateBefore(item);
          if (modified !== undefined) item = modified as T;
        }

        let insertedId: number | undefined;

        if (driver === "mongodb") {
          await adapter.exec(JSON.stringify({ collection: tableName, action: "insert", data: [item] }));
        } else {
          const itemValue = (c: string) => (item as any)[c];
          const isJsonField = (col: string) => {
            const meta = modelSchema.fields[col]?.meta;
            if (meta?.json || meta?.["@json"]) return true;
            // Fallback: if no schema defines this field but the value is a plain object, treat as JSON
            const val = itemValue(col);
            return typeof val === "object" && val !== null && !Array.isArray(val) && !(val instanceof Date);
          };
          const cols = Object.keys(item).filter((c) => {
            const value = itemValue(c);
            if (value === undefined) return false;
            if (value === null || value instanceof Date) return true;
            if (typeof value === "object") return isJsonField(c);
            return true;
          });
          const values = cols.map((c) => {
            const value = (item as any)[c];
            if (value === undefined) return null;
            if (value instanceof Date) return value.toISOString();
            if (isJsonField(c) && value !== null && typeof value === "object") {
              try { return JSON.stringify(value); } catch { return null; }
            }
            return value;
          });
          const wrap = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
          const placeholders = driver === "postgres"
            ? cols.map((_, i) => `$${i + 1}`).join(", ")
            : cols.map(() => "?").join(", ");
          const sql = driver === "postgres"
            ? `INSERT INTO ${wrap(tableName)} (${cols.map(wrap).join(", ")}) VALUES (${placeholders}) RETURNING *`
            : `INSERT INTO ${wrap(tableName)} (${cols.map(wrap).join(", ")}) VALUES (${placeholders})`;

          const result: any = await adapter.exec(sql, values);

          if (driver === "sqlite" && result?.lastID) insertedId = result.lastID;
          if (driver === "mysql" && result?.lastID)  insertedId = result.lastID;
          if (driver === "postgres" && result?.rows?.[0]?.id) insertedId = result.rows[0].id;

          if (driver === "postgres" && result?.rows?.[0]) {
            const row = result.rows[0];
            if (hooks?.onCreateAfter) await hooks.onCreateAfter(row);
            return row as any;
          }
          if (insertedId) (item as any).id = insertedId;
        }

        let inserted: any = null;
        if ((item as any).id) inserted = await this.get({ id: (item as any).id } as any);
        if (!inserted && driver === "sqlite") {
          try {
            const lr = await adapter.exec("SELECT last_insert_rowid() as id");
            const lastId = lr.rows?.[0]?.id;
            if (lastId) { (item as any).id = lastId; inserted = await this.get({ id: lastId } as any); }
          } catch {}
        }
        if (!inserted && (item as any).email) {
          try { inserted = await this.get({ email: (item as any).email } as any); } catch {}
        }
        if (hooks?.onCreateAfter && inserted) await hooks.onCreateAfter(inserted);
        await emit("afterInsert", inserted);
        return inserted;
      },

      async update(where: Partial<T>, data: Partial<T>) {
        if ((data as any).updatedAt === undefined) (data as any).updatedAt = new Date().toISOString();
        if (!where || !Object.keys(where).length) throw new Error("Update 'where' condition required");
        if (!data || !Object.keys(data).length) throw new Error("Update data cannot be empty");

        const before = await this.get(where);
        await emit("beforeUpdate", data, where);

        if (hooks?.onUpdateBefore) {
          const modified = await hooks.onUpdateBefore(before, data);
          if (modified !== undefined) data = modified as Partial<T>;
        }

        if (driver === "mongodb") {
          await adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter: where, data }));
        } else {
          const isPg = driver === "postgres";
          let setCols = Object.keys(data);
          const whereCols = Object.keys(where);

          // Optimistic locking: auto-increment version field
          let versionClause = "";
          if (versionField) {
            const currentVersion = (before as any)?.[versionField] ?? (where as any)[versionField];
            if (currentVersion !== undefined) {
              versionClause = isPg
                ? ` AND "${versionField}" = $${setCols.length + whereCols.length + 1}`
                : ` AND ${versionField} = ?`;
              if (!setCols.includes(versionField)) {
                (data as any)[versionField] = Number(currentVersion) + 1;
              }
            }
          }

          const setClause = setCols.map((c, i) => isPg ? `"${c}" = $${i + 1}` : `${c} = ?`).join(", ");
          const whereClause = whereCols.map((c, i) => isPg ? `"${c}" = $${setCols.length + i + 1}` : `${c} = ?`).join(" AND ");
          const params = [...setCols.map((c) => serializeValue(c, (data as any)[c])), ...whereCols.map((c) => where[c as keyof T])];
          if (versionClause) {
            params.push((before as any)?.[versionField as string]);
          }
          await adapter.exec(
            `UPDATE ${isPg ? `"${tableName}"` : tableName} SET ${setClause} WHERE ${whereClause}${versionClause}`,
            params
          );
        }

        const after = await this.get(where);
        if (hooks?.onUpdateAfter) await hooks.onUpdateAfter(before, after || data);
        await emit("afterUpdate", after, where);
        return after;
      },

      async delete(filter: Partial<T>) {
        if (!Object.keys(filter).length) throw new Error("Delete filter cannot be empty");
        const needsRecord = !!(hooks?.onDeleteBefore || hooks?.onDeleteAfter);
        const toDelete = needsRecord ? await this.get(filter) : null;
        await emit("beforeDelete", null, filter);
        if (hooks?.onDeleteBefore) await hooks.onDeleteBefore(toDelete || filter);
        if (driver === "mongodb") {
          await adapter.exec(JSON.stringify({ collection: tableName, action: "delete", filter }));
        } else {
          const { clause, params } = buildWhereClause(filter) as { clause: string; params: any[] };
          await adapter.exec(`DELETE FROM ${tableName} WHERE ${clause}`, params);
        }
        if (hooks?.onDeleteAfter) await hooks.onDeleteAfter(toDelete || filter);
        await emit("afterDelete", toDelete, filter);
        return toDelete || filter;
      },

      async get(filter: Partial<T>) {
        if (!Object.keys(filter).length) throw new Error("Get filter cannot be empty");
        let record: T | null = null;

        if (driver === "mongodb") {
          const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter }));
          record = res.rows[0] || null;
        } else {
          const { clause, params } = buildWhereClause(filter) as { clause: string; params: any[] };
          const res = await adapter.exec(`SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1`, params);
          record = res.rows[0] || null;
        }

        if (!record) return null;
        record = mapBooleans(record, modelSchema.fields);
        record = mapJson(record, modelSchema.fields);

        const self = this;

        // ── BUG FIX #1: entity.refresh() / entity.update() / entity.delete()
        // We close over the PRIMARY KEY value (not the original filter) so that
        // entity.refresh() still works after calling entity.update() with new
        // non-PK field values.
        const pkField = modelSchema?.primaryKey || "id";
        const pkValue = (record as any)[pkField];
        const stableFilter: Partial<T> = pkValue !== undefined
          ? { [pkField]: pkValue } as Partial<T>
          : filter;

        Object.defineProperties(record, {
          update: {
            value: async (data: Partial<T>) => self.update(stableFilter, data),
            enumerable: false, writable: true,
          },
          delete: {
            value: async () => self.delete(stableFilter),
            enumerable: false, writable: true,
          },
          refresh: {
            value: async () => self.get(stableFilter),
            enumerable: false, writable: true,
          },
          toJSON: {
            value: () => ({ ...record } as T),
            enumerable: false, writable: true,
          },
        });

        return record as EntityWithUpdate<T>;
      },

      async getAll() {
        const res = driver === "mongodb"
          ? await adapter.exec(JSON.stringify({ collection: tableName, action: "find" }))
          : await adapter.exec(`SELECT * FROM ${tableName}`);
        return res.rows.map((r: T) => mapJson(mapBooleans(r, modelSchema.fields), modelSchema.fields));
      },

      query(): ExtendedQueryBuilder<T> {
        return new ExtendedQueryBuilder<T>(
          tableName,
          adapter.dir!,
          adapter.exec.bind(adapter),
          name,
          schemas,
          { dialect: adapter.driver }
        );
      },

      async count(filter?: Partial<T>) {
        if (driver === "mongodb") {
          const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter ?? {} }));
          return res.rows.length;
        }
        const isPg = driver === "postgres";
        const keys = filter ? Object.keys(filter) : [];
        const whereClause = keys.length
          ? "WHERE " + keys.map((k, i) => `"${k}" = ${isPg ? `$${i + 1}` : "?"}`).join(" AND ")
          : "";
        const res = await adapter.exec(`SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`, keys.map((k) => (filter as any)[k]));
        return parseInt(res.rows?.[0]?.count ?? "0", 10);
      },

      async exists(filter: Partial<T>) {
        const { clause, params } = buildWhereClause(filter) as { clause: string; params: any[] };
        const res = await adapter.exec(`SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`, params);
        return !!res.rows.length;
      },

      async truncate() { await adapter.exec(`DELETE FROM ${tableName}`); },

      async sum(column: keyof T & string, filter?: Partial<T>) { return scalarAggregate("SUM", column, filter); },
      async avg(column: keyof T & string, filter?: Partial<T>) { return scalarAggregate("AVG", column, filter); },
      async min(column: keyof T & string, filter?: Partial<T>) { return scalarAggregate("MIN", column, filter); },
      async max(column: keyof T & string, filter?: Partial<T>) { return scalarAggregate("MAX", column, filter); },

      async insertMany(items: T[]) {
        if (!items.length) return 0;
        await ensure(items[0]);
        const now = new Date().toISOString();
        const prepared = items.map((item) => {
          const row = { ...item } as any;
          if (row.createdAt === undefined) row.createdAt = now;
          if (row.updatedAt === undefined) row.updatedAt = now;
          return row;
        });

        if (driver === "mongodb") {
          await adapter.exec(JSON.stringify({ collection: tableName, action: "insert", data: prepared }));
          return prepared.length;
        }

        const cols = Object.keys(prepared[0]).filter((c) => prepared[0][c] !== undefined);
        const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;

        if (driver === "sqlite") {
          await adapter.exec("BEGIN", []);
          try {
            for (const row of prepared) {
              const values = cols.map((c) => serializeValue(c, row[c]));
              await adapter.exec(`INSERT INTO ${w(tableName)} (${cols.map(w).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, values);
            }
            await adapter.exec("COMMIT", []);
          } catch (err) {
            await adapter.exec("ROLLBACK", []);
            throw err;
          }
          return prepared.length;
        }

        const allValues: any[] = [];
        const isPg = driver === "postgres";
        const rowPlaceholders = prepared.map((row, rowIdx) => {
          const phs = cols.map((c, colIdx) => {
            allValues.push(serializeValue(c, row[c]));
            return isPg ? `$${rowIdx * cols.length + colIdx + 1}` : "?";
          });
          return `(${phs.join(", ")})`;
        });
        await adapter.exec(`INSERT INTO ${w(tableName)} (${cols.map(w).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`, allValues);
        return prepared.length;
      },

      async updateMany(filter: Partial<T>, data: Partial<T>) {
        if (!Object.keys(filter).length) throw new Error("updateMany filter cannot be empty");
        if (!Object.keys(data).length) throw new Error("updateMany data cannot be empty");
        const now = new Date().toISOString();
        if ((data as any).updatedAt === undefined) (data as any).updatedAt = now;

        if (driver === "mongodb") {
          const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter, data }));
          return res.changes ?? 0;
        }

        const isPg = driver === "postgres";
        const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
        const setCols = Object.keys(data);
        const whereCols = Object.keys(filter);
        const setClause = setCols.map((c, i) => `${w(c)} = ${isPg ? `$${i + 1}` : "?"}`).join(", ");
        const whereClause = whereCols.map((c, i) => `${w(c)} = ${isPg ? `$${setCols.length + i + 1}` : "?"}`).join(" AND ");
        const res = await adapter.exec(
          `UPDATE ${w(tableName)} SET ${setClause} WHERE ${whereClause}`,
          [...setCols.map((c) => serializeValue(c, (data as any)[c])), ...whereCols.map((c) => (filter as any)[c])]
        );
        return res.changes ?? 0;
      },

      async deleteMany(filter: Partial<T>) {
        if (!Object.keys(filter).length) throw new Error("deleteMany filter cannot be empty");
        if (driver === "mongodb") {
          const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "delete", filter }));
          return res.changes ?? 0;
        }
        const isPg = driver === "postgres";
        const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
        const whereCols = Object.keys(filter);
        const whereClause = whereCols.map((c, i) => `${w(c)} = ${isPg ? `$${i + 1}` : "?"}`).join(" AND ");
        const res = await adapter.exec(`DELETE FROM ${w(tableName)} WHERE ${whereClause}`, whereCols.map((c) => (filter as any)[c]));
        return res.changes ?? 0;
      },

      async upsert(filter: Partial<T>, data: T) {
        const self = this;
        if (driver === "mongodb") {
          const check = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter }));
          if (check.rows?.length) {
            await adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter, data }));
            return "updated" as const;
          }
          await self.insertMany([data]);
          return "inserted" as const;
        }
        if (driver === "postgres") {
          const cols = Object.keys(data);
          const filterCols = Object.keys(filter);
          const row = { ...data } as any;
          const now = new Date().toISOString();
          if (row.createdAt === undefined) row.createdAt = now;
          if (row.updatedAt === undefined) row.updatedAt = now;
          const values = cols.map((c) => serializeValue(c, row[c]));
          const conflictCols = filterCols.map((c) => `"${c}"`).join(", ");
          const updateSet = cols.filter((c) => !filterCols.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
          await adapter.exec(
            `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
             ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`,
            values
          );
          return "inserted" as const;
        }
        if (driver === "mysql") {
          const cols = Object.keys(data);
          const row = { ...data } as any;
          const now = new Date().toISOString();
          if (row.createdAt === undefined) row.createdAt = now;
          if (row.updatedAt === undefined) row.updatedAt = now;
          const values = cols.map((c) => serializeValue(c, row[c]));
          const updateSet = cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
          await adapter.exec(
            `INSERT INTO \`${tableName}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
             ON DUPLICATE KEY UPDATE ${updateSet}`,
            values
          );
          return "inserted" as const;
        }
        const existing = await this.get(filter);
        if (existing) { await this.updateMany(filter, data); return "updated" as const; }
        await this.insertMany([data]);
        return "inserted" as const;
      },

      async findOrCreate(filter: Partial<T>, defaults: T) {
        const existing = await this.get(filter);
        if (existing) return { record: existing as T, created: false };
        await this.insertMany([defaults]);
        const created = await this.get(filter);
        return { record: created as T, created: true };
      },

      async firstOrInit(filter: Partial<T>, defaults?: Partial<T>): Promise<EntityWithUpdate<T> | null> {
        const self = this;
        const existing = await self.get(filter);
        if (existing) return existing;
        const initRecord = { ...(defaults || {}), ...filter } as EntityWithUpdate<T>;
        const pkField = modelSchema?.primaryKey || "id";
        Object.defineProperties(initRecord, {
          update: {
            value: async (data: Partial<T>) => {
              if ((initRecord as any)[pkField]) {
                return self.update({ [pkField]: (initRecord as any)[pkField] } as Partial<T>, data);
              }
              const inserted = await self.insert({ ...initRecord, ...data } as T);
              return inserted;
            },
            enumerable: false, writable: true,
          },
          delete: {
            value: async () => {
              if ((initRecord as any)[pkField]) return self.delete({ [pkField]: (initRecord as any)[pkField] } as Partial<T>);
              return filter;
            },
            enumerable: false, writable: true,
          },
          refresh: {
            value: async () => {
              if ((initRecord as any)[pkField]) return self.get({ [pkField]: (initRecord as any)[pkField] } as Partial<T>);
              return initRecord;
            },
            enumerable: false, writable: true,
          },
          toJSON: {
            value: () => ({ ...initRecord } as T),
            enumerable: false, writable: true,
          },
        });
        return initRecord;
      },

      async findInBatches(filter: Partial<T> | null, batchSize: number, callback: (records: T[], batchNumber: number) => void | Promise<void>): Promise<void> {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const qb = this.query();
          if (filter && Object.keys(filter).length) {
            for (const [k, v] of Object.entries(filter)) {
              qb.where(k as any, "=", v as any);
            }
          }
          qb.paginate(page, batchSize);
          const rows = await qb.get();
          if (rows.length > 0) {
            await callback(rows, page);
          }
          hasMore = rows.length >= batchSize;
          page++;
        }
      },

      async restore(filter: Partial<T>) {
        await this.updateMany(filter, { deletedAt: null } as any);
      },

      // ── Polymorphic associations ──────────────────────────────────
      // Fields auto-detected from // @polymorphicType / @polymorphicId annotations
      morphTo(typeField?: string, idField?: string): Promise<any> {
        return (async () => {
          const row = await this.query().first();
          if (!row) return null;
          const { typeF, idF } = detectPolyFields();
          const morphType = (row as any)[typeField || typeF || "commentableType"];
          const morphId = (row as any)[idField || idF || "commentableId"];
          if (!morphType || !morphId) return null;
          let schemaEntry = Object.values(schemas).find(
            (s: any) => s.table === morphType.toLowerCase() || s.table === morphType
          );
          if (!schemaEntry) schemaEntry = schemas[morphType];
          if (!schemaEntry) return null;
          const targetTable = (schemaEntry as any).table || morphType;
          const res = await adapter.exec(`SELECT * FROM "${targetTable}" WHERE "id" = ?`, [morphId]);
          if (!res.rows?.length) return null;
          return res.rows[0];
        })();
      },

      morphMany(morphValue: string, typeField?: string): Promise<any[]> {
        return (async () => {
          const { typeF } = detectPolyFields();
          const resolvedType = typeField || typeF || "commentableType";
          let schemaEntry = Object.values(schemas).find(
            (s: any) => s.table === morphValue.toLowerCase() || s.table === morphValue
          );
          if (!schemaEntry) schemaEntry = schemas[morphValue];
          const targetTable = (schemaEntry as any)?.table || morphValue;
          const res = await adapter.exec(`SELECT * FROM "${targetTable}" WHERE "${String(resolvedType)}" = ?`, [morphValue]);
          return res.rows || [];
        })();
      },

      validate(data: Partial<T>, rules: FieldRules<T>) { new Validator<T>(rules).validate(data); },
      check(data: Partial<T>, rules: FieldRules<T>) { return new Validator<T>(rules).check(data); },

      async withOne<K extends keyof T & string>(_relation: K) {
        const row = await this.query().preload(_relation as any).first();
        if (!row) return null;
        return (row as any)[_relation] ?? null;
      },
      async withMany<K extends keyof T & string>(_relation: K) {
        const row = await this.query().preload(_relation as any).first();
        if (!row) return [];
        return (row as any)[_relation] || [];
      },
      async preload<K extends keyof T & string>(_relation: K) {
        await this.query().preload(_relation as any).get();
      },

      async useDb(dbName: string): Promise<ModelAPI<T>> {
        if (!resolveNamedDb) throw new Error("No database resolver available");
        const entry = resolveNamedDb(dbName);
        if (!entry) throw new Error(`Database "${dbName}" not found. Register it with addDatabase().`);
        const otherAdapter = entry.adapter;
        if (!otherAdapter) throw new Error(`Database "${dbName}" has no full DBAdapter (may use custom exec)`);
        const factory = await createModelFactory(otherAdapter, schemas, emitGlobal, resolveNamedDb);
        return factory<T>(tableName, name || modelName, hooks);
      },
    } as ModelAPI<T>;
  }

  return defineModel;
}

function mapJson<T extends Record<string, any>>(row: T, schemaFields: Record<string, any>) {
  const out = { ...row } as Record<string, any>;
  for (const key of Object.keys(schemaFields)) {
    const fieldMeta = schemaFields[key]?.meta;
    if ((fieldMeta?.json || fieldMeta?.["@json"]) && typeof out[key] === "string") {
      try { out[key] = JSON.parse(out[key]); } catch {}
    }
  }
  // Fallback: deserialize any string that looks like JSON, for inferred fields
  for (const key of Object.keys(out)) {
    if (schemaFields[key]) continue;
    if (typeof out[key] === "string" && (out[key].startsWith("{") || out[key].startsWith("["))) {
      try { out[key] = JSON.parse(out[key]); } catch {}
    }
  }
  return out as T;
}
