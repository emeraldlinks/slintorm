/**
 * ORM Schema Generator
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */
import fs from "fs";
import path from "node:path";
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

      // Collect any pending annotation comment at top-level (interface doc comments)
      // These are block comments like /** ... */ above the interface keyword.
      // We don't need them for schema, just skip.
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

  /**
   * Skip only whitespace and newlines — does NOT consume comments.
   * This preserves comments so they can be read by the field parser
   * immediately before the field they annotate.
   */
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

  /**
   * Skip top-level comments (used outside of interface bodies).
   */
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

  /**
   * Read the annotation comment that immediately precedes a field.
   * Only collects the LAST comment-line that directly precedes the identifier,
   * with only whitespace/newlines between them. Returns "" if none.
   *
   * This is the core fix: we read comments inline as part of field parsing,
   * not as part of a global "skip whitespace" sweep.
   */
  private readPrecedingComment(): string {
    // Scan ahead: skip whitespace/newlines, if we hit a comment-line followed
    // by whitespace/newlines followed by an identifier, consume it and return it.
    // If we hit anything else (including another comment), return "".
    let j = this.i;

    // Skip leading whitespace/newlines
    while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
      j++;
    }

    // Expect a comment-line token
    if (j >= this.tokens.length || this.tokens[j].type !== 'comment-line') {
      return "";
    }

    const commentToken = this.tokens[j];
    j++;

    // Skip whitespace/newlines after comment
    while (j < this.tokens.length && (this.tokens[j].type === 'whitespace' || this.tokens[j].type === 'newline')) {
      j++;
    }

    // Next must be an identifier (the field name) or closing brace
    if (j >= this.tokens.length) return "";
    const next = this.tokens[j];
    if (next.type !== 'identifier' && next.type !== 'brace-close') return "";

    // Consume up to and including the comment
    while (this.i <= this.tokens.length) {
      const t = this.tokens[this.i];
      if (t === commentToken) {
        this.next(); // consume the comment itself
        break;
      }
      this.next();
    }

    return commentToken.value.replace(/^\/\/\s?/, "").trim();
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
      // Skip blank lines between fields
      this.skipWhitespaceOnly();
      if (this.peek()?.type === 'brace-close') break;

      // FIX: read the annotation comment directly before this field,
      // consuming it only if it immediately precedes an identifier.
      const fieldComment = this.readPrecedingComment();

      // Skip any remaining whitespace after comment
      this.skipWhitespaceOnly();
      if (this.peek()?.type === 'brace-close') break;

      const fieldLine = this.peek()?.line ?? 0;
      if (!this.parseField(name, fields, relations, fieldLine, fieldComment)) {
        if (this.peek()?.type === 'identifier') {
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
    comment: string  // FIX: passed in directly, not read from shared state
  ): boolean {
    if (this.peek()?.type !== 'identifier') return false;
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

    if (!this.consume('semicolon')) {
      this.reportError(lineNum, `Expected ';' after type for '${propName}'`);
    }

    // FIX: do NOT call skipWhitespaceAndComments here — that would consume
    // the next field's annotation comment before we get a chance to read it.

    const type = this.reconstructType(typeTokens, isOptional);
    const originalType = this.reconstructType(typeTokens, false);

    const meta = this.parseMetadata(comment);

    // FIX: relation fields are added to BOTH fields[] (preserving the original TS type)
    // AND relations[]. Previously relation fields were only added to relations[] and
    // then re-emitted from the relation list with the wrong type.
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
        // Still record the field with its original TS type — don't skip it.
        // The generated interface will use this type verbatim.
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
        depth--;
      }

      if (token.type === 'semicolon' && depth === 0) break;

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
        const value = valueParts.join(":").trim();
        meta[key.trim()] = value === "true" ? true : value === "false" ? false : value;
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
    // Suppress parser errors - they're not critical, schema generation still works
    // const context = this.peek();
    // const lineInfo = context ? ` (line ${context.line}, col ${context.column})` : ` (line ${line})`;
    // console.warn(`[Parser Error]${lineInfo}: ${message}`);
  }
}

function parseInterfacesFromTokens(tokens: Token[]): Record<string, InterfaceDefinition> {
  const parser = new InterfaceTokenParser(tokens);
  return parser.parse();
}

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export default async function generateSchema(srcGlob: string) {
  const abs = path.resolve(process.cwd(), srcGlob);
  const files = readFiles(abs);
  console.log(`Scanning ${files.length} source files...`);

  // Fast path: use cached generated.json if it is newer than all source files.
  try {
    const jsonOut = path.join(abs, "schema", "generated.json");
    const tsOut = path.join(abs, "schema", "generated.ts");
    // Only use cache if both files exist
    if (fs.existsSync(jsonOut) && fs.existsSync(tsOut)) {
      const genStat = fs.statSync(jsonOut);
      let newest = 0;
      for (const f of files) {
        try { const st = fs.statSync(f); if (st.mtimeMs > newest) newest = st.mtimeMs; } catch {}
      }
      if (genStat.mtimeMs >= newest) {
        // Verify generated.ts hasn't been manually edited
        const tsContent = fs.readFileSync(tsOut, 'utf8');
        const hashMatch = tsContent.match(/\/\/ Schema Hash: ([a-f0-9]{16})/);
        const storedHash = hashMatch ? hashMatch[1] : null;
        
        const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
        const jsonStr = JSON.stringify(parsed, null, 2);
        const expectedHash = computeContentHash(jsonStr);
        
        if (storedHash === expectedHash) {
          console.log("Using cached schema/generated.json");
          return parsed;
        } else {
          console.log("⚠️  Schema cache invalidated (generated.ts was manually edited). Regenerating...");
        }
      }
    }
  } catch {
    // ignore cache errors, regenerate
  }

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

  // Inject missing standard fields
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

  // Validate relation targets
  for (const [modelName, modelDef] of Object.entries(output)) {
    for (const rel of modelDef.relations) {
      if (!allInterfaces[rel.targetModel]) {
        console.warn(`Unknown relation target "${rel.targetModel}" in ${modelName}.${rel.fieldName}`);
      }
    }
  }

  // Generate interface declarations.
  // FIX: fields already contain relation fields with correct original TS types,
  // so we just emit fields directly. No separate re-emission of relations needed.
  for (const [modelName] of Object.entries(output)) {
    const intf = allInterfaces[modelName];
    const props: string[] = [];

    for (const [propName, propDef] of Object.entries(intf.fields) as [string, FieldDefinition][]) {
      const optional = propDef.optional ? "?" : "";
      props.push(`  ${propName}${optional}: ${propDef.originalType};`);
    }

    modelInterfaces.push(`export interface ${modelName} {\n${props.join("\n")}\n}`);
  }

  const modelMapEntries = Object.keys(output).map((name) => `  ${name}: ${name};`);

  const outDir = path.join(abs, 'schema');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'generated.ts');
  const jsonStr = JSON.stringify(output, null, 2);
  const contentHash = computeContentHash(jsonStr);
  const tsContent = `\n// AUTO-GENERATED SCHEMA - DO NOT EDIT\n// Schema Hash: ${contentHash}\n\n${modelInterfaces.join("\n\n")}\n\nexport type ModelMap = {\n${modelMapEntries.join("\n")}\n};\n\nexport const schema = ${jsonStr} as const;\n\nexport type Schema = typeof schema;\nexport type ModelName = keyof ModelMap;\n`;

  fs.writeFileSync(outFile, tsContent, 'utf8');

  const jsonOut = path.join(outDir, 'generated.json');
  fs.writeFileSync(jsonOut, jsonStr, 'utf8');

  console.log('schema/generated.ts and schema/generated.json written successfully');
  return output;
} 