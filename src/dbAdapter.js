"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBAdapter = void 0;
// ─── DBAdapter ────────────────────────────────────────────────────────────────
// SERVERLESS / EDGE CHANGES:
//  1. Removed `spawnSync` / auto-install entirely — no child_process in edge.
//  2. connect() is now lazy-async; no Node-specific globals at module load time.
//  3. All driver imports are dynamic (import()) so bundlers can tree-shake them.
//  4. `autoInstallDrivers` option removed — was the root cause of crashes in
//     restricted runtimes (Vercel Edge, CF Workers, Deno, Bun).
//  5. Prepared-statement cache kept for sqlite only (it's still valid in Node).
// ─────────────────────────────────────────────────────────────────────────────
var DBAdapter = /** @class */ (function () {
    function DBAdapter(config) {
        if (config === void 0) { config = {}; }
        var _a;
        this.sqliteDb = null;
        this.mysqlConn = null;
        this.pgClient = null;
        this.mongoClient = null;
        this.mongoDb = null;
        this.connected = false;
        this.stmtCache = new Map();
        this.stmtCacheMax = 200;
        // Read replicas
        this.replicaPools = {};
        this.replicaIndex = 0;
        this.config = {};
        this.logs = false;
        this.config = config;
        this.driver = (_a = config.driver) !== null && _a !== void 0 ? _a : "sqlite";
        this.dir = config.dir;
        this.schema = config.schema;
        this.logs = !!config.logs;
        // NOTE: autoInstallDrivers intentionally removed. Install your driver
        // (pg, mysql2, mongodb) as a normal dependency. sqlite3/sqlite are
        // optional — only needed when driver="sqlite".
    }
    DBAdapter.prototype.defaultExport = function (mod) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                return [2 /*return*/, (_a = mod === null || mod === void 0 ? void 0 : mod.default) !== null && _a !== void 0 ? _a : mod];
            });
        });
    };
    DBAdapter.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, filename, sqliteErr, DatabaseSync, db_1, e_1, mod, Database, db_2, _b, sqlite3Mod, sqlite3, sqliteMod, sqlite, _c, _d, mod, mysql, _e, err_1, mod, pg, PgClient, err_2, mod, mongodb, MongoClientClass, err_3;
            var _f, _g, _h, _j, _k, _l;
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        if (this.connected)
                            return [2 /*return*/];
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 1];
                            case "mysql": return [3 /*break*/, 16];
                            case "postgres": return [3 /*break*/, 22];
                            case "mongodb": return [3 /*break*/, 28];
                        }
                        return [3 /*break*/, 34];
                    case 1:
                        filename = this.config.databaseUrl || ":memory:";
                        sqliteErr = void 0;
                        _m.label = 2;
                    case 2:
                        _m.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("node:sqlite"); })];
                    case 3:
                        DatabaseSync = (_m.sent()).DatabaseSync;
                        db_1 = new DatabaseSync(filename);
                        db_1.exec("PRAGMA journal_mode = WAL");
                        db_1.exec("PRAGMA foreign_keys = ON");
                        this.sqliteDb = {
                            _db: db_1,
                            all: function (sql, params) {
                                return __awaiter(this, void 0, void 0, function () {
                                    var stmt, rows;
                                    return __generator(this, function (_a) {
                                        stmt = db_1.prepare(sql);
                                        rows = stmt.all.apply(stmt, params);
                                        return [2 /*return*/, rows];
                                    });
                                });
                            },
                            run: function (sql, params) {
                                return __awaiter(this, void 0, void 0, function () {
                                    var stmt, r;
                                    return __generator(this, function (_a) {
                                        stmt = db_1.prepare(sql);
                                        r = stmt.run.apply(stmt, params);
                                        return [2 /*return*/, { changes: r.changes, lastID: Number(r.lastInsertRowid) }];
                                    });
                                });
                            },
                            close: function () {
                                return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                                    db_1.close();
                                    return [2 /*return*/];
                                }); });
                            },
                            _isNodeSqlite: true,
                        };
                        return [3 /*break*/, 35];
                    case 4:
                        e_1 = _m.sent();
                        sqliteErr = e_1;
                        return [3 /*break*/, 5];
                    case 5:
                        _m.trys.push([5, 8, , 9]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("better-sqlite3"); })];
                    case 6:
                        mod = _m.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 7:
                        Database = _m.sent();
                        db_2 = new Database(filename);
                        db_2.pragma("journal_mode = WAL");
                        db_2.pragma("foreign_keys = ON");
                        this.sqliteDb = {
                            _db: db_2,
                            all: function (sql, params) {
                                return __awaiter(this, void 0, void 0, function () {
                                    var _a;
                                    return __generator(this, function (_b) {
                                        return [2 /*return*/, (_a = db_2.prepare(sql)).all.apply(_a, params)];
                                    });
                                });
                            },
                            run: function (sql, params) {
                                return __awaiter(this, void 0, void 0, function () {
                                    var r;
                                    var _a;
                                    return __generator(this, function (_b) {
                                        r = (_a = db_2.prepare(sql)).run.apply(_a, params);
                                        return [2 /*return*/, { changes: r.changes, lastID: r.lastInsertRowid }];
                                    });
                                });
                            },
                            close: function () {
                                return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
                                    db_2.close();
                                    return [2 /*return*/];
                                }); });
                            },
                            _isBetterSqlite: true,
                        };
                        return [3 /*break*/, 35];
                    case 8:
                        _b = _m.sent();
                        return [3 /*break*/, 9];
                    case 9:
                        _m.trys.push([9, 14, , 15]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("sqlite3"); })];
                    case 10:
                        sqlite3Mod = _m.sent();
                        return [4 /*yield*/, this.defaultExport(sqlite3Mod)];
                    case 11:
                        sqlite3 = _m.sent();
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("sqlite"); })];
                    case 12:
                        sqliteMod = _m.sent();
                        sqlite = sqliteMod;
                        _c = this;
                        return [4 /*yield*/, sqlite.open({ filename: filename, driver: sqlite3.Database })];
                    case 13:
                        _c.sqliteDb = _m.sent();
                        return [3 /*break*/, 35];
                    case 14:
                        _d = _m.sent();
                        return [3 /*break*/, 15];
                    case 15: 
                    // --- 4. Nothing worked — clear error ---
                    throw new Error("No SQLite driver found.\n\n" +
                        "  Your Node version: ".concat(process.version, "\n") +
                        "  (node:sqlite requires Node 22.5+)\n\n" +
                        "Install one of:\n" +
                        "  npm install better-sqlite3    (recommended)\n" +
                        "  npm install sqlite3 sqlite     (async wrapper)\n" +
                        "  # Or upgrade to Node 22.5+ to use the built-in driver.\n" +
                        "\nOriginal error: ".concat((_f = sqliteErr === null || sqliteErr === void 0 ? void 0 : sqliteErr.message) !== null && _f !== void 0 ? _f : sqliteErr));
                    case 16:
                        _m.trys.push([16, 20, , 21]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("mysql2/promise"); })];
                    case 17:
                        mod = _m.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 18:
                        mysql = _m.sent();
                        _e = this;
                        return [4 /*yield*/, mysql.createConnection({
                                uri: this.config.databaseUrl,
                            })];
                    case 19:
                        _e.mysqlConn = _m.sent();
                        return [3 /*break*/, 21];
                    case 20:
                        err_1 = _m.sent();
                        throw new Error("MySQL driver not found. Install it:\n  npm install mysql2\n\nOriginal error: ".concat((_g = err_1 === null || err_1 === void 0 ? void 0 : err_1.message) !== null && _g !== void 0 ? _g : err_1));
                    case 21: return [3 /*break*/, 35];
                    case 22:
                        _m.trys.push([22, 26, , 27]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("pg"); })];
                    case 23:
                        mod = _m.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 24:
                        pg = _m.sent();
                        PgClient = (_h = pg.Client) !== null && _h !== void 0 ? _h : pg;
                        this.pgClient = new PgClient({
                            connectionString: this.config.databaseUrl,
                        });
                        return [4 /*yield*/, this.pgClient.connect()];
                    case 25:
                        _m.sent();
                        return [3 /*break*/, 27];
                    case 26:
                        err_2 = _m.sent();
                        throw new Error("Postgres driver not found. Install it:\n  npm install pg\n\nOriginal error: ".concat((_j = err_2 === null || err_2 === void 0 ? void 0 : err_2.message) !== null && _j !== void 0 ? _j : err_2));
                    case 27: return [3 /*break*/, 35];
                    case 28:
                        _m.trys.push([28, 32, , 33]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("mongodb"); })];
                    case 29:
                        mod = _m.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 30:
                        mongodb = _m.sent();
                        MongoClientClass = (_k = mongodb.MongoClient) !== null && _k !== void 0 ? _k : mongodb;
                        this.mongoClient = new MongoClientClass(this.config.databaseUrl);
                        return [4 /*yield*/, this.mongoClient.connect()];
                    case 31:
                        _m.sent();
                        this.mongoDb = this.mongoClient.db(this.config.databaseName);
                        return [3 /*break*/, 33];
                    case 32:
                        err_3 = _m.sent();
                        throw new Error("MongoDB driver not found. Install it:\n  npm install mongodb\n\nOriginal error: ".concat((_l = err_3 === null || err_3 === void 0 ? void 0 : err_3.message) !== null && _l !== void 0 ? _l : err_3));
                    case 33: return [3 /*break*/, 35];
                    case 34: throw new Error("Driver \"".concat(this.driver, "\" not implemented"));
                    case 35:
                        this.connected = true;
                        if (!this.onConnect) return [3 /*break*/, 37];
                        return [4 /*yield*/, this.onConnect()];
                    case 36:
                        _m.sent();
                        _m.label = 37;
                    case 37: return [2 /*return*/];
                }
            });
        });
    };
    DBAdapter.prototype.exec = function (sqlOrOp_1) {
        return __awaiter(this, arguments, void 0, function (sqlOrOp, params) {
            var _a, sql, stmt, first, rows, result, err_4, result, res, cmd, col, _b, r, r;
            var _c;
            var _d, _e, _f;
            if (params === void 0) { params = []; }
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, this.connect()];
                    case 1:
                        _g.sent();
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 2];
                            case "mysql": return [3 /*break*/, 9];
                            case "postgres": return [3 /*break*/, 11];
                            case "mongodb": return [3 /*break*/, 13];
                        }
                        return [3 /*break*/, 23];
                    case 2:
                        sql = sqlOrOp.trim();
                        _g.label = 3;
                    case 3:
                        _g.trys.push([3, 8, , 9]);
                        if (!/^(SELECT|PRAGMA|WITH)/i.test(sql)) return [3 /*break*/, 5];
                        if (this.logs)
                            console.log("EXEC (sqlite select):", sql, params);
                        stmt = this.stmtCache.get(sql);
                        if (!stmt) {
                            stmt = { _prepared: sql }; // placeholder for cache key
                            this.stmtCache.set(sql, stmt);
                            if (this.stmtCache.size > this.stmtCacheMax) {
                                first = this.stmtCache.keys().next();
                                if (!first.done)
                                    this.stmtCache.delete(first.value);
                            }
                        }
                        return [4 /*yield*/, this.sqliteDb.all(sql, params)];
                    case 4:
                        rows = _g.sent();
                        return [2 /*return*/, { rows: Array.isArray(rows) ? rows : [] }];
                    case 5:
                        if (this.logs)
                            console.log("EXEC (sqlite run):", sql, params);
                        return [4 /*yield*/, this.sqliteDb.run(sql, params)];
                    case 6:
                        result = _g.sent();
                        return [2 /*return*/, { rows: [], changes: result === null || result === void 0 ? void 0 : result.changes, lastID: (_d = result === null || result === void 0 ? void 0 : result.lastID) !== null && _d !== void 0 ? _d : result === null || result === void 0 ? void 0 : result.lastInsertRowid }];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        err_4 = _g.sent();
                        if (this.logs)
                            console.error("SQL ERROR:", sql, params, (_e = err_4 === null || err_4 === void 0 ? void 0 : err_4.message) !== null && _e !== void 0 ? _e : err_4);
                        throw err_4;
                    case 9:
                        if (this.logs)
                            console.log("EXEC (mysql):", sqlOrOp, params);
                        return [4 /*yield*/, this.mysqlConn.execute(sqlOrOp, params)];
                    case 10:
                        result = (_g.sent())[0];
                        if (Array.isArray(result)) {
                            return [2 /*return*/, { rows: result }];
                        }
                        else {
                            return [2 /*return*/, { rows: [], changes: result.affectedRows, lastID: result.insertId }];
                        }
                        _g.label = 11;
                    case 11:
                        if (this.logs)
                            console.log("EXEC (postgres):", sqlOrOp, params);
                        return [4 /*yield*/, this.pgClient.query(sqlOrOp, params)];
                    case 12:
                        res = _g.sent();
                        return [2 /*return*/, { rows: res.rows, changes: (_f = res.rowCount) !== null && _f !== void 0 ? _f : 0 }];
                    case 13:
                        if (this.logs)
                            console.log("EXEC (mongodb):", sqlOrOp, params);
                        if (!this.mongoDb)
                            throw new Error("MongoDB not initialized");
                        cmd = JSON.parse(sqlOrOp);
                        col = this.mongoDb.collection(cmd.collection);
                        _b = cmd.action;
                        switch (_b) {
                            case "find": return [3 /*break*/, 14];
                            case "insert": return [3 /*break*/, 16];
                            case "update": return [3 /*break*/, 18];
                            case "delete": return [3 /*break*/, 20];
                        }
                        return [3 /*break*/, 22];
                    case 14:
                        _c = {};
                        return [4 /*yield*/, col.find(cmd.filter || {}).toArray()];
                    case 15: return [2 /*return*/, (_c.rows = _g.sent(), _c)];
                    case 16: return [4 /*yield*/, col.insertMany(cmd.data)];
                    case 17:
                        _g.sent();
                        return [2 /*return*/, { rows: cmd.data }];
                    case 18: return [4 /*yield*/, col.updateMany(cmd.filter, { $set: cmd.data })];
                    case 19:
                        r = _g.sent();
                        return [2 /*return*/, { rows: [], changes: r.modifiedCount }];
                    case 20: return [4 /*yield*/, col.deleteMany(cmd.filter)];
                    case 21:
                        r = _g.sent();
                        return [2 /*return*/, { rows: [], changes: r.deletedCount }];
                    case 22: throw new Error("Unknown Mongo action ".concat(cmd.action));
                    case 23: throw new Error("Unsupported driver: ".concat(this.driver));
                }
            });
        });
    };
    DBAdapter.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 1];
                            case "mysql": return [3 /*break*/, 4];
                            case "postgres": return [3 /*break*/, 7];
                            case "mongodb": return [3 /*break*/, 10];
                        }
                        return [3 /*break*/, 13];
                    case 1:
                        if (!((_b = this.sqliteDb) === null || _b === void 0 ? void 0 : _b.close)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.sqliteDb.close()];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3: return [3 /*break*/, 13];
                    case 4:
                        if (!this.mysqlConn) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.mysqlConn.end()];
                    case 5:
                        _c.sent();
                        _c.label = 6;
                    case 6: return [3 /*break*/, 13];
                    case 7:
                        if (!this.pgClient) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.pgClient.end()];
                    case 8:
                        _c.sent();
                        _c.label = 9;
                    case 9: return [3 /*break*/, 13];
                    case 10:
                        if (!this.mongoClient) return [3 /*break*/, 12];
                        return [4 /*yield*/, this.mongoClient.close()];
                    case 11:
                        _c.sent();
                        _c.label = 12;
                    case 12: return [3 /*break*/, 13];
                    case 13:
                        this.connected = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    DBAdapter.prototype.connectReplicas = function () {
        return __awaiter(this, void 0, void 0, function () {
            var replicaUrls, _i, replicaUrls_1, url, mod, pg, client, mod, mysql, conn, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        replicaUrls = this.config.replicas;
                        if (!(replicaUrls === null || replicaUrls === void 0 ? void 0 : replicaUrls.length))
                            return [2 /*return*/];
                        _i = 0, replicaUrls_1 = replicaUrls;
                        _c.label = 1;
                    case 1:
                        if (!(_i < replicaUrls_1.length)) return [3 /*break*/, 13];
                        url = replicaUrls_1[_i];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 11, , 12]);
                        if (!(this.driver === "postgres")) return [3 /*break*/, 6];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("pg"); })];
                    case 3:
                        mod = _c.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 4:
                        pg = _c.sent();
                        client = new ((_b = pg.Client) !== null && _b !== void 0 ? _b : pg)({ connectionString: url });
                        return [4 /*yield*/, client.connect()];
                    case 5:
                        _c.sent();
                        if (!this.replicaPools.pg)
                            this.replicaPools.pg = [];
                        this.replicaPools.pg.push(client);
                        return [3 /*break*/, 10];
                    case 6:
                        if (!(this.driver === "mysql")) return [3 /*break*/, 10];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("mysql2/promise"); })];
                    case 7:
                        mod = _c.sent();
                        return [4 /*yield*/, this.defaultExport(mod)];
                    case 8:
                        mysql = _c.sent();
                        return [4 /*yield*/, mysql.createConnection({ uri: url })];
                    case 9:
                        conn = _c.sent();
                        if (!this.replicaPools.mysql)
                            this.replicaPools.mysql = [];
                        this.replicaPools.mysql.push(conn);
                        _c.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        _a = _c.sent();
                        return [3 /*break*/, 12];
                    case 12:
                        _i++;
                        return [3 /*break*/, 1];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    DBAdapter.prototype.execRead = function (sqlOrOp_1) {
        return __awaiter(this, arguments, void 0, function (sqlOrOp, params) {
            var replicas, replica, res, result, _a;
            var _b;
            if (params === void 0) { params = []; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.connect()];
                    case 1:
                        _c.sent();
                        replicas = this.driver === "postgres" ? this.replicaPools.pg
                            : this.driver === "mysql" ? this.replicaPools.mysql
                                : null;
                        if (!(replicas === null || replicas === void 0 ? void 0 : replicas.length))
                            return [2 /*return*/, this.exec(sqlOrOp, params)];
                        this.replicaIndex = (this.replicaIndex + 1) % replicas.length;
                        replica = replicas[this.replicaIndex];
                        if (this.logs)
                            console.log("EXEC (read replica):", sqlOrOp, params);
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 7, , 8]);
                        if (!(this.driver === "postgres")) return [3 /*break*/, 4];
                        return [4 /*yield*/, replica.query(sqlOrOp, params)];
                    case 3:
                        res = _c.sent();
                        return [2 /*return*/, { rows: res.rows, changes: (_b = res.rowCount) !== null && _b !== void 0 ? _b : 0 }];
                    case 4:
                        if (!(this.driver === "mysql")) return [3 /*break*/, 6];
                        return [4 /*yield*/, replica.execute(sqlOrOp, params)];
                    case 5:
                        result = (_c.sent())[0];
                        return [2 /*return*/, { rows: Array.isArray(result) ? result : [] }];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        _a = _c.sent();
                        return [2 /*return*/, this.exec(sqlOrOp, params)];
                    case 8: return [2 /*return*/, this.exec(sqlOrOp, params)];
                }
            });
        });
    };
    DBAdapter.prototype.getTableInfo = function (table) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, res, sample;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.connect()];
                    case 1:
                        _b.sent();
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 2];
                            case "mysql": return [3 /*break*/, 4];
                            case "postgres": return [3 /*break*/, 6];
                            case "mongodb": return [3 /*break*/, 8];
                        }
                        return [3 /*break*/, 10];
                    case 2: return [4 /*yield*/, this.sqliteDb.all("PRAGMA table_info(".concat(table, ")"), [])];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4: return [4 /*yield*/, this.mysqlConn.execute("DESCRIBE ".concat(table))];
                    case 5: return [2 /*return*/, (_b.sent())[0]];
                    case 6: return [4 /*yield*/, this.pgClient.query("SELECT column_name, data_type, is_nullable\n           FROM information_schema.columns\n           WHERE table_name = $1", [table])];
                    case 7:
                        res = _b.sent();
                        return [2 /*return*/, res.rows];
                    case 8:
                        if (!this.mongoDb)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, this.mongoDb.collection(table).findOne({})];
                    case 9:
                        sample = _b.sent();
                        return [2 /*return*/, sample ? Object.keys(sample).map(function (k) { return ({ name: k }); }) : []];
                    case 10: return [2 /*return*/, []];
                }
            });
        });
    };
    return DBAdapter;
}());
exports.DBAdapter = DBAdapter;
