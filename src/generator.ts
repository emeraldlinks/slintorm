/**
 * ORM Schema Generator
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */ 
import * as fs from "fs";
import * as path from "node:path";
import { createHash } from "crypto";

interface FieldMetadata extends Record<string, any> {}

interface FieldDefinition {
  type: string;
  originalType: string;
  optional: boolean;
  meta: FieldMetadata;
}

interface RelationDefinition {
  sourceModel: string;
  fieldName: string;
  kind: string;
  targetModel: string;
  foreignKey: string;
  through?: string;
  meta: Record<string, any>;
}

interface InterfaceDefinition {
  fields: Record<string, FieldDefinition>;
  relations: RelationDefinition[];
}

interface ModelDefinition {
  primaryKey: string;
  fields: Record<string, FieldDefinition>;
  relations: RelationDefinition[];
  table: string;
}

type TokenType =
  | 'identifier' | 'brace-open' | 'brace-close' | 'bracket-open' | 'bracket-close'
  | 'angle-open' | 'angle-close' | 'string' | 'template-literal' | 'comment-line' | 'comment-block'
  | 'colon' | 'question' | 'semicolon' | 'comma' | 'equals' | 'pipe' | 'at' | 'dot'
  | 'export' | 'interface' | 'type' | 'extends' | 'as' | 'in' | 'number' | 'whitespace' | 'newline';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

/**
 * TypeScript keywords that the tokenizer promotes out of 'identifier' but are
 * perfectly legal as property / field names inside an interface body.
 * e.g.  type: string;  export: boolean;  in: number;
 */
const KEYWORD_AS_IDENTIFIER = new Set<TokenType>([
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
const BREAKING_KEYWORDS = new Set<TokenType>([
  'colon', 'semicolon', 'comma', 'equals', 'pipe', 'at', 'dot',
  'brace-open', 'brace-close', 'bracket-open', 'bracket-close',
  'angle-open', 'angle-close', 'question',
  'string', 'number',
  'newline', 'whitespace',
  'comment-line', 'comment-block',
  'template-literal',
]);

function isFieldNameToken(t: Token | null): boolean {
  if (!t) return false;
  return t.type === 'identifier' || KEYWORD_AS_IDENTIFIER.has(t.type);
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let column = 1;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    const nextCh = src[i + 1];

    if (ch === ' ' || ch === '\t') {
      let value = '';
      while (i < src.length && (src[i] === ' ' || src[i] === '\t')) {
        value += src[i];
        column++;
        i++;
      }
      tokens.push({ type: 'whitespace', value, line, column: column - value.length });
      continue;
    }

    if (ch === '\n' || (ch === '\r' && nextCh === '\n')) {
      const value = ch === '\r' ? '\r\n' : '\n';
      tokens.push({ type: 'newline', value, line, column });
      i += value.length;
      line++;
      column = 1;
      continue;
    }

    if (ch === '/' && nextCh === '/') {
      const startCol = column;
      let value = '';
      while (i < src.length && src[i] !== '\n') {
        value += src[i];
        i++;
      }
      tokens.push({ type: 'comment-line', value, line, column: startCol });
      column += value.length;
      continue;
    }

    if (ch === '/' && nextCh === '*') {
      const startCol = column;
      let value = '';
      const commentLine = line;
      while (i < src.length - 1) {
        value += src[i];
        if (src[i] === '\n') {
          line++;
          column = 1;
        } else {
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
      tokens.push({ type: 'comment-block', value, line: commentLine, column: startCol });
      continue;
    }

    if (ch === '`') {
      const startCol = column;
      let value = '';
      i++;
      column++;
      while (i < src.length) {
        const c = src[i];
        value += c;
        if (c === '\\' && i + 1 < src.length) {
          value += src[i + 1];
          i += 2;
          column += 2;
        } else if (c === '`') {
          i++;
          column++;
          break;
        } else if (c === '\n') {
          line++;
          column = 1;
          i++;
        } else {
          i++;
          column++;
        }
      }
      tokens.push({ type: 'template-literal', value: '`' + value, line, column: startCol });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startCol = column;
      let value = '';
      i++;
      column++;
      while (i < src.length) {
        const c = src[i];
        value += c;
        if (c === '\\' && i + 1 < src.length) {
          value += src[i + 1];
          i += 2;
          column += 2;
        } else if (c === quote) {
          i++;
          column++;
          break;
        } else if (c === '\n') {
          line++;
          column = 1;
          i++;
        } else {
          i++;
          column++;
        }
      }
      tokens.push({ type: 'string', value: quote + value, line, column: startCol });
      continue;
    }

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(nextCh))) {
      const startCol = column;
      let value = '';
      if (ch === '0' && (nextCh === 'x' || nextCh === 'X' || nextCh === 'b' || nextCh === 'B' || nextCh === 'o' || nextCh === 'O')) {
        value += src[i] + src[i + 1];
        i += 2;
        column += 2;
        while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) {
          value += src[i];
          i++;
          column++;
        }
      } else {
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
      tokens.push({ type: 'number', value, line, column: startCol });
      continue;
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      const startCol = column;
      let value = '';
      while (i < src.length && /[a-zA-Z0-9_$]/.test(src[i])) {
        value += src[i];
        i++;
        column++;
      }
      let type: TokenType = 'identifier';
      if (value === 'export') type = 'export';
      else if (value === 'interface') type = 'interface';
      else if (value === 'type') type = 'type';
      else if (value === 'extends') type = 'extends';
      else if (value === 'as') type = 'as';
      else if (value === 'in') type = 'in';
      tokens.push({ type, value, line, column: startCol });
      continue;
    }

    const singleCharMap: Record<string, TokenType> = {
      '{': 'brace-open', '}': 'brace-close',
      '[': 'bracket-open', ']': 'bracket-close',
      '<': 'angle-open', '>': 'angle-close',
      ':': 'colon', '?': 'question', ';': 'semicolon',
      ',': 'comma', '=': 'equals', '|': 'pipe',
      '@': 'at', '.': 'dot',
    };

    if (singleCharMap[ch]) {
      tokens.push({ type: singleCharMap[ch], value: ch, line, column });
      i++;
      column++;
      continue;
    }

    i++;
    column++;
  }

  return tokens;
}

function readFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "schema") continue;
      out.push(...readFiles(p));
    } else if (e.isFile() && e.name.endsWith(".ts") && e.name !== "generated.ts" && !e.name.match(/\.(test|spec)\.ts$/)) {
      out.push(p);
    }
  }
  return out;
}

class InterfaceTokenParser {
  private tokens: Token[];
  private i = 0;
  private seenInterfaces = new Set<string>();
  private readonly interfaces: Record<string, InterfaceDefinition> = {};

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Record<string, InterfaceDefinition> {
    while (this.i < this.tokens.length) {
      this.skipWhitespaceOnly();
      this.skipTopLevelComments();
      if (this.i >= this.tokens.length) break;
      if (this.parseInterfaceDeclaration()) {
        // continue
      } else {
        this.i++;
      }
    }
    return this.interfaces;
  }

  private peek(): Token | null {
    return this.i < this.tokens.length ? this.tokens[this.i] : null;
  }

  private next(): Token | null {
    const token = this.peek();
    if (token) this.i++;
    return token;
  }

  private consume(type: TokenType): Token | null {
    if (this.peek()?.type === type) return this.next();
    return null;
  }

  private skipWhitespaceOnly(): void {
    while (this.i < this.tokens.length) {
      const t = this.peek();
      if (t?.type === 'whitespace' || t?.type === 'newline') {
        this.next();
      } else {
        break;
      }
    }
  }

  private skipTopLevelComments(): void {
    while (this.i < this.tokens.length) {
      const t = this.peek();
      if (t?.type === 'comment-line' || t?.type === 'comment-block') {
        this.next();
        this.skipWhitespaceOnly();
      } else {
        break;
      }
    }
  }

  private readPrecedingComment(): string {
    let j = this.i;

    while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
      j++;
    }

    if (j >= this.tokens.length || this.tokens[j].type !== 'comment-line') {
      return "";
    }

    // Collect all stacked comment lines
    const comments: Token[] = [];
    while (j < this.tokens.length && this.tokens[j].type === 'comment-line') {
      comments.push(this.tokens[j]);
      j++;
      while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
        j++;
      }
    }

    if (j >= this.tokens.length) return "";
    const next = this.tokens[j];
    if (!isFieldNameToken(next) && next.type !== 'brace-close') return "";

    // Consume all collected comments
    for (const ct of comments) {
      while (this.i <= this.tokens.length) {
        const t = this.tokens[this.i];
        if (t === ct) {
          this.next();
          break;
        }
        this.next();
      }
    }

    return comments.map(c => c.value.replace(/^\/\/\s?/, "").trim()).filter(Boolean).join(";");
  }

  private parseInterfaceDeclaration(): boolean {
    const startLine = this.peek()?.line ?? 0;

    if (this.peek()?.type === 'export') {
      this.next();
      this.skipWhitespaceOnly();
      this.skipTopLevelComments();
    }

    const declType = this.peek()?.type;
    if (declType !== 'interface' && declType !== 'type') return false;
    this.next();
    this.skipWhitespaceOnly();

    const nameToken = this.peek();
    if (nameToken?.type !== 'identifier') {
      this.reportError(startLine, "Expected interface name");
      return false;
    }
    const name = nameToken.value;
    this.next();

    if (this.seenInterfaces.has(name)) {
      console.warn(`Warning: Interface/type "${name}" defined multiple times (line ${startLine})`);
    }
    this.seenInterfaces.add(name);

    this.skipWhitespaceOnly();

    if (declType === 'type') {
      if (this.consume('equals')) this.skipWhitespaceOnly();
    }

    if (!this.consume('brace-open')) {
      this.reportError(startLine, "Expected '{' after interface name");
      return false;
    }

    const fields: Record<string, FieldDefinition> = {};
    const relations: RelationDefinition[] = [];

    while (this.i < this.tokens.length && this.peek()?.type !== 'brace-close') {
      this.skipWhitespaceOnly();
      if (this.peek()?.type === 'brace-close') break;

      const fieldComment = this.readPrecedingComment();

      this.skipWhitespaceOnly();
      if (this.peek()?.type === 'brace-close') break;

      const fieldLine = this.peek()?.line ?? 0;

      // Detect tokens that are impossible to handle as field names and warn loudly.
      const peeked = this.peek();
      if (peeked && BREAKING_KEYWORDS.has(peeked.type)) {
        // Comment tokens that didn't precede a field are harmless — skip silently.
        if (peeked.type === 'comment-line' || peeked.type === 'comment-block') {
          this.next();
          continue;
        }
        console.error(
          `\n[schema-generator] ⚠️  UNSUPPORTED FIELD NAME at line ${peeked.line}:${peeked.column}\n` +
          `  Interface: ${name}\n` +
          `  Token type : "${peeked.type}"  (value: ${JSON.stringify(peeked.value)})\n` +
          `  This token cannot be used as a field name by the schema generator.\n` +
          `  The field has been skipped and will NOT appear in the generated schema.\n\n` +
          `  What you can do:\n` +
          `    • Rename the field to a plain camelCase identifier.\n` +
          `      e.g.  default: string   →   defaultValue: string\n` +
          `            "quoted-key": number  →   quotedKey: number\n` +
          `            123: boolean          →   field123: boolean\n` +
          `    • Index-signature fields ( [key: string]: any ) are not supported;\n` +
          `      remove them or move them to a separate non-model interface.\n`
        );
        // Skip tokens until we reach the end of what looks like this field line
        // (i.e. until we hit a newline or semicolon at depth 0, or brace-close).
        let depth = 0;
        while (this.i < this.tokens.length) {
          const t = this.peek()!;
          if (t.type === 'brace-open' || t.type === 'bracket-open' || t.type === 'angle-open') depth++;
          if (t.type === 'brace-close' && depth === 0) break;
          if (t.type === 'brace-close' || t.type === 'bracket-close' || t.type === 'angle-close') depth = Math.max(0, depth - 1);
          if ((t.type === 'semicolon' || t.type === 'newline') && depth === 0) { this.next(); break; }
          this.next();
        }
        continue;
      }

      if (!this.parseField(name, fields, relations, fieldLine, fieldComment)) {
        if (this.peek()?.type === 'identifier' || isFieldNameToken(this.peek())) {
          this.reportError(fieldLine, `Invalid field: ${this.peek()?.value}`);
        }
        this.next();
      }
    }

    if (!this.consume('brace-close')) {
      this.reportError(startLine, "Expected '}' to close interface");
      return false;
    }

    this.interfaces[name] = { fields, relations };
    return true;
  }

  private parseField(
    interfaceName: string,
    fields: Record<string, FieldDefinition>,
    relations: RelationDefinition[],
    lineNum: number,
    comment: string
  ): boolean {
    // Accept plain identifiers AND any keyword the tokenizer promotes that is
    // still legal as a TypeScript property name (type, export, extends, as, in…)
    if (!isFieldNameToken(this.peek())) return false;
    const propName = this.next()!.value;

    this.skipWhitespaceOnly();

    let isOptional = false;
    if (this.consume('question')) {
      isOptional = true;
      this.skipWhitespaceOnly();
    }

    if (!this.consume('colon')) {
      this.reportError(lineNum, `Expected ':' after property '${propName}'`);
      return false;
    }

    this.skipWhitespaceOnly();

    const typeTokens = this.extractTypeTokens();

    this.consume('semicolon');

    // Check for inline comment after the semicolon (before next newline)
    let mergedComment = comment;
    let look = this.i;
    while (look < this.tokens.length && this.tokens[look].type === 'whitespace') look++;
    if (look < this.tokens.length && (this.tokens[look].type === 'comment-line' || this.tokens[look].type === 'comment-block')) {
      const inlineToken = this.tokens[look];
      if (/@/.test(inlineToken.value)) {
        if (!mergedComment) {
          console.warn(`  [generator] Inline annotation on "${propName}" (line ${inlineToken.line}) — prefer annotations on the line above the field for consistency`);
        }
        const inline = inlineToken.value.replace(/^\/\/\s?/, "").replace(/^\/\*+\s?/, "").replace(/\s?\*+\/$/, "").trim();
        mergedComment = mergedComment ? `${mergedComment};${inline}` : inline;
        // Consume the inline comment so the main loop doesn't see it
        while (this.i < this.tokens.length && this.tokens[this.i].type !== 'comment-line' && this.tokens[this.i].type !== 'comment-block') this.next();
        if (this.i < this.tokens.length) this.next();
      }
    }

    const type = this.reconstructType(typeTokens, isOptional);
    const originalType = this.reconstructType(typeTokens, false);

    const meta = this.parseMetadata(mergedComment);

    if (/@(?:relation|relationship)/i.test(comment)) {
      const relationData = this.parseRelationDirective(comment, propName, interfaceName);
      if (relationData) {
        relations.push({
          sourceModel: interfaceName,
          fieldName: propName,
          kind: relationData.kind,
          targetModel: relationData.target,
          foreignKey: relationData.fk,
          through: relationData.through,
          meta,
        });
        fields[propName] = { type, originalType, optional: isOptional, meta };
        return true;
      }
    }

    fields[propName] = { type, originalType, optional: isOptional, meta };
    return true;
  }

  private extractTypeTokens(): Token[] {
    const typeTokens: Token[] = [];
    let depth = 0;

    while (this.i < this.tokens.length) {
      const token = this.peek();
      if (!token) break;

      if (token.type === 'bracket-open' || token.type === 'brace-open' || token.type === 'angle-open') {
        depth++;
      } else if (token.type === 'bracket-close' || token.type === 'brace-close' || token.type === 'angle-close') {
        if (depth === 0) break;
        depth--;
      }

      if (token.type === 'semicolon' && depth === 0) break;
      if (token.type === 'newline' && depth === 0) break;

      typeTokens.push(token);
      this.next();
    }

    return typeTokens;
  }

  private reconstructType(tokens: Token[], addOptional: boolean): string {
    if (tokens.length === 0) return "unknown";

    const significant = tokens.filter(
      t => t.type !== 'whitespace' && t.type !== 'newline' &&
           t.type !== 'comment-line' && t.type !== 'comment-block'
    );

    if (significant.length === 0) return "unknown";

    let result = "";
    for (let i = 0; i < significant.length; i++) {
      const token = significant[i];
      const prev = i > 0 ? significant[i - 1] : null;
      const next = i < significant.length - 1 ? significant[i + 1] : null;

      if (prev && (prev.type === 'bracket-open' || prev.type === 'brace-open' || prev.type === 'angle-open')) {
        result += token.value;
      } else if (next && (next.type === 'bracket-close' || next.type === 'brace-close' || next.type === 'angle-close')) {
        result += token.value;
      } else if (token.type === 'pipe') {
        result += " | ";
      } else {
        result += (result && result[result.length - 1] !== ' ' ? ' ' : '') + token.value;
      }
    }

    result = result.replace(/\s+/g, ' ').trim();

    if (addOptional && !/undefined/.test(result)) {
      result = `${result} | undefined`;
    }

    return result;
  }

  private parseMetadata(comment: string): Record<string, any> {
    const meta: Record<string, any> = {};
    if (!comment) return meta;

    const parts = comment.split(";").map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes(":")) {
        const [key, ...valueParts] = part.split(":");
        const rawValue = valueParts.join(":").trim();
        let value: any = rawValue;
        if (
          (rawValue.startsWith("'") && rawValue.endsWith("'")) ||
          (rawValue.startsWith("\"") && rawValue.endsWith("\""))
        ) {
          value = rawValue.slice(1, -1);
        } else {
          value = rawValue === "true" ? true : rawValue === "false" ? false : rawValue;
        }
        meta[key.trim()] = value;
      } else {
        meta[part] = true;
      }
    }

    return meta;
  }

  private parseRelationDirective(
    comment: string,
    fieldName: string,
    interfaceName: string
  ): { kind: string; target: string; fk: string; through?: string } | null {
    const relMatch = comment.match(/@(?:relation|relationship)\s+(\w+):(\w+)/i);
    const fkMatch = comment.match(/foreignKey[:\s]*([A-Za-z0-9_]+)/i);
    const throughMatch = comment.match(/through[:\s]*([A-Za-z0-9_]+)/i);

    if (!relMatch) return null;

    const kind = relMatch[1].toLowerCase();
    const target = relMatch[2];
    let fk = fkMatch ? fkMatch[1] : "";

    if (!fk) {
      if (kind === 'manytoone' || kind === 'many-to-one') {
        fk = `${target.toLowerCase()}Id`;
      } else if (kind === 'onetomany' || kind === 'one-to-many') {
        fk = `${interfaceName.toLowerCase()}Id`;
      } else if (kind === 'manytomany' || kind === 'many-to-many') {
        fk = 'id';
      } else {
        fk = 'id';
      }
    }

    return {
      kind,
      target,
      fk,
      through: throughMatch ? throughMatch[1] : undefined,
    };
  }

  private reportError(line: number, message: string): void {
    console.warn(`[schema generator] line ${line}: ${message}`);
  }
}

function parseInterfacesFromTokens(tokens: Token[]): Record<string, InterfaceDefinition> {
  const parser = new InterfaceTokenParser(tokens);
  return parser.parse();
}

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function computeSourceHash(files: string[]): string {
  return computeContentHash(
    files.map(f => {
      try { const st = fs.statSync(f); return `${f}:${st.mtimeMs}:${st.size}`; } catch { return f; }
    }).join('|')
  );
}

export default async function generateSchema(srcGlob: string) {
  const abs = path.resolve(process.cwd(), srcGlob);
  const files = readFiles(abs);
  console.log(`Scanning ${files.length} source files...`);

  const allInterfaces: Record<string, InterfaceDefinition> = {};
  const interfaceSourceMap: Record<string, string> = {};

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const tokens = tokenize(src);
    const parsed = parseInterfacesFromTokens(tokens);
    for (const [name, intf] of Object.entries(parsed)) {
      if (allInterfaces[name]) {
        console.warn(`Duplicate interface/type "${name}" found. Previous: ${interfaceSourceMap[name]}, Current: ${f}`);
      }
      allInterfaces[name] = intf;
      interfaceSourceMap[name] = f;
    }
  }

  for (const intf of Object.values(allInterfaces)) {
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

  const output: Record<string, ModelDefinition> = {};
  const modelInterfaces: string[] = [];

  const defineRe = /(?:[\w$.]+\.)?defineModel\s*<\s*(\w+)\s*>\s*\(\s*['"]([^'"]+)['"]/g;

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = defineRe.exec(src)) !== null) {
      const intfName = m[1];
      const tableName = m[2];
      const intf = allInterfaces[intfName];
      if (!intf) continue;

      if (output[intfName]) {
        console.warn(`Model "${intfName}" registered multiple times (overwriting previous definition)`);
      }

      const primaryEntry = Object.entries(intf.fields).find(([, v]) => v.meta?.primaryKey);
      const primaryKey = primaryEntry ? primaryEntry[0] : 'id';

      output[intfName] = {
        primaryKey,
        fields: intf.fields,
        relations: intf.relations,
        table: tableName,
      };
    }
  }

  for (const [modelName, modelDef] of Object.entries(output)) {
    for (const rel of modelDef.relations) {
      if (!allInterfaces[rel.targetModel]) {
        console.warn(`Unknown relation target "${rel.targetModel}" in ${modelName}.${rel.fieldName}`);
      }
    }
  }

  for (const [modelName] of Object.entries(output)) {
    const intf = allInterfaces[modelName];
    const props: string[] = [];

    for (const [propName, propDef] of Object.entries(intf.fields) as [string, FieldDefinition][]) {
      const optional = propDef.optional ? "?" : "";
      if (propDef.meta?.["@hash"]) {
        const base = propDef.originalType.replace(/\s*\|\s*undefined\s*/g, '');
        const suffix = ` & { verify(plaintext: string): Promise<boolean> }`;
        const typeStr = propDef.optional ? `${base}${suffix} | undefined` : `${base}${suffix}`;
        props.push(`  ${propName}${optional}: ${typeStr};`);
      } else if (propDef.meta?.["@encrypt"]) {
        const encryptVal = propDef.meta["@encrypt"];
        const isAuto = typeof encryptVal === "string" && (encryptVal === "auto" || encryptVal.includes("decrypt=auto"));
        if (isAuto) {
          props.push(`  ${propName}${optional}: ${propDef.originalType};`);
        } else {
          const base = propDef.originalType.replace(/\s*\|\s*undefined\s*/g, '');
          const suffix = ` & { decrypt(): Promise<string> }`;
          const typeStr = propDef.optional ? `${base}${suffix} | undefined` : `${base}${suffix}`;
          props.push(`  ${propName}${optional}: ${typeStr};`);
        }
      } else {
        props.push(`  ${propName}${optional}: ${propDef.originalType};`);
      }
    }

    modelInterfaces.push(`export interface ${modelName} {\n${props.join("\n")}\n}`);
  }

  const modelMapEntries = Object.keys(output).map((name) => `  ${name}: ${name};`);

  const outDir = path.join(abs, 'schema');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonStr = JSON.stringify(output, null, 2);
  const contentHash = computeContentHash(jsonStr);
  const sourceHash = computeSourceHash(files);
  const tsContent = `\n// AUTO-GENERATED SCHEMA - DO NOT EDIT\n// Schema Hash: ${contentHash}\n// Source Hash: ${sourceHash}\n\n${modelInterfaces.join("\n\n")}\n\nexport type ModelMap = {\n${modelMapEntries.join("\n")}\n};\n\nexport const schema = ${jsonStr} as const;\n\nexport type Schema = typeof schema;\nexport type ModelName = keyof ModelMap;\n`;

  fs.writeFileSync(path.join(outDir, 'generated.ts'), tsContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'generated.json'), jsonStr, 'utf8');

  console.log('schema/generated.ts and schema/generated.json written successfully');
  return output;
}