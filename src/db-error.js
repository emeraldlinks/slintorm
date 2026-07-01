"use strict";
// ==== ORM DATABASE ERROR ====
// Wraps raw driver errors into readable, actionable messages.
// Works for SQLite, Postgres, and MySQL.
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
exports.ORMError = void 0;
exports.parseConstraintError = parseConstraintError;
exports.wrapExec = wrapExec;
var ORMError = /** @class */ (function (_super) {
    __extends(ORMError, _super);
    function ORMError(message, meta, original) {
        var _this = _super.call(this, message) || this;
        _this.name = "ORMError";
        _this.ormCode = meta.code;
        _this.table = meta.table;
        _this.column = meta.column;
        _this.value = meta.value;
        _this.sql = meta.sql;
        _this.params = meta.params;
        _this.original = original;
        return _this;
    }
    return ORMError;
}(Error));
exports.ORMError = ORMError;
// ----------------------------------------------------------------
// extractColIndexFromSql
// Parses the column list from an INSERT/UPDATE statement and returns
// the zero-based index of the named column so we can pull its value
// from the params array.
//
// INSERT INTO "users" ("name", "email", "createdAt") VALUES (?, ?, ?)
//                      ^^^^^^  ^^^^^^^  ^^^^^^^^^^^
// ----------------------------------------------------------------
function extractColIndexFromSql(sql, column) {
    // Match column list between the first pair of parens before VALUES
    var colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    if (!colMatch)
        return -1;
    var cols = colMatch[1]
        .split(",")
        .map(function (c) { return c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase(); });
    return cols.findIndex(function (c) { return c === column.toLowerCase(); });
}
// ----------------------------------------------------------------
// extractTableCol
// Parses table and column names out of driver error messages.
// ----------------------------------------------------------------
function extractTableCol(msg, driver, kind) {
    var _a;
    // ---- SQLite -------------------------------------------------------
    // All constraint types: "CONSTRAINT failed: tablename.columnname"
    // FK is the exception — no table.column in the message.
    if (driver === "sqlite") {
        var m = msg.match(/failed:\s+([a-z0-9_]+)\.([a-z0-9_]+)/i);
        if (m)
            return { table: m[1], column: m[2] };
        return {};
    }
    // ---- Postgres -----------------------------------------------------
    if (driver === "postgres") {
        switch (kind) {
            case "unique": {
                // 'duplicate key value violates unique constraint "unq_users_email"'
                // DETAIL: 'Key (email)=(jj@test.com) already exists.'
                var col = msg.match(/Key\s*\(([^)]+)\)\s*=/i);
                var tbl = (_a = msg.match(/on table\s+"([^"]+)"/i)) !== null && _a !== void 0 ? _a : msg.match(/relation\s+"([^"]+)"/i);
                return { table: tbl === null || tbl === void 0 ? void 0 : tbl[1], column: col === null || col === void 0 ? void 0 : col[1] };
            }
            case "notnull": {
                // 'null value in column "name" of relation "users" violates not-null constraint'
                var m = msg.match(/column\s+"([^"]+)"\s+of\s+relation\s+"([^"]+)"/i);
                return { table: m === null || m === void 0 ? void 0 : m[2], column: m === null || m === void 0 ? void 0 : m[1] };
            }
            case "fk": {
                // 'insert or update on table "post" violates foreign key constraint ...'
                // DETAIL: 'Key (userId)=(999) is not present in table "users".'
                var tbl = msg.match(/on table\s+"([^"]+)"/i);
                var col = msg.match(/Key\s*\(([^)]+)\)\s*=/i);
                return { table: tbl === null || tbl === void 0 ? void 0 : tbl[1], column: col === null || col === void 0 ? void 0 : col[1] };
            }
            case "check": {
                // 'new row for relation "users" violates check constraint "..."'
                var tbl = msg.match(/relation\s+"([^"]+)"/i);
                return { table: tbl === null || tbl === void 0 ? void 0 : tbl[1] };
            }
        }
    }
    // ---- MySQL --------------------------------------------------------
    if (driver === "mysql") {
        switch (kind) {
            case "unique": {
                // "Duplicate entry 'val' for key 'table.index_name'"
                // index_name is usually the column name or uniq_table_col
                var m = msg.match(/for key\s+'([^.]+)\.([^']+)'/i);
                if (m)
                    return { table: m[1], column: m[2] };
                // fallback: "for key 'index_name'" without table prefix
                var m2 = msg.match(/for key\s+'([^']+)'/i);
                return { column: m2 === null || m2 === void 0 ? void 0 : m2[1] };
            }
            case "notnull": {
                // "Column 'name' cannot be null"
                var m = msg.match(/Column\s+'([^']+)'\s+cannot\s+be\s+null/i);
                return { column: m === null || m === void 0 ? void 0 : m[1] };
            }
            case "fk": {
                // "Cannot add or update a child row: a foreign key constraint fails
                //  (`db`.`post`, CONSTRAINT `fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`))"
                var col = msg.match(/FOREIGN\s+KEY\s+\(`([^`]+)`\)/i);
                var tbl = msg.match(/REFERENCES\s+`([^`]+)`/i);
                return { table: tbl === null || tbl === void 0 ? void 0 : tbl[1], column: col === null || col === void 0 ? void 0 : col[1] };
            }
            case "check": {
                // "Check constraint 'chk_name' is violated."
                return {};
            }
        }
    }
    return {};
}
// ----------------------------------------------------------------
// extractValue
// Pulls the offending value from the error message (Postgres/MySQL)
// or from the params array using the SQL column list (SQLite/all).
// ----------------------------------------------------------------
function extractValue(msg, driver, params, column, sql) {
    // Postgres DETAIL line: Key (col)=(value) already exists.
    if (driver === "postgres") {
        var m = msg.match(/Key\s*\([^)]+\)\s*=\s*\(([^)]+)\)/i);
        if (m)
            return m[1];
    }
    // MySQL: Duplicate entry 'value' for key ...
    if (driver === "mysql") {
        var m = msg.match(/Duplicate entry\s+'([^']+)'/i);
        if (m)
            return m[1];
    }
    // SQLite (and fallback for all drivers): match column position in SQL
    // so we can pull the right param from the params array.
    if (column && sql && (params === null || params === void 0 ? void 0 : params.length)) {
        var idx = extractColIndexFromSql(sql, column);
        if (idx >= 0 && idx < params.length)
            return params[idx];
    }
    // Last resort for single-param queries
    if ((params === null || params === void 0 ? void 0 : params.length) === 1)
        return params[0];
    return undefined;
}
// ----------------------------------------------------------------
// formatWhere — builds the "in table X, column Y" suffix
// ----------------------------------------------------------------
function formatWhere(table, column) {
    var parts = [];
    if (table)
        parts.push("table \"".concat(table, "\""));
    if (column)
        parts.push("column \"".concat(column, "\""));
    return parts.length ? " in ".concat(parts.join(", ")) : "";
}
// ----------------------------------------------------------------
// parseConstraintError
// Converts a raw driver error into an ORMError with a readable
// message. Returns null for non-constraint errors (caller re-throws).
// ----------------------------------------------------------------
function parseConstraintError(err, driver, sql, params) {
    if (!(err instanceof Error))
        return null;
    var msg = err.message || "";
    var raw = err;
    var code = raw.code;
    var errno = raw.errno;
    // ---- UNIQUE -------------------------------------------------------
    if ((driver === "sqlite" && (code === "SQLITE_CONSTRAINT" || errno === 19) && /UNIQUE constraint failed/i.test(msg)) ||
        (driver === "postgres" && (code === "23505" || /duplicate key value/i.test(msg))) ||
        (driver === "mysql" && (code === "ER_DUP_ENTRY" || errno === 1062))) {
        var _a = extractTableCol(msg, driver, "unique"), table = _a.table, column = _a.column;
        var value = extractValue(msg, driver, params, column, sql);
        return new ORMError("Duplicate value".concat(formatWhere(table, column), " \u2014 a record with this ").concat(column ? "\"".concat(column, "\"") : "value", " already exists.") +
            (value !== undefined ? "\n  Conflicting value: ".concat(JSON.stringify(value)) : "") +
            "\n  Tip: check what you are inserting/updating".concat(column ? " for field \"".concat(column, "\"") : "", " and ensure it is unique."), { code: "UNIQUE_VIOLATION", table: table, column: column, value: value, sql: sql, params: params }, err);
    }
    // ---- NOT NULL -----------------------------------------------------
    if ((driver === "sqlite" && /NOT NULL constraint failed/i.test(msg)) ||
        (driver === "postgres" && (code === "23502" || /not-null constraint/i.test(msg))) ||
        (driver === "mysql" && (code === "ER_BAD_NULL_ERROR" || errno === 1048))) {
        var _b = extractTableCol(msg, driver, "notnull"), table = _b.table, column = _b.column;
        var value = extractValue(msg, driver, params, column, sql);
        return new ORMError("Missing required value".concat(formatWhere(table, column), " \u2014 field \"").concat(column !== null && column !== void 0 ? column : "unknown", "\" cannot be null or empty.") +
            (value !== undefined ? "\n  Provided value: ".concat(JSON.stringify(value)) : "") +
            "\n  Tip: make sure you are providing a value for \"".concat(column !== null && column !== void 0 ? column : "this field", "\" before saving."), { code: "NOT_NULL_VIOLATION", table: table, column: column, value: value, sql: sql, params: params }, err);
    }
    // ---- FOREIGN KEY --------------------------------------------------
    if ((driver === "sqlite" && /FOREIGN KEY constraint failed/i.test(msg)) ||
        (driver === "postgres" && (code === "23503" || /foreign key constraint/i.test(msg))) ||
        (driver === "mysql" && (code === "ER_NO_REFERENCED_ROW_2" || errno === 1452))) {
        var _c = extractTableCol(msg, driver, "fk"), table = _c.table, column = _c.column;
        var value = extractValue(msg, driver, params, column, sql);
        return new ORMError("Invalid reference".concat(formatWhere(table, column), " \u2014 the related record does not exist.") +
            (value !== undefined ? "\n  Attempted reference value: ".concat(JSON.stringify(value)) : "") +
            "\n  Tip: ensure the referenced record exists before linking to it.", { code: "FOREIGN_KEY_VIOLATION", table: table, column: column, value: value, sql: sql, params: params }, err);
    }
    // ---- CHECK --------------------------------------------------------
    if ((driver === "sqlite" && /CHECK constraint failed/i.test(msg)) ||
        (driver === "postgres" && code === "23514") ||
        (driver === "mysql" && (code === "ER_CHECK_CONSTRAINT_VIOLATED" || errno === 3819))) {
        var _d = extractTableCol(msg, driver, "check"), table = _d.table, column = _d.column;
        var value = extractValue(msg, driver, params, column, sql);
        return new ORMError("Value rejected by CHECK constraint".concat(formatWhere(table, column), " \u2014 the value you provided is not allowed.") +
            (value !== undefined ? "\n  Rejected value: ".concat(JSON.stringify(value)) : "") +
            "\n  Tip: verify the allowed values for \"".concat(column !== null && column !== void 0 ? column : "this field", "\" (e.g. enum options)."), { code: "CHECK_VIOLATION", table: table, column: column, value: value, sql: sql, params: params }, err);
    }
    return null; // not a constraint error we recognise — caller re-throws
}
// ----------------------------------------------------------------
// wrapExec
// Drop-in wrapper around your exec function. Pass the wrapped version
// to the Migrator, model factory, and query builder instead of the
// raw exec — all constraint errors will then throw ORMError.
//
// Usage (in index.ts / ORMManager constructor):
//   this.adapter.exec = wrapExec(this.adapter.exec.bind(this.adapter), sqlDriver);
// ----------------------------------------------------------------
function wrapExec(exec, driver) {
    var _this = this;
    return function (sql, params) { return __awaiter(_this, void 0, void 0, function () {
        var err_1, ormErr;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, exec(sql, params)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    err_1 = _a.sent();
                    ormErr = parseConstraintError(err_1, driver, sql, params);
                    if (ormErr)
                        throw ormErr;
                    throw err_1; // re-throw unrecognised errors unchanged
                case 3: return [2 /*return*/];
            }
        });
    }); };
}
