# Changelog

## [1.10.1] — 2026-10-28

### Fixed
- **Postgres/MySQL driver fails under ESM serverless bundlers (Critical).** Bundlers that inline a CJS driver into an ESM handler rewrite its `require("events")` into esbuild's throwing shim, so `import("pg")` failed with `Dynamic require of "events" is not supported` even though the driver was installed and the host had TCP sockets. Drivers now load through `createRequire` anchored at the deployment root when the bundler shim throws, and the failure is reported as a bundling problem (mark the driver external) instead of an edge-runtime TCP limitation.

## [1.10.0] — 2026-10-17

Security and correctness release. **Contains breaking behaviour changes.**
It also brings the test matrix up to what the README always claimed: SQLite,
MySQL, MongoDB, PostgreSQL 16 and 17, and the PostgREST edge path all run in CI,
and all of them pass.

### Security — fixed
- **SQL injection via filter-object keys (Critical).** `Model.getAll(req.body)` and
  friends took `Object.keys(filter)` straight into an identifier position. Every
  identifier quoter in the codebase is now consolidated into `src/quoting.ts`,
  which escapes delimiters and rejects control/NUL characters. Filter keys are
  allowlisted against the model's declared columns. Covers `get`, `count`,
  `update`, `updateMany`, and `delete`.
- **Raw concatenation removed** from `join`/`leftJoin`/`rightJoin`/`fullOuterJoin`/
  `crossJoin`, `orderBy` direction, `hint`/`indexHint`/`commentHint`, the `where()`
  operator, and `fulltextSearch`'s config literal. Operators, directions, and hints
  are now allowlisted; the structural arguments are quoted.
- **`createProxyServer` was an unauthenticated remote SQL endpoint** on `0.0.0.0`
  with `Access-Control-Allow-Origin: *`. `authToken` is now mandatory (the server
  refuses to start without one), compared in constant time, with a 401 before any
  parsing or DB work. Binds `127.0.0.1` by default, denies CORS by default, caps
  bodies at 1 MB, and no longer echoes driver errors to the caller.
- **Live credentials were committed and published to npm.** All connection strings
  now come from environment variables, and a `tsconfig.build.json` excludes test,
  example, and generated-schema files from the published bundle. CI fails the build
  if a credential-shaped string reaches `dist/`.
- **RLS tenant context leaked across requests (High).** The context lived in one
  mutable field read at execute time, so concurrent requests overwrote each other
  across every `await`. It now uses `AsyncLocalStorage` per request, with
  `orm.runWithContext(ctx, fn)` as the safe form. `set_config` and its query are
  serialised. `rls: true` no longer silently does nothing when a custom `exec` is
  supplied — it throws, as it does on a non-Postgres driver.
- **Default password KDF took 136 seconds (High).** `hashPassword()` defaulted to a
  non-standard, unaudited Balloon implementation that measured 136,432 ms — ~417×
  slower than PBKDF2-SHA256 at 600k iterations, and an unauthenticated DoS on any
  signup or login route. PBKDF2 is now the default (310 ms). Balloon remains
  available as `@hash(balloon,...)`.
- **`@hash(pbkdf2)` was silently ignored.** The annotation parser dropped bare
  positional tokens, so the natural spelling fell through to Balloon. Unknown
  algorithms now throw instead of silently defaulting.
- **`@encrypt` ciphertext was relocatable between rows (High).** AES-GCM had no
  AAD, so a valid ciphertext could be copied from one row to another and
  authenticated cleanly. New writes bind the table and, where the primary key is
  known, the row (`aes256gcmv2` format). Pre-AAD data still decrypts.
- **Masks failed open.** `applyMask("1234", "ssn")` returned `"1234"` unmasked.
  Unparseable values are now fully masked.
- **Bound parameters were logged verbatim** with `logs: true`, writing tokens and
  card numbers to stdout. Values are now redacted unless `logParams: true`.
- **Misleading connection errors.** Every Postgres failure reported "driver not
  found. Install it: npm install pg", including the edge-runtime case where
  installing the driver cannot help. The real cause is now surfaced, and a
  TCP-only driver on a socketless runtime now fails at **construction** rather
  than on the first query in production.
- **Plugins were silently skipped.** `_emitGlobal` returned early when no global
  hook was registered for the event type, so `orm.use(plugin)` — the documented
  extension point — did nothing unless the app had *also* called `orm.on(...)`.
  Plugins now dispatch unconditionally.
- **A throwing plugin could break the write it observes.** Plugin errors are now
  isolated and reported (via `onPluginError`, or a console warning), so a broken
  metrics plugin cannot fail your API. `strictPlugins: true` restores
  propagation for cases like compliance audit trails.
- **`poolSize` was accepted but never read** — the adapter always opened one
  dedicated connection, which in serverless is the route to Postgres
  `max_connections` exhaustion. It now creates a real `pg.Pool`. Combining it
  with `rls: true` **throws**: RLS propagates the tenant via a session-scoped
  `set_config`, and a pool can hand a query a connection that never received it.
- **Cold-start connection leak.** `connected` was checked before the connect
  `await` but set after it, so N concurrent first-queries each opened a
  connection and leaked all but one. Connects are now shared via one promise.
- **Reads did not ensure the table, only writes did.** `insert()` auto-created a
  table that `getAll()` then reported as "no such table" — the two halves of the
  same model behaved differently. `get`, `getAll`, `count` and `exists` now
  ensure too.
- **A TCP-only driver on a socketless runtime failed late** — on the first query,
  after the code was deployed. `new DBAdapter()` now throws at construction with
  the three real fixes. New: `orm.edgeReady()` and `orm.runtimeInfo()`.
- **MongoDB silently dropped SQL constructs.** `whereRaw` and `join` were ignored
  and unfiltered rows returned; a filtered many-to-many preload spread `{}` instead
  of applying its filter. These now throw.

### Fixed
- **`delete()` erased `@softDelete` rows.** It issued a hard `DELETE` regardless of
  the annotation, so `restore()` updated a row that no longer existed. `delete()`
  now sets the soft-delete field; `forceDelete()` erases permanently.
- **Model reads disagreed with the query builder.** `get`, `getAll`, `count`, and
  `exists` ignored soft-delete state. All now exclude deleted rows and accept
  `{ withTrashed: true }`.
- **`col = null` matched nothing.** `get({ deletedAt: null })` produced
  `deletedAt = ?` with a null parameter, which is never true in SQL. Null filters
  now emit `IS NULL`.
- **Migrator DDL interpolated identifiers raw.** `CREATE TABLE`, `ALTER TABLE`,
  `CREATE INDEX`, `COMMENT ON COLUMN`, `PRAGMA table_info` and `DESCRIBE` all
  built strings without escaping, so an identifier containing a quote produced
  invalid or unsafe SQL. `ON DELETE` / `ON UPDATE` / `MATCH` are now allowlisted
  to their valid enumerations.
- **`UNION`/`INTERSECT`/`EXCEPT` emitted invalid SQL.** Every operand, including
  the left, was wrapped in parentheses — `(SELECT ...) UNION (SELECT ...)` is a
  syntax error in SQLite and rejected by PostgreSQL and MySQL too. Set
  operations were unusable on every driver.
- **Six divergent identifier quoters existed**, none of which escaped. All are
  consolidated into `src/quoting.ts`; `deleteMany` also lacked the filter
  allowlist that `get`/`update` had.
- **`relatedTo`/`whereRelated` returned wrong rows for one-to-many.** It selected
  the child's primary key and matched it against the parent's, so whenever the two
  id sequences overlapped it silently returned the wrong records.
- **A typo'd `preload()` was silently skipped**, returning rows with the relation
  simply absent — indistinguishable from "no related records". It now throws and
  lists the available relations.
- **`npm test` ran a demo, not the suite,** and exited 0 on crash. `npm run test:pg`
  ran zero tests and exited 0. Both are real now; a requested driver without its
  connection string is a hard failure.
- **`npm run test:types` ignored `tsconfig.json`** (it passed a file path), silently
  type-checking at the ES5 default target.
- **Missing subpath exports.** `slintorm/browser` and `slintorm/proxy` were
  documented but not exported. Both resolve now. The `require` condition pointed at
  a CJS build that does not exist and has been removed.
- Package reduced from 1401 kB to ~470 kB by excluding tests, examples, and the
  generated schema from the published tarball.

### Added
- **Edge runtime support via PostgREST (`driver: "postgrest"`).** Postgres over
  plain HTTPS using `fetch` — no TCP socket, no driver package. This is what makes
  Vercel Edge, Cloudflare Workers and Deno Deploy work:
  ```ts
  import ORMManager from 'slintorm/edge';
  export const orm = new ORMManager({
    driver: 'postgrest',
    postgrestUrl: process.env.SUPABASE_URL!,
    postgrestKey: process.env.SUPABASE_ANON_KEY!,
    schema,
  });
  ```
  Covers `insert`/`insertMany`/`update`/`delete` (returning rows), `get`/`getAll`/
  `exists`/`count`, the full comparison-operator set, `orderBy`/`limit`/`offset`,
  and `preload()` as a PostgREST embedded resource (`select=*,relation(*)`) in a
  single round trip. `whereRaw`, `join()`, `having()` and window functions
  **throw** rather than being silently dropped.
- `PostgrestClient` and `postgrestExec()` exported from `slintorm/edge` and
  `slintorm/postgrest`, with an injectable `fetch` for runtimes without a global one.
- `slintorm/edge` subpath export, plus `edge-light`, `workerd` and `deno` export
  conditions so bundlers select the edge-safe entry automatically.
- Tests that statically assert no Node built-in is imported by any
  edge-reachable module — the property that actually makes the difference on the edge.
- `orm.runWithContext(ctx, fn)` — per-request context isolation
- `orm.hasIsolatedContext()` — reports whether `AsyncLocalStorage` is in use
- `Model.forceDelete()` — permanent removal on `@softDelete` models
- `slintorm/browser` and `slintorm/proxy` subpath exports
- `generateProxyToken()` — helper for the proxy `authToken`
- `LICENSE` (MIT) — was declared in `package.json` with no license file
- `.github/workflows/ci.yml` — runs on pull requests, Node 20/22/24, and a
  4-database matrix. Publishing moved to a tag-gated workflow.
- 130+ regression tests, including coverage for `preload`, relations, soft delete,
  `stream()`, the migrator, the migration runner, audit logging, plugin
  lifecycle, and runtime detection — all previously untested.
- ESLint (`eslint.config.js`) with correctness rules as errors and a warning
  ratchet, wired into CI and the publish gate. `npm run check` runs lint +
  types + suite.
- **Coverage tooling (c8)** — `npm run coverage` / `npm run coverage:check`, with
  a 60% floor enforced in CI. Current: **71.79% line coverage** across `src/`
  (SQLite suite; the Postgres/MySQL/Mongo matrix raises this further). This
  replaces the deleted `VERIFICATION_REPORT.md`, which claimed "100% coverage for
  all 11 components" while no coverage tooling existed at all.

### Changed
- **Balloon hashing removed.** PBKDF2-HMAC-SHA256 at 600,000 iterations is now the
  only algorithm. Balloon measured 136,432 ms per hash — ~417× slower — and was
  a chain of ~59,000 sequential `await` calls, so it blocked the event loop for
  over two minutes per login: an unauthenticated DoS on any signup route. It was
  also not the published algorithm (the mix index used
  `H(block[i]‖t‖i‖d)` instead of `H(prev_count‖count‖m‖d)`, and extraction was a
  sequential fold), making it unaudited and non-interoperable — and at
  `space=65536` its 64 KB working set was cache-resident, so the memory-hardness
  it was chosen for was negligible.
  **Existing `balloon$…` hashes still verify**, so upgrading does not lock anyone
  out. Re-hash on next successful login to migrate.
  `@hash(balloon)` now throws with that migration guidance.
- **`getAll()` accepts a filter.** It previously took no arguments and emitted no
  `WHERE`, so `Model.getAll(req.body)` silently returned the whole table. It now
  takes `(filter?, opts?)`, applies the filter, and rejects unknown keys.
- `SECURITY.md` now documents the real iteration count (600k) and storage format
  (4-part), and adds a vulnerability-reporting contact. Both were wrong.
- **MongoDB: unknown filter keys are now rejected.** The allowlist ran *after* the
  Mongo short-circuit, so `get`/`getAll`/`count`/`update`/`delete`/`deleteMany`
  silently ignored a key built from a request body instead of rejecting it. This
  is the behaviour `getAll()` gained above, now applied on every driver.
- **MongoDB: `preload()` with a filter or limit, `whereRelated()`/`relatedTo()`,
  and `enableAuditLogging()` now throw** instead of failing obscurely or, worse,
  quietly returning more rows than asked for. Each is SQL-only; the previous
  errors were `Unexpected token 'S', "SELECT users"... is not valid JSON` — raw SQL
  fed to a JSON parser. `preload()` was the dangerous one: it returned *more*
  rows than requested and said nothing.
- **MySQL: a `string` column in a key specification is now `VARCHAR`, not `TEXT`.**
  MySQL cannot index a BLOB/TEXT column without an explicit key length, so `@unique`,
  `@index` and a `TEXT` primary key all failed at DDL time. Same for a column
  carrying a literal `DEFAULT`. SQLite and Postgres are unchanged — they index TEXT
  directly.

### Fixed
- **A malformed stored hash crashed the login path.** `verifyPassword()` on a
  corrupt `balloon$` row threw `Invalid array length` (from `new Array(NaN)`)
  instead of returning false — one bad row could take down authentication.
- **`hashPassword()` silently accepted a non-number argument.** The parameter is
  typed `number`, but types erase at runtime, so a JS caller passing
  `{ algo: "balloon" }` fell through to the default rather than erroring.
- Default password hash is now PBKDF2-SHA256 @600k (was Balloon, ~136 s).
- `delete()` on a `@softDelete` model no longer erases the row. **Breaking** for
  anyone relying on the previous erase behaviour — use `forceDelete()` instead.
- `logs: true` no longer prints bound parameter values. **Breaking** for anyone
  parsing those logs; set `logParams: true` to restore.
- MongoDB now rejects unknown filter keys, like every other driver.
- MongoDB `preload()` with a filter or limit, `whereRelated()`/`relatedTo()` and
  `enableAuditLogging()` now throw instead of failing obscurely or — for
  `preload()` — silently returning more rows than requested. All three are SQL-only.
- MySQL maps a `string` column that appears in a key specification (`@unique`,
  `@index`, primary key) or carries a literal `DEFAULT` to `VARCHAR` instead of
  `TEXT`. **Breaking** only for schemas that relied on MySQL rejecting such DDL.
- `logs: true` no longer prints MongoDB document values. **Breaking** for anyone
  scraping those logs; set `logParams: true` to restore.
- **`logs: true` printed every MongoDB document verbatim.** Mongo carries its values
  inside the command document rather than in a parameter array, so redaction applied
  to bound SQL parameters saw an empty array and every insert and update reached
  stdout in full.
- **`insert()` never emitted `afterInsert` on MongoDB**, so plugins and audit logging
  did nothing on that driver while working everywhere else — the same defect already
  fixed for PostgreSQL.
- **The migrator believed every existing column was missing on MySQL.** Listing them
  went through `information_schema.columns`, whose column name could not be read on
  that driver, so it tried to `DROP` and `ADD` every column and each statement failed
  inside a `catch`. Schema evolution silently did nothing; it now reads `SHOW COLUMNS`.
- **MySQL `upsert()` reported updates as inserts** — the `ON DUPLICATE KEY UPDATE`
  branch returned a hardcoded `"inserted"`.
- **MySQL transactions could not run at all** — `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`
  went through the prepared-statement protocol, which does not implement them.
- **MySQL audit writes failed** — an ISO-8601 string was sent to a `DATETIME` column,
  which accepts only `YYYY-MM-DD HH:MM:SS`.
- **MySQL `forNoKeyUpdate()` emitted `FOR NO KEY UPDATE`**, which MySQL has no
  equivalent for. It now throws at build time, as row locking already did on SQLite.
- **The test suite could not exit on Postgres.** It opened 27 `ORMManager`s and one
  `DBAdapter` but closed 3; each unclosed client held a socket, so the event loop
  never drained and CI sat until the 6-hour job timeout on a run whose log ended on
  "233/233 passed". All are closed in teardown now, and the runner names any handle
  still active afterwards. Every test job also has `timeout-minutes` so a future hang
  fails fast with a readable log.
- **The CI matrix did not test what it claimed to.** The MySQL job called
  `npm run test:mysql`, which did not exist, so npm exited non-zero in ~39 s and the
  suite had never once run against MySQL.

---

## [1.9.6] — 2026-07-16
- RLS support via `set_config` context propagation
- `@hash`/`@encrypt`/`@secret` security annotations (Web Crypto)
- 27 driver-specific SQL compatibility fixes across queryBuilder, model, migrator
  (previously undocumented)

## [1.9.0] — 2026-07-13

### Added
- `@encrypt` fields now expose raw ciphertext with a `.decrypt(): Promise<string>` method instead of auto-decrypting
- `@encrypt:(decrypt=auto)` variant for transparent auto-decryption (returns plain `string`)
- `EncryptedField` interface + `attachEncryptDecrypt` wrapper in `src/security.ts`
- Generator emits `& { decrypt(): Promise<string> }` on `@encrypt` fields in generated schema types
- `SECURITY.md` — new dedicated security annotations reference page
- `CHANGELOG.md` — this file

### Changed
- `applySecurityOnRead` checks annotation value: bare `@encrypt` → wraps with `.decrypt()`; `@encrypt:(decrypt=auto)` → transparent decrypt
- `llms.txt`, `README.md`, `ROADMAP.md` — updated with security annotation docs and version references
- `src/example.ts` — added `@encrypt` / `@encrypt:auto` test section (section 44)

---

## [1.8.0] — 2026-07-13

### Added
- Generator emits `& { verify(plaintext: string): Promise<boolean> }` on `@hash` fields in generated schema types
- Type-safe `.verify()` on `@hash` fields when using generated schema (`ModelMap` / `orm.DB.*`)
- `src/security.ts` refactored to zero `any` — uses `FieldMeta` interface and `unknown`

### Changed
- `QueryBuilder._wrapEntity` supports `Promise<T>` async wrappers; `get()` uses `Promise.all`
- Model's `query()` feeds `applySecurityOnRead` into QB wrapEntity — QB results get `.verify()`
- `example.ts` security section uses `orm.DB.User` for full type safety (`tsc --noEmit` passes)

---

## [1.7.0] — 2026-07-12

### Added
- Security annotations: `@hash` (PBKDF2), `@encrypt` (AES-256-GCM), `@secret` (`@hash` + `@omitjson`)
- `applySecurityOnWrite` — hashes/encrypts fields before DB write
- `applySecurityOnRead` — decrypts `@encrypt` fields and attaches `.verify()` on `@hash` fields
- Validation annotations: `@email`, `@url`, `@uuid`, `@phone`, `@min:N`, `@max:N`, `@minLength:N`, `@maxLength:N`, `@pattern:regex`
- `ValidationError` thrown on insert/update when validation fails

---

## [1.6.1] — 2026-07-12

### Fixed
- llms.txt section/test counts: 34→42 sections, 57→105 tests
- `morphTo` missing from `ModelAPI` (entity-only, not on model)

### Docs
- Added validation annotations docs to llms.txt
- Added @random variant docs

---

## [1.6.0] — 2026-07-12

### Added
- `@random:alnum(N, upper/lower)` — case-controlled alphanumeric
- `@random:lower(N)`, `@random:upper(N)` — case-specific letters
- `@random:hex(N, upper)` — hex with case option
- `@random:custom(CHARS, N)` — custom charset support
- Prefix/suffix via `pfx=` / `sfx=` on all random variants
- Extracted `src/annotations.ts` for annotation parsing
- CI: GitHub Actions auto-publish on push to main
- CI: Node 22 for built-in `node:sqlite` driver

### Fixed
- Boolean serialization to 0/1 for SQLite in insert/update
- Boolean params serialization in query builder WHERE/SET clauses
- Inline annotation parsing for stacked comments

---

## [1.5.2] — 2026-07-12

### Added
- CLI auto-loads `.env*` files so `process.env` is populated before config import

---

## [1.5.1] — 2026-07-11

### Fixed
- Inline annotation parsing for `//` comments on same line as field
- Stacked comment combining with semicolons
- Schema generator warning messages for unsupported field names

---

## [1.5.0] — 2026-07-09

### Added
- `@mask` annotation with presets: ssn, creditcard, email, phone, showFirst, showLast, showBoth, char, pattern
- `.withoutMasking()` bypass on query builder
- `@omitdb` — field excluded from INSERT/UPDATE/reads (not stored)
- `@omitjson` — stored in DB, stripped from reads unless `.select()`ed
- `@omitmigrate` — no column created by migrator
- Consolidated all interfaces into `src/interfaces.ts`

---

## [1.3.0] — 2026-07-04

### Added
- `@random` annotation for auto-generated field values on insert
- `EntityWithUpdate` methods (`.update()`, `.delete()`, `.refresh()`) on `query()` results
- Quote stripping in annotation value parsing (`@default:'active'`)

---

## [1.2.0] — 2026-07-01

### Added
- Edge-compatible HTTP drivers (Neon, Turso, PlanetScale)
- Proxy client/server for running queries from edge runtimes
- Custom exec function support
- Plugin system with lifecycle events
- Context propagation
- Database resolver (multi-DB / useDb)
- Prepared statement mode
- Dry-run mode, streaming, multi-column IN, enhanced counts
- AfterFind hook
- Polymorphic relationships (morphTo / morphMany)
- CTE, UNION/INTERSECT/EXCEPT, advanced joins, full-text search
- Row locking (FOR UPDATE / FOR SHARE / SKIP LOCKED)
- Group conditions (andWhereGroup / orWhereGroup)
- Named SQL arguments
- Query hints and optimizer/index hints
- Seeds system
- Migration history tracking with snapshots

### Docs
- Added `llms.txt` for AI coding assistant reference
- Expanded `SERVERLESS.md` with deployment guides

---

## [1.1.0] — 2026-06-28

### Added
- Initial public release
- SQLite / PostgreSQL / MySQL / MongoDB support
- ModelAPI with full CRUD, aggregates, bulk operations
- QueryBuilder with joins, preloads, subqueries
- Auto-migrations with schema generation from TypeScript interfaces
- Relation directives (@relation, @relationship)
- Soft deletes, timestamps, JSON fields
