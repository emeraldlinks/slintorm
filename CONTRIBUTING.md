# Contributing to SlintORM

## Prerequisites

```bash
npm install
```

Node 20, 22 or 24. CI runs all three.

## Checks

```bash
npm run check          # lint + typecheck + the SQLite suite
```

Individually:

| Command | What it does |
|---|---|
| `npm run build` | `tsc` + `tsc-alias` → `dist/` (via `tsconfig.build.json`) |
| `npm run lint` | ESLint. Errors block; warnings are ratcheted at 249 and must not grow |
| `npm run lint:fix` | Autofix what ESLint can |
| `npm run test:types` | `tsc --noEmit` over the whole project |
| `npm test` | The SQLite in-memory suite — always runnable, no credentials |
| `npm run coverage` | c8 report → `coverage/` |
| `npm run coverage:check` | Same, with a 60% line-coverage floor |

## Running a specific database

The suite is driver-parameterised. Setting `*_ONLY=1` **requests** that driver —
and if its connection string is missing the run fails loudly rather than exiting
green having tested nothing.

```bash
npm run test:sqlite                                  # :memory:, default
npm run test:pg                                      # PG_ONLY=1
npm run test:mysql                                   # MYSQL_ONLY=1
npm run test:mongo                                   # MONGO_ONLY=1

PG_ONLY=1    PG_URL=postgresql://postgres:postgres@localhost:5432/slintorm_test npm test
MYSQL_ONLY=1 MYSQL_URL=mysql://root:mysql@127.0.0.1:3306/slintorm_test      npm test
MONGO_ONLY=1 MONGO_URL=mongodb://localhost:27017                            npm test
```

Or all configured drivers at once:

```bash
PG_URL=... MYSQL_URL=... MONGO_URL=... npm test
```

Output reports each driver explicitly, including `SKIPPED <driver>` lines, so a
partial run never looks complete.

**Every database in the matrix is exercised in CI**, not just SQLite. That was
not true until recently: the MySQL job called `npm run test:mysql`, which did not
exist, so `npm` exited non-zero in ~39 s and the suite had never once run against
MySQL. If you add a driver script, wire it into `.github/workflows/ci.yml` in the
same change, and check the job actually runs assertions rather than failing in
setup.

Every test job sets `timeout-minutes`. A driver hang used to burn the default
6-hour job limit on a run whose log ended on `233/233 passed` with nothing after
it — the results print, then the process cannot exit, so the evidence needed to
diagnose it never reached the log. The runner now closes every connection it
opened and names any handle still active afterwards; the timeout is the backstop
that keeps a future hang cheap.

The **edge suite** (`driver: "postgrest"`) needs no credentials — it runs against
a mock PostgREST server and is invoked automatically by `npm test`:

```bash
node --import tsx/esm src/postgrest.test.ts   # or standalone
```

## Writing tests

The suite is a small hand-rolled runner (`src/slintorm.test.ts`) with
`describe`/`it`/`expect`. Matchers available on `expect(x)`:

```
toBe  notToBeNull  toBeNull  toBeDefined
toBeGreaterThan  toBeGreaterThanOrEqual  toBeLessThanOrEqual
toContain         // arrays AND strings
toHaveProperty
toThrow           not.toThrow  not.toBeNull
```

Two things that have bitten this codebase before:

- **`defineModel()`'s third argument is a hooks object, not a schema.** Models are
  declared in the `schema` passed to `ORMManager`. Passing a schema to
  `defineModel` is silently ignored.
- **Migration tests must point `dir` at an empty directory.** The runner diffs
  against migration records on disk as well as the database, so pointing it at
  the repo's own `src` makes every change look already-applied.

## Adding a driver

1. Add the branch to `DBAdapter.connect()` and `DBAdapter.exec()`.
2. Add a `Dialects` entry in `src/queryBuilder.ts` (it must quote identifiers).
3. Give it a query path — either a `buildSql()` branch like `postgrest` or a
   filter builder like `buildMongoFilter()`.
4. **Unsupported constructs must throw, never be silently dropped.** A filter that
   quietly does nothing is indistinguishable from one that works.
5. Add it to the test matrix in `.github/workflows/ci.yml`.

## Adding an edge-safe module

Edge modules must import **no** Node built-ins at module scope. Static imports of
`node:*` break V8-isolate bundles. `src/postgrest.test.ts` asserts this across the
whole edge-reachable module graph — keep it passing.

## Releasing

Publishing is tag-gated and automatic. To cut a release:

```bash
# 1. Bump the version and update CHANGELOG.md
npm version 1.10.0          # edits package.json + creates a git commit and tag

# 2. Push the tag — this triggers .github/workflows/publish.yml
git push origin main --follow-tags
```

`publish.yml` re-verifies everything before it will publish, and refuses if:

- `lint`, `test:types`, or the SQLite suite fails
- the tag (`v1.10.0`) does not match `package.json`'s version
- `dist/` contains a credential-shaped connection string

It publishes with `--provenance`, so npm records which commit and workflow built
the tarball.

**Why tags:** this project shipped 87 npm versions across 111 commits with zero
git tags, which made version provenance unreconstructable and any regression
unbisectable. Tags fix that going forward; the pre-existing history is not
recoverable.

### Releasing after a breaking change

`CHANGELOG.md` marks breaking changes explicitly. The unreleased version currently
contains two:

- `delete()` on a `@softDelete` model no longer erases the row (use `forceDelete()`)
- `logs: true` no longer prints bound parameter values (use `logParams: true`)

---

## Style

- Match the surrounding code. There are currently zero `TODO`/`FIXME` markers; if
  you add one, remove it when the work lands.
- Prefer editing existing comments over adding new ones unless behaviour changed.
- `npm run lint` warnings are currently numerous by design (the codebase has a
  large pre-existing `meta?.foo!` and best-effort-`catch` surface). Do not raise
  the count; lowering it is welcome.