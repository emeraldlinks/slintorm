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
function getSchema() {
    if (!schemaCache) {
        const schemaPath = path.join(process.cwd(), "schema", "generated.json");
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at ${schemaPath}`);
        }
        schemaCache = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    }
    return schemaCache;
}
const Dialects = {
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
    constructor(table, exec, orm) {
        this.table = table;
        this.exec = exec;
        this.orm = orm;
        this.modelName = this.normalizeModelName(table);
    }
    normalizeModelName(name) {
        const schema = getSchema();
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
    select(...cols) {
        this._selects = cols;
        return this;
    }
    where(column, op, value) {
        this._where.push({ column: column, op, value });
        return this;
    }
    whereRaw(sql) {
        this._where.push({ raw: sql });
        return this;
    }
    orderBy(column, dir = "asc") {
        this._orderBy.push(`${String(column)} ${dir.toUpperCase()}`);
        return this;
    }
    limit(n) {
        this._limit = n;
        return this;
    }
    offset(n) {
        this._offset = n;
        return this;
    }
    join(table, onLeft, op, onRight) {
        this._joins.push(`JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
    leftJoin(table, onLeft, op, onRight) {
        this._joins.push(`LEFT JOIN ${table} ON ${onLeft} ${op} ${onRight}`);
        return this;
    }
    // accept keyof T or dotted strings - store as strings
    exclude(...columns) {
        this._exclude.push(...columns.map((c) => String(c)));
        return this;
    }
    preload(relation) {
        this._preloads.push(relation);
        return this;
    }
    ILike(column, value) {
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        const clause = dialect.caseInsensitiveLike(String(column), this._where.length);
        const val = `%${value}%`;
        this._where.push({ raw: clause, value: val });
        return this;
    }
    buildSql() {
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        let sql = "SELECT ";
        sql += this._selects?.length ? this._selects.join(", ") : "*";
        sql += ` FROM ${dialect.quoteIdentifier(this.table)}`;
        if (this._joins.length)
            sql += " " + this._joins.join(" ");
        const params = [];
        if (this._where.length) {
            sql +=
                " WHERE " +
                    this._where
                        .map((w, i) => {
                        if (w.raw) {
                            if (w.value !== undefined)
                                params.push(w.value);
                            return w.raw;
                        }
                        params.push(w.value);
                        return `${dialect.quoteIdentifier(String(w.column))} ${w.op} ${dialect.formatPlaceholder(i)}`;
                    })
                        .join(" AND ");
        }
        if (this._orderBy.length)
            sql += " ORDER BY " + this._orderBy.join(", ");
        if (this._limit != null)
            sql += " LIMIT " + this._limit;
        if (this._offset != null)
            sql += " OFFSET " + this._offset;
        return { sql, params };
    }
    async get() {
        const { sql, params } = this.buildSql();
        const res = await this.exec(sql, params);
        let rows = (res.rows || []);
        if (this._preloads.length) {
            rows = await this.applyPreloads(rows); // uses this._preloads internally
        }
        const schemaFields = getSchema()[this.modelName].fields;
        // Apply mapBooleans (top-level)
        rows = rows.map((r) => mapBooleans(r, schemaFields));
        // Apply top-level excludes (no dotted keys here)
        if (this._exclude.length) {
            rows = rows.map((r) => {
                const copy = { ...r };
                for (const col of this._exclude) {
                    // only delete top-level keys (no dot)
                    if (!col.includes("."))
                        delete copy[col];
                }
                return copy;
            });
        }
        return rows;
    }
    async first(condition) {
        if (condition)
            this.whereRaw(condition);
        this.limit(1);
        const rows = await this.get();
        return rows[0] || null;
    }
    // ---------------------------
    // applyPreloads (uses this._preloads)
    // ---------------------------
    async applyPreloads(rows) {
        if (!rows.length)
            return rows;
        const schema = getSchema();
        const modelSchema = schema[this.modelName];
        if (!modelSchema)
            return rows;
        const dialect = Dialects[this.orm?.dialect || "sqlite"];
        // Build relation metadata from schema
        const relationFields = [];
        for (const [field, fieldDef] of Object.entries(modelSchema.fields)) {
            const meta = fieldDef?.meta;
            if (!meta)
                continue;
            for (const key of Object.keys(meta)) {
                if (key.startsWith("relation") || key.startsWith("relationship")) {
                    const kind = key.split(" ")[1];
                    relationFields.push({
                        fieldName: field,
                        kind,
                        targetModel: meta[key],
                        foreignKey: meta.foreignKey,
                        relatedKey: meta.relatedKey,
                        through: meta.through,
                    });
                }
            }
        }
        // Group nested preloads (root -> nested chains)
        const grouped = {};
        for (const preload of this._preloads) {
            const [root, ...rest] = preload.split(".");
            if (!grouped[root])
                grouped[root] = [];
            if (rest.length)
                grouped[root].push(rest.join("."));
        }
        // iterate roots
        for (const root of Object.keys(grouped)) {
            const relation = relationFields.find((r) => r.fieldName === root);
            if (!relation)
                continue;
            const targetSchema = schema[relation.targetModel];
            if (!targetSchema)
                continue;
            const { kind, foreignKey, relatedKey, through } = relation;
            const nestedPreloads = grouped[root];
            let relatedRows = [];
            switch (kind) {
                case "onetomany": {
                    if (!foreignKey)
                        break;
                    const parentIds = rows.map((r) => r.id).filter(Boolean);
                    if (!parentIds.length)
                        break;
                    const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    relatedRows = (await this.exec(sql, parentIds)).rows || [];
                    for (const row of rows) {
                        row[root] = relatedRows
                            .filter((rel) => rel[foreignKey] === row.id)
                            .map((r) => {
                            // convert booleans then apply nested excludes
                            let clean = mapBooleans(r, targetSchema.fields);
                            const nestedExcludes = this._nestedExcludes(root);
                            if (nestedExcludes.length)
                                clean = this.removeExcluded(clean, nestedExcludes);
                            return clean;
                        });
                    }
                    break;
                }
                case "manytoone":
                case "onetoone": {
                    if (!foreignKey)
                        break;
                    // detect if child FK exists on main row (child side stores FK) or parent side
                    const childFKOnRow = rows[0].hasOwnProperty(foreignKey);
                    const parentIds = childFKOnRow
                        ? rows.map((r) => r[foreignKey]).filter(Boolean)
                        : rows.map((r) => r.id).filter(Boolean);
                    if (!parentIds.length)
                        break;
                    const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const sql = childFKOnRow
                        ? `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${placeholders})`
                        : `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    relatedRows = (await this.exec(sql, parentIds)).rows || [];
                    for (const row of rows) {
                        if (childFKOnRow) {
                            const found = relatedRows.find((rel) => rel.id === row[foreignKey]);
                            if (found) {
                                let clean = mapBooleans(found, targetSchema.fields);
                                const nestedExcludes = this._nestedExcludes(root);
                                if (nestedExcludes.length)
                                    clean = this.removeExcluded(clean, nestedExcludes);
                                row[root] = clean;
                            }
                            else
                                row[root] = null;
                        }
                        else {
                            const found = relatedRows.find((rel) => rel[foreignKey] === row.id);
                            if (found) {
                                let clean = mapBooleans(found, targetSchema.fields);
                                const nestedExcludes = this._nestedExcludes(root);
                                if (nestedExcludes.length)
                                    clean = this.removeExcluded(clean, nestedExcludes);
                                row[root] = clean;
                            }
                            else
                                row[root] = null;
                        }
                    }
                    break;
                }
                case "manytomany": {
                    if (!foreignKey || !relatedKey || !through)
                        break;
                    const parentIds = rows.map((r) => r.id).filter(Boolean);
                    if (!parentIds.length)
                        break;
                    const placeholders = parentIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const junctionSql = `SELECT * FROM ${dialect.quoteIdentifier(through)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    const junctionRows = (await this.exec(junctionSql, parentIds)).rows || [];
                    const targetIds = [...new Set(junctionRows.map((j) => j[relatedKey]))];
                    if (!targetIds.length)
                        break;
                    const targetPlaceholders = targetIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const targetSql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${targetPlaceholders})`;
                    relatedRows = (await this.exec(targetSql, targetIds)).rows || [];
                    for (const row of rows) {
                        const relIds = junctionRows
                            .filter((j) => j[foreignKey] === row.id)
                            .map((j) => j[relatedKey]);
                        row[root] = relatedRows
                            .filter((t) => relIds.includes(t.id))
                            .map((t) => {
                            let clean = mapBooleans(t, targetSchema.fields);
                            const nestedExcludes = this._nestedExcludes(root);
                            if (nestedExcludes.length)
                                clean = this.removeExcluded(clean, nestedExcludes);
                            return clean;
                        });
                    }
                    break;
                }
                default:
                    // unknown relation — skip
                    break;
            }
            // If there are nested preloads for the related rows, call applyPreloads recursively.
            if (nestedPreloads.length && Array.isArray(relatedRows) && relatedRows.length) {
                // Create a temporary QueryBuilder for the related table to leverage its applyPreloads
                const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
                // Pass nested preloads and nested excludes to the child builder
                qb._preloads = nestedPreloads;
                qb._exclude = this._nestedExcludes(root);
                // run applyPreloads on the fetched related rows so deeper nesting gets resolved
                await qb.applyPreloads(relatedRows);
                // Note: qb.applyPreloads mutates relatedRows in-place so parent mapping above sees nested preloads applied
            }
        }
        // Apply top-level excludes to rows (only non-dotted excludes)
        return rows.map((r) => {
            const copy = { ...r };
            for (const f of this._exclude) {
                if (!f.includes(".")) {
                    delete copy[f];
                }
            }
            return copy;
        });
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
        return this._exclude.filter((f) => typeof f === "string" && f.startsWith(root + "."))
            .map((f) => f.slice(root.length + 1));
    }
}
