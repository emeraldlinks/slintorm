import path from "path";
import fs from "fs";
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
        formatPlaceholder: (i) => "?",
        caseInsensitiveLike: (col) => `LOWER(${col}) LIKE LOWER(?)`,
        quoteIdentifier: (n) => `"${n}"`, // ✅ use double quotes too, safe for sqlite
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
        const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
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
        const rows = (res.rows || []);
        if (this._preloads.length)
            return await this.applyPreloads(rows);
        return rows;
    }
    async first(condition) {
        if (condition)
            this.whereRaw(condition);
        this.limit(1);
        const rows = await this.get();
        return rows[0] || null;
    }
    async applyPreloads(rows) {
        if (!rows.length)
            return rows;
        const schema = getSchema();
        const modelSchema = schema[this.modelName];
        if (!modelSchema)
            return rows;
        const dialect = Dialects[this.orm?.dialect || "sqlite"]; // ✅ use same dialect everywhere
        const relationFields = [];
        for (const [field, fieldDef] of Object.entries(modelSchema.fields)) {
            const meta = fieldDef?.meta;
            if (!meta)
                continue;
            for (const key of Object.keys(meta)) {
                if (key.startsWith("relation") || key.startsWith("relationship")) {
                    const kind = key.split(" ")[1];
                    const targetModel = meta[key];
                    const foreignKey = meta.foreignKey;
                    const relatedKey = meta.relatedKey;
                    const through = meta.through;
                    if (!targetModel)
                        continue;
                    relationFields.push({ fieldName: field, kind, targetModel, foreignKey, relatedKey, through });
                }
            }
        }
        const grouped = {};
        for (const preload of this._preloads) {
            const [root, ...rest] = preload.split(".");
            if (!grouped[root])
                grouped[root] = [];
            if (rest.length)
                grouped[root].push(rest.join("."));
        }
        for (const root of Object.keys(grouped)) {
            const relation = relationFields.find(r => r.fieldName === root);
            if (!relation)
                continue;
            const targetSchema = schema[relation.targetModel];
            if (!targetSchema)
                continue;
            const { kind, foreignKey, relatedKey, through } = relation;
            const nestedPreloads = grouped[root];
            switch (kind) {
                case "onetomany": {
                    if (!foreignKey)
                        break;
                    const ids = rows.map(r => r.id).filter(Boolean);
                    if (!ids.length)
                        break;
                    const placeholders = ids.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    const relatedRows = (await this.exec(sql, ids)).rows || [];
                    for (const row of rows) {
                        row[root] = relatedRows.filter(rel => rel[foreignKey] === row.id);
                    }
                    if (nestedPreloads.length) {
                        const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
                        qb._preloads = nestedPreloads;
                        await qb.applyPreloads(relatedRows);
                    }
                    break;
                }
                case "manytoone":
                case "onetoone": {
                    if (!foreignKey)
                        break;
                    const foreignIds = rows.map(r => r[foreignKey]).filter(Boolean);
                    if (!foreignIds.length)
                        break;
                    const placeholders = foreignIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const sql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${placeholders})`;
                    const relatedRows = (await this.exec(sql, foreignIds)).rows || [];
                    for (const row of rows) {
                        row[root] = relatedRows.find(rel => rel.id === row[foreignKey]) || null;
                    }
                    if (nestedPreloads.length && relatedRows.length) {
                        const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
                        qb._preloads = nestedPreloads;
                        await qb.applyPreloads(relatedRows);
                    }
                    break;
                }
                case "manytomany": {
                    if (!foreignKey || !relatedKey || !through)
                        break;
                    const ids = rows.map(r => r.id).filter(Boolean);
                    if (!ids.length)
                        break;
                    const placeholders = ids.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const junctionSql = `SELECT * FROM ${dialect.quoteIdentifier(through)} WHERE ${dialect.quoteIdentifier(foreignKey)} IN (${placeholders})`;
                    const junctionRows = (await this.exec(junctionSql, ids)).rows || [];
                    const targetIds = [...new Set(junctionRows.map(j => j[relatedKey]))];
                    if (!targetIds.length)
                        break;
                    const targetPlaceholders = targetIds.map((_, i) => dialect.formatPlaceholder(i)).join(",");
                    const targetSql = `SELECT * FROM ${dialect.quoteIdentifier(targetSchema.table)} WHERE id IN (${targetPlaceholders})`;
                    const targetRows = (await this.exec(targetSql, targetIds)).rows || [];
                    for (const row of rows) {
                        const relIds = junctionRows.filter(j => j[foreignKey] === row.id).map(j => j[relatedKey]);
                        row[root] = targetRows.filter(t => relIds.includes(t.id));
                    }
                    if (nestedPreloads.length && targetRows.length) {
                        const qb = new QueryBuilder(targetSchema.table, this.exec, this.orm);
                        qb._preloads = nestedPreloads;
                        await qb.applyPreloads(targetRows);
                    }
                    break;
                }
            }
        }
        return rows;
    }
}
