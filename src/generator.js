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
exports.default = generateSchema;
/**
 * ORM Schema Generator
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */
var fs = require("fs");
var path = require("node:path");
var crypto_1 = require("crypto");
/**
 * TypeScript keywords that the tokenizer promotes out of 'identifier' but are
 * perfectly legal as property / field names inside an interface body.
 * e.g.  type: string;  export: boolean;  in: number;
 */
var KEYWORD_AS_IDENTIFIER = new Set([
    'type',
    'export',
    'interface',
    'extends',
    'as',
    'in',
]);
/**
 * Token types that CANNOT be used as property names without breaking the
 * generator's parser.  If one of these appears where a field name is expected
 * the generator will log a clear warning and skip the field rather than
 * silently producing corrupt output.
 *
 * What you can do if you hit one of these:
 *   • Rename the property to a plain identifier  (recommended)
 *   • Wrap it in quotes: `"default": string`  — note that quoted keys are NOT
 *     currently supported by this generator, so you must rename the field.
 *
 * Affected token types and example property names that would trigger this:
 *   'colon'        →  would produce  :: string  (unparseable)
 *   'semicolon'    →  would produce  ;: string  (unparseable)
 *   'comma'        →  would produce  ,: string  (unparseable)
 *   'equals'       →  would produce  =: string  (unparseable)
 *   'pipe'         →  would produce  |: string  (unparseable)
 *   'at'           →  would produce  @: string  (conflicts with decorator syntax)
 *   'dot'          →  would produce  .: string  (unparseable)
 *   'brace-open'   →  { as a field name (unparseable)
 *   'brace-close'  →  } as a field name (signals end of interface)
 *   'bracket-open' →  [ as a field name (index-signature syntax, not supported)
 *   'bracket-close'→  ] as a field name (unparseable)
 *   'angle-open'   →  < as a field name (unparseable)
 *   'angle-close'  →  > as a field name (unparseable)
 *   'question'     →  ? as a field name (conflicts with optional marker)
 *   'string'       →  "foo": string  (quoted key — not supported, rename field)
 *   'number'       →  123: string   (numeric key — not supported, rename field)
 *   'newline'      →  (whitespace — not a real field name)
 *   'whitespace'   →  (whitespace — not a real field name)
 *   'comment-line' →  (comment — not a real field name)
 *   'comment-block'→  (comment — not a real field name)
 *   'template-literal' → `foo`: string  (computed key — not supported)
 */
var BREAKING_KEYWORDS = new Set([
    'colon', 'semicolon', 'comma', 'equals', 'pipe', 'at', 'dot',
    'brace-open', 'brace-close', 'bracket-open', 'bracket-close',
    'angle-open', 'angle-close', 'question',
    'string', 'number',
    'newline', 'whitespace',
    'comment-line', 'comment-block',
    'template-literal',
]);
function isFieldNameToken(t) {
    if (!t)
        return false;
    return t.type === 'identifier' || KEYWORD_AS_IDENTIFIER.has(t.type);
}
function tokenize(src) {
    var tokens = [];
    var line = 1;
    var column = 1;
    var i = 0;
    while (i < src.length) {
        var ch = src[i];
        var nextCh = src[i + 1];
        if (ch === ' ' || ch === '\t') {
            var value = '';
            while (i < src.length && (src[i] === ' ' || src[i] === '\t')) {
                value += src[i];
                column++;
                i++;
            }
            tokens.push({ type: 'whitespace', value: value, line: line, column: column - value.length });
            continue;
        }
        if (ch === '\n' || (ch === '\r' && nextCh === '\n')) {
            var value = ch === '\r' ? '\r\n' : '\n';
            tokens.push({ type: 'newline', value: value, line: line, column: column });
            i += value.length;
            line++;
            column = 1;
            continue;
        }
        if (ch === '/' && nextCh === '/') {
            var startCol = column;
            var value = '';
            while (i < src.length && src[i] !== '\n') {
                value += src[i];
                i++;
            }
            tokens.push({ type: 'comment-line', value: value, line: line, column: startCol });
            column += value.length;
            continue;
        }
        if (ch === '/' && nextCh === '*') {
            var startCol = column;
            var value = '';
            var commentLine = line;
            while (i < src.length - 1) {
                value += src[i];
                if (src[i] === '\n') {
                    line++;
                    column = 1;
                }
                else {
                    column++;
                }
                i++;
                if (src[i - 1] === '*' && src[i] === '/') {
                    value += src[i];
                    i++;
                    column++;
                    break;
                }
            }
            tokens.push({ type: 'comment-block', value: value, line: commentLine, column: startCol });
            continue;
        }
        if (ch === '`') {
            var startCol = column;
            var value = '';
            i++;
            column++;
            while (i < src.length) {
                var c = src[i];
                value += c;
                if (c === '\\' && i + 1 < src.length) {
                    value += src[i + 1];
                    i += 2;
                    column += 2;
                }
                else if (c === '`') {
                    i++;
                    column++;
                    break;
                }
                else if (c === '\n') {
                    line++;
                    column = 1;
                    i++;
                }
                else {
                    i++;
                    column++;
                }
            }
            tokens.push({ type: 'template-literal', value: '`' + value, line: line, column: startCol });
            continue;
        }
        if (ch === '"' || ch === "'") {
            var quote = ch;
            var startCol = column;
            var value = '';
            i++;
            column++;
            while (i < src.length) {
                var c = src[i];
                value += c;
                if (c === '\\' && i + 1 < src.length) {
                    value += src[i + 1];
                    i += 2;
                    column += 2;
                }
                else if (c === quote) {
                    i++;
                    column++;
                    break;
                }
                else if (c === '\n') {
                    line++;
                    column = 1;
                    i++;
                }
                else {
                    i++;
                    column++;
                }
            }
            tokens.push({ type: 'string', value: quote + value, line: line, column: startCol });
            continue;
        }
        if (/\d/.test(ch) || (ch === '.' && /\d/.test(nextCh))) {
            var startCol = column;
            var value = '';
            if (ch === '0' && (nextCh === 'x' || nextCh === 'X' || nextCh === 'b' || nextCh === 'B' || nextCh === 'o' || nextCh === 'O')) {
                value += src[i] + src[i + 1];
                i += 2;
                column += 2;
                while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) {
                    value += src[i];
                    i++;
                    column++;
                }
            }
            else {
                while (i < src.length && /[\d_.]/.test(src[i])) {
                    value += src[i];
                    i++;
                    column++;
                }
                if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
                    value += src[i];
                    i++;
                    column++;
                    if (i < src.length && (src[i] === '+' || src[i] === '-')) {
                        value += src[i];
                        i++;
                        column++;
                    }
                    while (i < src.length && /\d/.test(src[i])) {
                        value += src[i];
                        i++;
                        column++;
                    }
                }
            }
            tokens.push({ type: 'number', value: value, line: line, column: startCol });
            continue;
        }
        if (/[a-zA-Z_$]/.test(ch)) {
            var startCol = column;
            var value = '';
            while (i < src.length && /[a-zA-Z0-9_$]/.test(src[i])) {
                value += src[i];
                i++;
                column++;
            }
            var type = 'identifier';
            if (value === 'export')
                type = 'export';
            else if (value === 'interface')
                type = 'interface';
            else if (value === 'type')
                type = 'type';
            else if (value === 'extends')
                type = 'extends';
            else if (value === 'as')
                type = 'as';
            else if (value === 'in')
                type = 'in';
            tokens.push({ type: type, value: value, line: line, column: startCol });
            continue;
        }
        var singleCharMap = {
            '{': 'brace-open', '}': 'brace-close',
            '[': 'bracket-open', ']': 'bracket-close',
            '<': 'angle-open', '>': 'angle-close',
            ':': 'colon', '?': 'question', ';': 'semicolon',
            ',': 'comma', '=': 'equals', '|': 'pipe',
            '@': 'at', '.': 'dot',
        };
        if (singleCharMap[ch]) {
            tokens.push({ type: singleCharMap[ch], value: ch, line: line, column: column });
            i++;
            column++;
            continue;
        }
        i++;
        column++;
    }
    return tokens;
}
function readFiles(dir) {
    var out = [];
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var e = entries_1[_i];
        var p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "node_modules" || e.name === "dist" || e.name === "schema")
                continue;
            out.push.apply(out, readFiles(p));
        }
        else if (e.isFile() && e.name.endsWith(".ts") && e.name !== "generated.ts" && !e.name.match(/\.(test|spec)\.ts$/)) {
            out.push(p);
        }
    }
    return out;
}
var InterfaceTokenParser = /** @class */ (function () {
    function InterfaceTokenParser(tokens) {
        this.i = 0;
        this.seenInterfaces = new Set();
        this.interfaces = {};
        this.tokens = tokens;
    }
    InterfaceTokenParser.prototype.parse = function () {
        while (this.i < this.tokens.length) {
            this.skipWhitespaceOnly();
            this.skipTopLevelComments();
            if (this.i >= this.tokens.length)
                break;
            if (this.parseInterfaceDeclaration()) {
                // continue
            }
            else {
                this.i++;
            }
        }
        return this.interfaces;
    };
    InterfaceTokenParser.prototype.peek = function () {
        return this.i < this.tokens.length ? this.tokens[this.i] : null;
    };
    InterfaceTokenParser.prototype.next = function () {
        var token = this.peek();
        if (token)
            this.i++;
        return token;
    };
    InterfaceTokenParser.prototype.consume = function (type) {
        var _a;
        if (((_a = this.peek()) === null || _a === void 0 ? void 0 : _a.type) === type)
            return this.next();
        return null;
    };
    InterfaceTokenParser.prototype.skipWhitespaceOnly = function () {
        while (this.i < this.tokens.length) {
            var t = this.peek();
            if ((t === null || t === void 0 ? void 0 : t.type) === 'whitespace' || (t === null || t === void 0 ? void 0 : t.type) === 'newline') {
                this.next();
            }
            else {
                break;
            }
        }
    };
    InterfaceTokenParser.prototype.skipTopLevelComments = function () {
        while (this.i < this.tokens.length) {
            var t = this.peek();
            if ((t === null || t === void 0 ? void 0 : t.type) === 'comment-line' || (t === null || t === void 0 ? void 0 : t.type) === 'comment-block') {
                this.next();
                this.skipWhitespaceOnly();
            }
            else {
                break;
            }
        }
    };
    InterfaceTokenParser.prototype.readPrecedingComment = function () {
        var j = this.i;
        while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
            j++;
        }
        if (j >= this.tokens.length || this.tokens[j].type !== 'comment-line') {
            return "";
        }
        var commentToken = this.tokens[j];
        j++;
        while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
            j++;
        }
        if (j >= this.tokens.length)
            return "";
        var next = this.tokens[j];
        if (!isFieldNameToken(next) && next.type !== 'brace-close')
            return "";
        while (this.i <= this.tokens.length) {
            var t = this.tokens[this.i];
            if (t === commentToken) {
                this.next();
                break;
            }
            this.next();
        }
        return commentToken.value.replace(/^\/\/\s?/, "").trim();
    };
    InterfaceTokenParser.prototype.parseInterfaceDeclaration = function () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        var startLine = (_b = (_a = this.peek()) === null || _a === void 0 ? void 0 : _a.line) !== null && _b !== void 0 ? _b : 0;
        if (((_c = this.peek()) === null || _c === void 0 ? void 0 : _c.type) === 'export') {
            this.next();
            this.skipWhitespaceOnly();
            this.skipTopLevelComments();
        }
        var declType = (_d = this.peek()) === null || _d === void 0 ? void 0 : _d.type;
        if (declType !== 'interface' && declType !== 'type')
            return false;
        this.next();
        this.skipWhitespaceOnly();
        var nameToken = this.peek();
        if ((nameToken === null || nameToken === void 0 ? void 0 : nameToken.type) !== 'identifier') {
            this.reportError(startLine, "Expected interface name");
            return false;
        }
        var name = nameToken.value;
        this.next();
        if (this.seenInterfaces.has(name)) {
            console.warn("Warning: Interface/type \"".concat(name, "\" defined multiple times (line ").concat(startLine, ")"));
        }
        this.seenInterfaces.add(name);
        this.skipWhitespaceOnly();
        if (declType === 'type') {
            if (this.consume('equals'))
                this.skipWhitespaceOnly();
        }
        if (!this.consume('brace-open')) {
            this.reportError(startLine, "Expected '{' after interface name");
            return false;
        }
        var fields = {};
        var relations = [];
        while (this.i < this.tokens.length && ((_e = this.peek()) === null || _e === void 0 ? void 0 : _e.type) !== 'brace-close') {
            this.skipWhitespaceOnly();
            if (((_f = this.peek()) === null || _f === void 0 ? void 0 : _f.type) === 'brace-close')
                break;
            var fieldComment = this.readPrecedingComment();
            this.skipWhitespaceOnly();
            if (((_g = this.peek()) === null || _g === void 0 ? void 0 : _g.type) === 'brace-close')
                break;
            var fieldLine = (_j = (_h = this.peek()) === null || _h === void 0 ? void 0 : _h.line) !== null && _j !== void 0 ? _j : 0;
            // Detect tokens that are impossible to handle as field names and warn loudly.
            var peeked = this.peek();
            if (peeked && BREAKING_KEYWORDS.has(peeked.type)) {
                console.error("\n[schema-generator] \u26A0\uFE0F  UNSUPPORTED FIELD NAME at line ".concat(peeked.line, ":").concat(peeked.column, "\n") +
                    "  Token type : \"".concat(peeked.type, "\"  (value: ").concat(JSON.stringify(peeked.value), ")\n") +
                    "  This token cannot be used as a field name by the schema generator.\n" +
                    "  The field has been skipped and will NOT appear in the generated schema.\n\n" +
                    "  What you can do:\n" +
                    "    \u2022 Rename the field to a plain camelCase identifier.\n" +
                    "      e.g.  default: string   \u2192   defaultValue: string\n" +
                    "            \"quoted-key\": number  \u2192   quotedKey: number\n" +
                    "            123: boolean          \u2192   field123: boolean\n" +
                    "    \u2022 Index-signature fields ( [key: string]: any ) are not supported;\n" +
                    "      remove them or move them to a separate non-model interface.\n");
                // Skip tokens until we reach the end of what looks like this field line
                // (i.e. until we hit a newline or semicolon at depth 0, or brace-close).
                var depth = 0;
                while (this.i < this.tokens.length) {
                    var t = this.peek();
                    if (t.type === 'brace-open' || t.type === 'bracket-open' || t.type === 'angle-open')
                        depth++;
                    if (t.type === 'brace-close' && depth === 0)
                        break;
                    if (t.type === 'brace-close' || t.type === 'bracket-close' || t.type === 'angle-close')
                        depth = Math.max(0, depth - 1);
                    if ((t.type === 'semicolon' || t.type === 'newline') && depth === 0) {
                        this.next();
                        break;
                    }
                    this.next();
                }
                continue;
            }
            if (!this.parseField(name, fields, relations, fieldLine, fieldComment)) {
                if (((_k = this.peek()) === null || _k === void 0 ? void 0 : _k.type) === 'identifier' || isFieldNameToken(this.peek())) {
                    this.reportError(fieldLine, "Invalid field: ".concat((_l = this.peek()) === null || _l === void 0 ? void 0 : _l.value));
                }
                this.next();
            }
        }
        if (!this.consume('brace-close')) {
            this.reportError(startLine, "Expected '}' to close interface");
            return false;
        }
        this.interfaces[name] = { fields: fields, relations: relations };
        return true;
    };
    InterfaceTokenParser.prototype.parseField = function (interfaceName, fields, relations, lineNum, comment) {
        // Accept plain identifiers AND any keyword the tokenizer promotes that is
        // still legal as a TypeScript property name (type, export, extends, as, in…)
        if (!isFieldNameToken(this.peek()))
            return false;
        var propName = this.next().value;
        this.skipWhitespaceOnly();
        var isOptional = false;
        if (this.consume('question')) {
            isOptional = true;
            this.skipWhitespaceOnly();
        }
        if (!this.consume('colon')) {
            this.reportError(lineNum, "Expected ':' after property '".concat(propName, "'"));
            return false;
        }
        this.skipWhitespaceOnly();
        var typeTokens = this.extractTypeTokens();
        this.consume('semicolon');
        var type = this.reconstructType(typeTokens, isOptional);
        var originalType = this.reconstructType(typeTokens, false);
        var meta = this.parseMetadata(comment);
        if (/@(?:relation|relationship)/i.test(comment)) {
            var relationData = this.parseRelationDirective(comment, propName, interfaceName);
            if (relationData) {
                relations.push({
                    sourceModel: interfaceName,
                    fieldName: propName,
                    kind: relationData.kind,
                    targetModel: relationData.target,
                    foreignKey: relationData.fk,
                    through: relationData.through,
                    meta: meta,
                });
                fields[propName] = { type: type, originalType: originalType, optional: isOptional, meta: meta };
                return true;
            }
        }
        fields[propName] = { type: type, originalType: originalType, optional: isOptional, meta: meta };
        return true;
    };
    InterfaceTokenParser.prototype.extractTypeTokens = function () {
        var typeTokens = [];
        var depth = 0;
        while (this.i < this.tokens.length) {
            var token = this.peek();
            if (!token)
                break;
            if (token.type === 'bracket-open' || token.type === 'brace-open' || token.type === 'angle-open') {
                depth++;
            }
            else if (token.type === 'bracket-close' || token.type === 'brace-close' || token.type === 'angle-close') {
                if (depth === 0)
                    break;
                depth--;
            }
            if (token.type === 'semicolon' && depth === 0)
                break;
            if (token.type === 'newline' && depth === 0)
                break;
            typeTokens.push(token);
            this.next();
        }
        return typeTokens;
    };
    InterfaceTokenParser.prototype.reconstructType = function (tokens, addOptional) {
        if (tokens.length === 0)
            return "unknown";
        var significant = tokens.filter(function (t) { return t.type !== 'whitespace' && t.type !== 'newline' &&
            t.type !== 'comment-line' && t.type !== 'comment-block'; });
        if (significant.length === 0)
            return "unknown";
        var result = "";
        for (var i = 0; i < significant.length; i++) {
            var token = significant[i];
            var prev = i > 0 ? significant[i - 1] : null;
            var next = i < significant.length - 1 ? significant[i + 1] : null;
            if (prev && (prev.type === 'bracket-open' || prev.type === 'brace-open' || prev.type === 'angle-open')) {
                result += token.value;
            }
            else if (next && (next.type === 'bracket-close' || next.type === 'brace-close' || next.type === 'angle-close')) {
                result += token.value;
            }
            else if (token.type === 'pipe') {
                result += " | ";
            }
            else {
                result += (result && result[result.length - 1] !== ' ' ? ' ' : '') + token.value;
            }
        }
        result = result.replace(/\s+/g, ' ').trim();
        if (addOptional && !/undefined/.test(result)) {
            result = "".concat(result, " | undefined");
        }
        return result;
    };
    InterfaceTokenParser.prototype.parseMetadata = function (comment) {
        var meta = {};
        if (!comment)
            return meta;
        var parts = comment.split(";").map(function (p) { return p.trim(); }).filter(Boolean);
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            if (part.includes(":")) {
                var _a = part.split(":"), key = _a[0], valueParts = _a.slice(1);
                var value = valueParts.join(":").trim();
                meta[key.trim()] = value === "true" ? true : value === "false" ? false : value;
            }
            else {
                meta[part] = true;
            }
        }
        return meta;
    };
    InterfaceTokenParser.prototype.parseRelationDirective = function (comment, fieldName, interfaceName) {
        var relMatch = comment.match(/@(?:relation|relationship)\s+(\w+):(\w+)/i);
        var fkMatch = comment.match(/foreignKey[:\s]*([A-Za-z0-9_]+)/i);
        var throughMatch = comment.match(/through[:\s]*([A-Za-z0-9_]+)/i);
        if (!relMatch)
            return null;
        var kind = relMatch[1].toLowerCase();
        var target = relMatch[2];
        var fk = fkMatch ? fkMatch[1] : "";
        if (!fk) {
            if (kind === 'manytoone' || kind === 'many-to-one') {
                fk = "".concat(target.toLowerCase(), "Id");
            }
            else if (kind === 'onetomany' || kind === 'one-to-many') {
                fk = "".concat(interfaceName.toLowerCase(), "Id");
            }
            else if (kind === 'manytomany' || kind === 'many-to-many') {
                fk = 'id';
            }
            else {
                fk = 'id';
            }
        }
        return {
            kind: kind,
            target: target,
            fk: fk,
            through: throughMatch ? throughMatch[1] : undefined,
        };
    };
    InterfaceTokenParser.prototype.reportError = function (line, message) {
        // Suppressed — not critical
    };
    return InterfaceTokenParser;
}());
function parseInterfacesFromTokens(tokens) {
    var parser = new InterfaceTokenParser(tokens);
    return parser.parse();
}
function computeContentHash(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex').slice(0, 16);
}
function computeSourceHash(files) {
    return computeContentHash(files.map(function (f) {
        try {
            var st = fs.statSync(f);
            return "".concat(f, ":").concat(st.mtimeMs, ":").concat(st.size);
        }
        catch (_a) {
            return f;
        }
    }).join('|'));
}
function generateSchema(srcGlob) {
    return __awaiter(this, void 0, void 0, function () {
        var abs, files, allInterfaces, interfaceSourceMap, _i, files_1, f, src, tokens, parsed, _a, _b, _c, name_1, intf, _d, _e, intf, output, modelInterfaces, defineRe, _f, files_2, f, src, m, intfName, tableName, intf, primaryEntry, primaryKey, _g, _h, _j, modelName, modelDef, _k, _l, rel, _m, _o, modelName, intf, props, _p, _q, _r, propName, propDef, optional, modelMapEntries, outDir, jsonStr, contentHash, sourceHash, tsContent;
        return __generator(this, function (_s) {
            abs = path.resolve(process.cwd(), srcGlob);
            files = readFiles(abs);
            console.log("Scanning ".concat(files.length, " source files..."));
            allInterfaces = {};
            interfaceSourceMap = {};
            for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                f = files_1[_i];
                src = fs.readFileSync(f, 'utf8');
                tokens = tokenize(src);
                parsed = parseInterfacesFromTokens(tokens);
                for (_a = 0, _b = Object.entries(parsed); _a < _b.length; _a++) {
                    _c = _b[_a], name_1 = _c[0], intf = _c[1];
                    if (allInterfaces[name_1]) {
                        console.warn("Duplicate interface/type \"".concat(name_1, "\" found. Previous: ").concat(interfaceSourceMap[name_1], ", Current: ").concat(f));
                    }
                    allInterfaces[name_1] = intf;
                    interfaceSourceMap[name_1] = f;
                }
            }
            for (_d = 0, _e = Object.values(allInterfaces); _d < _e.length; _d++) {
                intf = _e[_d];
                if (!intf.fields['id']) {
                    intf.fields['id'] = { type: 'number', originalType: 'number', optional: true, meta: { primaryKey: true, auto: true } };
                }
                if (!intf.fields['createdAt']) {
                    intf.fields['createdAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
                }
                if (!intf.fields['updatedAt']) {
                    intf.fields['updatedAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
                }
            }
            output = {};
            modelInterfaces = [];
            defineRe = /(?:[\w$.]+\.)?defineModel\s*<\s*(\w+)\s*>\s*\(\s*['"]([^'"]+)['"]/g;
            for (_f = 0, files_2 = files; _f < files_2.length; _f++) {
                f = files_2[_f];
                src = fs.readFileSync(f, 'utf8');
                m = void 0;
                while ((m = defineRe.exec(src)) !== null) {
                    intfName = m[1];
                    tableName = m[2];
                    intf = allInterfaces[intfName];
                    if (!intf)
                        continue;
                    if (output[intfName]) {
                        console.warn("Model \"".concat(intfName, "\" registered multiple times (overwriting previous definition)"));
                    }
                    primaryEntry = Object.entries(intf.fields).find(function (_a) {
                        var _b;
                        var v = _a[1];
                        return (_b = v.meta) === null || _b === void 0 ? void 0 : _b.primaryKey;
                    });
                    primaryKey = primaryEntry ? primaryEntry[0] : 'id';
                    output[intfName] = {
                        primaryKey: primaryKey,
                        fields: intf.fields,
                        relations: intf.relations,
                        table: tableName,
                    };
                }
            }
            for (_g = 0, _h = Object.entries(output); _g < _h.length; _g++) {
                _j = _h[_g], modelName = _j[0], modelDef = _j[1];
                for (_k = 0, _l = modelDef.relations; _k < _l.length; _k++) {
                    rel = _l[_k];
                    if (!allInterfaces[rel.targetModel]) {
                        console.warn("Unknown relation target \"".concat(rel.targetModel, "\" in ").concat(modelName, ".").concat(rel.fieldName));
                    }
                }
            }
            for (_m = 0, _o = Object.entries(output); _m < _o.length; _m++) {
                modelName = _o[_m][0];
                intf = allInterfaces[modelName];
                props = [];
                for (_p = 0, _q = Object.entries(intf.fields); _p < _q.length; _p++) {
                    _r = _q[_p], propName = _r[0], propDef = _r[1];
                    optional = propDef.optional ? "?" : "";
                    props.push("  ".concat(propName).concat(optional, ": ").concat(propDef.originalType, ";"));
                }
                modelInterfaces.push("export interface ".concat(modelName, " {\n").concat(props.join("\n"), "\n}"));
            }
            modelMapEntries = Object.keys(output).map(function (name) { return "  ".concat(name, ": ").concat(name, ";"); });
            outDir = path.join(abs, 'schema');
            if (!fs.existsSync(outDir))
                fs.mkdirSync(outDir, { recursive: true });
            jsonStr = JSON.stringify(output, null, 2);
            contentHash = computeContentHash(jsonStr);
            sourceHash = computeSourceHash(files);
            tsContent = "\n// AUTO-GENERATED SCHEMA - DO NOT EDIT\n// Schema Hash: ".concat(contentHash, "\n// Source Hash: ").concat(sourceHash, "\n\n").concat(modelInterfaces.join("\n\n"), "\n\nexport type ModelMap = {\n").concat(modelMapEntries.join("\n"), "\n};\n\nexport const schema = ").concat(jsonStr, " as const;\n\nexport type Schema = typeof schema;\nexport type ModelName = keyof ModelMap;\n");
            fs.writeFileSync(path.join(outDir, 'generated.ts'), tsContent, 'utf8');
            fs.writeFileSync(path.join(outDir, 'generated.json'), jsonStr, 'utf8');
            console.log('schema/generated.ts and schema/generated.json written successfully');
            return [2 /*return*/, output];
        });
    });
}
