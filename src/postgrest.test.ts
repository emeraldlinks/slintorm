/**
 * PostgREST (edge) tests.
 *
 * PostgREST is the edge path: Postgres over plain HTTP via `fetch`, with no
 * TCP socket and no driver package. That makes it the only way SlintORM runs
 * unchanged on Vercel Edge, Cloudflare Workers and Deno Deploy.
 *
 * These tests run against a mock PostgREST server (node:http) so the HTTP
 * contract is verified without a live database. They also assert statically
 * that nothing in the edge module graph imports a Node built-in — the property
 * that actually makes the difference on the edge.
 */

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  PostgrestClient,
  PostgrestError,
  postgrestExec,
  type PostgrestFilter,
  type PostgrestConfig,
} from "./postgrest.js";
import ORMManager from "./index.js";
import type { SchemaModel } from "./migrator.js";

interface Todo {
  id?: number;
  title: string;
  done?: boolean;
  comments?: Comment[];
}

interface Comment {
  id?: number;
  todoId: number;
  body: string;
}

const TASK_SCHEMA: SchemaModel = {
  table: "todos",
  fields: {
    id: { type: "INTEGER", meta: { primaryKey: true, auto: true } },
    title: { type: "TEXT", meta: { notNull: true } },
    done: { type: "boolean", meta: {} },
  },
  relations: [],
};

const TASK_WITH_COMMENTS: SchemaModel = {
  table: "todos",
  fields: TASK_SCHEMA.fields,
  relations: [
    {
      sourceModel: "Todo", fieldName: "comments", kind: "onetomany",
      targetModel: "Comment", foreignKey: "todoId",
    },
  ],
};

type Call = {
  method: string;
  path: string;
  query: URLSearchParams;
  rawQuery: string;
  headers: http.IncomingHttpHeaders;
  body: any;
};

function startServer(
  handler?: (c: Call, res: http.ServerResponse) => void,
): Promise<{ url: string; calls: Call[]; close: () => Promise<void> }> {
  const calls: Call[] = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const call: Call = {
        method: req.method!,
        path: u.pathname,
        query: u.searchParams,
        rawQuery: u.search,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined,
      };
      calls.push(call);
      if (handler) return handler(call, res);
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": "0-0/1" });
      res.end(JSON.stringify([{ id: 1, title: "t", done: false }]));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/rest/v1`,
        calls,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

let failures: string[] = [];
let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`    ✓ ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`    ✗ ${name}\n      ${message}`);
  }
}

function eq(actual: unknown, expected: unknown, what = "") {
  if (!Object.is(actual, expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${what}`);
  }
}
function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
async function throws(fn: () => Promise<unknown>, re: RegExp) {
  let threw = false;
  try { await fn(); } catch (e) {
    threw = true;
    const message = e instanceof Error ? e.message : String(e);
    ok(re.test(message), `error did not match ${re}: ${message}`);
  }
  ok(threw, "expected a throw");
}

export async function run() {
  console.log("\n  PostgREST (edge) transport");

  await test("builds a select request with select/filters/order/limit", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url, key: "anon" });
    await c.execute({
      op: "select", table: "todos",
      select: ["id", "title"],
      filters: [{ column: "done", op: "=", value: false }],
      order: [{ column: "created_at", dir: "desc" }],
      limit: 10, offset: 5, count: "exact",
    });
    const q = s.calls[0].query;
    eq(s.calls[0].method, "GET");
    eq(q.get("select"), "id,title");
    eq(q.get("done"), "eq.false");
    eq(q.get("order"), "created_at.desc");
    eq(q.get("limit"), "10");
    eq(q.get("offset"), "5");
    await s.close();
  });

  await test("maps every ORM operator onto PostgREST syntax", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url });
    const cases: [PostgrestFilter, string, string][] = [
      [{ column: "a", op: "=", value: 1 }, "a", "eq.1"],
      [{ column: "a", op: "!=", value: 1 }, "a", "neq.1"],
      [{ column: "a", op: ">", value: 1 }, "a", "gt.1"],
      [{ column: "a", op: ">=", value: 1 }, "a", "gte.1"],
      [{ column: "a", op: "<", value: 1 }, "a", "lt.1"],
      [{ column: "a", op: "<=", value: 1 }, "a", "lte.1"],
      [{ column: "a", op: "LIKE", value: "%x%" }, "a", "like.%x%"],
      [{ column: "a", op: "ILIKE", value: "%x%" }, "a", "ilike.%x%"],
      [{ column: "a", op: "IS", value: null }, "a", "is.null"],
      [{ column: "a", op: "IS", value: true }, "a", "is.true"],
      [{ column: "a", op: "IN", value: [1, 2, 3] }, "a", "in.(1,2,3)"],
    ];
    for (const [f, col, expected] of cases) {
      await c.execute({ op: "select", table: "t", filters: [f] });
      eq(s.calls.at(-1)!.query.get(col), expected, `for op ${f.op}`);
    }
    await s.close();
  });

  await test("negated operators render as not.<op>", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url });
    await c.execute({ op: "select", table: "t", filters: [{ column: "a", op: "NOT IN", value: [1, 2] }] });
    eq(s.calls.at(-1)!.query.get("a"), "not.in.(1,2)");
    await s.close();
  });

  await test("or-groups render as PostgREST's or=(...)", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url });
    await c.execute({
      op: "select", table: "t",
      orFilters: [[{ column: "a", op: "=", value: 1 }, { column: "b", op: "=", value: 2 }]],
    });
    eq(s.calls.at(-1)!.query.get("or"), "(a=eq.1&b=eq.2)");
    await s.close();
  });

  await test("values containing commas are escaped, not read as list syntax", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url });
    await c.execute({ op: "select", table: "t", filters: [{ column: "name", op: "=", value: "a,b" }] });
    // Must not become a list — a comma inside one value stays one value.
    ok(!s.calls.at(-1)!.query.get("name")!.includes("(a"),
      `comma was treated as list syntax: ${s.calls.at(-1)!.query.get("name")}`);
    await s.close();
  });

  await test("sends apikey + Bearer and the Prefer header", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url, key: "secret-key" });
    await c.execute({ op: "insert", table: "t", data: { a: 1 }, returning: true, count: "exact" });
    eq(s.calls[0].headers["apikey"], "secret-key");
    eq(s.calls[0].headers["authorization"], "Bearer secret-key");
    ok(String(s.calls[0].headers["prefer"]).includes("return=representation"),
      `Prefer missing return=representation: ${s.calls[0].headers["prefer"]}`);
    ok(String(s.calls[0].headers["prefer"]).includes("count=exact"), "Prefer missing count=exact");
    await s.close();
  });

  await test("uses POST/PATCH/DELETE for write operations", async () => {
    const s = await startServer();
    const c = new PostgrestClient({ url: s.url });
    await c.execute({ op: "insert", table: "t", data: [{ a: 1 }], returning: true });
    eq(s.calls[0].method, "POST");
    await c.execute({ op: "update", table: "t", filters: [{ column: "id", op: "=", value: 1 }], data: { a: 2 }, returning: true });
    eq(s.calls[1].method, "PATCH");
    await c.execute({ op: "delete", table: "t", filters: [{ column: "id", op: "=", value: 1 }], returning: true });
    eq(s.calls[2].method, "DELETE");
    await s.close();
  });

  await test("reads the total from Content-Range", async () => {
    const s = await startServer((_c, res) => {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": "0-9/42" });
      res.end("[]");
    });
    const c = new PostgrestClient({ url: s.url });
    const r = await c.execute({ op: "select", table: "t", count: "exact" });
    eq(r.total, 42);
    await s.close();
  });

  await test("surfaces PostgREST errors with status and body", async () => {
    const s = await startServer((_c, res) => {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "duplicate key", code: "23505" }));
    });
    const c = new PostgrestClient({ url: s.url });
    let caught: PostgrestError | undefined;
    try { await c.execute({ op: "select", table: "t" }); } catch (e) { caught = e as PostgrestError; }
    ok(caught instanceof PostgrestError, "expected a PostgrestError");
    if (!caught) return;
    eq(caught.status, 409);
    eq(caught.code, "23505");
    ok(caught.message.includes("duplicate key"), "error message missing detail");
    await s.close();
  });

  await test("reports unreachable services clearly", async () => {
    const c = new PostgrestClient({ url: "http://127.0.0.1:1/rest/v1", timeoutMs: 2000 });
    await throws(() => c.execute({ op: "select", table: "t" }), /PostgREST request failed/);
  });

  await test("requires a url", () => {
    const config: PostgrestConfig = { url: "" };
    let threw = false;
    try { new PostgrestClient(config); } catch { threw = true; }
    ok(threw, "expected a throw for a missing url");
  });

  await test("postgrestExec rejects raw SQL with a clear message", async () => {
    const exec = postgrestExec({ url: "http://127.0.0.1:1/rest/v1" });
    await throws(() => exec("SELECT * FROM users"), /expects a PostgREST command as JSON/);
  });

  // ── Full ORM over the edge path ───────────────────────────────────────────

  console.log("\n  PostgREST through the ORM");

  // The schema is supplied to ORMManager, not to defineModel — defineModel's
// third argument is a hooks object.
const makeOrm = (s: { url: string }, schema: Record<string, SchemaModel> = { Todo: TASK_SCHEMA }) =>
    new ORMManager({
      driver: "postgrest",
      postgrestUrl: s.url,
      postgrestKey: "anon",
      logs: false,
      schema,
    });

  await test("defineModel + insert round-trips and returns the PK", async () => {
    const s = await startServer((c, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(c.method === "POST" ? [{ id: 7, title: "new" }] : [{ id: 7, title: "new" }]));
    });
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    const ins = await Todo.insert({ title: "new", done: false });
    eq(ins?.id, 7);
    eq(s.calls[0].method, "POST");
    await s.close();
  });

  await test("get / getAll issue filtered selects", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.get({ id: 1 });
    eq(s.calls[0].method, "GET");
    eq(s.calls[0].query.get("id"), "eq.1");
    await Todo.getAll();
    eq(s.calls[1].query.get("select"), "*");
    await s.close();
  });

  await test("update / delete issue PATCH / DELETE with the filter", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.update({ id: 1 }, { title: "x" });
    // update() reads the current row first (optimistic locking / hooks), so
    // find the write rather than assuming a call index.
    const patch = s.calls.find((c) => c.method === "PATCH");
    ok(patch, "no PATCH issued");
    eq(patch!.query.get("id"), "eq.1");
    eq(patch!.body.title, "x");

    await Todo.delete({ id: 1 });
    const del = s.calls.find((c) => c.method === "DELETE");
    ok(del, "no DELETE issued");
    eq(del!.query.get("id"), "eq.1");
    await s.close();
  });

  await test("the query builder translates where/order/limit", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.query().where("done", "=", false).orderBy("id", "desc").limit(5).get();
    const q = s.calls[0].query;
    eq(q.get("done"), "eq.false");
    eq(q.get("order"), "id.desc");
    eq(q.get("limit"), "5");
    await s.close();
  });

  await test("insertMany sends one array body", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.insertMany([{ title: "a" }, { title: "b" }]);
    eq(s.calls[0].method, "POST");
    ok(Array.isArray(s.calls[0].body), "insertMany body should be an array");
    eq(s.calls[0].body.length, 2);
    await s.close();
  });

  await test("count() uses the Content-Range total", async () => {
    const s = await startServer((_c, res) => {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": "0-9/37" });
      res.end("[]");
    });
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    eq(await Todo.count(), 37);
    await s.close();
  });

  await test("raw SQL is refused rather than silently dropped", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await throws(
      () => Todo.query().whereRaw("done = false").get(),
      /cannot be translated to PostgREST/,
    );
    await s.close();
  });

  await test("join() is refused with a pointer to preload()", async () => {
    const s = await startServer();
    const orm = makeOrm(s);
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await throws(
      () => Todo.query().join("todos", "a", "=", "b").get(),
      /cannot be translated to PostgREST/,
    );
    await s.close();
  });

  await test("preload() becomes an embedded resource in one round trip", async () => {
    const s = await startServer();
    // Relations are read from the schema passed to ORMManager (that is where
    // defineModel looks them up), so declare it there.
    const orm = makeOrm(s, {
      Todo: TASK_WITH_COMMENTS,
      Comment: {
        table: "comments",
        fields: {
          id: { type: "INTEGER", meta: { primaryKey: true, auto: true } },
          todoId: { type: "INTEGER", meta: {} },
          body: { type: "TEXT", meta: {} },
        },
        relations: [],
      },
    });
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.query().preload("comments").get();
    eq(s.calls.length, 1, "preload should not add a second request");
    eq(s.calls[0].query.get("select"), "*,comments(*)");
    await s.close();
  });

  await test("per-request headers support multi-tenant isolation", async () => {
    // Multi-tenant edge deployments cannot use rls: true (it needs SlintORM to
    // own the connection), so the tenant goes in a header and Postgres keys a
    // policy off it. That requires headers to be evaluated per request.
    let tenant = "tenant-a";
    const s = await startServer();
    const orm = new ORMManager({
      driver: "postgrest",
      postgrestUrl: s.url,
      postgrestKey: "anon",
      schema: { Todo: TASK_SCHEMA },
      postgrestHeaders: () => ({ "X-Tenant-Id": tenant }),
    });
    const Todo = await orm.defineModel<Todo>("todos", "Todo");

    await Todo.getAll();
    eq(s.calls[0].headers["x-tenant-id"], "tenant-a");

    tenant = "tenant-b";
    await Todo.getAll();
    eq(s.calls[1].headers["x-tenant-id"], "tenant-b");
    // A shared client, a different tenant per request.
    ok(s.calls[0].headers["x-tenant-id"] !== s.calls[1].headers["x-tenant-id"],
      "the two requests carried the same tenant header");
    await s.close();
  });

  await test("static headers are still supported", async () => {
    const s = await startServer();
    const orm = new ORMManager({
      driver: "postgrest",
      postgrestUrl: s.url,
      postgrestKey: "anon",
      schema: { Todo: TASK_SCHEMA },
      postgrestHeaders: { "X-Static": "yes" },
    });
    const Todo = await orm.defineModel<Todo>("todos", "Todo");
    await Todo.getAll();
    eq(s.calls[0].headers["x-static"], "yes");
    await s.close();
  });

  // ── The property that actually matters on the edge ───────────────────────

  console.log("\n  Edge safety");

  await test("the postgrest module imports no Node built-ins", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./postgrest.ts", import.meta.url), "utf8");
    const staticImports = src.match(/^\s*import\s.*from\s+["']([^"']+)["']/gm) || [];
    const nodeBuiltins = staticImports.filter((l) => /["'](node:|fs|path|net|http|crypto|async_hooks|child_process|os|stream|url)["']/.test(l));
    eq(nodeBuiltins.length, 0, `node builtins imported: ${nodeBuiltins.join(", ")}`);
  });

  await test("no static node: import in the whole edge module graph", async () => {
    const { readFile } = await import("node:fs/promises");
    const files = [
      "postgrest.ts", "browser.ts", "index.ts", "model.ts", "queryBuilder.ts",
      "extra_clauses.ts", "extensions.ts", "quoting.ts", "mask.ts", "db-error.ts",
      "security.ts", "types.ts", "validations.ts", "annotations.ts", "utils.ts",
      "context-store.ts", "http-driver.ts", "interfaces.ts", "proxy.ts",
    ];
    const offenders: string[] = [];
    for (const f of files) {
      const src = await readFile(new URL(`./${f}`, import.meta.url), "utf8");
      const imports = src.match(/^\s*import\s[^;]*?from\s+["'](node:[^"']+|fs|path|net|crypto|async_hooks|child_process|os|stream|url|http)["']/gm) || [];
      if (imports.length) offenders.push(`${f}: ${imports[0]!.trim()}`);
    }
    eq(offenders.length, 0, `edge-reachable modules import node builtins:\n    ${offenders.join("\n    ")}`);
  });

  await test("the postgrest client works with an injected fetch", async () => {
    // Proves no global fetch is required — the hook an edge runtime uses.
    let seenUrl = "";
    const fakeFetch: typeof fetch = async (input) => {
      seenUrl = String(input);
      return new Response(JSON.stringify([{ id: 1 }]), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    };
    const c = new PostgrestClient({ url: "https://example.supabase.co/rest/v1", fetch: fakeFetch });
    const r = await c.execute({ op: "select", table: "todos" });
    eq(r.rows.length, 1);
    ok(seenUrl.startsWith("https://example.supabase.co/rest/v1/todos"),
      `unexpected url ${seenUrl}`);
  });

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\n  ${passed}/${passed + failures.length} passed`);
  if (failures.length) {
    console.error("\n  FAILED:");
    for (const f of failures) console.error(`    - ${f}`);
    throw new AggregateError([new Error(failures.join("\n"))], `${failures.length} test(s) failed`);
  }
}

// Allow direct execution: `tsx src/postgrest.test.ts`
const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].includes("postgrest.test");

if (isDirect) {
  run().then(
    () => process.exit(0),
    (err) => { console.error(err?.message ?? err); process.exit(1); },
  );
}