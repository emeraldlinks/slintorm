"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedQueryBuilder = void 0;
var queryBuilder_js_1 = require("./queryBuilder.js");
var AdvancedQueryBuilder = /** @class */ (function (_super) {
    __extends(AdvancedQueryBuilder, _super);
    function AdvancedQueryBuilder() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._params = [];
        _this._distinct = false;
        _this._groupBy = [];
        _this._having = null;
        _this._aggregates = [];
        _this._window = null;
        _this._ctes = [];
        _this._union = null;
        _this._intersect = null;
        _this._except = null;
        _this._forUpdate = false;
        _this._forShare = false;
        _this._forNoKeyUpdate = false;
        _this._skipLocked = false;
        _this._nowait = false;
        _this._lockTables = [];
        return _this;
    }
    // NOTE: _joins is already declared on QueryBuilder; do NOT redeclare it here.
    // Expose buildSql publicly so static union() can call it without TS errors.
    AdvancedQueryBuilder.prototype.buildSql = function () {
        var _a, _b, _c, _d;
        var isMongo = (((_a = this.orm) === null || _a === void 0 ? void 0 : _a.dialect) || "sqlite") === "mongodb";
        if (isMongo)
            return _super.prototype.buildSql.call(this);
        var base = _super.prototype.buildSql.call(this);
        var sql = base.sql;
        var params = base.params.slice();
        if (this._params.length)
            params.push.apply(params, this._params);
        var dialect = queryBuilder_js_1.Dialects[((_b = this.orm) === null || _b === void 0 ? void 0 : _b.dialect) || "sqlite"];
        // ---- CTE (WITH clause) -----------------------------------------------
        if (this._ctes.length) {
            var parts = this._ctes.map(function (cte) {
                var _a = cte.query.buildSql(), cteSql = _a.sql, cteParams = _a.params;
                params.push.apply(params, cteParams);
                var maybeRecursive = cte.recursive ? "RECURSIVE " : "";
                return "".concat(maybeRecursive).concat(cte.name, " AS (").concat(cteSql, ")");
            });
            sql = "WITH ".concat(parts.join(", "), " ").concat(sql);
        }
        var selectClause = ((_c = this._selects) === null || _c === void 0 ? void 0 : _c.length)
            ? this._selects.map(function (c) { return dialect.quoteIdentifier(String(c)); }).join(", ")
            : this._joins.length
                ? "".concat(dialect.quoteIdentifier(this.table), ".*")
                : "*";
        if (this._aggregates.length) {
            selectClause =
                this._aggregates.join(", ") +
                    (selectClause !== "*" ? ", " + selectClause : "");
        }
        if (this._window)
            selectClause += ", " + this._window;
        sql = sql.replace(/^SELECT\s.*?\sFROM/i, "SELECT ".concat(selectClause, " FROM"));
        if (this._distinct)
            sql = sql.replace(/^SELECT/i, "SELECT DISTINCT");
        if (this._groupBy.length)
            sql += " GROUP BY " + this._groupBy.map(function (c) { return dialect.quoteIdentifier(c); }).join(", ");
        if (this._having) {
            sql += " HAVING " + this._having.raw;
            params.push.apply(params, this._having.params);
        }
        // ---- UNION / INTERSECT / EXCEPT ------------------------------------------
        if (this._union) {
            var sqls = this._union.queries.map(function (q) { return q.buildSql().sql; });
            var unionAll = this._union.all ? " ALL" : "";
            sql = "(".concat(sql, ")\nUNION").concat(unionAll, "\n(").concat(sqls.join("\nUNION".concat(unionAll, "\n")), ")");
        }
        if (this._intersect) {
            var sqls = this._intersect.queries.map(function (q) { return q.buildSql().sql; });
            var intersectAll = this._intersect.all ? " ALL" : "";
            sql = "(".concat(sql, ")\nINTERSECT").concat(intersectAll, "\n(").concat(sqls.join("\nINTERSECT".concat(intersectAll, "\n")), ")");
        }
        if (this._except) {
            var sqls = this._except.queries.map(function (q) { return q.buildSql().sql; });
            var exceptAll = this._except.all ? " ALL" : "";
            sql = "(".concat(sql, ")\nEXCEPT").concat(exceptAll, "\n(").concat(sqls.join("\nEXCEPT".concat(exceptAll, "\n")), ")");
        }
        // ---- FOR UPDATE / FOR SHARE (row locking) --------------------------------
        if (this._forUpdate) {
            var lockClause = " FOR UPDATE";
            if (this._lockTables.length) {
                lockClause += " OF " + this._lockTables.map(function (t) { return dialect.quoteIdentifier(t); }).join(", ");
            }
            if (this._nowait)
                lockClause += " NOWAIT";
            if (this._skipLocked)
                lockClause += " SKIP LOCKED";
            sql += lockClause;
        }
        else if (this._forNoKeyUpdate) {
            var lockClause = " FOR NO KEY UPDATE";
            if (this._lockTables.length) {
                lockClause += " OF " + this._lockTables.map(function (t) { return dialect.quoteIdentifier(t); }).join(", ");
            }
            if (this._nowait)
                lockClause += " NOWAIT";
            if (this._skipLocked)
                lockClause += " SKIP LOCKED";
            sql += lockClause;
        }
        else if (this._forShare) {
            var lockClause = ((_d = this.orm) === null || _d === void 0 ? void 0 : _d.dialect) === "postgres" ? " FOR SHARE" : " LOCK IN SHARE MODE";
            if (this._lockTables.length) {
                lockClause += " OF " + this._lockTables.map(function (t) { return dialect.quoteIdentifier(t); }).join(", ");
            }
            if (this._nowait)
                lockClause += " NOWAIT";
            if (this._skipLocked)
                lockClause += " SKIP LOCKED";
            sql += lockClause;
        }
        return { sql: sql, params: params };
    };
    // ── CTE (Common Table Expression / WITH clause) ──────────────────────────
    AdvancedQueryBuilder.prototype.with = function (name, query, recursive) {
        if (recursive === void 0) { recursive = false; }
        this._ctes.push({ name: name, query: query, recursive: recursive });
        return this;
    };
    // ── UNION / INTERSECT / EXCEPT ──────────────────────────────────────────────
    AdvancedQueryBuilder.prototype.union = function (queries, all) {
        if (all === void 0) { all = false; }
        this._union = { queries: queries, all: all };
        return this;
    };
    AdvancedQueryBuilder.prototype.intersect = function (queries, all) {
        if (all === void 0) { all = false; }
        this._intersect = { queries: queries, all: all };
        return this;
    };
    AdvancedQueryBuilder.prototype.except = function (queries, all) {
        if (all === void 0) { all = false; }
        this._except = { queries: queries, all: all };
        return this;
    };
    // ── Row Locking (FOR UPDATE / FOR SHARE) ──────────────────────────────────
    AdvancedQueryBuilder.prototype.forUpdate = function (tables) {
        this._forUpdate = true;
        if (tables)
            this._lockTables = tables;
        return this;
    };
    AdvancedQueryBuilder.prototype.forShare = function (tables) {
        this._forShare = true;
        if (tables)
            this._lockTables = tables;
        return this;
    };
    AdvancedQueryBuilder.prototype.forNoKeyUpdate = function (tables) {
        this._forNoKeyUpdate = true;
        if (tables)
            this._lockTables = tables;
        return this;
    };
    AdvancedQueryBuilder.prototype.skipLocked = function () {
        this._skipLocked = true;
        return this;
    };
    AdvancedQueryBuilder.prototype.noWait = function () {
        this._nowait = true;
        return this;
    };
    // ── Distinct / Group / Having (existing) ─────────────────────────────────
    AdvancedQueryBuilder.prototype.distinct = function () {
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i] = arguments[_i];
        }
        this._distinct = true;
        if (columns.length)
            this._selects = columns.map(String);
        return this;
    };
    AdvancedQueryBuilder.prototype.groupBy = function () {
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i] = arguments[_i];
        }
        this._groupBy = columns.map(String);
        return this;
    };
    AdvancedQueryBuilder.prototype.having = function (rawSql, params) {
        if (params === void 0) { params = []; }
        this._having = { raw: rawSql, params: params };
        return this;
    };
    // ── Joins ──────────────────────────────────────────────────────────────────
    AdvancedQueryBuilder.prototype.rightJoin = function (table, onLeft, op, onRight) {
        this._joins.push("RIGHT JOIN ".concat(table, " ON ").concat(onLeft, " ").concat(op, " ").concat(onRight));
        return this;
    };
    AdvancedQueryBuilder.prototype.fullOuterJoin = function (table, onLeft, op, onRight) {
        this._joins.push("FULL OUTER JOIN ".concat(table, " ON ").concat(onLeft, " ").concat(op, " ").concat(onRight));
        return this;
    };
    AdvancedQueryBuilder.prototype.lateralJoin = function (table, onLeft, op, onRight, lateralType) {
        if (lateralType === void 0) { lateralType = "INNER"; }
        this._joins.push("".concat(lateralType, " JOIN LATERAL ").concat(table, " ON ").concat(onLeft, " ").concat(op, " ").concat(onRight));
        return this;
    };
    AdvancedQueryBuilder.prototype.crossJoin = function (table) {
        this._joins.push("CROSS JOIN ".concat(table));
        return this;
    };
    // ── Full-text search (PostgreSQL tsvector/tsquery) ────────────────────────
    AdvancedQueryBuilder.prototype.fulltextSearch = function (column, query, config) {
        var _a, _b, _c;
        if (config === void 0) { config = "english"; }
        var dialect = queryBuilder_js_1.Dialects[((_a = this.orm) === null || _a === void 0 ? void 0 : _a.dialect) || "sqlite"];
        var idx = this._countParams();
        if (((_b = this.orm) === null || _b === void 0 ? void 0 : _b.dialect) === "postgres") {
            this._where.push({
                raw: "to_tsvector('".concat(config, "', ").concat(dialect.quoteIdentifier(column), ") @@ plainto_tsquery('").concat(config, "', ").concat(dialect.formatPlaceholder(idx), ")"),
                rawParams: [query],
                kind: "and",
            });
        }
        else if (((_c = this.orm) === null || _c === void 0 ? void 0 : _c.dialect) === "mysql") {
            this._where.push({
                raw: "MATCH(".concat(dialect.quoteIdentifier(column), ") AGAINST(").concat(dialect.formatPlaceholder(idx), " IN BOOLEAN MODE)"),
                rawParams: [query],
                kind: "and",
            });
        }
        else {
            this._where.push({ raw: "".concat(dialect.quoteIdentifier(column), " LIKE ").concat(dialect.formatPlaceholder(idx)), rawParams: ["%".concat(query, "%")], kind: "and" });
        }
        return this;
    };
    /**
     * Add COUNT aggregate to SELECT.
     * NOTE: This is an aggregate selector — it does NOT return a number directly.
     * Use ModelAPI.count() for a numeric count. Chain .get() here to get rows
     * with a COUNT column.
     */
    AdvancedQueryBuilder.prototype.countAggregate = function (column) {
        if (column === void 0) { column = "*"; }
        this._aggregates.push("COUNT(".concat(String(column), ")"));
        return this;
    };
    AdvancedQueryBuilder.prototype.sum = function (column) {
        this._aggregates.push("SUM(".concat(String(column), ")"));
        return this;
    };
    AdvancedQueryBuilder.prototype.avg = function (column) {
        this._aggregates.push("AVG(".concat(String(column), ")"));
        return this;
    };
    AdvancedQueryBuilder.prototype.min = function (column) {
        this._aggregates.push("MIN(".concat(String(column), ")"));
        return this;
    };
    AdvancedQueryBuilder.prototype.max = function (column) {
        this._aggregates.push("MAX(".concat(String(column), ")"));
        return this;
    };
    AdvancedQueryBuilder.prototype.window = function (fn, over) {
        this._window = "".concat(fn, " OVER (").concat(over, ")");
        return this;
    };
    AdvancedQueryBuilder.prototype.selectSubquery = function (sub, alias) {
        var _a;
        var _b = sub.buildSql(), sql = _b.sql, params = _b.params;
        if (!this._selects)
            this._selects = [];
        this._selects.push("(".concat(sql, ") AS ").concat(alias));
        (_a = this._params).push.apply(_a, params);
        return this;
    };
    AdvancedQueryBuilder.prototype.exists = function (sub) {
        var _a = sub.buildSql(), sql = _a.sql, params = _a.params;
        this._where.push({ raw: "EXISTS(".concat(sql, ")"), rawParams: params, kind: "and" });
        return this;
    };
    AdvancedQueryBuilder.prototype.notExists = function (sub) {
        var _a = sub.buildSql(), sql = _a.sql, params = _a.params;
        this._where.push({ raw: "NOT EXISTS(".concat(sql, ")"), rawParams: params, kind: "and" });
        return this;
    };
    /**
     * LATERAL subquery join
     */
    AdvancedQueryBuilder.prototype.lateralSubquery = function (sub, alias, lateralType) {
        var _a;
        if (lateralType === void 0) { lateralType = "INNER"; }
        var _b = sub.buildSql(), sql = _b.sql, params = _b.params;
        (_a = this._params).push.apply(_a, params);
        this._joins.push("".concat(lateralType, " JOIN LATERAL (").concat(sql, ") AS ").concat(alias, " ON true"));
        return this;
    };
    AdvancedQueryBuilder.union = function (queries, all) {
        if (all === void 0) { all = false; }
        var sqls = queries.map(function (q) { return q.buildSql().sql; });
        return sqls.join(all ? " UNION ALL " : " UNION ");
    };
    return AdvancedQueryBuilder;
}(queryBuilder_js_1.QueryBuilder));
exports.AdvancedQueryBuilder = AdvancedQueryBuilder;
