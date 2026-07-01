"use strict";
// queryBuilder.ts
// BUG FIX #2: where("table.col") after join() no longer routes to the
//   relation resolver. It goes straight to _where when the left-hand side
//   of the dot is NOT a known relation on the current model's schema.
//
// BUG FIX #3: whereRaw() now accepts an optional params array so
//   parameterized subqueries don't silently lose their bound values.
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilder = exports.Dialects = void 0;
exports.mapBooleans = mapBooleans;
function mapBooleans(row, schemaFields) {
    var _a;
    var newRow = __assign({}, row);
    for (var _i = 0, _b = Object.keys(schemaFields); _i < _b.length; _i++) {
        var key = _b[_i];
        var fieldType = String(((_a = schemaFields[key]) === null || _a === void 0 ? void 0 : _a.type) || "").toLowerCase();
        if (fieldType.includes("boolean") && key in newRow) {
            var val = newRow[key];
            newRow[key] = val === 1 || val === true || val === "1";
        }
    }
    return newRow;
}
exports.Dialects = {
    sqlite: {
        formatPlaceholder: function () { return "?"; },
        caseInsensitiveLike: function (col) { return "LOWER(".concat(col, ") LIKE LOWER(?)"); },
        quoteIdentifier: function (n) { return "\"".concat(n, "\""); },
    },
    postgres: {
        formatPlaceholder: function (i) { return "$".concat(i + 1); },
        caseInsensitiveLike: function (col, i) { return "".concat(col, " ILIKE $").concat(i + 1); },
        quoteIdentifier: function (n) { return "\"".concat(n, "\""); },
    },
    mysql: {
        formatPlaceholder: function () { return "?"; },
        caseInsensitiveLike: function (col) { return "".concat(col, " LIKE ?"); },
        quoteIdentifier: function (n) { return "`".concat(n, "`"); },
    },
    mongodb: {
        formatPlaceholder: function () { return "?"; },
        caseInsensitiveLike: function (col) { return col; },
        quoteIdentifier: function (n) { return n; },
    },
};
var QueryBuilder = /** @class */ (function () {
    function QueryBuilder(table, dir, exec, modelName, schema, orm) {
        this._selects = null;
        this._where = [];
        this._orderBy = [];
        this._limit = null;
        this._offset = null;
        this._joins = [];
        this._preloads = [];
        this._filteredPreloads = new Map();
        this._exclude = [];
        this._pendingRelated = [];
        this._preloadCache = new Map();
        this._cacheKey = null;
        this._cacheTTL = null;
        if (!dir)
            throw new Error("QueryBuilder requires a valid directory for schema.");
        this.table = table;
        this.exec = exec;
        this.orm = orm;
        this.dir = dir;
        this.schema = schema;
        this.modelName = modelName;
        if (!schema)
            throw new Error("Schema not found");
        if (!this.modelName)
            throw new Error("modelName not found");
    }
    // ── SELECT ──────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.select = function () {
        var cols = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            cols[_i] = arguments[_i];
        }
        this._selects = cols;
        return this;
    };
    /** Type-safe pick: select specific columns and return only those in the result */
    QueryBuilder.prototype.pick = function () {
        var cols = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            cols[_i] = arguments[_i];
        }
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.select.apply(this, cols);
                return [2 /*return*/, this.get()];
            });
        });
    };
    /** Get a single column's values as a flat array */
    QueryBuilder.prototype.pluck = function (col) {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.select(col);
                        return [4 /*yield*/, this.get()];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (r) { return r[col]; })];
                }
            });
        });
    };
    QueryBuilder.prototype.where = function (column, op, value) {
        var _a, _b;
        var col = column;
        if (col.includes(".")) {
            var lastDot = col.lastIndexOf(".");
            var leftPart_1 = col.slice(0, lastDot); // e.g. "user" or "users"
            var fieldName = col.slice(lastDot + 1); // e.g. "name"
            // Check if leftPart is a known relation field name on the current model
            var isKnownRelation = (((_b = (_a = this.schema) === null || _a === void 0 ? void 0 : _a[this.modelName]) === null || _b === void 0 ? void 0 : _b.relations) || [])
                .some(function (r) { return r.fieldName === leftPart_1; });
            if (isKnownRelation) {
                // Relation path → async IN-subquery resolution
                this._pendingRelated.push({ path: leftPart_1, column: fieldName, value: value, op: op });
            }
            else {
                // Plain table.column reference after a manual JOIN → goes straight to SQL WHERE
                this._where.push({ column: col, op: op, value: value, kind: "and" });
            }
        }
        else {
            this._where.push({ column: col, op: op, value: value, kind: "and" });
        }
        return this;
    };
    QueryBuilder.prototype.orWhere = function (column, op, value) {
        this._where.push({ column: column, op: op, value: value, kind: "or" });
        return this;
    };
    // BUG FIX #3: whereRaw() now accepts an optional params array.
    // This is essential when embedding subqueries with ? placeholders:
    //   const sub = db.User.query().select("id").where("active", "=", 1);
    //   const { sql, params } = sub.buildSql();
    //   await db.Post.query().whereRaw(`"userId" IN (${sql})`, params).get();
    QueryBuilder.prototype.whereRaw = function (sql, params) {
        this._where.push({ raw: sql, rawParams: params !== null && params !== void 0 ? params : [], kind: "and" });
        return this;
    };
    QueryBuilder.prototype.whereIn = function (column, values) {
        this._where.push({ column: column, value: values, kind: "in" });
        return this;
    };
    QueryBuilder.prototype.whereNotIn = function (column, values) {
        this._where.push({ column: column, value: values, kind: "notin" });
        return this;
    };
    QueryBuilder.prototype.whereNull = function (column) {
        this._where.push({ column: column, kind: "null" });
        return this;
    };
    QueryBuilder.prototype.whereNotNull = function (column) {
        this._where.push({ column: column, kind: "notnull" });
        return this;
    };
    QueryBuilder.prototype.whereBetween = function (column, min, max) {
        this._where.push({ column: column, value: [min, max], kind: "between" });
        return this;
    };
    // ── ORDER / LIMIT / OFFSET / PAGINATE ───────────────────────────────────────
    QueryBuilder.prototype.orderBy = function (column, dir) {
        if (dir === void 0) { dir = "asc"; }
        this._orderBy.push("".concat(String(column), " ").concat(dir.toUpperCase()));
        return this;
    };
    QueryBuilder.prototype.limit = function (n) { this._limit = n; return this; };
    QueryBuilder.prototype.offset = function (n) { this._offset = n; return this; };
    QueryBuilder.prototype.paginate = function (page, perPage) {
        this._limit = perPage;
        this._offset = (page - 1) * perPage;
        return this;
    };
    // ── JOINS ────────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.join = function (table, onLeft, op, onRight) {
        var clause = "JOIN ".concat(table, " ON ").concat(onLeft, " ").concat(op, " ").concat(onRight);
        if (!this._joins.includes(clause))
            this._joins.push(clause);
        return this;
    };
    QueryBuilder.prototype.leftJoin = function (table, onLeft, op, onRight) {
        var clause = "LEFT JOIN ".concat(table, " ON ").concat(onLeft, " ").concat(op, " ").concat(onRight);
        if (!this._joins.includes(clause))
            this._joins.push(clause);
        return this;
    };
    // ── EXCLUDE / PRELOAD ────────────────────────────────────────────────────────
    QueryBuilder.prototype.exclude = function () {
        var _a;
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i] = arguments[_i];
        }
        (_a = this._exclude).push.apply(_a, columns.map(function (c) { return String(c); }));
        return this;
    };
    QueryBuilder.prototype.preload = function (relation, filter) {
        if (filter) {
            var nestedKey = relation;
            if (!this._filteredPreloads)
                this._filteredPreloads = new Map();
            var fakeQB = new QueryBuilder(this.table, this.dir, this.exec, this.modelName, this.schema, this.orm);
            filter(fakeQB);
            this._filteredPreloads.set(nestedKey, fakeQB._where.slice());
        }
        this._preloads.push(relation);
        return this;
    };
    // ── ILike ────────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.ILike = function (column, value) {
        var _a;
        var dialect = exports.Dialects[((_a = this.orm) === null || _a === void 0 ? void 0 : _a.dialect) || "sqlite"];
        var paramIndex = this._countParams();
        var clause = dialect.caseInsensitiveLike(String(column), paramIndex);
        this._where.push({ raw: clause, rawParams: ["%".concat(value, "%")], kind: "and" });
        return this;
    };
    QueryBuilder.prototype._countParams = function () {
        return this._where.reduce(function (acc, w) {
            var _a, _b, _c, _d;
            if (w.kind === "in" || w.kind === "notin")
                return acc + ((_b = (_a = w.value) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0);
            if (w.kind === "between")
                return acc + 2;
            if (w.kind === "null" || w.kind === "notnull")
                return acc;
            if (w.raw)
                return acc + ((_d = (_c = w.rawParams) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : (w.value !== undefined ? (Array.isArray(w.value) ? w.value.length : 1) : 0));
            return acc + 1;
        }, 0);
    };
    // ── RELATION TRAVERSAL ───────────────────────────────────────────────────────
    QueryBuilder.prototype._resolveRelation = function (modelName, fieldName) {
        var currentSchema = this.schema[modelName];
        if (!currentSchema)
            return undefined;
        var relation = (currentSchema.relations || []).find(function (r) { return r.fieldName === fieldName; });
        if (!relation)
            return undefined;
        var targetSchema = this.schema[relation.targetModel];
        if (!targetSchema)
            return undefined;
        return { relation: relation, targetSchema: targetSchema, currentSchema: currentSchema };
    };
    QueryBuilder.prototype.throughRelation = function (path) {
        var _a, _b;
        var parts = path.split(".");
        var currentModelName = this.modelName;
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            var resolved = this._resolveRelation(currentModelName, part);
            if (!resolved)
                break;
            var relation = resolved.relation, targetSchema = resolved.targetSchema, currentSchema = resolved.currentSchema;
            var foreignKey = relation.foreignKey || ((_a = relation.meta) === null || _a === void 0 ? void 0 : _a.foreignKey) || ((_b = relation.meta) === null || _b === void 0 ? void 0 : _b.foreignkey);
            var targetTable = targetSchema.table;
            var currentTable = currentSchema.table;
            var targetPK = targetSchema.primaryKey || "id";
            var currentPK = currentSchema.primaryKey || "id";
            var parentHasFK = currentSchema.fields && foreignKey in currentSchema.fields;
            var clause = parentHasFK
                ? "JOIN ".concat(targetTable, " ON ").concat(targetTable, ".").concat(targetPK, " = ").concat(currentTable, ".").concat(foreignKey)
                : "JOIN ".concat(targetTable, " ON ").concat(targetTable, ".").concat(foreignKey, " = ").concat(currentTable, ".").concat(currentPK);
            if (!this._joins.includes(clause))
                this._joins.push(clause);
            currentModelName = relation.targetModel;
        }
        return this;
    };
    QueryBuilder.prototype.whereRelated = function (path, column, value) {
        this._pendingRelated.push({ path: path, column: column, value: value });
        return this;
    };
    QueryBuilder.prototype._resolvePendingRelated = function () {
        return __awaiter(this, void 0, void 0, function () {
            var dialect, _loop_1, this_1, _i, _a, pending;
            var _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!this._pendingRelated.length)
                            return [2 /*return*/];
                        dialect = exports.Dialects[((_b = this.orm) === null || _b === void 0 ? void 0 : _b.dialect) || "sqlite"];
                        _loop_1 = function (pending) {
                            var path, column, value, op, parts, currentModelName, steps, _g, parts_2, part, resolved, relation, targetSchema, currentSchema, foreignKey, lastStep, finalSql, finalRes, matchingIds, i, step, ph_1, sql, res, firstStep, ph, rootFilterSql;
                            return __generator(this, function (_h) {
                                switch (_h.label) {
                                    case 0:
                                        path = pending.path, column = pending.column, value = pending.value;
                                        op = (_c = pending.op) !== null && _c !== void 0 ? _c : "=";
                                        parts = path.split(".");
                                        currentModelName = this_1.modelName;
                                        steps = [];
                                        for (_g = 0, parts_2 = parts; _g < parts_2.length; _g++) {
                                            part = parts_2[_g];
                                            resolved = this_1._resolveRelation(currentModelName, part);
                                            if (!resolved)
                                                break;
                                            relation = resolved.relation, targetSchema = resolved.targetSchema, currentSchema = resolved.currentSchema;
                                            foreignKey = relation.foreignKey || ((_d = relation.meta) === null || _d === void 0 ? void 0 : _d.foreignKey) || ((_e = relation.meta) === null || _e === void 0 ? void 0 : _e.foreignkey);
                                            steps.push({
                                                targetTable: targetSchema.table,
                                                targetPK: targetSchema.primaryKey || "id",
                                                foreignKey: foreignKey,
                                                parentOwnsFK: !!(currentSchema.fields && foreignKey in currentSchema.fields),
                                                currentTable: currentSchema.table,
                                                currentPK: currentSchema.primaryKey || "id",
                                            });
                                            currentModelName = relation.targetModel;
                                        }
                                        if (!steps.length)
                                            return [2 /*return*/, "continue"];
                                        lastStep = steps[steps.length - 1];
                                        finalSql = "SELECT ".concat(dialect.quoteIdentifier(lastStep.targetPK), " FROM ").concat(dialect.quoteIdentifier(lastStep.targetTable), " WHERE ").concat(dialect.quoteIdentifier(column), " ").concat(op, " ").concat(dialect.formatPlaceholder(0));
                                        return [4 /*yield*/, this_1.exec(finalSql, [value])];
                                    case 1:
                                        finalRes = _h.sent();
                                        matchingIds = (finalRes.rows || []).map(function (r) { return r[lastStep.targetPK]; });
                                        if (!matchingIds.length) {
                                            this_1._where.push({ raw: "1 = 0", rawParams: [], kind: "and" });
                                            return [2 /*return*/, "continue"];
                                        }
                                        i = steps.length - 1;
                                        _h.label = 2;
                                    case 2:
                                        if (!(i >= 1)) return [3 /*break*/, 5];
                                        step = steps[i];
                                        ph_1 = matchingIds.map(function (_, idx) { return dialect.formatPlaceholder(idx); }).join(", ");
                                        sql = step.parentOwnsFK
                                            ? "SELECT ".concat(dialect.quoteIdentifier(step.currentPK), " FROM ").concat(dialect.quoteIdentifier(step.currentTable), " WHERE ").concat(dialect.quoteIdentifier(step.foreignKey), " IN (").concat(ph_1, ")")
                                            : "SELECT ".concat(dialect.quoteIdentifier(step.foreignKey), " FROM ").concat(dialect.quoteIdentifier(step.targetTable), " WHERE ").concat(dialect.quoteIdentifier(step.targetPK), " IN (").concat(ph_1, ")");
                                        return [4 /*yield*/, this_1.exec(sql, matchingIds)];
                                    case 3:
                                        res = _h.sent();
                                        matchingIds = Array.from(new Set((res.rows || []).map(function (r) { return Object.values(r)[0]; })));
                                        if (!matchingIds.length) {
                                            this_1._where.push({ raw: "1 = 0", rawParams: [], kind: "and" });
                                            return [3 /*break*/, 5];
                                        }
                                        _h.label = 4;
                                    case 4:
                                        i--;
                                        return [3 /*break*/, 2];
                                    case 5:
                                        if (!matchingIds.length)
                                            return [2 /*return*/, "continue"];
                                        firstStep = steps[0];
                                        ph = matchingIds.map(function (_, idx) { return dialect.formatPlaceholder(idx); }).join(", ");
                                        rootFilterSql = firstStep.parentOwnsFK
                                            ? "".concat(dialect.quoteIdentifier(this_1.table), ".").concat(dialect.quoteIdentifier(firstStep.foreignKey), " IN (").concat(ph, ")")
                                            : "".concat(dialect.quoteIdentifier(this_1.table), ".").concat(dialect.quoteIdentifier(firstStep.currentPK), " IN (").concat(ph, ")");
                                        this_1._where.push({ raw: rootFilterSql, rawParams: matchingIds, kind: "and" });
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _i = 0, _a = this._pendingRelated;
                        _f.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        pending = _a[_i];
                        return [5 /*yield**/, _loop_1(pending)];
                    case 2:
                        _f.sent();
                        _f.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        this._pendingRelated = [];
                        return [2 /*return*/];
                }
            });
        });
    };
    QueryBuilder.prototype.relatedTo = function (targetModelName, column, value) {
        var queue = [{ modelName: this.modelName, path: [] }];
        var visited = new Set();
        var foundPath = null;
        while (queue.length) {
            var _a = queue.shift(), modelName = _a.modelName, path = _a.path;
            if (visited.has(modelName))
                continue;
            visited.add(modelName);
            if (modelName === targetModelName) {
                foundPath = path;
                break;
            }
            var modelSchema = this.schema[modelName];
            if (!modelSchema)
                continue;
            for (var _i = 0, _b = modelSchema.relations || []; _i < _b.length; _i++) {
                var relation = _b[_i];
                if (!visited.has(relation.targetModel)) {
                    queue.push({ modelName: relation.targetModel, path: __spreadArray(__spreadArray([], path, true), [relation.fieldName], false) });
                }
            }
        }
        if (!foundPath) {
            throw new Error("relatedTo: no relation path found from \"".concat(this.modelName, "\" to \"").concat(targetModelName, "\""));
        }
        return this.whereRelated(foundPath.join("."), column, value);
    };
    // ── MongoDB helpers ──────────────────────────────────────────────────────────
    QueryBuilder.prototype.buildMongoFilter = function () {
        var filter = {};
        var orClauses = [];
        for (var _i = 0, _a = this._where; _i < _a.length; _i++) {
            var w = _a[_i];
            if (w.kind === "or") {
                var c = {};
                c[w.column] = this._mongoOp(w.op, w.value);
                orClauses.push(c);
                continue;
            }
            if (w.kind === "null") {
                filter[w.column] = null;
                continue;
            }
            if (w.kind === "notnull") {
                filter[w.column] = { $ne: null };
                continue;
            }
            if (w.kind === "in") {
                filter[w.column] = { $in: w.value };
                continue;
            }
            if (w.kind === "notin") {
                filter[w.column] = { $nin: w.value };
                continue;
            }
            if (w.kind === "between") {
                filter[w.column] = { $gte: w.value[0], $lte: w.value[1] };
                continue;
            }
            if (w.raw)
                continue;
            filter[w.column] = this._mongoOp(w.op, w.value);
        }
        if (orClauses.length)
            filter["$or"] = orClauses;
        return filter;
    };
    QueryBuilder.prototype._mongoOp = function (op, value) {
        switch (op) {
            case "=": return value;
            case "!=": return { $ne: value };
            case ">": return { $gt: value };
            case ">=": return { $gte: value };
            case "<": return { $lt: value };
            case "<=": return { $lte: value };
            case "LIKE": return { $regex: value.replace(/%/g, ".*"), $options: "i" };
            default: return value;
        }
    };
    // ── SQL builder ──────────────────────────────────────────────────────────────
    QueryBuilder.prototype.buildSql = function () {
        var _a, _b, _c, _d, _e, _f;
        var isMongo = (((_a = this.orm) === null || _a === void 0 ? void 0 : _a.dialect) || "sqlite") === "mongodb";
        if (isMongo) {
            var mongoCmd = {
                collection: this.table, action: "find",
                filter: this.buildMongoFilter(),
                projection: ((_b = this._selects) === null || _b === void 0 ? void 0 : _b.length) ? Object.fromEntries(this._selects.map(function (c) { return [c, 1]; })) : undefined,
                sort: this._orderBy.length ? Object.fromEntries(this._orderBy.map(function (o) { var _a = o.split(" "), col = _a[0], dir = _a[1]; return [col, dir === "DESC" ? -1 : 1]; })) : undefined,
                limit: (_c = this._limit) !== null && _c !== void 0 ? _c : undefined,
                skip: (_d = this._offset) !== null && _d !== void 0 ? _d : undefined,
            };
            return { sql: JSON.stringify(mongoCmd), params: [] };
        }
        var dialect = exports.Dialects[((_e = this.orm) === null || _e === void 0 ? void 0 : _e.dialect) || "sqlite"];
        var sql = "SELECT ";
        if ((_f = this._selects) === null || _f === void 0 ? void 0 : _f.length) {
            sql += this._selects.map(function (c) { return dialect.quoteIdentifier(c); }).join(", ");
        }
        else if (this._joins.length) {
            sql += "".concat(dialect.quoteIdentifier(this.table), ".*");
        }
        else {
            sql += "*";
        }
        sql += " FROM ".concat(dialect.quoteIdentifier(this.table));
        if (this._joins.length)
            sql += " " + this._joins.join(" ");
        var _g = this._buildWhereSql(0), whereSql = _g.sql, params = _g.params;
        if (whereSql)
            sql += " WHERE " + whereSql;
        if (this._orderBy.length) {
            sql += " ORDER BY " + this._orderBy.map(function (c) {
                var _a = c.split(" "), col = _a[0], dir = _a[1];
                return "".concat(dialect.quoteIdentifier(col), " ").concat(dir || "");
            }).join(", ");
        }
        if (this._limit != null)
            sql += " LIMIT " + this._limit;
        if (this._offset != null)
            sql += " OFFSET " + this._offset;
        return { sql: sql, params: params };
    };
    QueryBuilder.prototype._buildWhereSql = function (startIndex) {
        var _this = this;
        var _a;
        if (startIndex === void 0) { startIndex = 0; }
        if (!this._where.length)
            return { sql: "", params: [] };
        var dialect = exports.Dialects[((_a = this.orm) === null || _a === void 0 ? void 0 : _a.dialect) || "sqlite"];
        var params = [];
        var paramIndex = startIndex;
        var parts = [];
        // quoteRef: handles both plain "col" and dotted "table.col" refs
        var quoteRef = function (ref) {
            return ref.split(".").map(function (part) { return dialect.quoteIdentifier(part); }).join(".");
        };
        var qualify = function (col) {
            var c = String(col);
            // Only qualify unambiguous cols (no dot) when joins are present
            if (_this._joins.length && !c.includes("."))
                return "".concat(_this.table, ".").concat(c);
            return c;
        };
        for (var i = 0; i < this._where.length; i++) {
            var w = this._where[i];
            var connector = i === 0 ? "" : w.kind === "or" ? " OR " : " AND ";
            if (w.kind === "null") {
                parts.push("".concat(connector).concat(quoteRef(qualify(w.column)), " IS NULL"));
                continue;
            }
            if (w.kind === "notnull") {
                parts.push("".concat(connector).concat(quoteRef(qualify(w.column)), " IS NOT NULL"));
                continue;
            }
            if (w.kind === "in" || w.kind === "notin") {
                var placeholders = w.value.map(function () { return dialect.formatPlaceholder(paramIndex++); });
                params.push.apply(params, w.value);
                parts.push("".concat(connector).concat(quoteRef(qualify(w.column)), " ").concat(w.kind === "in" ? "IN" : "NOT IN", " (").concat(placeholders.join(", "), ")"));
                continue;
            }
            if (w.kind === "between") {
                var ph1 = dialect.formatPlaceholder(paramIndex++);
                var ph2 = dialect.formatPlaceholder(paramIndex++);
                params.push(w.value[0], w.value[1]);
                parts.push("".concat(connector).concat(quoteRef(qualify(w.column)), " BETWEEN ").concat(ph1, " AND ").concat(ph2));
                continue;
            }
            if (w.raw) {
                // BUG FIX #3 + ILike fix: prefer rawParams if present, fall back to
                // legacy w.value for backward compatibility
                if (w.rawParams && w.rawParams.length > 0) {
                    params.push.apply(params, w.rawParams);
                    paramIndex += w.rawParams.length;
                }
                else if (w.value !== undefined) {
                    if (Array.isArray(w.value)) {
                        params.push.apply(params, w.value);
                        paramIndex += w.value.length;
                    }
                    else {
                        params.push(w.value);
                        paramIndex++;
                    }
                }
                parts.push("".concat(connector).concat(w.raw));
                continue;
            }
            var ph = dialect.formatPlaceholder(paramIndex++);
            params.push(w.value);
            // quoteRef correctly handles dotted refs: "users.name" → "users"."name"
            parts.push("".concat(connector).concat(quoteRef(qualify(w.column)), " ").concat(w.op, " ").concat(ph));
        }
        return { sql: parts.join(""), params: params };
    };
    // ── getPaginated ──────────────────────────────────────────────────────────────
    QueryBuilder.prototype.getPaginated = function (page, perPage) {
        return __awaiter(this, void 0, void 0, function () {
            var isMongo, total, countRes, dialect, _a, whereSql, params, countSql, countRes, data;
            var _b, _c, _d, _e, _f, _g, _h, _j;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0: return [4 /*yield*/, this._resolvePendingRelated()];
                    case 1:
                        _k.sent();
                        isMongo = (((_b = this.orm) === null || _b === void 0 ? void 0 : _b.dialect) || "sqlite") === "mongodb";
                        total = 0;
                        if (!isMongo) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.exec(JSON.stringify({ collection: this.table, action: "count", filter: this.buildMongoFilter() }), [])];
                    case 2:
                        countRes = _k.sent();
                        total = parseInt((_e = (_d = (_c = countRes.rows) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.count) !== null && _e !== void 0 ? _e : "0", 10);
                        return [3 /*break*/, 5];
                    case 3:
                        dialect = exports.Dialects[((_f = this.orm) === null || _f === void 0 ? void 0 : _f.dialect) || "sqlite"];
                        _a = this._buildWhereSql(0), whereSql = _a.sql, params = _a.params;
                        countSql = "SELECT COUNT(*) as count FROM ".concat(dialect.quoteIdentifier(this.table));
                        if (this._joins.length)
                            countSql += " " + this._joins.join(" ");
                        if (whereSql)
                            countSql += " WHERE " + whereSql;
                        return [4 /*yield*/, this.exec(countSql, params)];
                    case 4:
                        countRes = _k.sent();
                        total = parseInt((_j = (_h = (_g = countRes.rows) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.count) !== null && _j !== void 0 ? _j : "0", 10);
                        _k.label = 5;
                    case 5:
                        this.paginate(page, perPage);
                        return [4 /*yield*/, this.get()];
                    case 6:
                        data = _k.sent();
                        return [2 /*return*/, { data: data, total: total, page: page, lastPage: Math.ceil(total / perPage) || 1 }];
                }
            });
        });
    };
    QueryBuilder.prototype.cache = function (key, ttlSeconds) {
        if (ttlSeconds === void 0) { ttlSeconds = 300; }
        this._cacheKey = key;
        this._cacheTTL = ttlSeconds;
        return this;
    };
    QueryBuilder.clearCache = function () {
        QueryBuilder._resultCache.clear();
    };
    // ── get ───────────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.get = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cached, _a, sql, params, res, rows, schemaFields;
            var _this = this;
            var _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0: return [4 /*yield*/, this._resolvePendingRelated()];
                    case 1:
                        _e.sent();
                        // Check result cache
                        if (this._cacheKey) {
                            cached = QueryBuilder._resultCache.get(this._cacheKey);
                            if (cached && cached.expires > Date.now()) {
                                return [2 /*return*/, cached.data];
                            }
                        }
                        _a = this.buildSql(), sql = _a.sql, params = _a.params;
                        return [4 /*yield*/, this.exec(sql, params)];
                    case 2:
                        res = _e.sent();
                        rows = (res.rows || []);
                        // Store in cache
                        if (this._cacheKey) {
                            QueryBuilder._resultCache.set(this._cacheKey, {
                                data: rows,
                                expires: Date.now() + ((_b = this._cacheTTL) !== null && _b !== void 0 ? _b : 300) * 1000,
                            });
                        }
                        if (!this._preloads.length) return [3 /*break*/, 4];
                        this._preloadCache.clear();
                        return [4 /*yield*/, this.applyPreloads(rows)];
                    case 3:
                        rows = _e.sent();
                        _e.label = 4;
                    case 4:
                        schemaFields = (_d = (_c = this.schema[this.modelName]) === null || _c === void 0 ? void 0 : _c.fields) !== null && _d !== void 0 ? _d : {};
                        rows = rows.map(function (r) { return _this.mapJson(mapBooleans(r, schemaFields), schemaFields); });
                        if (this._exclude.length) {
                            rows = rows.map(function (r) {
                                var copy = __assign({}, r);
                                for (var _i = 0, _a = _this._exclude; _i < _a.length; _i++) {
                                    var col = _a[_i];
                                    if (!col.includes("."))
                                        delete copy[col];
                                }
                                return copy;
                            });
                        }
                        return [2 /*return*/, rows];
                }
            });
        });
    };
    // ── first ─────────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.first = function (condition) {
        return __awaiter(this, void 0, void 0, function () {
            var dialect, modelSchema, modelCols, sql, _i, modelCols_1, col, quoted, _a, _b, key, val, rows;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        dialect = exports.Dialects[((_c = this.orm) === null || _c === void 0 ? void 0 : _c.dialect) || "sqlite"];
                        modelSchema = this.schema ? this.schema[this.modelName] : undefined;
                        modelCols = modelSchema ? Object.keys(modelSchema.fields || {}) : [];
                        if (condition) {
                            if (typeof condition === "string") {
                                sql = condition;
                                if (modelCols.length) {
                                    for (_i = 0, modelCols_1 = modelCols; _i < modelCols_1.length; _i++) {
                                        col = modelCols_1[_i];
                                        quoted = dialect.quoteIdentifier(col);
                                        sql = sql.replace(new RegExp("(?<![A-Za-z0-9_\"])".concat(col, "(?![A-Za-z0-9_\"])"), "g"), quoted);
                                    }
                                }
                                this._where.push({ raw: sql, rawParams: [], kind: "and" });
                            }
                            else if (typeof condition === "object") {
                                for (_a = 0, _b = Object.keys(condition); _a < _b.length; _a++) {
                                    key = _b[_a];
                                    val = condition[key];
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
                        return [4 /*yield*/, this.get()];
                    case 1:
                        rows = _d.sent();
                        return [2 /*return*/, rows[0] || null];
                }
            });
        });
    };
    // ── Preload engine ────────────────────────────────────────────────────────────
    QueryBuilder.prototype.spawnChildBuilder = function (targetTable, targetModelName) {
        var ChildClass = this.constructor;
        return new ChildClass(targetTable, this.dir, this.exec, targetModelName, this.schema, this.orm);
    };
    QueryBuilder.prototype.applyPreloads = function (rows_1) {
        return __awaiter(this, arguments, void 0, function (rows, visited) {
            var modelSchema, isMongo, dialect, rootPK, relations, grouped, _i, _a, preload, parts, root, hasValues, buildWhereClauseForPreload, mongoFetch, sqlFetch, manyToManyJoinFetchWithFilter, manyToManyJoinFetch, fetchRelation, _loop_2, _b, _c, root;
            var _this = this;
            var _d, _e;
            if (visited === void 0) { visited = new Set(); }
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (!rows.length)
                            return [2 /*return*/, rows];
                        modelSchema = this.schema[this.modelName];
                        if (!modelSchema)
                            return [2 /*return*/, rows];
                        isMongo = (((_d = this.orm) === null || _d === void 0 ? void 0 : _d.dialect) || "sqlite") === "mongodb";
                        dialect = exports.Dialects[((_e = this.orm) === null || _e === void 0 ? void 0 : _e.dialect) || "sqlite"];
                        rootPK = modelSchema.primaryKey || "id";
                        relations = (modelSchema.relations || []).map(function (r) {
                            var _a, _b, _c, _d, _e;
                            return ({
                                fieldName: r.fieldName, kind: r.kind, targetModel: r.targetModel,
                                foreignKey: r.foreignKey || ((_a = r.meta) === null || _a === void 0 ? void 0 : _a.foreignKey) || ((_b = r.meta) === null || _b === void 0 ? void 0 : _b.foreignkey),
                                relatedKey: r.relatedKey || ((_c = r.meta) === null || _c === void 0 ? void 0 : _c.relatedKey) || ((_d = r.meta) === null || _d === void 0 ? void 0 : _d.relatedkey),
                                through: r.through || ((_e = r.meta) === null || _e === void 0 ? void 0 : _e.through),
                            });
                        });
                        if (!relations.length)
                            return [2 /*return*/, rows];
                        grouped = {};
                        for (_i = 0, _a = this._preloads; _i < _a.length; _i++) {
                            preload = _a[_i];
                            parts = preload.split(".");
                            root = parts.shift();
                            if (!grouped[root])
                                grouped[root] = [];
                            if (parts.length)
                                grouped[root].push(parts.join("."));
                        }
                        hasValues = function (arr) { return Array.isArray(arr) && arr.length > 0; };
                        buildWhereClauseForPreload = function (fieldName, targetTable) {
                            var _a;
                            var filterWheres = (_a = _this._filteredPreloads) === null || _a === void 0 ? void 0 : _a.get(fieldName);
                            if (!(filterWheres === null || filterWheres === void 0 ? void 0 : filterWheres.length))
                                return { sql: "", params: [] };
                            var origWhere = _this._where;
                            _this._where = filterWheres;
                            var result = _this._buildWhereSql(0);
                            var sql = result.sql;
                            for (var _i = 0, filterWheres_1 = filterWheres; _i < filterWheres_1.length; _i++) {
                                var w = filterWheres_1[_i];
                                if (w.column && !w.column.includes(".")) {
                                    sql = sql.replace(new RegExp("\\b".concat(w.column, "\\b"), "g"), "".concat(targetTable, ".").concat(w.column));
                                }
                            }
                            _this._where = origWhere;
                            return { sql: sql ? " AND (".concat(sql, ")") : "", params: result.params };
                        };
                        mongoFetch = function (targetTable, filter) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.exec(JSON.stringify({ collection: targetTable, action: "find", filter: filter }), [])];
                                case 1: return [2 /*return*/, (_a.sent()).rows || []];
                            }
                        }); }); };
                        sqlFetch = function (targetTable, colName, ids, fieldName) { return __awaiter(_this, void 0, void 0, function () {
                            var fc, cacheKey, ph, sql, params, result;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        fc = fieldName ? buildWhereClauseForPreload(fieldName, targetTable) : { sql: "", params: [] };
                                        cacheKey = "".concat(targetTable, ":").concat(colName, ":").concat(__spreadArray([], ids, true).sort().join(","), ":").concat(fc.sql);
                                        if (this._preloadCache.has(cacheKey))
                                            return [2 /*return*/, this._preloadCache.get(cacheKey)];
                                        ph = ids.map(function (_, i) { return dialect.formatPlaceholder(i); }).join(", ");
                                        sql = "SELECT * FROM ".concat(dialect.quoteIdentifier(targetTable), " WHERE ").concat(dialect.quoteIdentifier(colName), " IN (").concat(ph, ")").concat(fc.sql);
                                        params = ids.concat(fc.params);
                                        return [4 /*yield*/, this.exec(sql, params)];
                                    case 1:
                                        result = (_a.sent()).rows || [];
                                        this._preloadCache.set(cacheKey, result);
                                        return [2 /*return*/, result];
                                }
                            });
                        }); };
                        manyToManyJoinFetchWithFilter = function (through, targetTable, targetPK, foreignKey, relatedKey, parentIds, fieldName) { return __awaiter(_this, void 0, void 0, function () {
                            var fc, junction, targetIds, ph, sql, rows, junctionRows, relatedRows;
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        fc = fieldName ? buildWhereClauseForPreload(fieldName, targetTable) : { sql: "", params: [] };
                                        if (!isMongo) return [3 /*break*/, 3];
                                        return [4 /*yield*/, mongoFetch(through, (_a = {}, _a[foreignKey] = { $in: parentIds }, _a))];
                                    case 1:
                                        junction = _d.sent();
                                        targetIds = Array.from(new Set(junction.map(function (j) { return j[relatedKey]; })));
                                        if (!hasValues(targetIds))
                                            return [2 /*return*/, { junctionRows: [], relatedRows: [] }];
                                        _b = { junctionRows: junction };
                                        return [4 /*yield*/, mongoFetch(targetTable, __assign((_c = {}, _c[targetPK] = { $in: targetIds }, _c), (fc.sql ? {} : {})))];
                                    case 2: return [2 /*return*/, (_b.relatedRows = _d.sent(), _b)];
                                    case 3:
                                        ph = parentIds.map(function (_, i) { return dialect.formatPlaceholder(i); }).join(", ");
                                        sql = "SELECT ".concat(dialect.quoteIdentifier(targetTable), ".*, ") +
                                            "".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(foreignKey), " AS __pivot_fk ") +
                                            "FROM ".concat(dialect.quoteIdentifier(targetTable), " ") +
                                            "INNER JOIN ".concat(dialect.quoteIdentifier(through), " ") +
                                            "ON ".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(relatedKey), " = ") +
                                            "".concat(dialect.quoteIdentifier(targetTable), ".").concat(dialect.quoteIdentifier(targetPK), " ") +
                                            "WHERE ".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(foreignKey), " IN (").concat(ph, ")").concat(fc.sql);
                                        return [4 /*yield*/, this.exec(sql, parentIds.concat(fc.params))];
                                    case 4:
                                        rows = (_d.sent()).rows || [];
                                        junctionRows = rows.map(function (r) {
                                            var _a;
                                            return (_a = {}, _a[foreignKey] = r.__pivot_fk, _a[relatedKey] = r[targetPK], _a);
                                        });
                                        relatedRows = rows.map(function (r) { var c = __assign({}, r); delete c.__pivot_fk; return c; });
                                        return [2 /*return*/, { junctionRows: junctionRows, relatedRows: relatedRows }];
                                }
                            });
                        }); };
                        manyToManyJoinFetch = function (through, targetTable, targetPK, foreignKey, relatedKey, parentIds) { return __awaiter(_this, void 0, void 0, function () {
                            var junction, targetIds, ph, sql, rows, junctionRows, relatedRows;
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        if (!isMongo) return [3 /*break*/, 3];
                                        return [4 /*yield*/, mongoFetch(through, (_a = {}, _a[foreignKey] = { $in: parentIds }, _a))];
                                    case 1:
                                        junction = _d.sent();
                                        targetIds = Array.from(new Set(junction.map(function (j) { return j[relatedKey]; })));
                                        if (!hasValues(targetIds))
                                            return [2 /*return*/, { junctionRows: [], relatedRows: [] }];
                                        _b = { junctionRows: junction };
                                        return [4 /*yield*/, mongoFetch(targetTable, (_c = {}, _c[targetPK] = { $in: targetIds }, _c))];
                                    case 2: return [2 /*return*/, (_b.relatedRows = _d.sent(), _b)];
                                    case 3:
                                        ph = parentIds.map(function (_, i) { return dialect.formatPlaceholder(i); }).join(", ");
                                        sql = "SELECT ".concat(dialect.quoteIdentifier(targetTable), ".*, ") +
                                            "".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(foreignKey), " AS __pivot_fk ") +
                                            "FROM ".concat(dialect.quoteIdentifier(targetTable), " ") +
                                            "INNER JOIN ".concat(dialect.quoteIdentifier(through), " ") +
                                            "ON ".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(relatedKey), " = ") +
                                            "".concat(dialect.quoteIdentifier(targetTable), ".").concat(dialect.quoteIdentifier(targetPK), " ") +
                                            "WHERE ".concat(dialect.quoteIdentifier(through), ".").concat(dialect.quoteIdentifier(foreignKey), " IN (").concat(ph, ")");
                                        return [4 /*yield*/, this.exec(sql, parentIds)];
                                    case 4:
                                        rows = (_d.sent()).rows || [];
                                        junctionRows = rows.map(function (r) {
                                            var _a;
                                            return (_a = {}, _a[foreignKey] = r.__pivot_fk, _a[relatedKey] = r[targetPK], _a);
                                        });
                                        relatedRows = rows.map(function (r) { var c = __assign({}, r); delete c.__pivot_fk; return c; });
                                        return [2 /*return*/, { junctionRows: junctionRows, relatedRows: relatedRows }];
                                }
                            });
                        }); };
                        fetchRelation = function (relation, parentRows) { return __awaiter(_this, void 0, void 0, function () {
                            var cycleKey, targetSchema, targetPK, kind, through, foreignKey, relatedKey, relatedRows, filterClause, parentIds, _a, map_1, fkValues, _b, map_2, parentHasFK, parentIds, _c, map_3, fkValues, _d, map_4, parentIds, _e, junctionRows, fetchedRows, targetMap_1, parentMap_1, nested, child;
                            var _f, _g, _h, _j;
                            var _this = this;
                            return __generator(this, function (_k) {
                                switch (_k.label) {
                                    case 0:
                                        cycleKey = "".concat(this.modelName, ":").concat(relation.fieldName);
                                        if (visited.has(cycleKey))
                                            return [2 /*return*/, []];
                                        visited.add(cycleKey);
                                        targetSchema = this.schema[relation.targetModel];
                                        if (!targetSchema)
                                            return [2 /*return*/, []];
                                        targetPK = targetSchema.primaryKey || "id";
                                        kind = relation.kind, through = relation.through;
                                        foreignKey = relation.foreignKey;
                                        relatedKey = relation.relatedKey;
                                        relatedRows = [];
                                        filterClause = buildWhereClauseForPreload(relation.fieldName, targetSchema.table);
                                        if (!(kind === "onetomany")) return [3 /*break*/, 5];
                                        parentIds = Array.from(new Set(parentRows.map(function (r) { return r[rootPK]; }).filter(Boolean)));
                                        if (!hasValues(parentIds)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = []); });
                                            return [2 /*return*/, []];
                                        }
                                        if (!isMongo) return [3 /*break*/, 2];
                                        return [4 /*yield*/, mongoFetch(targetSchema.table, (_f = {}, _f[foreignKey] = { $in: parentIds }, _f))];
                                    case 1:
                                        _a = _k.sent();
                                        return [3 /*break*/, 4];
                                    case 2: return [4 /*yield*/, sqlFetch(targetSchema.table, foreignKey, parentIds, relation.fieldName)];
                                    case 3:
                                        _a = _k.sent();
                                        _k.label = 4;
                                    case 4:
                                        relatedRows = _a;
                                        relatedRows = relatedRows.map(function (r) { return _this.cleanRow(r, targetSchema, relation.fieldName); });
                                        map_1 = new Map();
                                        relatedRows.forEach(function (r) { var k = r[foreignKey]; if (!map_1.has(k))
                                            map_1.set(k, []); map_1.get(k).push(r); });
                                        parentRows.forEach(function (r) { return (r[relation.fieldName] = map_1.get(r[rootPK]) || []); });
                                        return [3 /*break*/, 23];
                                    case 5:
                                        if (!(kind === "manytoone")) return [3 /*break*/, 10];
                                        fkValues = Array.from(new Set(parentRows.map(function (r) { return r[foreignKey]; }).filter(Boolean)));
                                        if (!hasValues(fkValues)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = null); });
                                            return [2 /*return*/, []];
                                        }
                                        if (!isMongo) return [3 /*break*/, 7];
                                        return [4 /*yield*/, mongoFetch(targetSchema.table, (_g = {}, _g[targetPK] = { $in: fkValues }, _g))];
                                    case 6:
                                        _b = _k.sent();
                                        return [3 /*break*/, 9];
                                    case 7: return [4 /*yield*/, sqlFetch(targetSchema.table, targetPK, fkValues, relation.fieldName)];
                                    case 8:
                                        _b = _k.sent();
                                        _k.label = 9;
                                    case 9:
                                        relatedRows = _b;
                                        relatedRows = relatedRows.map(function (r) { return _this.cleanRow(r, targetSchema, relation.fieldName); });
                                        map_2 = new Map(relatedRows.map(function (r) { return [r[targetPK], r]; }));
                                        parentRows.forEach(function (r) { return (r[relation.fieldName] = map_2.get(r[foreignKey]) || null); });
                                        return [3 /*break*/, 23];
                                    case 10:
                                        if (!(kind === "onetoone")) return [3 /*break*/, 21];
                                        parentHasFK = parentRows.some(function (r) { return Object.prototype.hasOwnProperty.call(r, foreignKey); });
                                        if (!!parentHasFK) return [3 /*break*/, 15];
                                        parentIds = Array.from(new Set(parentRows.map(function (r) { return r[rootPK]; }).filter(Boolean)));
                                        if (!hasValues(parentIds)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = null); });
                                            return [2 /*return*/, []];
                                        }
                                        if (!isMongo) return [3 /*break*/, 12];
                                        return [4 /*yield*/, mongoFetch(targetSchema.table, (_h = {}, _h[foreignKey] = { $in: parentIds }, _h))];
                                    case 11:
                                        _c = _k.sent();
                                        return [3 /*break*/, 14];
                                    case 12: return [4 /*yield*/, sqlFetch(targetSchema.table, foreignKey, parentIds, relation.fieldName)];
                                    case 13:
                                        _c = _k.sent();
                                        _k.label = 14;
                                    case 14:
                                        relatedRows = _c;
                                        relatedRows = relatedRows.map(function (r) { return _this.cleanRow(r, targetSchema, relation.fieldName); });
                                        map_3 = new Map(relatedRows.map(function (r) { return [r[foreignKey], r]; }));
                                        parentRows.forEach(function (r) { return (r[relation.fieldName] = map_3.get(r[rootPK]) || null); });
                                        return [3 /*break*/, 20];
                                    case 15:
                                        fkValues = Array.from(new Set(parentRows.map(function (r) { return r[foreignKey]; }).filter(Boolean)));
                                        if (!hasValues(fkValues)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = null); });
                                            return [2 /*return*/, []];
                                        }
                                        if (!isMongo) return [3 /*break*/, 17];
                                        return [4 /*yield*/, mongoFetch(targetSchema.table, (_j = {}, _j[targetPK] = { $in: fkValues }, _j))];
                                    case 16:
                                        _d = _k.sent();
                                        return [3 /*break*/, 19];
                                    case 17: return [4 /*yield*/, sqlFetch(targetSchema.table, targetPK, fkValues, relation.fieldName)];
                                    case 18:
                                        _d = _k.sent();
                                        _k.label = 19;
                                    case 19:
                                        relatedRows = _d;
                                        relatedRows = relatedRows.map(function (r) { return _this.cleanRow(r, targetSchema, relation.fieldName); });
                                        map_4 = new Map(relatedRows.map(function (r) { return [r[targetPK], r]; }));
                                        parentRows.forEach(function (r) { return (r[relation.fieldName] = map_4.get(r[foreignKey]) || null); });
                                        _k.label = 20;
                                    case 20: return [3 /*break*/, 23];
                                    case 21:
                                        if (!(kind === "manytomany")) return [3 /*break*/, 23];
                                        if (!through || !foreignKey || !relatedKey)
                                            return [2 /*return*/, []];
                                        parentIds = Array.from(new Set(parentRows.map(function (r) { return r[rootPK]; }).filter(Boolean)));
                                        if (!hasValues(parentIds)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = []); });
                                            return [2 /*return*/, []];
                                        }
                                        return [4 /*yield*/, manyToManyJoinFetchWithFilter(through, targetSchema.table, targetPK, foreignKey, relatedKey, parentIds, relation.fieldName)];
                                    case 22:
                                        _e = _k.sent(), junctionRows = _e.junctionRows, fetchedRows = _e.relatedRows;
                                        if (!hasValues(fetchedRows)) {
                                            parentRows.forEach(function (r) { return (r[relation.fieldName] = []); });
                                            return [2 /*return*/, []];
                                        }
                                        relatedRows = fetchedRows.map(function (r) { return _this.cleanRow(r, targetSchema, relation.fieldName); });
                                        targetMap_1 = new Map(relatedRows.map(function (r) { return [r[targetPK], r]; }));
                                        parentMap_1 = new Map();
                                        junctionRows.forEach(function (j) {
                                            var arr = parentMap_1.get(j[foreignKey]) || [];
                                            if (targetMap_1.has(j[relatedKey]))
                                                arr.push(targetMap_1.get(j[relatedKey]));
                                            parentMap_1.set(j[foreignKey], arr);
                                        });
                                        parentRows.forEach(function (r) { return (r[relation.fieldName] = parentMap_1.get(r[rootPK]) || []); });
                                        _k.label = 23;
                                    case 23:
                                        nested = grouped[relation.fieldName];
                                        if (!((nested === null || nested === void 0 ? void 0 : nested.length) && hasValues(relatedRows))) return [3 /*break*/, 25];
                                        child = this.spawnChildBuilder(targetSchema.table, relation.targetModel);
                                        child._preloads = nested;
                                        child._exclude = this._nestedExcludes(relation.fieldName);
                                        if ("_withTrashed" in this)
                                            child._withTrashed = this._withTrashed;
                                        if ("_onlyTrashed" in this)
                                            child._onlyTrashed = this._onlyTrashed;
                                        return [4 /*yield*/, child.applyPreloads(relatedRows, visited)];
                                    case 24:
                                        _k.sent();
                                        _k.label = 25;
                                    case 25: return [2 /*return*/, relatedRows];
                                }
                            });
                        }); };
                        _loop_2 = function (root) {
                            var relation;
                            return __generator(this, function (_g) {
                                switch (_g.label) {
                                    case 0:
                                        relation = relations.find(function (r) { return r.fieldName === root; });
                                        if (!relation)
                                            return [2 /*return*/, "continue"];
                                        return [4 /*yield*/, fetchRelation(relation, rows)];
                                    case 1:
                                        _g.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        _b = 0, _c = Object.keys(grouped);
                        _f.label = 1;
                    case 1:
                        if (!(_b < _c.length)) return [3 /*break*/, 4];
                        root = _c[_b];
                        return [5 /*yield**/, _loop_2(root)];
                    case 2:
                        _f.sent();
                        _f.label = 3;
                    case 3:
                        _b++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, rows.map(function (r) { return _this.applyExcludes(r); })];
                }
            });
        });
    };
    // ── Utilities ─────────────────────────────────────────────────────────────────
    QueryBuilder.prototype.cleanRow = function (row, targetSchema, root) {
        var clean = mapBooleans(row, targetSchema.fields || {});
        clean = this.mapJson(clean, targetSchema.fields || {});
        if (root) {
            var nestedExcludes = this._nestedExcludes(root);
            if (nestedExcludes.length)
                clean = this.removeExcluded(clean, nestedExcludes);
        }
        return clean;
    };
    QueryBuilder.prototype.mapJson = function (row, schemaFields) {
        var _a;
        var out = __assign({}, row);
        for (var _i = 0, _b = Object.keys(schemaFields); _i < _b.length; _i++) {
            var key = _b[_i];
            var meta = (_a = schemaFields[key]) === null || _a === void 0 ? void 0 : _a.meta;
            var isJson = !!((meta === null || meta === void 0 ? void 0 : meta.json) || (meta === null || meta === void 0 ? void 0 : meta["@json"]));
            if (isJson && typeof out[key] === "string") {
                try {
                    out[key] = JSON.parse(out[key]);
                }
                catch (_c) { }
            }
        }
        return out;
    };
    QueryBuilder.prototype.removeExcluded = function (obj, excludes) {
        var _this = this;
        if (!obj || typeof obj !== "object")
            return obj;
        if (Array.isArray(obj))
            return obj.map(function (item) { return _this.removeExcluded(item, excludes); });
        var result = {};
        var _loop_3 = function (key) {
            var nested = excludes.filter(function (e) { return e.startsWith(key + "."); }).map(function (e) { return e.slice(key.length + 1); });
            if (excludes.includes(key))
                return "continue";
            var val = obj[key];
            if (Array.isArray(val))
                result[key] = val.map(function (v) { return _this.removeExcluded(v, nested); });
            else if (val && typeof val === "object")
                result[key] = this_2.removeExcluded(val, nested);
            else
                result[key] = val;
        };
        var this_2 = this;
        for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
            var key = _a[_i];
            _loop_3(key);
        }
        return result;
    };
    QueryBuilder.prototype.applyExcludes = function (row) {
        if (!this._exclude.length)
            return row;
        var copy = __assign({}, row);
        for (var _i = 0, _a = this._exclude; _i < _a.length; _i++) {
            var f = _a[_i];
            if (!f.includes("."))
                delete copy[f];
        }
        return copy;
    };
    QueryBuilder.prototype._nestedExcludes = function (root) {
        return this._exclude
            .filter(function (f) { return typeof f === "string" && f.startsWith(root + "."); })
            .map(function (f) { return f.slice(root.length + 1); });
    };
    QueryBuilder._resultCache = new Map();
    return QueryBuilder;
}());
exports.QueryBuilder = QueryBuilder;
