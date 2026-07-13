# SlintORM Annotation Roadmap

## ✅ Shipped

### v1.9.1 — Row-Level Security

| Feature | Behavior |
|---|---|
| `rls: true` config option | Enables automatic `set_config()` calls before every query, propagating OrmContext values as PostgreSQL session parameters for RLS policies. |
| `orm.withContext({ tenant_id: "abc" })` | Sets RLS context values (prefixed with `rls.`). |
| `orm.rlsEnabled()` | Returns whether RLS mode is active. |
| Session-scoped `set_config` | Uses `false` for session scope so settings persist across queries on the same connection. |
| Redundant call skipping | Caches last-set RLS values to avoid repeated `set_config` calls for unchanged context. |

**Requirements:** The database user must NOT have `BYPASSRLS` attribute (superusers bypass RLS). Use a dedicated application role.

---

## ✅ Shipped — v1.9.0

### Security Annotations

| Annotation | Behavior |
|---|---|
| `@hash` | PBKDF2 hashing on write; `.verify(plaintext)` method attached on read |
| `@encrypt` | AES-256-GCM encryption on write; raw ciphertext with `.decrypt()` method on read |
| `@encrypt:(decrypt=auto)` | Same encryption; auto-decrypted to plain `string` on read |
| `@secret` | `@hash` + `@omitjson` combined — PBKDF2 hashed, excluded from JSON output |
| `.verify()` | Type-safe on `@hash` fields in generated schema types |
| `.decrypt()` | Type-safe on `@encrypt` fields in generated schema types |

### Validation Annotations

| Annotation | Validates |
|---|---|
| `@email` | RFC 5322-ish email regex |
| `@url` | URL with protocol |
| `@uuid` | UUID v4 format |
| `@phone` | 7–15 digit phone (non-digits stripped) |
| `@min:N` | Numeric minimum |
| `@max:N` | Numeric maximum |
| `@minLength:N` | String minimum length |
| `@maxLength:N` | String maximum length |
| `@pattern:regex` | Custom regular expression |

### Random / Auto-generation

| Annotation | Behavior |
|---|---|
| `@random:string:N` | Alphanumeric string of length N |
| `@random:number:N` | Numeric string of N digits |
| `@random:alnum(N)` | Mixed-case alphanumeric |
| `@random:alnum(N, upper/lower)` | Case-controlled alphanumeric |
| `@random:lower(N)` | Lowercase letters only |
| `@random:upper(N)` | Uppercase letters only |
| `@random:hex(N)` | Lowercase hex |
| `@random:hex(N, upper)` | Uppercase hex |
| `@random:custom(CHARS, N)` | Custom charset |
| Prefix/suffix via `pfx=` / `sfx=` | Works with all variants |

### Omit / Visibility Family

| Annotation | Behavior |
|---|---|
| `@omitdb` | No column in DB. Excluded from INSERT/UPDATE/reads. |
| `@omitjson` | Stored in DB. Stripped from `get()`/`getAll()`/`query()` results. Returned on `.select("field")`. |
| `@omitmigrate` | Migrator never creates/alters/drops column. Manual DDL. Full query visibility. |

### Masking

| Annotation | Behavior |
|---|---|
| `@mask:ssn` | Shows last 4: `***-**-6789` |
| `@mask:creditcard` | Shows last 4: `****-****-****-1234` |
| `@mask:email` | Masks local part: `j***@example.com` |
| `@mask:phone` | Shows last 4: `***-***-7890` |
| `@mask:showFirst:N` | Shows first N chars, masks rest |
| `@mask:showLast:N` | Shows last N chars, masks rest |
| `@mask:showBoth:F,L` | Shows first F and last L chars |
| `@mask:char:X` | Custom mask character |
| `@mask:pattern:...` | `#` = keep, rest literal. `###-##-####` → `123-**-6789` |
| `.withoutMasking()` | Bypass all masks on query builder chain |

## ⬜ Planned

### 1. Sanitization — input transforms on write

Runs before validation and before DB write. Transforms the value in-place (mutates the data object). Chainable: multiple `@sanitize` directives on one field apply in declaration order.

```
@sanitize:trim        — String.prototype.trim()
@sanitize:lower       — .toLowerCase()
@sanitize:upper       — .toUpperCase()
@sanitize:stripTags   — Remove HTML tags via regex /<[^>]*>/g
@sanitize:escape      — Escape & < > " ' for HTML safety
```

**Implementation plan:**

| Step | File(s) | What |
|---|---|---|
| Generator parse | `src/generator.ts` | Parse `@sanitize:trim`, `@sanitize:lower`, etc. Store as `sanitize` array in field metadata (order matters). |
| Sanitize pipeline | `src/extensions.ts` | New `runSanitizers(fieldValue, sanitizers[]): any` — applies each sanitizer in order. Non-string values skip string sanitizers (trim/lower/upper/stripTags) but pass through escape (calls `String()`). |
| Hook integration | `src/model.ts` | In `insert()` and `update()`, run sanitization inside data mutation pipeline, before validation, before `onCreateBefore`/`onUpdateBefore` hooks. |

**Edge cases:**
- `@sanitize:trim` + `@sanitize:lower` → trims first, then lowercases
- Nullable fields: null stays null, don't crash on null.trim()
- Non-string fields with `@sanitize:lower` → warn and skip
- `@sanitize:escape` on objects → JSON.stringify then escape? Or skip? Decision: skip non-strings.
- `@sanitize:stripTags` on safe input → no-op

**Test strategy:**
- Unit: each sanitizer in isolation
- Unit: chain order (trim then lower vs lower then trim)
- Integration: insert with sanitized field, read back transformed
- Integration: update with sanitized field, read back transformed
- Integration: null/undefined fields skip sanitization

---

### 2. Expiry & Audit — time-based expiration + CUD tracking

```
@expires:Nd / :Nh / :Nm  — Auto-expire after N days/hours/minutes
@cuid:create              — Auto-set createdBy from ctx.userId on insert
@cuid:update              — Auto-set updatedBy from ctx.userId on update
@cuid:delete              — Auto-set deletedBy from ctx.userId on soft-delete
```

**Implementation plan:**

| Step | File(s) | What |
|---|---|---|
| @expires generator | `src/generator.ts` | Parse `@expires:Nd`, `@expires:Nh`, `@expires:Nm`. Store duration + unit. The migrator adds `expiresAt TEXT` column automatically (like `createdAt`/`updatedAt`). |
| @expires write | `src/model.ts` | On insert/update: compute `expiresAt = now + duration`, store as ISO string. If value is null, set `expiresAt = null`. |
| @expires read | `src/queryBuilder.ts` | All queries auto-add `WHERE (expiresAt IS NULL OR expiresAt > ?)` with current timestamp param. |
| @expires get() | `src/model.ts` | `get()` and `getAll()` return null for expired rows. Add `.withExpired()` to query builder (like `.withTrashed()`). |
| @cuid generator | `src/generator.ts` | Parse `@cuid:create`, `@cuid:update`, `@cuid:delete`. Store audit direction. |
| @cuid runtime | `src/model.ts` | On insert: set field to `orm.getContext().userId`. On update: update field. On soft-delete: set field. If context has no userId, skip with warn. |
| CUID query filter | `src/queryBuilder.ts` | `@cuid:delete` auto-filters `WHERE deletedBy IS NULL` (like soft delete). Add `.withDeletedBy()` to include. |

**Edge cases:**
- `@expires` on PK field → warn, not allowed
- `@expires` + `@softDelete` → both filters applied (AND)
- `@cuid` without context → skip, warn once per defineModel
- `@expires` on update: should refresh expiresAt or keep original? Decision: refresh on update (extend expiry).
- Timezone: all times stored as UTC ISO strings, compared as `> datetime('now')` in SQL.

**Test strategy:**
- Integration: insert with `@expires:1s`, wait 2s, get() returns null
- Integration: `.withExpired()` returns expired rows
- Integration: `@cuid:create` with context set, check field value on read
- Integration: `@cuid:create` without context → no error, field stays null/default

---

### 3. Multi-tenant — automatic row-level isolation

```
@tenant    — Auto-filter all queries by ctx.tenantId. Auto-set on insert.
@owner     — Auto-scope reads to ctx.userId. Auto-set on insert. .asAdmin() bypass.
```

**Implementation plan:**

| Step | File(s) | What |
|---|---|---|
| Generator parse | `src/generator.ts` | Parse `@tenant` and `@owner`. Store as field metadata. Add `tenantId` / `ownerId` column type hint to migrator. |
| Tenant filter | `src/queryBuilder.ts` | All terminal methods (`get()`, `getAll()`, `first()`, `count()`, `update()`, `delete()`) auto-inject `WHERE tenantId = ?` with value from `orm.getContext().tenantId`. Runs before user's `.where()` clauses. |
| Owner filter | `src/queryBuilder.ts` | Like tenant but for `ownerId = ctx.userId`. `.asAdmin()` clears the owner filter. |
| Auto-set on insert | `src/model.ts` | On `insert()`: if `@tenant` field is null/undefined, set to `ctx.tenantId`. Same for `@owner` → `ctx.userId`. |
| Multi-tenant bypass | `src/queryBuilder.ts` | Add `.asAdmin()` method to `ExtendedQueryBuilder` that strips tenant/owner filters. Checks a config-level `adminKeys` or just clears unconditionally (developer responsibility). |
| Cross-tenant relations | `src/queryBuilder.ts` | Preloads and joins should propagate tenant filter to related tables when the related model also has `@tenant`. |

**Edge cases:**
- `@tenant` without context → warn, queries return 0 results (fail-closed)
- `@owner` without context → warn, queries return 0 results (fail-closed)
- `@tenant` + `@owner` on same model → both filters applied (AND)
- Bulk operations (`updateMany`, `deleteMany`) → tenant filter applied
- `insertMany` → each row gets tenant/owner set
- `@tenant` on a relation FK → the FK value should match the tenant context. Warn on mismatch.
- `.asAdmin()` logs a warning for audit trail

**Test strategy:**
- Integration: set tenant context, insert, get returns only that tenant's rows
- Integration: wrong tenant context → get returns null
- Integration: `.asAdmin()` returns all rows regardless of owner
- Integration: insert without context → returns 0 results on query

---

### 4. Relation Shortcuts — concise alternatives to verbose `@relation`

```
@belongsTo:Model         → @relation manytoone:Model;foreignKey:modelId
@hasMany:Model           → @relation onetomany:Model;foreignKey:modelId
@hasOne:Model            → @relation onetoone:Model;foreignKey:modelId
@belongsToMany:Model     → @relation manytomany:Model;through:model_models
```

**Implementation plan:**

| Step | File(s) | What |
|---|---|---|
| Generator parse | `src/generator.ts` | In the relation-parsing branch, detect `@belongsTo:User`, `@hasMany:Post`, `@hasOne:Profile`, `@belongsToMany:Team`. Infer `foreignKey` from model name (`userId`, `postId`, etc.). Infer `through` table name for belongsToMany (`users_teams`). |
| FK convention | `src/generator.ts` | `@belongsTo:Post` → foreignKey is `postId` (lowercase model + "Id"). `@hasMany:Comment` → foreignKey is `commentId` (but this goes on the other model). Actually `@hasMany:Comment` on User means `User has many Comment` → foreignKey is `userId` (on Comment table). Need to be careful about which side the FK lives. |

**FK inference rules:**
- `@belongsTo:Model` → FK = `modelId` (lowercased) on current table
- `@hasMany:Model` → FK = `currentModelId` on the target table
- `@hasOne:Model` → FK = `currentModelId` on the target table
- `@belongsToMany:Model` → through table = `current_table_target_table` (alphabetical), FK1 = `currentModelId`, FK2 = `targetModelId`

**Edge cases:**
- Custom FK name → allow `@hasMany:Post;foreignKey:authorId` to override convention
- Missing inverse relation → warn (like full `@relation` syntax)
- `@belongsTo` on field named `author` → FK should still be `userId` (from the model name, not the field name). Or should it be `authorId`? Decision: FK from model name, document convention.
- `@belongsToMany` with custom through table → `@belongsToMany:Team;through:team_members`

**Test strategy:**
- Unit: each shortcut expands to correct `@relation` equivalent
- Integration: generate schema with shortcuts, verify relations in output
- Integration: query with preload works same as full syntax

---

### 5. Data Lifecycle & DDL Extras

```
@slug:sourceField              — Auto-generate URL slug from source field on insert
@counterCache:relation.field   — Auto-increment/decrement counter on parent
@fulltext                      — FTS index (FTS5 for SQLite, MATCH/AGAINST for MySQL, GIN for Postgres)
@spatial                       — GiST index for Postgres, SPATIAL index for MySQL
@partialIndex:WHERE condition  — Conditional index (Postgres only, warn on other dialects)
```

**Implementation plan:**

| Step | File(s) | What |
|---|---|---|
| @slug generator | `src/generator.ts` | Parse `@slug:title` (source field = `title`). Store source field name. |
| @slug runtime | `src/model.ts` | On insert: if slug is null/empty, generate from source field via `.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`. Append `-2`, `-3` etc if not unique (retry with counter). |
| @slug regenerate | `src/extensions.ts` | Add `.regenerateSlug()` method to `EntityWithUpdate`. Re-fetches source field, re-generates slug, saves. |
| @counterCache generator | `src/generator.ts` | Parse `@counterCache:comments.count` (model.field). Store target relation + field. |
| @counterCache runtime | `src/model.ts` | On insert of child: `UPDATE parent SET count = count + 1 WHERE id = ?`. On delete of child: `SET count = count - 1`. Use raw SQL for atomicity. |
| @fulltext generator | `src/generator.ts` | Parse `@fulltext` on a field. Store as index metadata. |
| @fulltext migrator | `src/migrator.ts` | After creating the table, create FTS index: `CREATE INDEX idx_table_field ON table USING GIN(to_tsvector('english', field))` (Postgres), `CREATE FULLTEXT INDEX ON table (field)` (MySQL), `CREATE VIRTUAL TABLE table_fts USING fts5(field)` (SQLite). |
| @spatial generator | `src/generator.ts` | Parse `@spatial` on a field (must be geometry/JSON type). |
| @spatial migrator | `src/migrator.ts` | `CREATE INDEX idx_table_field ON table USING GIST(field)` (Postgres), `CREATE SPATIAL INDEX ON table (field)` (MySQL). SQLite → warn, skip. |
| @partialIndex generator | `src/generator.ts` | Parse `@partialIndex:WHERE active = 1`. Store condition string. |
| @partialIndex migrator | `src/migrator.ts` | `CREATE INDEX idx_table_field ON table (field) WHERE condition` (Postgres only). MySQL → warn, create without partial. SQLite → support if 3.25+ (partial indexes added in 3.8?). |

**Slug edge cases:**
- Source field is empty → skip, no slug generated
- Source field changes after insert → slug stays original (use `.regenerateSlug()`)
- Unicode in source → transliterate or strip diacritics? Decision: strip non-ASCII.
- Max slug length → truncate at 200 chars, append hash to avoid truncation collisions.

**CounterCache edge cases:**
- Batch insert/delete → need to accumulate parent changes, single UPDATE per parent
- Soft delete → counter decrements on soft delete? Decision: yes (count reflects "active" children)
- `restore()` → counter increments back
- circular counter cache → detect at defineModel time, warn

**FTS/spatial/partial edge cases:**
- `@fulltext` on SQLite without FTS5 → fall back to `LIKE` search, warn
- `@fulltext` on multiple fields → single composite FTS index? Or per-field? Decision: per-field by default, composite if `@fulltext:field1,field2` syntax.
- `@partialIndex` with invalid SQL → migrator catches and warns, creates full index instead

**Test strategy:**
- Integration: insert with `@slug:title`, verify slug is auto-generated
- Integration: duplicate slug → second insert gets `title-2`
- Integration: counterCache increments on child insert, decrements on delete
- CLI test: `npx slintorm generate` produces correct FTS/spatial/partial index DDL
- Integration: FTS search returns expected results

---

### Composite Annotation

```
@secret   — Expands to @hash:pbkdf2 + @omitjson + log redaction
```

Sugar that applies three annotations at once. The generator expands it into its components during parse phase, so the runtime never sees `@secret` directly.

**Implementation:**
```
In generator.ts, during token scanning:
  if (tag === "@secret") {
    tags.push("@hash:pbkdf2", "@omitjson");
    markFieldAsSecret(name); // for log redaction
  }
```

Log redaction: in `model.ts`, when logging SQL params (if `logs: true`), replace secret field values with `[REDACTED]`.

---

## Implementation Order

| Batch | Dependencies | Est. complexity |
|---|---|---|
| 1. Validation annotations | None (pure regex) | Low |
| 2. Relation shortcuts | Generator only | Low |
| 3. Sanitization | None (pure string ops) | Low |
| 4. @token | None (crypto.randomBytes) | Low |
| 5. @slug | Generator + model hook | Medium |
| 6. @expires | Generator + model hook + query filter | Medium |
| 7. @cuid | Generator + model hook + context | Medium |
| 8. @counterCache | Generator + model hook + raw SQL | Medium |
| 9. @hash / @encrypt | Generator + model hook + crypto | High |
| 10. Multi-tenant | Generator + query filter + model hook | High |
| 11. @fulltext / @spatial / @partialIndex | Generator + migrator | High |

Batches with no dependencies can be implemented in parallel.

---

### 6. Security Hardening (sug.txt)

| # | Item | File | What |
|---|---|---|---|
| 1 | Bump HASH_ITERATIONS | `src/security.ts` | Increase from 100,000 to 600,000+. Encode iteration count into stored format so existing hashes stay valid when the constant changes. |
| 2 | Cache `deriveEncryptionKey` | `src/security.ts` | Memoize per-field key derivation in a Map so repeated encrypt/decrypt on the same field don't re-run PBKDF2. |
| 3 | `@encrypt` throws on missing key | `src/security.ts` | Replace `console.warn` + silent skip with a throw when `encryptionKey` isn't configured. |
| 4 | Per-field iteration override | `src/generator.ts` | `@hash:(iterations=600000)` — annotation grammar uniform with `@encrypt:(decrypt=auto)`. |
| 5 | Wire up `reportError` | `src/generator.ts` | Change no-op to `console.warn` with file/line info. |
| 6 | Self-teaching errors | `src/security.ts` | Malformed hash/encrypt values should explain expected format inline. |
