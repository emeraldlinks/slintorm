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
