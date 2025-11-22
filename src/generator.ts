/**
 * ORM Schema Generator using ts-morph
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema("src");
 */

import { Project, SyntaxKind } from "ts-morph";
import fs from "fs";
import path from "path";

// ==== Type Definitions ====
export interface RelationDef {
  sourceModel: string;
  fieldName: string;
  kind: "onetomany" | "manytoone" | "onetoone" | "manytomany";
  targetModel: string;
  foreignKey: string;
  through?: string;
  meta?: Record<string, string | boolean>;
}

interface FieldMeta {
  type: string;
  meta: Record<string, string | boolean>;
}

interface InterfaceInfo {
  fields: Record<string, FieldMeta>;
  relations: RelationDef[];
}

// ==== Main Generator ====
export default async function generateSchema(srcGlob: string) {
  const project = new Project({ tsConfigFilePath: "tsconfig.json" });
  const files = project.getSourceFiles(srcGlob + "/**/*.ts");
  console.log(`Scanning ${files.length} source files...`);

  const interfaces = new Map<string, InterfaceInfo>();

  // ==== 1. Gather interfaces ====
  for (const sf of files) {
    for (const intf of sf.getInterfaces()) {
      const intfName = intf.getName();
      const fields: Record<string, FieldMeta> = {};
      const relations: RelationDef[] = [];

      for (const prop of intf.getProperties()) {
        const propName = prop.getName();
        let typeNode = prop.getTypeNode();
        let type = typeNode ? typeNode.getText() : prop.getType().getText();
        type = type.replace(/import\(["'][^"']+["']\)\./g, "");
        type = type.replace(/typeof\s+/, "");

        const isOptional = prop.hasQuestionToken();
        const tsType = isOptional ? `${type} | undefined` : type;

        // ==== Parse directives ====
        const directives: Record<string, string | boolean> = {};
        let relationComment = "";
        const jsDocs = prop.getJsDocs();
        if (jsDocs.length) relationComment = jsDocs.map(j => j.getComment() || "").join(" ");
        if (!relationComment) {
          const trailingMatch = prop.getText().match(/\/\/\s*@(.+)/);
          if (trailingMatch) relationComment = trailingMatch[1];
        }
        if (!relationComment) {
          const leadingComments = prop.getLeadingCommentRanges().map(r => r.getText()).join(" ");
          const leadingMatch = leadingComments.match(/@([^\n\r*]+)/);
          if (leadingMatch) relationComment = leadingMatch[1].trim();
        }

        if (relationComment) {
          const parts = relationComment.split(";").map(p => p.trim());
          for (const part of parts) {
            const [k, v] = part.split(":").map(x => x.trim());
            directives[k] = v ?? true;
          }
        }
        // ==== Detect relation using any comment (leading or trailing) ====
        
        const leading = prop
          .getLeadingCommentRanges()
          .map((r) => r.getText())
          .join(" ");
        const trailing = prop
          .getTrailingCommentRanges()
          .map((r) => r.getText())
          .join(" ");
        const comment = (jsDocs + " " + leading + " " + trailing).trim();

        if (/(@relation|@relationship)/.test(comment)) {
          // Properly parse kind and targetModel
          let kind: RelationDef["kind"] = "onetomany";
          let targetModel = propName.replace(/s$/, "");
          let foreignKey = "";
          let through: string | undefined;

          // Match the main relation pattern: @relation|@relationship kind:TargetModel
          const relMatch = comment.match(
            /@(?:relation|relationship)\s+(\w+):(\w+)/
          );
          if (relMatch) {
            kind = relMatch[1] as any; // e.g., "onetoone"
            targetModel = relMatch[2]; // e.g., "User"
          }

          // Match optional foreignKey and through
          const fkMatch = comment.match(/foreignKey:([a-zA-Z0-9_]+)/);
          if (fkMatch) foreignKey = fkMatch[1];

          const throughMatch = comment.match(/through:([a-zA-Z0-9_]+)/);
          if (throughMatch) through = throughMatch[1];

          // Auto-fill default foreignKey if missing
          if (!foreignKey) {
            if (kind === "manytoone")
              foreignKey = `${targetModel.toLowerCase()}Id`;
            else if (kind === "onetomany")
              foreignKey = `${intfName.toLowerCase()}Id`;
            else foreignKey = "id";
          }

          relations.push({
            sourceModel: intfName,
            fieldName: propName,
            kind,
            targetModel,
            foreignKey,
            through,
            meta: directives,
          });

          continue; // skip adding this property to fields
        }

        // ==== Normal field ====
        fields[propName] = { type: tsType, meta: directives };
      }

      interfaces.set(intfName, { fields, relations });
    }
  }

  // ==== 2. Add primary key and timestamps if missing ====
  for (const [modelName, intf] of interfaces.entries()) {
    // Primary key
    const primary = Object.entries(intf.fields).find(
      ([, f]) => f.meta.primaryKey === true
    );
    if (!primary)
      intf.fields["id"] = {
        type: "number",
        meta: { primaryKey: true, auto: true },
      };
    else intf.fields[primary[0]].meta.primaryKey = true;

    // Timestamps
    if (!intf.fields["createdAt"])
      intf.fields["createdAt"] = {
        type: "string",
        meta: { index: true, default: "CURRENT_TIMESTAMP" },
      };
    if (!intf.fields["updatedAt"])
      intf.fields["updatedAt"] = {
        type: "string",
        meta: { index: true, default: "CURRENT_TIMESTAMP" },
      };
  }

  // ==== 3. Map table names from defineModel calls ====
  const output: Record<
    string,
    {
      primaryKey: string;
      fields: Record<string, FieldMeta>;
      relations: RelationDef[];
      table?: string;
    }
  > = {};

  for (const sf of files) {
    sf.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return;
      const call = node.asKind(SyntaxKind.CallExpression)!;
      if (!call.getExpression().getText().endsWith("defineModel")) return;

      const typeArg = call.getTypeArguments()[0];
      const arg0 = call.getArguments()[0];
      if (!typeArg || !arg0) return;

      const typeSymbol = typeArg.getType().getSymbol();
      const modelName = typeSymbol?.getName();
      if (!modelName) return;

      const tableName = arg0.getText().replace(/['"]/g, "");
      const intf = interfaces.get(modelName);
      if (!intf) return;

      const primaryField =
        Object.entries(intf.fields).find(([, f]) => f.meta.primaryKey)?.[0] ||
        "id";

      output[modelName] = {
        primaryKey: primaryField,
        fields: intf.fields,
        relations: intf.relations,
        table: tableName,
      };
    });
  }

  // ==== 4. Write schema to file ====
  const outDir = path.join(srcGlob, "schema");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "generated.ts");

  const jsContent = `
// AUTO-GENERATED SCHEMA
// DO NOT EDIT

export const schema = ${JSON.stringify(output, null, 2)};
`;

  fs.writeFileSync(outFile, jsContent, "utf8");
  console.log("schema/generated.ts written successfully");

  return output as Record<string, any>;
}
