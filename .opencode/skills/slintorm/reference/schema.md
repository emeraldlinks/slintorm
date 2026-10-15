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

## B. Import the generated JSON (edge runtimes have no filesystem)

`generate` needs a filesystem, so on edge you generate in your build step and
import the result. This is the project's own pattern (`SERVERLESS.md:18-25`):

```ts
// lib/db.ts — runs in an edge function
import ORMManager from 'slintorm/edge';
import schema from '../src/schema/generated.json' with { type: 'json' };

const orm = new ORMManager({
  driver: 'postgrest',
  postgrestUrl: process.env.SUPABASE_URL!,
  postgrestKey: process.env.SUPABASE_ANON_KEY!,
  schema,                                 // ← the generated JSON
});
```

What `generate` emits, copied from `src/schema/generated.json`:

```jsonc
{
  "User": {
    "primaryKey": "id",              // top-level, not in SchemaModel
    "table": "users",
    "fields": {
      "id":   { "type": "number | undefined", "originalType": "number",
                "optional": true,  "meta": {} },
      "name": { "type": "string", "originalType": "string", "optional": false,
                "meta": { "@minLength": "2", "@maxLength": "100" } }
    },
    "relations": []
  }
}
```

**`type` is the TypeScript type, not the SQL type.** Real values include
`"number | undefined"`, `"Payment[] | undefined"`,
`"Record <string ,any > | undefined"`. A bare SQL type also works —
`tsTypeToSqlType` matches on substrings — but the generator emits TS unions, and
writing those by hand is exactly the kind of thing that silently degrades.

`originalType` and top-level `primaryKey` are emitted but absent from the
`SchemaModel`/`FieldInfo` interfaces.

**Don't hand-author this file.** It has 100+ meta keys. Run
`npx slintorm generate`.

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
| `@omitmigrate` | skipped by the migrator — no column is created for it |
| `@polymorphicType` / `@polymorphicId` | marks a polymorphic relation pair; handled by the relation system (`migrator.ts:388-392`) |

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