import { Migrator } from "./migrator.js";
import { QueryBuilder, mapBooleans } from "./queryBuilder.js";
import fs from "fs";
import path from "path";
let cachedSchema = null;
/**
 * Factory function to create models with CRUD and query capabilities.
 *
 * @param adapter - Database adapter instance
 * @returns A function to define a model with optional hooks
 */
export async function createModelFactory(adapter) {
    const schemaPath = path.join(process.cwd(), adapter.dir, "schema", "generated.json");
    if (!cachedSchema) {
        cachedSchema = fs.existsSync(schemaPath)
            ? JSON.parse(fs.readFileSync(schemaPath, "utf8"))
            : {};
    }
    const schemas = cachedSchema;
    // console.log("schemas: ", schemas)
    /**
     * Defines a new model for a specific table.
     *
     * @param table - Database table name
     * @param modelName - Optional name for the model
     * @param hooks - Optional lifecycle hooks for CRUD operations
     * @returns The model API for interacting with the table
     */
    return function defineModel(table, modelName, hooks) {
        const tableName = table;
        const name = modelName ||
            Object.keys(schemas).find((k) => schemas[k].table === tableName) ||
            tableName;
        const sqlDriver = (adapter.driver === "sqlite" || adapter.driver === "postgres" || adapter.driver === "mysql")
            ? adapter.driver
            : undefined;
        const modelSchema = schemas[name] || { fields: {}, relations: [] };
        const driver = adapter.driver;
        const migrator = new Migrator(adapter.exec.bind(adapter), sqlDriver);
        /** Ensures the table exists and is up-to-date */
        async function ensure() {
            await migrator.ensureTable(tableName, modelSchema.fields || {});
        }
        (async () => {
            await ensure();
        })();
        /**
         * Builds a WHERE clause for SQL queries
         *
         * @param filter - Object with key-value pairs to filter by
         * @returns SQL clause and parameters
         */
        function buildWhereClause(filter) {
            const keys = Object.keys(filter);
            if (!keys.length)
                throw new Error("Filter must contain at least one field");
            if (adapter.driver === "mongodb")
                return { mongoFilter: filter };
            const clause = keys
                .map((k, i) => `${k} = ${driver === "postgres" ? `$${i + 1}` : "?"}`)
                .join(" AND ");
            const params = keys.map((k) => filter[k]);
            return { clause, params };
        }
        return {
            /** @inheritdoc */
            async insert(item) {
                await ensure();
                if (hooks?.onCreateBefore) {
                    const modified = await hooks.onCreateBefore(item);
                    if (modified === undefined)
                        return null;
                    item = modified;
                }
                let insertedId;
                if (driver === "mongodb") {
                    await adapter.exec(JSON.stringify({ collection: tableName, action: "insert", data: [item] }));
                }
                else {
                    const cols = Object.keys(item).filter((c) => typeof item[c] !== "object");
                    const values = cols.map((c) => item[c]);
                    const placeholders = driver === "postgres" ? cols.map((_, i) => `$${i + 1}`).join(", ") : cols.map(() => "?").join(", ");
                    const wrap = (c) => (driver === "mysql" ? `\`${c}\`` : `"${c}"`);
                    const sql = `INSERT INTO ${wrap(tableName)} (${cols.map(wrap).join(",")}) VALUES (${placeholders})`;
                    const result = await adapter.exec(sql, values);
                    if (driver === "sqlite" && result?.lastID)
                        insertedId = result.lastID;
                    if (driver === "mysql" && result?.insertId)
                        insertedId = result.insertId;
                    if (driver === "postgres" && result?.rows?.[0]?.id)
                        insertedId = result.rows[0].id;
                    if (insertedId)
                        item.id = insertedId;
                }
                const inserted = await this.get(item);
                if (hooks?.onCreateAfter && inserted)
                    await hooks.onCreateAfter(inserted);
                return inserted;
            },
            /** @inheritdoc */
            async update(where, data) {
                await ensure();
                const before = await this.get(where);
                if (!where || !Object.keys(where).length)
                    throw new Error("Update 'where' condition required");
                if (!data || !Object.keys(data).length)
                    throw new Error("Update data cannot be empty");
                if (hooks?.onUpdateBefore) {
                    const modified = await hooks.onUpdateBefore(before, data);
                    if (modified === undefined)
                        return before;
                    data = modified;
                }
                if (driver === "mongodb") {
                    await adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter: where, data }));
                }
                else {
                    const setCols = Object.keys(data);
                    const setClause = setCols.map((c) => `${String(c)} = ?`).join(", ");
                    const setValues = setCols.map((c) => data[c]);
                    const whereCols = Object.keys(where);
                    const whereClause = whereCols.map((c) => `${String(c)} = ?`).join(" AND ");
                    const whereValues = whereCols.map((c) => where[c]);
                    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
                    await adapter.exec(sql, [...setValues, ...whereValues]);
                }
                const after = await this.get(where);
                if (hooks?.onUpdateAfter)
                    await hooks.onUpdateAfter(before, after || data);
                return after;
            },
            /** @inheritdoc */
            async delete(filter) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Delete filter cannot be empty");
                const toDelete = await this.get(filter);
                if (hooks?.onDeleteBefore) {
                    const res = await hooks.onDeleteBefore(toDelete || filter);
                    if (res === undefined)
                        return filter;
                }
                if (driver === "mongodb") {
                    await adapter.exec(JSON.stringify({ collection: tableName, action: "delete", filter }));
                }
                else {
                    const { clause, params } = buildWhereClause(filter);
                    const sql = `DELETE FROM ${tableName} WHERE ${clause}`;
                    await adapter.exec(sql, params);
                }
                if (hooks?.onDeleteAfter)
                    await hooks.onDeleteAfter(toDelete || filter);
                return filter;
            },
            /** @inheritdoc */
            async get(filter) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Get filter cannot be empty");
                let record = null;
                if (driver === "mongodb") {
                    const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter }));
                    record = res.rows[0] || null;
                }
                else {
                    const { clause, params } = buildWhereClause(filter);
                    const sql = `SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1`;
                    const res = await adapter.exec(sql, params);
                    record = res.rows[0] || null;
                }
                if (!record)
                    return null;
                record = mapBooleans(record, modelSchema.fields);
                Object.defineProperty(record, "update", {
                    value: async (data) => this.update(filter, data),
                    enumerable: false,
                });
                return record;
            },
            /** @inheritdoc */
            async getAll() {
                await ensure();
                const res = driver === "mongodb"
                    ? await adapter.exec(JSON.stringify({ collection: tableName, action: "find" }))
                    : await adapter.exec(`SELECT * FROM ${tableName}`);
                return res.rows.map((r) => mapBooleans(r, modelSchema.fields));
            },
            /** @inheritdoc */
            query() {
                return new QueryBuilder(tableName, adapter.dir, adapter.exec.bind(adapter));
            },
            /** @inheritdoc */
            async count(filter) {
                await ensure();
                if (driver === "mongodb") {
                    const res = await adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter || {} }));
                    return res.rows.length;
                }
                else {
                    const where = filter && Object.keys(filter).length ? buildWhereClause(filter) : { clause: "1=1", params: [] };
                    const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${where.clause}`;
                    const res = await adapter.exec(sql, where.params);
                    return res.rows[0]?.count ?? 0;
                }
            },
            /** @inheritdoc */
            async exists(filter) {
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
            async withOne(_relation) {
                throw new Error("withOne not yet implemented");
            },
            /** @inheritdoc */
            async withMany(_relation) {
                throw new Error("withMany not yet implemented");
            },
            /** @inheritdoc */
            async preload(_relation) {
                return;
            },
        };
    };
}
