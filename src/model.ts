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
    modelName?: string,
    hooks?: {
      onCreate?: (item: T) => Promise<void> | void;
      onUpdate?: (oldData: T | null, newData: Partial<T>) => Promise<void> | void;
      onDelete?: (deleted: Partial<T>) => Promise<void> | void;
    }
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

    const driver = adapter.driver as "sqlite" | "postgres" | "mysql" | undefined;
    const migrator = new Migrator(adapter.exec.bind(adapter), driver!);

    async function ensure() {
      await migrator.ensureTable(tableName, modelSchema.fields || {});
    }

    function buildWhereClause(filter: Partial<T>) {
      const keys = Object.keys(filter);
      if (!keys.length) throw new Error("Filter must contain at least one field");

      if (adapter.driver === "mongodb") return { mongoFilter: filter };

      const clause = keys
        .map(
          (k, i) => `${k} = ${adapter.driver === "postgres" ? `$${i + 1}` : "?"}`
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
          );
          const values = cols.map((c) => item[c as keyof T]);
          const placeholders = adapter.driver === "postgres"
            ? cols.map((_, i) => `$${i + 1}`).join(", ")
            : cols.map(() => "?").join(", ");
          const wrap = (c: string) =>
            adapter.driver === "mysql" ? `\`${c}\`` : `"${c}"`;
          const sql = `INSERT INTO ${wrap(tableName)} (${cols
            .map(wrap)
            .join(",")}) VALUES (${placeholders})`;
          await adapter.exec(sql, values);
        }

        if (hooks?.onCreate) await hooks.onCreate(item);
        return this.get(item);
      },

      async update(where: Partial<T>, data: Partial<T>): Promise<T | null> {
        await ensure();
        const before = await this.get(where);

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
          const setCols = Object.keys(data);
          const setClause = setCols.map((c) => `${String(c)} = ?`).join(", ");
          const setValues = setCols.map((c) => data[c as keyof T]);
          const whereCols = Object.keys(where);
          const whereClause = whereCols.map((c) => `${String(c)} = ?`).join(" AND ");
          const whereValues = whereCols.map((c) => where[c as keyof T]);
          const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
          await adapter.exec(sql, [...setValues, ...whereValues]);
        }

        const after = await this.get(where);
        if (hooks?.onUpdate) await hooks.onUpdate(before, data);
        return after;
      },

      async delete(filter: Partial<T>) {
        await ensure();
        if (!Object.keys(filter).length)
          throw new Error("Delete filter cannot be empty");

        const toDelete = await this.get(filter);

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
          await adapter.exec(sql, params);
        }

        if (hooks?.onDelete) await hooks.onDelete(toDelete || filter);
        return filter;
      },

      async get(filter: Partial<T>): Promise<EntityWithUpdate<T> | null> {
        await ensure();
        if (!Object.keys(filter).length)
          throw new Error("Get filter cannot be empty");

        let record: T | null = null;
        if (adapter.driver === "mongodb") {
          const cmd = JSON.stringify({
            collection: tableName,
            action: "find",
            filter,
          });
          const res = await adapter.exec(cmd);
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

      async getAll() {
        await ensure();
        const res =
          adapter.driver === "mongodb"
            ? await adapter.exec(
                JSON.stringify({ collection: tableName, action: "find" })
              )
            : await adapter.exec(`SELECT * FROM ${tableName}`);
        return res.rows.map((r: T) => mapBooleans(r, modelSchema.fields));
      },

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
        const { clause, params } = buildWhereClause(filter);
        const sql = `SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`;
        const res = await adapter.exec(sql, params);
        return !!res.rows.length;
      },

      async truncate() {
        await ensure();
        await adapter.exec(`DELETE FROM ${tableName}`);
      },

      async withOne<K extends keyof T & string>(_relation: K) {
        throw new Error("withOne not yet implemented");
      },

      async withMany<K extends keyof T & string>(_relation: K) {
        throw new Error("withMany not yet implemented");
      },

      async preload<K extends keyof T & string>(_relation: K) {
        return;
      },
    } as ModelAPI<T>;
  };
}

