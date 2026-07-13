# Changelog

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
