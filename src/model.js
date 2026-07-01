"use strict";
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
exports.createModelFactory = createModelFactory;
var migrator_js_1 = require("./migrator.js");
var queryBuilder_js_1 = require("./queryBuilder.js");
var extensions_js_1 = require("./extensions.js");
// SERVERLESS / EDGE CHANGES:
//   1. Removed `import { pathToFileURL } from "node:url"` from the top level.
//      pathToFileURL is now dynamically imported only inside loadSchema(), which
//      is itself only called when no schema is passed in (Node dev mode).
//   2. loadSchema() now gracefully handles environments with no `node:fs` by
//      catching the import error and throwing a clear "pass schema explicitly"
//      message — so edge runtimes get a helpful error instead of a crash.
//   3. entity.refresh/update/delete now close over the PRIMARY KEY value
//      (not the original filter) so refresh() still works after updating
//      a non-PK field.  [BUG FIX #1]
function q(driver, col) {
    if (driver === "postgres")
        return "\"".concat(col, "\"");
    if (driver === "mysql")
        return "`".concat(col, "`");
    return col;
}
function placeholder(driver, index) {
    return driver === "postgres" ? "$".concat(index) : "?";
}
// ─── loadSchema ───────────────────────────────────────────────────────────────
// Only reached when no schema is passed in (local Node development).
// Gracefully fails in edge runtimes with a helpful error.
function loadSchema(adapterDir) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, fsMod, pathMod, pathToFileURL, fs, path, base, jsonPath, jsPath, tsPath, schema, schema, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, Promise.all([
                            Promise.resolve().then(function () { return require("node:fs"); }),
                            Promise.resolve().then(function () { return require("node:path"); }),
                            Promise.resolve().then(function () { return require("node:url"); }),
                        ])];
                case 1:
                    _a = _b.sent(), fsMod = _a[0], pathMod = _a[1], pathToFileURL = _a[2].pathToFileURL;
                    fs = fsMod;
                    path = pathMod;
                    base = path.join(process.cwd(), adapterDir, "schema");
                    jsonPath = path.join(base, "generated.json");
                    jsPath = path.join(base, "generated.js");
                    tsPath = path.join(base, "generated.ts");
                    if (fs.existsSync(jsonPath)) {
                        return [2 /*return*/, JSON.parse(fs.readFileSync(jsonPath, "utf8"))];
                    }
                    if (!fs.existsSync(jsPath)) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.resolve("".concat(/* webpackIgnore: true */ pathToFileURL(jsPath).href)).then(function (s) { return require(s); })];
                case 2:
                    schema = (_b.sent()).schema;
                    return [2 /*return*/, schema];
                case 3:
                    if (!fs.existsSync(tsPath)) return [3 /*break*/, 5];
                    return [4 /*yield*/, Promise.resolve("".concat(/* webpackIgnore: true */ pathToFileURL(tsPath).href)).then(function (s) { return require(s); })];
                case 4:
                    schema = (_b.sent()).schema;
                    return [2 /*return*/, schema];
                case 5: throw new Error("No schema file found in ".concat(base, " (tried .json, .js, .ts)"));
                case 6:
                    err_1 = _b.sent();
                    // node:fs unavailable → edge runtime
                    if ((err_1 === null || err_1 === void 0 ? void 0 : err_1.code) === "ERR_MODULE_NOT_FOUND" || /Cannot find module.*node:fs/.test(String(err_1))) {
                        throw new Error("SlintORM: cannot load schema from disk in this runtime.\n" +
                            "Generate the schema at build time (`npx slintorm generate`) and pass it " +
                            "as the `schema` option:\n\n" +
                            "  import schema from './src/schema/generated.json' assert { type: 'json' };\n" +
                            "  const orm = new ORMManager({ driver: 'postgres', databaseUrl, schema });\n");
                    }
                    throw err_1;
                case 7: return [2 /*return*/];
            }
        });
    });
}
var cachedSchema = null;
function createModelFactory(adapter, schema, emitGlobal) {
    return __awaiter(this, void 0, void 0, function () {
        function defineModel(table, modelName, hooks) {
            var _this = this;
            var _a;
            var tableName = table;
            var name = modelName ||
                Object.keys(schemas).find(function (k) { return schemas[k].table === tableName; }) ||
                tableName;
            var sqlDriver = adapter.driver === "sqlite" ||
                adapter.driver === "postgres" ||
                adapter.driver === "mysql"
                ? adapter.driver
                : undefined;
            var modelSchema = schemas[name] || { fields: {}, relations: [] };
            var versionField = (_a = Object.entries((modelSchema === null || modelSchema === void 0 ? void 0 : modelSchema.fields) || {}).find(function (_a) {
                var _b, _c;
                var f = _a[1];
                return ((_b = f.meta) === null || _b === void 0 ? void 0 : _b.version) || ((_c = f.meta) === null || _c === void 0 ? void 0 : _c["@version"]);
            })) === null || _a === void 0 ? void 0 : _a[0];
            function inferFieldType(value) {
                if (value === null || value === undefined)
                    return "string";
                if (typeof value === "number")
                    return "number";
                if (typeof value === "boolean")
                    return "boolean";
                if (value instanceof Date)
                    return "Date";
                if (Array.isArray(value))
                    return "any[]";
                if (typeof value === "object")
                    return "object";
                return typeof value;
            }
            function buildSchemaForItem(item) {
                if (!item || typeof item !== "object")
                    return modelSchema;
                var inferredFields = Object.entries(item).reduce(function (acc, _a) {
                    var key = _a[0], value = _a[1];
                    if (value === undefined)
                        return acc;
                    acc[key] = { type: inferFieldType(value), originalType: inferFieldType(value), optional: true, meta: {} };
                    return acc;
                }, {});
                if (!Object.keys(inferredFields).length)
                    return modelSchema;
                return __assign(__assign({}, modelSchema), { fields: __assign(__assign({}, (modelSchema.fields || {})), inferredFields) });
            }
            var driver = adapter.driver;
            var migrator = new migrator_js_1.Migrator(adapter.exec.bind(adapter), sqlDriver);
            function ensure(item) {
                return __awaiter(this, void 0, void 0, function () {
                    var schemaForTable;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                schemaForTable = buildSchemaForItem(item);
                                return [4 /*yield*/, migrator.ensureTable(tableName, (schemaForTable === null || schemaForTable === void 0 ? void 0 : schemaForTable.fields) || {}, schemaForTable === null || schemaForTable === void 0 ? void 0 : schemaForTable.relations)];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                });
            }
            function buildWhereClause(filter) {
                var keys = Object.keys(filter);
                if (!keys.length)
                    throw new Error("Filter must contain at least one field");
                if (driver === "mongodb")
                    return { mongoFilter: filter };
                var clause = keys
                    .map(function (k, i) { return driver === "postgres" ? "\"".concat(k, "\" = $").concat(i + 1) : "".concat(k, " = ?"); })
                    .join(" AND ");
                var params = keys.map(function (k) { return filter[k]; });
                return { clause: clause, params: params };
            }
            function serializeValue(col, value) {
                var _a, _b;
                if (value === undefined)
                    return null;
                if (value instanceof Date)
                    return value.toISOString();
                var fieldMeta = (_b = (_a = modelSchema.fields) === null || _a === void 0 ? void 0 : _a[col]) === null || _b === void 0 ? void 0 : _b.meta;
                if ((fieldMeta === null || fieldMeta === void 0 ? void 0 : fieldMeta.json) && value !== null && typeof value === "object") {
                    try {
                        return JSON.stringify(value);
                    }
                    catch (_c) {
                        return null;
                    }
                }
                return value;
            }
            function scalarAggregate(fn, column, filter) {
                return __awaiter(this, void 0, void 0, function () {
                    var res_1, rows, values, isPg, w, keys, whereClause, params, res;
                    var _a, _b, _c, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter !== null && filter !== void 0 ? filter : {} }))];
                            case 1:
                                res_1 = _e.sent();
                                rows = (_a = res_1.rows) !== null && _a !== void 0 ? _a : [];
                                values = rows.map(function (r) { var _a; return Number((_a = r[column]) !== null && _a !== void 0 ? _a : 0); });
                                if (fn === "SUM")
                                    return [2 /*return*/, values.reduce(function (a, b) { return a + b; }, 0)];
                                if (fn === "AVG")
                                    return [2 /*return*/, values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : 0];
                                if (fn === "MIN")
                                    return [2 /*return*/, values.length ? Math.min.apply(Math, values) : 0];
                                if (fn === "MAX")
                                    return [2 /*return*/, values.length ? Math.max.apply(Math, values) : 0];
                                return [2 /*return*/, 0];
                            case 2:
                                isPg = driver === "postgres";
                                w = function (c) { return driver === "mysql" ? "`".concat(c, "`") : "\"".concat(c, "\""); };
                                keys = filter ? Object.keys(filter) : [];
                                whereClause = keys.length
                                    ? "WHERE " + keys.map(function (k, i) { return "".concat(w(k), " = ").concat(isPg ? "$".concat(i + 1) : "?"); }).join(" AND ")
                                    : "";
                                params = keys.map(function (k) { return filter[k]; });
                                return [4 /*yield*/, adapter.exec("SELECT ".concat(fn, "(").concat(w(column), ") as __val FROM ").concat(w(tableName), " ").concat(whereClause), params)];
                            case 3:
                                res = _e.sent();
                                return [2 /*return*/, parseFloat((_d = (_c = (_b = res.rows) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.__val) !== null && _d !== void 0 ? _d : "0")];
                        }
                    });
                });
            }
            var emit = function (type, data, filter) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!emitGlobal) return [3 /*break*/, 2];
                            return [4 /*yield*/, emitGlobal({ type: type, model: name, table: tableName, data: data, filter: filter })];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            }); };
            return {
                insert: function (item) {
                    return __awaiter(this, void 0, void 0, function () {
                        var now, modified, insertedId, isJsonField_1, cols, values, wrap, placeholders, sql, result, row, inserted, lr, lastId, _a, _b;
                        var _c, _d, _e, _f, _g;
                        return __generator(this, function (_h) {
                            switch (_h.label) {
                                case 0: return [4 /*yield*/, ensure(item)];
                                case 1:
                                    _h.sent();
                                    return [4 /*yield*/, emit("beforeInsert", item)];
                                case 2:
                                    _h.sent();
                                    now = new Date().toISOString();
                                    if (item.createdAt === undefined)
                                        item.createdAt = now;
                                    if (item.updatedAt === undefined)
                                        item.updatedAt = now;
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onCreateBefore)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, hooks.onCreateBefore(item)];
                                case 3:
                                    modified = _h.sent();
                                    if (modified !== undefined)
                                        item = modified;
                                    _h.label = 4;
                                case 4:
                                    if (!(driver === "mongodb")) return [3 /*break*/, 6];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "insert", data: [item] }))];
                                case 5:
                                    _h.sent();
                                    return [3 /*break*/, 11];
                                case 6:
                                    isJsonField_1 = function (col) {
                                        var _a;
                                        var meta = (_a = modelSchema.fields[col]) === null || _a === void 0 ? void 0 : _a.meta;
                                        return !!((meta === null || meta === void 0 ? void 0 : meta.json) || (meta === null || meta === void 0 ? void 0 : meta["@json"]));
                                    };
                                    cols = Object.keys(item).filter(function (c) {
                                        var value = item[c];
                                        if (value === undefined)
                                            return false;
                                        if (value === null || value instanceof Date)
                                            return true;
                                        if (typeof value === "object")
                                            return isJsonField_1(c);
                                        return true;
                                    });
                                    values = cols.map(function (c) {
                                        var value = item[c];
                                        if (value === undefined)
                                            return null;
                                        if (value instanceof Date)
                                            return value.toISOString();
                                        if (isJsonField_1(c) && value !== null && typeof value === "object") {
                                            try {
                                                return JSON.stringify(value);
                                            }
                                            catch (_a) {
                                                return null;
                                            }
                                        }
                                        return value;
                                    });
                                    wrap = function (c) { return driver === "mysql" ? "`".concat(c, "`") : "\"".concat(c, "\""); };
                                    placeholders = driver === "postgres"
                                        ? cols.map(function (_, i) { return "$".concat(i + 1); }).join(", ")
                                        : cols.map(function () { return "?"; }).join(", ");
                                    sql = driver === "postgres"
                                        ? "INSERT INTO ".concat(wrap(tableName), " (").concat(cols.map(wrap).join(", "), ") VALUES (").concat(placeholders, ") RETURNING *")
                                        : "INSERT INTO ".concat(wrap(tableName), " (").concat(cols.map(wrap).join(", "), ") VALUES (").concat(placeholders, ")");
                                    return [4 /*yield*/, adapter.exec(sql, values)];
                                case 7:
                                    result = _h.sent();
                                    if (driver === "sqlite" && (result === null || result === void 0 ? void 0 : result.lastID))
                                        insertedId = result.lastID;
                                    if (driver === "mysql" && (result === null || result === void 0 ? void 0 : result.lastID))
                                        insertedId = result.lastID;
                                    if (driver === "postgres" && ((_d = (_c = result === null || result === void 0 ? void 0 : result.rows) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.id))
                                        insertedId = result.rows[0].id;
                                    if (!(driver === "postgres" && ((_e = result === null || result === void 0 ? void 0 : result.rows) === null || _e === void 0 ? void 0 : _e[0]))) return [3 /*break*/, 10];
                                    row = result.rows[0];
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onCreateAfter)) return [3 /*break*/, 9];
                                    return [4 /*yield*/, hooks.onCreateAfter(row)];
                                case 8:
                                    _h.sent();
                                    _h.label = 9;
                                case 9: return [2 /*return*/, row];
                                case 10:
                                    if (insertedId)
                                        item.id = insertedId;
                                    _h.label = 11;
                                case 11:
                                    inserted = null;
                                    if (!item.id) return [3 /*break*/, 13];
                                    return [4 /*yield*/, this.get({ id: item.id })];
                                case 12:
                                    inserted = _h.sent();
                                    _h.label = 13;
                                case 13:
                                    if (!(!inserted && driver === "sqlite")) return [3 /*break*/, 19];
                                    _h.label = 14;
                                case 14:
                                    _h.trys.push([14, 18, , 19]);
                                    return [4 /*yield*/, adapter.exec("SELECT last_insert_rowid() as id")];
                                case 15:
                                    lr = _h.sent();
                                    lastId = (_g = (_f = lr.rows) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.id;
                                    if (!lastId) return [3 /*break*/, 17];
                                    item.id = lastId;
                                    return [4 /*yield*/, this.get({ id: lastId })];
                                case 16:
                                    inserted = _h.sent();
                                    _h.label = 17;
                                case 17: return [3 /*break*/, 19];
                                case 18:
                                    _a = _h.sent();
                                    return [3 /*break*/, 19];
                                case 19:
                                    if (!(!inserted && item.email)) return [3 /*break*/, 23];
                                    _h.label = 20;
                                case 20:
                                    _h.trys.push([20, 22, , 23]);
                                    return [4 /*yield*/, this.get({ email: item.email })];
                                case 21:
                                    inserted = _h.sent();
                                    return [3 /*break*/, 23];
                                case 22:
                                    _b = _h.sent();
                                    return [3 /*break*/, 23];
                                case 23:
                                    if (!((hooks === null || hooks === void 0 ? void 0 : hooks.onCreateAfter) && inserted)) return [3 /*break*/, 25];
                                    return [4 /*yield*/, hooks.onCreateAfter(inserted)];
                                case 24:
                                    _h.sent();
                                    _h.label = 25;
                                case 25: return [4 /*yield*/, emit("afterInsert", inserted)];
                                case 26:
                                    _h.sent();
                                    return [2 /*return*/, inserted];
                            }
                        });
                    });
                },
                update: function (where, data) {
                    return __awaiter(this, void 0, void 0, function () {
                        var before, modified, isPg_1, setCols_1, whereCols, versionClause, currentVersion, setClause, whereClause, params, after;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (data.updatedAt === undefined)
                                        data.updatedAt = new Date().toISOString();
                                    if (!where || !Object.keys(where).length)
                                        throw new Error("Update 'where' condition required");
                                    if (!data || !Object.keys(data).length)
                                        throw new Error("Update data cannot be empty");
                                    return [4 /*yield*/, this.get(where)];
                                case 1:
                                    before = _b.sent();
                                    return [4 /*yield*/, emit("beforeUpdate", data, where)];
                                case 2:
                                    _b.sent();
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onUpdateBefore)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, hooks.onUpdateBefore(before, data)];
                                case 3:
                                    modified = _b.sent();
                                    if (modified !== undefined)
                                        data = modified;
                                    _b.label = 4;
                                case 4:
                                    if (!(driver === "mongodb")) return [3 /*break*/, 6];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter: where, data: data }))];
                                case 5:
                                    _b.sent();
                                    return [3 /*break*/, 8];
                                case 6:
                                    isPg_1 = driver === "postgres";
                                    setCols_1 = Object.keys(data);
                                    whereCols = Object.keys(where);
                                    versionClause = "";
                                    if (versionField) {
                                        currentVersion = (_a = before === null || before === void 0 ? void 0 : before[versionField]) !== null && _a !== void 0 ? _a : where[versionField];
                                        if (currentVersion !== undefined) {
                                            versionClause = isPg_1
                                                ? " AND \"".concat(versionField, "\" = $").concat(setCols_1.length + whereCols.length + 1)
                                                : " AND ".concat(versionField, " = ?");
                                            if (!setCols_1.includes(versionField)) {
                                                data[versionField] = Number(currentVersion) + 1;
                                            }
                                        }
                                    }
                                    setClause = setCols_1.map(function (c, i) { return isPg_1 ? "\"".concat(c, "\" = $").concat(i + 1) : "".concat(c, " = ?"); }).join(", ");
                                    whereClause = whereCols.map(function (c, i) { return isPg_1 ? "\"".concat(c, "\" = $").concat(setCols_1.length + i + 1) : "".concat(c, " = ?"); }).join(" AND ");
                                    params = __spreadArray(__spreadArray([], setCols_1.map(function (c) { return data[c]; }), true), whereCols.map(function (c) { return where[c]; }), true);
                                    if (versionClause) {
                                        params.push(before === null || before === void 0 ? void 0 : before[versionField]);
                                    }
                                    return [4 /*yield*/, adapter.exec("UPDATE ".concat(isPg_1 ? "\"".concat(tableName, "\"") : tableName, " SET ").concat(setClause, " WHERE ").concat(whereClause).concat(versionClause), params)];
                                case 7:
                                    _b.sent();
                                    _b.label = 8;
                                case 8: return [4 /*yield*/, this.get(where)];
                                case 9:
                                    after = _b.sent();
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onUpdateAfter)) return [3 /*break*/, 11];
                                    return [4 /*yield*/, hooks.onUpdateAfter(before, after || data)];
                                case 10:
                                    _b.sent();
                                    _b.label = 11;
                                case 11: return [4 /*yield*/, emit("afterUpdate", after, where)];
                                case 12:
                                    _b.sent();
                                    return [2 /*return*/, after];
                            }
                        });
                    });
                },
                delete: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        var needsRecord, toDelete, _a, _b, clause, params;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!Object.keys(filter).length)
                                        throw new Error("Delete filter cannot be empty");
                                    needsRecord = !!((hooks === null || hooks === void 0 ? void 0 : hooks.onDeleteBefore) || (hooks === null || hooks === void 0 ? void 0 : hooks.onDeleteAfter));
                                    if (!needsRecord) return [3 /*break*/, 2];
                                    return [4 /*yield*/, this.get(filter)];
                                case 1:
                                    _a = _c.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    _a = null;
                                    _c.label = 3;
                                case 3:
                                    toDelete = _a;
                                    return [4 /*yield*/, emit("beforeDelete", null, filter)];
                                case 4:
                                    _c.sent();
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onDeleteBefore)) return [3 /*break*/, 6];
                                    return [4 /*yield*/, hooks.onDeleteBefore(toDelete || filter)];
                                case 5:
                                    _c.sent();
                                    _c.label = 6;
                                case 6:
                                    if (!(driver === "mongodb")) return [3 /*break*/, 8];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "delete", filter: filter }))];
                                case 7:
                                    _c.sent();
                                    return [3 /*break*/, 10];
                                case 8:
                                    _b = buildWhereClause(filter), clause = _b.clause, params = _b.params;
                                    return [4 /*yield*/, adapter.exec("DELETE FROM ".concat(tableName, " WHERE ").concat(clause), params)];
                                case 9:
                                    _c.sent();
                                    _c.label = 10;
                                case 10:
                                    if (!(hooks === null || hooks === void 0 ? void 0 : hooks.onDeleteAfter)) return [3 /*break*/, 12];
                                    return [4 /*yield*/, hooks.onDeleteAfter(toDelete || filter)];
                                case 11:
                                    _c.sent();
                                    _c.label = 12;
                                case 12: return [4 /*yield*/, emit("afterDelete", toDelete, filter)];
                                case 13:
                                    _c.sent();
                                    return [2 /*return*/, toDelete || filter];
                            }
                        });
                    });
                },
                get: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        var record, res, _a, clause, params, res, self, pkField, pkValue, stableFilter;
                        var _b;
                        var _this = this;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!Object.keys(filter).length)
                                        throw new Error("Get filter cannot be empty");
                                    record = null;
                                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter }))];
                                case 1:
                                    res = _c.sent();
                                    record = res.rows[0] || null;
                                    return [3 /*break*/, 4];
                                case 2:
                                    _a = buildWhereClause(filter), clause = _a.clause, params = _a.params;
                                    return [4 /*yield*/, adapter.exec("SELECT * FROM ".concat(tableName, " WHERE ").concat(clause, " LIMIT 1"), params)];
                                case 3:
                                    res = _c.sent();
                                    record = res.rows[0] || null;
                                    _c.label = 4;
                                case 4:
                                    if (!record)
                                        return [2 /*return*/, null];
                                    record = (0, queryBuilder_js_1.mapBooleans)(record, modelSchema.fields);
                                    record = mapJson(record, modelSchema.fields);
                                    self = this;
                                    pkField = (modelSchema === null || modelSchema === void 0 ? void 0 : modelSchema.primaryKey) || "id";
                                    pkValue = record[pkField];
                                    stableFilter = pkValue !== undefined
                                        ? (_b = {}, _b[pkField] = pkValue, _b)
                                        : filter;
                                    Object.defineProperties(record, {
                                        update: {
                                            value: function (data) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                return [2 /*return*/, self.update(stableFilter, data)];
                                            }); }); },
                                            enumerable: false, writable: true,
                                        },
                                        delete: {
                                            value: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                return [2 /*return*/, self.delete(stableFilter)];
                                            }); }); },
                                            enumerable: false, writable: true,
                                        },
                                        refresh: {
                                            value: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                return [2 /*return*/, self.get(stableFilter)];
                                            }); }); },
                                            enumerable: false, writable: true,
                                        },
                                        toJSON: {
                                            value: function () { return (__assign({}, record)); },
                                            enumerable: false, writable: true,
                                        },
                                    });
                                    return [2 /*return*/, record];
                            }
                        });
                    });
                },
                getAll: function () {
                    return __awaiter(this, void 0, void 0, function () {
                        var res, _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "find" }))];
                                case 1:
                                    _a = _b.sent();
                                    return [3 /*break*/, 4];
                                case 2: return [4 /*yield*/, adapter.exec("SELECT * FROM ".concat(tableName))];
                                case 3:
                                    _a = _b.sent();
                                    _b.label = 4;
                                case 4:
                                    res = _a;
                                    return [2 /*return*/, res.rows.map(function (r) { return mapJson((0, queryBuilder_js_1.mapBooleans)(r, modelSchema.fields), modelSchema.fields); })];
                            }
                        });
                    });
                },
                query: function () {
                    return new extensions_js_1.ExtendedQueryBuilder(tableName, adapter.dir, adapter.exec.bind(adapter), name, schemas, { dialect: adapter.driver });
                },
                count: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        var res_2, isPg, keys, whereClause, res;
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter !== null && filter !== void 0 ? filter : {} }))];
                                case 1:
                                    res_2 = _d.sent();
                                    return [2 /*return*/, res_2.rows.length];
                                case 2:
                                    isPg = driver === "postgres";
                                    keys = filter ? Object.keys(filter) : [];
                                    whereClause = keys.length
                                        ? "WHERE " + keys.map(function (k, i) { return "\"".concat(k, "\" = ").concat(isPg ? "$".concat(i + 1) : "?"); }).join(" AND ")
                                        : "";
                                    return [4 /*yield*/, adapter.exec("SELECT COUNT(*) as count FROM \"".concat(tableName, "\" ").concat(whereClause), keys.map(function (k) { return filter[k]; }))];
                                case 3:
                                    res = _d.sent();
                                    return [2 /*return*/, parseInt((_c = (_b = (_a = res.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.count) !== null && _c !== void 0 ? _c : "0", 10)];
                            }
                        });
                    });
                },
                exists: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        var _a, clause, params, res;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _a = buildWhereClause(filter), clause = _a.clause, params = _a.params;
                                    return [4 /*yield*/, adapter.exec("SELECT 1 FROM ".concat(tableName, " WHERE ").concat(clause, " LIMIT 1"), params)];
                                case 1:
                                    res = _b.sent();
                                    return [2 /*return*/, !!res.rows.length];
                            }
                        });
                    });
                },
                truncate: function () {
                    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, adapter.exec("DELETE FROM ".concat(tableName))];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    }); });
                },
                sum: function (column, filter) {
                    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, scalarAggregate("SUM", column, filter)];
                    }); });
                },
                avg: function (column, filter) {
                    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, scalarAggregate("AVG", column, filter)];
                    }); });
                },
                min: function (column, filter) {
                    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, scalarAggregate("MIN", column, filter)];
                    }); });
                },
                max: function (column, filter) {
                    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, scalarAggregate("MAX", column, filter)];
                    }); });
                },
                insertMany: function (items) {
                    return __awaiter(this, void 0, void 0, function () {
                        var now, prepared, cols, w, _loop_1, _i, prepared_1, row, err_2, allValues, isPg, rowPlaceholders;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!items.length)
                                        return [2 /*return*/, 0];
                                    return [4 /*yield*/, ensure(items[0])];
                                case 1:
                                    _a.sent();
                                    now = new Date().toISOString();
                                    prepared = items.map(function (item) {
                                        var row = __assign({}, item);
                                        if (row.createdAt === undefined)
                                            row.createdAt = now;
                                        if (row.updatedAt === undefined)
                                            row.updatedAt = now;
                                        return row;
                                    });
                                    if (!(driver === "mongodb")) return [3 /*break*/, 3];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "insert", data: prepared }))];
                                case 2:
                                    _a.sent();
                                    return [2 /*return*/, prepared.length];
                                case 3:
                                    cols = Object.keys(prepared[0]).filter(function (c) { return prepared[0][c] !== undefined; });
                                    w = function (c) { return driver === "mysql" ? "`".concat(c, "`") : "\"".concat(c, "\""); };
                                    if (!(driver === "sqlite")) return [3 /*break*/, 14];
                                    return [4 /*yield*/, adapter.exec("BEGIN", [])];
                                case 4:
                                    _a.sent();
                                    _a.label = 5;
                                case 5:
                                    _a.trys.push([5, 11, , 13]);
                                    _loop_1 = function (row) {
                                        var values;
                                        return __generator(this, function (_b) {
                                            switch (_b.label) {
                                                case 0:
                                                    values = cols.map(function (c) { return serializeValue(c, row[c]); });
                                                    return [4 /*yield*/, adapter.exec("INSERT INTO ".concat(w(tableName), " (").concat(cols.map(w).join(", "), ") VALUES (").concat(cols.map(function () { return "?"; }).join(", "), ")"), values)];
                                                case 1:
                                                    _b.sent();
                                                    return [2 /*return*/];
                                            }
                                        });
                                    };
                                    _i = 0, prepared_1 = prepared;
                                    _a.label = 6;
                                case 6:
                                    if (!(_i < prepared_1.length)) return [3 /*break*/, 9];
                                    row = prepared_1[_i];
                                    return [5 /*yield**/, _loop_1(row)];
                                case 7:
                                    _a.sent();
                                    _a.label = 8;
                                case 8:
                                    _i++;
                                    return [3 /*break*/, 6];
                                case 9: return [4 /*yield*/, adapter.exec("COMMIT", [])];
                                case 10:
                                    _a.sent();
                                    return [3 /*break*/, 13];
                                case 11:
                                    err_2 = _a.sent();
                                    return [4 /*yield*/, adapter.exec("ROLLBACK", [])];
                                case 12:
                                    _a.sent();
                                    throw err_2;
                                case 13: return [2 /*return*/, prepared.length];
                                case 14:
                                    allValues = [];
                                    isPg = driver === "postgres";
                                    rowPlaceholders = prepared.map(function (row, rowIdx) {
                                        var phs = cols.map(function (c, colIdx) {
                                            allValues.push(serializeValue(c, row[c]));
                                            return isPg ? "$".concat(rowIdx * cols.length + colIdx + 1) : "?";
                                        });
                                        return "(".concat(phs.join(", "), ")");
                                    });
                                    return [4 /*yield*/, adapter.exec("INSERT INTO ".concat(w(tableName), " (").concat(cols.map(w).join(", "), ") VALUES ").concat(rowPlaceholders.join(", ")), allValues)];
                                case 15:
                                    _a.sent();
                                    return [2 /*return*/, prepared.length];
                            }
                        });
                    });
                },
                updateMany: function (filter, data) {
                    return __awaiter(this, void 0, void 0, function () {
                        var now, res_3, isPg, w, setCols, whereCols, setClause, whereClause, res;
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!Object.keys(filter).length)
                                        throw new Error("updateMany filter cannot be empty");
                                    if (!Object.keys(data).length)
                                        throw new Error("updateMany data cannot be empty");
                                    now = new Date().toISOString();
                                    if (data.updatedAt === undefined)
                                        data.updatedAt = now;
                                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter: filter, data: data }))];
                                case 1:
                                    res_3 = _c.sent();
                                    return [2 /*return*/, (_a = res_3.changes) !== null && _a !== void 0 ? _a : 0];
                                case 2:
                                    isPg = driver === "postgres";
                                    w = function (c) { return driver === "mysql" ? "`".concat(c, "`") : "\"".concat(c, "\""); };
                                    setCols = Object.keys(data);
                                    whereCols = Object.keys(filter);
                                    setClause = setCols.map(function (c, i) { return "".concat(w(c), " = ").concat(isPg ? "$".concat(i + 1) : "?"); }).join(", ");
                                    whereClause = whereCols.map(function (c, i) { return "".concat(w(c), " = ").concat(isPg ? "$".concat(setCols.length + i + 1) : "?"); }).join(" AND ");
                                    return [4 /*yield*/, adapter.exec("UPDATE ".concat(w(tableName), " SET ").concat(setClause, " WHERE ").concat(whereClause), __spreadArray(__spreadArray([], setCols.map(function (c) { return serializeValue(c, data[c]); }), true), whereCols.map(function (c) { return filter[c]; }), true))];
                                case 3:
                                    res = _c.sent();
                                    return [2 /*return*/, (_b = res.changes) !== null && _b !== void 0 ? _b : 0];
                            }
                        });
                    });
                },
                deleteMany: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        var res_4, isPg, w, whereCols, whereClause, res;
                        var _a, _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!Object.keys(filter).length)
                                        throw new Error("deleteMany filter cannot be empty");
                                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "delete", filter: filter }))];
                                case 1:
                                    res_4 = _c.sent();
                                    return [2 /*return*/, (_a = res_4.changes) !== null && _a !== void 0 ? _a : 0];
                                case 2:
                                    isPg = driver === "postgres";
                                    w = function (c) { return driver === "mysql" ? "`".concat(c, "`") : "\"".concat(c, "\""); };
                                    whereCols = Object.keys(filter);
                                    whereClause = whereCols.map(function (c, i) { return "".concat(w(c), " = ").concat(isPg ? "$".concat(i + 1) : "?"); }).join(" AND ");
                                    return [4 /*yield*/, adapter.exec("DELETE FROM ".concat(w(tableName), " WHERE ").concat(whereClause), whereCols.map(function (c) { return filter[c]; }))];
                                case 3:
                                    res = _c.sent();
                                    return [2 /*return*/, (_b = res.changes) !== null && _b !== void 0 ? _b : 0];
                            }
                        });
                    });
                },
                upsert: function (filter, data) {
                    return __awaiter(this, void 0, void 0, function () {
                        var self, check, cols, filterCols_1, row_1, now, values, conflictCols, updateSet, cols, row_2, now, values, updateSet, existing;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    self = this;
                                    if (!(driver === "mongodb")) return [3 /*break*/, 5];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "find", filter: filter }))];
                                case 1:
                                    check = _b.sent();
                                    if (!((_a = check.rows) === null || _a === void 0 ? void 0 : _a.length)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, adapter.exec(JSON.stringify({ collection: tableName, action: "update", filter: filter, data: data }))];
                                case 2:
                                    _b.sent();
                                    return [2 /*return*/, "updated"];
                                case 3: return [4 /*yield*/, self.insertMany([data])];
                                case 4:
                                    _b.sent();
                                    return [2 /*return*/, "inserted"];
                                case 5:
                                    if (!(driver === "postgres")) return [3 /*break*/, 7];
                                    cols = Object.keys(data);
                                    filterCols_1 = Object.keys(filter);
                                    row_1 = __assign({}, data);
                                    now = new Date().toISOString();
                                    if (row_1.createdAt === undefined)
                                        row_1.createdAt = now;
                                    if (row_1.updatedAt === undefined)
                                        row_1.updatedAt = now;
                                    values = cols.map(function (c) { return serializeValue(c, row_1[c]); });
                                    conflictCols = filterCols_1.map(function (c) { return "\"".concat(c, "\""); }).join(", ");
                                    updateSet = cols.filter(function (c) { return !filterCols_1.includes(c); }).map(function (c) { return "\"".concat(c, "\" = EXCLUDED.\"").concat(c, "\""); }).join(", ");
                                    return [4 /*yield*/, adapter.exec("INSERT INTO \"".concat(tableName, "\" (").concat(cols.map(function (c) { return "\"".concat(c, "\""); }).join(", "), ") VALUES (").concat(cols.map(function (_, i) { return "$".concat(i + 1); }).join(", "), ")\n             ON CONFLICT (").concat(conflictCols, ") DO UPDATE SET ").concat(updateSet), values)];
                                case 6:
                                    _b.sent();
                                    return [2 /*return*/, "inserted"];
                                case 7:
                                    if (!(driver === "mysql")) return [3 /*break*/, 9];
                                    cols = Object.keys(data);
                                    row_2 = __assign({}, data);
                                    now = new Date().toISOString();
                                    if (row_2.createdAt === undefined)
                                        row_2.createdAt = now;
                                    if (row_2.updatedAt === undefined)
                                        row_2.updatedAt = now;
                                    values = cols.map(function (c) { return serializeValue(c, row_2[c]); });
                                    updateSet = cols.map(function (c) { return "`".concat(c, "` = VALUES(`").concat(c, "`)"); }).join(", ");
                                    return [4 /*yield*/, adapter.exec("INSERT INTO `".concat(tableName, "` (").concat(cols.map(function (c) { return "`".concat(c, "`"); }).join(", "), ") VALUES (").concat(cols.map(function () { return "?"; }).join(", "), ")\n             ON DUPLICATE KEY UPDATE ").concat(updateSet), values)];
                                case 8:
                                    _b.sent();
                                    return [2 /*return*/, "inserted"];
                                case 9: return [4 /*yield*/, this.get(filter)];
                                case 10:
                                    existing = _b.sent();
                                    if (!existing) return [3 /*break*/, 12];
                                    return [4 /*yield*/, this.updateMany(filter, data)];
                                case 11:
                                    _b.sent();
                                    return [2 /*return*/, "updated"];
                                case 12: return [4 /*yield*/, this.insertMany([data])];
                                case 13:
                                    _b.sent();
                                    return [2 /*return*/, "inserted"];
                            }
                        });
                    });
                },
                findOrCreate: function (filter, defaults) {
                    return __awaiter(this, void 0, void 0, function () {
                        var existing, created;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.get(filter)];
                                case 1:
                                    existing = _a.sent();
                                    if (existing)
                                        return [2 /*return*/, { record: existing, created: false }];
                                    return [4 /*yield*/, this.insertMany([defaults])];
                                case 2:
                                    _a.sent();
                                    return [4 /*yield*/, this.get(filter)];
                                case 3:
                                    created = _a.sent();
                                    return [2 /*return*/, { record: created, created: true }];
                            }
                        });
                    });
                },
                restore: function (filter) {
                    return __awaiter(this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.updateMany(filter, { deletedAt: null })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    });
                },
                // ── Polymorphic associations ──────────────────────────────────
                morphTo: function (typeField, idField) {
                    var _this = this;
                    return (function () { return __awaiter(_this, void 0, void 0, function () {
                        var row, morphType, morphId, targetSchema, schemaEntry, res;
                        var _a, _b, _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0: return [4 /*yield*/, this.query().first()];
                                case 1:
                                    row = _d.sent();
                                    if (!row)
                                        return [2 /*return*/, null];
                                    morphType = row[typeField];
                                    morphId = row[idField];
                                    if (!morphType || !morphId)
                                        return [2 /*return*/, null];
                                    targetSchema = Object.values(schemas).find(function (s) { return s.table === morphType.toLowerCase() || s.table === morphType; });
                                    if (!targetSchema) {
                                        schemaEntry = schemas[morphType];
                                        if (!schemaEntry)
                                            return [2 /*return*/, null];
                                        return [2 /*return*/, (_b = (_a = schemaEntry._modelAPI) === null || _a === void 0 ? void 0 : _a.get({ id: morphId })) !== null && _b !== void 0 ? _b : null];
                                    }
                                    return [4 /*yield*/, adapter.exec("SELECT * FROM \"".concat(morphType, "\" WHERE \"id\" = ?"), [morphId])];
                                case 2:
                                    res = _d.sent();
                                    if (!((_c = res.rows) === null || _c === void 0 ? void 0 : _c.length))
                                        return [2 /*return*/, null];
                                    return [2 /*return*/, res.rows[0]];
                            }
                        });
                    }); })();
                },
                morphMany: function (typeField, idField, morphType) {
                    var _this = this;
                    return (function () { return __awaiter(_this, void 0, void 0, function () {
                        var idVal, res;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    idVal = idField;
                                    return [4 /*yield*/, adapter.exec("SELECT * FROM \"".concat(morphType, "\" WHERE \"").concat(String(typeField), "\" = ?"), [idVal])];
                                case 1:
                                    res = _a.sent();
                                    return [2 /*return*/, res.rows || []];
                            }
                        });
                    }); })();
                },
                validate: function (data, rules) { new extensions_js_1.Validator(rules).validate(data); },
                check: function (data, rules) { return new extensions_js_1.Validator(rules).check(data); },
                withOne: function (_relation) {
                    return __awaiter(this, void 0, void 0, function () {
                        var row;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, this.query().preload(_relation).first()];
                                case 1:
                                    row = _b.sent();
                                    if (!row)
                                        return [2 /*return*/, null];
                                    return [2 /*return*/, (_a = row[_relation]) !== null && _a !== void 0 ? _a : null];
                            }
                        });
                    });
                },
                withMany: function (_relation) {
                    return __awaiter(this, void 0, void 0, function () {
                        var row;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.query().preload(_relation).first()];
                                case 1:
                                    row = _a.sent();
                                    if (!row)
                                        return [2 /*return*/, []];
                                    return [2 /*return*/, row[_relation] || []];
                            }
                        });
                    });
                },
                preload: function (_relation) {
                    return __awaiter(this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this.query().preload(_relation).get()];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    });
                },
            };
        }
        var schemas, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!((_b = schema !== null && schema !== void 0 ? schema : adapter.schema) !== null && _b !== void 0)) return [3 /*break*/, 1];
                    _a = _b;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, loadSchema(adapter.dir)];
                case 2:
                    _a = (_c.sent());
                    _c.label = 3;
                case 3:
                    schemas = _a;
                    return [2 /*return*/, defineModel];
            }
        });
    });
}
function mapJson(row, schemaFields) {
    var _a;
    var out = __assign({}, row);
    for (var _i = 0, _b = Object.keys(schemaFields); _i < _b.length; _i++) {
        var key = _b[_i];
        var fieldMeta = (_a = schemaFields[key]) === null || _a === void 0 ? void 0 : _a.meta;
        if ((fieldMeta === null || fieldMeta === void 0 ? void 0 : fieldMeta.json) && typeof out[key] === "string") {
            try {
                out[key] = JSON.parse(out[key]);
            }
            catch (_c) { }
        }
    }
    return out;
}
