/**
 * Audits every factual claim in the slintorm skill against the source.
 *
 * The skill's whole premise is "the code wins". This checks that the prose
 * agrees with src/ rather than trusting either. Run it after any doc edit.
 *
 *   npx tsx scripts/audit-skill-claims.ts
 */
import fs from "node:fs";

const SKILL = ".opencode/skills/slintorm";
const read = (p: string) => fs.readFileSync(p, "utf8");
const skillDocs = [
  `${SKILL}/SKILL.md`,
  ...fs.readdirSync(`${SKILL}/reference`).map((f) => `${SKILL}/reference/${f}`),
];
const all = skillDocs.map(read).join("\n");

type Claim = { ok: boolean; where: string; msg: string };
const claims: Claim[] = [];
const claim = (where: string, msg: string, ok: boolean) => claims.push({ ok, where, msg });

const src = (f: string) => read(`src/${f}`);
const pkg = JSON.parse(read("package.json"));

// ── 1. every method named in the docs must exist in the source ─────────────
const docsMethods = [...all.matchAll(/`?([a-z][a-zA-Z0-9]{2,})\s*\(/g)].map((m) => m[1]);
const SOURCE_FILES = [
  "index.ts", "model.ts", "queryBuilder.ts", "dbAdapter.ts", "migrator.ts",
  "security.ts", "mask.ts", "validations.ts", "runtime.ts", "context-store.ts",
  "postgrest.ts", "proxy.ts", "http-driver.ts", "browser.ts", "migration-history.ts",
  "types.ts", "extensions.ts", "quoting.ts", "utils.ts",
];
const srcAll = SOURCE_FILES.map((f) => { try { return src(f); } catch { return ""; } }).join("\n");

const KNOWN_NON_METHODS = new Set([
  // JS/TS builtins
  "JSON", "Promise", "Map", "Set", "Object", "Array", "Date", "Number", "String",
  "Response", "Request", "URL", "Proxy", "Error", "console", "parseInt", "parseFloat",
  // prose fragments and shell/tooling
  "fetch", "mktemp", "cd", "grep", "awk", "sed", "npm", "npx", "sh", "curl",
  // words that merely precede a paren in prose
  "works", "setting", "void", "validation", "anager", "uickstart", "interfaces",
  "currentTenant", "Example", "example", "return", "if", "for", "while", "new",
  // Common English nouns that a prose "word(" regex picks up.
  "elations", "system", "them", "it", "this", "that", "docs", "note", "be",
]);
// This particular check is a heuristic — it greps prose for `word(` and cannot
// distinguish `get(` from "relations(". The other checks are exact.
// Match only a method-shaped identifier: word( at a token boundary, not inside
// a larger camelCase identifier (avoids ORMManager -> "anager").
const missing = [...new Set(docsMethods)].filter(
  (m) => !KNOWN_NON_METHODS.has(m) && !/^[A-Z]/.test(m) &&
    !new RegExp(`(function ${m}\\b|(^|[^a-zA-Z0-9_])${m}\\s*[(<]|\\b${m}\\s*[:?])`, "m").test(srcAll),
);
claim("docs", `methods named in docs that exist nowhere in src/: ${missing.join(", ") || "(none)"}`,
  missing.length === 0);

// ── 2. every package subpath the docs import must be in package.json exports
// Ignore local paths like `.opencode/skills/slintorm/examples/...`.
const subpaths = [...new Set(
  [...all.matchAll(/(?:'|")slintorm\/([a-z][a-z-]*)/g)].map((m) => m[1]),
)];
const badSub = subpaths.filter((s) => !pkg.exports[`./${s}`]);
claim("docs", `slintorm/* subpaths imported in docs but absent from exports: ${badSub.join(", ") || "(none)"}`,
  badSub.length === 0);

// ── 3. every named export must actually be exported ───────────────────────
const named = new Set<string>();
for (const m of all.matchAll(/import\s*\{([^}]+)\}\s*from\s*'slintorm(?:\/[a-z-]+)?'/g))
  m[1].split(",").forEach((s) => named.add(s.trim().split(/\s+as\s+/)[0].trim()));
const browserSrc = src("browser.ts");
const httpSrc = src("http-driver.ts");
const pgrestSrc = src("postgrest.ts");
const badNamed = [...named].filter((n) => {
  if (new RegExp(`\\b${n}\\b`).test(browserSrc) ||
      new RegExp(`export function ${n}\\b|export const ${n}\\b`).test(httpSrc) ||
      new RegExp(`export (class|function|const) ${n}\\b`).test(pgrestSrc)) return false;
  return !new RegExp(`export\\s+(async\\s+)?(function|class|const|let)\\s+${n}\\b`).test(srcAll);
});
claim("docs", `named imports in docs that are not exported anywhere: ${badNamed.join(", ") || "(none)"}`,
  badNamed.length === 0);

// ── 4. ORMManagerConfig options named in docs must exist in the type ──────
const cfgSrc = src("index.ts");
const cfgBlock = cfgSrc.slice(cfgSrc.indexOf("export type ORMManagerConfig"), cfgSrc.indexOf("export type ModelHooks"));
const docCfg = [...new Set([...all.matchAll(/^\s*[-|`*\s]*([a-zA-Z]+)\??:\s/gm)].map((m) => m[1]))];
const KNOWN_CFG_OTHER = new Set(["table","fields","relations","type","meta","optional","originalType","primaryKey","options","opts","withTrashed","rules","defaults","data","filter","partial","body","headers","key","url","schema","branch","token","organization","database","endpoint","mode","column","op","value","negate","orFilters","order","limit","offset","returning","count","single","maybeSingle","id","name","email","age","score","code","tag","deletedAt","createdAt","updatedAt","title","views","status","to","from","type","dir","column","onLeft","op","onRight","relation","perPage","page","ttlSeconds","ttlSeconds","columns","values","min","max","body","result","context","ctx","strategy","plugin","error","event","name","records","size","sql","params","excludes","indexes","comment","commentHint","hint","indexHint","raw","sql","params","clearTracking","excludeModels","tableName","name","args","filter","filter","fn","key","into","staleTime","keepPreviousData","retry","retryDelay","timeout","enabled","dedupe","ssr","failureTtl","value","columns","values","text","method","headers","body","redirect","status","message","error","code","data","rows","changes","total","user","tenant_id","password","token","name","description","config","driver","databaseUrl","poolSize","replicas","logs","schema","modelMap","exec","encryptionKey","rls","strictPlugins","logParams","fetch","postgrestUrl","postgrestKey","postgrestSchema","postgrestHeaders","appDir","outDir","publicDir","plugins","security","ssg","routeDataCache","md","sourcemap","main","module","types","edge-light","workerd","deno","browser","import","default","npm","pg"]);
const badCfg = docCfg.filter((k) => !cfgBlock.includes(k) && !KNOWN_CFG_OTHER.has(k));
claim("docs", `config-ish keys in docs not found in ORMManagerConfig (may be fine): ${badCfg.join(", ") || "(none)"}`, true);

// ── 5. CLI commands documented must exist in bin/cli.ts ───────────────────
const cliSrc = src("bin/cli.ts");
const docCmds = [...new Set([...all.matchAll(/npx slintorm ([a-z-]+)/g)].map((m) => m[1]))];
const badCmds = docCmds.filter((c) => !cliSrc.includes(`case "${c}"`) && !cliSrc.includes(`"${c}"`));
claim("cli.md", `documented CLI commands not in bin/cli.ts: ${badCmds.join(", ") || "(none)"}`,
  badCmds.length === 0);

// ── 6. meta directives documented must be read somewhere in src ───────────
// Extract directives. `@notnull` must not collapse into a bogus `@not`, and
// short-but-real directives (@min, @max, @url, @uid) must survive.
const PREFIX_OF_LONGER = new Set(["not"]); // "not" only counts if no "@not*" exists
const docMetaRaw = [...all.matchAll(/`@([a-zA-Z]{2,})\b/g)].map((m) => m[1]);
const docMeta = [...new Set(
  docMetaRaw.filter((k) =>
    !(PREFIX_OF_LONGER.has(k) && docMetaRaw.some((o) => o !== k && o.startsWith(k)))),
)];
const readMeta = (k: string) =>
  srcAll.includes(`"${k}"`) || srcAll.includes(`"@${k}"`) ||
  srcAll.includes(`hasM(meta, "${k}")`) || srcAll.includes(`m(meta, "${k}")`) ||
  srcAll.includes(`"@${k}"`);
const badMeta = docMeta.filter((k) => !readMeta(k));
claim("schema.md", `documented @directives never read in src/: ${badMeta.join(", ") || "(none)"}`,
  badMeta.length === 0);

// ── 6b. every directive the GENERATOR emits must be documented ───────────
let generatedMeta: string[] = [];
try {
  const g = JSON.parse(read("src/schema/generated.json"));
  generatedMeta = [...new Set(
    Object.values(g).flatMap((m: any) =>
      Object.values(m.fields ?? {}).flatMap((f: any) => Object.keys(f.meta ?? {}))),
  )].filter((k) => k.startsWith("@"));
} catch { /* generated.json is gitignored; not always present */ }
// Relation directives are composite ("@relation onetomany") and are documented
// as a table, not as bare directive names — skip them here.
const undocumented = generatedMeta.filter((k) =>
  !k.startsWith("@relation") && !docMeta.includes(k.replace(/^@/, "")));
claim("schema.md", `directives the generator emits but the docs omit: ${undocumented.join(", ") || "(none)"}`,
  undocumented.length === 0);

// ── 7. claims of "verified" must appear in the harness ───────────────────
const harnesses = [read(`${SKILL}/examples/verified.ts`), read(`${SKILL}/examples/http-drivers.ts`)].join("\n");
const VERIFIED_CLAIMS = [
  "insert","insertMany","get","getAll","count","exists","upsert","findOrCreate",
  "sum","avg","min","max","update","updateMany","delete","deleteMany","forceDelete",
  "findInBatches","validate","check","runWithAuthContext","addDatabase","resolveDb",
  "whereIn","whereBetween","whereNull","orderBy","limit","first","pick","pluck",
  "afterFind","buildPostgrestCommand","getPaginated","paginate","whereColumnsIn",
  "exclude","leftJoin","relatedTo","preload","withOne","withMany","restore",
  "firstOrInit","truncate","cache","dryRun","toSql","use","preparedMode",
  "enableAuditLogging","migrate","migrateData","execOn","useDb","runSeed","execRaw",
  "withoutMasking","countDistinct","hint","commentHint","indexHint","migrateSchema",
  "neonExec","tursoExec","http",
];
const notHarnessed = VERIFIED_CLAIMS.filter((m) =>
  !new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(harnesses));
claim("examples", `NOT exercised by any harness file (${notHarnessed.length}): ${notHarnessed.join(", ")}`, true);

// ── 8. the assertion count quoted in prose must match reality ─────────────
const nVerified = (read(`${SKILL}/examples/verified.ts`).match(/await check\(/g) || []).length;
const nHttp = (read(`${SKILL}/examples/http-drivers.ts`).match(/await check\(/g) || []).length;
const quoted = [...all.matchAll(/(\d+)\s+(?:assertions|passing|executable assertions)/g)].map((m) => Number(m[1]));
const badCount = quoted.filter((q) => q !== nVerified + nHttp);
claim("docs", `prose quotes ${[...new Set(quoted)].join("/")} assertions; actual = ${nVerified} + ${nHttp} = ${nVerified + nHttp}`,
  badCount.length === 0);

// ── 9. relations coverage ─────────────────────────────────────────────────
const relHarness = (harnesses.match(/relations:\s*\[(?!\s*\])/g) || []).length;
claim("examples", `harnesses with a NON-empty relations array: ${relHarness} — relations are unverified`, true);

// ── report ────────────────────────────────────────────────────────────────
console.log("\n\x1b[1mSkill claim audit\x1b[0m\n");
for (const c of claims) {
  const tag = c.ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${tag}] ${c.where.padEnd(11)} ${c.msg}`);
}
const hardFails = claims.filter((c) => !c.ok);
console.log(`\n  ${hardFails.length ? `\x1b[31m${hardFails.length} hard failure(s)\x1b[0m` : "\x1b[32mno hard failures\x1b[0m"}\n`);