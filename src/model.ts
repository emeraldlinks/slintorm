import { DBAdapter } from "./dbAdapter.js";
import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import type { RelationDef, EntityWithUpdate } from "./types.js";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
import { pathToFileURL } from "node:url";



function q(driver: string, col: string) {
  if (driver === "postgres") return `"${col}"`;
  if (driver === "mysql") return `\`${col}\``;
  return col; // sqlite
}

function placeholder(driver: string, index: number) {
  return driver === "postgres" ? `$${index}` : "?";
}

export type ModelAPI<T extends object> = {
  /** Inserts a new record into the table */
  insert(item: T): Promise<EntityWithUpdate<T> | null>;

  /** Updates existing records matching the filter */
  update(
    filter: Partial<T>,
    partial: Partial<T>
  ): Promise<EntityWithUpdate<T> | null>;

  /** Deletes records matching the filter */
  delete(filter: Partial<T>): Promise<Partial<T>>;

  /** Retrieves a single record matching the filter */
  get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null>;

  /** Retrieves all records from the table */
  getAll(): Promise<T[]>;

  /** Returns a query builder instance for custom queries */
  query(): AdvancedQueryBuilder<T>;

  /** Counts the number of records matching the filter */
  count(filter?: Partial<T>): Promise<number>;

  /** Checks if any record exists matching the filter */
  exists(filter: Partial<T>): Promise<boolean>;

  /** Deletes all records in the table */
  truncate(): Promise<void>;

  /** Loads a single related record */
  withOne<K extends keyof T & string>(relation: K): Promise<T[K] | null>;

  /** Loads multiple related records */
  withMany<K extends keyof T & string>(relation: K): Promise<T[K][]>;

  /** Preloads a relation for future queries */
  preload<K extends keyof T & string>(relation: K): Promise<void>;
};



async function loadSchema(adapterDir: string) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const jsonPath = path.join(process.cwd(), adapterDir, "schema", "generated.json");
  const jsPath = path.join(process.cwd(), adapterDir, "schema", "generated.js");
  const tsPath = path.join(process.cwd(), adapterDir, "schema", "generated.ts");

  try {
    if (fs.existsSync(jsonPath)) {
      const json = fs.readFileSync(jsonPath, "utf8");
      return JSON.parse(json);
    }

    if (fs.existsSync(jsPath)) {
      const { schema } = await import(/* webpackIgnore: true */ pathToFileURL(jsPath).href);
      return schema;
    }

    if (fs.existsSync(tsPath)) {
      const { schema } = await import(/* webpackIgnore: true */ pathToFileURL(tsPath).href);
      return schema;
    }

    console.error("tried: ", jsonPath, jsPath, tsPath);
    throw new Error("No schema file found (json, js, or ts).");
  } catch (err) {
    console.error("Failed to import schema:", err);
    throw err;
  }
}
let cachedSchema: Record<string, any> | null = null;
/**
 * Factory function to create models with CRUD and query capabilities.
 *
 * @param adapter - Database adapter instance
 * @returns A function to define a model with optional hooks
 */
export async function createModelFactory(adapter: DBAdapter, schema?: Record<string, any>) {
  const schemas =
    schema ??
    adapter.schema ??
    (await loadSchema(adapter.dir!));
  // console.log("schemas: ", schemas)

  /**
   * Defines a new model for a specific table.
   *
   * @param table - Database table name
   * @param modelName - Optional name for the model
   * @param hooks - Optional lifecycle hooks for CRUD operations
   * @returns The model API for interacting with the table
   */
  function defineModel<T extends object = Record<string, any>>(
    table: string,
    modelName?: string,
    hooks?: {
      onCreateBefore?: (item: T) => T | void | Promise<T | void>;
      onCreateAfter?: (item: T) => void | Promise<void>;
      onUpdateBefore?: (
        oldData: T | null,
        newData: Partial<T>
      ) => Partial<T> | void | Promise<Partial<T> | void>;
      onUpdateAfter?: (
        oldData: T | null,
        newData: Partial<T>
      ) => void | Promise<void>;
      onDeleteBefore?: (deleted: Partial<T>) => void | Promise<void>;
      onDeleteAfter?: (deleted: Partial<T>) => void | Promise<void>;
    }
  ): ModelAPI<T>;
  function defineModel<T extends object = Record<string, any>>(
    table: string,
    modelName?: string,
    hooks?: any
  ) {
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

    const modelSchema = schemas[name] || {
      fields: {},
      relations: [] as RelationDef[],
    };

    function inferFieldType(value: unknown) {
      if (value === null || value === undefined) return "string";
      if (typeof value === "number") return Number.isInteger(value) ? "number" : "number";
      if (typeof value === "boolean") return "boolean";
      if (value instanceof Date) return "Date";
      if (Array.isArray(value)) return "any[]";
      if (typeof value === "object") return "object";
      return typeof value;
    }

    function buildSchemaForItem(item?: Partial<T>) {
      if (!item || typeof item !== "object") {
        return modelSchema;
      }

      const inferredFields = Object.entries(item).reduce<Record<string, any>>((acc, [key, value]) => {
        if (value === undefined) return acc;
        acc[key] = {
          type: inferFieldType(value),
          originalType: inferFieldType(value),
          optional: true,
          meta: {},
        };
        return acc;
      }, {});

      if (!Object.keys(inferredFields).length) {
        return modelSchema;
      }

      return {
        ...modelSchema,
        fields: {
          ...(modelSchema.fields || {}),
          ...inferredFields,
        },
      };
    }
    const driver = adapter.driver as
      | "sqlite"
      | "postgres"
      | "mysql"
      | "mongodb"
      | undefined;
    const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);

    /** Ensures the table exists and is up-to-date */
    async function ensure(item?: Partial<T>) {
      const schemaForTable = buildSchemaForItem(item);
      await migrator.ensureTable(tableName, schemaForTable || {}, schemaForTable?.relations);
    }
  

    /**
     * Builds a WHERE clause for SQL queries
     *
     * @param filter - Object with key-value pairs to filter by
     * @returns SQL clause and parameters
     */
    function buildWhereClause(filter: Partial<T>) {
      const keys = Object.keys(filter);
      if (!keys.length) throw new Error("Filter must contain at least one field");

      const driverType = adapter.driver!;
      if (driverType === "mongodb") {
        return { mongoFilter: filter };
      }

      const clause = keys
        .map((k, i) =>
          driverType === "postgres" ? `"${k}" = $${i + 1}` : `${k} = ?`
        )
        .join(" AND ");

      const params = keys.map((k) => filter[k as keyof T]);

      return { clause, params };
    }

    async function ensureModelTable(item?: Partial<T>) {
      await ensure(item);
    }

    return {
      /** @inheritdoc */
      async insert(item: T) {
        await ensureModelTable(item);
  const now = new Date().toISOString();
  if ((item as any).createdAt === undefined) (item as any).createdAt = now;
  if ((item as any).updatedAt === undefined) (item as any).updatedAt = now;


        if (hooks?.onCreateBefore) {
          const modified = await hooks.onCreateBefore(item);
          if (modified !== undefined) {
            item = modified;
          }
        }

        let insertedId: number | undefined;

        if (driver === "mongodb") {
          await adapter.exec(
            JSON.stringify({
              collection: tableName,
              action: "insert",
              data: [item],
            })
          );
        } else {
          const cols = Object.keys(item).filter((c) => {
            const value = item[c as keyof T] as any;
            if (value === undefined) return false;
            if (value === null) return true;
            if (value instanceof Date) return true;
            if (typeof value === "object") {
              const fieldMeta = modelSchema.fields[c]?.meta;
              return !!fieldMeta?.json;
            }
            return true;
          });

          const values = cols.map((c) => {
            const value = item[c as keyof T] as any;
            const fieldMeta = modelSchema.fields[c]?.meta;
            if (value === undefined) return null;
            if (value instanceof Date) return value.toISOString();
            if (fieldMeta?.json && value !== null && typeof value === "object") {
              try {
                return JSON.stringify(value);
              } catch {
                return null;
              }
            }
            return value;
          });

          const placeholders =
            driver === "postgres"
              ? cols.map((_, i) => `$${i + 1}`).join(", ")
              : cols.map(() => "?").join(", ");

          const wrap = (c: string) =>
            driver === "mysql" ? `\`${c}\`` : `"${c}"`;

          const sqlCols = cols.map(wrap).join(",");

          const sql = driver === 'postgres'
            ? `INSERT INTO ${wrap(tableName)} (${sqlCols}) VALUES (${placeholders}) RETURNING *`
            : `INSERT INTO ${wrap(tableName)} (${sqlCols}) VALUES (${placeholders})`;

          const result: any = await adapter.exec(sql, values);

          if (driver === "sqlite" && result?.lastID) insertedId = result.lastID;
          if (driver === "mysql" && result?.insertId) insertedId = result.insertId;
          if (driver === "postgres" && result?.rows?.[0]?.id)
            insertedId = result.rows[0].id;

          if (insertedId) (item as any).id = insertedId;
        }

        // Try to fetch the inserted row. Prefer ID-based lookup; if the
        // adapter/driver didn't provide a lastID (some sqlite builds or
        // prepared paths), attempt to find the row by sensible fields.
        let inserted: any = null;
        if ((item as any).id) {
          inserted = await this.get({ id: (item as any).id } as any);
        }
        if (!inserted) {
          // For sqlite, as a last-resort, try last_insert_rowid() to
          // obtain the last inserted row id from the connection.
          if (driver === "sqlite") {
            try {
                // Only try to lookup by last_insert_rowid if this model
                // actually declares an `id` primary key. Some pivot/join
                // tables may not have an `id` column and would make this
                // lookup fail with "no such column: id".
                if (modelSchema && modelSchema.fields && modelSchema.fields['id']) {
                  const lr = await adapter.exec("SELECT last_insert_rowid() as id");
                  const lastId = lr.rows?.[0]?.id;
                  if (lastId) {
                    (item as any).id = lastId;
                    inserted = await this.get({ id: lastId } as any);
                  }
                }
            } catch {}
          }
          // Try common unique-ish combinations
          let tryFilter: any = {};
          if ((item as any).title) tryFilter.title = (item as any).title;
          if ((item as any).userId) tryFilter.userId = (item as any).userId;
          if ((item as any).email) tryFilter.email = (item as any).email;
          if (Object.keys(tryFilter).length) {
            try {
              inserted = await this.get(tryFilter as any);
            } catch {}
          }

          if (!inserted) {
            // Last resort: scan all rows and try to match by the above keys
            try {
              const rows = await this.getAll();
              inserted = rows.find((r: any) => {
                if (tryFilter.title && r.title !== tryFilter.title) return false;
                if (tryFilter.userId && r.userId !== tryFilter.userId) return false;
                if (tryFilter.email && r.email !== tryFilter.email) return false;
                return true;
              }) || null;
            } catch {}
          }
        }

        if (hooks?.onCreateAfter && inserted) {
          await hooks.onCreateAfter(inserted);
        }

        return inserted;
      },

      /** @inheritdoc */
      async update(where: Partial<T>, data: Partial<T>) {
           // Inject updatedAt automatically
  if ((data as any).updatedAt === undefined) (data as any).updatedAt = new Date().toISOString();

        const before = await this.get(where);

        if (!where || !Object.keys(where).length)
          throw new Error("Update 'where' condition required");

        if (!data || !Object.keys(data).length)
          throw new Error("Update data cannot be empty");

        if (hooks?.onUpdateBefore) {
          const modified = await hooks.onUpdateBefore(before, data);
          if (modified !== undefined) {
            data = modified;
          }
        }

        if (driver === "mongodb") {
          await adapter.exec(
            JSON.stringify({
              collection: tableName,
              action: "update",
              filter: where,
              data,
            })
          );
        } else {
          const isPg = driver === "postgres";

          const setCols = Object.keys(data);
          const whereCols = Object.keys(where);

          const setClause = setCols
            .map((c, i) => (isPg ? `"${c}" = $${i + 1}` : `${c} = ?`))
            .join(", ");

          const whereClause = whereCols
            .map((c, i) =>
              isPg ? `"${c}" = $${setCols.length + i + 1}` : `${c} = ?`
            )
            .join(" AND ");

          const setValues = setCols.map((c) => data[c as keyof T]);
          const whereValues = whereCols.map((c) => where[c as keyof T]);

          const sql = `UPDATE ${isPg ? `"${tableName}"` : tableName}
                 SET ${setClause}
                 WHERE ${whereClause}`;

          // console.log(sql, [...setValues, ...whereValues]);

          await adapter.exec(sql, [...setValues, ...whereValues]);
        }

        const after = await this.get(where);
        if (hooks?.onUpdateAfter)
          await hooks.onUpdateAfter(before, after || data);

        return after;
      },
      /** @inheritdoc */
      async delete(filter: Partial<T>) {
         
        if (!Object.keys(filter).length)
          throw new Error("Delete filter cannot be empty");
        const toDelete = await this.get(filter);
        if (hooks?.onDeleteBefore) {
          await hooks.onDeleteBefore(toDelete || filter);
        }
        if (driver === "mongodb") {
          await adapter.exec(
            JSON.stringify({ collection: tableName, action: "delete", filter })
          );
        } else {
          const { clause, params } = buildWhereClause(filter);
          const sql = `DELETE FROM ${tableName} WHERE ${clause}`;
          await adapter.exec(sql, params);
        }
        if (hooks?.onDeleteAfter) await hooks.onDeleteAfter(toDelete || filter);
        return filter;
      },

      /** @inheritdoc */
      async get(filter: Partial<T>) {
  if (!Object.keys(filter).length)
    throw new Error("Get filter cannot be empty");
  let record: T | null = null;
  if (driver === "mongodb") {
    const res = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "find", filter })
    );
    record = res.rows[0] || null;
  } else {
    const { clause, params } = buildWhereClause(filter);
    const sql = `SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1`;
    const res = await adapter.exec(sql, params);
    record = res.rows[0] || null;
  }
  if (!record) return null;
  record = mapBooleans(record, modelSchema.fields);
  record = mapJson(record, modelSchema.fields);

  const self = this;

  Object.defineProperties(record, {
    update: {
      value: async (data: Partial<T>) => self.update(filter, data),
      enumerable: false,
      writable: true,
    },
    delete: {
      value: async () => self.delete(filter),
      enumerable: false,
      writable: true,
    },
    refresh: {
      value: async () => self.get(filter),
      enumerable: false,
      writable: true,
    },
    toJSON: {
      value: () => ({ ...record } as T),
      enumerable: false,
      writable: true,
    },
  });

  return record as EntityWithUpdate<T>;
},

      /** @inheritdoc */
      async getAll() {
         
        const res =
          driver === "mongodb"
            ? await adapter.exec(
                JSON.stringify({ collection: tableName, action: "find" })
              )
            : await adapter.exec(`SELECT * FROM ${tableName}`);
          return res.rows.map((r: T) => mapJson(mapBooleans(r, modelSchema.fields), modelSchema.fields));
      },

      /** @inheritdoc */
     query(): AdvancedQueryBuilder<T> {
  return new AdvancedQueryBuilder<T>(
    tableName,
    adapter.dir!,
    adapter.exec.bind(adapter),
    modelName!, 
    schemas,                   
    { dialect: adapter.driver }
  );
},
      /** @inheritdoc */
      async count(filter?: Partial<T>) {
         
        if (driver === "mongodb") {
          const res = await adapter.exec(
            JSON.stringify({
              collection: tableName,
              action: "find",
              filter: filter || {},
            })
          );
          return res.rows.length;
        } else {
          const where =
            filter && Object.keys(filter).length
              ? buildWhereClause(filter)
              : { clause: "1=1", params: [] };
          const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${where.clause}`;
          const res = await adapter.exec(sql, where.params);
          return res.rows[0]?.count ?? 0;
        }
      },

      /** @inheritdoc */
      async exists(filter: Partial<T>) {
         
        const { clause, params } = buildWhereClause(filter);
        const sql = `SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`;
        const res = await adapter.exec(sql, params);
        return !!res.rows.length;
      },

      /** @inheritdoc */
      async truncate() {
         
        await adapter.exec(`DELETE FROM ${tableName}`);
      },

      /** @inheritdoc */
      async withOne<K extends keyof T & string>(_relation: K) {
        const row = await this.query().preload(_relation as any).first();
        if (!row) return null;
        return (row as any)[_relation] ?? null;
      },

      /** @inheritdoc */
      async withMany<K extends keyof T & string>(_relation: K) {
        const row = await this.query().preload(_relation as any).first();
        if (!row) return [];
        return (row as any)[_relation] || [];
      },

      /** @inheritdoc */
      async preload<K extends keyof T & string>(_relation: K) {
        await this.query().preload(_relation as any).get();
        return;
      },
    } as ModelAPI<T>;
  }

  return defineModel;
}

function mapJson<T extends Record<string, any>>(row: T, schemaFields: Record<string, any>) {
  const out = { ...row } as Record<string, any>;
  for (const key of Object.keys(schemaFields)) {
    const fieldMeta = schemaFields[key]?.meta;
    if (fieldMeta?.json && typeof out[key] === "string") {
      try {
        out[key] = JSON.parse(out[key]);
      } catch {
        // leave raw string
      }
    }
  }
  return out as T;
}
