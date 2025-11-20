import { DBAdapter } from "./dbAdapter.js";
import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import fs from "fs";
import path from "path";
import type { RelationDef, EntityWithUpdate } from "./types";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
import { fileURLToPath } from "url";



function q(driver: string, col: string) {
  if (driver === "postgres") return `"${col}"`;
  if (driver === "mysql") return `\`${col}\``;
  return col; // sqlite
}

function placeholder(driver: string, index: number) {
  return driver === "postgres" ? `$${index}` : "?";
}

type ModelAPI<T extends Record<string, any>> = {
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
  withOne<K extends keyof T & string>(relation: K): Promise<any | null>;

  /** Loads multiple related records */
  withMany<K extends keyof T & string>(relation: K): Promise<any[]>;

  /** Preloads a relation for future queries */
  preload<K extends keyof T & string>(relation: K): Promise<void>;
};



async function loadSchema(adapterDir: string) {
      // Use process.cwd() to get the project root
    const jsPath = path.join(process.cwd(), adapterDir, "schema", "generated.js");
    const tsPath = path.join(process.cwd(), adapterDir, "schema", "generated.ts");
  try {
    if (fs.existsSync(jsPath)) {
      const { schema } = await import(`file://${jsPath}`);
      return schema;
    } else if (fs.existsSync(tsPath)) {
      const { schema } = await import(`file://${tsPath}`);
      return schema;
    } else {
      console.error("tried: ", jsPath, tsPath)

      throw new Error("No schema file found (js or ts).");
    }
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
export async function createModelFactory(adapter: DBAdapter) {
  const schemas = await loadSchema(adapter.dir!);
  // console.log("schemas: ", schemas)

  /**
   * Defines a new model for a specific table.
   *
   * @param table - Database table name
   * @param modelName - Optional name for the model
   * @param hooks - Optional lifecycle hooks for CRUD operations
   * @returns The model API for interacting with the table
   */
  return function defineModel<T extends Record<string, any>>(
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

    const modelSchema = schemas[name] || {
      fields: {},
      relations: [] as RelationDef[],
    };
    const driver = adapter.driver as
      | "sqlite"
      | "postgres"
      | "mysql"
      | "mongodb"
      | undefined;
    const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);

    /** Ensures the table exists and is up-to-date */
    async function ensure() {
      await migrator.ensureTable(tableName, modelSchema.fields || {});
    }
  

    /**
     * Builds a WHERE clause for SQL queries
     *
     * @param filter - Object with key-value pairs to filter by
     * @returns SQL clause and parameters
     */
    function buildWhereClause(filter: Partial<T>) {
      const keys = Object.keys(filter);
      if (!keys.length)
        throw new Error("Filter must contain at least one field");

      const driverType = adapter.driver!;
      if (driverType === "mongodb") {
        return { mongoFilter: filter };
      }

      const clause = keys
        .map((k, i) =>
          driverType === "postgres"
            ? `"${k}" = $${i + 1}` // QUOTE THE FIELD
            : `${k} = ?`
        )
        .join(" AND ");

      const params = keys.map((k) => filter[k as keyof T]);

      return { clause, params };
    }

    return {
      /** @inheritdoc */
async insert(item: T) {
  await ensure();

  if (hooks?.onCreateBefore) {
    const modified = await hooks.onCreateBefore(item);
    if (modified === undefined) return null;
    item = modified;
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
    // Only keep primitive values
    const cols = Object.keys(item).filter(
      (c) => typeof item[c as keyof T] !== "object"
    );

    const values = cols.map((c) => item[c as keyof T]);

    // PostgreSQL uses $1, $2... placeholders
    const placeholders =
      driver === "postgres"
        ? cols.map((_, i) => `$${i + 1}`).join(", ")
        : cols.map(() => "?").join(", ");

    // Quote columns for MySQL/Postgres
    const wrap = (c: string) =>
      driver === "mysql" ? `\`${c}\`` : `"${c}"`;

    // Ensure columns match DB exactly: convert JS keys to match DB
    const sqlCols = cols.map(wrap).join(",");

    const sql = `INSERT INTO ${wrap(tableName)} (${sqlCols}) VALUES (${placeholders}) RETURNING *`;

    const result: any = await adapter.exec(sql, values);

    // Handle inserted ID
    if (driver === "sqlite" && result?.lastID) insertedId = result.lastID;
    if (driver === "mysql" && result?.insertId) insertedId = result.insertId;
    if (driver === "postgres" && result?.rows?.[0]?.id)
      insertedId = result.rows[0].id;

    if (insertedId) (item as any).id = insertedId;
  }

  // Retrieve inserted row to include defaults, etc.
  const inserted = await this.get(item);

  if (hooks?.onCreateAfter && inserted) {
    await hooks.onCreateAfter(inserted);
  }

  return inserted;
}
,

      /** @inheritdoc */
      async update(where: Partial<T>, data: Partial<T>) {
        await ensure();
        const before = await this.get(where);

        if (!where || !Object.keys(where).length)
          throw new Error("Update 'where' condition required");

        if (!data || !Object.keys(data).length)
          throw new Error("Update data cannot be empty");

        if (hooks?.onUpdateBefore) {
          const modified = await hooks.onUpdateBefore(before, data);
          if (modified === undefined) return before;
          data = modified;
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
        await ensure();
        if (!Object.keys(filter).length)
          throw new Error("Delete filter cannot be empty");
        const toDelete = await this.get(filter);
        if (hooks?.onDeleteBefore) {
          const res = await hooks.onDeleteBefore(toDelete || filter);
          if (res === undefined) return filter;
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
        await ensure();
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
        Object.defineProperty(record, "update", {
          value: async (data: Partial<T>) => this.update(filter, data),
          enumerable: false,
        });
        return record as EntityWithUpdate<T>;
      },

      /** @inheritdoc */
      async getAll() {
        await ensure();
        const res =
          driver === "mongodb"
            ? await adapter.exec(
                JSON.stringify({ collection: tableName, action: "find" })
              )
            : await adapter.exec(`SELECT * FROM ${tableName}`);
        return res.rows.map((r: T) => mapBooleans(r, modelSchema.fields));
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
        await ensure();
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
        await ensure();
        const { clause, params } = buildWhereClause(filter);
        const sql = `SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`;
        const res = await adapter.exec(sql, params);
        return !!res.rows.length;
      },

      /** @inheritdoc */
      async truncate() {
        await ensure();
        await adapter.exec(`DELETE FROM ${tableName}`);
      },

      /** @inheritdoc */
      async withOne<K extends keyof T & string>(_relation: K) {
        throw new Error("withOne not yet implemented");
      },

      /** @inheritdoc */
      async withMany<K extends keyof T & string>(_relation: K) {
        throw new Error("withMany not yet implemented");
      },

      /** @inheritdoc */
      async preload<K extends keyof T & string>(_relation: K) {
        return;
      },
    } as ModelAPI<T>;
  };
}
