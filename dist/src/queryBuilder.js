import path from "path";
import fs from "fs";
export function mapBooleans(row, schemaFields) {
    const newRow = { ...row };
    for (const key of Object.keys(schemaFields)) {
        const fieldType = String(schemaFields[key]?.type || "").toLowerCase();
        if (fieldType.includes("boolean") && key in newRow) {
            const val = newRow[key];
            newRow[key] = val === 1 || val === true || val === "1" ? true : false;
        }
    }
    return newRow;
}
let schemaCache = null;
function getSchema(dir) {
    if (!dir) {
        console.log("Error: ", "No directory provided");
        return;
    }
    if (!schemaCache) {
        const schemaPath = path.join(process.cwd(), dir, "schema", "generated.json");
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }
        schemaCache = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    }
    return schemaCache;
}
export const Dialects = {
    sqlite: {
        formatPlaceholder: () => "?",
        caseInsensitiveLike: (col) => `LOWER(${col}) LIKE LOWER(?)`,
        quoteIdentifier: (n) => `"${n}"`,
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
export class QueryBuilder {
    _selects = null;
    _where = [];
    _orderBy = [];
    _limit = null;
    _offset = null;
    _joins = [];
    _preloads = [];
    // store excludes as strings internally for simplicity
    _exclude = [];
    table;
    exec;
    orm;
    modelName;
    dir;
    constructor(table, dir, exec, orm) {
        if (!dir) {
            throw new Error("QueryBuilder requires a valid directory for schema.");
        }
        this.table = table;
        this.exec = exec;
        this.orm = orm;
        this.dir = dir;
        this.modelName = this.normalizeModelName(table);
    }
    normalizeModelName(name) {
        const schema = getSchema(this.dir);
        const normalized = name[0].toUpperCase() + name.slice(1);
        if (schema[normalized])
            return normalized;
        const singular = normalized.endsWith("s")
            ? normalized.slice(0, -1)
            : normalized;
        if (schema[singular])
            return singular;
        return normalized;
    }
    /**
     * Select columns to fetch.
     * @template K - Keys of the table
     * @param cols - Columns to select
     * @returns The current builder instance
     * @example
     * builder.select("id", "name").get();
     */
    select(...cols) {
        this._selects = cols;
        return this;
    }
    /**
     * Add a WHERE condition.
     * @param column - Column name
     * @param op - Comparison operator (e.g., '=', '>', '<')
     * @param value - Value to compare
     * @returns The current builder instance
     * @example
     * builder.where("age", ">", 18).get();
     */
    where(column, op, value) {
        this._where.push({ column: column, op, value });
        return this;
    }
    /**
     * Add raw SQL WHERE clause.
     * @param sql - Raw SQL string
     * @returns The current builder instance
     * @example
     * builder.whereRaw("age > 18 AND active = true").get();
     */
    whereRaw(sql) {
        this._where.push({ raw: sql });
        return this;
    }
    /**
     * Add ORDER BY clause.
     * @param column - Column name
     * @param dir - Direction: "asc" (default) or "desc"
     * @returns The current builder instance
     * @example
     * builder.orderBy("created_at", "desc").get();
     */
    orderBy(column, dir = "asc") {
        this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
        return this;
    }
    /**
     * Limit number of rows returned.
     * @param n - Number of rows
     * @returns The current builder instance
     * @example
     * builder.limit(10).get();
     */
    limit(n) {
        this._limit = n;
        return this;
    }
    /**
     * Skip a number of rows (for pagination).
     * @param n - Number of rows to skip
     * @returns The current builder instance
     * @example
     * builder.offset(20).get();
     */
    offset(n) {
        this._offset = n;
        return this;
    }
    /**
     * Add INNER JOIN clause.
     * @param table - Table name
     * @param onLeft - Left side of ON
     * @param op - Operator
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.join("employees", "users.id", "=", "employees.user_id");
     */
    join(table, onLeft, op, onRight) {
        this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
    /**
     * Add LEFT JOIN clause.
     * @param table - Table name
     * @param onLeft - Left side of ON
     * @param op - Operator
     * @param onRight - Right side of ON
     * @returns The current builder instance
     * @example
     * builder.leftJoin("departments", "users.dept_id", "=", "departments.id");
     */
    leftJoin(table, onLeft, op, onRight) {
        this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
    /**
     * Exclude columns from results (top-level only).
     * @param columns - Columns to exclude, can be dotted strings
     * @returns The current builder instance
     * @example
     * builder.exclude("password", "profile.secret").get();
     */
    exclude(...columns) {
        this._exclude.push(...columns.map(c => String(c)));
        return this;
    }
    /**
     * Preload relations for eager loading.
     * @param relation - Relation path
     * @returns The current builder instance
     * @example
     * builder.preload("posts").get();
     */
    preload(relation) {
        this._preloads.push(relation);
        return this;
    }
    /**
     * Case-insensitive LIKE search (ILike).
     * @param column - Column to search
     * @param value - Value to match
     * @returns The current builder instance
     * @example
     * builder.ILike("name", "john").get();
     */
    ILike(column, value) {
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        const clause = dialect.caseInsensitiveLike(String(column), this._where.length);
        const val = `%${value}%`;
        this._where.push({ raw: clause, value: val });
        return this;
    }
    /**
     * Build the SQL query string and parameters.
     * @returns Object with `sql` and `params`
     * @example
     * const { sql, params } = builder.buildSql();
     */
    buildSql() {
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        let sql = "SELECT ";
        sql += this._selects?.length
            ? this._selects.map((c) => dialect.quoteIdentifier(c)).join(", ")
            : "*";
        sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
        if (this._joins.length)
            sql += " " + this._joins.join(" ");
        const params = [];
        let paramIndex = 0;
        if (this._where.length) {
            sql += " WHERE " + this._where.map((w) => {
                if (w.raw) {
                    if (w.value !== undefined)
                        params.push(w.value);
                    return w.raw;
                }
                params.push(w.value);
                const placeholder = dialect.formatPlaceholder(paramIndex);
                paramIndex++;
                return `${dialect.quoteIdentifier(String(w.column))} ${w.op} ${placeholder}`;
            }).join(" AND ");
        }
        if (this._orderBy.length) {
            sql += " ORDER BY " + this._orderBy
                .map((c) => {
                const [col, dir] = c.split(" ");
                return `${dialect.quoteIdentifier(col)} ${dir || ""}`;
            })
                .join(", ");
        }
        if (this._limit != null)
            sql += " LIMIT " + this._limit;
        if (this._offset != null)
            sql += " OFFSET " + this._offset;
        return { sql, params };
    }
    /**
     * Execute the query and return rows.
     * Applies preloads and excludes.
     * @returns Promise resolving to array of rows
     * @example
     * const users = await builder.get();
     */
    async get() {
        const { sql, params } = this.buildSql();
        const res = await this.exec(sql, params);
        let rows = (res.rows || []);
        if (this._preloads.length) {
            rows = await this.applyPreloads(rows);
        }
        const schemaFields = getSchema(this.dir)[this.modelName].fields;
        rows = rows.map((r) => mapBooleans(r, schemaFields));
        if (this._exclude.length) {
            rows = rows.map((r) => {
                const copy = { ...r };
                for (const col of this._exclude) {
                    if (!col.includes("."))
                        delete copy[col];
                }
                return copy;
            });
        }
        return rows;
    }
    /**
     * Fetch the first row matching a condition.
     * @param condition - Optional WHERE condition as object or raw SQL string
     * @returns Promise resolving to a single row or null
     * @example
     * const user = await builder.first({ id: 1 });
     */
    async first(condition) {
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        const schema = getSchema(this.dir);
        const modelSchema = schema ? schema[this.modelName] : undefined;
        const modelCols = modelSchema ? Object.keys(modelSchema.fields || {}) : [];
        if (condition) {
            if (typeof condition === "string") {
                let sql = condition;
                if (modelCols.length) {
                    for (const col of modelCols) {
                        const quoted = dialect.quoteIdentifier(col);
                        sql = sql.replace(new RegExp(`(?<![A-Za-z0-9_])${col}(?![A-Za-z0-9_])`, "g"), quoted);
                    }
                }
                this._where.push({ raw: sql });
            }
            if (typeof condition === "object") {
                for (const key of Object.keys(condition)) {
                    const val = condition[key];
                    if (val !== null && typeof val !== "object") {
                        this.where(key, "=", val);
                    }
                    else if (val && typeof val === "object" && "op" in val && "value" in val) {
                        this.where(key, val.op, val.value);
                    }
                }
            }
        }
        if (!this._limit)
            this.limit(1);
        const rows = await this.get();
        return rows[0] || null;
    }
    // add this helper inside the QueryBuilder class (near other helpers)
    cleanRow(row, targetSchema, root) {
        // convert booleans
        let clean = mapBooleans(row, targetSchema.fields || {});
        // apply nested excludes for this relation (e.g., "user.profile.email")
        if (root) {
            const nestedExcludes = this._nestedExcludes(root);
            if (nestedExcludes.length)
                clean = this.removeExcluded(clean, nestedExcludes);
        }
        return clean;
    }
    // ---------------------------
    // applyPreloads (uses this._preloads)
    // ---------------------------
    async applyPreloads(rows) {
        if (!rows.length)
            return rows;
        const schema = getSchema(this.dir);
        const modelSchema = schema[this.modelName];
        if (!modelSchema)
            return rows;
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        const rootSchema = modelSchema;
        const rootPK = rootSchema.primaryKey;
        // Build relation metadata
        const relations = [];
        for (const [field, def] of Object.entries(modelSchema.fields)) {
            const meta = def?.meta;
            if (!meta)
                continue;
            for (const key of Object.keys(meta)) {
                if (!key.startsWith("relation") && !key.startsWith("relationship"))
                    continue;
                const kind = (key.split(" ")[1] || "");
                relations.push({
                    fieldName: field,
                    kind,
                    targetModel: meta[key],
                    foreignKey: meta.foreignKey,
                    relatedKey: meta.relatedKey,
                    through: meta.through
                });
            }
        }
        // Group preloads root → nested
        const grouped = {};
        for (const preload of this._preloads) {
            const parts = preload.split(".");
            const root = parts.shift();
            if (!grouped[root])
                grouped[root] = [];
            if (parts.length)
                grouped[root].push(parts.join("."));
        }
        const hasValues = (arr) => Array.isArray(arr) && arr.length > 0;
        // Resolve relations
        for (const root of Object.keys(grouped)) {
            const relation = relations.find(r => r.fieldName === root);
            if (!relation)
                continue;
            const targetSchema = schema[relation.targetModel];
            if (!targetSchema)
                continue;
            const targetPK = targetSchema.primaryKey || "id";
            const { kind, foreignKey, relatedKey, through } = relation;
            let relatedRows = [];
            const parentIds = rows.map(r => r[rootPK]).filter(Boolean);
            if (!hasValues(parentIds)) {
                for (const row of rows)
                    row[root] = kind === "onetomany" ? [] : null;
                continue;
            }
            const placeholders = parentIds
                .map((_, i) => dialect.formatPlaceholder(i))
                .join(",");
            switch (kind) {
                case "onetomany": {
                    if (!foreignKey)
                        break;
                    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)}
                     WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    relatedRows = (await this.exec(sql, parentIds)).rows || [];
                    for (const row of rows) {
                        const items = relatedRows.filter(r => r[foreignKey] === row[rootPK]);
                        row[root] = items.map(r => this.cleanRow(r, targetSchema, root));
                    }
                    break;
                }
                case "manytoone":
                case "onetoone": {
                    if (!foreignKey)
                        break;
                    const parentHasFK = rows[0].hasOwnProperty(foreignKey);
                    const fkValues = parentHasFK
                        ? rows.map(r => r[foreignKey]).filter(Boolean)
                        : parentIds;
                    if (!hasValues(fkValues)) {
                        for (const row of rows)
                            row[root] = null;
                        break;
                    }
                    const ph = fkValues
                        .map((_, i) => dialect.formatPlaceholder(i))
                        .join(",");
                    const sql = parentHasFK
                        ? `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)}
             WHERE ${dialect.quoteIdentifier(targetPK)} IN (${ph})`
                        : `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)}
             WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${ph})`;
                    relatedRows = (await this.exec(sql, fkValues)).rows || [];
                    for (const row of rows) {
                        const rel = parentHasFK
                            ? relatedRows.find(r => r[targetPK] === row[foreignKey])
                            : relatedRows.find(r => r[foreignKey] === row[rootPK]);
                        row[root] = rel ? this.cleanRow(rel, targetSchema, root) : null;
                    }
                    break;
                }
                case "manytomany": {
                    if (!foreignKey || !relatedKey || !through)
                        break;
                    const jSql = `SELECT * FROM ${dialect.quoteIdentifier(through)}
                      WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    const junction = (await this.exec(jSql, parentIds)).rows || [];
                    const targetIds = [...new Set(junction.map(j => j[relatedKey]))];
                    if (!hasValues(targetIds)) {
                        for (const row of rows)
                            row[root] = [];
                        break;
                    }
                    const tph = targetIds
                        .map((_, i) => dialect.formatPlaceholder(i))
                        .join(",");
                    const tSql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)}
                      WHERE ${targetPK} IN (${tph})`;
                    relatedRows = (await this.exec(tSql, targetIds)).rows || [];
                    for (const row of rows) {
                        const ids = junction
                            .filter(j => j[foreignKey] === row[rootPK])
                            .map(j => j[relatedKey]);
                        row[root] = relatedRows
                            .filter(r => ids.includes(r[targetPK]))
                            .map(r => this.cleanRow(r, targetSchema, root));
                    }
                    break;
                }
                default:
                    break;
            }
            //
            // Nested preload section
            //
            const nested = grouped[root];
            if (nested.length && relatedRows.length) {
                const qb = new QueryBuilder(targetSchema.table, this.dir, this.exec, this.orm);
                qb._preloads = nested;
                qb._exclude = this._nestedExcludes(root);
                const nestedLoaded = await qb.applyPreloads(relatedRows);
                if (kind === "onetomany") {
                    for (const row of rows) {
                        const items = nestedLoaded.filter(r => r[foreignKey] === row[rootPK]);
                        row[root] = items;
                    }
                }
                if (kind === "manytoone" || kind === "onetoone") {
                    for (const row of rows) {
                        const match = nestedLoaded.find(r => r[targetPK] === row[root]?.[targetPK]);
                        if (match)
                            row[root] = match;
                    }
                }
                if (kind === "manytomany") {
                    const junctionSql = `SELECT * FROM ${dialect.quoteIdentifier(through)}
                             WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    const junction = (await this.exec(junctionSql, parentIds)).rows || [];
                    for (const row of rows) {
                        const ids = junction
                            .filter(j => j[foreignKey] === row[rootPK])
                            .map(j => j[relatedKey]);
                        row[root] = nestedLoaded.filter(r => ids.includes(r[targetPK]));
                    }
                }
            }
        }
        return rows.map(r => this.applyExcludes(r));
    }
    // recursive removeExcluded that handles nested dot-path excludes (["password", "profile.email", ...])
    removeExcluded(obj, excludes) {
        if (!obj || typeof obj !== "object")
            return obj;
        // If obj is an array, map individually
        if (Array.isArray(obj)) {
            return obj.map((item) => this.removeExcluded(item, excludes));
        }
        const result = {};
        for (const key of Object.keys(obj)) {
            // build nested excludes for this key (e.g., "profile.email" => nested ["email"])
            const nested = excludes
                .filter((e) => e.startsWith(key + "."))
                .map((e) => e.slice(key.length + 1));
            // if key itself is excluded at this level, skip it
            if (excludes.includes(key))
                continue;
            const val = obj[key];
            if (Array.isArray(val)) {
                result[key] = val.map((v) => this.removeExcluded(v, nested));
            }
            else if (val && typeof val === "object") {
                result[key] = this.removeExcluded(val, nested);
            }
            else {
                result[key] = val;
            }
        }
        return result;
    }
    applyExcludes(row) {
        if (!this._exclude.length)
            return row;
        const copy = { ...row };
        for (const f of this._exclude) {
            if (!f.includes("."))
                delete copy[f];
        }
        return copy;
    }
    _nestedExcludes(root) {
        return this._exclude
            .filter((f) => typeof f === "string" && f.startsWith(root + "."))
            .map((f) => f.slice(root.length + 1));
    }
}
