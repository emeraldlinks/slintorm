/**
 * ORM Schema Generator using ts-morph
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */
import fs from "fs";
import path from "path";

// Type definitions for better autocomplete and compile-time checks
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

// Lightweight tokenizer
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

    // Whitespace (non-newline)
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

    // Newline
    if (ch === '\n' || (ch === '\r' && nextCh === '\n')) {
      const value = ch === '\r' ? '\r\n' : '\n';
      tokens.push({ type: 'newline', value, line, column });
      i += value.length;
      line++;
      column = 1;
      continue;
    }

    // Line comment
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

    // Block comment
    if (ch === '/' && nextCh === '*') {
      const startCol = column;
      let value = '';
      let commentLine = line;
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

    // Template literal with interpolation
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

    // String literals (double or single quote)
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

    // Numbers (including floats, hex, scientific notation)
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(nextCh))) {
      const startCol = column;
      let value = '';
      // Handle hex, binary, octal
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
        // Regular decimal or float
        while (i < src.length && /[\d_.]/.test(src[i])) {
          value += src[i];
          i++;
          column++;
        }
        // Scientific notation
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

    // Identifiers and keywords
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

    // Single character tokens
    const singleCharMap: Record<string, TokenType> = {
      '{': 'brace-open',
      '}': 'brace-close',
      '[': 'bracket-open',
      ']': 'bracket-close',
      '<': 'angle-open',
      '>': 'angle-close',
      ':': 'colon',
      '?': 'question',
      ';': 'semicolon',
      ',': 'comma',
      '=': 'equals',
      '|': 'pipe',
      '@': 'at',
      '.': 'dot',
    };

    if (singleCharMap[ch]) {
      tokens.push({ type: singleCharMap[ch], value: ch, line, column });
      i++;
      column++;
      continue;
    }

    // Skip unknown characters
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

/**
 * Encapsulated token parser with proper state management.
 * Eliminates global state mutation and provides standard parser interface.
 */
class InterfaceTokenParser {
  private tokens: Token[];
  private i = 0;
  private seenInterfaces = new Set<string>();
  private lastComment = ""; // Local to each field, cleared after consumption
  private readonly interfaces: Record<string, InterfaceDefinition> = {};

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse all interfaces from token stream.
   */
  parse(): Record<string, InterfaceDefinition> {
    while (this.i < this.tokens.length) {
      this.skipWhitespaceAndComments();
      if (this.i >= this.tokens.length) break;

      if (this.parseInterfaceDeclaration()) {
        // Successfully parsed interface, continue
      } else {
        this.i++;
      }
    }
    return this.interfaces;
  }

  /**
   * Peek at current token without consuming.
   */
  private peek(): Token | null {
    return this.i < this.tokens.length ? this.tokens[this.i] : null;
  }

  /**
   * Peek ahead N tokens.
   */
  private peekAhead(n: number): Token | null {
    return this.i + n < this.tokens.length ? this.tokens[this.i + n] : null;
  }

  /**
   * Consume and return current token.
   */
  private next(): Token | null {
    const token = this.peek();
    if (token) this.i++;
    return token;
  }

  /**
   * Consume token if it matches type, else return null.
   */
  private consume(type: TokenType): Token | null {
    if (this.peek()?.type === type) {
      return this.next();
    }
    return null;
  }

  /**
   * Skip whitespace and newlines. Accumulate comments into lastComment.
   */
  private skipWhitespaceAndComments(): void {
    while (this.i < this.tokens.length) {
      const token = this.peek();
      if (!token) break;

      if (token.type === 'whitespace' || token.type === 'newline') {
        this.next();
      } else if (token.type === 'comment-line') {
        const text = token.value.replace(/^\/\/\s?/, "");
        this.lastComment = text;
        this.next();
      } else if (token.type === 'comment-block') {
        const text = token.value.replace(/^\/\*/, "").replace(/\*\/$/, "").trim();
        this.lastComment = text;
        this.next();
      } else {
        break;
      }
    }
  }

  /**
   * Parse interface or type declaration.
   */
  private parseInterfaceDeclaration(): boolean {
    const startLine = this.peek()?.line ?? 0;

    // Skip export keyword if present
    if (this.peek()?.type === 'export') {
      this.next();
      this.skipWhitespaceAndComments();
    }

    // Match interface or type
    const declType = this.peek()?.type;
    if (declType !== 'interface' && declType !== 'type') {
      return false;
    }
    this.next();
    this.skipWhitespaceAndComments();

    // Get interface name
    const nameToken = this.peek();
    if (nameToken?.type !== 'identifier') {
      this.reportError(startLine, "Expected interface name");
      return false;
    }
    const name = nameToken.value;
    this.next();

    // Check for duplicates
    if (this.seenInterfaces.has(name)) {
      console.warn(`Warning: Interface/type "${name}" defined multiple times (line ${startLine})`);
    }
    this.seenInterfaces.add(name);

    this.skipWhitespaceAndComments();

    // For 'type', skip '=' and possible object literal
    if (declType === 'type') {
      if (this.consume('equals')) {
        this.skipWhitespaceAndComments();
      }
    }

    // Expect opening brace
    if (!this.consume('brace-open')) {
      this.reportError(startLine, "Expected '{' after interface name");
      return false;
    }

    const fields: Record<string, FieldDefinition> = {};
    const relations: RelationDefinition[] = [];

    // Parse fields until closing brace
    while (this.i < this.tokens.length && this.peek()?.type !== 'brace-close') {
      this.skipWhitespaceAndComments();

      if (this.peek()?.type === 'brace-close') break;

      const fieldLine = this.peek()?.line ?? 0;
      if (!this.parseField(name, fields, relations, fieldLine)) {
        // Skip invalid field
        if (this.peek()?.type === 'identifier') {
          this.reportError(fieldLine, `Invalid field: ${this.peek()?.value}`);
        }
        this.next();
      }

      // Clear comment after field consumed
      this.lastComment = "";
    }

    if (!this.consume('brace-close')) {
      this.reportError(startLine, "Expected '}' to close interface");
      return false;
    }

    this.interfaces[name] = { fields, relations };
    return true;
  }

  /**
   * Parse a single field definition.
   * Returns true if field was successfully parsed.
   */
  private parseField(
    interfaceName: string,
    fields: Record<string, FieldDefinition>,
    relations: RelationDefinition[],
    lineNum: number
  ): boolean {
    // Expect property name
    if (this.peek()?.type !== 'identifier') {
      return false;
    }
    const propName = this.next()!.value;

    this.skipWhitespaceAndComments();

    // Optional '?'
    let isOptional = false;
    if (this.consume('question')) {
      isOptional = true;
      this.skipWhitespaceAndComments();
    }

    // Required ':'
    if (!this.consume('colon')) {
      this.reportError(lineNum, `Expected ':' after property '${propName}'`);
      return false;
    }

    this.skipWhitespaceAndComments();

    // Extract type tokens until semicolon at depth 0
    const typeTokens = this.extractTypeTokens();

    if (!this.consume('semicolon')) {
      this.reportError(lineNum, `Expected ';' after type for '${propName}'`);
    }

    this.skipWhitespaceAndComments();

    // Reconstruct type with proper formatting
    const type = this.reconstructType(typeTokens, isOptional);
    const originalType = this.reconstructType(typeTokens, false);

    // Parse comment-based metadata
    const meta = this.parseMetadata(this.lastComment);

    // Check for relation directive
    if (/@(?:relation|relationship)/i.test(this.lastComment)) {
      const relationData = this.parseRelationDirective(this.lastComment, propName, interfaceName);
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
        return true;
      }
    }

    fields[propName] = { type, originalType, optional: isOptional, meta };
    return true;
  }

  /**
   * Extract type tokens until semicolon at depth 0.
   * Uses ONLY token structure for nesting (no manual depth tracking).
   */
  private extractTypeTokens(): Token[] {
    const typeTokens: Token[] = [];
    let depth = 0;

    while (this.i < this.tokens.length) {
      const token = this.peek();
      if (!token) break;

      // Track nesting via token types
      if (token.type === 'bracket-open' || token.type === 'brace-open' || token.type === 'angle-open') {
        depth++;
      } else if (token.type === 'bracket-close' || token.type === 'brace-close' || token.type === 'angle-close') {
        depth--;
      }

      // Stop at semicolon at depth 0
      if (token.type === 'semicolon' && depth === 0) {
        break;
      }

      typeTokens.push(token);
      this.next();
    }

    return typeTokens;
  }

  /**
   * Reconstruct type string from tokens with improved formatting.
   * Preserves semantic structure (generics, nested types).
   */
  private reconstructType(tokens: Token[], addOptional: boolean): string {
    if (tokens.length === 0) return "unknown";

    // Filter out whitespace/newlines/comments
    const significant = tokens.filter(
      t => t.type !== 'whitespace' && t.type !== 'newline' && 
           t.type !== 'comment-line' && t.type !== 'comment-block'
    );

    if (significant.length === 0) return "unknown";

    // Build type with smart spacing
    let result = "";
    for (let i = 0; i < significant.length; i++) {
      const token = significant[i];
      const prev = i > 0 ? significant[i - 1] : null;
      const next = i < significant.length - 1 ? significant[i + 1] : null;

      // No space after opening brackets
      if (prev && (prev.type === 'bracket-open' || prev.type === 'brace-open' || prev.type === 'angle-open')) {
        result += token.value;
      }
      // No space before closing brackets
      else if (next && (next.type === 'bracket-close' || next.type === 'brace-close' || next.type === 'angle-close')) {
        result += token.value;
      }
      // Space around pipes (union types)
      else if (token.type === 'pipe') {
        result += " | ";
      }
      // Default: single space between tokens
      else {
        result += (result && result[result.length - 1] !== ' ' ? ' ' : '') + token.value;
      }
    }

    result = result.replace(/\s+/g, ' ').trim();

    // Add optional type if needed
    if (addOptional && !/undefined/.test(result)) {
      result = `${result} | undefined`;
    }

    return result;
  }

  /**
   * Parse metadata directives from comment text.
   * Example: "primary:true; index:btree" → { primary: true, index: "btree" }
   */
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

  /**
   * Parse @relation directive from comment.
   * Example: "@relation manyToOne:User foreignKey:userId"
   */
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

    // Auto-generate foreign key if not specified
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

  /**
   * Report parsing error with line number for debugging.
   */
  private reportError(line: number, message: string): void {
    const context = this.peek();
    const lineInfo = context ? ` (line ${context.line}, col ${context.column})` : ` (line ${line})`;
    console.warn(`[Parser Error]${lineInfo}: ${message}`);
  }
}

function parseInterfacesFromTokens(tokens: Token[]): Record<string, InterfaceDefinition> {
  const parser = new InterfaceTokenParser(tokens);
  return parser.parse();
}

export default async function generateSchema(srcGlob: string) {
  const abs = path.resolve(process.cwd(), srcGlob);
  const files = readFiles(abs);
  console.log(`Scanning ${files.length} source files...`);

  // Fast path: if generated file exists and is newer than all source files,
  // skip regeneration and return the existing schema.
  try {
    const jsonOut = path.join(abs, "schema", "generated.json");
    if (fs.existsSync(jsonOut)) {
      const genStat = fs.statSync(jsonOut);
      let newest = 0;
      for (const f of files) {
        try { const st = fs.statSync(f); if (st.mtimeMs > newest) newest = st.mtimeMs; } catch {}
      }
      if (genStat.mtimeMs >= newest) {
        const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
        console.log("Using cached schema/generated.json");
        return parsed;
      }
    }
  } catch (err) {
    // ignore caching errors and continue to generate
  }

  const allInterfaces: Record<string, InterfaceDefinition> = {};
  const interfaceSourceMap: Record<string, string> = {}; // Track where each interface comes from
  
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

  for (const [modelName, intf] of Object.entries(allInterfaces)) {
    if (!intf.fields['id']) intf.fields['id'] = { type: 'number', originalType: 'number', optional: true, meta: { primaryKey: true, auto: true } };
    if (!intf.fields['createdAt']) intf.fields['createdAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
    if (!intf.fields['updatedAt']) intf.fields['updatedAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
  }

  const output: Record<string, ModelDefinition> = {};
  const modelInterfaces: string[] = [];
  // More flexible regex: match defineModel even with nested property access (e.g., orm.models.defineModel)
  const defineRe = /(?:[\w$.]+\.)?defineModel\s*<\s*(\w+)\s*>\s*\(\s*['"]([^'"]+)['"]/g;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = defineRe.exec(src)) !== null) {
      const intfName = m[1];
      const tableName = m[2];
      const intf = allInterfaces[intfName];
      if (!intf) continue;
      
      // Warn about duplicate model registrations
      if (output[intfName]) {
        console.warn(`Model "${intfName}" registered multiple times (overwriting previous definition)`);
      }
      
      const primary = Object.entries(intf.fields).find(([, v]: any) => v.meta?.primaryKey) || ['id'];
      const modelDef: ModelDefinition = { 
        primaryKey: primary[0], 
        fields: intf.fields, 
        relations: intf.relations, 
        table: tableName 
      };
      output[intfName] = modelDef;
    }
  }

  // Validate relation targets exist and foreign keys are valid
  for (const [modelName, modelDef] of Object.entries(output)) {
    for (const rel of modelDef.relations) {
      const targetInterface = allInterfaces[rel.targetModel];
      if (!targetInterface) {
        console.warn(`Unknown relation target "${rel.targetModel}" in ${modelName}.${rel.fieldName}`);
      } else if (rel.foreignKey && !targetInterface.fields[rel.foreignKey]) {
        console.warn(`Foreign key field "${rel.foreignKey}" not found in ${rel.targetModel} (referenced in ${modelName}.${rel.fieldName})`);
      }
    }
  }

  for (const [modelName] of Object.entries(output)) {
    const intf = allInterfaces[modelName];
    const props: string[] = [];
    for (const [propName, propDef] of Object.entries(intf.fields) as [string, { optional?: boolean; originalType: string } ][]) {
      const optional = propDef.optional ? "?" : "";
      props.push(`  ${propName}${optional}: ${propDef.originalType};`);
    }
    for (const rel of intf.relations || []) {
      const relType = rel.kind === "onetomany" || rel.kind === "manytomany"
        ? `${rel.targetModel}[]`
        : rel.targetModel;
      props.push(`  ${rel.fieldName}?: ${relType};`);
    }
    modelInterfaces.push(`export interface ${modelName} {\n${props.join("\n")}\n}`);
  }

  const modelMapEntries = Object.keys(output).map((name) => `  ${name}: ${name};`);

  const outDir = path.join(abs, 'schema');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'generated.ts');
  const jsContent = `\n// AUTO-GENERATED SCHEMA\n// DO NOT EDIT\n\n${modelInterfaces.join("\n\n")}\n\nexport type ModelMap = {\n${modelMapEntries.join("\n")}\n};\n\nexport const schema = ${JSON.stringify(output, null, 2)} as const;\n\nexport type Schema = typeof schema;\nexport type ModelName = keyof ModelMap;\n`;
  fs.writeFileSync(outFile, jsContent, 'utf8');
  // Also write a plain JSON file for fast, reliable caching and for
  // tools/tests to consume without parsing the generated TS file.
  const jsonOut = path.join(outDir, 'generated.json');
  fs.writeFileSync(jsonOut, JSON.stringify(output, null, 2), 'utf8');
  console.log('schema/generated.ts and schema/generated.json written successfully');
  return output;
}

