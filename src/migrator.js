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
exports.Migrator = void 0;
var utils_js_1 = require("./utils.js");
// Known relation directive key prefixes — checked with and without leading "@"
var RELATION_DIRECTIVE_ROOTS = [
    "relation",
    "relationship",
    "relation onetomany",
    "relation manytoone",
    "relation onetoone",
    "relation manytomany",
    "relationship onetomany",
    "relationship manytoone",
    "relationship onetoone",
    "relationship manytomany",
];
var RELATION_KEY_SET = new Set(__spreadArray(__spreadArray([], RELATION_DIRECTIVE_ROOTS, true), RELATION_DIRECTIVE_ROOTS.map(function (r) { return "@".concat(r); }), true));
// ==== MIGRATOR CLASS ====
var Migrator = /** @class */ (function () {
    function Migrator(exec, driver) {
        // Per-instance so multiple Migrator instances / test runs don't share state
        this.processedTables = new Set();
        this.exec = exec;
        this.driver = driver || "sqlite";
    }
    // ----------------------------------------------------------------
    // Meta helpers — transparently handle both "key" and "@key" variants
    // so the migrator works regardless of whether the schema generator
    // strips the leading "@" from directive names or leaves it in.
    // ----------------------------------------------------------------
    Migrator.prototype.m = function (meta, key) {
        if (!meta)
            return undefined;
        var v = meta[key];
        if (v !== undefined)
            return v;
        var vAt = meta["@".concat(key)];
        if (vAt !== undefined)
            return vAt;
        return undefined;
    };
    Migrator.prototype.hasM = function (meta, key) {
        return this.m(meta, key) !== undefined;
    };
    // ----------------------------------------------------------------
    // isRelationPlaceholder — returns true when the field exists only to
    // express a relation in the TypeScript interface and must NOT become a
    // DB column. Uses an exact-key set instead of a broad regex to avoid
    // false positives on field names that merely contain "relation".
    // ----------------------------------------------------------------
    Migrator.prototype.isRelationPlaceholder = function (info) {
        var keys = Object.keys(info.meta || {});
        return keys.some(function (k) { return RELATION_KEY_SET.has(k.toLowerCase()); });
    };
    // ----------------------------------------------------------------
    // migrateSchema — top-level entry point
    // ----------------------------------------------------------------
    Migrator.prototype.migrateSchema = function (schema) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, name_1, model, _c, _d, r, pivot, leftFk, rightFk, _e, _f, _g, name_2, model;
            var _h;
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        // Auto-create pivot/junction tables for many-to-many relations when
                        // a `through` name is provided but no explicit model exists for it.
                        for (_i = 0, _a = Object.entries(schema); _i < _a.length; _i++) {
                            _b = _a[_i], name_1 = _b[0], model = _b[1];
                            for (_c = 0, _d = model.relations || []; _c < _d.length; _c++) {
                                r = _d[_c];
                                if (r.kind !== "manytomany" || !r.through)
                                    continue;
                                pivot = String(r.through);
                                if (schema[pivot])
                                    continue;
                                leftFk = r.foreignKey || this.m(r.meta, "foreignKey") || "".concat(name_1.toLowerCase(), "Id");
                                rightFk = r.relatedKey || this.m(r.meta, "relatedKey") || "".concat(String(r.targetModel).toLowerCase(), "Id");
                                schema[pivot] = {
                                    fields: (_h = {
                                            id: { type: "number", meta: { primaryKey: true, auto: true } }
                                        },
                                        _h[leftFk] = { type: "number", meta: { index: true } },
                                        _h[rightFk] = { type: "number", meta: { index: true } },
                                        _h),
                                    relations: [],
                                    table: pivot,
                                };
                            }
                        }
                        _e = 0, _f = Object.entries(schema);
                        _j.label = 1;
                    case 1:
                        if (!(_e < _f.length)) return [3 /*break*/, 5];
                        _g = _f[_e], name_2 = _g[0], model = _g[1];
                        if (!model.table)
                            model.table = name_2.toLowerCase();
                        this.ensureTimestamps(model);
                        return [4 /*yield*/, this.ensureTable(model.table, model.fields, model.relations || [])];
                    case 2:
                        _j.sent();
                        return [4 /*yield*/, this.applyDefaults(model.table, model.fields)];
                    case 3:
                        _j.sent();
                        _j.label = 4;
                    case 4:
                        _e++;
                        return [3 /*break*/, 1];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // ----------------------------------------------------------------
    // ensureTimestamps — adds createdAt / updatedAt always, and deletedAt
    // only when the model explicitly uses @softDelete so clean tables stay
    // clean.
    // ----------------------------------------------------------------
    Migrator.prototype.ensureTimestamps = function (model) {
        var _this = this;
        var fields = model.fields;
        if (!fields.createdAt) {
            fields.createdAt = { type: "string", meta: { default: "CURRENT_TIMESTAMP", index: true } };
        }
        if (!fields.updatedAt) {
            fields.updatedAt = { type: "string", meta: { default: "CURRENT_TIMESTAMP", index: true } };
        }
        var hasSoftDelete = Object.values(fields).some(function (f) { return _this.hasM(f.meta, "softDelete"); });
        if (hasSoftDelete && !fields.deletedAt) {
            fields.deletedAt = { type: "string", meta: { nullable: true, index: true, default: null } };
        }
    };
    // ----------------------------------------------------------------
    // ensureTable — create or alter a table to match the schema
    // ----------------------------------------------------------------
    Migrator.prototype.ensureTable = function (table, schema, relations) {
        return __awaiter(this, void 0, void 0, function () {
            var exists, colsSql, indexSql, inlineConstraints, postConstraints, commentSql, primaryDeclared, _i, _a, _b, col, info, typeStr, meta, sqlType, enumVal, isJson, enumValues, _c, lengthVal, isNullableMeta, isOptionalType, isSoftDelete, isEnumNoDefault, isUnique, isExplicitNotNull, isNullable, nullFrag, defaultClause, defVal, defaultFn, jsonDefault, generatedAlways, generated, collateVal, collate, checkVal, check, pkFragment, parts, comment, indexVal, indexStr, uniquePrefix, whereClause, whereMatch, polyType, polyId, fkRef, onDelete, onUpdate, matchVal, deferrable, fkStmt, idIdx, createSQL, existingCols, validCols, _d, existingCols_1, existingCol, _e, _f, _g, _h, col, info, renameVal, oldName, _j, _k, colsSql_1, colDef, m, colName, safeColDef, _l, _m, commentSql_1, c, _o, existingIndexes, _p, indexSql_1, idx, idxName, _q, compositeIndexes, _loop_1, this_1, _r, _s, _t, col, info, _u, compositeIndexes_1, ci, idxName, uniquePrefix, whereClause, cols, _v, existingFKs_1, existingFKsNow, _w, postConstraints_1, fk, _x;
            var _this = this;
            var _y;
            return __generator(this, function (_z) {
                switch (_z.label) {
                    case 0:
                        table = table.toLowerCase();
                        if (this.processedTables.has(table))
                            return [2 /*return*/];
                        // Heuristic: ensure `id` gets PK + auto when the generator left them out
                        if (schema["id"] && schema["id"].meta) {
                            if (!this.hasM(schema["id"].meta, "primaryKey"))
                                schema["id"].meta.primaryKey = true;
                            if (!this.hasM(schema["id"].meta, "auto"))
                                schema["id"].meta.auto = true;
                        }
                        return [4 /*yield*/, this.tableExists(table)];
                    case 1:
                        exists = _z.sent();
                        colsSql = [];
                        indexSql = [];
                        inlineConstraints = [];
                        postConstraints = [];
                        commentSql = [];
                        primaryDeclared = false;
                        _i = 0, _a = Object.entries(schema);
                        _z.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 9];
                        _b = _a[_i], col = _b[0], info = _b[1];
                        if (!(info === null || info === void 0 ? void 0 : info.type))
                            return [3 /*break*/, 8];
                        // Skip relation placeholder fields (user?: User, posts?: Post[], etc.)
                        if (this.isRelationPlaceholder(info))
                            return [3 /*break*/, 8];
                        typeStr = String(info.type).trim();
                        if (/^\(?\d+\)?$/.test(typeStr))
                            return [3 /*break*/, 8];
                        meta = info.meta || {};
                        sqlType = "";
                        enumVal = this.m(meta, "enum");
                        isJson = this.hasM(meta, "json");
                        if (!enumVal) return [3 /*break*/, 6];
                        enumValues = this.parseEnumValues(String(enumVal));
                        if (!(this.driver === "postgres")) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.createEnumColumn(table, col, enumValues)];
                    case 3:
                        _c = _z.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _c = "VARCHAR(255)";
                        _z.label = 5;
                    case 5:
                        sqlType = _c;
                        return [3 /*break*/, 7];
                    case 6:
                        if (isJson) {
                            sqlType =
                                this.driver === "postgres" ? "JSONB"
                                    : this.driver === "sqlite" ? "TEXT"
                                        : "JSON";
                        }
                        else if (info.type === "Date" ||
                            (info.type === "string" && col.toLowerCase().endsWith("at"))) {
                            // Store date/timestamp columns as TEXT on SQLite (ISO-8601 strings)
                            // so sub-second precision is preserved and sorting still works.
                            sqlType =
                                this.driver === "sqlite" ? "TEXT"
                                    : this.driver === "postgres" ? "TIMESTAMPTZ"
                                        : "DATETIME";
                        }
                        else {
                            sqlType = (0, utils_js_1.tsTypeToSqlType)(info.type);
                            lengthVal = this.m(meta, "length");
                            if (lengthVal && /char|varchar/i.test(sqlType)) {
                                sqlType = sqlType.replace(/\(.+\)$/, "") + "(".concat(lengthVal, ")");
                            }
                        }
                        _z.label = 7;
                    case 7:
                        isNullableMeta = this.hasM(meta, "nullable");
                        isOptionalType = typeStr.includes("undefined");
                        isSoftDelete = this.hasM(meta, "softDelete");
                        isEnumNoDefault = !!enumVal && this.m(meta, "default") === undefined;
                        isUnique = this.hasM(meta, "unique");
                        isExplicitNotNull = this.hasM(meta, "not null") ||
                            this.hasM(meta, "notnull") ||
                            meta["not null"] === true ||
                            meta["notnull"] === true;
                        isNullable = void 0;
                        if (isUnique) {
                            isNullable = false;
                        }
                        else if (isExplicitNotNull) {
                            isNullable = false;
                        }
                        else {
                            isNullable = isNullableMeta || isOptionalType || isSoftDelete || isEnumNoDefault;
                        }
                        nullFrag = isNullable ? "" : "NOT NULL";
                        defaultClause = "";
                        defVal = this.m(meta, "default");
                        if (defVal !== undefined && defVal !== null) {
                            if (defVal === "CURRENT_TIMESTAMP") {
                                defaultClause =
                                    this.driver === "sqlite"
                                        ? "DEFAULT (datetime('now'))"
                                        : "DEFAULT CURRENT_TIMESTAMP";
                            }
                            else if (typeof defVal === "boolean") {
                                defaultClause = "DEFAULT ".concat(defVal ? 1 : 0);
                            }
                            else if (typeof defVal === "string") {
                                defaultClause = "DEFAULT '".concat(defVal, "'");
                            }
                            else {
                                defaultClause = "DEFAULT ".concat(defVal);
                            }
                        }
                        defaultFn = this.m(meta, "defaultFn");
                        if (defaultFn)
                            defaultClause = "DEFAULT ".concat(defaultFn);
                        jsonDefault = this.m(meta, "jsonDefault");
                        if (isJson && jsonDefault)
                            defaultClause = "DEFAULT '".concat(JSON.stringify(jsonDefault), "'");
                        if (isSoftDelete && !defaultClause)
                            defaultClause = "DEFAULT NULL";
                        if (this.hasM(meta, "onUpdateNow") && this.driver === "mysql") {
                            defaultClause = defaultClause
                                ? "".concat(defaultClause, " ON UPDATE CURRENT_TIMESTAMP")
                                : "ON UPDATE CURRENT_TIMESTAMP";
                        }
                        generatedAlways = this.m(meta, "generatedAlways");
                        generated = generatedAlways
                            ? "GENERATED ALWAYS AS (".concat(generatedAlways, ") STORED")
                            : "";
                        collateVal = this.m(meta, "collate");
                        collate = collateVal ? "COLLATE ".concat(collateVal) : "";
                        checkVal = this.m(meta, "check");
                        check = checkVal ? "CHECK (".concat(checkVal, ")") : "";
                        pkFragment = "";
                        if (this.hasM(meta, "auto") && !primaryDeclared) {
                            if (this.driver === "sqlite") {
                                sqlType = "INTEGER";
                                pkFragment = "PRIMARY KEY AUTOINCREMENT";
                            }
                            else if (this.driver === "postgres") {
                                sqlType = "SERIAL";
                                pkFragment = "PRIMARY KEY";
                            }
                            else {
                                sqlType = "INTEGER";
                                pkFragment = "AUTO_INCREMENT PRIMARY KEY";
                            }
                            primaryDeclared = true;
                        }
                        else if (this.m(meta, "primaryKey") === true && !primaryDeclared) {
                            pkFragment = "PRIMARY KEY";
                            primaryDeclared = true;
                        }
                        parts = [
                            "\"".concat(col, "\""),
                            sqlType,
                            pkFragment,
                            nullFrag,
                            defaultClause,
                            generated,
                            collate,
                            check,
                        ]
                            .filter(Boolean)
                            .join(" ");
                        colsSql.push(parts);
                        comment = this.m(meta, "comment");
                        if (comment && this.driver === "postgres") {
                            commentSql.push("COMMENT ON COLUMN \"".concat(table, "\".\"").concat(col, "\" IS '").concat(String(comment).replace(/'/g, "''"), "'"));
                        }
                        indexVal = this.m(meta, "index");
                        if (indexVal) {
                            indexStr = String(indexVal);
                            uniquePrefix = "";
                            whereClause = "";
                            if (indexStr.includes("unique") || indexStr.includes(":unique")) {
                                uniquePrefix = "UNIQUE ";
                            }
                            whereMatch = indexStr.match(/where:(.+)/i);
                            if (whereMatch) {
                                whereClause = " WHERE ".concat(whereMatch[1]);
                            }
                            indexSql.push("CREATE ".concat(uniquePrefix, "INDEX IF NOT EXISTS idx_").concat(table, "_").concat(col, " ON \"").concat(table, "\"(\"").concat(col, "\")").concat(whereClause));
                        }
                        // ---- UNIQUE CONSTRAINT ----------------------------------------
                        if (isUnique) {
                            if (!exists) {
                                inlineConstraints.push("CONSTRAINT unq_".concat(table, "_").concat(col, " UNIQUE (\"").concat(col, "\")"));
                            }
                            else {
                                postConstraints.push("ALTER TABLE \"".concat(table, "\" ADD CONSTRAINT unq_").concat(table, "_").concat(col, " UNIQUE (\"").concat(col, "\")"));
                            }
                        }
                        polyType = this.m(meta, "polymorphicType");
                        polyId = this.m(meta, "polymorphicId");
                        if (polyType && polyId) {
                            // These fields are handled by the relation system
                        }
                        fkRef = this.m(meta, "foreignKey");
                        if (fkRef) {
                            onDelete = this.m(meta, "onDelete");
                            onUpdate = this.m(meta, "onUpdate");
                            matchVal = this.m(meta, "match");
                            deferrable = this.hasM(meta, "deferrable");
                            fkStmt = "FOREIGN KEY (\"".concat(col, "\") REFERENCES \"").concat(fkRef, "\"(id)") +
                                (onDelete ? " ON DELETE ".concat(onDelete) : "") +
                                (onUpdate ? " ON UPDATE ".concat(onUpdate) : "") +
                                (matchVal ? " MATCH ".concat(matchVal) : "") +
                                (deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");
                            if (!exists)
                                inlineConstraints.push(fkStmt);
                            else
                                postConstraints.push("ALTER TABLE \"".concat(table, "\" ADD ").concat(fkStmt));
                        }
                        _z.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 2];
                    case 9:
                        if (!!exists) return [3 /*break*/, 11];
                        // Fallback PK: if no PK was declared and an `id` column exists,
                        // make it AUTOINCREMENT so SQLite last_insert_rowid() works reliably.
                        if (!primaryDeclared && this.driver === "sqlite") {
                            idIdx = colsSql.findIndex(function (c) { return c.startsWith('"id"'); });
                            if (idIdx >= 0) {
                                colsSql[idIdx] += " PRIMARY KEY AUTOINCREMENT";
                                primaryDeclared = true;
                            }
                        }
                        createSQL = "CREATE TABLE IF NOT EXISTS \"".concat(table, "\" (\n") +
                            colsSql.concat(inlineConstraints).join(",\n") +
                            "\n);";
                        return [4 /*yield*/, this.exec(createSQL)];
                    case 10:
                        _z.sent();
                        return [3 /*break*/, 30];
                    case 11: return [4 /*yield*/, this.getExistingColumns(table)];
                    case 12:
                        existingCols = _z.sent();
                        validCols = new Set(colsSql
                            .map(function (c) { var _a, _b; return (_b = (_a = c.match(/^"([^"]+)"/)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase(); })
                            .filter(Boolean));
                        _d = 0, existingCols_1 = existingCols;
                        _z.label = 13;
                    case 13:
                        if (!(_d < existingCols_1.length)) return [3 /*break*/, 18];
                        existingCol = existingCols_1[_d];
                        if (validCols.has(existingCol))
                            return [3 /*break*/, 17];
                        // Never drop timestamp / soft-delete columns automatically
                        if (["createdat", "updatedat", "deletedat"].includes(existingCol))
                            return [3 /*break*/, 17];
                        _z.label = 14;
                    case 14:
                        _z.trys.push([14, 16, , 17]);
                        return [4 /*yield*/, this.exec("ALTER TABLE \"".concat(table, "\" DROP COLUMN \"").concat(existingCol, "\""))];
                    case 15:
                        _z.sent();
                        return [3 /*break*/, 17];
                    case 16:
                        _e = _z.sent();
                        return [3 /*break*/, 17];
                    case 17:
                        _d++;
                        return [3 /*break*/, 13];
                    case 18:
                        _f = 0, _g = Object.entries(schema);
                        _z.label = 19;
                    case 19:
                        if (!(_f < _g.length)) return [3 /*break*/, 24];
                        _h = _g[_f], col = _h[0], info = _h[1];
                        renameVal = this.m(info === null || info === void 0 ? void 0 : info.meta, "rename");
                        if (!renameVal) return [3 /*break*/, 23];
                        oldName = String(renameVal).toLowerCase();
                        if (!(existingCols.includes(oldName) && !existingCols.includes(col.toLowerCase()))) return [3 /*break*/, 23];
                        _z.label = 20;
                    case 20:
                        _z.trys.push([20, 22, , 23]);
                        return [4 /*yield*/, this.exec("ALTER TABLE \"".concat(table, "\" RENAME COLUMN \"").concat(oldName, "\" TO \"").concat(col, "\""))];
                    case 21:
                        _z.sent();
                        return [3 /*break*/, 23];
                    case 22:
                        _j = _z.sent();
                        return [3 /*break*/, 23];
                    case 23:
                        _f++;
                        return [3 /*break*/, 19];
                    case 24:
                        _k = 0, colsSql_1 = colsSql;
                        _z.label = 25;
                    case 25:
                        if (!(_k < colsSql_1.length)) return [3 /*break*/, 30];
                        colDef = colsSql_1[_k];
                        m = colDef.match(/^"([^"]+)"/);
                        if (!m)
                            return [3 /*break*/, 29];
                        colName = m[1].toLowerCase();
                        if (existingCols.includes(colName))
                            return [3 /*break*/, 29];
                        safeColDef = colDef.replace(/\s+PRIMARY KEY(\s+AUTOINCREMENT)?/i, "");
                        if (this.driver === "sqlite" &&
                            /NOT NULL/i.test(safeColDef) &&
                            !/DEFAULT/i.test(safeColDef)) {
                            safeColDef = safeColDef.replace(/NOT NULL/i, "NOT NULL DEFAULT ''");
                        }
                        _z.label = 26;
                    case 26:
                        _z.trys.push([26, 28, , 29]);
                        return [4 /*yield*/, this.exec("ALTER TABLE \"".concat(table, "\" ADD COLUMN ").concat(safeColDef))];
                    case 27:
                        _z.sent();
                        return [3 /*break*/, 29];
                    case 28:
                        _l = _z.sent();
                        return [3 /*break*/, 29];
                    case 29:
                        _k++;
                        return [3 /*break*/, 25];
                    case 30:
                        this.processedTables.add(table);
                        _m = 0, commentSql_1 = commentSql;
                        _z.label = 31;
                    case 31:
                        if (!(_m < commentSql_1.length)) return [3 /*break*/, 36];
                        c = commentSql_1[_m];
                        _z.label = 32;
                    case 32:
                        _z.trys.push([32, 34, , 35]);
                        return [4 /*yield*/, this.exec(c)];
                    case 33:
                        _z.sent();
                        return [3 /*break*/, 35];
                    case 34:
                        _o = _z.sent();
                        return [3 /*break*/, 35];
                    case 35:
                        _m++;
                        return [3 /*break*/, 31];
                    case 36: return [4 /*yield*/, this.getExistingIndexes(table)];
                    case 37:
                        existingIndexes = _z.sent();
                        _p = 0, indexSql_1 = indexSql;
                        _z.label = 38;
                    case 38:
                        if (!(_p < indexSql_1.length)) return [3 /*break*/, 43];
                        idx = indexSql_1[_p];
                        idxName = (((_y = idx.match(/(?:idx_|unq_)[^\s]+/)) === null || _y === void 0 ? void 0 : _y[0]) || "").toLowerCase();
                        if (!idxName || existingIndexes.includes(idxName))
                            return [3 /*break*/, 42];
                        _z.label = 39;
                    case 39:
                        _z.trys.push([39, 41, , 42]);
                        return [4 /*yield*/, this.exec(idx)];
                    case 40:
                        _z.sent();
                        return [3 /*break*/, 42];
                    case 41:
                        _q = _z.sent();
                        return [3 /*break*/, 42];
                    case 42:
                        _p++;
                        return [3 /*break*/, 38];
                    case 43:
                        compositeIndexes = [];
                        _loop_1 = function (col, info) {
                            var indexVal = this_1.m(info === null || info === void 0 ? void 0 : info.meta, "index");
                            if (!indexVal)
                                return "continue";
                            var indexStr = String(indexVal);
                            var parenMatch = indexStr.match(/^\((.+)\)$/);
                            if (!parenMatch)
                                return "continue";
                            // This field defines a composite index: the field itself + other columns
                            var otherCols = parenMatch[1].split(",").map(function (c) { return c.trim(); }).filter(Boolean);
                            var allCols = __spreadArray([col], otherCols.filter(function (c) { return c !== col; }), true);
                            var unique = indexStr.includes("unique") || indexStr.includes(":unique");
                            var whereMatch = indexStr.match(/where:(.+)/i);
                            compositeIndexes.push({
                                cols: allCols,
                                unique: unique,
                                where: whereMatch ? whereMatch[1] : undefined,
                            });
                        };
                        this_1 = this;
                        for (_r = 0, _s = Object.entries(schema); _r < _s.length; _r++) {
                            _t = _s[_r], col = _t[0], info = _t[1];
                            _loop_1(col, info);
                        }
                        _u = 0, compositeIndexes_1 = compositeIndexes;
                        _z.label = 44;
                    case 44:
                        if (!(_u < compositeIndexes_1.length)) return [3 /*break*/, 49];
                        ci = compositeIndexes_1[_u];
                        idxName = "idx_".concat(table, "_").concat(ci.cols.join("_")).toLowerCase();
                        if (existingIndexes.includes(idxName))
                            return [3 /*break*/, 48];
                        uniquePrefix = ci.unique ? "UNIQUE " : "";
                        whereClause = ci.where ? " WHERE ".concat(ci.where) : "";
                        cols = ci.cols.map(function (c) { return "\"".concat(c, "\""); }).join(", ");
                        _z.label = 45;
                    case 45:
                        _z.trys.push([45, 47, , 48]);
                        return [4 /*yield*/, this.exec("CREATE ".concat(uniquePrefix, "INDEX IF NOT EXISTS \"").concat(idxName, "\" ON \"").concat(table, "\"(").concat(cols, ")").concat(whereClause))];
                    case 46:
                        _z.sent();
                        return [3 /*break*/, 48];
                    case 47:
                        _v = _z.sent();
                        return [3 /*break*/, 48];
                    case 48:
                        _u++;
                        return [3 /*break*/, 44];
                    case 49:
                        if (!(relations === null || relations === void 0 ? void 0 : relations.length)) return [3 /*break*/, 52];
                        return [4 /*yield*/, this.getExistingFKs(table)];
                    case 50:
                        existingFKs_1 = _z.sent();
                        return [4 /*yield*/, Promise.all(relations.map(function (rel) { return __awaiter(_this, void 0, void 0, function () {
                                var fkCol, refTable, onDelete, onUpdate, matchVal, deferrable, fkStatement, uniqueStatement, _a, _b;
                                var _c, _d, _e, _f;
                                return __generator(this, function (_g) {
                                    switch (_g.label) {
                                        case 0:
                                            fkCol = rel.foreignKey;
                                            refTable = String(rel.targetModel || "").toLowerCase();
                                            if (!fkCol || !refTable)
                                                return [2 /*return*/];
                                            return [4 /*yield*/, this.tableExists(refTable)];
                                        case 1:
                                            if (!(_g.sent()))
                                                return [2 /*return*/];
                                            onDelete = (_c = rel.meta) === null || _c === void 0 ? void 0 : _c.onDelete;
                                            onUpdate = (_d = rel.meta) === null || _d === void 0 ? void 0 : _d.onUpdate;
                                            matchVal = (_e = rel.meta) === null || _e === void 0 ? void 0 : _e.match;
                                            deferrable = (_f = rel.meta) === null || _f === void 0 ? void 0 : _f.deferrable;
                                            fkStatement = "ALTER TABLE \"".concat(table, "\" ADD FOREIGN KEY (\"").concat(fkCol, "\") REFERENCES \"").concat(refTable, "\"(id)") +
                                                (onDelete ? " ON DELETE ".concat(onDelete) : "") +
                                                (onUpdate ? " ON UPDATE ".concat(onUpdate) : "") +
                                                (matchVal ? " MATCH ".concat(matchVal) : "") +
                                                (deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");
                                            uniqueStatement = rel.kind === "onetoone" && this.driver !== "sqlite"
                                                ? "ALTER TABLE \"".concat(table, "\" ADD CONSTRAINT unique_").concat(table, "_").concat(fkCol, " UNIQUE (\"").concat(fkCol, "\")")
                                                : null;
                                            if (!!existingFKs_1.includes(fkStatement.toLowerCase())) return [3 /*break*/, 5];
                                            _g.label = 2;
                                        case 2:
                                            _g.trys.push([2, 4, , 5]);
                                            return [4 /*yield*/, this.exec(fkStatement)];
                                        case 3:
                                            _g.sent();
                                            return [3 /*break*/, 5];
                                        case 4:
                                            _a = _g.sent();
                                            return [3 /*break*/, 5];
                                        case 5:
                                            if (!(uniqueStatement &&
                                                !existingFKs_1.includes(uniqueStatement.toLowerCase()))) return [3 /*break*/, 9];
                                            _g.label = 6;
                                        case 6:
                                            _g.trys.push([6, 8, , 9]);
                                            return [4 /*yield*/, this.exec(uniqueStatement)];
                                        case 7:
                                            _g.sent();
                                            return [3 /*break*/, 9];
                                        case 8:
                                            _b = _g.sent();
                                            return [3 /*break*/, 9];
                                        case 9: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 51:
                        _z.sent();
                        _z.label = 52;
                    case 52: return [4 /*yield*/, this.getExistingFKs(table)];
                    case 53:
                        existingFKsNow = _z.sent();
                        _w = 0, postConstraints_1 = postConstraints;
                        _z.label = 54;
                    case 54:
                        if (!(_w < postConstraints_1.length)) return [3 /*break*/, 59];
                        fk = postConstraints_1[_w];
                        if (existingFKsNow.includes(fk.toLowerCase()))
                            return [3 /*break*/, 58];
                        _z.label = 55;
                    case 55:
                        _z.trys.push([55, 57, , 58]);
                        return [4 /*yield*/, this.exec(fk)];
                    case 56:
                        _z.sent();
                        return [3 /*break*/, 58];
                    case 57:
                        _x = _z.sent();
                        return [3 /*break*/, 58];
                    case 58:
                        _w++;
                        return [3 /*break*/, 54];
                    case 59: return [2 /*return*/];
                }
            });
        });
    };
    // ----------------------------------------------------------------
    // applyDefaults — back-fill NULL values for columns that have a
    // non-null default. Skips tables with no defaults.
    // ----------------------------------------------------------------
    Migrator.prototype.applyDefaults = function (table, schema) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, col, info, def, value, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _i = 0, _a = Object.entries(schema);
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        _b = _a[_i], col = _b[0], info = _b[1];
                        def = this.m(info.meta, "default");
                        if (def === undefined || def === null)
                            return [3 /*break*/, 5];
                        value = void 0;
                        if (def === "CURRENT_TIMESTAMP") {
                            value =
                                this.driver === "sqlite"
                                    ? "strftime('%s','now')"
                                    : "CURRENT_TIMESTAMP";
                        }
                        else if (typeof def === "boolean") {
                            value = def ? 1 : 0;
                        }
                        else if (typeof def === "string") {
                            value = "'".concat(def, "'");
                        }
                        else {
                            value = def;
                        }
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.exec("UPDATE \"".concat(table, "\" SET \"").concat(col, "\" = ").concat(value, " WHERE \"").concat(col, "\" IS NULL"))];
                    case 3:
                        _d.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _c = _d.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    // ----------------------------------------------------------------
    // Enum helpers
    // ----------------------------------------------------------------
    Migrator.prototype.parseEnumValues = function (enumMeta) {
        var cleaned = String(enumMeta).replace(/^[\(\s]+|[\)\s]+$/g, "");
        return cleaned.split(",").map(function (v) { return v.trim().replace(/^'|'$/g, ""); });
    };
    Migrator.prototype.createEnumColumn = function (table, col, values) {
        return __awaiter(this, void 0, void 0, function () {
            var typeName, res, vals, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.driver !== "postgres")
                            return [2 /*return*/, "\"".concat(table, "_").concat(col, "_enum\"")];
                        typeName = "".concat(table, "_").concat(col, "_enum");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.exec("SELECT 1 FROM pg_type WHERE typname = $1", [typeName])];
                    case 2:
                        res = (_c.sent());
                        if (!!((_b = res.rows) === null || _b === void 0 ? void 0 : _b.length)) return [3 /*break*/, 4];
                        vals = values
                            .map(function (v) { return "'".concat(v.replace(/'/g, "''"), "'"); })
                            .join(", ");
                        return [4 /*yield*/, this.exec("CREATE TYPE \"".concat(typeName, "\" AS ENUM (").concat(vals, ")"))];
                    case 3:
                        _c.sent();
                        _c.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        _a = _c.sent();
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/, "\"".concat(typeName, "\"")];
                }
            });
        });
    };
    // ----------------------------------------------------------------
    // diffSchema — dry-run: returns the SQL statements that would be
    // executed without applying them.
    // ----------------------------------------------------------------
    Migrator.prototype.diffSchema = function (table_1, schema_1, relations_1) {
        return __awaiter(this, arguments, void 0, function (table, schema, relations, dryRun) {
            var statements, tableLower, exists, colsSql, inlineConstraints, _i, _a, _b, col, info, colDef, existingCols, _c, _d, _e, col, info, colName, colDef;
            if (dryRun === void 0) { dryRun = false; }
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        statements = [];
                        tableLower = table.toLowerCase();
                        return [4 /*yield*/, this.tableExists(tableLower)];
                    case 1:
                        exists = _f.sent();
                        if (!!exists) return [3 /*break*/, 6];
                        colsSql = [];
                        inlineConstraints = [];
                        _i = 0, _a = Object.entries(schema);
                        _f.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        _b = _a[_i], col = _b[0], info = _b[1];
                        if (!(info === null || info === void 0 ? void 0 : info.type))
                            return [3 /*break*/, 4];
                        if (this.isRelationPlaceholder(info))
                            return [3 /*break*/, 4];
                        return [4 /*yield*/, this._buildColumnDef(tableLower, col, info, false)];
                    case 3:
                        colDef = _f.sent();
                        if (colDef)
                            colsSql.push(colDef);
                        _f.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        if (colsSql.length) {
                            statements.push("CREATE TABLE IF NOT EXISTS \"".concat(tableLower, "\" (\n").concat(colsSql.concat(inlineConstraints).join(",\n"), "\n);"));
                        }
                        return [3 /*break*/, 11];
                    case 6: return [4 /*yield*/, this.getExistingColumns(tableLower)];
                    case 7:
                        existingCols = _f.sent();
                        _c = 0, _d = Object.entries(schema);
                        _f.label = 8;
                    case 8:
                        if (!(_c < _d.length)) return [3 /*break*/, 11];
                        _e = _d[_c], col = _e[0], info = _e[1];
                        if (!(info === null || info === void 0 ? void 0 : info.type))
                            return [3 /*break*/, 10];
                        if (this.isRelationPlaceholder(info))
                            return [3 /*break*/, 10];
                        colName = col.toLowerCase();
                        if (!!existingCols.includes(colName)) return [3 /*break*/, 10];
                        return [4 /*yield*/, this._buildColumnDef(tableLower, col, info, true)];
                    case 9:
                        colDef = _f.sent();
                        if (colDef)
                            statements.push("ALTER TABLE \"".concat(tableLower, "\" ADD COLUMN ").concat(colDef, ";"));
                        _f.label = 10;
                    case 10:
                        _c++;
                        return [3 /*break*/, 8];
                    case 11:
                        if (!dryRun)
                            return [2 /*return*/, []];
                        return [2 /*return*/, statements];
                }
            });
        });
    };
    Migrator.prototype._buildColumnDef = function (table, col, info, forAlter) {
        return __awaiter(this, void 0, void 0, function () {
            var meta, sqlType, enumVal, isJson, enumValues;
            return __generator(this, function (_a) {
                meta = info.meta || {};
                sqlType = "";
                enumVal = this.m(meta, "enum");
                isJson = this.hasM(meta, "json");
                if (enumVal) {
                    enumValues = this.parseEnumValues(String(enumVal));
                    sqlType = this.driver === "postgres" ? "\"".concat(table, "_").concat(col, "_enum\"") : "VARCHAR(255)";
                }
                else if (isJson) {
                    sqlType = this.driver === "postgres" ? "JSONB" : this.driver === "sqlite" ? "TEXT" : "JSON";
                }
                else if (info.type === "Date" || (info.type === "string" && col.toLowerCase().endsWith("at"))) {
                    sqlType = this.driver === "sqlite" ? "TEXT" : this.driver === "postgres" ? "TIMESTAMPTZ" : "DATETIME";
                }
                else {
                    sqlType = (0, utils_js_1.tsTypeToSqlType)(info.type);
                }
                if (!sqlType)
                    return [2 /*return*/, null];
                return [2 /*return*/, "\"".concat(col, "\" ").concat(sqlType)];
            });
        });
    };
    // ----------------------------------------------------------------
    // Introspection helpers
    // ----------------------------------------------------------------
    Migrator.prototype.tableExists = function (table) {
        return __awaiter(this, void 0, void 0, function () {
            var query, params, res;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        query = "";
                        params = [];
                        switch (this.driver) {
                            case "sqlite":
                                query = "SELECT name FROM sqlite_master WHERE type='table' AND name='".concat(table, "'");
                                break;
                            case "postgres":
                                query = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename=$1";
                                params = [table];
                                break;
                            case "mysql":
                                query = "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?";
                                params = [table];
                                break;
                        }
                        return [4 /*yield*/, this.exec(query, params)];
                    case 1:
                        res = _c.sent();
                        return [2 /*return*/, ((_b = (_a = res.rows) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0];
                }
            });
        });
    };
    Migrator.prototype.getExistingColumns = function (table) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 1];
                            case "postgres": return [3 /*break*/, 3];
                            case "mysql": return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.exec("PRAGMA table_info(\"".concat(table, "\")"))];
                    case 2:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) { return String(r.name).toLowerCase(); })];
                    case 3: return [4 /*yield*/, this.exec("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])];
                    case 4:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.column_name).toLowerCase();
                            })];
                    case 5: return [4 /*yield*/, this.exec("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?", [table])];
                    case 6:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.column_name).toLowerCase();
                            })];
                    case 7: return [2 /*return*/, []];
                }
            });
        });
    };
    Migrator.prototype.getExistingIndexes = function (table) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 1];
                            case "postgres": return [3 /*break*/, 3];
                            case "mysql": return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='".concat(table, "'"))];
                    case 2:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) { return String(r.name).toLowerCase(); })];
                    case 3: return [4 /*yield*/, this.exec("SELECT indexname FROM pg_indexes WHERE tablename=$1", [table])];
                    case 4:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.indexname).toLowerCase();
                            })];
                    case 5: return [4 /*yield*/, this.exec("SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?", [table])];
                    case 6:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.index_name).toLowerCase();
                            })];
                    case 7: return [2 /*return*/, []];
                }
            });
        });
    };
    Migrator.prototype.getExistingFKs = function (table) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this.driver;
                        switch (_a) {
                            case "sqlite": return [3 /*break*/, 1];
                            case "postgres": return [3 /*break*/, 3];
                            case "mysql": return [3 /*break*/, 5];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.exec("PRAGMA foreign_key_list(\"".concat(table, "\")"))];
                    case 2:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return JSON.stringify(r).toLowerCase();
                            })];
                    case 3: return [4 /*yield*/, this.exec("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'", [table])];
                    case 4:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.constraint_name).toLowerCase();
                            })];
                    case 5: return [4 /*yield*/, this.exec("SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'", [table])];
                    case 6:
                        res = _b.sent();
                        return [2 /*return*/, (res.rows || []).map(function (r) {
                                return String(r.constraint_name).toLowerCase();
                            })];
                    case 7: return [2 /*return*/, []];
                }
            });
        });
    };
    return Migrator;
}());
exports.Migrator = Migrator;
