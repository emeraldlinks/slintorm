# Schema reference

Two ways to declare a schema. Both produce the same runtime shape.

## A. TypeScript interfaces + generator (recommended)

Write interfaces with `// @directive` comments above each field, then:

```bash
npx slintorm generate      # writes src/schema/generated.json
```

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

const orm = new ORMManager({ driver: "sqlite", databaseUrl: "./db.sqlite" });
const Users = await orm.defineModel<User>("users", "User");  // no schema argument
```

`createdAt`/`updatedAt` are auto-populated if present.

## B. Hand-written JSON (edge runtimes, no filesystem)

```ts
const orm = new ORMManager({
  driver: "postgrest",
  postgrestUrl: "https://x.supabase.co/rest/v1",
  postgrestKey: process.env.SUPABASE_ANON_KEY,
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

Shape: `Record<ModelName, { table?, fields: Record<string, {type, optional?, meta}>, relations: [] }>`.

Directives work with or without the leading `@` — both are read.

## Field types

| `type` | SQL |
|---|---|
| `string` | `TEXT` |
| `number` / `int` / `float` | `INTEGER` |
| `boolean` | `BOOLEAN` |
| `date` / `time` | `DATETIME` |

Unrecognised types fall back to `TEXT`.

## Column directives

**Keys and indexes**

| Directive | Effect |
|---|---|
| `@auto` | autoincrement primary key |
| `@primaryKey` | part of the primary key |
| `@unique` | unique constraint — **also forces NOT NULL** (see below) |
| `@index` | create an index |
| `@default:<v>` | column default |
| `@defaultFn` | function default |
| `@random` | random default |

**Nullability**

| Directive | Effect |
|---|---|
| `@nullable` | allows NULL |
| `@notnull` / `@not null` | explicit NOT NULL |

A field is nullable when it has `@nullable`, is an optional TS type (`?`), is a
soft-delete column, or is an enum with no default.

> **`@unique` forces NOT NULL.** `src/migrator.ts:257` checks `isUnique` before
> any other rule, so a field marked only `@unique` becomes required — even if
> the TS type is `?`. If you want a nullable unique column, that is not
> expressible today; verify with a test before relying on it.

**Length, format, type modifiers**

| Directive | Effect |
|---|---|
| `@length:<n>` | `VARCHAR(n)` in DDL. **Not validated at runtime.** |
| `@minLength` / `@maxLength` | **runtime** length validation (throws on insert) |
| `@min` / `@max` | runtime numeric bounds |
| `@pattern:<re>` | runtime regex match |
| `@email` / `@url` / `@uuid` / `@phone` | runtime format validation |
| `@enum:(a,b,c)` | enum column |
| `@collate` | collation |
| `@json` / `@jsonDefault` | JSON column |
| `@comment:<text>` | column comment |
| `@check` | CHECK constraint |

> **`@length` is DDL-only.** It sizes the column and does **not** reject
> over-long values at runtime. Use `@maxLength` if you want an actual
> guarantee — that one is enforced and throws a `ValidationError`.

**Referential**

| Directive | Effect |
|---|---|
| `@foreignKey:<col>` | FK column |
| `@onDelete` | `CASCADE` / `SET NULL` / `RESTRICT` / `NO ACTION` |
| `@onUpdate` / `@onUpdateNow` | ON UPDATE behaviour |
| `@deferrable` | deferred FK constraint |
| `@generatedAlways` | identity column |

**Security** (all require care)

| Directive | Effect |
|---|---|
| `@hash` | PBKDF2-HMAC-SHA256, 600k iterations, random salt |
| `@secret` | shorthand for `@hash` + `@omitjson` |
| `@encrypt` | AES-256-GCM; requires `encryptionKey` on the ORMManager |
| `@mask` | masks the value on read |
| `@omit` / `@omitdb` | never written to the database |
| `@omitjson` | omitted from default JSON output |

`encryptionKey` must be **≥32 characters** and identical across every instance
sharing a database. Rotating it requires re-encrypting every field.

> `@omitjson` is **advisory**, not access control. It controls default output
> only. Anything that reaches for the raw column bypasses it — use RLS or
> `@omit` for confidentiality.

## Relations

Both `@relation` and `@relationship` are accepted.

| Form | Meaning |
|---|---|
| `onetomany` | parent has many children |
| `manytoone` | many children to one parent |
| `onetoone` | one-to-one |
| `manytomany` | many-to-many — **requires `through`** |

```
// @relationship onetomany:Post;foreignKey:userId
posts?: Post[];

// @relation manytoone:User;foreignKey:userId;onDelete:SET NULL
user?: User;

// @relation manytoone:Team;through:team_members;foreignKey:userId;relatedKey:teamId
teams?: Team[];
```

`through` names the junction table; `relatedKey` names its far side. Pivot
tables are created automatically for many-to-many.

**Relation fields are placeholders — they do not become columns.** A field is
treated as a relation placeholder only if it carries a relation directive;
a field merely *named* `relations` is a normal column.

## Soft delete

```
// @softDelete
deletedAt?: string;
```

After this, `delete(filter)` sets `deletedAt`. Every read filters it out
automatically. `forceDelete(filter)` erases the row for real.
`getAll(filter, { withTrashed: true })` reveals deleted rows.

## Verify your schema

```bash
npx tsx .opencode/skills/slintorm/examples/verified.ts
```

Asserts `@unique`-implies-NOT-NULL, `@length` vs `@maxLength`, soft-delete
semantics, and the hooks/schema split.