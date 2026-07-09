# SlintORM

**A lightweight, GORM-inspired TypeScript ORM for SQLite, PostgreSQL, MySQL, and MongoDB — zero-config migrations, a full SQL query builder, and everything hangs off your model instances.**

No schema DSL to learn. No Prisma Client generation step. No separate import for every query feature. Write a TypeScript interface, annotate a few fields with comments, call `migrate()`, and start querying.

```ts
const Users = await orm.defineModel<User>("users", "User");
const active = await Users.query().where("status", "=", "active").get();
```

That's it. No `db.select().from(users).where(...)` ceremony, no `prisma.user.findMany({ where: { ... } })` client object indirection — just your model, chained.

---

## Why SlintORM?

Most TypeScript ORMs force a tradeoff: **Drizzle** is fast and type-safe but minimal — no preloads, no built-in migrations, you write SQL-shaped queries by hand. **Prisma** is full-featured but heavy — a generated client, a separate schema DSL, and raw SQL the moment you need a window function or a real subquery.

SlintORM aims for the GORM sweet spot: **automatic migrations, a real query builder with joins/preloads/aggregates/subqueries, and zero boilerplate**, while staying TypeScript-native and lightweight.

| Feature                          | SlintORM | Drizzle | Prisma |
|-----------------------------------|:---:|:---:|:---:|
| Auto table creation & migration   | ✅ Automatic, zero-config | ❌ Manual/CLI | ✅ CLI-based |
| Type-safe queries                 | ✅ | ✅ | ✅ |
| Relationships (1:1, 1:N, N:M)     | ✅ Fully supported with preloads | ✅ Via join tables | ✅ Via relations |
| Query builder: joins & HAVING     | ✅ Advanced SQL capabilities | ❌ Limited | ⚠️ Client API only; raw SQL for complex cases |
| Aggregates & window functions     | ✅ COUNT/SUM/AVG/MIN/MAX + custom window fns | ❌ Limited | ⚠️ Raw SQL required |
| Subquery support                  | ✅ Built-in | ❌ Limited | ⚠️ Raw SQL only |
| Preload / eager loading           | ✅ Nested, batched (no N+1) | ❌ Not supported | ✅ select/include |
| Auto relation-path joins          | ✅ `relatedTo()` BFS-discovers joins | ❌ | ❌ |
| Migration rollback + snapshots    | ✅ CLI rollback to batch/name | ⚠️ Manual | ✅ |
| Boilerplate                       | ✅ Single import, no generated client | ✅ Minimal | ❌ Requires client generation |
| Learning curve                    | ✅ Very low | ✅ Low | ❌ Medium — schema DSL + client |
| Raw SQL escape hatch              | ✅ `whereRaw`, `exec`, `batch`, `transaction` | ✅ | ⚠️ Available, more friction |
| Plugin system                     | ✅ Lifecycle events | ❌ | ❌ |
| Context propagation               | ✅ Custom request context | ❌ | ❌ |
| Database resolver (multi-DB)      | ✅ Switch DB per query | ❌ | ❌ |
| Prepared statement mode           | ✅ | ❌ | ❌ |
| FirstOrInit                       | ✅ Fetch or init unsaved instance | ❌ | ❌ |
| FindInBatches                     | ✅ Chunked processing with callback | ❌ | ❌ |
| AfterFind hook                    | ✅ Transform rows post-query | ❌ | ❌ |
| Group conditions (nested AND/OR)  | ✅ `andWhereGroup`/`orWhereGroup` | ❌ | ❌ |
| Named SQL arguments               | ✅ `:name` placeholders | ❌ | ❌ |
| Dry-run mode                      | ✅ Return SQL without executing | ❌ | ❌ |
| Streaming rows                    | ✅ AsyncGenerator with batch size | ❌ | ❌ |
| Multi-column IN                   | ✅ `(a,b) IN ((1,2),(3,4))` | ❌ | ❌ |
| Enhanced counts (distinct/group)  | ✅ `countDistinct` / `countWithGroup` | ❌ | ❌ |
| Optimizer / index hints           | ✅ `hint()`, `indexHint()`, `commentHint()` | ❌ | ❌ |
| Ideal use case                    | Rapid prototyping → production, GORM-style workflows | Type-safe lightweight projects | Large, ecosystem-heavy apps |

**Bottom line:** if you want migrations that just work, a query builder that can actually do joins and subqueries, and relationship loading without N+1 — without adopting a whole new schema language — SlintORM is built for you.

---

## Installation

```bash
npm install slintorm
```

> Database drivers are loaded **lazily** at runtime. Using only `sqlite`? Then `pg`, `mysql2`, and `mongodb` are never required or installed into your runtime bundle.

---

## Model Interfaces

Models are plain TypeScript interfaces. Metadata lives in comments directly above each field — no decorators, no separate schema file to hand-maintain.

```ts
/** Post table */
interface Post {
  // @index;
  id?: number;
  // @length:255;not null;comment:Post title
  title: string;
  // @nullable;comment:Author user ID
  userId?: number;
  // @relation manytoone:User;foreignKey:userId;onDelete:SET NULL
  user?: User;
  // @json;nullable;comment:Extra post data
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(draft,published,archived)
  status?: "draft" | "published" | "archived";
}

/** User table */
interface User {
  // @index;auto;comment:primary key
  id?: number;
  // @nullable;length:100;comment:First name
  firstName?: string;
  // @length:100;not null;comment:Last name
  name: string;
  // @nullable;length:100;comment:Last name
  lastname?: string;
  // @unique;comment:Email
  email?: string;
  // @relationship onetomany:Post;foreignKey:userId
  posts?: Post[];
  // @relationship onetoone:Profile;foreignKey:userId;onDelete:CASCADE
  profile?: Profile;
  // @relation manytomany:Team;through:team_members;foreignKey:userId;relatedKey:teamId
  teams?: Team[];
  // @json;nullable;comment:Extra user info
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(active,inactive,banned)
  status?: "active" | "inactive" | "banned";
}

/** Profile table */
interface Profile {
  // @index;auto;comment:primary key
  id?: number;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  userId: number;
  // @json;nullable;comment:Extra profile data
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(male,female,other)
  gender?: "male" | "female" | "other";
}

/** Todo table */
interface Todo {
  // @index;auto;comment:primary key
  id?: number;
  // @length:255;not null
  title: string;
  // @nullable;length:1000
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @json;nullable
  meta?: Record<string, any>;
  // @enum:(low,medium,high)
  priority?: "low" | "medium" | "high";
}

/** Team table */
interface Team {
  // @index;auto
  id?: number;
  // @length:255;not null
  title: string;
  // @nullable;length:1000
  detail: string;
  // @nullable
  open?: boolean;
  // @nullable
  tested?: boolean;
  // @json;nullable
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(active,archived)
  status?: "active" | "archived";
  // @relation manytomany:User;through:team_members;foreignKey:teamId;relatedKey:userId
  members?: User[];
}
```

### Field metadata reference

| Tag | Meaning |
|---|---|
| `@index` | Create an index on this column |
| `@auto` | Auto-increment / serial primary key |
| `@unique` | Unique constraint |
| `@nullable` | Column allows NULL |
| `@not null` | Column is required |
| `@length:N` | VARCHAR length |
| `@mask:preset` | Mask output on read: ssn, creditcard, email, phone, showFirst:N, showLast:N, showBoth:F,L, char:X, pattern:... Bypass with `.withoutMasking()` |
| `@omitdb` | Field never stored in database — excluded from INSERT/UPDATE/reads |
| `@omitjson` | Stored in DB but stripped from all read results unless `.select()`ed |
| `@omitmigrate` | No column created by migrator — manual DDL; field still usable in queries |
| `@json` | Serialize/deserialize this field as JSON automatically |
| `@softDelete` | Marks the field (e.g. `deletedAt`) used for soft deletes; enables `withTrashed()`/`onlyTrashed()`/`restore()` |
| `@enum:(a,b,c)` | Restrict to a set of string values |
| `@default:value` | Default value |
| `@comment:text` | Column comment (where supported) |
| `@relation kind:Model;foreignKey:col;onDelete:ACTION` | One-to-one / many-to-one relation |
| `@relationship kind:Model;foreignKey:col` | One-to-many / one-to-one relation (alias form) |
| `@relation manytomany:Model;through:pivot;foreignKey:col;relatedKey:col` | Many-to-many relation. The pivot table is auto-synthesized at migration time if not declared as its own model. |

---

## Initialization

```ts
import ORMManager from "slintorm";

const orm = new ORMManager({
  driver: "sqlite",          // sqlite | postgres | mysql | mongodb
  databaseUrl: "./testx.db",
  dir: "src",                // folder containing your model interfaces
  logs: false,
});

// Generate schema from source files and apply pending migrations
await orm.migrate();

const Users = await orm.defineModel<User>("users", "User");
const Posts = await orm.defineModel<Post>("posts", "Post");
const Todos = await orm.defineModel<Todo>("todos", "Todo");

const db = orm.DB;
```

If you already have a generated schema object, pass it directly as `schema` to skip reading schema files from disk:

```ts
import { schema } from "./schema/generated.js";

const orm = new ORMManager({
  driver: "sqlite",
  databaseUrl: "./testx.db",
  dir: "src",
  schema,
});
```

This example uses SQLite — switch to PostgreSQL, MySQL, or MongoDB by changing `driver` and `databaseUrl`.

### Edge / serverless initialization

In V8-isolate runtimes (Vercel Edge, Cloudflare Workers), pass a pre-built `schema` and a custom `exec` function that uses `fetch()` instead of TCP:

```ts
import ORMManager from 'slintorm/browser';
import { proxyExec } from 'slintorm/proxy';
import schema from './schema/generated.json' assert { type: 'json' };

const orm = new ORMManager({
  exec: proxyExec({ endpoint: 'https://db-proxy.myapp.com/query' }),
  schema,
});

const Users = await orm.defineModel<User>('users', 'User');
```

See the [Edge & Serverless](#edge--serverless) section for detailed setup.

---

## Fully typed `db` via `ModelMap`

If you don't want to manually export every model from `defineModel()`, generate a `ModelMap` and get a fully typed `db` store for free:

```ts
import { ModelMap } from "./schema/generated.js";

// Note: ModelMap is only available after your first successful migration —
// run `await orm.migrate()` (or `npx slintorm migrate`) at least once first.

const orm = new ORMManager<ModelMap>({
  driver: "sqlite",
  databaseUrl: "./testx.db",
  dir: "src",
  logs: false,
  modelMap: {} as ModelMap,
});

await orm.migrate();
const db = orm.DB;

// Fully typed, no manual defineModel() exports needed
await db.Profile.insert({ userId: newUser?.id!, meta: { bio: "This is my profile" } });
```

> Both approaches — manual `defineModel()` exports or `ModelMap` + `db` — expose identical functionality. Pick whichever fits your project's style.

---

## Define models

```ts
const Users = await orm.defineModel<User>("users", "User");
const Posts = await orm.defineModel<Post>("posts", "Post");
const Todos = await orm.defineModel<Todo>("todos", "Todo");
```

### Lifecycle hooks

```ts
const Teams = await orm.defineModel<Team>("team", "Team", {
  onCreateBefore(item) {
    console.log("before create Team:", item);
  },
  onCreateAfter(item) {
    console.log("after create:", item);
  },
  onUpdateAfter(oldData, newData) {
    console.log("updated", oldData, "->", newData);
  },
});

const newTeam = await db.Team.insert({
  title: "Hook Team",
  detail: "Hook test",
  open: true,
  tested: false,
  createdAt: new Date().toISOString(),
});

if (newTeam?.id) {
  await db.Team.update({ id: newTeam.id }, { tested: true });
}
```

Available hooks: `onCreateBefore`, `onCreateAfter`, `onUpdateBefore`, `onUpdateAfter`, `onDeleteBefore`, `onDeleteAfter`.

---

## Basic CRUD examples

```ts
await Todos.insert({
  title: "To watch plates",
  detail: "Wash all plates",
  createdAt: new Date().toISOString(),
});

const allTodos = await Todos.getAll();
const user = await Users.get({ id: 1 });
await Users.update({ id: 1 }, { name: "Amike Catherine" });
const fetchedUser = await Users.get({ id: 1 });
await fetchedUser?.update({ name: "Amike Egwamene" });
await Posts.delete({ id: 3 });
```

Every record returned by `.get()` / `.insert()` comes with `.update()`, `.delete()`, and `.refresh()` attached — no need to re-pass the filter:

```ts
const user = await Users.get({ id: 1 });
await user?.update({ name: "New Name" });
await user?.delete();
```

### Bulk operations

```ts
await Users.insertMany([{ name: "Joe" }, { name: "Jane" }]);
await Users.updateMany({ status: "inactive" }, { status: "banned" });
await Users.deleteMany({ status: "banned" });

// Process large result sets in chunks with FindInBatches
await Users.findInBatches(null, 2, async (batch, batchNum) => {
  console.log(`Batch ${batchNum}:`, batch);
});
```

### Upsert & findOrCreate

```ts
await Users.upsert({ email: "joe@x.com" }, { name: "Joe", email: "joe@x.com" });

const { record, created } = await Users.findOrCreate(
  { email: "joe@x.com" },
  { name: "Joe", email: "joe@x.com" }
);

// FirstOrInit — fetch first or return an unsaved instance (never writes to DB)
const user = await Users.firstOrInit({ email: "new@test.com" }, { name: "New" });
// user has .update()/.delete()/.refresh() but is not persisted until you call them
```

### Raw SQL expressions in values

Use `SqlExpr.raw()` to embed arbitrary SQL expressions (`NOW()`, `CONCAT()`, subqueries, etc.) in insert/update values:

```ts
import { SqlExpr } from "slintorm";

await Users.insert({
  name: SqlExpr.raw("CONCAT(first_name, ' ', last_name)"),
  createdAt: SqlExpr.raw("datetime('now')"),
});

await Users.update({ id: 1 }, { score: SqlExpr.raw("score + 1") });
```

### Soft delete

```ts
await Users.restore({ id: 1 });                 // un-delete
await db.User.query().withTrashed().get();        // include deleted rows
await db.User.query().onlyTrashed().get();         // only deleted rows
```

### Aggregates

```ts
await Users.count({ status: "active" });
await Users.sum("score");
await Users.avg("score", { status: "active" });
await Users.min("score");
await Users.max("score");
```

### Validation

```ts
await Users.validate(
  { email: "bad@example.com" },
  { email: { required: false, email: true } }
);

const errors = Users.check({ email: "bad@example.com" }, { email: { email: true } });
```

---

## Query builder examples

```ts
const postWithUser = await Posts.query()
  .exclude("title")
  .preload("user")
  .preload("user.posts")
  .preload("user.profile")
  .preload("user.posts.user")
  .exclude("user.lastname")
  .first();

const userWithRelations = await Users.query()
  .preload("posts")
  .preload("profile")
  .first("id = 2");
```

### Accessing distant relationships with joins

```ts
const assessments = await db.Assessment.query()
  .join("modules", "modules.id", "=", "assessments.moduleId")
  .join("cohorts", "cohorts.trackId", "=", "modules.trackId")
  .join("enrollments", "enrollments.cohortId", "=", "cohorts.id")
  .whereRaw(`enrollments.userId = ${session.id}`)
  .preload("module")
  .get();
```

### The same query, shortened with relation-path helpers

You don't have to spell out every intermediate join — SlintORM reads your schema's relation metadata and builds the chain for you.

```ts
/**
 * Traverse a dot-separated relation path and apply all intermediate
 * JOIN clauses automatically. Returns `this`, so you can keep chaining
 * your own `.where()`, `.get()`, etc.
 */
const assessments = await db.Assessment.query()
  .throughRelation("module.cohort.enrollment")
  .where("enrollments.userId", "=", session.id)
  .preload("module")
  .get();

/**
 * Combines throughRelation + a final WHERE in one call.
 */
const assessments2 = await db.Assessment.query()
  .whereRelated("module.cohort.enrollment", "userId", session.id)
  .preload("module")
  .get();

/**
 * Don't even know the path? relatedTo() BFS-discovers the shortest
 * relation chain to the target model automatically. Throws if no
 * path exists between the two models.
 */
const assessments3 = await db.Assessment.query()
  .relatedTo("Enrollment", "userId", session.id)
  .preload("module")
  .get();
```

### More query builder features

```ts
// distinct / group by / having
const grouped = await db.Enrollment.query()
  .select("cohortId")
  .countAggregate("*")
  .groupBy("cohortId")
  .having("COUNT(*) > 5")
  .get();

// window functions
const ranked = await db.User.query()
  .window("ROW_NUMBER()", "PARTITION BY lastname ORDER BY id ASC")
  .get();

// pagination with totals
const { data, total, page, lastPage } = await db.User.query()
  .where("status", "=", "active")
  .getPaginated(1, 20);

// scopes — reusable, composable query fragments
const activeUsers = await db.User.query()
  .scope((qb) => qb.where("type", "=", "user"))
  .get();

// group conditions — nested AND/OR groups for complex filters
const filtered = await db.User.query()
  .andWhereGroup((qb) =>
    qb.where("status", "=", "active").orWhere("status", "=", "pending")
  )
  .orWhereGroup((qb) => qb.where("role", "=", "admin"))
  .get();

// named SQL arguments — use :name placeholders
const named = await db.User.query()
  .namedWhere("name = :name AND email = :email", {
    name: "Joe", email: "joe@test.com",
  })
  .get();

// multi-column IN — (col1, col2) IN ((v1,v2), (v3,v4))
const multiIn = await db.Post.query()
  .whereColumnsIn(
    ["status", "type"],
    [["draft", "blog"], ["published", "news"]],
  )
  .get();

// enhanced counts
const distinct = await db.User.query().countDistinct("status");
const grouped = await db.User.query().countWithGroup("status");
// grouped returns [{ status: "active", count: 5 }, ...]

// optimizer / index / comment hints
await db.User.query().hint("/*+ NO_INDEX */").get();
await db.User.query().indexHint("idx_users_email").get();
await db.User.query().commentHint("my query comment").get();

// AfterFind hook — transform every row after fetch
const transformed = await db.User.query()
  .afterFind((rows) => rows.map((r) => ({ ...r, extraField: true })))
  .get();

// Dry-run — get SQL + params without executing
const plan = await db.User.query().where("id", "=", 1).dryRun().get();
// plan → { sql: "SELECT ... WHERE id = ?", params: [1] }

// Rows streaming — async generator with configurable batch size
for await (const batch of db.User.query().orderBy("id", "asc").stream(100)) {
  for (const user of batch) { /* process */ }
}
```

See **`QUERY_BUILDER.md`** in this repo for the complete method-by-method reference (every `where*`, join, preload, aggregate, subquery, soft-delete, and advanced feature with examples).

---

## Transactions & batches

```ts
await orm.transaction(async (trx) => {
  await trx.exec("INSERT INTO users (name, email) VALUES (?, ?)", ["Joe", "joe@example.com"]);
  await trx.exec("INSERT INTO profile (userId) VALUES (?)", [1]);
});
```

`transaction()` wraps the callback in `BEGIN`/`COMMIT`, rolling back automatically on error (no-op wrapper on MongoDB, which has no implicit transaction here).

For a flat list of statements without a callback, use `batch()`:

```ts
await orm.batch([
  { sql: "INSERT INTO users (name) VALUES (?)", params: ["Joe"] },
  { sql: "INSERT INTO profile (userId) VALUES (?)", params: [1] },
]);
```

---

## Schema generation and migrations

`orm.migrate()` generates a schema from your source files and updates tables automatically — no separate `generate` step required in app code.

If you pass `schema` directly to `ORMManager`, the ORM uses that schema instead of reading from disk at all.

### CLI

For migrations outside your app's runtime — CI/CD, deploy hooks, production cutover — use the bundled CLI:

```bash
npx slintorm generate          # Scan source files and (re)generate schema/generated.ts
npx slintorm migrate           # Apply all pending migrations
npx slintorm rollback          # Roll back the last batch
npx slintorm rollback <name>   # Roll back to a specific migration name
npx slintorm rollback --to 2   # Roll back to a specific batch number
npx slintorm status            # Show applied / pending migrations
npx slintorm fresh             # Drop all tables, then re-run all migrations
npx slintorm drop-tracking     # Drop the _slint_migrations table (irreversible — production cutover only)
npx slintorm --help            # Show help
```

Config file (`slintorm.config.js` in your project root, or a `"slintorm"` key in `package.json`):

```js
// slintorm.config.js
export default {
  driver: "sqlite",          // sqlite | postgres | mysql | mongodb
  databaseUrl: "./myapp.db",
  dir: "src",
  logs: false,
};
```

Each applied migration writes a JSON record to `<dir>/schema/migrations/`, in addition to the internal `_slint_migrations` tracking table. `rollback` drops the rolled-back batch's tables, then automatically rebuilds the target batch's tables from its schema snapshot — skipping anything still present, so re-running rollback is safe.

---

## Plugin system

SlintORM exposes lifecycle hooks so you can extend behaviour globally. Plugins fire on model CRUD and migration events — they are useful for **logging, metrics, auditing, tracing, and augmentation**.

### Plugin interface

```ts
import { Plugin } from "slintorm";

const auditPlugin: Plugin = {
  name: "audit-log",             // unique name (duplicates rejected)
  priority: 5,                   // lower = runs first (default 10)
  install(orm) {                 // called once on registration
    console.log("Audit plugin ready");
  },
  on(event, ctx) {               // called for each lifecycle event
    console.log(`[${event}] ${ctx.model} →`, ctx.data ?? ctx.filter);
  },
};

orm.use(auditPlugin);
```

Remove a plugin by name: `orm.removePlugin("audit-log")`.

### Available events

Every event payload includes `orm` (the full ORMManager) and `context` (the request-scoped data from `orm.withContext()`).

| Event | When | Extra payload fields |
|---|---|---|
| `beforeInsert` | Before a row is inserted | `model`, `table`, `data` |
| `afterInsert` | After successful insert | `model`, `table`, `data` |
| `beforeUpdate` | Before an update runs | `model`, `table`, `data`, `filter` |
| `afterUpdate` | After an update completes | `model`, `table`, `data`, `filter` |
| `beforeDelete` | Before a delete runs | `model`, `table`, `filter` |
| `afterDelete` | After a delete completes | `model`, `table`, `filter` |
| `beforeMigrate` | Before migration runs | — |
| `afterMigrate` | After migration completes | — |

### Use cases

- **Observe** — log queries, count operations, push metrics to Datadog/Prometheus
- **Audit** — capture before/after snapshots of every update or delete
- **Trace** — correlate DB operations with request IDs via `orm.withContext()` — the context object is available as `ctx.context` inside `on()`
- **Extend** — `install(orm)` receives the full ORMManager, so you can monkey-patch it or add custom methods

### Limitations

- Events are **fire-and-observe** — return values from `on()` are ignored; plugins cannot cancel or modify operations
- Currently only model CRUD + migration events exist (no per-query-builder events yet)
- Plugins run **synchronously** in registration order — a slow `on()` handler blocks the operation
- `insertMany`, `updateMany`, `deleteMany` trigger the same single-row events per item in the batch

---

## Context propagation

Attach custom request-scoped context to the ORM instance — useful for logging, tracing, or tenant resolution:

```ts
// Set context (e.g. at the start of an HTTP request)
orm.withContext({ requestId: "req-123", userId: "user-42" });

// Retrieve context anywhere the ORM is accessible
const ctx = orm.getContext(); // { requestId: "req-123", userId: "user-42" }

// Clear when the request ends
orm.clearContext();
```

The context object is passed to plugin event handlers as `ctx.ormContext`, letting you correlate queries to specific requests without threading parameters through every function call.

---

## Prepared Statement Mode

Force the ORM to use prepared statements for all queries:

```ts
orm.preparedMode(true);   // Enable prepared statements
orm.preparedMode(false);  // Disable (default — simple execution)
const isPrepared = orm.isPreparedMode(); // boolean check
```

When enabled, the underlying driver's prepared statement API is used (e.g. `stmt.all()`, `stmt.run()`) instead of `db.prepare().all()` at each call. Disabled by default for simplicity.

---

## Database Resolver (multi-DB)

Register and switch between multiple database connections on a single ORM instance:

```ts
// Register an additional database
orm.addDatabase("analytics", {
  driver: "postgres",
  databaseUrl: process.env.ANALYTICS_DB,
  logs: true,
});

// Execute a query on that database
await orm.execOn("analytics", "SELECT COUNT(*) FROM events");

// Retrieve a registered database config
const config = orm.getDatabase("analytics");

// Remove a database when no longer needed
orm.removeDatabase("analytics");
```

### Full ORM queries on a named database

Use `model.useDb(name)` to get a fully typed ModelAPI bound to a different database — all CRUD operations and query builder features work:

```ts
// Register the secondary database first
orm.addDatabase("archive", { driver: "sqlite", databaseUrl: "./archive.db" });

// Create a model bound to the "archive" database
const ArchiveUsers = await orm.DB.User.useDb("archive");

// All model operations work on the secondary database
await ArchiveUsers.insert({ name: "Archived Joe", email: "joe@archive.com" });
const user = await ArchiveUsers.get({ email: "joe@archive.com" });
await ArchiveUsers.query().where("status", "=", "active").get();
```

The model's schema is shared — only the database connection changes. This allows multi-tenant setups, read-replica queries, and clean separation of operational vs. analytics data — all through the same model definition and query builder API.

`useDb` requires the secondary database to have a full `DBAdapter` (i.e. it must have been registered with a `driver` + `databaseUrl`, not a raw `exec` function). Each call creates a new model instance; caching is left to the caller.

---

## Edge & Serverless

V8-isolate runtimes (Vercel Edge, Cloudflare Workers, Netlify Edge) have no `net` module — they can't open TCP connections. SlintORM works around this by letting you swap the transport layer.

### Option 1: HTTP proxy (recommended)

Run a lightweight proxy server on any Node.js host. Your edge function sends SQL via `fetch()`, the proxy executes it against the real database.

**Client (edge function):**

```ts
import ORMManager from 'slintorm/browser';
import { proxyExec } from 'slintorm/proxy';
import schema from './schema/generated.json' assert { type: 'json' };

const orm = new ORMManager({
  exec: proxyExec({ endpoint: 'https://db-proxy.myapp.com/query' }),
  schema,
  logs: false,
});

// Full ORM — all CRUD + query builder work via the proxy
const Users = await orm.defineModel('users', 'User');
const active = await Users.query().where('status', '=', 'active').get();
```

**Server (Node.js — deploy on Fly, Railway, Render, etc.):**

```ts
import { createProxyServer } from 'slintorm/proxy';

const server = await createProxyServer({
  port: 3001,
  resolveDb: (ctx) => ({
    name: 'primary',
    driver: 'postgres',
    databaseUrl: process.env.DATABASE_URL,
  }),
  onQuery: ({ sql, db, durationMs }) =>
    console.log(`[${db}] ${durationMs}ms — ${sql.slice(0, 80)}`),
});
```

The proxy server lazily connects to the database on first use, caches connections, and handles CORS and errors. Authenticate your edge functions via headers or tokens in the `resolveDb` callback.

### Option 2: Provider-specific HTTP drivers

For providers that offer SQL-over-HTTP directly (no proxy needed):

```ts
import ORMManager from 'slintorm/browser';
import { neonExec } from 'slintorm/http-driver'; // or tursoExec, planetscaleExec

const orm = new ORMManager({
  exec: neonExec({
    endpoint: 'https://your-project.us-east-2.aws.neon.tech/sql',
    headers: { Authorization: 'Bearer ' + process.env.NEON_API_KEY },
  }),
  schema,
});
```

Available from `slintorm/http-driver`:

| Export | Database | Provider |
|---|---|---|
| `neonExec(config)` | Postgres over HTTP | [Neon](https://neon.tech) |
| `tursoExec(config)` | SQLite over HTTP | [Turso](https://turso.tech) |
| `planetscaleExec(config)` | MySQL over HTTP | [PlanetScale](https://planetscale.com) |

### What changes in edge mode

- Pass `schema` directly — no `migrate()` call (run `npx slintorm generate` at build time, import the JSON)
- Import from `slintorm/browser` for a bundle that never pulls in `node:fs`
- No SQLite in edge (no native addons) — use Turso or the proxy instead

---

## Notes

- `fs` and `path` are only loaded when schema files are read from disk.
- Only the selected database driver is required at runtime — others are never imported.
- Use `autoInstallDrivers: false` if you prefer to install the driver manually.
- All queries return mapped boolean fields, parsed JSON fields, and respect configured excludes automatically.
- MongoDB support covers CRUD, filtering, and preloads via the same query builder API; DDL/migrations are limited to index creation (`@index`/`@unique`) since MongoDB is schemaless.
- `SqlExpr.raw()` is an escape hatch for raw SQL in values — use it sparingly; driver-specific syntax may not be portable across databases.
- `dryRun()` returns the SQL the ORM would execute, but does not run it — useful for debugging or logging.
- `stream()` uses `limit/offset` internally; avoid mutations on the source table between batches in a streaming loop.
- `AfterFind` hooks run for every row returned by the query builder methods on that chain; they do not affect `insert()`, `update()`, or `delete()`.
- Plugins receive lifecycle events synchronously — avoid heavy synchronous work in `on()` handlers.
- Database resolver connections (`addDatabase`) are separate connections opened on demand; they are not part of the ORM's migration lifecycle.
- The `exec` config option bypasses TCP-based driver connection entirely — use it with `proxyExec()` (or `neonExec`/`tursoExec`/`planetscaleExec`) in edge runtimes that lack `net` module.
- When using `exec`, pass `schema` directly and skip `migrate()` — schema is known at build time.

---

## Build & test

```bash
npm run build
npm test
```

---

## Relationships

* One-to-many: `@relation onetomany:Post;foreignKey:userId`
* Many-to-one: `@relation manytoone:User;foreignKey:userId`
* One-to-one: `@relationship onetoone:Profile;foreignKey:userId`
* Many-to-many: `@relation manytomany:Team;through:team_members;foreignKey:userId;relatedKey:teamId` — the pivot table is auto-created if not declared as its own model.

---

## Migrations

The ORM automatically ensures that tables exist and applies schema changes based on your model metadata:

```ts
await orm.migrate();
```

For rollback, snapshotting, status, and production cutover, see [CLI](#cli) above.

---

## Why use SlintORM?

Many TypeScript ORMs are either minimal but lacking features (like Drizzle) or extremely heavy (like Prisma). SlintORM balances **ease of use, flexibility, and performance** — ideal for projects that need quick iteration, full control over queries, and GORM-inspired patterns in TypeScript, from the very first prototype through to production.

SlintORM is **best suited for developers who want a GORM-inspired workflow in TypeScript**: minimal setup, automatic migrations, and full SQL query control. Drizzle is lightweight and type-safe but lacks advanced query features. Prisma is powerful and production-ready, but heavier, with more boilerplate and tooling setup.

SlintORM fills the niche for **quick iteration, flexible queries, and minimal friction** — perfect for both learning and production projects.

---

## Further reading

- **`QUERY_BUILDER.md`** — full query builder & `ModelAPI` reference, every method with usage examples.
- **`llms.txt`** — condensed reference for AI coding assistants working in a SlintORM codebase.
- **`example.ts`** — a complete, runnable walkthrough exercising 34 feature sections of the library in one file.
- **`src/proxy.ts`** — proxy client + server for running queries from edge runtimes (Vercel Edge, Cloudflare Workers).
- **`src/http-driver.ts`** — provider-specific HTTP drivers for Neon, Turso, and PlanetScale.