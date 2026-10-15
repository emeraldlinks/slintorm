---
name: slintorm
description: Use SlintORM - a TypeScript ORM for SQLite, PostgreSQL, MySQL, MongoDB, and Postgres-over-HTTP (PostgREST) that runs on Cloudflare Workers, Vercel Edge and Deno. Triggers on slintorm, SlintORM, defineModel, ORMManager, "@softDelete", "@relation", PostgREST driver, edge ORM, or questions about model/query-builder/schema/migration APIs in a project that depends on slintorm. Covers the traps that silently produce wrong code.
---

# SlintORM

TypeScript ORM. Schema in, CRUD out, plus a query builder, migrations, hooks,
plugins, soft deletes, and an edge transport that needs no TCP socket.

## The traps — read before writing any code

These produce code that looks correct and silently isn't. Every one has bitten
real work on this repo.

### 1. `defineModel`'s third argument is HOOKS, not a schema

```ts
// WRONG — silently ignored. The model gets no fields.
const Users = await orm.defineModel("users", "User", { fields: {...}, relations: [] });

// RIGHT — hooks only
const Users = await orm.defineModel("users", "User", {
  onCreateBefore: (item) => ({ ...item, createdBy: "system" }),
});
```

Schema goes to the ORMManager. Always.

### 2. Schema has two sources — pick one

**A. Generated from TS interfaces (the normal path).** Write interfaces with
`// @directive` comments, run `npx slintorm generate`, ORMManager picks it up:

```ts
/** User table */
interface User {
  // @index;auto;comment:primary key
  id?: number;
  // @length:100;not null;comment:Display name
  name: string;
  // @unique;comment:Email
  email?: string;
  // @relationship onetomany:Post;foreignKey:userId
  posts?: Post[];
  // @softDelete
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

```ts
const orm = new ORMManager({ driver: "sqlite", databaseUrl: "./db.sqlite" });
const Users = await orm.defineModel<User>("users", "User");   // no schema arg
```

**B. Hand-written JSON** (edge runtimes with no filesystem). Pass it to the
manager — must be an object keyed by model name, with `fields`/`relations`:

```ts
const orm = new ORMManager({
  driver: "postgrest",
  postgrestUrl: "https://x.supabase.co/rest/v1",
  schema: {
    User: {
      table: "users",
      fields: {
        id:   { type: "INTEGER", meta: { "@index": true, "@auto": true } },
        name: { type: "TEXT",    meta: { "@length": 100, "@notnull": true } },
      },
      relations: [],
    },
  },
});
```

### 3. `delete()` does not delete on a `@softDelete` model

It sets `deletedAt`. Use `forceDelete(filter)` to erase the row. Every read
method filters soft-deleted rows automatically unless you pass
`getAll(filter, { withTrashed: true })`.

### 4. `logs: true` no longer prints bound parameter values

Parameters are user data (tokens, card numbers, emails). SQL text still logs;
values need `logParams: true`, and only locally.

### 5. Filter objects are validated against schema fields

```ts
await Users.query().where("email", "=", input).get();     // fine
await Users.get({ [userSuppliedKey]: "x" });             // THROWS "Unknown field"
```

Unknown keys throw rather than reaching SQL. A rejected request is a `400`, not
a `200` with someone else's rows.

### 6. The PostgREST/edge driver has no transactions

`orm.transaction(...)`, `whereRaw()`, `join()`, and `having()` **throw** with a
message telling you what to use instead. Design for that up front — don't
discover it in a code review.

### 7. `rls: true` throws if you also pass `exec` or `poolSize > 1`

Neither can carry per-request identity. The database user must not have
`BYPASSRLS` or superuser — check with `SELECT rolbypassrls, rolsuper FROM pg_roles`.

### 8. Migrations diff against disk *and* database

Point `dir` at an empty directory, never at your source tree, or every change
looks already-applied.

### 9. `createORM()` migrates immediately when given a schema

`new ORMManager()` does not. `createORM({ schema })` calls `ensureTable` for
every model before returning.

### 10. `getAll()` takes a filter and validates it

`getAll(req.body)` filters now. Unknown keys throw.

### 11. `@unique` silently forces NOT NULL

```ts
// The field looks optional — `?`, no @notnull — but @unique makes it required.
email: string;   // @unique
```

`src/migrator.ts:257` checks `isUnique` before any other rule. An insert without
that field throws. If you need a nullable unique column, that is not currently
expressible — write a test before depending on it.

### 12. `@length` is DDL-only; `@maxLength` is enforced

```ts
name: string;   // @length:100        → VARCHAR(100), NOT validated at runtime
name: string;   // @maxLength:100     → throws ValidationError on insert
```

If you want a real length guarantee, use `@maxLength`. `@length` sizes the
column and nothing else.

### 13. `pick()` returns unselected columns as `null`

```ts
const r = await Post.query().pick("title");
// r[0] === { title: "...", views: null } — views is PRESENT, not absent
```

Test for the value, never for key absence with `"views" in r[0]`.

### 14. `afterFind` is batch-level and must return

```ts
.afterFind((rows) => rows)     // gets ALL rows, must return them
```

Not per-row. Return `undefined` and the query resolves to `undefined`.

### 15. `resolveDb()` returns `undefined` for an unknown name

It does not throw. Check before use:
`const db = orm.resolveDb("analytics"); if (!db) throw ...`

## Quickstart (verified — this exact code runs)

```ts
import ORMManager from "slintorm";

const orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:" });

const Users = await orm.defineModel<{ id?: number; name: string; email?: string }>(
  "users", "User",
);

const u = await Users.insert({ name: "Ada", email: "ada@x.io" });
const all = await Users.query().where("email", "=", "ada@x.io").get();
const n = await Users.count();
```

Schema comes from `src/schema/generated.json` after `npx slintorm generate`.

## Driver selection

| Driver | Config | Use for |
|---|---|---|
| `sqlite` | `databaseUrl: "./db.sqlite"` or `":memory:"` | default, tests, zero setup |
| `postgres` | `databaseUrl: "postgresql://..."` | Postgres over TCP |
| `mysql` | `databaseUrl: "mysql://..."` | MySQL over TCP |
| `mongodb` | `databaseUrl: "mongodb://..."` | Mongo |
| `postgrest` | `postgrestUrl` + `postgrestKey` | **edge** — HTTP, no socket |

Check `orm.edgeReady()` before using a TCP driver. `false` means you're on a
socketless runtime and need `postgrest` or a custom `exec`.

## References

Load only what the task needs:

- `reference/schema.md` — every `// @directive`, field types, relations
- `reference/model-api.md` — insert/get/query/count/soft-delete/upsert
- `reference/query-builder.md` — where/orWhere/joins/pagination/cache
- `reference/drivers.md` — connection strings, pooling, edge setup, RLS
- `reference/cli.md` — generate, migrate, rollback, status, seed
- `examples/verified.ts` — runnable assertions for every claim in this skill

## Verification protocol

Before telling a user code works, run the reference example:

```bash
npx tsx .opencode/skills/slintorm/examples/verified.ts        # from a slintorm checkout
npx tsx ~/.claude/skills/slintorm/examples/verified.ts       # from an installed skill
```

It resolves `slintorm` from your project, or falls back to the repo's source.
In-memory SQLite only — no credentials, no network, no filesystem writes.

**33 assertions, all passing.** Covers schema, CRUD, filters, soft delete,
validation, hooks, the query builder, and the PostgREST driver.

If the library's behaviour contradicts anything written here, the **code wins**:
this document is a convenience, the source is the truth. Report the discrepancy
rather than working around it.

Findings this document is based on came from running it — `@unique` forcing NOT
NULL, `@length` vs `@maxLength`, `pick()` null-filling, and `afterFind`'s
signature were all found by this file disagreeing with an assumption, not by
reading the docs. Treat it as the authority on behaviour, and extend it when you
learn something new.