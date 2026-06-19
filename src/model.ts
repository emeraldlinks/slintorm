import { DBAdapter } from "./dbAdapter.js";
import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import type { RelationDef, EntityWithUpdate } from "./types.js";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
import { pathToFileURL } from "node:url";
import { ExtendedQueryBuilder, Validator, ValidationError } from "./extensions.js";
import type { FieldRules } from "./extensions.js";



function q(driver: string, col: string) {
  if (driver === "postgres") return `"${col}"`;
  if (driver === "mysql") return `\`${col}\``;
  return col; // sqlite
}

function placeholder(driver: string, index: number) {
  return driver === "postgres" ? `$${index}` : "?";
}

export type ModelAPI<T extends object> = {
  /**
   * Inserts a new record into the table.
   * Automatically sets `createdAt` and `updatedAt` if not provided.
   * Returns the full inserted record with `update`, `delete`, and `refresh` methods attached.
   *
   * @example
   * const user = await db.User.insert({ name: "Alice", email: "alice@example.com" });
   * console.log(user?.id); // 1
   */
  insert(item: T): Promise<EntityWithUpdate<T> | null>;

  /**
   * Updates records matching `filter` with the fields in `partial`.
   * Automatically sets `updatedAt`. Fires `onUpdateBefore` / `onUpdateAfter` hooks.
   * Returns the updated record after the write.
   *
   * @example
   * const updated = await db.User.update({ id: 1 }, { name: "Alice Smith" });
   * console.log(updated?.name); // "Alice Smith"
   */
  update(filter: Partial<T>, partial: Partial<T>): Promise<EntityWithUpdate<T> | null>;

  /**
   * Deletes the record matching `filter`.
   * Fires `onDeleteBefore` / `onDeleteAfter` hooks if defined.
   * Returns the deleted record (or the filter object if the record was not fetched).
   *
   * @example
   * await db.User.delete({ id: 1 });
   */
  delete(filter: Partial<T>): Promise<T | Partial<T>>;

  /**
   * Fetches a single record matching `filter`.
   * Returns `null` if no match is found.
   * The returned record has `update`, `delete`, and `refresh` methods attached.
   *
   * @example
   * const user = await db.User.get({ id: 1 });
   * if (user) {
   *   await user.update({ name: "Bob" });
   *   await user.delete();
   * }
   */
  get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null>;

  /**
   * Fetches all records from the table with no filter applied.
   * Use `query()` for filtering, ordering, and pagination.
   *
   * @example
   * const users = await db.User.getAll();
   * console.log(users.length);
   */
  getAll(): Promise<T[]>;

  /**
   * Returns a chainable query builder for advanced queries —
   * filtering, ordering, pagination, preloading relations, window functions, etc.
   *
   * @example
   * const users = await db.User.query()
   *   .where("status", "=", "active")
   *   .preload("profile")
   *   .orderBy("createdAt", "DESC")
   *   .limit(10)
   *   .get();
   *
   * const first = await db.User.query()
   *   .where("email", "=", "alice@example.com")
   *   .first();
   */
  query(): ExtendedQueryBuilder<T>;

  /**
   * Counts records matching an optional filter.
   * Returns 0 if no records match.
   *
   * @example
   * const total = await db.User.count();
   * const activeCount = await db.User.count({ status: "active" });
   */
  count(filter?: Partial<T>): Promise<number>;

  /**
   * Returns the sum of `column` across records matching an optional filter.
   *
   * @example
   * const totalScore = await db.User.sum("score");
   * const teamScore  = await db.User.sum("score", { status: "active" });
   */
  sum(column: keyof T & string, filter?: Partial<T>): Promise<number>;

  /**
   * Returns the average of `column` across records matching an optional filter.
   *
   * @example
   * const avgScore = await db.User.avg("score");
   * const avgActive = await db.User.avg("score", { status: "active" });
   */
  avg(column: keyof T & string, filter?: Partial<T>): Promise<number>;

  /**
   * Returns the minimum value of `column` across records matching an optional filter.
   *
   * @example
   * const lowest = await db.User.min("score");
   */
  min(column: keyof T & string, filter?: Partial<T>): Promise<number>;

  /**
   * Returns the maximum value of `column` across records matching an optional filter.
   *
   * @example
   * const highest = await db.User.max("score");
   */
  max(column: keyof T & string, filter?: Partial<T>): Promise<number>;

  /**
   * Returns `true` if at least one record matches `filter`, `false` otherwise.
   *
   * @example
   * const taken = await db.User.exists({ email: "alice@example.com" });
   * if (taken) throw new Error("Email already in use");
   */
  exists(filter: Partial<T>): Promise<boolean>;

  /**
   * Deletes every record in the table. Cannot be undone.
   * Useful for test teardown or resetting seed data.
   *
   * @example
   * await db.User.truncate();
   */
  truncate(): Promise<void>;

  /**
   * Inserts multiple records in a single operation (wrapped in a transaction on SQLite).
   * Returns the number of rows inserted.
   * Automatically sets `createdAt` and `updatedAt` on each row.
   *
   * @example
   * const count = await db.User.insertMany([
   *   { name: "Alice", email: "alice@example.com" },
   *   { name: "Bob",   email: "bob@example.com"   },
   * ]);
   * console.log(count); // 2
   */
  insertMany(items: T[]): Promise<number>;

  /**
   * Updates all records matching `filter` with the fields in `data`.
   * Returns the number of affected rows.
   * Automatically sets `updatedAt`.
   *
   * @example
   * const affected = await db.User.updateMany({ status: "inactive" }, { status: "banned" });
   * console.log(affected); // number of rows updated
   */
  updateMany(filter: Partial<T>, data: Partial<T>): Promise<number>;

  /**
   * Deletes all records matching `filter`.
   * Returns the number of affected rows.
   *
   * @example
   * const removed = await db.User.deleteMany({ status: "banned" });
   * console.log(removed); // number of rows deleted
   */
  deleteMany(filter: Partial<T>): Promise<number>;

  /**
   * Inserts `data` if no record matches `filter`, or updates the existing record.
   * Returns `"inserted"` or `"updated"` to indicate what happened.
   *
   * @example
   * const result = await db.User.upsert(
   *   { email: "alice@example.com" },
   *   { name: "Alice", email: "alice@example.com" }
   * );
   * console.log(result); // "inserted" | "updated"
   */
  upsert(filter: Partial<T>, data: T): Promise<"inserted" | "updated">;

  /**
   * Returns the existing record matching `filter` if found.
   * If no match, inserts `defaults` and returns the new record.
   * Always returns `{ record, created }` — `created` is `true` only on insert.
   *
   * @example
   * const { record, created } = await db.User.findOrCreate(
   *   { email: "alice@example.com" },
   *   { name: "Alice", email: "alice@example.com" }
   * );
   * console.log(created); // true if this was a new insert
   */
  findOrCreate(filter: Partial<T>, defaults: T): Promise<{ record: T; created: boolean }>;

  /**
   * Restores a soft-deleted record by clearing its `deletedAt` field.
   * Only meaningful on models that use `@softDelete`.
   *
   * @example
   * await db.User.restore({ id: 1 });
   */
  restore(filter: Partial<T>): Promise<void>;

  /**
   * Validates `data` against `rules` and throws a `ValidationError` if any rule fails.
   * Use `check()` instead if you want the errors returned rather than thrown.
   *
   * @example
   * db.User.validate(
   *   { email: "not-an-email" },
   *   { email: { required: true, email: true } }
   * );
   * // throws ValidationError: { email: "Must be a valid email address" }
   */
  validate(data: Partial<T>, rules: FieldRules<T>): void;

  /**
   * Validates `data` against `rules` and returns a map of field errors,
   * or `null` if validation passes. Does not throw.
   *
   * @example
   * const errors = db.User.check(
   *   { email: "not-an-email" },
   *   { email: { required: true, email: true } }
   * );
   * if (errors) console.log(errors.email); // "Must be a valid email address"
   */
  check(data: Partial<T>, rules: FieldRules<T>): Record<string, string> | null;

  /**
   * Eagerly loads a single related record for the first result of a query.
   * Returns the related record or `null` if not found.
   *
   * @example
   * const profile = await db.User.withOne("profile");
   * console.log(profile?.gender);
   */
  withOne<K extends keyof T & string>(relation: K): Promise<T[K] | null>;

  /**
   * Eagerly loads a collection of related records for the first result of a query.
   * Returns an empty array if no related records are found.
   *
   * @example
   * const posts = await db.User.withMany("posts");
   * posts.forEach(p => console.log(p.title));
   */
  withMany<K extends keyof T & string>(relation: K): Promise<T[K][]>;

  /**
   * Preloads a relation for all results returned by a query.
   * Prefer using `.query().preload("relation")` for more control.
   *
   * @example
   * await db.User.preload("profile");
   *
   * // More common usage via query builder:
   * const users = await db.User.query().preload("profile").preload("posts").get();
   */
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
  await migrator.ensureTable(
    tableName,
    schemaForTable?.fields || {},
    schemaForTable?.relations
  );
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

    function serializeValue(col: string, value: any): any {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const fieldMeta = modelSchema.fields?.[col]?.meta;
  if (fieldMeta?.json && value !== null && typeof value === "object") {
    try { return JSON.stringify(value); } catch { return null; }
  }
  return value;
}

async function scalarAggregate(fn: string, column: string, filter?: Partial<T>): Promise<number> {
  if (driver === "mongodb") {
    const res = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "find", filter: filter ?? {} })
    );
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
  const sql = `SELECT ${fn}(${w(column)}) as __val FROM ${w(tableName)} ${whereClause}`;
  const res = await adapter.exec(sql, params);
  return parseFloat(res.rows?.[0]?.__val ?? "0");
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
    if (modified !== undefined) item = modified;
  }

  let insertedId: number | undefined;

  if (driver === "mongodb") {
    await adapter.exec(
      JSON.stringify({ collection: tableName, action: "insert", data: [item] })
    );
  } else {
    const isJsonField = (col: string) => {
      const meta = modelSchema.fields[col]?.meta;
      return !!(meta?.json || meta?.["@json"]);
    };

    const cols = Object.keys(item).filter((c) => {
      const value = (item as any)[c];
      if (value === undefined) return false;
      if (value === null) return true;
      if (value instanceof Date) return true;
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

    if (driver === "sqlite" && result?.lastID)       insertedId = result.lastID;
    if (driver === "mysql"  && result?.insertId)     insertedId = result.insertId;
    if (driver === "postgres" && result?.rows?.[0]?.id) insertedId = result.rows[0].id;

    // Postgres RETURNING * gives us the full row — no extra fetch needed
    if (driver === "postgres" && result?.rows?.[0]) {
      const row = result.rows[0];
      if (hooks?.onCreateAfter) await hooks.onCreateAfter(row);
      return row as any;
    }

    if (insertedId) (item as any).id = insertedId;
  }

  // Fetch inserted row — clean single path, no fallback scan
  let inserted: any = null;

  if ((item as any).id) {
    inserted = await this.get({ id: (item as any).id } as any);
  }

  if (!inserted && driver === "sqlite") {
    try {
      if (modelSchema?.fields?.["id"]) {
        const lr = await adapter.exec("SELECT last_insert_rowid() as id");
        const lastId = lr.rows?.[0]?.id;
        if (lastId) {
          (item as any).id = lastId;
          inserted = await this.get({ id: lastId } as any);
        }
      }
    } catch {}
  }

  // Last resort: match by unique-ish fields — but only email since
  // title+userId are not unique enough to be reliable
  if (!inserted && (item as any).email) {
    try {
      inserted = await this.get({ email: (item as any).email } as any);
    } catch {}
  }

  if (hooks?.onCreateAfter && inserted) await hooks.onCreateAfter(inserted);
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

  const needsRecord = !!(hooks?.onDeleteBefore || hooks?.onDeleteAfter);
  const toDelete = needsRecord ? await this.get(filter) : null;

  if (hooks?.onDeleteBefore) await hooks.onDeleteBefore(toDelete || filter);

  if (driver === "mongodb") {
    await adapter.exec(
      JSON.stringify({ collection: tableName, action: "delete", filter })
    );
  } else {
    const { clause, params } = buildWhereClause(filter);
    await adapter.exec(`DELETE FROM ${tableName} WHERE ${clause}`, params);
  }

  if (hooks?.onDeleteAfter) await hooks.onDeleteAfter(toDelete || filter);
  return toDelete || filter;
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
      /** @inheritdoc */
      async count(filter?: Partial<T>) {
  if (driver === "mongodb") {
    const res = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "find", filter: filter ?? {} })
    );
    return res.rows.length;
  }
  const isPg = driver === "postgres";
  const keys = filter ? Object.keys(filter) : [];
  const whereClause = keys.length
    ? "WHERE " + keys.map((k, i) => `"${k}" = ${isPg ? `$${i + 1}` : "?"}`).join(" AND ")
    : "";
  const params = keys.map((k) => (filter as any)[k]);
  const sql = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
  const res = await adapter.exec(sql, params);
  return parseInt(res.rows?.[0]?.count ?? "0", 10);
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


// scalar aggregates
async sum(column: keyof T & string, filter?: Partial<T>) {
  return scalarAggregate("SUM", column, filter);
},
async avg(column: keyof T & string, filter?: Partial<T>) {
  return scalarAggregate("AVG", column, filter);
},
async min(column: keyof T & string, filter?: Partial<T>) {
  return scalarAggregate("MIN", column, filter);
},
async max(column: keyof T & string, filter?: Partial<T>) {
  return scalarAggregate("MAX", column, filter);
},

// bulk insertMany
async insertMany(items: T[]) {
  if (!items.length) return 0;
  const now = new Date().toISOString();
  const prepared = items.map((item) => {
    const row = { ...item } as any;
    if (row.createdAt === undefined) row.createdAt = now;
    if (row.updatedAt === undefined) row.updatedAt = now;
    return row;
  });

  if (driver === "mongodb") {
    await adapter.exec(
      JSON.stringify({ collection: tableName, action: "insert", data: prepared })
    );
    return prepared.length;
  }

  const cols = Object.keys(prepared[0]).filter((c) => prepared[0][c] !== undefined);
  const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;

  if (driver === "sqlite") {
    await adapter.exec("BEGIN", []);
    try {
      for (const row of prepared) {
        const values = cols.map((c) => serializeValue(c, row[c]));
        const sql = `INSERT INTO ${w(tableName)} (${cols.map(w).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
        await adapter.exec(sql, values);
      }
      await adapter.exec("COMMIT", []);
    } catch (err) {
      await adapter.exec("ROLLBACK", []);
      throw err;
    }
    return prepared.length;
  }

  // postgres / mysql single multi-row insert
  const allValues: any[] = [];
  const isPg = driver === "postgres";
  const rowPlaceholders = prepared.map((row, rowIdx) => {
    const phs = cols.map((c, colIdx) => {
      allValues.push(serializeValue(c, row[c]));
      return isPg ? `$${rowIdx * cols.length + colIdx + 1}` : "?";
    });
    return `(${phs.join(", ")})`;
  });
  const sql = `INSERT INTO ${w(tableName)} (${cols.map(w).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
  await adapter.exec(sql, allValues);
  return prepared.length;
},

// bulk updateMany
async updateMany(filter: Partial<T>, data: Partial<T>) {
  if (!Object.keys(filter).length) throw new Error("updateMany filter cannot be empty");
  if (!Object.keys(data).length) throw new Error("updateMany data cannot be empty");
  const now = new Date().toISOString();
  if ((data as any).updatedAt === undefined) (data as any).updatedAt = now;

  if (driver === "mongodb") {
    const res = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "update", filter, data })
    );
    return res.changes ?? 0;
  }

  const isPg = driver === "postgres";
  const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
  const setCols = Object.keys(data);
  const whereCols = Object.keys(filter);
  const setClause = setCols.map((c, i) => `${w(c)} = ${isPg ? `$${i + 1}` : "?"}`).join(", ");
  const whereClause = whereCols.map((c, i) => `${w(c)} = ${isPg ? `$${setCols.length + i + 1}` : "?"}`).join(" AND ");
  const values = [
    ...setCols.map((c) => serializeValue(c, (data as any)[c])),
    ...whereCols.map((c) => (filter as any)[c]),
  ];
  const res = await adapter.exec(`UPDATE ${w(tableName)} SET ${setClause} WHERE ${whereClause}`, values);
  return res.changes ?? 0;
},

// bulk deleteMany
async deleteMany(filter: Partial<T>) {
  if (!Object.keys(filter).length) throw new Error("deleteMany filter cannot be empty");
  if (driver === "mongodb") {
    const res = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "delete", filter })
    );
    return res.changes ?? 0;
  }
  const isPg = driver === "postgres";
  const w = (c: string) => driver === "mysql" ? `\`${c}\`` : `"${c}"`;
  const whereCols = Object.keys(filter);
  const whereClause = whereCols.map((c, i) => `${w(c)} = ${isPg ? `$${i + 1}` : "?"}`).join(" AND ");
  const values = whereCols.map((c) => (filter as any)[c]);
  const res = await adapter.exec(`DELETE FROM ${w(tableName)} WHERE ${whereClause}`, values);
  return res.changes ?? 0;
},

// upsert
async upsert(filter: Partial<T>, data: T) {
  const self = this;
  if (driver === "mongodb") {
    const check = await adapter.exec(
      JSON.stringify({ collection: tableName, action: "find", filter })
    );
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
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const conflictCols = filterCols.map((c) => `"${c}"`).join(", ");
    const updateSet = cols
      .filter((c) => !filterCols.includes(c))
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");
    await adapter.exec(
      `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})
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

  // sqlite manual
  const existing = await this.get(filter);
  if (existing) {
    await this.updateMany(filter, data);
    return "updated" as const;
  }
  await this.insertMany([data]);
  return "inserted" as const;
},

// findOrCreate
async findOrCreate(filter: Partial<T>, defaults: T) {
  const existing = await this.get(filter);
  if (existing) return { record: existing as T, created: false };
  await this.insertMany([defaults]);
  const created = await this.get(filter);
  return { record: created as T, created: true };
},

// restore (undo soft delete)
async restore(filter: Partial<T>) {
  await this.updateMany(filter, { deletedAt: null } as any);
},

// validation — inline, no extra import needed in user code
validate(data: Partial<T>, rules: FieldRules<T>) {
  new Validator<T>(rules).validate(data);
},
check(data: Partial<T>, rules: FieldRules<T>) {
  return new Validator<T>(rules).check(data);
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
