/**
 * ORM Schema Generator using ts-morph
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */
import fs from "fs";
import path from "path";

// Lightweight schema generator without ts-morph
// This parses TypeScript source files heuristically to extract interface
// definitions and comment directives used by the ORM. It's intentionally
// simple and fast compared to ts-morph.

function readFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      out.push(...readFiles(p));
    } else if (e.isFile() && p.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function parseInterfacesFromSource(src: string) {
  const interfaces: Record<string, { fields: Record<string, any>; relations: any[] }> = {};

  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/interface\s+(\w+)\s*{\s*$/);
    if (m) {
      const name = m[1];
      const bodyLines: string[] = [];
      i++;
      let depth = 1;
      for (; i < lines.length; i++) {
        const L = lines[i];
        if (L.includes("{")) depth++;
        if (L.includes("}")) {
          depth--;
          if (depth === 0) break;
        }
        bodyLines.push(L);
      }

      const fields: Record<string, any> = {};
      const relations: any[] = [];

      for (let j = 0; j < bodyLines.length; j++) {
        const L = bodyLines[j];
        if (L.trim().startsWith("//")) continue;
        const propMatch = L.match(/\s*([A-Za-z0-9_]+)(\?)?\s*:\s*([^;]+);?/);
        if (!propMatch) continue;
        const propName = propMatch[1];
        const isOptional = !!propMatch[2];
        let type = propMatch[3].trim();
        type = type.replace(/\s+/g, " ");
        const originalType = type;
        if (isOptional && !/undefined/.test(type)) type = `${type} | undefined`;

        let comment = "";
        for (let k = j - 1; k >= 0; k--) {
          const prev = bodyLines[k].trim();
          if (prev.startsWith("//")) {
            comment = prev.replace(/^\/\/\s?/, "") + " " + comment;
            continue;
          }
          break;
        }

        const trailing = L.match(/\/\/\s*@(.+)$/);
        if (trailing) comment = trailing[1].trim() + (comment ? "; " + comment : "");

        const directives: Record<string, any> = {};
        if (comment) {
          const parts = comment.split(";").map(p => p.trim()).filter(Boolean);
          for (const part of parts) {
            const [k, v] = part.split(":").map(x => x.trim());
            if (k) directives[k] = v === undefined ? true : v;
          }
        }

        if (/@(relation|@relationship|relationship)/i.test(comment)) {
          const relMatch = comment.match(/@(?:relation|relationship)\s+(\w+):(\w+)/i);
          const fkMatch = comment.match(/foreignKey:([A-Za-z0-9_]+)/i);
          const throughMatch = comment.match(/through:([A-Za-z0-9_]+)/i);
          let kind = relMatch ? relMatch[1].toLowerCase() : 'onetomany';
          let target = relMatch ? relMatch[2] : propName.replace(/s$/i, '');
          let fk = fkMatch ? fkMatch[1] : '';
          const through = throughMatch ? throughMatch[1] : undefined;
          if (!fk) {
            if (kind === 'manytoone') fk = `${target.toLowerCase()}Id`;
            else if (kind === 'onetomany') fk = `${name.toLowerCase()}Id`;
            else fk = 'id';
          }
          relations.push({ sourceModel: name, fieldName: propName, kind, targetModel: target, foreignKey: fk, through, meta: directives });
          continue;
        }

        fields[propName] = { type, originalType, optional: isOptional, meta: directives };
      }

      interfaces[name] = { fields, relations };
    }
  }

  return interfaces;
}

export default async function generateSchema(srcGlob: string) {
  const abs = path.resolve(process.cwd(), srcGlob);
  const files = readFiles(abs);
  console.log(`Scanning ${files.length} source files...`);

  // Fast path: if generated file exists and is newer than all source files,
  // skip regeneration and return the existing schema.
  try {
    const outFileAbs = path.join(process.cwd(), srcGlob, "schema", "generated.ts");
    if (fs.existsSync(outFileAbs)) {
      const genStat = fs.statSync(outFileAbs);
      let newest = 0;
      for (const f of files) {
        try { const st = fs.statSync(f); if (st.mtimeMs > newest) newest = st.mtimeMs; } catch {}
      }
      if (genStat.mtimeMs >= newest) {
        // read and extract JSON object from file
        const content = fs.readFileSync(outFileAbs, "utf8");
        const m = content.match(/export const schema\s*=\s*(\{[\s\S]*\});?/m);
        if (m && m[1]) {
          try {
            const parsed = JSON.parse(m[1]);
            console.log("Using cached schema/generated.ts (up-to-date)");
            return parsed;
          } catch (err) {
            // fall through to regenerate if parse fails
          }
        }
      }
    }
  } catch (err) {
    // ignore caching errors and continue to generate
  }

  const allInterfaces: Record<string, any> = {};
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const parsed = parseInterfacesFromSource(src);
    Object.assign(allInterfaces, parsed);
  }

  for (const [modelName, intf] of Object.entries(allInterfaces)) {
    if (!intf.fields['id']) intf.fields['id'] = { type: 'number', originalType: 'number', optional: true, meta: { primaryKey: true, auto: true } };
    intf.fields['createdAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
    intf.fields['updatedAt'] = { type: 'string', originalType: 'string', optional: true, meta: { index: true, default: 'CURRENT_TIMESTAMP' } };
  }

  const output: Record<string, any> = {};
  const modelInterfaces: string[] = [];
  const defineRe = /defineModel\s*<\s*(\w+)\s*>\s*\(\s*['"]([^'"]+)['"]/g;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = defineRe.exec(src)) !== null) {
      const intfName = m[1];
      const tableName = m[2];
      const intf = allInterfaces[intfName];
      if (!intf) continue;
      const primary = Object.entries(intf.fields).find(([, v]: any) => v.meta?.primaryKey) || ['id'];
      output[intfName] = { primaryKey: primary[0], fields: intf.fields, relations: intf.relations || [], table: tableName };
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

  const outDir = path.join(srcGlob, 'schema');
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

