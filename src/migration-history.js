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
exports.snapshotCurrentGeneratedSchema = snapshotCurrentGeneratedSchema;
exports.migrationRecordModelName = migrationRecordModelName;
exports.migrationRecordForPath = migrationRecordForPath;
exports.migrationPlan = migrationPlan;
exports.restoreGeneratedSchemaForBatch = restoreGeneratedSchemaForBatch;
exports.runMigrations = runMigrations;
var fs = require("node:fs");
var path = require("node:path");
var node_crypto_1 = require("node:crypto");
var migrator_js_1 = require("./migrator.js");
var MIGRATIONS_TABLE = "_slint_migrations";
var SCHEMA_SNAPSHOT_ROOT = "_schema_snapshots";
var CREATE_MIGRATIONS_TABLE = {
    sqlite: "CREATE TABLE IF NOT EXISTS \"".concat(MIGRATIONS_TABLE, "\" (\n               id        INTEGER PRIMARY KEY AUTOINCREMENT,\n               name      TEXT    NOT NULL UNIQUE,\n               batch     INTEGER NOT NULL,\n               run_at    TEXT    NOT NULL DEFAULT (datetime('now'))\n             )"),
    postgres: "CREATE TABLE IF NOT EXISTS \"".concat(MIGRATIONS_TABLE, "\" (\n               id        SERIAL  PRIMARY KEY,\n               name      TEXT    NOT NULL UNIQUE,\n               batch     INTEGER NOT NULL,\n               run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()\n             )"),
    mysql: "CREATE TABLE IF NOT EXISTS `".concat(MIGRATIONS_TABLE, "` (\n               id        INT AUTO_INCREMENT PRIMARY KEY,\n               name      VARCHAR(255) NOT NULL UNIQUE,\n               batch     INT NOT NULL,\n               run_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n             )"),
};
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
function migrationsDir(dir) {
    var p = path.join(process.cwd(), dir, "schema", "migrations");
    if (!fs.existsSync(p))
        fs.mkdirSync(p, { recursive: true });
    return p;
}
function schemaSnapshotDir(dir, batch) {
    var p = path.join(migrationsDir(dir), SCHEMA_SNAPSHOT_ROOT, "batch-".concat(batch));
    if (!fs.existsSync(p))
        fs.mkdirSync(p, { recursive: true });
    return p;
}
function currentGeneratedSchemaPaths(dir) {
    var base = path.join(process.cwd(), dir, "schema");
    return {
        ts: path.join(base, "generated.ts"),
        json: path.join(base, "generated.json"),
    };
}
function snapshotGeneratedSchema(dir, batch) {
    var source = currentGeneratedSchemaPaths(dir);
    if (!fs.existsSync(source.ts) && !fs.existsSync(source.json))
        return false;
    var targetDir = schemaSnapshotDir(dir, batch);
    var copied = false;
    for (var _i = 0, _a = ["ts", "json"]; _i < _a.length; _i++) {
        var key = _a[_i];
        var sourcePath = source[key];
        if (!fs.existsSync(sourcePath))
            continue;
        fs.copyFileSync(sourcePath, path.join(targetDir, "generated.".concat(key)));
        copied = true;
    }
    return copied;
}
// Restores a previously-snapshotted generated.ts/json back onto disk AND
// returns the parsed schema object for that batch, so callers (rollback)
// can actually rebuild tables from it — not just leave files on disk.
function restoreGeneratedSchemaSnapshot(dir, batch) {
    var snapshotDir = path.join(migrationsDir(dir), SCHEMA_SNAPSHOT_ROOT, "batch-".concat(batch));
    if (!fs.existsSync(snapshotDir))
        return null;
    var target = currentGeneratedSchemaPaths(dir);
    var jsonSnapshotPath = path.join(snapshotDir, "generated.json");
    var tsSnapshotPath = path.join(snapshotDir, "generated.ts");
    var schema = null;
    if (fs.existsSync(jsonSnapshotPath)) {
        schema = JSON.parse(fs.readFileSync(jsonSnapshotPath, "utf8"));
    }
    // Copy whichever snapshot files exist back onto disk so generated.ts/json
    // reflect the restored batch too, keeping `generate`/`status` consistent.
    for (var _i = 0, _a = [
        [jsonSnapshotPath, target.json],
        [tsSnapshotPath, target.ts],
    ]; _i < _a.length; _i++) {
        var _b = _a[_i], snapshotPath = _b[0], targetPath = _b[1];
        if (!fs.existsSync(snapshotPath))
            continue;
        fs.copyFileSync(snapshotPath, targetPath);
    }
    return schema;
}
function snapshotCurrentGeneratedSchema(options) {
    return __awaiter(this, void 0, void 0, function () {
        var driver, dir, batch;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    driver = (_a = options.driver) !== null && _a !== void 0 ? _a : "sqlite";
                    dir = (_b = options.dir) !== null && _b !== void 0 ? _b : "src";
                    return [4 /*yield*/, ensureMigrationsTable(options.exec, driver)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, getLastBatch(options.exec)];
                case 2:
                    batch = _c.sent();
                    return [2 /*return*/, snapshotGeneratedSchema(dir, batch)];
            }
        });
    });
}
function writeMigrationRecord(dir, unit, batch, modelDef) {
    var _a;
    var recPath = path.join(migrationsDir(dir), "".concat(unit.name, ".json"));
    var record = {
        name: unit.name,
        modelName: unit.modelName,
        tableName: unit.tableName,
        schemaHash: unit.schemaHash,
        batch: batch,
        appliedAt: new Date().toISOString(),
        fields: Object.keys((_a = modelDef === null || modelDef === void 0 ? void 0 : modelDef.fields) !== null && _a !== void 0 ? _a : {}),
    };
    fs.writeFileSync(recPath, JSON.stringify(record, null, 2), "utf8");
}
function readMigrationRecord(dir, name) {
    var recPath = path.join(migrationsDir(dir), "".concat(name, ".json"));
    if (!fs.existsSync(recPath))
        return null;
    try {
        return JSON.parse(fs.readFileSync(recPath, "utf8"));
    }
    catch (_a) {
        return null;
    }
}
function loadMigrationRecords(dir) {
    var dirPath = migrationsDir(dir);
    return fs.readdirSync(dirPath)
        .filter(function (file) { return file.endsWith(".json"); })
        .map(function (file) {
        try {
            return JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf8"));
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
function schemaToPlan(schema) {
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
function ensureMigrationsTable(exec, driver) {
    return __awaiter(this, void 0, void 0, function () {
        var sql;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                    return [4 /*yield*/, exec("CREATE TABLE \"".concat(MIGRATIONS_TABLE, "\""))];
                case 1:
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
function insertMigrationRow(exec, driver, name, batch) {
    return __awaiter(this, void 0, void 0, function () {
        var isPg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(driver === "mongodb")) return [3 /*break*/, 2];
                    return [4 /*yield*/, exec("INSERT INTO \"".concat(MIGRATIONS_TABLE, "\" (name, batch) VALUES (?,?)"), [name, batch])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
                case 2:
                    isPg = driver === "postgres";
                    return [4 /*yield*/, exec("INSERT INTO \"".concat(MIGRATIONS_TABLE, "\" (name, batch) VALUES (").concat(isPg ? "$1,$2" : "?,?", ")"), [name, batch])];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function migrationRecordModelName(unitName) {
    return migrationModelName(unitName);
}
function migrationRecordForPath(dir, name) {
    return readMigrationRecord(dir, name);
}
function migrationPlan(schema) {
    return schemaToPlan(schema);
}
// Returns the restored schema object for the given batch (or null if no
// snapshot exists), and also rewrites generated.ts/json on disk to match.
function restoreGeneratedSchemaForBatch(dir, batch) {
    return restoreGeneratedSchemaSnapshot(dir, batch);
}
function runMigrations(options) {
    return __awaiter(this, void 0, void 0, function () {
        var driver, dir, schema, plan, rows, records, dbApplied, applied, pending, result_1, migrator, batch, appliedCount, index, unit, modelDef, error_1, result;
        var _a;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    driver = (_b = options.driver) !== null && _b !== void 0 ? _b : "sqlite";
                    dir = (_c = options.dir) !== null && _c !== void 0 ? _c : "src";
                    schema = withSyntheticPivots(options.schema);
                    return [4 /*yield*/, ensureMigrationsTable(options.exec, driver)];
                case 1:
                    _q.sent();
                    plan = schemaToPlan(schema);
                    return [4 /*yield*/, getApplied(options.exec)];
                case 2:
                    rows = _q.sent();
                    records = loadMigrationRecords(dir);
                    dbApplied = new Set(rows.map(function (r) { return r.name; }));
                    applied = new Set(plan
                        .filter(function (unit) {
                        var modelDef = schema[unit.modelName];
                        var currentFields = fieldNames(modelDef);
                        return dbApplied.has(unit.name) || records.some(function (record) { return recordMatchesUnit(record, unit, currentFields); });
                    })
                        .map(function (unit) { return unit.name; }));
                    pending = plan.filter(function (unit) { return !applied.has(unit.name); });
                    (_e = (_d = options.hooks) === null || _d === void 0 ? void 0 : _d.onPending) === null || _e === void 0 ? void 0 : _e.call(_d, pending);
                    if (!!pending.length) return [3 /*break*/, 4];
                    _a = {};
                    return [4 /*yield*/, getLastBatch(options.exec)];
                case 3:
                    result_1 = (_a.batch = _q.sent(),
                        _a.applied = 0,
                        _a.pending = [],
                        _a);
                    (_g = (_f = options.hooks) === null || _f === void 0 ? void 0 : _f.onDone) === null || _g === void 0 ? void 0 : _g.call(_f, result_1);
                    return [2 /*return*/, result_1];
                case 4:
                    migrator = new migrator_js_1.Migrator(options.exec, driver);
                    return [4 /*yield*/, getLastBatch(options.exec)];
                case 5:
                    batch = (_q.sent()) + 1;
                    appliedCount = 0;
                    if (batch === 1) {
                        snapshotGeneratedSchema(dir, 0);
                    }
                    index = 0;
                    _q.label = 6;
                case 6:
                    if (!(index < pending.length)) return [3 /*break*/, 12];
                    unit = pending[index];
                    modelDef = schema[unit.modelName];
                    (_j = (_h = options.hooks) === null || _h === void 0 ? void 0 : _h.onProgress) === null || _j === void 0 ? void 0 : _j.call(_h, index, pending.length, unit);
                    _q.label = 7;
                case 7:
                    _q.trys.push([7, 10, , 11]);
                    return [4 /*yield*/, migrator.ensureTable(unit.tableName, modelDef.fields, (_k = modelDef.relations) !== null && _k !== void 0 ? _k : [])];
                case 8:
                    _q.sent();
                    return [4 /*yield*/, insertMigrationRow(options.exec, driver, unit.name, batch)];
                case 9:
                    _q.sent();
                    writeMigrationRecord(dir, unit, batch, modelDef);
                    appliedCount++;
                    return [3 /*break*/, 11];
                case 10:
                    error_1 = _q.sent();
                    (_m = (_l = options.hooks) === null || _l === void 0 ? void 0 : _l.onError) === null || _m === void 0 ? void 0 : _m.call(_l, unit, error_1);
                    throw error_1;
                case 11:
                    index++;
                    return [3 /*break*/, 6];
                case 12:
                    snapshotGeneratedSchema(dir, batch);
                    result = { batch: batch, applied: appliedCount, pending: pending };
                    (_p = (_o = options.hooks) === null || _o === void 0 ? void 0 : _o.onDone) === null || _p === void 0 ? void 0 : _p.call(_o, result);
                    return [2 /*return*/, result];
            }
        });
    });
}
