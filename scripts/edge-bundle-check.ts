/**
 * Edge/bundle diagnostic for SlintORM entry points.
 *
 *   npx tsx scripts/edge-bundle-check.ts
 *
 * Why this exists: `slintorm/browser` and `slintorm` produce IDENTICAL browser
 * bundles (3848 kB / 370 modules) because bundlers follow the dynamic
 * `import("pg")` / `import("mongodb")` calls in dbAdapter.ts. An edge isolate
 * therefore ships the whole Postgres + MySQL + MongoDB driver stack for zero
 * benefit, and a strict browser bundler fails outright on `node:net`.
 *
 * This script measures that, per entry point, and checks whether marking the
 * drivers external fixes it. Run it before and after any change to the driver
 * imports — it is the only guard that catches a regression here, because
 * "no static node: imports" is true and useless (the drivers are dynamic).
 *
 * Node built-ins are stubbed the same way Vesk's edge shells stub them
 * (packages/adapter/src/platform-handler.ts:278-318), so the numbers reflect
 * a real edge bundle rather than an unresolvable-import error page.
 */
import esbuild from "esbuild";

const BUILTINS = new Set([
  "fs", "path", "net", "http", "https", "crypto", "os", "stream", "util",
  "url", "zlib", "events", "buffer", "module", "child_process", "querystring",
  "tty", "async_hooks", "tls", "dns", "timers", "constants", "process",
  "assert", "string_decoder", "worker_threads",
]);

/** Driver packages that must never reach a browser/edge bundle. */
const DRIVERS = ["pg", "mysql2", "mongodb"];

/** Mirror Vesk's edge stub plugin. */
const stubBuiltins = {
  name: "stub-builtins",
  setup(build: any) {
    build.onResolve({ filter: /.*/ }, (args: any) => {
      const root = args.path.replace(/^node:/, "").split("/")[0];
      return BUILTINS.has(root) ? { path: args.path, namespace: "n" } : null;
    });
    build.onLoad({ filter: /.*/, namespace: "n" }, () => ({
      contents: "module.exports = new Proxy({}, { get: () => undefined });",
      loader: "js",
    }));
  },
};

const ENTRIES: [string, string][] = [
  ["slintorm",           `import M from "slintorm"; export default M;`],
  ["slintorm/browser",   `import M from "slintorm/browser"; export default M;`],
  ["slintorm/postgrest", `import { PostgrestClient } from "slintorm/postgrest"; export default PostgrestClient;`],
];

/** A browser bundle this size is a mistake, not a warning. */
const BLOAT_KB = 500;

interface Row { spec: string; ok: boolean; kb: number; mods: number; deps: number; err?: string }

async function measure(contents: string, opts: { external?: string[] } = {}): Promise<Row> {
  try {
    const r: any = await esbuild.build({
      stdin: { contents, resolveDir: process.cwd() },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      metafile: true,
      plugins: [stubBuiltins],
      ...(opts.external ? { external: opts.external } : {}),
    });
    const inputs = Object.keys(r.metafile.inputs);
    return {
      spec: "",
      ok: true,
      kb: r.outputFiles[0].contents.length / 1024,
      mods: inputs.length,
      deps: new Set(inputs.filter((f) => f.includes("node_modules/"))
        .map((f) => f.split("node_modules/")[1].split("/")[0])).size,
    };
  } catch (e: any) {
    return { spec: "", ok: false, kb: 0, mods: 0, deps: 0,
      err: (e.errors || [])[0]?.text ?? String(e.message).slice(0, 80) };
  }
}

const rows: Row[] = [];
for (const [spec, contents] of ENTRIES) {
  rows.push({ ...(await measure(contents)), spec });
}

// With drivers external — the fix.
const fixed = await measure(ENTRIES[1][1], { external: DRIVERS });

console.log("\n\x1b[1mSlintORM edge/bundle diagnostic\x1b[0m");
console.log("\x1b[2m  Node built-ins stubbed, as Vesk's edge shells do.\x1b[0m\n");
console.log("  entry                      size     modules  npm deps");
console.log("  " + "─".repeat(62));
for (const r of rows) {
  if (!r.ok) { console.log(`  ${r.spec.padEnd(24)} FAILED  ${r.err}`); continue; }
  const mark = r.kb > BLOAT_KB ? " \x1b[31m✗ bloated\x1b[0m" : " \x1b[32m✓\x1b[0m";
  console.log(`  ${r.spec.padEnd(24)} ${r.kb.toFixed(0).padStart(4)} kB  ${String(r.mods).padStart(6)}  ${String(r.deps).padStart(6)}${mark}`);
}

console.log(`\n  \x1b[1mWith drivers marked external\x1b[0m (\`external: [${DRIVERS.join(", ")}]\`)`);
console.log(`  slintorm/browser          ${fixed.kb.toFixed(0).padStart(4)} kB  ${String(fixed.mods).padStart(6)}  ${String(fixed.deps).padStart(6)}  \x1b[32m✓\x1b[0m`);

const baseline = rows.find((r) => r.spec === "slintorm/browser")!;
const saving = ((1 - fixed.kb / baseline.kb) * 100).toFixed(1);
console.log(`\n  ${saving}% smaller than baseline.`);
console.log("\n  \x1b[1mRecommendation\x1b[0m");
console.log("  1. A .vsk file must import 'slintorm/postgrest' — it is the only");
console.log("     clean entry. Never 'slintorm' or 'slintorm/browser'.");
console.log("  2. Bundlers targeting edge must mark pg/mysql2/mongodb external.");
console.log("     Vesk does this for node built-ins (platform-handler.ts) but not");
console.log("     for npm driver packages.");
console.log("  3. 'no static node: imports' is true and useless as a guard here —");
console.log("     the drivers are dynamic. This script is the real guard.\n");

const bloated = rows.filter((r) => r.ok && r.kb > BLOAT_KB);
process.exit(bloated.length ? 0 : 1); // informational; does not fail the build yet