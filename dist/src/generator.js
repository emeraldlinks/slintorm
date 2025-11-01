/**
 * ORM Schema Generator using ts-morph (Fully working)
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema();
 */
import { Project, SyntaxKind } from "ts-morph";
import fs from "fs";
import path from "path";
// ==== Main Generator ====
export default async function generateSchema(srcGlob = "src/**/*.ts") {
    const project = new Project({ tsConfigFilePath: "tsconfig.json" });
    const files = project.getSourceFiles(srcGlob);
    console.log(`Scanning ${files.length} source files...`);
    const interfaces = new Map();
    // ==== 1. Gather interfaces ====
    for (const sf of files) {
        for (const intf of sf.getInterfaces()) {
            const name = intf.getName();
            const fields = {};
            const relations = [];
            for (const prop of intf.getProperties()) {
                const propName = prop.getName();
                const type = prop.getType().getText();
                const isOptional = prop.hasQuestionToken();
                const tsType = isOptional ? `${type} | undefined` : type;
                let relationComment = "";
                const directives = {};
                // ==== Parse JSDoc or inline comments ====
                const jsDocs = prop.getJsDocs();
                if (jsDocs.length)
                    relationComment = jsDocs.map(j => j.getComment() || "").join(" ");
                if (!relationComment) {
                    const trailingMatch = prop.getText().match(/\/\/\s*@(.+)/);
                    if (trailingMatch)
                        relationComment = trailingMatch[1];
                }
                if (!relationComment) {
                    const leadingComments = prop.getLeadingCommentRanges().map(r => r.getText()).join(" ");
                    const leadingMatch = leadingComments.match(/@([^\n\r*]+)/);
                    if (leadingMatch)
                        relationComment = leadingMatch[1].trim();
                }
                // ==== Parse directives ====
                if (relationComment) {
                    const parts = relationComment.split(";").map(p => p.trim());
                    for (const part of parts) {
                        const [k, v] = part.split(":").map(x => x.trim());
                        if (!v)
                            directives[k] = true;
                        else
                            directives[k] = v;
                    }
                }
                // ==== Handle @relation ====
                if (directives["relation"]) {
                    const relationParts = directives["relation"].toString().split(";").map(p => p.trim());
                    const [kindTarget, ...extras] = relationParts;
                    const [kind, targetModelRaw] = kindTarget.split(":").map(x => x.trim());
                    const targetModel = targetModelRaw || propName.replace(/s$/, "");
                    let foreignKey = "";
                    let through = "";
                    for (const extra of extras) {
                        const [k, v] = extra.split(":").map(x => x.trim());
                        if (k === "foreignKey" && v)
                            foreignKey = v;
                        if (k === "through" && v)
                            through = v;
                    }
                    relations.push({
                        sourceModel: name,
                        fieldName: propName,
                        kind: kind,
                        targetModel,
                        foreignKey: foreignKey, // auto-detect later if empty
                        through: through || undefined,
                    });
                    continue; // Skip adding as normal field
                }
                // ==== Normal field ====
                fields[propName] = { type: tsType, meta: directives };
            }
            interfaces.set(name, { fields, relations });
        }
    }
    // ==== 2. Auto-fill missing foreignKeys ====
    for (const intf of interfaces.values()) {
        for (const rel of intf.relations) {
            if (!rel.foreignKey) {
                if (rel.kind === "manytoone") {
                    rel.foreignKey = `${rel.targetModel.toLowerCase()}Id`;
                }
                else if (rel.kind === "onetomany") {
                    rel.foreignKey = `${rel.sourceModel.toLowerCase()}Id`;
                }
                else {
                    rel.foreignKey = "id";
                }
            }
        }
    }
    // ==== 3. Map defineModel calls ====
    const output = {};
    for (const sf of files) {
        sf.forEachDescendant(node => {
            if (node.getKind() === SyntaxKind.CallExpression) {
                const call = node.asKind(SyntaxKind.CallExpression);
                const expr = call.getExpression().getText();
                if (expr.endsWith("defineModel")) {
                    const typeArg = call.getTypeArguments()[0];
                    const arg0 = call.getArguments()[0];
                    if (!typeArg || !arg0)
                        return;
                    const typeSymbol = typeArg.getType().getSymbol();
                    const modelName = typeSymbol?.getName();
                    if (!modelName)
                        return;
                    const tableName = arg0.getText().replace(/['"]/g, "");
                    const intf = interfaces.get(modelName);
                    if (!intf)
                        return;
                    output[modelName] = { fields: intf.fields, relations: intf.relations, table: tableName };
                }
            }
        });
    }
    // ==== 4. Write schema ====
    const outDir = path.join(process.cwd(), "schema");
    if (!fs.existsSync(outDir))
        fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "generated.json"), JSON.stringify(output, null, 2), "utf8");
    console.log("schema/generated.json written successfully");
    return true;
}
