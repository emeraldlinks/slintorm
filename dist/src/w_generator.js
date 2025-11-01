/**
 * ORM Schema Generator using ts-morph
 *
 * Usage:
 *   import { generateSchema } from './generator';
 *   await generateSchema();
 */
import { Project, SyntaxKind } from "ts-morph";
import fs from "fs";
import path from "path";
export default async function generateSchema(srcGlob = "src/**/*.ts") {
    const project = new Project({ tsConfigFilePath: "tsconfig.json" });
    const files = project.getSourceFiles(srcGlob);
    console.log(`Scanning ${files.length} source files...`);
    const interfaces = new Map();
    // 1. Gather interfaces
    for (const sf of files) {
        // console.log(`Processing file: ${sf.getBaseName()}`);
        for (const intf of sf.getInterfaces()) {
            const name = intf.getName();
            // console.log(`  Found interface: ${name}`);
            const fields = {};
            const relations = [];
            for (const prop of intf.getProperties()) {
                const propName = prop.getName();
                const type = prop.getType().getText();
                const jsDocs = prop.getJsDocs();
                // Detect @relation in JSDoc or comments
                let relComment = "";
                if (jsDocs.length)
                    relComment = jsDocs.map(j => j.getComment() || "").join(" ");
                if (!relComment) {
                    const trailingMatch = prop.getText().match(/\/\/\s*@relation\s+(.+)/);
                    if (trailingMatch)
                        relComment = trailingMatch[1];
                }
                if (!relComment) {
                    const leadingComments = prop.getLeadingCommentRanges().map(r => r.getText()).join(" ");
                    const leadingMatch = leadingComments.match(/@relation\s+([^\n\r*]+)/);
                    if (leadingMatch)
                        relComment = leadingMatch[1].trim();
                }
                // If @relation found → parse relation metadata
                if (relComment) {
                    try {
                        const parts = relComment.split(";").map(p => p.trim());
                        const [kindRaw, targetModel] = parts[0].split(":").map(p => p.trim());
                        if (!kindRaw || !targetModel)
                            throw new Error(`Invalid @relation format on ${propName}`);
                        const rel = {
                            sourceModel: name,
                            fieldName: propName,
                            kind: kindRaw,
                            targetModel,
                        };
                        for (const p of parts.slice(1)) {
                            const [k, v] = p.split(":").map(x => x.trim());
                            if (k === "foreignKey")
                                rel.foreignKey = v;
                            if (k === "through")
                                rel.through = v;
                        }
                        // Avoid duplicates if schema re-generated
                        if (!relations.find(r => r.fieldName === propName)) {
                            relations.push(rel);
                        }
                    }
                    catch (err) {
                        if (err instanceof Error)
                            console.error(`Error parsing @relation on ${name}.${propName}:`, err.message);
                    }
                }
                else {
                    // Only add as normal field if not a relation field
                    fields[propName] = type;
                }
            }
            interfaces.set(name, { fields, relations });
        }
    }
    // 2. Find defineModel calls
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
                    if (!modelName) {
                        console.error(`Could not resolve type argument for defineModel at ${sf.getBaseName()}:${call.getStartLineNumber()}`);
                        return;
                    }
                    const tableName = arg0.getText().replace(/['"]/g, "");
                    const intf = interfaces.get(modelName);
                    if (!intf) {
                        console.error(`Interface ${modelName} not found for table ${tableName}`);
                        return;
                    }
                    console.log(`Mapping model ${modelName} to table ${tableName}`);
                    output[modelName] = { fields: intf.fields, relations: intf.relations, table: tableName };
                }
            }
        });
    }
    // 3. Validate and write schema
    if (Object.keys(output).length === 0) {
        console.error("No models found! Schema generation aborted.");
        return false;
    }
    const outDir = path.join(process.cwd(), "schema");
    if (!fs.existsSync(outDir))
        fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "generated.json"), JSON.stringify(output, null, 2), "utf8");
    console.log("schema/generated.json written successfully");
    return true;
}
// // Optional: auto-run if called directly
// if (require.main === module) {
//   generateSchema().catch(err => {
//     console.error("Schema generation failed:", err);
//     process.exit(1);
//   });
// }
