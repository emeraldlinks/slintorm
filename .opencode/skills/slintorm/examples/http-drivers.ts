/**
 * Verify the HTTP drivers (slintorm/edge) — the claim was undocumented and
 * untested, which is exactly the failure mode this harness exists to catch.
 *
 * Also resolves a config-field discrepancy: SERVERLESS.md and the dbAdapter
 * error message both say `neonExec({ url })`, but HttpDriverConfig declares
 * `endpoint`. This settles which one actually works.
 */
import assert from "node:assert/strict";

/**
 * Resolve a SlintORM module from either context: an installed skill in a
 * consumer project, or a checkout of the repo. Same strategy as verified.ts —
 * without it this file only runs in-repo, which is how it originally shipped.
 */
async function importOf(specs: string[]) {
  for (const s of specs) {
    try { return await import(s); } catch { /* try next */ }
  }
  throw new Error(
    `Cannot resolve any of: ${specs.join(", ")}\n` +
      "Run from a project that depends on slintorm, or from inside the repo.",
  );
}

// Resolved inside main() — top-level await fails when the nearest package.json
// is CJS, which is the case under .opencode/.
let neonExec: any, tursoExec: any, http: any;

let pass = 0, fail = 0;
function check(name: string, fn: () => Promise<unknown> | unknown) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); })
    .catch((e: any) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${e.message}`); });
}

/** Capture what an ExecFn sends, and reply with `body`. */
function capture(body: unknown, status = 200) {
  const seen: { url?: string; init?: any } = {};
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: any, i: any) => {
    seen.url = String(u);
    seen.init = i;
    return new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
  }) as any;
  return { seen, restore: () => { globalThis.fetch = orig; } };
}

async function main() {
  ({ neonExec, tursoExec, http } = await importOf([
    "slintorm/edge",
    "../../../../src/browser.ts",
  ]));

  console.log("\n\x1b[1mHTTP drivers (slintorm/edge)\x1b[0m\n");

  // ── config field: `endpoint` vs `url` ──────────────────────────────────────
  // SERVERLESS.md:168 and the dbAdapter error message (dbAdapter.ts:68) both
  // show `neonExec({ url })`. That is WRONG: HttpDriverConfig declares
  // `endpoint`, and passing only `url` throws an unhelpful TypeError rather
  // than a named-field error. Documented here so it is not rediscovered.
  await check("`url` is rejected (docs in SERVERLESS.md are wrong); use `endpoint`", () => {
    const c = capture({ rows: [] });
    return Promise.resolve()
      .then(() => {
        // @ts-expect-error deliberately wrong, per SERVERLESS.md
        const exec = neonExec({ url: "https://x.neon.tech/db" } as any);
        return exec("SELECT 1");
      })
      .then(
        () => { c.restore(); throw new Error("expected a throw when `endpoint` is missing"); },
        (e: Error) => {
          c.restore();
          // Currently an unhelpful TypeError, not a message naming the field.
          assert.ok(e instanceof Error, "should throw");
          assert.match(e.message, /endsWith|endpoint/);
        },
      );
  });

  await check("neonExec appends /sql and POSTs {query, params}", async () => {
    const c = capture({ rows: [{ n: 1 }], fields: [{ name: "n" }] });
    try {
      const exec = neonExec({ endpoint: "https://x.neon.tech/db" });
      await exec("SELECT $1::int AS n", [1]);
      assert.equal(c.seen.url, "https://x.neon.tech/db/sql");
      assert.equal(c.seen.init.method, "POST");
      const body = JSON.parse(c.seen.init.body);
      assert.equal(body.query, "SELECT $1::int AS n");
      assert.deepEqual(body.params, [1]);
      assert.equal(c.seen.init.headers["Content-Type"], "application/json");
    } finally { c.restore(); }
  });

  await check("neonExec does not double-append /sql", async () => {
    const c = capture({ rows: [] });
    try {
      const exec = neonExec({ endpoint: "https://x.neon.tech/db/sql" });
      await exec("SELECT 1");
      assert.equal(c.seen.url, "https://x.neon.tech/db/sql");
    } finally { c.restore(); }
  });

  await check("custom headers are merged", async () => {
    const c = capture({ rows: [] });
    try {
      const exec = neonExec({ endpoint: "https://x/db", headers: { Authorization: "Bearer t" } });
      await exec("SELECT 1");
      assert.equal(c.seen.init.headers.Authorization, "Bearer t");
    } finally { c.restore(); }
  });

  await check("non-2xx throws with status and body", async () => {
    const c = capture({ message: "bad sql" }, 400);
    try {
      const exec = neonExec({ endpoint: "https://x/db" });
      await assert.rejects(() => exec("SELECT bad"), /HTTP 400[\s\S]*bad sql/);
    } finally { c.restore(); }
  });

  await check("tursoExec posts to its endpoint", async () => {
    const c = capture({ rows: [], results: [] });
    try {
      const exec = tursoExec({ endpoint: "https://db.turso.io", headers: { Authorization: "Bearer k" } });
      await exec("SELECT 1");
      assert.ok(String(c.seen.url).startsWith("https://db.turso.io"));
      assert.equal(c.seen.init.headers.Authorization, "Bearer k");
    } finally { c.restore(); }
  });

  await check("http namespace re-exports the three drivers", () => {
    assert.equal(typeof http.neon, "function");
    assert.equal(typeof http.turso, "function");
    assert.equal(typeof http.planetscale, "function");
  });

  await check("http-driver imports no Node built-ins (edge-safe)", async () => {
    // Source-only assertion: from an installed skill there is no src/ to read.
    // Skipping is honest; failing would just be a missing file.
    let src: string;
    try {
      const { readFile } = await import("node:fs/promises");
      src = await readFile(new URL("../../../../src/http-driver.ts", import.meta.url), "utf8");
    } catch {
      console.log("      (skipped: not running inside the slintorm repo)");
      return;
    }
    const bad = src.match(/^\s*import\s+.*from\s+["'](?:node:|[a-z_]+)["']/gm) || [];
    const nodeish = bad.filter((l) => /["'](?:node:|fs|path|net|http|crypto|async_hooks|child_process|os|stream|url)["']/.test(l));
    assert.equal(nodeish.length, 0, nodeish.join(", "));
  });

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });