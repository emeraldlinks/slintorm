#!/usr/bin/env node
"use strict";
/**
 * slintorm CLI
 *
 * Usage:
 *   npx slintorm migrate       — apply pending migrations
 *   npx slintorm rollback      — roll back the last batch
 *   npx slintorm generate      — re-generate schema/generated.ts + .json
 *   npx slintorm status        — show applied / pending migrations
 *   npx slintorm fresh         — drop all tables, re-run all migrations
 *   npx slintorm --help        — show help
 *
 * Drivers: sqlite | postgres | mysql | mongodb
 * MongoDB is schemaless — "migrations" only create/track indexes
 * (from @index / @unique field meta), there is no column DDL.
 */
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
var node_path_1 = require("node:path");
var node_fs_1 = require("node:fs");
var node_crypto_1 = require("node:crypto");
var node_url_1 = require("node:url");
// ─── Colours ────────────────────────────────────────────────────────────────
var c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
};
// ─── Logging helpers ──────────────────────────────────────────────────────────
function ts() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return "".concat(pad(d.getHours()), ":").concat(pad(d.getMinutes()), ":").concat(pad(d.getSeconds()));
}
var ok = function (s) { return console.log("".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.green, "\u2714").concat(c.reset, "  ").concat(s)); };
var info = function (s) { return console.log("".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.cyan, "\u2139").concat(c.reset, "  ").concat(s)); };
var warn = function (s) { return console.log("".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.yellow, "\u26A0").concat(c.reset, "  ").concat(s)); };
var fail = function (s) { return console.error("".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.red, "\u2718").concat(c.reset, "  ").concat(s)); };
var head = function (s) { return console.log("\n".concat(c.bold).concat(c.white).concat(s).concat(c.reset)); };
var dim = function (s) { return console.log("".concat(c.gray).concat(s).concat(c.reset)); };
var log = function (s) { return console.log("".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.dim, "\u2026").concat(c.reset, "  ").concat(s)); };
// ─── Progress bar ─────────────────────────────────────────────────────────────
function progressBar(current, total, label) {
    var width = 28;
    var pct = total === 0 ? 1 : current / total;
    var filled = Math.round(width * pct);
    var bar = "█".repeat(filled) + "░".repeat(width - filled);
    var pctLabel = "".concat(Math.round(pct * 100), "%").padStart(4);
    process.stdout.write("\r".concat(c.gray, "[").concat(ts(), "]").concat(c.reset, " ").concat(c.cyan).concat(bar).concat(c.reset, " ").concat(pctLabel, "  ").concat(label).concat(" ".repeat(20)));
}
function progressBarDone() {
    process.stdout.write("\n");
}
// ─── Migrations table SQL ────────────────────────────────────────────────────
// Mongo doesn't use SQL DDL — its migrations collection is created inside
// the mongo exec function itself (see buildExec), so it has no entry here.
var MIGRATIONS_TABLE = "_slint_migrations";
var CREATE_MIGRATIONS_TABLE = {
    sqlite: "CREATE TABLE IF NOT EXISTS \"".concat(MIGRATIONS_TABLE, "\" (\n               id        INTEGER PRIMARY KEY AUTOINCREMENT,\n               name      TEXT    NOT NULL UNIQUE,\n               batch     INTEGER NOT NULL,\n               run_at    TEXT    NOT NULL DEFAULT (datetime('now'))\n             )"),
    postgres: "CREATE TABLE IF NOT EXISTS \"".concat(MIGRATIONS_TABLE, "\" (\n               id        SERIAL  PRIMARY KEY,\n               name      TEXT    NOT NULL UNIQUE,\n               batch     INTEGER NOT NULL,\n               run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()\n             )"),
    mysql: "CREATE TABLE IF NOT EXISTS `".concat(MIGRATIONS_TABLE, "` (\n               id        INT AUTO_INCREMENT PRIMARY KEY,\n               name      VARCHAR(255) NOT NULL UNIQUE,\n               batch     INT NOT NULL,\n               run_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n             )"),
};
function loadConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var cwd, primaryCandidates, legacyCandidates, _i, primaryCandidates_1, cfgPath, mod, cfg, e_1, _a, legacyCandidates_1, cfgPath, mod, cfg, e_2, pkgPath, pkg;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    cwd = process.cwd();
                    primaryCandidates = [
                        node_path_1.default.join(cwd, "slintorm.config.js"),
                        node_path_1.default.join(cwd, "slintorm.config.mjs"),
                        node_path_1.default.join(cwd, "slintorm.config.cjs"),
                        node_path_1.default.join(cwd, "slintorm.config.ts"),
                        node_path_1.default.join(cwd, "slintorm.config.json"),
                    ];
                    legacyCandidates = [
                        node_path_1.default.join(cwd, "orm.config.js"),
                        node_path_1.default.join(cwd, "orm.config.mjs"),
                        node_path_1.default.join(cwd, "orm.config.cjs"),
                        node_path_1.default.join(cwd, "orm.config.ts"),
                        node_path_1.default.join(cwd, "orm.config.json"),
                    ];
                    _i = 0, primaryCandidates_1 = primaryCandidates;
                    _d.label = 1;
                case 1:
                    if (!(_i < primaryCandidates_1.length)) return [3 /*break*/, 6];
                    cfgPath = primaryCandidates_1[_i];
                    if (!node_fs_1.default.existsSync(cfgPath))
                        return [3 /*break*/, 5];
                    info("Loading config: ".concat(node_path_1.default.basename(cfgPath)));
                    if (cfgPath.endsWith(".json")) {
                        return [2 /*return*/, JSON.parse(node_fs_1.default.readFileSync(cfgPath, "utf8"))];
                    }
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(cfgPath).href)).then(function (s) { return require(s); })];
                case 3:
                    mod = _d.sent();
                    cfg = (_b = mod.default) !== null && _b !== void 0 ? _b : mod;
                    if (cfg && typeof cfg === "object")
                        return [2 /*return*/, cfg];
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _d.sent();
                    fail("Failed to load config from ".concat(cfgPath, ": ").concat(e_1.message));
                    process.exit(1);
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    _a = 0, legacyCandidates_1 = legacyCandidates;
                    _d.label = 7;
                case 7:
                    if (!(_a < legacyCandidates_1.length)) return [3 /*break*/, 12];
                    cfgPath = legacyCandidates_1[_a];
                    if (!node_fs_1.default.existsSync(cfgPath))
                        return [3 /*break*/, 11];
                    warn("Found ".concat(node_path_1.default.basename(cfgPath), " \u2014 this name is deprecated. ") +
                        "Please rename it to slintorm.config.".concat(cfgPath.split(".").pop(), "."));
                    if (cfgPath.endsWith(".json")) {
                        return [2 /*return*/, JSON.parse(node_fs_1.default.readFileSync(cfgPath, "utf8"))];
                    }
                    _d.label = 8;
                case 8:
                    _d.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(cfgPath).href)).then(function (s) { return require(s); })];
                case 9:
                    mod = _d.sent();
                    cfg = (_c = mod.default) !== null && _c !== void 0 ? _c : mod;
                    if (cfg && typeof cfg === "object")
                        return [2 /*return*/, cfg];
                    return [3 /*break*/, 11];
                case 10:
                    e_2 = _d.sent();
                    fail("Failed to load config from ".concat(cfgPath, ": ").concat(e_2.message));
                    process.exit(1);
                    return [3 /*break*/, 11];
                case 11:
                    _a++;
                    return [3 /*break*/, 7];
                case 12:
                    pkgPath = node_path_1.default.join(cwd, "package.json");
                    if (node_fs_1.default.existsSync(pkgPath)) {
                        try {
                            pkg = JSON.parse(node_fs_1.default.readFileSync(pkgPath, "utf8"));
                            if (pkg.slintorm) {
                                info("Loading config from package.json \"slintorm\" key");
                                return [2 /*return*/, pkg.slintorm];
                            }
                        }
                        catch (_e) {
                            // ignore malformed package.json — fall through to the failure path below
                        }
                    }
                    fail("No config file found. Create a slintorm.config.js in your project root.");
                    console.log("\nExample slintorm.config.js:\n");
                    console.log("  export default {");
                    console.log("    driver: \"sqlite\",");
                    console.log("    databaseUrl: \"./myapp.db\",");
                    console.log("    dir: \"src\",");
                    console.log("  };\n");
                    process.exit(1);
                    return [2 /*return*/];
            }
        });
    });
}
function stableValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.keys(value)
            .sort()
            .reduce(function (acc, key) {
            acc[key] = stableValue(value[key]);
            return acc;
        }, {});
    }
    return value;
}
function hashSchemaModel(modelDef) {
    var _a, _b, _c;
    var normalized = stableValue({
        table: (_a = modelDef === null || modelDef === void 0 ? void 0 : modelDef.table) !== null && _a !== void 0 ? _a : null,
        fields: (_b = modelDef === null || modelDef === void 0 ? void 0 : modelDef.fields) !== null && _b !== void 0 ? _b : {},
        relations: (_c = modelDef === null || modelDef === void 0 ? void 0 : modelDef.relations) !== null && _c !== void 0 ? _c : [],
    });
    return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(normalized)).digest("hex");
}
function migrationUnitName(modelName, schemaHash) {
    return "".concat(modelName, "__").concat(schemaHash.slice(0, 12));
}
function migrationModelName(unitName) {
    var sep = unitName.lastIndexOf("__");
    return sep === -1 ? unitName : unitName.slice(0, sep);
}
function extractDbNameFromMongoUrl(url) {
    var dbName = "test";
    try {
        var swapped = url.replace(/^mongodb(\+srv)?:\/\//, "http://");
        var parsed = new URL(swapped);
        var fromPath = parsed.pathname.replace(/^\//, "");
        if (fromPath)
            dbName = fromPath;
    }
    catch (_a) {
        // malformed url — fall back to the default db name
    }
    return dbName;
}
function buildExec(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var driver, url, Database, db_1, _a, sqlite3, open_1, db_2, pg, pool_1, mysql, conn_1, MongoClient, client, dbName, db_3;
        var _this = this;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    driver = (_b = cfg.driver) !== null && _b !== void 0 ? _b : "sqlite";
                    url = (_c = cfg.databaseUrl) !== null && _c !== void 0 ? _c : "./database.db";
                    info("Connecting to ".concat(driver, " database (").concat(url, ")\u2026"));
                    if (!(driver === "sqlite")) return [3 /*break*/, 7];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 7]);
                    return [4 /*yield*/, Promise.resolve("".concat("better-sqlite3")).then(function (s) { return require(s); })];
                case 2:
                    Database = (_d.sent()).default;
                    db_1 = new Database(url);
                    db_1.pragma("journal_mode = WAL");
                    db_1.pragma("foreign_keys = ON");
                    ok("Connected (better-sqlite3)");
                    return [2 /*return*/, function (sql_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([sql_1], args_1, true), void 0, function (sql, params) {
                                var rows, r;
                                var _a, _b;
                                if (params === void 0) { params = []; }
                                return __generator(this, function (_c) {
                                    if (/^\s*(select|pragma)/i.test(sql)) {
                                        rows = (_a = db_1.prepare(sql)).all.apply(_a, params);
                                        return [2 /*return*/, { rows: rows }];
                                    }
                                    r = (_b = db_1.prepare(sql)).run.apply(_b, params);
                                    return [2 /*return*/, { rows: [], changes: r.changes, lastID: r.lastInsertRowid }];
                                });
                            });
                        }];
                case 3:
                    _a = _d.sent();
                    return [4 /*yield*/, Promise.resolve("".concat("sqlite3")).then(function (s) { return require(s); })];
                case 4:
                    sqlite3 = (_d.sent()).default;
                    return [4 /*yield*/, Promise.resolve("".concat("sqlite")).then(function (s) { return require(s); })];
                case 5:
                    open_1 = (_d.sent()).open;
                    return [4 /*yield*/, open_1({ filename: url, driver: sqlite3.Database })];
                case 6:
                    db_2 = _d.sent();
                    ok("Connected (sqlite3)");
                    return [2 /*return*/, function (sql_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([sql_1], args_1, true), void 0, function (sql, params) {
                                var rows, r;
                                if (params === void 0) { params = []; }
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!/^\s*(select|pragma)/i.test(sql)) return [3 /*break*/, 2];
                                            return [4 /*yield*/, db_2.all(sql, params)];
                                        case 1:
                                            rows = _a.sent();
                                            return [2 /*return*/, { rows: rows }];
                                        case 2: return [4 /*yield*/, db_2.run(sql, params)];
                                        case 3:
                                            r = _a.sent();
                                            return [2 /*return*/, { rows: [], changes: r.changes, lastID: r.lastID }];
                                    }
                                });
                            });
                        }];
                case 7:
                    if (!(driver === "postgres")) return [3 /*break*/, 9];
                    return [4 /*yield*/, Promise.resolve("".concat("pg")).then(function (s) { return require(s); })];
                case 8:
                    pg = (_d.sent()).default;
                    pool_1 = new pg.Pool({ connectionString: url });
                    ok("Connected (postgres)");
                    return [2 /*return*/, function (sql_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([sql_1], args_1, true), void 0, function (sql, params) {
                                var r;
                                var _a;
                                if (params === void 0) { params = []; }
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, pool_1.query(sql, params)];
                                        case 1:
                                            r = _b.sent();
                                            return [2 /*return*/, { rows: r.rows, changes: (_a = r.rowCount) !== null && _a !== void 0 ? _a : 0 }];
                                    }
                                });
                            });
                        }];
                case 9:
                    if (!(driver === "mysql")) return [3 /*break*/, 12];
                    return [4 /*yield*/, Promise.resolve("".concat("mysql2/promise")).then(function (s) { return require(s); })];
                case 10:
                    mysql = _d.sent();
                    return [4 /*yield*/, mysql.createConnection(url)];
                case 11:
                    conn_1 = _d.sent();
                    ok("Connected (mysql)");
                    return [2 /*return*/, function (sql_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([sql_1], args_1, true), void 0, function (sql, params) {
                                var rows;
                                var _a;
                                if (params === void 0) { params = []; }
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, conn_1.execute(sql, params)];
                                        case 1:
                                            rows = (_b.sent())[0];
                                            return [2 /*return*/, {
                                                    rows: Array.isArray(rows) ? rows : [],
                                                    changes: (_a = rows.affectedRows) !== null && _a !== void 0 ? _a : 0,
                                                    insertId: rows.insertId,
                                                }];
                                    }
                                });
                            });
                        }];
                case 12:
                    if (!(driver === "mongodb")) return [3 /*break*/, 15];
                    return [4 /*yield*/, Promise.resolve("".concat("mongodb")).then(function (s) { return require(s); })];
                case 13:
                    MongoClient = (_d.sent()).MongoClient;
                    return [4 /*yield*/, MongoClient.connect(url)];
                case 14:
                    client = _d.sent();
                    dbName = extractDbNameFromMongoUrl(url);
                    db_3 = client.db(dbName);
                    ok("Connected (mongodb, db: ".concat(dbName, ")"));
                    return [2 /*return*/, function (sql_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([sql_1], args_1, true), void 0, function (sql, params) {
                                var trimmed, action, coll, _a, rows, docs, r, r, r, _b, coll, m, coll, rows, coll, top_1, coll, coll, rows, coll, r, coll, r, m, _c;
                                var _d;
                                var _e, _f, _g, _h, _j;
                                if (params === void 0) { params = []; }
                                return __generator(this, function (_k) {
                                    switch (_k.label) {
                                        case 0:
                                            trimmed = sql.trim();
                                            if (!trimmed.startsWith("{")) return [3 /*break*/, 14];
                                            action = void 0;
                                            try {
                                                action = JSON.parse(trimmed);
                                            }
                                            catch (_l) {
                                                return [2 /*return*/, { rows: [] }];
                                            }
                                            coll = db_3.collection(action.collection);
                                            _a = action.action;
                                            switch (_a) {
                                                case "find": return [3 /*break*/, 1];
                                                case "insert": return [3 /*break*/, 3];
                                                case "update": return [3 /*break*/, 5];
                                                case "delete": return [3 /*break*/, 7];
                                                case "createIndex": return [3 /*break*/, 9];
                                            }
                                            return [3 /*break*/, 13];
                                        case 1: return [4 /*yield*/, coll.find((_e = action.filter) !== null && _e !== void 0 ? _e : {}).toArray()];
                                        case 2:
                                            rows = _k.sent();
                                            return [2 /*return*/, { rows: rows }];
                                        case 3:
                                            docs = Array.isArray(action.data) ? action.data : [action.data];
                                            return [4 /*yield*/, coll.insertMany(docs)];
                                        case 4:
                                            r = _k.sent();
                                            return [2 /*return*/, { rows: [], changes: r.insertedCount }];
                                        case 5: return [4 /*yield*/, coll.updateMany((_f = action.filter) !== null && _f !== void 0 ? _f : {}, { $set: action.data })];
                                        case 6:
                                            r = _k.sent();
                                            return [2 /*return*/, { rows: [], changes: r.modifiedCount }];
                                        case 7: return [4 /*yield*/, coll.deleteMany((_g = action.filter) !== null && _g !== void 0 ? _g : {})];
                                        case 8:
                                            r = _k.sent();
                                            return [2 /*return*/, { rows: [], changes: r.deletedCount }];
                                        case 9:
                                            _k.trys.push([9, 11, , 12]);
                                            return [4 /*yield*/, coll.createIndex((_d = {}, _d[action.field] = 1, _d), { unique: !!action.unique })];
                                        case 10:
                                            _k.sent();
                                            return [3 /*break*/, 12];
                                        case 11:
                                            _b = _k.sent();
                                            return [3 /*break*/, 12];
                                        case 12: return [2 /*return*/, { rows: [] }];
                                        case 13: return [2 /*return*/, { rows: [] }];
                                        case 14:
                                            if (!/^\s*CREATE TABLE/i.test(trimmed)) return [3 /*break*/, 16];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.createIndex({ name: 1 }, { unique: true })];
                                        case 15:
                                            _k.sent();
                                            return [2 /*return*/, { rows: [] }];
                                        case 16:
                                            if (!/^\s*SELECT \* FROM/i.test(trimmed)) return [3 /*break*/, 18];
                                            m = trimmed.match(/FROM\s+"?([\w_]+)"?/i);
                                            coll = db_3.collection(m ? m[1] : MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.find({}).sort({ _id: 1 }).toArray()];
                                        case 17:
                                            rows = _k.sent();
                                            return [2 /*return*/, { rows: rows }];
                                        case 18:
                                            if (!/^\s*SELECT MAX\(batch\)/i.test(trimmed)) return [3 /*break*/, 20];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.find({}).sort({ batch: -1 }).limit(1).toArray()];
                                        case 19:
                                            top_1 = _k.sent();
                                            return [2 /*return*/, { rows: [{ b: (_j = (_h = top_1[0]) === null || _h === void 0 ? void 0 : _h.batch) !== null && _j !== void 0 ? _j : 0 }] }];
                                        case 20:
                                            if (!/^\s*INSERT INTO\s+"?_slint_migrations"?/i.test(trimmed)) return [3 /*break*/, 22];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.insertOne({ name: params[0], batch: params[1], run_at: new Date().toISOString() })];
                                        case 21:
                                            _k.sent();
                                            return [2 /*return*/, { rows: [] }];
                                        case 22:
                                            if (!/^\s*SELECT name FROM\s+"?_slint_migrations"?\s+WHERE batch/i.test(trimmed)) return [3 /*break*/, 24];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.find({ batch: params[0] }).sort({ _id: -1 }).toArray()];
                                        case 23:
                                            rows = _k.sent();
                                            return [2 /*return*/, { rows: rows }];
                                        case 24:
                                            if (!/^\s*DELETE FROM\s+"?_slint_migrations"?\s+WHERE name/i.test(trimmed)) return [3 /*break*/, 26];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.deleteOne({ name: params[0] })];
                                        case 25:
                                            r = _k.sent();
                                            return [2 /*return*/, { rows: [], changes: r.deletedCount }];
                                        case 26:
                                            if (!/^\s*DELETE FROM\s+"?_slint_migrations"?\s*$/i.test(trimmed)) return [3 /*break*/, 28];
                                            coll = db_3.collection(MIGRATIONS_TABLE);
                                            return [4 /*yield*/, coll.deleteMany({})];
                                        case 27:
                                            r = _k.sent();
                                            return [2 /*return*/, { rows: [], changes: r.deletedCount }];
                                        case 28:
                                            if (!/^\s*DROP TABLE IF EXISTS/i.test(trimmed)) return [3 /*break*/, 33];
                                            m = trimmed.match(/EXISTS\s+"?([\w_]+)"?/i);
                                            if (!m) return [3 /*break*/, 32];
                                            _k.label = 29;
                                        case 29:
                                            _k.trys.push([29, 31, , 32]);
                                            return [4 /*yield*/, db_3.collection(m[1]).drop()];
                                        case 30:
                                            _k.sent();
                                            return [3 /*break*/, 32];
                                        case 31:
                                            _c = _k.sent();
                                            return [3 /*break*/, 32];
                                        case 32: return [2 /*return*/, { rows: [] }];
                                        case 33: return [2 /*return*/, { rows: [] }];
                                    }
                                });
                            });
                        }];
                case 15:
                    fail("Unsupported driver: ".concat(driver));
                    process.exit(1);
                    return [2 /*return*/];
            }
        });
    });
}
// ─── Migrations table helpers ────────────────────────────────────────────────
function ensureMigrationsTable(exec, driver) {
    return __awaiter(this, void 0, void 0, function () {
        var sql;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                    // Routed by the mongo exec's "CREATE TABLE" branch above, which
                    // creates a unique index on `name` in the migrations collection.
                    return [4 /*yield*/, exec("CREATE TABLE \"".concat(MIGRATIONS_TABLE, "\""))];
                case 1:
                    // Routed by the mongo exec's "CREATE TABLE" branch above, which
                    // creates a unique index on `name` in the migrations collection.
                    _b.sent();
                    return [2 /*return*/];
                case 2:
                    sql = (_a = CREATE_MIGRATIONS_TABLE[driver]) !== null && _a !== void 0 ? _a : CREATE_MIGRATIONS_TABLE.sqlite;
                    return [4 /*yield*/, exec(sql)];
                case 3:
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getApplied(exec) {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, exec("SELECT * FROM \"".concat(MIGRATIONS_TABLE, "\" ORDER BY id ASC"))];
                case 1:
                    r = _a.sent();
                    return [2 /*return*/, r.rows];
            }
        });
    });
}
function getLastBatch(exec) {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, exec("SELECT MAX(batch) as b FROM \"".concat(MIGRATIONS_TABLE, "\""))];
                case 1:
                    r = _c.sent();
                    return [2 /*return*/, parseInt((_b = (_a = r.rows[0]) === null || _a === void 0 ? void 0 : _a.b) !== null && _b !== void 0 ? _b : "0", 10)];
            }
        });
    });
}
// ─── Migration record files (schema/migrations/*.json) ──────────────────────
function migrationsDir(dir) {
    var p = node_path_1.default.join(process.cwd(), dir, "schema", "migrations");
    if (!node_fs_1.default.existsSync(p))
        node_fs_1.default.mkdirSync(p, { recursive: true });
    return p;
}
function writeMigrationRecord(dir, unit, batch, modelDef) {
    var _a;
    var recPath = node_path_1.default.join(migrationsDir(dir), "".concat(unit.name, ".json"));
    var record = {
        name: unit.name,
        modelName: unit.modelName,
        tableName: unit.tableName,
        schemaHash: unit.schemaHash,
        batch: batch,
        appliedAt: new Date().toISOString(),
        fields: Object.keys((_a = modelDef === null || modelDef === void 0 ? void 0 : modelDef.fields) !== null && _a !== void 0 ? _a : {}),
    };
    node_fs_1.default.writeFileSync(recPath, JSON.stringify(record, null, 2), "utf8");
}
function readMigrationRecord(dir, name) {
    var recPath = node_path_1.default.join(migrationsDir(dir), "".concat(name, ".json"));
    if (!node_fs_1.default.existsSync(recPath))
        return null;
    try {
        return JSON.parse(node_fs_1.default.readFileSync(recPath, "utf8"));
    }
    catch (_a) {
        return null;
    }
}
function loadMigrationRecords(dir) {
    var dirPath = migrationsDir(dir);
    return node_fs_1.default.readdirSync(dirPath)
        .filter(function (file) { return file.endsWith(".json"); })
        .map(function (file) {
        try {
            return JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(dirPath, file), "utf8"));
        }
        catch (_a) {
            return null;
        }
    })
        .filter(Boolean);
}
function fieldNames(modelDef) {
    var _a;
    return Object.keys((_a = modelDef === null || modelDef === void 0 ? void 0 : modelDef.fields) !== null && _a !== void 0 ? _a : {}).sort();
}
function recordMatchesUnit(record, unit, modelFields) {
    if (!record || record.modelName !== unit.modelName)
        return false;
    if (record.name === unit.name)
        return true;
    if (record.schemaHash && record.schemaHash === unit.schemaHash)
        return true;
    var recordFields = Array.isArray(record.fields) ? __spreadArray([], record.fields, true).sort() : [];
    if (!recordFields.length)
        return false;
    return recordFields.join("|") === modelFields.join("|");
}
function removeMigrationRecord(dir, name) {
    var recPath = node_path_1.default.join(migrationsDir(dir), "".concat(name, ".json"));
    if (node_fs_1.default.existsSync(recPath))
        node_fs_1.default.unlinkSync(recPath);
}
// ─── Pivot table synthesis (shared logic — mirrors Migrator.migrateSchema) ──
// Auto-creates pivot/junction tables for many-to-many relations when a
// `through` name is provided but no explicit model exists for it.
// Mutates and returns the same schema object so callers can use it in place.
// Keeps `npx slintorm migrate` and `orm.migrate()` producing the identical
// table/collection set, including m2m junctions like team_members.
function withSyntheticPivots(schema) {
    var _a;
    var _b, _c;
    for (var _i = 0, _d = Object.entries(schema); _i < _d.length; _i++) {
        var _e = _d[_i], name_1 = _e[0], model = _e[1];
        for (var _f = 0, _g = model.relations || []; _f < _g.length; _f++) {
            var r = _g[_f];
            if (r.kind !== "manytomany" || !r.through)
                continue;
            var pivot = String(r.through);
            if (schema[pivot])
                continue;
            var leftFk = r.foreignKey || ((_b = r.meta) === null || _b === void 0 ? void 0 : _b.foreignKey) || "".concat(name_1.toLowerCase(), "Id");
            var rightFk = r.relatedKey || ((_c = r.meta) === null || _c === void 0 ? void 0 : _c.relatedKey) || "".concat(String(r.targetModel).toLowerCase(), "Id");
            schema[pivot] = {
                fields: (_a = {
                        id: { type: "number", meta: { primaryKey: true, auto: true } }
                    },
                    _a[leftFk] = { type: "number", meta: { index: true } },
                    _a[rightFk] = { type: "number", meta: { index: true } },
                    _a),
                relations: [],
                table: pivot,
            };
        }
    }
    return schema;
}
function loadGeneratedSchema(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var base, jsonPath, jsPath, tsPath, _i, _a, p, mod, _b;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    base = node_path_1.default.join(process.cwd(), dir, "schema");
                    jsonPath = node_path_1.default.join(base, "generated.json");
                    jsPath = node_path_1.default.join(base, "generated.js");
                    tsPath = node_path_1.default.join(base, "generated.ts");
                    if (node_fs_1.default.existsSync(jsonPath)) {
                        return [2 /*return*/, JSON.parse(node_fs_1.default.readFileSync(jsonPath, "utf8"))];
                    }
                    _i = 0, _a = [jsPath, tsPath];
                    _e.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    p = _a[_i];
                    if (!node_fs_1.default.existsSync(p))
                        return [3 /*break*/, 5];
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(p).href)).then(function (s) { return require(s); })];
                case 3:
                    mod = _e.sent();
                    return [2 /*return*/, (_d = (_c = mod.schema) !== null && _c !== void 0 ? _c : mod.default) !== null && _d !== void 0 ? _d : null];
                case 4:
                    _b = _e.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, null];
            }
        });
    });
}
function resolveSchemaGenerator() {
    return __awaiter(this, void 0, void 0, function () {
        var mod, _a, mod;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 4]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "node_modules", "slintorm", "dist", "generator.js")).href)).then(function (s) { return require(s); })];
                case 1:
                    mod = _b.sent();
                    return [2 /*return*/, mod.default];
                case 2:
                    _a = _b.sent();
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "src", "generator.js")).href)).then(function (s) { return require(s); })];
                case 3:
                    mod = _b.sent();
                    return [2 /*return*/, mod.default];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function loadLiveSchema(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var srcDir, generateSchema, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    srcDir = node_path_1.default.join(process.cwd(), dir);
                    if (!node_fs_1.default.existsSync(srcDir))
                        return [2 /*return*/, null];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 6]);
                    return [4 /*yield*/, resolveSchemaGenerator()];
                case 2:
                    generateSchema = _b.sent();
                    return [4 /*yield*/, generateSchema(srcDir)];
                case 3: return [2 /*return*/, _b.sent()];
                case 4:
                    _a = _b.sent();
                    return [4 /*yield*/, loadGeneratedSchema(dir)];
                case 5: return [2 /*return*/, _b.sent()];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function schemaToPlan(schema) {
    // Synthesize pivot tables first so m2m junctions get their own
    // migration unit, just like orm.migrate() / Migrator.migrateSchema().
    var fullSchema = withSyntheticPivots(schema);
    return Object.entries(fullSchema).map(function (_a) {
        var _b;
        var modelName = _a[0], def = _a[1];
        var schemaHash = hashSchemaModel(def);
        return {
            name: migrationUnitName(modelName, schemaHash),
            modelName: modelName,
            tableName: (_b = def.table) !== null && _b !== void 0 ? _b : modelName.toLowerCase(),
            schemaHash: schemaHash,
        };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}
// ─── Commands ────────────────────────────────────────────────────────────────
// generate ──────────────────────────────────────────────────────────────────
function cmdGenerate(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var srcDir, generateSchema, mod, _a, mod, e_3, schema, count;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    head("Generating schema…");
                    srcDir = node_path_1.default.join(process.cwd(), (_b = cfg.dir) !== null && _b !== void 0 ? _b : "src");
                    if (!node_fs_1.default.existsSync(srcDir)) {
                        fail("Source directory not found: ".concat(srcDir));
                        process.exit(1);
                    }
                    log("Scanning ".concat(srcDir, "\u2026"));
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 8]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "node_modules", "slintorm", "dist", "generator.js")).href)).then(function (s) { return require(s); })];
                case 2:
                    mod = _d.sent();
                    generateSchema = mod.default;
                    return [3 /*break*/, 8];
                case 3:
                    _a = _d.sent();
                    _d.label = 4;
                case 4:
                    _d.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "src", "generator.js")).href)).then(function (s) { return require(s); })];
                case 5:
                    mod = _d.sent();
                    generateSchema = mod.default;
                    return [3 /*break*/, 7];
                case 6:
                    e_3 = _d.sent();
                    fail("Could not load schema generator: ".concat(e_3.message));
                    process.exit(1);
                    return [3 /*break*/, 7];
                case 7: return [3 /*break*/, 8];
                case 8:
                    if (!generateSchema) {
                        fail("Schema generator failed to load.");
                        process.exit(1);
                        return [2 /*return*/]; // unreachable, but keeps TS's control-flow analysis happy
                    }
                    return [4 /*yield*/, generateSchema(srcDir)];
                case 9:
                    schema = _d.sent();
                    count = Object.keys(schema).length;
                    ok("Schema generated \u2014 ".concat(count, " model").concat(count === 1 ? "" : "s", " written to ").concat((_c = cfg.dir) !== null && _c !== void 0 ? _c : "src", "/schema/"));
                    return [2 /*return*/];
            }
        });
    });
}
// status ────────────────────────────────────────────────────────────────────
function cmdStatus(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, driver, schema, plan, rows, records, dbApplied, applied, pending, done, _loop_1, _i, plan_1, u;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    head("Migration status");
                    return [4 /*yield*/, buildExec(cfg)];
                case 1:
                    exec = _d.sent();
                    driver = (_a = cfg.driver) !== null && _a !== void 0 ? _a : "sqlite";
                    return [4 /*yield*/, ensureMigrationsTable(exec, driver)];
                case 2:
                    _d.sent();
                    return [4 /*yield*/, loadLiveSchema((_b = cfg.dir) !== null && _b !== void 0 ? _b : "src")];
                case 3:
                    schema = _d.sent();
                    if (!schema) {
                        warn("No generated schema found. Run `npx slintorm generate` first.");
                        return [2 /*return*/];
                    }
                    if (driver === "mongodb") {
                        dim("  (mongodb is schemaless — \"migrations\" track index creation only)");
                    }
                    plan = schemaToPlan(schema);
                    return [4 /*yield*/, getApplied(exec)];
                case 4:
                    rows = _d.sent();
                    records = loadMigrationRecords((_c = cfg.dir) !== null && _c !== void 0 ? _c : "src");
                    dbApplied = new Set(rows.map(function (r) { return r.name; }));
                    applied = new Set(plan
                        .filter(function (unit) {
                        var modelDef = schema[unit.modelName];
                        var currentFields = fieldNames(modelDef);
                        return dbApplied.has(unit.name) || records.some(function (record) { return recordMatchesUnit(record, unit, currentFields); });
                    })
                        .map(function (unit) { return unit.name; }));
                    pending = plan.filter(function (u) { return !applied.has(u.name); });
                    done = plan.filter(function (u) { return applied.has(u.name); });
                    console.log("\n  ".concat("Name".padEnd(42), " ").concat("Status".padEnd(10), " Batch"));
                    console.log("  ".concat("─".repeat(62)));
                    _loop_1 = function (u) {
                        var row = rows.find(function (r) { return r.name === u.name; });
                        var status_1 = row ? "".concat(c.green, "applied").concat(c.reset) : "".concat(c.yellow, "pending").concat(c.reset);
                        var batch = row ? String(row.batch) : "—";
                        console.log("  ".concat(u.name.padEnd(42), " ").concat(status_1.padEnd(10 + (row ? c.green.length + c.reset.length : c.yellow.length + c.reset.length)), " ").concat(batch));
                    };
                    for (_i = 0, plan_1 = plan; _i < plan_1.length; _i++) {
                        u = plan_1[_i];
                        _loop_1(u);
                    }
                    console.log("\n  ".concat(c.green).concat(done.length, " applied").concat(c.reset, "  \u00B7  ").concat(c.yellow).concat(pending.length, " pending").concat(c.reset, "\n"));
                    return [2 /*return*/];
            }
        });
    });
}
// migrate ───────────────────────────────────────────────────────────────────
function cmdMigrate(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, driver, schema, plan, rows, records, dbApplied, applied, pending, MigratorCtor, mod, _a, mod, e_4, migrator, batch, count, failed, startedAt, idx, unit, modelDef, isPg, e_5, elapsed;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    head("Running migrations…");
                    return [4 /*yield*/, buildExec(cfg)];
                case 1:
                    exec = _h.sent();
                    driver = (_b = cfg.driver) !== null && _b !== void 0 ? _b : "sqlite";
                    return [4 /*yield*/, ensureMigrationsTable(exec, driver)];
                case 2:
                    _h.sent();
                    log("Migrations table ready");
                    return [4 /*yield*/, loadLiveSchema((_c = cfg.dir) !== null && _c !== void 0 ? _c : "src")];
                case 3:
                    schema = _h.sent();
                    if (!!schema) return [3 /*break*/, 5];
                    warn("No generated schema found. Running `generate` first…\n");
                    return [4 /*yield*/, cmdGenerate(cfg)];
                case 4:
                    _h.sent();
                    return [2 /*return*/, cmdMigrate(cfg)]; // retry after generate
                case 5:
                    // Augment with synthetic pivot tables BEFORE building the plan, so
                    // many-to-many junction tables (e.g. team_members) get migrated too —
                    // matching what orm.migrate() / Migrator.migrateSchema() already does.
                    schema = withSyntheticPivots(schema);
                    if (driver === "mongodb") {
                        info("MongoDB driver — DDL skipped, only indexes (@index / @unique) will be created.");
                    }
                    plan = schemaToPlan(schema);
                    return [4 /*yield*/, getApplied(exec)];
                case 6:
                    rows = _h.sent();
                    records = loadMigrationRecords((_d = cfg.dir) !== null && _d !== void 0 ? _d : "src");
                    dbApplied = new Set(rows.map(function (r) { return r.name; }));
                    applied = new Set(plan
                        .filter(function (unit) {
                        var modelDef = schema[unit.modelName];
                        var currentFields = fieldNames(modelDef);
                        return dbApplied.has(unit.name) || records.some(function (record) { return recordMatchesUnit(record, unit, currentFields); });
                    })
                        .map(function (unit) { return unit.name; }));
                    pending = plan.filter(function (u) { return !applied.has(u.name); });
                    if (!pending.length) {
                        ok("Nothing to migrate — all migrations are up to date.");
                        return [2 /*return*/];
                    }
                    info("".concat(pending.length, " migration").concat(pending.length === 1 ? "" : "s", " pending"));
                    _h.label = 7;
                case 7:
                    _h.trys.push([7, 9, , 14]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "node_modules", "slintorm", "dist", "migrator.js")).href)).then(function (s) { return require(s); })];
                case 8:
                    mod = _h.sent();
                    MigratorCtor = mod.Migrator;
                    return [3 /*break*/, 14];
                case 9:
                    _a = _h.sent();
                    _h.label = 10;
                case 10:
                    _h.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, Promise.resolve("".concat((0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "src", "migrator.js")).href)).then(function (s) { return require(s); })];
                case 11:
                    mod = _h.sent();
                    MigratorCtor = mod.Migrator;
                    return [3 /*break*/, 13];
                case 12:
                    e_4 = _h.sent();
                    fail("Could not load Migrator: ".concat(e_4.message));
                    process.exit(1);
                    return [3 /*break*/, 13];
                case 13: return [3 /*break*/, 14];
                case 14:
                    migrator = new MigratorCtor(exec, driver);
                    return [4 /*yield*/, getLastBatch(exec)];
                case 15:
                    batch = (_h.sent()) + 1;
                    count = 0;
                    failed = [];
                    startedAt = Date.now();
                    idx = 0;
                    _h.label = 16;
                case 16:
                    if (!(idx < pending.length)) return [3 /*break*/, 25];
                    unit = pending[idx];
                    modelDef = schema[unit.modelName];
                    progressBar(idx, pending.length, "Migrating ".concat(unit.name));
                    _h.label = 17;
                case 17:
                    _h.trys.push([17, 23, , 24]);
                    return [4 /*yield*/, migrator.ensureTable(unit.tableName, modelDef.fields, (_e = modelDef.relations) !== null && _e !== void 0 ? _e : [])];
                case 18:
                    _h.sent();
                    if (!(driver === "mongodb")) return [3 /*break*/, 20];
                    return [4 /*yield*/, exec("INSERT INTO \"".concat(MIGRATIONS_TABLE, "\" (name, batch) VALUES (?,?)"), [unit.name, batch])];
                case 19:
                    _h.sent();
                    return [3 /*break*/, 22];
                case 20:
                    isPg = driver === "postgres";
                    return [4 /*yield*/, exec("INSERT INTO \"".concat(MIGRATIONS_TABLE, "\" (name, batch) VALUES (").concat(isPg ? "$1,$2" : "?,?", ")"), [unit.name, batch])];
                case 21:
                    _h.sent();
                    _h.label = 22;
                case 22:
                    writeMigrationRecord((_f = cfg.dir) !== null && _f !== void 0 ? _f : "src", unit, batch, modelDef);
                    count++;
                    return [3 /*break*/, 24];
                case 23:
                    e_5 = _h.sent();
                    progressBarDone();
                    fail("".concat(unit.name, " \u2014 ").concat(e_5.message));
                    failed.push(unit.name);
                    process.exit(1);
                    return [3 /*break*/, 24];
                case 24:
                    idx++;
                    return [3 /*break*/, 16];
                case 25:
                    progressBar(pending.length, pending.length, "Done");
                    progressBarDone();
                    elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
                    ok("".concat(count, " migration").concat(count === 1 ? "" : "s", " applied (batch ").concat(batch, ") in ").concat(elapsed, "s."));
                    info("Migration records written to ".concat((_g = cfg.dir) !== null && _g !== void 0 ? _g : "src", "/schema/migrations/"));
                    return [2 /*return*/];
            }
        });
    });
}
// rollback ──────────────────────────────────────────────────────────────────
function cmdRollback(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, driver, lastBatch, isPg, res, toRollback, schema, rolledBack, idx, name_2, record, modelName, tableName, e_6;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    head("Rolling back last batch…");
                    return [4 /*yield*/, buildExec(cfg)];
                case 1:
                    exec = _j.sent();
                    driver = (_a = cfg.driver) !== null && _a !== void 0 ? _a : "sqlite";
                    return [4 /*yield*/, ensureMigrationsTable(exec, driver)];
                case 2:
                    _j.sent();
                    return [4 /*yield*/, getLastBatch(exec)];
                case 3:
                    lastBatch = _j.sent();
                    if (!lastBatch) {
                        warn("Nothing to roll back — migrations table is empty.");
                        return [2 /*return*/];
                    }
                    isPg = driver === "postgres";
                    return [4 /*yield*/, exec("SELECT name FROM \"".concat(MIGRATIONS_TABLE, "\" WHERE batch = ").concat(isPg ? "$1" : "?", " ORDER BY id DESC"), [lastBatch])];
                case 4:
                    res = _j.sent();
                    toRollback = res.rows.map(function (r) { return r.name; });
                    if (!toRollback.length) {
                        warn("Nothing to roll back.");
                        return [2 /*return*/];
                    }
                    info("Rolling back batch ".concat(lastBatch, " \u2014 ").concat(toRollback.length, " migration").concat(toRollback.length === 1 ? "" : "s"));
                    return [4 /*yield*/, loadLiveSchema((_b = cfg.dir) !== null && _b !== void 0 ? _b : "src")];
                case 5:
                    schema = _j.sent();
                    if (!schema) {
                        warn("No generated schema found — table names will be guessed from migration names.");
                    }
                    else {
                        // Ensure pivot tables resolve correctly too, same as migrate/status.
                        schema = withSyntheticPivots(schema);
                    }
                    rolledBack = 0;
                    idx = 0;
                    _j.label = 6;
                case 6:
                    if (!(idx < toRollback.length)) return [3 /*break*/, 12];
                    name_2 = toRollback[idx];
                    progressBar(idx, toRollback.length, "Rolling back ".concat(name_2));
                    record = readMigrationRecord((_c = cfg.dir) !== null && _c !== void 0 ? _c : "src", name_2);
                    modelName = (_d = record === null || record === void 0 ? void 0 : record.modelName) !== null && _d !== void 0 ? _d : migrationModelName(name_2);
                    tableName = (_g = (_e = record === null || record === void 0 ? void 0 : record.tableName) !== null && _e !== void 0 ? _e : (_f = schema === null || schema === void 0 ? void 0 : schema[modelName]) === null || _f === void 0 ? void 0 : _f.table) !== null && _g !== void 0 ? _g : modelName.toLowerCase();
                    _j.label = 7;
                case 7:
                    _j.trys.push([7, 10, , 11]);
                    return [4 /*yield*/, exec("DROP TABLE IF EXISTS \"".concat(tableName, "\""))];
                case 8:
                    _j.sent();
                    return [4 /*yield*/, exec("DELETE FROM \"".concat(MIGRATIONS_TABLE, "\" WHERE name = ").concat(isPg ? "$1" : "?"), [name_2])];
                case 9:
                    _j.sent();
                    removeMigrationRecord((_h = cfg.dir) !== null && _h !== void 0 ? _h : "src", name_2);
                    rolledBack++;
                    return [3 /*break*/, 11];
                case 10:
                    e_6 = _j.sent();
                    progressBarDone();
                    fail("".concat(name_2, " \u2014 ").concat(e_6.message));
                    return [3 /*break*/, 11];
                case 11:
                    idx++;
                    return [3 /*break*/, 6];
                case 12:
                    progressBar(toRollback.length, toRollback.length, "Done");
                    progressBarDone();
                    ok("Batch ".concat(lastBatch, " rolled back (").concat(rolledBack, " migration").concat(rolledBack === 1 ? "" : "s", ")."));
                    warn(driver === "mongodb"
                        ? "Collections were dropped. Re-run `npx slintorm migrate` to recreate indexes."
                        : "Tables were dropped. Re-run `npx slintorm migrate` to recreate them.");
                    return [2 /*return*/];
            }
        });
    });
}
// fresh ─────────────────────────────────────────────────────────────────────
function cmdFresh(cfg) {
    return __awaiter(this, void 0, void 0, function () {
        var exec, driver, schema, plan, idx, unit, _a;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    head("Fresh migration (drop all → re-migrate)…");
                    return [4 /*yield*/, buildExec(cfg)];
                case 1:
                    exec = _e.sent();
                    driver = (_b = cfg.driver) !== null && _b !== void 0 ? _b : "sqlite";
                    return [4 /*yield*/, ensureMigrationsTable(exec, driver)];
                case 2:
                    _e.sent();
                    return [4 /*yield*/, loadLiveSchema((_c = cfg.dir) !== null && _c !== void 0 ? _c : "src")];
                case 3:
                    schema = _e.sent();
                    if (!schema) {
                        fail("No generated schema found. Run `npx slintorm generate` first.");
                        process.exit(1);
                        return [2 /*return*/]; // unreachable, but keeps TS's control-flow analysis happy
                    }
                    schema = withSyntheticPivots(schema);
                    plan = schemaToPlan(schema).reverse();
                    info("Dropping ".concat(plan.length, " table").concat(plan.length === 1 ? "" : "s", "\u2026"));
                    idx = 0;
                    _e.label = 4;
                case 4:
                    if (!(idx < plan.length)) return [3 /*break*/, 9];
                    unit = plan[idx];
                    progressBar(idx, plan.length, "Dropping ".concat(unit.tableName));
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, exec("DROP TABLE IF EXISTS \"".concat(unit.tableName, "\""))];
                case 6:
                    _e.sent();
                    removeMigrationRecord((_d = cfg.dir) !== null && _d !== void 0 ? _d : "src", unit.name);
                    return [3 /*break*/, 8];
                case 7:
                    _a = _e.sent();
                    return [3 /*break*/, 8];
                case 8:
                    idx++;
                    return [3 /*break*/, 4];
                case 9:
                    progressBar(plan.length, plan.length, "Done");
                    progressBarDone();
                    // Wipe migrations log
                    return [4 /*yield*/, exec("DELETE FROM \"".concat(MIGRATIONS_TABLE, "\""))];
                case 10:
                    // Wipe migrations log
                    _e.sent();
                    ok("All tables dropped.\n");
                    return [4 /*yield*/, cmdMigrate(cfg)];
                case 11:
                    _e.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// help ───────────────────────────────────────────────────────────────────────
function cmdHelp() {
    console.log("\n".concat(c.bold, "SlintORM CLI").concat(c.reset, "  ").concat(c.gray, "\u2014 database migration tool").concat(c.reset, "\n\n").concat(c.bold, "Usage:").concat(c.reset, "\n  npx slintorm <command> [options]\n\n").concat(c.bold, "Commands:").concat(c.reset, "\n  ").concat(c.cyan, "generate").concat(c.reset, "    Scan source files and (re)generate schema/generated.ts\n  ").concat(c.cyan, "migrate").concat(c.reset, "     Apply all pending migrations\n  ").concat(c.cyan, "rollback").concat(c.reset, "    Undo the last migration batch (drops the tables)\n  ").concat(c.cyan, "status").concat(c.reset, "      Show applied / pending migrations\n  ").concat(c.cyan, "fresh").concat(c.reset, "       Drop all tables then re-run all migrations\n\n").concat(c.bold, "Config:").concat(c.reset, "\n  Create ").concat(c.white, "slintorm.config.js").concat(c.reset, " in your project root:\n\n  ").concat(c.gray, "// slintorm.config.js").concat(c.reset, "\n  ").concat(c.yellow, "export default ").concat(c.reset, "{\n    driver:      ").concat(c.green, "\"sqlite\"").concat(c.reset, ",          ").concat(c.gray, "// sqlite | postgres | mysql | mongodb").concat(c.reset, "\n    databaseUrl: ").concat(c.green, "\"./myapp.db\"").concat(c.reset, ",\n    dir:         ").concat(c.green, "\"src\"").concat(c.reset, ",             ").concat(c.gray, "// folder with your TypeScript interfaces").concat(c.reset, "\n    logs:        ").concat(c.yellow, "false").concat(c.reset, ",\n  };\n\n  ").concat(c.gray, "For mongodb, databaseUrl should include the database name, e.g.").concat(c.reset, "\n  ").concat(c.gray, "\"mongodb://localhost:27017/myapp\". Mongo is schemaless \u2014 migrate/").concat(c.reset, "\n  ").concat(c.gray, "fresh/rollback only create or drop indexes and collections, not columns.").concat(c.reset, "\n\n  ").concat(c.gray, "Or add a \"slintorm\" key to package.json.").concat(c.reset, "\n  ").concat(c.gray, "(orm.config.js is still read for backwards compatibility, but is deprecated.)").concat(c.reset, "\n\n").concat(c.bold, "Migration records:").concat(c.reset, "\n  Each applied migration writes a JSON record to ").concat(c.white, "<dir>/schema/migrations/").concat(c.reset, "\n  in addition to the internal _slint_migrations tracking collection/table.\n"));
}
// ─── Entry point ─────────────────────────────────────────────────────────────
var _a = process.argv, _b = _a[2], command = _b === void 0 ? "--help" : _b, args = _a.slice(3);
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (command === "--help" || command === "-h" || command === "help") {
                        cmdHelp();
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, loadConfig()];
                case 1:
                    cfg = _b.sent();
                    _a = command;
                    switch (_a) {
                        case "generate": return [3 /*break*/, 2];
                        case "migrate": return [3 /*break*/, 4];
                        case "rollback": return [3 /*break*/, 6];
                        case "status": return [3 /*break*/, 8];
                        case "fresh": return [3 /*break*/, 10];
                    }
                    return [3 /*break*/, 12];
                case 2: return [4 /*yield*/, cmdGenerate(cfg)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 4: return [4 /*yield*/, cmdMigrate(cfg)];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 6: return [4 /*yield*/, cmdRollback(cfg)];
                case 7:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 8: return [4 /*yield*/, cmdStatus(cfg)];
                case 9:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 10: return [4 /*yield*/, cmdFresh(cfg)];
                case 11:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 12:
                    fail("Unknown command: ".concat(c.bold).concat(command).concat(c.reset));
                    console.log("Run ".concat(c.cyan, "npx slintorm --help").concat(c.reset, " to see available commands.\n"));
                    process.exit(1);
                    _b.label = 13;
                case 13: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    var _a;
    fail((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err));
    process.exit(1);
});
