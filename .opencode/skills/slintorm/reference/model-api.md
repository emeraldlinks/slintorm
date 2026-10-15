# Model API reference

Everything on the object returned by `defineModel(table, modelName, hooks?)`.

## Read

```ts
get(filter)                     → row | null        // rejects unknown filter keys
getAll(filter?, opts?)          → row[]            // opts: { withTrashed?: boolean }
count(filter?)                  → number
exists(filter)                  → boolean
query()                         → QueryBuilder
sum/avg/min/max(column, filter?)→ number
```

`getAll()`'s filter is validated against schema fields — unknown keys throw.

```ts
const one   = await Users.get({ email: "a@x.io" });
const many  = await Users.getAll({ status: "active" });
const total = await Users.count();
const hasIt = await Users.exists({ email: "a@x.io" });
const aged  = await Users.sum("age", { active: true });
```

## Write

```ts
insert(item)                    → created row
insertMany(items)               → row[]
update(filter, partial)         → updated row | null
updateMany(filter, data)        → number updated
delete(filter)                  → row   // soft-deletes if @softDelete
forceDelete(filter)             → raw result — always erases
deleteMany(filter)              → number
restore(filter)                 → void  // clears the soft-delete marker
truncate()                      → void  // ⚠ destroys all rows
```

```ts
const u = await Users.insert({ name: "Ada", email: "ada@x.io" });
await Users.insertMany([{ name: "B", email: "b@x.io" }]);
await Users.update({ id: u.id }, { name: "Ada L" });
await Users.updateMany({ role: "guest" }, { role: "user" });
```

> On a `@softDelete` model `delete()` **does not remove the row** — it stamps
> `deletedAt`. Use `forceDelete()` to erase. This is the single most common
> surprise in the library.

## Upsert / find-or-create

```ts
await Users.upsert(filter, data)                  → "inserted" | "updated"
await Users.findOrCreate(filter, defaults)        → { record, created }
await Users.firstOrInit(filter, defaults?)        → row | null
```

```ts
const { record, created } = await Users.findOrCreate(
  { email: "a@x.io" },
  { email: "a@x.io", name: "A" },
);
```

## Validation

```ts
check(data, rules)     → Record<string,string> | null   // never throws
validate(data, rules)  → void                             // throws
```

`check` returns errors for you to turn into a 400. `validate` throws.

```ts
const errors = Users.check(body, { name: { required: true }, email: { email: true } });
if (errors) return res.status(400).json({ errors });
```

## Batching

```ts
findInBatches(filter | null, batchSize, callback)
```

Callback receives `(records, batchNumber)`. Use for large exports — it never
loads the whole table.

```ts
await Users.findInBatches(null, 500, async (rows, n) => {
  console.log(`batch ${n}: ${rows.length}`);
});
```

## Relations

```ts
preload(relation)        → void   (then query().get() includes the data)
withOne(relation)        → related | null
withMany(relation)       → related[]
```

```ts
await Users.query().preload("posts").get();
// or on the model
const posts = await Users.withMany("posts");
```

On the `postgrest` driver `preload()` becomes an embedded-resource fetch — one
round trip, no N+1. On SQL drivers it emits a JOIN.

## Per-model database

```ts
const Analytics = await Users.useDb("analytics");
```

## Hooks

Third argument of `defineModel`. This is the argument most often misused as a
schema — it is hooks, nothing else.

```ts
const Users = await orm.defineModel("users", "User", {
  onCreateBefore: (item) => ({ ...item, createdBy: "system" }),  // return to mutate
  onCreateAfter:  (item) => {},
  onUpdateBefore: (oldData, newData) => newData,
  onUpdateAfter:  (oldData, newData) => {},
  onDeleteBefore: (deleted) => {},
  onDeleteAfter:  (deleted) => {},
});
```

`onCreateBefore` / `onUpdateBefore` transform the row — **you must return it**.

## Model-level config

```ts
preparedMode(true) / isPreparedMode()
useDb(name)
validate() / check()
```