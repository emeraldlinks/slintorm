# CLI and migrations

```bash
npx slintorm <command>
```

| Command | Purpose |
|---|---|
| `generate` | parse `// @directive` comments → `src/schema/generated.json` |
| `migrate` | apply pending migrations |
| `rollback [n]` | revert the last n migrations |
| `status` | show applied / pending |
| `fresh` | drop everything and re-migrate — **destroys data** |
| `diff` | show schema drift |
| `seed [name]` | run a seed |
| `drop-tracking` | remove migration tracking rows |

Run `npx slintorm help` for flags.

## The normal loop

```bash
# 1. edit interfaces, adding // @directive comments
# 2. regenerate the schema
npx slintorm generate
# 3. check what will change
npx slintorm status
# 4. apply
npx slintorm migrate
```

## Point `dir` at an empty directory

```ts
new ORMManager({ dir: "./migrations" })
```

> Migration tooling diffs against **records on disk as well as the database**.
> Pointing `dir` at your source tree makes every change look already-applied,
> and migrations silently no-op. Use a dedicated empty directory.

## Data migrations

```ts
await orm.migrateData([
  {
    name: "backfill-slug",
    up: async () => { /* ... */ },
    down: async () => { /* ... */ },
  },
]);
// → { applied: number, names: string[] }
```

## Multi-database

```ts
await orm.runSeed("catalog")
await orm.runAllSeeds()
```

## Transactions

```ts
await orm.transaction(async (tx) => {
  const u = await db.User.insert({ name: "Ada" });
  await db.Post.insert({ userId: u.id, title: "Hello" });
});
```

> **SQL drivers only.** On `driver: "postgrest"` there is no transaction
> support and it throws. Design edge code so each request is independently
> consistent.

```ts
await orm.batch([
  { sql: "UPDATE a SET x=1", params: [] },
  { sql: "UPDATE b SET y=?", params: [2] },
]);
```

## Programmatic access

```ts
orm.migrate()                  // apply pending
orm.rlsEnabled()               // is RLS on
orm.preparedMode(true) / orm.isPreparedMode()
orm.enableAuditLogging({ tableName: "audit_log", excludeModels: ["Session"] })
```

## Edge runtimes: no CLI, no filesystem

Edge builds have no filesystem, so `generate`/`migrate` cannot run there.
Generate at build time and inline the JSON:

```bash
npx slintorm generate          # in your build step
```

```ts
import schema from "./schema/generated.json" with { type: "json" };

const orm = new ORMManager({ driver: "postgrest", postgrestUrl, schema });
```

Pass `schema` to the constructor — that is what creates tables on SQL drivers.
`createORM({ schema })` does the same automatically.

## Scripts

```bash
npm run check            # lint + typecheck + suite
npm run test:sqlite      # SQLite only, no credentials
npm run build
npm run cli -- --help
```