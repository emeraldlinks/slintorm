# SlintORM — Serverless & Edge Runtime Guide

SlintORM v1.1.4+ runs in any JavaScript runtime: traditional Node.js servers,
Vercel serverless functions, Vercel Edge Runtime, Cloudflare Workers, Deno
Deploy, AWS Lambda, and Bun.

---

## Quick-start (edge / serverless)

### 1. Generate your schema at build time

SlintORM's schema generator reads TypeScript source files — it's a build-time
CLI tool, not a runtime dependency. Run it once before deploying:

```bash
npx slintorm generate
```

This writes `src/schema/generated.json`. Commit this file to your repo so it's
available in your deployment bundle.

### 2. Import the schema and initialise the ORM

```typescript
// lib/db.ts  (runs in edge / serverless)
import ORMManager from 'slintorm';
import schema from '../src/schema/generated.json' assert { type: 'json' };

export const orm = new ORMManager({
  driver:      'postgres',             // 'postgres' | 'mysql' | 'mongodb'
  databaseUrl: process.env.DATABASE_URL!,
  schema,                              // ← pre-built; no fs access needed
});

export const db = {
  User: await orm.defineModel('user', 'User'),
  Post: await orm.defineModel('post', 'Post'),
};
```

> **Never call `orm.migrate()`** in an edge function. Migrations require
> `node:fs` and `node:path` which are unavailable in V8 isolate runtimes.
> Run migrations as a separate build/deploy step on a Node.js environment.

### 3. Use it in your handler

```typescript
// app/api/users/route.ts  (Next.js Edge Route Handler)
import { db } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  const users = await db.User.query()
    .where('status', '=', 'active')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return Response.json(users);
}
```

---

## Supported drivers by runtime

| Driver        | Node.js | Vercel Serverless | Vercel Edge | CF Workers | Deno |
|---------------|:-------:|:-----------------:|:-----------:|:----------:|:----:|
| `postgres`    | ✅      | ✅                | ✅          | ✅*        | ✅   |
| `mysql2`      | ✅      | ✅                | ✅          | ✅*        | ✅   |
| `mongodb`     | ✅      | ✅                | ⚠️ use HTTP | ⚠️ use HTTP| ✅   |
| `sqlite`      | ✅      | ✅                | ❌          | ❌         | ✅   |

\* Cloudflare Workers require a TCP socket–compatible client such as
  `@cloudflare/pg` or a connection pooler (Hyperdrive). Standard `pg` doesn't
  open TCP sockets in Workers — use the Cloudflare-patched version.

---

## Migrations in CI/CD

Run migrations from a Node.js script during your deploy pipeline, not inside
your edge/serverless handler:

```typescript
// scripts/migrate.ts  (Node.js only — run before deploy)
import ORMManager from 'slintorm';

const orm = new ORMManager({
  driver:      'postgres',
  databaseUrl: process.env.DATABASE_URL!,
  dir:         'src',
});

await orm.migrate();   // reads TypeScript files, generates schema, runs DDL
process.exit(0);
```

In your `package.json`:

```json
{
  "scripts": {
    "migrate": "tsx scripts/migrate.ts",
    "build":   "npm run migrate && next build"
  }
}
```

---

## What changed to make this work

| Problem | Fix |
|---|---|
| `spawnSync` / `child_process` — crashed V8 isolates | Removed entirely. Drivers must be installed as explicit dependencies. |
| `import path from 'node:path'` at module top level | Moved inside `migrate()` behind a dynamic `import()` — never runs in edge. |
| `import { pathToFileURL } from 'node:url'` at module top | Same — moved inside `loadSchema()` which is never called when `schema` is passed. |
| `loadSchema()` crashing with cryptic error in edge | Now catches `ERR_MODULE_NOT_FOUND` and throws a clear "pass schema explicitly" message. |
| Auto-driver install (`spawnSync npm install`) | Removed. Missing drivers now throw a clear message with the exact `npm install` command. |
| `bugs.url` typo in package.json | Fixed (`slintormssues` → `slintorm/issues`). |
| Driver packages in `dependencies` (always installed) | Moved to `peerDependencies` (optional) — only install what you use. |
| `require()` / CJS consumers getting ESM error | Added `exports["."].require` pointing to a CJS build. |
