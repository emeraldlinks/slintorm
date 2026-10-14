// browser.ts — Edge-safe entrypoint for Vercel Edge, Cloudflare Workers,
// Deno Deploy, and any V8-isolate runtime.
//
// What's safe here:
//   - ORMManager / createORM (class + functional API)
//   - All query builder methods
//   - All model CRUD + validation
//   - Postgres / MySQL / MongoDB drivers (via dynamic import)
//
// What is NOT available in this entrypoint:
//   - migrate() — requires node:fs / node:path / ts-morph
//   - SQLite — requires native binaries; not available in edge runtimes
//   - Schema auto-generation — Node-only; run at build time instead
//
// Usage in edge environments:
//   import ORMManager from 'slintorm/browser';   // or 'slintorm' in package.json exports
//   import schema from './src/schema/generated.json' assert { type: 'json' };
//   const orm = new ORMManager({ driver: 'postgres', databaseUrl: env.DATABASE_URL, schema });

export {
  default,
  createORM,
  type ORMManagerConfig,
  type ModelHooks,
  type AnyModelMap,
  type DBStore,
  type ReadonlyDBStore,
} from "./index.js";

export { type ModelAPI } from "./model.js";
export { ORMError } from "./db-error.js";
export { ValidationError } from "./extensions.js";
export {
  hashPassword,
  verifyPassword,
  encryptField,
  decryptField,
  encryptFieldFull,
  decryptFieldFull,
  deriveEncryptionKey,
  clearKeyCache,
  type HashField,
} from "./security.js";

// Edge-compatible drivers — fetch-based, no TCP required
export { http } from "./http-driver.js";
export { neonExec, tursoExec, planetscaleExec } from "./http-driver.js";
export { proxyExec } from "./proxy.js";

// PostgREST — the recommended edge path. Postgres over plain HTTPS via fetch,
// so it needs no TCP socket and no driver package. Supabase exposes PostgREST
// at https://<project-ref>.supabase.co/rest/v1, but any instance works.
//
//   import ORMManager, { PostgrestClient } from "slintorm/edge";
//   const orm = new ORMManager({
//     driver: "postgrest",
//     postgrestUrl: process.env.SUPABASE_URL!,
//     postgrestKey: process.env.SUPABASE_ANON_KEY!,
//   });
export {
  PostgrestClient,
  postgrestExec,
  PostgrestError,
  type PostgrestConfig,
  type PostgrestCommand,
  type PostgrestFilter,
} from "./postgrest.js";
