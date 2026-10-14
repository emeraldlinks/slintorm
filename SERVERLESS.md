# SlintORM — Serverless & Edge Runtime Guide

SlintORM runs in any JavaScript runtime that has a TCP socket: traditional
Node.js servers, Vercel serverless functions (Node runtime), AWS Lambda, and Bun.

It also runs on **V8-isolate edge runtimes** (Vercel Edge, Cloudflare Workers,
Netlify Edge, Deno Deploy) — not by talking to the database over TCP, but by
going through a PostgREST service over `fetch`.

---

## Quick start: the edge path (PostgREST)

PostgREST exposes Postgres over plain HTTPS. No socket, no driver package, no
`node:net`. This is the recommended way to run SlintORM on the edge.

```ts
// lib/db.ts — runs in an edge function
import ORMManager from 'slintorm/edge';
import schema from '../src/schema/generated.json' with { type: 'json' };

export const orm = new ORMManager({
  driver: 'postgrest',
  postgrestUrl: process.env.SUPABASE_URL!,        // https://<ref>.supabase.co/rest/v1
  postgrestKey: process.env.SUPABASE_ANON_KEY!,
  schema,                                        // optional; recommended
});

export const db = {
  User: await orm.defineModel<User>('users', 'User'),
  Post: await orm.defineModel<Post>('posts', 'Post'),
};
```

```ts
// app/api/users/route.ts   (Next.js Edge Route Handler)
export const runtime = 'edge';

export async function GET() {
  const users = await db.User.query()
    .where('status', '=', 'active')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return Response.json(users);
}
```

Supabase is just one deployment of PostgREST. Any instance works — point
`postgrestUrl` at it and use its API key.

### What works on this path

| Capability | Status |
|---|---|
| `insert` / `insertMany` / `update` / `delete` | ✅ (`Prefer: return=representation` returns rows) |
| `get` / `getAll` / `exists` / `count` | ✅ (`count` reads `Content-Range`) |
| `where` (`= != > >= < <=`), `in`, `notin`, `between`, `like`, `ilike`, `is` | ✅ |
| `orderBy` / `limit` / `offset` | ✅ |
| `preload()` | ✅ as an embedded resource (`select=*,relation(*)`) — one round trip |
| `@softDelete`, `@hash`, `@encrypt`, `@secret`, `@mask` | ✅ (applied client-side) |
| Transactions, RLS context propagation | ❌ see below |
| `whereRaw`, `join()`, `having()`, window functions, CTEs | ❌ **throw**, not silently ignored |

Unsupported constructs **throw with an explanation**. They are never dropped
silently — a filter that quietly does nothing looks identical to one that works,
which is the worst possible failure shape.

### Options

| Option | Purpose |
|---|---|
| `postgrestUrl` | Base URL of the PostgREST service. Required for this driver. |
| `postgrestKey` | API key. Sent as both `apikey` and `Authorization: Bearer`. |
| `postgrestSchema` | Postgres schema. Defaults to `public`. |
| `postgrestHeaders` | Extra headers merged into every request. |
| `fetch` | Inject a custom `fetch`, for runtimes without a global one. |

You can also use the client directly:

```ts
import { PostgrestClient, postgrestExec } from 'slintorm/edge';

const client = new PostgrestClient({ url, key });
const { rows, total } = await client.execute({
  op: 'select', table: 'todos',
  select: ['id', 'title'],
  filters: [{ column: 'done', op: '=', value: false }],
  order: [{ column: 'created_at', dir: 'desc' }],
  limit: 20,
});
```

---

## Why the default SQL drivers do not work on the edge

This is a protocol decision, not a missing feature.

Supabase reaches Postgres over **HTTP** (`fetch`). The `pg` driver reaches it over
a **raw TCP socket** — it requires `node:net` and `node:dns`.

Vercel Edge and Cloudflare Workers are V8 isolates. They expose `fetch` and
WebSockets. There is no `net.Socket`. So `await import("pg")` succeeds but the
connection cannot be opened, and installing the driver cannot fix it.

SlintORM reports this rather than sending you down that path: if you use
`driver: 'postgres'` on the edge you get a clear error naming the three fixes.

---

## Support matrix (verified, not aspirational)

| Driver  | Node.js | Vercel Serverless (Node) | Vercel Edge | CF Workers | Deno Deploy |
|---------|:-------:|:------------------------:|:-----------:|:----------:|:-----------:|
| `sqlite`| ✅      | ✅                       | ❌          | ❌         | ❌          |
| `postgres` | ✅   | ✅                       | ❌ see below| ❌ see below | ❌ see below |
| `mysql`  | ✅      | ✅                       | ❌ see below| ❌ see below | ❌ see below |
| `mongodb` | ✅     | ✅                       | ❌ see below| ❌ see below | ❌ see below |
| **`postgrest`** | — | ✅                | **✅**      | **✅**      | **✅**      |

The `postgrest` row is the edge path: Postgres over HTTPS via `fetch`. It needs
no TCP socket, so it is the one driver that works unchanged in a V8 isolate.

- **SQLite** on the edge is impossible in any form: it needs a filesystem.
- The SQL drivers need TCP, so they cannot work in a V8 isolate. Use PostgREST
  (above), a vendor HTTP driver, or the Node.js runtime.
- **Cloudflare Workers** additionally need a Workers-compatible socket client
  (`@cloudflare/pg`, or Hyperdrive) even on the Node-compat path — which is still
  TCP, so still not reachable from the isolate itself.

---

## Option 1 — Use the Node.js runtime (simplest)

Vercel serverless functions default to the Node.js runtime, which has TCP.
Nothing special is required.

```ts
// app/api/users/route.ts   (Next.js, Node runtime — the default)
import { db } from '@/lib/db';

export async function GET() {
  const users = await db.User.query().where('status', '=', 'active').limit(20).get();
  return Response.json(users);
}
```

Migrations run as a separate deploy step on Node (see below). `migrate()` needs
`node:fs`/`node:path` to read TypeScript sources, so it must never run inside a
request handler.

---

## Option 2 — A vendor HTTP driver (Neon / Turso / PlanetScale)

These providers expose your database over `fetch`, so they work on the edge.
SlintORM ships adapters in `slintorm/edge`.

```ts
import ORMManager from 'slintorm/edge';
import { neonExec } from 'slintorm/edge';
import schema from '../src/schema/generated.json' with { type: 'json' };

export const orm = new ORMManager({
  driver: 'postgres',                      // REQUIRED — defaults to 'sqlite'
  exec: neonExec({ url: process.env.DATABASE_URL! }),
  schema,                                  // pre-built; no fs access needed
});
```

> **`driver` is mandatory here.** It defaults to `sqlite`, and omitting it makes
> the ORM emit SQLite introspection SQL (`SELECT name FROM sqlite_master`)
> against a Postgres HTTP endpoint.

> **Prefer PostgREST where you can.** These adapters are one HTTP request per
> query with no embedded-resource support; PostgREST gets you `preload()` and
> the full relational story in the same round trip.

| Export | Provider | Notes |
|---|---|---|
| `neonExec` | Neon | HTTP driver. Good fit for Vercel Edge. |
| `tursoExec` | Turso / libSQL | SQLite-compatible over HTTP. |
| `planetscaleExec` | PlanetScale | **PlanetScale's HTTP API is deprecated** — treat as legacy. |

---

## Option 3 — Run the proxy on Node, connect from the edge

Run `createProxyServer()` on a Node host and reach it with `proxyExec()`.

**The proxy executes arbitrary SQL. It requires authentication.**

```ts
// Node host — start the proxy
import { createProxyServer, generateProxyToken } from 'slintorm/proxy';

const authToken = await generateProxyToken();   // 64 hex chars

await createProxyServer({
  authToken,                                     // REQUIRED — throws if absent
  port: 3001,
  // host defaults to 127.0.0.1. Set 0.0.0.0 deliberately.
  allowedOrigins: ['https://app.example.com'],   // empty = no browser access
  resolveDb: async () => ({
    name: 'primary', driver: 'postgres',
    databaseUrl: process.env.DATABASE_URL!,
  }),
});
```

```ts
// Edge function — talk to it
import { proxyExec } from 'slintorm/proxy';

const orm = new ORMManager({
  driver: 'postgres',
  exec: proxyExec({
    endpoint: 'https://db-proxy.internal:3001',
    authToken: process.env.PROXY_AUTH_TOKEN!,    // REQUIRED — read from env
  }),
  schema,
});
```

Security properties (all enforced, none opt-out):

- `authToken` is **required**; `createProxyServer` throws without it.
- Tokens are compared in constant time.
- Requests without a valid token get `401` before any parsing or DB work.
- Binds `127.0.0.1` by default, not `0.0.0.0`.
- CORS is **deny-by-default** — set `allowedOrigins` explicitly. `*` requires
  both `allowAnyOrigin: true` and an explicit opt-in.
- 1 MB request body cap.
- Driver error text is not echoed to the caller (it can disclose schema and
  connection details); use `onError` for logging.

---

## Generating the schema at build time

SlintORM's schema generator reads TypeScript source files — it is a build-time
CLI tool, not a runtime dependency. Run it once before deploying:

```bash
npx slintorm generate
```

This writes `src/schema/generated.json`. Import it in your database module.

> Note: `import schema from '...' with { type: 'json' }` uses the modern `with`
> syntax. The older `assert { type: 'json' }` form was removed from V8 and may
> fail to parse in current edge runtimes.

---

## Migrations in CI/CD

Run migrations from a Node.js script during your deploy pipeline, never inside
a request handler:

```ts
// scripts/migrate.ts   (Node.js only)
import ORMManager from 'slintorm';

const orm = new ORMManager({
  driver: 'postgres',
  databaseUrl: process.env.DATABASE_URL!,
  dir: 'src',
});

await orm.migrate();     // reads TS sources, generates schema, runs DDL
process.exit(0);
```

```json
{
  "scripts": {
    "migrate": "tsx scripts/migrate.ts",
    "build": "npm run migrate && next build"
  }
}
```

---

## Connection management

SlintORM opens **one dedicated connection per adapter instance** and caches it.
`poolSize` is accepted for compatibility but is not currently used.

- In serverless, each cold-start replica holds its own connection. Size your
  database's `max_connections` for `replicas × 1`, and use a provider pooler
  (Supabase Supavisor, Neon pooler, PgBouncer) if that is too many.
- Use a pooler, or close the adapter in serverless teardown hooks.
---

## Multi-tenancy on the edge

PostgREST routes through Postgres, so **Postgres RLS applies unchanged**. The
only SlintORM-side piece is propagating the tenant, and that requires a custom
`exec` — which is precisely the combination `rls: true` refuses:

```ts
// Does NOT work — rls: true requires SlintORM to own the connection
new ORMManager({ driver: 'postgrest', rls: true, postgrestUrl, ... });
```

For multi-tenant edge deployments, set the tenant as a **request header** and
let a PostgREST role or a Postgres policy key off it:

```ts
const orm = new ORMManager({
  driver: 'postgrest',
  postgrestUrl: process.env.SUPABASE_URL!,
  postgrestKey: process.env.SUPABASE_ANON_KEY!,
  postgrestHeaders: () => ({ 'X-Tenant-Id': currentTenant() }),
});
```

Enforce it in Postgres: a policy keyed on `current_setting('request.header.x-tenant-id', true)`,
plus a `BYPASSRLS`-free role. The isolation then lives in the database rather
than in application state, which is where it belongs. See `SECURITY.md` →
"Row-level security" for the full discussion.
