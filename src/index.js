"use strict";
// SERVERLESS / EDGE CHANGES:
//   1. Removed `import path from "node:path"` — path is not available in V8
//      isolates (Vercel Edge, Cloudflare Workers, Deno Deploy). All path ops
//      now use URL-relative logic or are delegated to the generator (Node-only).
//   2. getPaths() is kept but only used in the Node migrate() path — edge
//      callers pass `schema` directly and never touch the filesystem.
//   3. generateSchema is dynamically imported only when needed (Node migrate()),
//      so the V8 bundle never includes fs/ts-morph.
//   4. migration-history is likewise dynamically imported only in migrate().
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
exports.createORM = createORM;
var dbAdapter_js_1 = require("./dbAdapter.js");
var model_js_1 = require("./model.js");
var migrator_js_1 = require("./migrator.js");
var db_error_js_1 = require("./db-error.js");
function resolveDriver(driver) {
    if (driver === "sqlite" || driver === "postgres" || driver === "mysql")
        return driver;
    return undefined;
}
// ─── createORM (functional API) ───────────────────────────────────────────────
function createORM() {
    return __awaiter(this, arguments, void 0, function (cfg) {
        var adapter, sqlDriver, migrator, _i, _a, modelName, model, defineModel;
        var _this = this;
        if (cfg === void 0) { cfg = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    adapter = new dbAdapter_js_1.DBAdapter({
                        driver: cfg.driver,
                        databaseUrl: cfg.databaseUrl,
                        dir: cfg.dir || "src",
                        logs: cfg.logs,
                        schema: cfg.schema,
                        modelMap: cfg.modelMap,
                        replicas: cfg.replicas,
                        poolSize: cfg.poolSize,
                    });
                    sqlDriver = resolveDriver(adapter.driver);
                    if (sqlDriver) {
                        adapter.exec = (0, db_error_js_1.wrapExec)(adapter.exec.bind(adapter), sqlDriver);
                    }
                    if (!cfg.schema) return [3 /*break*/, 4];
                    migrator = new migrator_js_1.Migrator(adapter.exec.bind(adapter), sqlDriver);
                    _i = 0, _a = Object.keys(cfg.schema);
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    modelName = _a[_i];
                    model = cfg.schema[modelName];
                    return [4 /*yield*/, migrator.ensureTable(model.table || modelName.toLowerCase(), model.fields)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [4 /*yield*/, (0, model_js_1.createModelFactory)(adapter, cfg.schema, function (event) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
                case 5:
                    defineModel = _b.sent();
                    return [2 /*return*/, { adapter: adapter, defineModel: defineModel }];
            }
        });
    });
}
var schemaGenerated = false;
var ORMManager = /** @class */ (function () {
    function ORMManager(cfg) {
        if (cfg === void 0) { cfg = {}; }
        this.DB = {};
        this._globalHooks = new Map();
        // ── Seeding helpers ───────────────────────────────────────────────
        /**
         * Register a seed function that can be invoked via `npx slintorm seed`.
         * seedFn receives the ORM instance and an optional logger.
         */
        this._seeders = new Map();
        this.cfg = cfg;
        this.adapter = new dbAdapter_js_1.DBAdapter({
            driver: this.cfg.driver,
            databaseUrl: this.cfg.databaseUrl,
            dir: this.cfg.dir || "src",
            logs: this.cfg.logs,
            schema: this.cfg.schema,
            modelMap: this.cfg.modelMap,
            replicas: this.cfg.replicas,
            poolSize: this.cfg.poolSize,
        });
        var sqlDriver = resolveDriver(this.adapter.driver);
        if (sqlDriver) {
            this.adapter.exec = (0, db_error_js_1.wrapExec)(this.adapter.exec.bind(this.adapter), sqlDriver);
        }
    }
    // ── migrate() — Node-only path ──────────────────────────────────────────────
    // In serverless/edge: do NOT call migrate(). Instead:
    //   1. Run `npx slintorm generate` at build time.
    //   2. Import the generated schema JSON.
    //   3. Pass it as `schema` in the constructor.
    //   4. Call defineModel() directly — migrations run automatically per-table
    //      the first time each model is used (schema is already known).
    ORMManager.prototype.migrate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, generateSchema, _b, snapshotCurrentGeneratedSchema, runMigrations, pathMod, schemaPath, schema, _c;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!!schemaGenerated) return [3 /*break*/, 7];
                        schemaGenerated = true;
                        return [4 /*yield*/, Promise.all([
                                Promise.resolve().then(function () { return require("./generator.js"); }),
                                Promise.resolve().then(function () { return require("./migration-history.js"); }),
                                Promise.resolve().then(function () { return require("node:path"); }),
                            ])];
                    case 1:
                        _a = _e.sent(), generateSchema = _a[0].default, _b = _a[1], snapshotCurrentGeneratedSchema = _b.snapshotCurrentGeneratedSchema, runMigrations = _b.runMigrations, pathMod = _a[2];
                        schemaPath = pathMod.join(process.cwd(), this.cfg.dir || "src");
                        return [4 /*yield*/, snapshotCurrentGeneratedSchema({
                                exec: this.adapter.exec,
                                driver: this.cfg.driver,
                                dir: this.cfg.dir || "src",
                            })];
                    case 2:
                        _e.sent();
                        if (!((_d = this.cfg.schema) !== null && _d !== void 0)) return [3 /*break*/, 3];
                        _c = _d;
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, generateSchema(schemaPath)];
                    case 4:
                        _c = (_e.sent());
                        _e.label = 5;
                    case 5:
                        schema = _c;
                        if (!this.cfg.schema) {
                            console.log("✅ Schema generated:", schemaPath);
                        }
                        return [4 /*yield*/, runMigrations({
                                exec: this.adapter.exec,
                                driver: this.cfg.driver,
                                dir: this.cfg.dir || "src",
                                schema: schema,
                            })];
                    case 6:
                        _e.sent();
                        _e.label = 7;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    ORMManager.prototype.defineModel = function (table, modelName, hooks) {
        return __awaiter(this, void 0, void 0, function () {
            var self, defineModel, model, writableDB;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        self = this;
                        return [4 /*yield*/, (0, model_js_1.createModelFactory)(this.adapter, this.cfg.schema, function (event) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                return [2 /*return*/, self._emitGlobal(event)];
                            }); }); })];
                    case 1:
                        defineModel = _a.sent();
                        model = defineModel(table, modelName, hooks);
                        if (typeof modelName === "string") {
                            writableDB = this.DB;
                            writableDB[modelName] = model;
                        }
                        return [2 /*return*/, model];
                }
            });
        });
    };
    ORMManager.prototype.transaction = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var driver, spCounter, trx, result, err_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        driver = this.adapter.driver;
                        if (!(driver !== "mongodb")) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.adapter.exec("BEGIN", [])];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        spCounter = 0;
                        trx = {
                            exec: this.adapter.exec.bind(this.adapter),
                            savepoint: function (name) { return __awaiter(_this, void 0, void 0, function () {
                                var sp;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (driver === "mongodb")
                                                return [2 /*return*/];
                                            sp = name || "sp_".concat(++spCounter);
                                            return [4 /*yield*/, this.adapter.exec("SAVEPOINT ".concat(sp), [])];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); },
                            rollbackTo: function (name) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (driver === "mongodb")
                                                return [2 /*return*/];
                                            return [4 /*yield*/, this.adapter.exec("ROLLBACK TO SAVEPOINT ".concat(name), [])];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); },
                        };
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 7, , 10]);
                        return [4 /*yield*/, callback(trx)];
                    case 4:
                        result = _a.sent();
                        if (!(driver !== "mongodb")) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.adapter.exec("COMMIT", [])];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [2 /*return*/, result];
                    case 7:
                        err_1 = _a.sent();
                        if (!(driver !== "mongodb")) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.adapter.exec("ROLLBACK", [])];
                    case 8:
                        _a.sent();
                        _a.label = 9;
                    case 9: throw err_1;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    ORMManager.prototype.batch = function (statements) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.transaction(function (trx) { return __awaiter(_this, void 0, void 0, function () {
                            var _i, statements_1, stmt;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _i = 0, statements_1 = statements;
                                        _b.label = 1;
                                    case 1:
                                        if (!(_i < statements_1.length)) return [3 /*break*/, 4];
                                        stmt = statements_1[_i];
                                        return [4 /*yield*/, trx.exec(stmt.sql, (_a = stmt.params) !== null && _a !== void 0 ? _a : [])];
                                    case 2:
                                        _b.sent();
                                        _b.label = 3;
                                    case 3:
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // ── Execute raw SQL with params ────────────────────────────────────
    ORMManager.prototype.execRaw = function (sql_1) {
        return __awaiter(this, arguments, void 0, function (sql, params) {
            if (params === void 0) { params = []; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.adapter.exec(sql, params)];
            });
        });
    };
    // ── Global event system ────────────────────────────────────────────
    ORMManager.prototype.on = function (event, handler) {
        var handlers = this._globalHooks.get(event) || [];
        handlers.push(handler);
        this._globalHooks.set(event, handlers);
        return this;
    };
    ORMManager.prototype.off = function (event, handler) {
        var handlers = this._globalHooks.get(event);
        if (!handlers)
            return this;
        var idx = handlers.indexOf(handler);
        if (idx >= 0)
            handlers.splice(idx, 1);
        if (!handlers.length)
            this._globalHooks.delete(event);
        return this;
    };
    ORMManager.prototype._emitGlobal = function (event) {
        return __awaiter(this, void 0, void 0, function () {
            var handlers, _i, handlers_1, handler;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        handlers = this._globalHooks.get(event.type);
                        if (!(handlers === null || handlers === void 0 ? void 0 : handlers.length))
                            return [2 /*return*/];
                        _i = 0, handlers_1 = handlers;
                        _a.label = 1;
                    case 1:
                        if (!(_i < handlers_1.length)) return [3 /*break*/, 4];
                        handler = handlers_1[_i];
                        return [4 /*yield*/, handler(event)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // ── Audit logging helper ──────────────────────────────────────────
    /**
     * Enable automatic audit logging. Creates (or uses) a table named `_audit_logs`
     * and records all create/update/delete operations.
     */
    ORMManager.prototype.enableAuditLogging = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            var tableName, exclude;
            var _this = this;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tableName = options.tableName || "_audit_logs";
                        exclude = new Set(options.excludeModels || ["_audit_logs"]);
                        return [4 /*yield*/, this.adapter.exec("CREATE TABLE IF NOT EXISTS \"".concat(tableName, "\" (\n        \"id\" INTEGER PRIMARY KEY AUTOINCREMENT,\n        \"model\" TEXT NOT NULL,\n        \"action\" TEXT NOT NULL,\n        \"recordId\" TEXT,\n        \"oldData\" TEXT,\n        \"newData\" TEXT,\n        \"changedAt\" TEXT NOT NULL\n      )"), [])];
                    case 1:
                        _a.sent();
                        this.on("afterInsert", function (event) { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (exclude.has(event.model))
                                            return [2 /*return*/];
                                        return [4 /*yield*/, this.adapter.exec("INSERT INTO \"".concat(tableName, "\" (\"model\", \"action\", \"recordId\", \"newData\", \"changedAt\") VALUES (?, ?, ?, ?, ?)"), [event.model, "INSERT", String((_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : ""), JSON.stringify(event.data), new Date().toISOString()])];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                        this.on("afterUpdate", function (event) { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (exclude.has(event.model))
                                            return [2 /*return*/];
                                        return [4 /*yield*/, this.adapter.exec("INSERT INTO \"".concat(tableName, "\" (\"model\", \"action\", \"recordId\", \"newData\", \"oldData\", \"changedAt\") VALUES (?, ?, ?, ?, ?, ?)"), [event.model, "UPDATE", String((_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : JSON.stringify(event.filter)), JSON.stringify(event.data), JSON.stringify(event.filter), new Date().toISOString()])];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                        this.on("afterDelete", function (event) { return __awaiter(_this, void 0, void 0, function () {
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (exclude.has(event.model))
                                            return [2 /*return*/];
                                        return [4 /*yield*/, this.adapter.exec("INSERT INTO \"".concat(tableName, "\" (\"model\", \"action\", \"recordId\", \"oldData\", \"changedAt\") VALUES (?, ?, ?, ?, ?)"), [event.model, "DELETE", String((_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : JSON.stringify(event.filter)), JSON.stringify(event.data), new Date().toISOString()])];
                                    case 1:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); });
                        return [2 /*return*/];
                }
            });
        });
    };
    ORMManager.prototype.seeder = function (name, fn) {
        this._seeders.set(name, fn);
        return this;
    };
    ORMManager.prototype.runSeed = function (name) {
        return __awaiter(this, void 0, void 0, function () {
            var fn;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fn = this._seeders.get(name);
                        if (!fn)
                            throw new Error("Seeder \"".concat(name, "\" not found"));
                        return [4 /*yield*/, fn(this, function (msg) { return console.log("[seed:".concat(name, "] ").concat(msg)); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ORMManager.prototype.runAllSeeds = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_1, this_1, _i, _a, _b, name_1, fn;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _loop_1 = function (name_1, fn) {
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        console.log("Running seeder: ".concat(name_1, "..."));
                                        return [4 /*yield*/, fn(this_1, function (msg) { return console.log("[seed:".concat(name_1, "] ").concat(msg)); })];
                                    case 1:
                                        _d.sent();
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _i = 0, _a = Array.from(this._seeders);
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        _b = _a[_i], name_1 = _b[0], fn = _b[1];
                        return [5 /*yield**/, _loop_1(name_1, fn)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return ORMManager;
}());
exports.default = ORMManager;
