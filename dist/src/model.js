import { Migrator } from "./migrator";
import { QueryBuilder } from "./queryBuilder";
import fs from "fs";
import path from "path";
import generateSchema from "./generator";
export async function createModelFactory(adapter) {
    await generateSchema();
    const schemaPath = path.join(process.cwd(), "schema", "generated.json");
    const schemas = fs.existsSync(schemaPath)
        ? JSON.parse(fs.readFileSync(schemaPath, "utf8"))
        : {};
    return function defineModel(table, modelName) {
        const tableName = table;
        const name = modelName || Object.keys(schemas).find((k) => schemas[k].table === tableName) || tableName;
        const modelSchema = schemas[name] || { fields: {}, relations: [] };
        // console.log("adapter: ", adapter)
        const driver = adapter.driver;
        // console.log("Very:_ ", driver)
        const migrator = new Migrator(adapter.exec.bind(adapter), driver);
        async function ensure() {
            await migrator.ensureTable(tableName, modelSchema.fields || {});
        }
        function buildWhereClause(filter) {
            const keys = Object.keys(filter);
            if (!keys.length)
                throw new Error("Filter must contain at least one field");
            // For SQL, placeholder = ?, For Mongo, we use object filter
            if (adapter.driver === "mongodb") {
                return { mongoFilter: filter };
            }
            else {
                const clause = keys.map((k) => `${k} = ?`).join(" AND ");
                const params = keys.map((k) => filter[k]);
                return { clause, params };
            }
        }
        return {
            async insert(item) {
                await ensure();
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "insert", data: [item] });
                    await adapter.exec(cmd);
                }
                else {
                    const cols = Object.keys(item).filter(c => typeof item[c] !== "object"); // ignore relations
                    let sql;
                    let values = cols.map(c => item[c]);
                    if (adapter.driver === "postgres") {
                        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
                        sql = `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(",")}) VALUES (${placeholders})`;
                    }
                    else if (adapter.driver === "mysql") {
                        const placeholders = cols.map(() => "?").join(", ");
                        sql = `INSERT INTO \`${tableName}\` (${cols.map(c => `\`${c}\``).join(",")}) VALUES (${placeholders})`;
                    }
                    else if (adapter.driver === "sqlite") {
                        const placeholders = cols.map(() => "?").join(", ");
                        sql = `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(",")}) VALUES (${placeholders})`;
                    }
                    else {
                        throw new Error(`Unsupported driver: ${adapter.driver}`);
                    }
                    await adapter.exec(sql, values);
                    /////---->
                }
                return item;
            },
            async update(filter, partial) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Update filter cannot be empty");
                if (!Object.keys(partial).length)
                    return null;
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "update", filter, data: partial });
                    await adapter.exec(cmd);
                }
                else {
                    const setCols = Object.keys(partial);
                    const setClause = setCols.map((c) => `${c} = ?`).join(", ");
                    const { clause: whereClause, params: whereParams } = buildWhereClause(filter);
                    const values = setCols.map((c) => partial[c] ?? null); // ensure no undefined
                    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
                    await adapter.exec(sql, [...values, ...whereParams]);
                }
                return { ...filter, ...partial };
            },
            async delete(filter) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Delete filter cannot be empty");
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "delete", filter });
                    await adapter.exec(cmd);
                }
                else {
                    const { clause, params } = buildWhereClause(filter);
                    const sql = `DELETE FROM ${tableName} WHERE ${clause}`;
                    await adapter.exec(sql, params);
                }
                return filter;
            },
            async get(filter) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Get filter cannot be empty");
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "find", filter });
                    const res = await adapter.exec(cmd);
                    return res.rows[0] || null;
                }
                else {
                    const { clause, params } = buildWhereClause(filter);
                    const sql = `SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1`;
                    const res = await adapter.exec(sql, params);
                    return res.rows[0] || null;
                }
            },
            async getAll() {
                await ensure();
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "find" });
                    const res = await adapter.exec(cmd);
                    return res.rows;
                }
                else {
                    const res = await adapter.exec(`SELECT * FROM ${tableName}`);
                    return res.rows;
                }
            },
            query() {
                return new QueryBuilder(tableName, adapter.exec.bind(adapter));
            },
            async count(filter) {
                await ensure();
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "find", filter: filter || {} });
                    const res = await adapter.exec(cmd);
                    return res.rows.length;
                }
                else {
                    const where = filter && Object.keys(filter).length ? buildWhereClause(filter) : { clause: "1=1", params: [] };
                    const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${where.clause}`;
                    const res = await adapter.exec(sql, where.params);
                    return res.rows[0]?.count ?? 0;
                }
            },
            async exists(filter) {
                await ensure();
                if (!Object.keys(filter).length)
                    throw new Error("Exists filter cannot be empty");
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "find", filter });
                    const res = await adapter.exec(cmd);
                    return res.rows.length > 0;
                }
                else {
                    const { clause, params } = buildWhereClause(filter);
                    const sql = `SELECT 1 FROM ${tableName} WHERE ${clause} LIMIT 1`;
                    const res = await adapter.exec(sql, params);
                    return !!res.rows.length;
                }
            },
            async truncate() {
                await ensure();
                if (adapter.driver === "mongodb") {
                    const cmd = JSON.stringify({ collection: tableName, action: "delete", filter: {} });
                    await adapter.exec(cmd);
                }
                else {
                    await adapter.exec(`DELETE FROM ${tableName}`);
                }
            },
            async withOne(_relation) {
                throw new Error("withOne: call on query or entity. Implement later using relations");
            },
            async withMany(_relation) {
                throw new Error("withMany: call on query or entity. Implement later using relations");
            },
            async preload(_relation) {
                return;
            },
        };
    };
}
