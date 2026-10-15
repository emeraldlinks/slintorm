# Query builder reference

`Model.query()` returns a chainable builder. It is lazy — nothing runs until
`get()`, `first()`, `count()`, `delete()`, or `update()`.

## Where

```ts
where(column, op, value)      op: = != <> > >= < <= LIKE NOT LIKE ILIKE NOT ILIKE IS IS NOT IN NOT IN BETWEEN
orWhere(column, op, value)
whereIn(column, values)
whereNotIn(column, values)
whereNull(column)
whereNotNull(column)
whereBetween(column, min, max)
whereColumnsIn(columns, [[a,b],[c,d]])
whereRaw(sql, params?)        ⚠ SQL drivers only
```

```ts
const posts = await Post.query()
  .where("status", "=", "published")
  .where("views", ">", 100)
  .whereIn("authorId", [1, 2, 3])
  .whereBetween("createdAt", "2024-01-01", "2024-12-31")
  .whereNull("deletedAt")
  .get();
```

## Ordering, paging, shaping

```ts
orderBy(column, "asc" | "desc")
limit(n) / offset(n)
paginate(page, perPage)      1-indexed
select(...cols)              chainable
exclude(...cols)
```

## Terminals

```ts
get()            → T[]
first(cond?)     → T | null
count()          → number
delete()         → number
update(data)     → number
getPaginated(...)→ { data, total, page, perPage, totalPages }
```

## Projection helpers

```ts
pick(...cols)    → immediate subset
pluck(col)       → flat array of one column
```

```ts
const names = await Post.query().pluck("title");      // string[]
const cards = await Post.query().pick("title", "views");
```

> `pick()` does not omit unselected keys — they come back **present and
> `null`**. Test for the value, not for the key's absence.

## Relations

```ts
preload(relation, opts?)   // JOIN on SQL, embedded resource on PostgREST
join(table, onLeft, op, onRight)
leftJoin(table, onLeft, op, onRight)
relatedTo(targetModel, column, value)
```

```ts
const withPosts = await User.query().preload("posts").get();
const linked = await Post.query().relatedTo("User", "userId", 7).get();
```

`join()`/`leftJoin()` are raw SQL construction and **throw on the `postgrest`
driver**. Use `preload()` instead — it is the portable choice.

## Caching

```ts
cache(key, ttlSeconds = 300)
QueryBuilder.clearCache()      // static
```

## Hooks

```ts
afterFind((rows) => rows)      // receives ALL rows, must return them
```

Batch-level, not per-row. Return the array or the query returns `undefined`.

## Introspection

```ts
toSql()      → { sql, params }
dryRun()     → this, marks the chain to return SQL instead of executing
```

Useful for debugging and for logging queries without executing them.

## Edge driver behaviour

On `driver: "postgrest"` the builder emits a JSON command instead of SQL and
these **throw** rather than silently doing nothing:

| Call | Use instead |
|---|---|
| `whereRaw()` | `where()` / `whereIn()` / `whereBetween()` |
| `join()` / `leftJoin()` | `preload()` |
| `having()` | filter in application code |

Silent degradation is worse than a throw — a filter that quietly does nothing is
indistinguishable from one that works.

## Verify

```bash
npx tsx .opencode/skills/slintorm/examples/verified.ts
```

Covers `where`/`orWhere`/`whereIn`/`whereBetween`/`whereNull`, `orderBy`,
`limit`, `first`, `pick`, `pluck`, terminal `delete`/`update`,
`findInBatches`, `afterFind`, and the PostgREST throw behaviour.