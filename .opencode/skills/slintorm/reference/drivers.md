# Drivers, connections, and edge

## Choosing a driver

| Driver | Config | Transport | Edge-safe |
|---|---|---|---|
| `sqlite` | `databaseUrl: ":memory:"` | in-process | yes |
| `postgres` | `databaseUrl: "postgresql://..."` | TCP | no |
| `mysql` | `databaseUrl: "mysql://..."` | TCP | no |
| `mongodb` | `databaseUrl: "mongodb://..."` | TCP | no |
| `postgrest` | `postgrestUrl` + `postgrestKey` | HTTPS + `fetch` | **yes** |

```ts
// SQLite — the default for tests, no setup
const orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:" });

// Postgres
const orm = new ORMManager({
  driver: "postgres",
  databaseUrl: process.env.DATABASE_URL!,   // never hardcode
  poolSize: 10,
});

// MongoDB
const orm = new ORMManager({ driver: "mongodb", databaseUrl: process.env.MONGO_URL! });
```

## Runtime detection

```ts
orm.edgeReady()      // can this runtime open a TCP socket?
orm.runtimeInfo()    // what SlintORM detected
```

`edgeReady()` is `false` in Vercel Edge, Cloudflare Workers, Deno Deploy, and
browsers. Passing a TCP driver there throws at construction — that is
intentional, not a bug to work around.

## PostgREST — Postgres over HTTP

Requires no TCP socket, so it runs anywhere `fetch` does.

```ts
const orm = new ORMManager({
  driver: "postgrest",
  postgrestUrl: "https://<project>.supabase.co/rest/v1",
  postgrestKey: process.env.SUPABASE_ANON_KEY!,
  postgrestSchema: "public",          // optional
  postgrestHeaders: () => ({          // function → evaluated per request
    "x-tenant-id": currentTenant(),
  }),
  schema,                             // must be inlined; edge has no filesystem
});
```

Your normal code is unchanged — same models, same query builder.

**What it cannot do** (each throws): transactions, `whereRaw()`, `join()`,
`having()`, CTEs, window functions, raw SQL.

**What works**: full CRUD, all `where` variants, `orderBy`, `limit`/`offset`,
`count`, `preload()` as an embedded-resource fetch (one round trip).

Auth is the Bearer token, which is what lets Postgres RLS identify the caller.

## Connection pooling

```ts
new ORMManager({ driver: "postgres", databaseUrl, poolSize: 10 })
```

`poolSize` cannot be combined with `rls: true` — pooled connections cannot carry
per-request identity.

Read replicas:

```ts
new ORMManager({ databaseUrl, replicas: [urlA, urlB] })   // round-robin
```

## Multiple databases

```ts
orm.addDatabase("analytics", { driver: "sqlite", databaseUrl: "./a.db" });
await orm.execOn("analytics", "SELECT 1");
orm.resolveDb("analytics")     // → handle, or undefined if not registered
```

`resolveDb` returns `undefined` for an unknown name — it does not throw.
Check before use.

## Row-level security

Postgres only. `rls: true` makes every query set session parameters from the
current context, so policies referencing `current_setting('rls.tenant_id')`
work.

```ts
const orm = new ORMManager({ driver: "postgres", databaseUrl, rls: true });

const orders = await orm.runWithAuthContext({ tenant_id: session.tenantId }, async () => {
  return db.Order.query().get();     // RLS filters by tenant
});
```

Two rules that are security requirements, not style:

1. **The database role must not have `BYPASSRLS` or superuser.** Superusers
   bypass RLS silently, so your policies appear to work and do nothing.
   Verify: `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;`

2. **Only pass values you authenticated.** `runWithAuthContext` is the safe
   form — the scope is explicit. Never build context from a raw header.

`withContext()` also exists but merges for the rest of the async scope, which is
broader than one request. Prefer `runWithContext()` / `runWithAuthContext()`.

When `rls: true` is combined with a custom `exec` or `poolSize > 1`, the
constructor throws. Neither can carry per-request identity.

## Logging

```ts
new ORMManager({ logs: true })              // SQL text only
new ORMManager({ logs: true, logParams: true })  // ⚠ includes bound values
```

Bound parameters are user data — tokens, card numbers, emails. `logs: true`
alone does not print them. Only enable `logParams` in a local terminal.

## Plugins

```ts
orm.use(plugin).use(other)
orm.onPluginError((err, event) => { /* handle */ })
new ORMManager({ strictPlugins: true })     // rethrow instead of isolating
```

Plugin failures are isolated by default: a plugin observes an operation, so a
bug in one should not break the write. Turn on `strictPlugins` when you want
failures loud.