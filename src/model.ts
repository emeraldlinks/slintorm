import { DBAdapter } from "./dbAdapter.js";
import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import fs from "fs";
import path from "path";
import type { RelationDef, EntityWithUpdate } from "./types";

type ModelAPI<T extends Record<string, any>> = {
  insert(item: T): Promise<T>;
  update(filter: Partial<T>, partial: Partial<T>): Promise<T | null>;
  delete(filter: Partial<T>): Promise<Partial<T>>;
  get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null>;
  getAll(): Promise<T[]>;
  query(): QueryBuilder<T>;
  count(filter?: Partial<T>): Promise<number>;
  exists(filter: Partial<T>): Promise<boolean>;
  truncate(): Promise<void>;
  withOne<K extends keyof T & string>(relation: K): Promise<any | null>;
  withMany<K extends keyof T & string>(relation: K): Promise<any[]>;
  preload<K extends keyof T & string>(relation: K): Promise<void>;
};

export async function createModelFactory(adapter: DBAdapter) {
  const schemaPath = path.join(process.cwd(), "schema", "generated.json");
  const schemas: Record<string, any> = fs.existsSync(schemaPath)
    ? JSON.parse(fs.readFileSync(schemaPath, "utf8"))
    : {};

  return function defineModel<T extends Record<string, any>>(
    table: string,
    modelName?: string
  ): ModelAPI<T> {
    const tableName = table;
    const name =
      modelName ||
      Object.keys(schemas).find((k) => schemas[k].table === tableName) ||
      tableName;

    const modelSchema = schemas[name] || {
      fields: {},
      relations: [] as RelationDef[],
    };
    // console.log("adapter: ", adapter)
    const driver = adapter.driver as
      | "sqlite"
      | "postgres"
      | "mysql"
      | undefined;
    // console.log("Very:_ ", driver)
    const migrator = new Migrator(adapter.exec.bind(adapter), driver!);

    async function ensure() {
      await migrator.ensureTable(tableName, modelSchema.fields || {});
    }

    function buildWhereClause(filter: Partial<T>) {
      const keys = Object.keys(filter);
      if (!keys.length)
        throw new Error("Filter must contain at least one field");

      if (adapter.driver === "mongodb") {
        return { mongoFilter: filter };
      }

      // For SQL adapters
      const clause = keys
        .map(
          (k, i) =>
            `${k} = ${adapter.driver === "postgres" ? `$${i + 1}` : "?"}`
        )
        .join(" AND ");
      const params = keys.map((k) => filter[k as keyof T]);
      return { clause, params };
    }

    return {
      async insert(item: T) {
        await ensure();

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "insert",
            data: [item],
          });
          await adapter.exec(cmd);
        } else {
          const cols = Object.keys(item).filter(
            (c) => typeof item[c as keyof T] !== "object"
          ); // ignore relations
          let sql: string;
          let values = cols.map((c) => item[c as keyof T]);

          if (adapter.driver === "postgres") {
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
            sql = `INSERT INTO "${tableName}" (${cols
              .map((c) => `"${c}"`)
              .join(",")}) VALUES (${placeholders})`;
          } else if (adapter.driver === "mysql") {
            const placeholders = cols.map(() => "?").join(", ");
            sql = `INSERT INTO \`${tableName}\` (${cols
              .map((c) => `\`${c}\``)
              .join(",")}) VALUES (${placeholders})`;
          } else if (adapter.driver === "sqlite") {
            const placeholders = cols.map(() => "?").join(", ");
            sql = `INSERT INTO "${tableName}" (${cols
              .map((c) => `"${c}"`)
              .join(",")}) VALUES (${placeholders})`;
          } else {
            throw new Error(`Unsupported driver: ${adapter.driver}`);
          }

          await adapter.exec(sql, values);

          /////---->
        }

        return item;
      },

      async update(where: Partial<T>, data: Partial<T>): Promise<T | null> {
        await ensure();

        if (!where || !Object.keys(where).length)
          throw new Error("Update 'where' condition required");

        if (!data || !Object.keys(data).length)
          throw new Error("Update data cannot be empty");

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "update",
            filter: where,
            data,
          });
          await adapter.exec(cmd);
        } else {
          const setCols = Object.keys(data) as (keyof T)[];
          const setClause = setCols.map((c) => `${String(c)} = ?`).join(", ");
          const setValues = setCols.map((c) =>
            data[c] !== undefined ? data[c] : null
          ) as (T[keyof T] | null)[];

          const whereCols = Object.keys(where) as (keyof T)[];
          const whereClause = whereCols
            .map((c) => `${String(c)} = ?`)
            .join(" AND ");
          const whereValues = whereCols.map((c) => where[c]);

          const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
          const result = await adapter.exec(sql, [
            ...setValues,
            ...whereValues,
          ]);

          if ("changes" in result && result.changes === 0) {
            console.warn(`No rows updated for`, where);
          }
        }

        // Fetch and return updated record
        return await this.get(where);
      },

      async delete(filter: Partial<T>) {
        await ensure();
        if (!Object.keys(filter).length)
          throw new Error("Delete filter cannot be empty");

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "delete",
            filter,
          });
          await adapter.exec(cmd);
        } else {
          const { clause, params } = buildWhereClause(filter);
          const sql = `DELETE FROM ${tableName} WHERE ${clause}`;
          console.log("DELETE SQL:", sql, "PARAMS:", params);

          await adapter.exec(sql, params);
        }

        return filter;
      },

     async get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null> {
  await ensure();

  if (!Object.keys(filter).length) throw new Error("Get filter cannot be empty");

  let record: T | null = null;
  if (adapter.driver === "mongodb") {
    const cmd = JSON.stringify({ collection: tableName, action: "find", filter });
    const res = await adapter.exec(cmd);
    record = res.rows[0] || null;
  } else {
    const { clause, params } = buildWhereClause(filter);
    const sql = `SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1`;
    const res = await adapter.exec(sql, params);
    record = res.rows[0] || null;
  }

  if (!record) return null;

  // Map boolean fields
  record = mapBooleans(record, modelSchema.fields);

  Object.defineProperty(record, "update", {
    value: async (data: Partial<T>) => this.update(filter, data),
    enumerable: false,
    configurable: true,
    writable: false,
  });

  return record as EntityWithUpdate<T>;
}

 ,





      async getAll() {
  await ensure();
  let rows: T[] = [];

  if (adapter.driver === "mongodb") {
    const cmd = JSON.stringify({ collection: tableName, action: "find" });
    const res = await adapter.exec(cmd);
    rows = res.rows;
  } else {
    const res = await adapter.exec(`SELECT * FROM ${tableName}`);
    rows = res.rows;
  }

  return rows.map(row => mapBooleans(row, modelSchema.fields));
}
,

      query() {
        return new QueryBuilder<T>(tableName, adapter.exec.bind(adapter));
      },

      async count(filter?: Partial<T>) {
        await ensure();

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "find",
            filter: filter || {},
          });
          const res = await adapter.exec(cmd);
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

      async exists(filter: Partial<T>) {
        await ensure();
        if (!Object.keys(filter).length)
          throw new Error("Exists filter cannot be empty");

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "find",
            filter,
          });
          const res = await adapter.exec(cmd);
          return res.rows.length > 0;
        } else {
          const { clause, params } = buildWhereClause(filter);
          const sql = `SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`;
          const res = await adapter.exec(sql, params);
          return !!res.rows.length;
        }
      },

      async truncate() {
        await ensure();

        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "delete",
            filter: {},
          });
          await adapter.exec(cmd);
        } else {
          await adapter.exec(`DELETE FROM ${tableName}`);
        }
      },

      async withOne<K extends keyof T & string>(_relation: K) {
        throw new Error(
          "withOne: call on query or entity. Implement later using relations"
        );
      },

      async withMany<K extends keyof T & string>(_relation: K) {
        throw new Error(
          "withMany: call on query or entity. Implement later using relations"
        );
      },

      async preload<K extends keyof T & string>(_relation: K) {
        return;
      },
    } as ModelAPI<T>;
  };
}
