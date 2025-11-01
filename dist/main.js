// slint-orm-full.ts
// Minimal, fully-typed multi-driver ORM prototype
// Supports: sqlite | postgres | mysql | mongo
// Auto-generates schema from `sample` object (no manual schema files).
//
// Note: Types are compile-time only; we use `sample` runtime hints to infer SQL types.
// For stronger runtime validation use Zod and pass zod schema to defineModel().
// Helper: normalize placeholders for Postgres ($1, $2)
function normalizePlaceholders(sql, driver) {
    if (driver === "postgres") {
        let i = 0;
        return sql.replace(/\?/g, () => `$${++i}`);
    }
    return sql;
}
function mapJSTypeToSQL(value, driver) {
    if (value === null || value === undefined)
        return driver === "postgres" || driver === "mysql" ? "TEXT" : "TEXT";
    const t = typeof value;
    if (t === "number")
        return Number.isInteger(value) ? "INTEGER" : (driver === "postgres" ? "REAL" : "REAL");
    if (t === "boolean")
        return driver === "postgres" ? "BOOLEAN" : "BOOLEAN";
    if (t === "object")
        return "JSON";
    return driver === "postgres" || driver === "mysql" ? "VARCHAR(255)" : "TEXT";
}
function fingerprintFromSchema(schema) {
    return JSON.stringify(Object.entries(schema).sort());
}
class DBAdapter {
    constructor(config = {}) {
        this.config = config;
        this._pg = null;
        this._mysql = null;
        this._sqlite = null;
        this._mongoClient = null;
        this._mongoDb = null;
        this.connected = false;
        this.driver = config.driver;
    }
    async connect() {
        if (this.connected)
            return;
        if (!this.driver)
            return;
        if (this.driver === "postgres") {
            const { Client } = await import("pg");
            const cs = this.config.databaseUrl || process.env.DATABASE_URL;
            if (!cs)
                throw new Error("Missing DATABASE_URL for postgres");
            this._pg = new Client({ connectionString: cs });
            await this._pg.connect();
        }
        else if (this.driver === "mysql") {
            const mysql = await import("mysql2/promise");
            this._mysql = await mysql.createConnection({ uri: this.config.databaseUrl || process.env.DATABASE_URL });
        }
        else if (this.driver === "sqlite") {
            const sqlite3 = await import("sqlite3");
            const { open } = await import("sqlite");
            const filename = this.config.databaseUrl || ":memory:";
            this._sqlite = await open({ filename, driver: sqlite3.default.Database });
        }
        else if (this.driver === "mongo") {
            const { MongoClient } = await import("mongodb");
            const cs = this.config.databaseUrl || process.env.DATABASE_URL || "mongodb://localhost:27017";
            this._mongoClient = new MongoClient(cs);
            await this._mongoClient.connect();
            const dbName = (new URL(cs).pathname || "").replace("/", "") || "test";
            this._mongoDb = this._mongoClient.db(dbName);
        }
        this.connected = true;
    }
    async exec(sqlOrOp, params = []) {
        if (!this.driver)
            return { rows: [] };
        await this.connect();
        if (this.driver === "postgres") {
            const sql = normalizePlaceholders(sqlOrOp, this.driver);
            const res = await this._pg.query(sql, params);
            return { rows: res.rows };
        }
        if (this.driver === "mysql") {
            const [rows] = await this._mysql.execute(sqlOrOp, params);
            return { rows };
        }
        if (this.driver === "sqlite") {
            const t = sqlOrOp.trim().toUpperCase();
            if (t.startsWith("SELECT")) {
                const rows = await this._sqlite.all(sqlOrOp, params);
                return { rows };
            }
            await this._sqlite.run(sqlOrOp, params);
            return { rows: [] };
        }
        // For Mongo, sqlOrOp is a JSON-stringified payload instructing operation
        if (this.driver === "mongo") {
            // We expect caller to pass an op string like: "COLLECTION:<name>:FIND" and params [query, opts]
            const [verb, collName, op] = sqlOrOp.split(":");
            const coll = this._mongoDb.collection(collName);
            if (op === "FIND") {
                const [query, opts] = params;
                const docs = await coll.find(query || {}, opts || {}).toArray();
                return { rows: docs };
            }
            if (op === "INSERT") {
                const [doc] = params;
                const r = await coll.insertOne(doc);
                return { rows: [{ insertedId: r.insertedId }] };
            }
            if (op === "UPDATE") {
                const [filter, update, opts] = params;
                const r = await coll.updateMany(filter, update, opts || {});
                return { rows: [{ matchedCount: r.matchedCount, modifiedCount: r.modifiedCount }] };
            }
            if (op === "DELETE") {
                const [filter] = params;
                const r = await coll.deleteMany(filter);
                return { rows: [{ deletedCount: r.deletedCount }] };
            }
            if (op === "AGG") {
                const [pipeline] = params;
                const docs = await coll.aggregate(pipeline).toArray();
                return { rows: docs };
            }
            // raw fallback
            return { rows: [] };
        }
        return { rows: [] };
    }
    async close() {
        if (!this.driver)
            return;
        if (this.driver === "postgres" && this._pg)
            await this._pg.end();
        if (this.driver === "mysql" && this._mysql)
            await this._mysql.end();
        if (this.driver === "sqlite" && this._sqlite)
            await this._sqlite.close();
        if (this.driver === "mongo" && this._mongoClient)
            await this._mongoClient.close();
        this.connected = false;
    }
    getMongoDb() {
        return this._mongoDb;
    }
}
class QueryBuilder {
    constructor(table, keyPath, driver, exec) {
        this.table = table;
        this.keyPath = keyPath;
        this.driver = driver;
        this.exec = exec;
        this._selects = null;
        this._where = [];
        this._joins = [];
        this._groupBy = [];
        this._having = [];
        this._orderBy = [];
        this._limit = null;
        this._offset = null;
        this._distinct = false;
        this._aggregates = [];
        this._rawSql = null;
    }
    select(...cols) {
        this._selects = cols;
        return this;
    }
    distinct() {
        this._distinct = true;
        return this;
    }
    where(columnOrRaw, op, val) {
        // handle raw SQL
        if (typeof columnOrRaw === "object" && "sql" in columnOrRaw) {
            this._where.push({ type: "raw", sql: columnOrRaw.sql, params: columnOrRaw.params });
            return this;
        }
        // shorthand form: where(column, value)
        if (val === undefined && op !== undefined && typeof op !== "string") {
            this._where.push({ type: "basic", column: columnOrRaw, op: "=", value: op });
            return this;
        }
        // full form: where(column, operator, value)
        if (val !== undefined && typeof op === "string") {
            this._where.push({ type: "basic", column: columnOrRaw, op: op, value: val });
            return this;
        }
        throw new Error("Invalid where() usage. correct usage: where(column, operator, value)");
    }
    andWhere(columnOrRaw, op, val) {
        return this.where(columnOrRaw, op, val);
    }
    orWhere(columnOrRaw, op, val) {
        // wrap last and this into nested OR if needed
        this._where.push({ type: "nested", clauses: [{ type: "basic", column: columnOrRaw, op: op, value: val }], bool: "or" });
        return this;
    }
    raw(sql, params) {
        this._rawSql = { sql, params };
        return this;
    }
    // joins (SQL only)
    join(table, on) { this._joins.push({ type: "join", table, on }); return this; }
    leftJoin(table, on) { this._joins.push({ type: "left", table, on }); return this; }
    rightJoin(table, on) { this._joins.push({ type: "right", table, on }); return this; }
    groupBy(...cols) { this._groupBy.push(...cols); return this; }
    having(rawSql) { this._having.push(rawSql); return this; }
    orderBy(col, dir = "asc") { this._orderBy.push(`${col} ${dir.toUpperCase()}`); return this; }
    limit(n) { this._limit = n; return this; }
    offset(n) { this._offset = n; return this; }
    count(column, alias = "count") { this._aggregates.push({ fn: "COUNT", column: column, alias }); return this; }
    sum(column, alias) { this._aggregates.push({ fn: "SUM", column: column, alias }); return this; }
    avg(column, alias) { this._aggregates.push({ fn: "AVG", column: column, alias }); return this; }
    min(column, alias) { this._aggregates.push({ fn: "MIN", column: column, alias }); return this; }
    max(column, alias) { this._aggregates.push({ fn: "MAX", column: column, alias }); return this; }
    async get() {
        if (this.driver === "mongo") {
            // Convert builder into Mongo find or aggregation
            const collOp = this.table;
            // Build match from where clauses (only supports basic AND/OR)
            const mongoFilter = {};
            const or = [];
            for (const w of this._where) {
                if (w.type === "basic") {
                    const col = String(w.column);
                    const op = w.op;
                    if (op === "=")
                        mongoFilter[col] = w.value;
                    else if (op === "!=")
                        mongoFilter[col] = { $ne: w.value };
                    else if (op === "<")
                        mongoFilter[col] = { $lt: w.value };
                    else if (op === "<=")
                        mongoFilter[col] = { $lte: w.value };
                    else if (op === ">")
                        mongoFilter[col] = { $gt: w.value };
                    else if (op === ">=")
                        mongoFilter[col] = { $gte: w.value };
                    else if (op === "IN")
                        mongoFilter[col] = { $in: w.value };
                    else if (op === "NOT IN")
                        mongoFilter[col] = { $nin: w.value };
                    else if (op === "LIKE" || op === "ILIKE")
                        mongoFilter[col] = { $regex: w.value, $options: op === "ILIKE" ? "i" : "" };
                }
                else if (w.type === "nested" && w.bool === "or") {
                    const subOr = {};
                    for (const sc of w.clauses) {
                        if (sc.type === "basic")
                            subOr[sc.column] = sc.value;
                    }
                    or.push(subOr);
                }
                else if (w.type === "raw") {
                    // no-op for raw in mongo
                }
            }
            const filter = or.length ? { $or: or, ...mongoFilter } : mongoFilter;
            const opString = `COLLECTION:${collOp}:FIND`;
            const params = [filter, { projection: this._selects ? Object.fromEntries(this._selects.map(s => [s, 1])) : undefined }];
            const res = await this.exec(opString, params);
            return res.rows;
        }
        if (this._rawSql) {
            return (await this.exec(this._rawSql.sql, this._rawSql.params || [])).rows;
        }
        // Build SQL
        let sql = "SELECT ";
        if (this._distinct)
            sql += "DISTINCT ";
        if (this._aggregates.length) {
            sql += this._aggregates.map(a => `${a.fn}(${a.column ?? "*"})${a.alias ? ` AS ${a.alias}` : ""}`).join(", ");
        }
        else if (this._selects && this._selects.length > 0) {
            sql += this._selects.join(", ");
        }
        else {
            sql += "*";
        }
        sql += ` FROM ${this.table}`;
        // joins
        for (const j of this._joins) {
            if (j.type === "join")
                sql += ` JOIN ${j.table} ON ${j.on}`;
            if (j.type === "left")
                sql += ` LEFT JOIN ${j.table} ON ${j.on}`;
            if (j.type === "right")
                sql += ` RIGHT JOIN ${j.table} ON ${j.on}`;
        }
        // where
        const whereParts = [];
        const params = [];
        for (const w of this._where) {
            if (w.type === "basic") {
                if (w.op === "IN" || w.op === "NOT IN") {
                    const vals = (w.value || []);
                    const placeholders = vals.map(() => "?").join(", ");
                    whereParts.push(`${String(w.column)} ${w.op} (${placeholders})`);
                    params.push(...vals);
                }
                else if (w.op === "ILIKE") {
                    // Postgres ILIKE, emulate in others using LOWER() comparisons
                    if (this.driver === "postgres")
                        whereParts.push(`${String(w.column)} ILIKE ?`), params.push(w.value);
                    else
                        whereParts.push(`LOWER(${String(w.column)}) LIKE LOWER(?)`), params.push(w.value);
                }
                else {
                    whereParts.push(`${String(w.column)} ${w.op} ?`);
                    params.push(w.value);
                }
            }
            else if (w.type === "raw") {
                whereParts.push(w.sql);
                if (w.params)
                    params.push(...w.params);
            }
            else if (w.type === "nested") {
                // only handle simple OR nested
                const nestedParts = [];
                for (const sc of w.clauses) {
                    if (sc.type === "basic") {
                        nestedParts.push(`${String(sc.column)} ${sc.op} ?`);
                        params.push(sc.value);
                    }
                }
                if (nestedParts.length)
                    whereParts.push(`(${nestedParts.join(" OR ")})`);
            }
        }
        if (whereParts.length)
            sql += " WHERE " + whereParts.join(" AND ");
        if (this._groupBy.length)
            sql += " GROUP BY " + this._groupBy.join(", ");
        if (this._having.length)
            sql += " HAVING " + this._having.join(" AND ");
        if (this._orderBy.length)
            sql += " ORDER BY " + this._orderBy.join(", ");
        if (this._limit != null)
            sql += " LIMIT " + this._limit;
        if (this._offset != null)
            sql += " OFFSET " + this._offset;
        const res = await this.exec(sql, params);
        return res.rows;
    }
    async first() {
        this.limit(1);
        const r = await this.get();
        return r[0] || null;
    }
}
// Migrator: create SQL tables or Mongo collections
class Migrator {
    constructor(driver, exec) {
        this.driver = driver;
        this.exec = exec;
        this.migrationsTable = "__slint_migrations__";
    }
    async ensureMigrationTable() {
        if (this.driver === "mongo")
            return;
        const sql = this.driver === "mysql"
            ? `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name VARCHAR(255) PRIMARY KEY, fingerprint TEXT)`
            : `CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (table_name TEXT PRIMARY KEY, fingerprint TEXT)`;
        await this.exec(sql);
    }
    async getFingerprint(table) {
        if (this.driver === "mongo") {
            // store in a special collection
            const res = await this.exec(`COLLECTION:${this.migrationsTable}:FIND`, [{ table_name: table }]);
            return res.rows[0]?.fingerprint || null;
        }
        await this.ensureMigrationTable();
        const res = await this.exec(`SELECT fingerprint FROM ${this.migrationsTable} WHERE table_name = ?`, [table]);
        return res.rows[0]?.fingerprint || null;
    }
    async setFingerprint(table, fingerprint) {
        if (this.driver === "mongo") {
            await this.exec(`COLLECTION:${this.migrationsTable}:INSERT`, [{ table_name: table, fingerprint }]);
            return;
        }
        if (this.driver === "postgres") {
            await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES($1,$2) ON CONFLICT(table_name) DO UPDATE SET fingerprint = $2`, [table, fingerprint]);
        }
        else if (this.driver === "mysql") {
            await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES(?,?) ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint)`, [table, fingerprint]);
        }
        else {
            await this.exec(`UPDATE ${this.migrationsTable} SET fingerprint = ? WHERE table_name = ?`, [fingerprint, table]);
            try {
                await this.exec(`INSERT INTO ${this.migrationsTable}(table_name,fingerprint) VALUES(?,?)`, [table, fingerprint]);
            }
            catch (e) { }
        }
    }
    async sync(table, schema) {
        const fp = fingerprintFromSchema(schema);
        const existing = await this.getFingerprint(table);
        if (existing === fp)
            return { changed: false };
        if (this.driver === "mongo") {
            // Mongo: ensure collection exists by creating an index on _id if needed
            await this.exec(`COLLECTION:${table}:FIND`, [{}]);
            await this.setFingerprint(table, fp);
            return { changed: true };
        }
        // SQL: create if not exists (conservative: doesn't alter existing columns)
        const cols = Object.entries(schema).map(([k, t]) => `${k} ${t}`).join(", ");
        await this.exec(`CREATE TABLE IF NOT EXISTS ${table} (${cols})`);
        await this.setFingerprint(table, fp);
        return { changed: true };
    }
}
function inferSchemaFromSample(sample, driver, keyPath = "id") {
    const s = {};
    if (sample) {
        for (const [k, v] of Object.entries(sample)) {
            if (v == null)
                continue;
            s[k] = mapJSTypeToSQL(v, driver);
        }
    }
    if (!s[keyPath])
        s[keyPath] = driver === "postgres" || driver === "mysql" ? "VARCHAR(36)" : "TEXT";
    s[keyPath] += " PRIMARY KEY";
    return s;
}
export class SlintORM {
    constructor(config = {}) {
        this.config = config;
        this.adapter = new DBAdapter(config);
        console.log("Driver received:", config.driver);
    }
    async close() { await this.adapter.close(); }
    defineModel(table, opts = {}) {
        const driver = this.config.driver;
        const keyPath = opts.keyPath || "id";
        let schema = null;
        let migrator = null;
        const getMigrator = () => {
            if (!migrator)
                migrator = new Migrator(driver, (sql, params) => this.adapter.exec(sql, params));
            return migrator;
        };
        async function ensureTable(sample) {
            if (schema)
                return;
            schema = inferSchemaFromSample(sample, driver, keyPath);
            const m = getMigrator();
            if (m && schema)
                await m.sync(table, schema);
        }
        const model = {
            async insert(item) {
                await ensureTable(item);
                if (driver === "mongo") {
                    const op = `COLLECTION:${table}:INSERT`;
                    const res = await this.adapter.exec(op, [item]);
                    return res.rows;
                }
                const cols = Object.keys(item);
                const placeholders = cols.map(() => "?").join(", ");
                const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
                await this.adapter.exec(sql, cols.map(c => item[c]));
                return item;
            },
            async update(idOrFilter, partial) {
                await ensureTable();
                if (driver === "mongo") {
                    const filter = partial ? { [keyPath]: idOrFilter } : idOrFilter;
                    const updateDoc = partial ? { $set: partial } : { $set: idOrFilter };
                    const res = await this.adapter.exec(`COLLECTION:${table}:UPDATE`, [filter, updateDoc, {}]);
                    return res.rows;
                }
                let id;
                let data;
                if (partial === undefined) {
                    id = idOrFilter[keyPath];
                    data = idOrFilter;
                }
                else {
                    id = idOrFilter;
                    data = partial;
                }
                const cols = Object.keys(data);
                if (cols.length === 0)
                    return null;
                const set = cols.map(c => `${c} = ?`).join(", ");
                const sql = `UPDATE ${table} SET ${set} WHERE ${keyPath} = ?`;
                const params = [...cols.map(c => data[c]), id];
                await this.adapter.exec(sql, params);
                return { [keyPath]: id, ...data };
            },
            async delete(idOrFilter) {
                await ensureTable();
                if (driver === "mongo") {
                    const filter = idOrFilter;
                    const res = await this.adapter.exec(`COLLECTION:${table}:DELETE`, [filter]);
                    return res.rows;
                }
                await this.adapter.exec(`DELETE FROM ${table} WHERE ${keyPath} = ?`, [idOrFilter]);
                return idOrFilter;
            },
            async get(id) {
                await ensureTable();
                if (driver === "mongo") {
                    const res = await this.adapter.exec(`COLLECTION:${table}:FIND`, [{ [keyPath]: id }]);
                    return res.rows[0] || null;
                }
                const res = await this.adapter.exec(`SELECT * FROM ${table} WHERE ${keyPath} = ?`, [id]);
                return res.rows[0] || null;
            },
            async getAll() {
                await ensureTable();
                if (driver === "mongo") {
                    const res = await this.adapter.exec(`COLLECTION:${table}:FIND`, [{}]);
                    return res.rows;
                }
                const res = await this.adapter.exec(`SELECT * FROM ${table}`);
                return res.rows;
            },
            query() {
                return new QueryBuilder(table, keyPath, driver, (sql, params) => this.adapter.exec(sql, params));
            },
            raw(sqlOrOp, params) {
                return this.adapter.exec(sqlOrOp, params || []);
            }
        };
        // bind adapter into model so methods can access it via `this.adapter`
        model.adapter = this.adapter;
        return model;
    }
}
export default SlintORM;
