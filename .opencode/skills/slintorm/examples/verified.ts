/**
 * Executable ground truth for the slintorm skill.
 *
 * Every claim in SKILL.md and reference/*.md is asserted here. If this file
 * fails, the documentation is wrong — not the library.
 *
 *   npx tsx .opencode/skills/slintorm/examples/verified.ts
 *
 * Works from a slintorm checkout or from an installed skill in a consumer
 * project — it resolves `slintorm` first, then falls back to repo source.
 *
 * No credentials, no network, no filesystem writes. SQLite :memory: only.
 */
import assert from "node:assert/strict";

/**
 * Resolve SlintORM from whichever context this runs in: an installed skill in
 * a consumer project (bare "slintorm"), or a checkout of the repo itself
 * (relative source paths). Checked in order, first hit wins.
 */
async function loadLib() {
  const candidates = [
    "slintorm",
    "../../../../src/index.ts",
    "../../../../../src/index.ts",
  ];
  for (const c of candidates) {
    try {
      const m = await import(c);
      return m.default ?? m;
    } catch { /* try next */ }
  }
  throw new Error(
    "Cannot resolve slintorm. Run this from a project with slintorm installed, " +
      "or from inside the slintorm repo.",
  );
}

async function importOf(specs: string[]) {
  for (const s of specs) {
    try { return await import(s); } catch { /* try next */ }
  }
  throw new Error(`Cannot resolve any of: ${specs.join(", ")}`);
}

let ORMManager: any;

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<unknown> | unknown) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e: any) {
    failures.push(`${name}\n      ${e.message}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${e.message}`);
  }
}

function schema(softDelete = false) {
  return {
    User: {
      table: "users",
      fields: {
        id: { type: "INTEGER", meta: { "@index": true, "@auto": true } },
        name: { type: "TEXT", meta: { "@length": 100, "@notnull": true } },
        email: { type: "TEXT", meta: { "@nullable": true } },
        age: { type: "INTEGER", meta: { "@nullable": true } },
        score: { type: "INTEGER", meta: { "@nullable": true } },
        ...(softDelete ? { deletedAt: { type: "TEXT", meta: { "@softDelete": true } } } : {}),
        createdAt: { type: "TEXT", meta: { "@nullable": true } },
        updatedAt: { type: "TEXT", meta: { "@nullable": true } },
      },
      relations: [],
    },
  };
}

async function fresh(softDelete = false) {
  const orm = new ORMManager({
    driver: "sqlite",
    databaseUrl: ":memory:",
    schema: schema(softDelete),
  });
  return { orm, User: await orm.defineModel("users", "User") };
}

console.log("\n\x1b[1mSlintORM skill — verified behaviour\x1b[0m\n");

// Wrapped in main() so this file runs regardless of whether the nearest
// package.json declares "type": "module" — top-level await fails under CJS.
async function main() {
  ORMManager = await loadLib();

// ── Traps 1 & 2: hooks are the third arg; schema is not ──────────────────────
console.log("\x1b[1mTraps: schema vs hooks\x1b[0m");
await check("defineModel's 3rd arg is hooks, and hooks fire", async () => {
  const { orm, User } = await fresh();
  let fired = 0;
  const H = await orm.defineModel("users", "User", {
    onCreateBefore: (item: any) => { fired++; return item; },
  });
  await H.insert({ name: "Hooked", email: "h@x.io" });
  assert.equal(fired, 1, "onCreateBefore did not fire");
});

await check("ORMManager with `schema` creates the table (trap 2B)", async () => {
  const { User } = await fresh();
  assert.equal((await User.count()), 0);
});

await check("get() on an unknown filter key throws (trap 5)", async () => {
  const { User } = await fresh();
  await assert.rejects(() => User.get({ nope: 1 } as any), /Unknown field|Unknown/i);
});

// ── CRUD ────────────────────────────────────────────────────────────────────
console.log("\n\x1b[1mCRUD\x1b[0m");
await check("insert returns the created row", async () => {
  const { User } = await fresh();
  const u: any = await User.insert({ name: "Ada", email: "ada@x.io", age: 36, score: 10 });
  assert.equal(u.name, "Ada");
  assert.ok(u.id != null, "no id assigned");
});

await check("insertMany returns all rows", async () => {
  const { User } = await fresh();
  const rows = await User.insertMany([
    { name: "A", email: "a@x.io" }, { name: "B", email: "b@x.io" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(await User.count(), 2);
});

await check("get / getAll / count / exists", async () => {
  const { User } = await fresh();
  await User.insert({ name: "Ada", email: "ada@x.io", age: 36 });
  const one = await User.get({ email: "ada@x.io" });
  assert.equal(one?.name, "Ada");
  assert.equal((await User.getAll({ age: 36 })).length, 1);
  assert.equal(await User.count(), 1);
  assert.equal(await User.exists({ name: "Ada" }), true);
  assert.equal(await User.exists({ name: "Nope" }), false);
});

await check("getAll honours its filter (trap 10)", async () => {
  const { User } = await fresh();
  await User.insert({ name: "A", age: 1 });
  await User.insert({ name: "B", age: 2 });
  assert.equal((await User.getAll({ age: 1 })).length, 1, "getAll ignored the filter");
  assert.equal((await User.getAll()).length, 2);
  await assert.rejects(() => User.getAll({ ghost: 1 } as any), /Unknown field|Unknown/i);
});

await check("update / updateMany / deleteMany", async () => {
  const { User } = await fresh();
  const a: any = await User.insert({ name: "A", age: 1 });
  await User.update({ id: a.id }, { name: "A2" });
  assert.equal((await User.get({ id: a.id }))?.name, "A2");

  await User.insert({ name: "B", age: 2 });
  const n = await User.updateMany({ age: 2 }, { name: "B2" });
  assert.equal(n, 1);
  assert.equal(await User.deleteMany({ name: "B2" }), 1);
});

await check("upsert inserts then updates", async () => {
  const { User } = await fresh();
  const a: any = await User.insert({ name: "A", email: "a@x.io" });
  assert.equal(await User.upsert({ email: "a@x.io" }, { name: "Z", email: "a@x.io" } as any), "updated");
  assert.equal((await User.get({ id: a.id }))?.name, "Z");
});

await check("findOrCreate returns { record, created }", async () => {
  const { User } = await fresh();
  const first = await User.findOrCreate({ email: "f@x.io" }, { name: "F", email: "f@x.io" });
  assert.equal(first.created, true);
  const second = await User.findOrCreate({ email: "f@x.io" }, { name: "F2", email: "f@x.io" });
  assert.equal(second.created, false);
});

await check("aggregates sum/avg/min/max", async () => {
  const { User } = await fresh();
  await User.insert({ name: "A", score: 10 });
  await User.insert({ name: "B", score: 30 });
  assert.equal(await User.sum("score"), 40);
  assert.equal(await User.avg("score"), 20);
  assert.equal(await User.min("score"), 10);
  assert.equal(await User.max("score"), 30);
});

// ── Soft delete (trap 3) ────────────────────────────────────────────────────
console.log("\n\x1b[1mSoft delete\x1b[0m");
await check("delete() soft-deletes; forceDelete() erases (trap 3)", async () => {
  const { User } = await fresh(true);
  const u: any = await User.insert({ name: "Gone", email: "g@x.io" });
  await User.delete({ id: u.id });
  assert.equal(await User.count(), 0, "row still visible after delete()");
  assert.equal(await User.get({ id: u.id }, ), null, "get() returned a soft-deleted row");

  const r: any = await User.getAll({}, { withTrashed: true });
  assert.equal(r.length, 1, "withTrashed did not reveal the row");
  assert.ok(r[0].deletedAt, "deletedAt was not set");

  await User.forceDelete({ id: u.id });
  assert.equal((await User.getAll({}, { withTrashed: true })).length, 0, "forceDelete did not erase");
});

// ── Query builder ───────────────────────────────────────────────────────────
console.log("\n\x1b[1mQuery builder\x1b[0m");
await check("where / whereIn / whereNull / whereBetween / orderBy / limit", async () => {
  const { User } = await fresh();
  await User.insertMany([
    { name: "A", age: 10, score: 1 }, { name: "B", age: 20, score: 2 },
    { name: "C", age: 30, score: 3 },
  ]);
  assert.equal((await User.query().where("age", ">", 10).get()).length, 2);
  assert.equal((await User.query().whereIn("age", [10, 30]).get()).length, 2);
  assert.equal((await User.query().whereBetween("age", 15, 30).get()).length, 2);
  assert.equal((await User.query().whereNull("age").get()).length, 0);

  const desc = await User.query().orderBy("age", "desc").limit(2).get();
  assert.deepEqual(desc.map((d: any) => d.age), [30, 20], "orderBy/limit wrong");
});

await check("orWhere", async () => {
  const { User } = await fresh();
  await User.insertMany([{ name: "A", age: 10 }, { name: "B", age: 20 }]);
  const r = await User.query().where("age", "=", 10).orWhere("age", "=", 20).get();
  assert.equal(r.length, 2);
});

await check("first() returns one row or null", async () => {
  const { User } = await fresh();
  await User.insert({ name: "A", age: 5 });
  assert.equal((await User.query().where("age", "=", 5).first())?.name, "A");
  assert.equal(await User.query().where("age", "=", 99).first(), null);
});

await check("pick() returns only the selected column (others are null)", async () => {
  const { User } = await fresh();
  await User.insert({ name: "A", email: "a@x.io", age: 42 });
  const r: any = await User.query().pick("name");
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "A");
  // Unselected keys are PRESENT and null — pick() does not omit them.
  assert.ok("email" in r[0], "expected keys to be present-but-null, not absent");
  assert.equal(r[0].email, null);
});

await check("pluck() returns a flat array of one column", async () => {
  const { User } = await fresh();
  await User.insertMany([{ name: "A" }, { name: "B" }]);
  const names = await User.query().pluck("name");
  assert.ok(Array.isArray(names) && names.includes("A"));
});

await check("query builder delete/update", async () => {
  const { User } = await fresh();
  await User.insertMany([{ name: "A", age: 1 }, { name: "B", age: 1 }]);
  assert.equal(await User.query().where("age", "=", 1).update({ age: 2 }), 2);
  assert.equal(await User.query().where("age", "=", 2).delete(), 2);
});

await check("findInBatches walks the table", async () => {
  const { User } = await fresh();
  for (let i = 0; i < 7; i++) await User.insert({ name: `n${i}` });
  const seen: number[] = [];
  await User.findInBatches(null, 3, (rows) => { seen.push(rows.length); });
  assert.equal(seen.reduce((a, b) => a + b, 0), 7, "findInBatches lost rows");
  assert.ok(seen.every((n) => n <= 3), "batch size exceeded");
});

await check("afterFind receives all rows and must return them", async () => {
  const { User } = await fresh();
  await User.insertMany([{ name: "A" }, { name: "B" }]);
  let batch = 0;
  const out = await User.query()
    .afterFind((rows: any[]) => { batch = rows.length; return rows; })
    .get();
  assert.equal(batch, 2, `afterFind saw ${batch} rows, expected 2`);
  assert.equal(out.length, 2, "afterFind return value was not used");
});

// ── Edge/PostgREST (trap 6) ─────────────────────────────────────────────────
console.log("\n\x1b[1mPostgREST edge driver\x1b[0m");
await check("postgrest URL/key config builds a correct HTTP request", async () => {
  const { PostgrestClient } = await importOf(["slintorm/postgrest", "../../../../src/postgrest.ts"]);
  let captured: any = null;
  const client = new PostgrestClient({
    url: "https://demo.supabase.co/rest/v1",
    key: "test-key",
    fetch: async (url: string, init: any) => {
      captured = { url, init };
      return new Response("[]", { status: 200 });
    },
  });
  await client.execute({
    op: "select", table: "users",
    filters: [{ column: "age", op: ">", value: 100 }],
    order: [{ column: "createdAt", dir: "desc" }],
    limit: 10,
  });
  assert.ok(captured.url.includes("/users"), "table missing from URL");
  assert.ok(captured.url.includes("age=gt.100"), `operator not mapped: ${captured.url}`);
  assert.ok(captured.url.includes("order=createdAt.desc"), "order not mapped");
  assert.ok(captured.url.includes("limit=10"), "limit not mapped");
  assert.equal(captured.init.headers["apikey"], "test-key");
  assert.equal(captured.init.headers["Authorization"], "Bearer test-key");
});

await check("CRUD ops map to GET/POST/PATCH/DELETE", async () => {
  const { PostgrestClient } = await importOf(["slintorm/postgrest", "../../../../src/postgrest.ts"]);
  const seen: string[] = [];
  const client = new PostgrestClient({
    url: "https://d.supabase.co/rest/v1", key: "k",
    fetch: async (_u: string, init: any) => { seen.push(init.method); return new Response("[]", { status: 200 }); },
  });
  await client.execute({ op: "select", table: "t" });
  await client.execute({ op: "insert", table: "t", data: { a: 1 } });
  await client.execute({ op: "update", table: "t", data: { a: 1 } });
  await client.execute({ op: "delete", table: "t" });
  assert.deepEqual(seen, ["GET", "POST", "PATCH", "DELETE"]);
});

await check("whereRaw/join throw on postgrest, never silently drop (trap 6)", async () => {
  const { QueryBuilder } = await importOf(["slintorm", "../../../../src/queryBuilder.ts"]);
  const q = new QueryBuilder("users", "src", async () => ({ rows: [] }), "User",
    { User: { table: "users", fields: {}, relations: [] } },
    { dialect: "postgrest" });
  q.whereRaw("1=1");
  assert.throws(() => (q as any).buildPostgrestCommand("select"), /whereRaw/i,
    "whereRaw did NOT throw on the postgrest path");

  const q2 = new QueryBuilder("users", "src", async () => ({ rows: [] }), "User",
    { User: { table: "users", fields: {}, relations: [] } },
    { dialect: "postgrest" });
  q2.join("other", "a", "=", "b");
  assert.throws(() => (q2 as any).buildPostgrestCommand("select"), /join/i,
    "join did NOT throw on the postgrest path");
});

await check("edgeReady() is true for postgrest", async () => {
  const orm = new ORMManager({
    driver: "postgrest",
    postgrestUrl: "https://x.supabase.co/rest/v1",
    postgrestKey: "k",
  });
  assert.equal(orm.edgeReady(), true);
});

await check("runtimeInfo() reports a runtime", async () => {
  const orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:" });
  const info = orm.runtimeInfo();
  assert.ok(info && typeof info === "object");
});

// ── RLS (trap 7) ────────────────────────────────────────────────────────────
console.log("\n\x1b[1mRLS context\x1b[0m");
await check("rls:true throws when combined with custom exec", async () => {
  assert.throws(() => new ORMManager({
    driver: "postgres", databaseUrl: "p://x", rls: true,
    exec: async () => ({ rows: [] }),
  }), /rls/i, "rls+exec did not throw");
});

await check("rls:true throws when poolSize > 1", async () => {
  assert.throws(() => new ORMManager({
    driver: "postgres", databaseUrl: "p://x", rls: true, poolSize: 5,
  }), /rls/i, "rls+pool did not throw");
});

await check("runWithAuthContext scopes context to the callback", async () => {
  const { orm } = await fresh();
  let inner: any;
  orm.runWithAuthContext({ tenant_id: "t1" }, () => { inner = orm.getContext(); });
  assert.equal(inner.tenant_id, "t1");
  assert.equal(orm.getContext().tenant_id, undefined, "context leaked past the scope");
});

// ── Validation ──────────────────────────────────────────────────────────────
console.log("\n\x1b[1mValidation\x1b[0m");
await check("@maxLength IS enforced; @length is DDL-only", async () => {
  const orm = new ORMManager({
    driver: "sqlite", databaseUrl: ":memory:",
    schema: {
      P: { table: "p", fields: {
        id: { type: "INTEGER", meta: { "@auto": true } },
        code: { type: "TEXT", meta: { "@maxLength": 3 } },
        tag:  { type: "TEXT", meta: { "@length": 3 } },
        createdAt: { type: "TEXT", meta: { "@nullable": true } },
        updatedAt: { type: "TEXT", meta: { "@nullable": true } },
      }, relations: [] },
    },
  });
  const P = await orm.defineModel("p", "P");
  await assert.rejects(() => P.insert({ code: "toolong", tag: "ok" } as any), /at most 3/i);
  // @length only sizes the column in DDL — it is NOT a runtime validator.
  await P.insert({ code: "ok", tag: "muchlongerthan3" } as any);
  assert.equal(await P.count(), 1);
});

await check("@unique implies NOT NULL — the column becomes required", async () => {
  const orm = new ORMManager({
    driver: "sqlite", databaseUrl: ":memory:",
    schema: {
      Q: { table: "q", fields: {
        id: { type: "INTEGER", meta: { "@auto": true } },
        // @unique with no @nullable — migrator still emits NOT NULL
        email: { type: "TEXT", meta: { "@unique": true } },
        createdAt: { type: "TEXT", meta: { "@nullable": true } },
        updatedAt: { type: "TEXT", meta: { "@nullable": true } },
      }, relations: [] },
    },
  });
  const Q = await orm.defineModel("q", "Q");
  await assert.rejects(() => Q.insert({} as any), /email|required|not null/i);
});

await check("check() returns errors without throwing; validate() throws", async () => {
  const { User } = await fresh();
  const errs = User.check({ name: "" }, { name: { required: true } });
  assert.ok(errs && typeof errs.name === "string", "check() did not return an error");
  assert.doesNotThrow(() => User.check({ name: "ok" }, { name: { required: true } }));
  assert.throws(() => User.validate({ name: "" }, { name: { required: true } }));
});

// ── Driver + multi-db ───────────────────────────────────────────────────────
console.log("\n\x1b[1mDriver config\x1b[0m");
await check("addDatabase / resolveDb route by name", async () => {
  const { orm } = await fresh();
  orm.addDatabase("analytics", { driver: "sqlite", databaseUrl: ":memory:" });
  assert.ok(orm.resolveDb("analytics"), "second database not registered");
  // resolveDb returns undefined for an unknown name — it does NOT throw.
  assert.equal(orm.resolveDb("nope"), undefined);
});

await check("logParams defaults off — logs:true does not print values", async () => {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: any[]) => { lines.push(a.join(" ")); };
  try {
    const orm = new ORMManager({
      driver: "sqlite", databaseUrl: ":memory:", logs: true, schema: schema(),
    });
    const U = await orm.defineModel("users", "User");
    await U.insert({ name: "SecretValueXYZ", email: "s@x.io" });
  } finally { console.log = orig; }
  const leaked = lines.filter((l) => l.includes("SecretValueXYZ"));
  assert.equal(leaked.length, 0, `logs leaked a bound value: ${leaked.join(" | ")}`);
});

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${passed} passed, ${failures.length} failed\x1b[0m\n`);
if (failures.length) {
  console.log("\x1b[31mFAILURES\x1b[0m");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\x1b[32mAll documented behaviour confirmed.\x1b[0m\n");
}

main().catch((e) => { console.error(e); process.exit(1); });