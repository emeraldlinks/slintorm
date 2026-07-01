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
exports.Validator = exports.ValidationError = exports.ExtendedQueryBuilder = exports.SoftDeleteQueryBuilder = void 0;
var extra_clauses_js_1 = require("./extra_clauses.js");
// ============================================================
// SOFT DELETE
// ============================================================
var SoftDeleteQueryBuilder = /** @class */ (function (_super) {
    __extends(SoftDeleteQueryBuilder, _super);
    function SoftDeleteQueryBuilder() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._withTrashed = false;
        _this._onlyTrashed = false;
        return _this;
    }
    Object.defineProperty(SoftDeleteQueryBuilder.prototype, "hasSoftDelete", {
        get: function () {
            var _a, _b, _c;
            return "deletedAt" in ((_c = (_b = (_a = this.schema) === null || _a === void 0 ? void 0 : _a[this.modelName]) === null || _b === void 0 ? void 0 : _b.fields) !== null && _c !== void 0 ? _c : {});
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Include soft-deleted rows in results.
     * @example Users.query().withTrashed().get()
     */
    SoftDeleteQueryBuilder.prototype.withTrashed = function () {
        this._withTrashed = true;
        this._onlyTrashed = false;
        return this;
    };
    /**
     * Return only soft-deleted rows.
     * @example Users.query().onlyTrashed().get()
     */
    SoftDeleteQueryBuilder.prototype.onlyTrashed = function () {
        this._onlyTrashed = true;
        this._withTrashed = false;
        return this;
    };
    SoftDeleteQueryBuilder.prototype.buildSql = function () {
        if (this.hasSoftDelete) {
            if (this._onlyTrashed) {
                this._where.push({ column: "deletedAt", kind: "notnull" });
            }
            else if (!this._withTrashed) {
                this._where.push({ column: "deletedAt", kind: "null" });
            }
        }
        var result = _super.prototype.buildSql.call(this);
        this._where = this._where.filter(function (w) { return !(w.column === "deletedAt" && (w.kind === "null" || w.kind === "notnull")); });
        return result;
    };
    return SoftDeleteQueryBuilder;
}(extra_clauses_js_1.AdvancedQueryBuilder));
exports.SoftDeleteQueryBuilder = SoftDeleteQueryBuilder;
// ============================================================
// EXTENDED QUERY BUILDER — top of chain, used by model.query()
// ============================================================
var ExtendedQueryBuilder = /** @class */ (function (_super) {
    __extends(ExtendedQueryBuilder, _super);
    function ExtendedQueryBuilder() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this._scopes = [];
        _this._appliedScopes = false;
        return _this;
    }
    /**
     * Apply a reusable query fragment.
     * @example Users.query().scope(qb => qb.where("status","=","active")).get()
     */
    ExtendedQueryBuilder.prototype.scope = function (fn) {
        this._scopes.push(fn);
        return this;
    };
    ExtendedQueryBuilder.prototype.applyScopes = function () {
        if (this._appliedScopes)
            return;
        this._appliedScopes = true;
        for (var _i = 0, _a = this._scopes; _i < _a.length; _i++) {
            var s = _a[_i];
            s(this);
        }
    };
    ExtendedQueryBuilder.prototype.buildSql = function () {
        this.applyScopes();
        return _super.prototype.buildSql.call(this);
    };
    ExtendedQueryBuilder.prototype.get = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.applyScopes();
                return [2 /*return*/, _super.prototype.get.call(this)];
            });
        });
    };
    ExtendedQueryBuilder.prototype.first = function (condition) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.applyScopes();
                return [2 /*return*/, _super.prototype.first.call(this, condition)];
            });
        });
    };
    return ExtendedQueryBuilder;
}(SoftDeleteQueryBuilder));
exports.ExtendedQueryBuilder = ExtendedQueryBuilder;
var ValidationError = /** @class */ (function (_super) {
    __extends(ValidationError, _super);
    function ValidationError(errors) {
        var _this = _super.call(this, "Validation failed: " + Object.values(errors).join("; ")) || this;
        _this.errors = errors;
        _this.name = "ValidationError";
        return _this;
    }
    return ValidationError;
}(Error));
exports.ValidationError = ValidationError;
var Validator = /** @class */ (function () {
    function Validator(rules) {
        this.rules = rules;
    }
    Validator.prototype.validate = function (data) {
        var errors = {};
        for (var _i = 0, _a = Object.entries(this.rules); _i < _a.length; _i++) {
            var _b = _a[_i], field = _b[0], rules = _b[1];
            if (!rules)
                continue;
            var value = data[field];
            if (rules.required && (value === undefined || value === null || value === "")) {
                errors[field] = "".concat(field, " is required");
                continue;
            }
            if (value === undefined || value === null)
                continue;
            if (rules.minLength !== undefined && typeof value === "string" && value.length < rules.minLength)
                errors[field] = "".concat(field, " must be at least ").concat(rules.minLength, " characters");
            if (rules.maxLength !== undefined && typeof value === "string" && value.length > rules.maxLength)
                errors[field] = "".concat(field, " must be at most ").concat(rules.maxLength, " characters");
            if (rules.min !== undefined && typeof value === "number" && value < rules.min)
                errors[field] = "".concat(field, " must be at least ").concat(rules.min);
            if (rules.max !== undefined && typeof value === "number" && value > rules.max)
                errors[field] = "".concat(field, " must be at most ").concat(rules.max);
            if (rules.email && typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                errors[field] = "".concat(field, " must be a valid email");
            if (rules.match && typeof value === "string" && !rules.match.test(value))
                errors[field] = "".concat(field, " format is invalid");
            if (rules.custom) {
                var msg = rules.custom(value, data);
                if (msg)
                    errors[field] = msg;
            }
        }
        if (Object.keys(errors).length)
            throw new ValidationError(errors);
    };
    Validator.prototype.check = function (data) {
        try {
            this.validate(data);
            return null;
        }
        catch (err) {
            if (err instanceof ValidationError)
                return err.errors;
            throw err;
        }
    };
    return Validator;
}());
exports.Validator = Validator;
