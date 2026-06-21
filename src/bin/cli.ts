#!/usr/bin/env node
/**
 * slintorm CLI
 *
 * Usage:
 *   npx slintorm migrate       — apply pending migrations
 *   npx slintorm rollback      — roll back the last batch
 *   npx slintorm generate      — re-generate schema/generated.ts + .json
 *   npx slintorm status        — show applied / pending migrations
 *   npx slintorm fresh         — drop all tables, re-run all migrations
 *   npx slintorm --help        — show help
 *
 * Drivers: sqlite | postgres | mysql | mongodb
 * MongoDB is schemaless — "migrations" only create/track indexes
 * (from @index / @unique field meta), there is no column DDL.
 */

import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { restoreGeneratedSchemaForBatch, runMigrations, snapshotCurrentGeneratedSchema } from "../migration-history.js";
import { Migrator } from "../migrator.js";

// ─── Colours ────────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

// ─── Logging helpers ──────────────────────────────────────────────────────────
function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const ok    = (s: string) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.green}✔${c.reset}  ${s}`);
const info  = (s: string) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.cyan}ℹ${c.reset}  ${s}`);
const warn  = (s: string) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.yellow}⚠${c.reset}  ${s}`);
const fail  = (s: string) => console.error(`${c.gray}[${ts()}]${c.reset} ${c.red}✘${c.reset}  ${s}`);
const head  = (s: string) => console.log(`\n${c.bold}${c.white}${s}${c.reset}`);
const dim   = (s: string) => console.log(`${c.gray}${s}${c.reset}`);
const log   = (s: string) => console.log(`${c.gray}[${ts()}]${c.reset} ${c.dim}…${c.reset}  ${s}`);

// ─── Progress bar ─────────────────────────────────────────────────────────────
function progressBar(current: number, total: number, label: string) {
  const width = 28;
  const pct = total === 0 ? 1 : current / total;
  const filled = Math.round(width * pct);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const pctLabel = `${Math.round(pct * 100)}%`.padStart(4);
  process.stdout.write(
    `\r${c.gray}[${ts()}]${c.reset} ${c.cyan}${bar}${c.reset} ${pctLabel}  ${label}${" ".repeat(20)}`
  );
}

function progressBarDone() {
  process.stdout.write("\n");
}

// ─── Migrations table SQL ────────────────────────────────────────────────────
// Mongo doesn't use SQL DDL — its migrations collection is created inside
// the mongo exec function itself (see buildExec), so it has no entry here.

const MIGRATIONS_TABLE = "_slint_migrations";

const CREATE_MIGRATIONS_TABLE: Record<string, string> = {
  sqlite:   `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
               id        INTEGER PRIMARY KEY AUTOINCREMENT,
               name      TEXT    NOT NULL UNIQUE,
               batch     INTEGER NOT NULL,
               run_at    TEXT    NOT NULL DEFAULT (datetime('now'))
             )`,
  postgres: `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
               id        SERIAL  PRIMARY KEY,
               name      TEXT    NOT NULL UNIQUE,
               batch     INTEGER NOT NULL,
               run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
             )`,
  mysql:    `CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
               id        INT AUTO_INCREMENT PRIMARY KEY,
               name      VARCHAR(255) NOT NULL UNIQUE,
               batch     INT NOT NULL,
               run_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             )`,
};

// ─── Config loader ───────────────────────────────────────────────────────────

interface ORMConfig {
  driver?: "sqlite" | "postgres" | "mysql" | "mongodb";
  databaseUrl?: string;
  dir?: string;
  logs?: boolean;
  [key: string]: any;
}

async function loadConfig(): Promise<ORMConfig> {
  const cwd = process.cwd();

  const primaryCandidates = [
    path.join(cwd, "slintorm.config.js"),
    path.join(cwd, "slintorm.config.mjs"),
    path.join(cwd, "slintorm.config.cjs"),
    path.join(cwd, "slintorm.config.ts"),
    path.join(cwd, "slintorm.config.json"),
  ];

  const legacyCandidates = [
    path.join(cwd, "orm.config.js"),
    path.join(cwd, "orm.config.mjs"),
    path.join(cwd, "orm.config.cjs"),
    path.join(cwd, "orm.config.ts"),
    path.join(cwd, "orm.config.json"),
  ];

  for (const cfgPath of primaryCandidates) {
    if (!fs.existsSync(cfgPath)) continue;
    info(`Loading config: ${path.basename(cfgPath)}`);

    if (cfgPath.endsWith(".json")) {
      return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    }

    try {
      const mod = await import(pathToFileURL(cfgPath).href);
      const cfg = mod.default ?? mod;
      if (cfg && typeof cfg === "object") return cfg;
    } catch (e: any) {
      fail(`Failed to load config from ${cfgPath}: ${e.message}`);
      process.exit(1);
    }
  }

  for (const cfgPath of legacyCandidates) {
    if (!fs.existsSync(cfgPath)) continue;
    warn(
      `Found ${path.basename(cfgPath)} — this name is deprecated. ` +
      `Please rename it to slintorm.config.${cfgPath.split(".").pop()}.`
    );

    if (cfgPath.endsWith(".json")) {
      return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    }

    try {
      const mod = await import(pathToFileURL(cfgPath).href);
      const cfg = mod.default ?? mod;
      if (cfg && typeof cfg === "object") return cfg;
    } catch (e: any) {
      fail(`Failed to load config from ${cfgPath}: ${e.message}`);
      process.exit(1);
    }
  }

  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.slintorm) {
        info("Loading config from package.json \"slintorm\" key");
        return pkg.slintorm;
      }
    } catch {
      // ignore malformed package.json — fall through to the failure path below
    }
  }

  fail("No config file found. Create a slintorm.config.js in your project root.");
  console.log(`\nExample slintorm.config.js:\n`);
  console.log(`  export default {`);
  console.log(`    driver: "sqlite",`);
  console.log(`    databaseUrl: "./myapp.db",`);
  console.log(`    dir: "src",`);
  console.log(`  };\n`);
  process.exit(1);
}

// ─── Adapter bootstrap ────────────────────────────────────────────────────

interface ExecResult { rows: any[]; changes?: number; lastID?: number; insertId?: number }
type ExecFn = (sql: string, params?: any[]) => Promise<ExecResult>;

function stableValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        acc[key] = stableValue(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function hashSchemaModel(modelDef: any): string {
  const normalized = stableValue({
    table: modelDef?.table ?? null,
    fields: modelDef?.fields ?? {},
    relations: modelDef?.relations ?? [],
  });

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function migrationUnitName(modelName: string, schemaHash: string): string {
  return `${modelName}__${schemaHash.slice(0, 12)}`;
}

function migrationModelName(unitName: string): string {
  const sep = unitName.lastIndexOf("__");
  return sep === -1 ? unitName : unitName.slice(0, sep);
}

function extractDbNameFromMongoUrl(url: string): string {
  let dbName = "test";
  try {
    const swapped = url.replace(/^mongodb(\+srv)?:\/\//, "http://");
    const parsed = new URL(swapped);
    const fromPath = parsed.pathname.replace(/^\//, "");
    if (fromPath) dbName = fromPath;
  } catch {
    // malformed url — fall back to the default db name
  }
  return dbName;
}

async function buildExec(cfg: ORMConfig): Promise<ExecFn> {
  const driver = cfg.driver ?? "sqlite";
  const url    = cfg.databaseUrl ?? "./database.db";

  info(`Connecting to ${driver} database (${url})…`);

  if (driver === "sqlite") {
    try {
      const Database = (await import("better-sqlite3" as any)).default;
      const db = new Database(url);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      ok("Connected (better-sqlite3)");

      return async (sql: string, params: any[] = []) => {
        if (/^\s*(select|pragma)/i.test(sql)) {
          const rows = db.prepare(sql).all(...params);
          return { rows };
        }
        const r = db.prepare(sql).run(...params);
        return { rows: [], changes: r.changes, lastID: r.lastInsertRowid as number };
      };
    } catch {
      const sqlite3 = (await import("sqlite3" as any)).default;
      const { open }  = await import("sqlite" as any);
      const db = await open({ filename: url, driver: sqlite3.Database });
      ok("Connected (sqlite3)");

      return async (sql: string, params: any[] = []) => {
        if (/^\s*(select|pragma)/i.test(sql)) {
          const rows = await db.all(sql, params);
          return { rows };
        }
        const r = await db.run(sql, params);
        return { rows: [], changes: r.changes, lastID: r.lastID };
      };
    }
  }

  if (driver === "postgres") {
    const { default: pg } = await import("pg" as any);
    const pool = new pg.Pool({ connectionString: url });
    ok("Connected (postgres)");
    return async (sql: string, params: any[] = []) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows, changes: r.rowCount ?? 0 };
    };
  }

  if (driver === "mysql") {
    const mysql = await import("mysql2/promise" as any);
    const conn  = await mysql.createConnection(url);
    ok("Connected (mysql)");
    return async (sql: string, params: any[] = []) => {
      const [rows] = await conn.execute(sql, params);
      return {
        rows: Array.isArray(rows) ? rows : [],
        changes: (rows as any).affectedRows ?? 0,
        insertId: (rows as any).insertId,
      };
    };
  }

  if (driver === "mongodb") {
    const { MongoClient } = await import("mongodb" as any);
    const client = await MongoClient.connect(url);
    const dbName = extractDbNameFromMongoUrl(url);
    const db = client.db(dbName);
    ok(`Connected (mongodb, db: ${dbName})`);

    return async (sql: string, params: any[] = []) => {
      const trimmed = sql.trim();

      // ── JSON-action protocol — used by model.js / Migrator for real CRUD
      //    and index creation against arbitrary collections.
      if (trimmed.startsWith("{")) {
        let action: any;
        try {
          action = JSON.parse(trimmed);
        } catch {
          return { rows: [] };
        }
        const coll = db.collection(action.collection);

        switch (action.action) {
          case "find": {
            const rows = await coll.find(action.filter ?? {}).toArray();
            return { rows };
          }
          case "insert": {
            const docs = Array.isArray(action.data) ? action.data : [action.data];
            const r = await coll.insertMany(docs);
            return { rows: [], changes: r.insertedCount };
          }
          case "update": {
            const r = await coll.updateMany(action.filter ?? {}, { $set: action.data });
            return { rows: [], changes: r.modifiedCount };
          }
          case "delete": {
            const r = await coll.deleteMany(action.filter ?? {});
            return { rows: [], changes: r.deletedCount };
          }
          case "createIndex": {
            try {
              await coll.createIndex({ [action.field]: 1 }, { unique: !!action.unique });
            } catch {
              // index may already exist — non-fatal
            }
            return { rows: [] };
          }
          default:
            return { rows: [] };
        }
      }

      // ── CLI bookkeeping SQL — translated to Mongo equivalents so the
      //    rest of the CLI (status/migrate/rollback/fresh) can stay
      //    driver-agnostic and not special-case mongo everywhere.

      if (/^\s*CREATE TABLE/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        await coll.createIndex({ name: 1 }, { unique: true });
        return { rows: [] };
      }

      if (/^\s*SELECT \* FROM/i.test(trimmed)) {
        const m = trimmed.match(/FROM\s+"?([\w_]+)"?/i);
        const coll = db.collection(m ? m[1] : MIGRATIONS_TABLE);
        const rows = await coll.find({}).sort({ _id: 1 }).toArray();
        return { rows };
      }

      if (/^\s*SELECT MAX\(batch\)/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        const top = await coll.find({}).sort({ batch: -1 }).limit(1).toArray();
        return { rows: [{ b: top[0]?.batch ?? 0 }] };
      }

      if (/^\s*INSERT INTO\s+"?_slint_migrations"?/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        await coll.insertOne({ name: params[0], batch: params[1], run_at: new Date().toISOString() });
        return { rows: [] };
      }

      if (/^\s*SELECT name FROM\s+"?_slint_migrations"?\s+WHERE batch/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        const rows = await coll.find({ batch: params[0] }).sort({ _id: -1 }).toArray();
        return { rows };
      }

      if (/^\s*DELETE FROM\s+"?_slint_migrations"?\s+WHERE name/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        const r = await coll.deleteOne({ name: params[0] });
        return { rows: [], changes: r.deletedCount };
      }

      if (/^\s*DELETE FROM\s+"?_slint_migrations"?\s*$/i.test(trimmed)) {
        const coll = db.collection(MIGRATIONS_TABLE);
        const r = await coll.deleteMany({});
        return { rows: [], changes: r.deletedCount };
      }

      if (/^\s*DROP TABLE IF EXISTS/i.test(trimmed)) {
        const m = trimmed.match(/EXISTS\s+"?([\w_]+)"?/i);
        if (m) {
          try {
            await db.collection(m[1]).drop();
          } catch {
            // collection may not exist — non-fatal
          }
        }
        return { rows: [] };
      }

      return { rows: [] };
    };
  }

  fail(`Unsupported driver: ${driver}`);
  process.exit(1);
}

// ─── Migrations table helpers ────────────────────────────────────────────────

async function ensureMigrationsTable(exec: ExecFn, driver: string) {
  if (driver === "mongodb") {
    // Routed by the mongo exec's "CREATE TABLE" branch above, which
    // creates a unique index on `name` in the migrations collection.
    await exec(`CREATE TABLE "${MIGRATIONS_TABLE}"`);
    return;
  }
  const sql = CREATE_MIGRATIONS_TABLE[driver] ?? CREATE_MIGRATIONS_TABLE.sqlite;
  await exec(sql);
}

async function getApplied(exec: ExecFn): Promise<{ id: number; name: string; batch: number; run_at: string }[]> {
  const r = await exec(`SELECT * FROM "${MIGRATIONS_TABLE}" ORDER BY id ASC`);
  return r.rows;
}

async function getLastBatch(exec: ExecFn): Promise<number> {
  const r = await exec(`SELECT MAX(batch) as b FROM "${MIGRATIONS_TABLE}"`);
  return parseInt(r.rows[0]?.b ?? "0", 10);
}

// ─── Migration record files (schema/migrations/*.json) ──────────────────────

function migrationsDir(dir: string): string {
  const p = path.join(process.cwd(), dir, "schema", "migrations");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function writeMigrationRecord(dir: string, unit: MigrationUnit, batch: number, modelDef: any) {
  const recPath = path.join(migrationsDir(dir), `${unit.name}.json`);
  const record = {
    name: unit.name,
    modelName: unit.modelName,
    tableName: unit.tableName,
    schemaHash: unit.schemaHash,
    batch,
    appliedAt: new Date().toISOString(),
    fields: Object.keys(modelDef?.fields ?? {}),
  };
  fs.writeFileSync(recPath, JSON.stringify(record, null, 2), "utf8");
}

function readMigrationRecord(dir: string, name: string): any | null {
  const recPath = path.join(migrationsDir(dir), `${name}.json`);
  if (!fs.existsSync(recPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(recPath, "utf8"));
  } catch {
    return null;
  }
}

function loadMigrationRecords(dir: string): any[] {
  const dirPath = migrationsDir(dir);
  return fs.readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function fieldNames(modelDef: any): string[] {
  return Object.keys(modelDef?.fields ?? {}).sort();
}

function recordMatchesUnit(record: any, unit: MigrationUnit, modelFields: string[]): boolean {
  if (!record || record.modelName !== unit.modelName) return false;
  if (record.name === unit.name) return true;
  if (record.schemaHash && record.schemaHash === unit.schemaHash) return true;

  const recordFields = Array.isArray(record.fields) ? [...record.fields].sort() : [];
  if (!recordFields.length) return false;

  return recordFields.join("|") === modelFields.join("|");
}

function removeMigrationRecord(dir: string, name: string) {
  const recPath = path.join(migrationsDir(dir), `${name}.json`);
  if (fs.existsSync(recPath)) fs.unlinkSync(recPath);
}

// ─── Pivot table synthesis (shared logic — mirrors Migrator.migrateSchema) ──
// Auto-creates pivot/junction tables for many-to-many relations when a
// `through` name is provided but no explicit model exists for it.
// Mutates and returns the same schema object so callers can use it in place.
// Keeps `npx slintorm migrate` and `orm.migrate()` producing the identical
// table/collection set, including m2m junctions like team_members.

function withSyntheticPivots(schema: Record<string, any>): Record<string, any> {
  for (const [name, model] of Object.entries(schema)) {
    for (const r of model.relations || []) {
      if (r.kind !== "manytomany" || !r.through) continue;
      const pivot = String(r.through);
      if (schema[pivot]) continue;

      const leftFk  = r.foreignKey || r.meta?.foreignKey || `${name.toLowerCase()}Id`;
      const rightFk = r.relatedKey || r.meta?.relatedKey || `${String(r.targetModel).toLowerCase()}Id`;

      schema[pivot] = {
        fields: {
          id:        { type: "number", meta: { primaryKey: true, auto: true } },
          [leftFk]:  { type: "number", meta: { index: true } },
          [rightFk]: { type: "number", meta: { index: true } },
        },
        relations: [],
        table: pivot,
      };
    }
  }
  return schema;
}

// ─── Schema-based migration plan ─────────────────────────────────────────────

interface MigrationUnit {
  name: string;        // e.g. "20240101000000_User"
  modelName: string;
  tableName: string;
  schemaHash: string;
}

async function loadGeneratedSchema(dir: string): Promise<Record<string, any> | null> {
  const base = path.join(process.cwd(), dir, "schema");
  const jsonPath = path.join(base, "generated.json");
  const jsPath   = path.join(base, "generated.js");
  const tsPath   = path.join(base, "generated.ts");

  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  for (const p of [jsPath, tsPath]) {
    if (!fs.existsSync(p)) continue;
    try {
      const mod = await import(pathToFileURL(p).href);
      return mod.schema ?? mod.default ?? null;
    } catch {
      // try the next candidate path
    }
  }

  return null;
}

async function resolveSchemaGenerator(): Promise<(dir: string) => Promise<Record<string, any>>> {
  try {
    const mod = await import(pathToFileURL(
      path.join(process.cwd(), "node_modules", "slintorm", "dist", "src", "generator.js")
    ).href);
    return mod.default;
  } catch {
    const mod = await import(pathToFileURL(
      path.join(process.cwd(), "src", "generator.js")
    ).href);
    return mod.default;
  }
}

async function loadLiveSchema(dir: string): Promise<Record<string, any> | null> {
  const srcDir = path.join(process.cwd(), dir);
  if (!fs.existsSync(srcDir)) return null;

  try {
    const generateSchema = await resolveSchemaGenerator();
    return await generateSchema(srcDir);
  } catch {
    return await loadGeneratedSchema(dir);
  }
}

function schemaToPlan(schema: Record<string, any>): MigrationUnit[] {
  // Synthesize pivot tables first so m2m junctions get their own
  // migration unit, just like orm.migrate() / Migrator.migrateSchema().
  const fullSchema = withSyntheticPivots(schema);

  return Object.entries(fullSchema).map(([modelName, def]: [string, any]) => {
    const schemaHash = hashSchemaModel(def);
    return {
      name:      migrationUnitName(modelName, schemaHash),
      modelName,
      tableName: def.table ?? modelName.toLowerCase(),
      schemaHash,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Commands ────────────────────────────────────────────────────────────────

// generate ──────────────────────────────────────────────────────────────────
async function cmdGenerate(cfg: ORMConfig) {
  head("Generating schema…");

  const srcDir = path.join(process.cwd(), cfg.dir ?? "src");
  if (!fs.existsSync(srcDir)) {
    fail(`Source directory not found: ${srcDir}`);
    process.exit(1);
  }

  log(`Scanning ${srcDir}…`);

  let generateSchema: ((dir: string) => Promise<any>) | undefined;

  try {
    const mod = await import(pathToFileURL(
      path.join(process.cwd(), "node_modules", "slintorm", "dist", "src", "generator.js")
    ).href);
    generateSchema = mod.default;
  } catch {
    try {
      const mod = await import(pathToFileURL(
        path.join(process.cwd(), "src", "generator.js")
      ).href);
      generateSchema = mod.default;
    } catch (e: any) {
      fail(`Could not load schema generator: ${e.message}`);
      process.exit(1);
    }
  }

  if (!generateSchema) {
    fail("Schema generator failed to load.");
    process.exit(1);
    return; // unreachable, but keeps TS's control-flow analysis happy
  }

  const schema = await generateSchema(srcDir);
  const count  = Object.keys(schema).length;
  ok(`Schema generated — ${count} model${count === 1 ? "" : "s"} written to ${cfg.dir ?? "src"}/schema/`);
}

// status ────────────────────────────────────────────────────────────────────
async function cmdStatus(cfg: ORMConfig) {
  head("Migration status");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);

  const schema = await loadLiveSchema(cfg.dir ?? "src");
  if (!schema) {
    warn("No generated schema found. Run `npx slintorm generate` first.");
    return;
  }

  if (driver === "mongodb") {
    dim("  (mongodb is schemaless — \"migrations\" track index creation only)");
  }

  const plan    = schemaToPlan(schema); // includes synthetic pivots
  const rows    = await getApplied(exec);
  const records = loadMigrationRecords(cfg.dir ?? "src");
  const dbApplied = new Set(rows.map((r) => r.name));

  const applied = new Set(
    plan
      .filter((unit) => {
        const modelDef = schema[unit.modelName];
        const currentFields = fieldNames(modelDef);
        return dbApplied.has(unit.name) || records.some((record) => recordMatchesUnit(record, unit, currentFields));
      })
      .map((unit) => unit.name)
  );

  const pending = plan.filter(u => !applied.has(u.name));
  const done    = plan.filter(u =>  applied.has(u.name));

  console.log(`\n  ${"Name".padEnd(42)} ${"Status".padEnd(10)} Batch`);
  console.log(`  ${"─".repeat(62)}`);

  for (const u of plan) {
    const row    = rows.find(r => r.name === u.name);
    const status = row ? `${c.green}applied${c.reset}` : `${c.yellow}pending${c.reset}`;
    const batch  = row ? String(row.batch) : "—";
    console.log(`  ${u.name.padEnd(42)} ${status.padEnd(10 + (row ? c.green.length + c.reset.length : c.yellow.length + c.reset.length))} ${batch}`);
  }

  console.log(`\n  ${c.green}${done.length} applied${c.reset}  ·  ${c.yellow}${pending.length} pending${c.reset}\n`);

  if (pending.length) {
    const currentBatch = rows.reduce((max, row) => Math.max(max, row.batch || 0), 0);
    const nextRollbackTarget = currentBatch > 0 ? `batch ${Math.max(currentBatch - 1, 0)}` : "none";
    console.log(`  ${c.cyan}Current rollback target:${c.reset} ${nextRollbackTarget}\n`);
  }
}

// migrate ───────────────────────────────────────────────────────────────────
async function cmdMigrate(cfg: ORMConfig) {
  head("Running migrations…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);
  log("Migrations table ready");

  await snapshotCurrentGeneratedSchema({
    exec,
    driver,
    dir: cfg.dir ?? "src",
  });

  let schema = await loadLiveSchema(cfg.dir ?? "src");
  if (!schema) {
    warn("No generated schema found. Running `generate` first…\n");
    await cmdGenerate(cfg);
    return cmdMigrate(cfg);  // retry after generate
  }

  // Augment with synthetic pivot tables BEFORE building the plan, so
  // many-to-many junction tables (e.g. team_members) get migrated too —
  // matching what orm.migrate() / Migrator.migrateSchema() already does.
  schema = withSyntheticPivots(schema);

  if (driver === "mongodb") {
    info("MongoDB driver — DDL skipped, only indexes (@index / @unique) will be created.");
  }
  const startedAt = Date.now();
  const result = await runMigrations({
    exec,
    driver: cfg.driver,
    dir: cfg.dir ?? "src",
    schema,
    hooks: {
      onPending: (pending) => {
        if (!pending.length) return;
        info(`${pending.length} migration${pending.length === 1 ? "" : "s"} pending: ${pending.map((unit) => unit.name).join(", ")}`);
      },
      onProgress: (index, total, unit) => {
        progressBar(index, total, `Migrating ${unit.name}`);
      },
      onDone: (migrationResult) => {
        progressBar(migrationResult.pending.length, migrationResult.pending.length, "Done");
        progressBarDone();
      },
      onError: (unit, error) => {
        progressBarDone();
        fail(`${unit.name} — ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      },
    },
  });

  if (!result.applied) {
    ok("Nothing to migrate — all migrations are up to date.");
    return;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  ok(`${result.applied} migration${result.applied === 1 ? "" : "s"} applied (batch ${result.batch}) in ${elapsed}s.`);
  info(`Migration records written to ${cfg.dir ?? "src"}/schema/migrations/`);
}

// rollback ──────────────────────────────────────────────────────────────────
async function cmdRollback(cfg: ORMConfig, rawArgs: string[] = []) {
  head("Rolling back last batch…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);

  const lastBatch = await getLastBatch(exec);
  if (!lastBatch) {
    warn("Nothing to roll back — migrations table is empty.");
    return;
  }

  const parseTarget = () => {
    if (!rawArgs.length) return null;
    if (rawArgs[0] === "--to" || rawArgs[0] === "-t") return rawArgs[1] ?? null;
    if (rawArgs[0].startsWith("--to=")) return rawArgs[0].slice(5) || null;
    if (!rawArgs[0].startsWith("-")) return rawArgs[0];
    return null;
  };

  const targetArg = parseTarget();

  let targetBatch = lastBatch - 1;
  if (targetArg) {
    if (/^\d+$/.test(targetArg)) {
      targetBatch = parseInt(targetArg, 10);
    } else {
      const isPg = driver === "postgres";
      const lookup = await exec(
        `SELECT batch FROM "${MIGRATIONS_TABLE}" WHERE name = ${isPg ? "$1" : "?"} ORDER BY id DESC LIMIT 1`,
        [targetArg]
      );
      if (!lookup.rows.length) {
        fail(`Unknown rollback target: ${targetArg}`);
        process.exit(1);
      }
      targetBatch = parseInt(lookup.rows[0].batch, 10);
    }
  }

  if (targetBatch < 0) targetBatch = 0;
  if (targetBatch >= lastBatch) {
    ok(`Already at batch ${lastBatch}; nothing to roll back.`);
    return;
  }

  const targetLabel = targetArg ? `${targetArg}` : `batch ${targetBatch}`;
  info(`Rolling back to ${targetLabel} (current batch ${lastBatch})`);

  let rolledBack = 0;

  let schema = await loadLiveSchema(cfg.dir ?? "src");
  if (!schema) {
    warn("No generated schema found — table names will be guessed from migration names.");
  } else {
    // Ensure pivot tables resolve correctly too, same as migrate/status.
    schema = withSyntheticPivots(schema);
  }

  const isPg = driver === "postgres";
  for (let batch = lastBatch; batch > targetBatch; batch--) {
    const res = await exec(
      `SELECT name FROM "${MIGRATIONS_TABLE}" WHERE batch = ${isPg ? "$1" : "?"} ORDER BY id DESC`,
      [batch]
    );
    const toRollback: string[] = res.rows.map((r: any) => r.name);

    if (!toRollback.length) {
      warn(`Nothing to roll back in batch ${batch}.`);
      continue;
    }

    info(`Rolling back batch ${batch} — ${toRollback.length} migration${toRollback.length === 1 ? "" : "s"}`);

    for (let idx = 0; idx < toRollback.length; idx++) {
      const name = toRollback[idx];
      progressBar(idx, toRollback.length, `Rolling back ${name}`);

      const record = readMigrationRecord(cfg.dir ?? "src", name);
      const modelName = record?.modelName ?? migrationModelName(name);
      const tableName = record?.tableName ?? schema?.[modelName]?.table ?? modelName.toLowerCase();

      try {
        await exec(`DROP TABLE IF EXISTS "${tableName}"`);

        await exec(
          `DELETE FROM "${MIGRATIONS_TABLE}" WHERE name = ${isPg ? "$1" : "?"}`,
          [name]
        );

        removeMigrationRecord(cfg.dir ?? "src", name);
        rolledBack++;
      } catch (e: any) {
        progressBarDone();
        fail(`${name} — ${e.message}`);
      }
    }

    progressBar(toRollback.length, toRollback.length, "Done");
    progressBarDone();
  }

  // ── Rebuild tables from the restored batch snapshot (Design B) ──────────
  // Rollback isn't just teardown — it should leave the DB looking like it
  // did at targetBatch. We restore generated.ts/json from the snapshot and
  // then actually re-run ensureTable() for every model in that schema.
  const restoredSchema = restoreGeneratedSchemaForBatch(cfg.dir ?? "src", targetBatch);

  if (targetBatch > 0) {
    if (!restoredSchema) {
      warn(`No schema snapshot found for batch ${targetBatch}; cannot rebuild previous tables automatically.`);
      warn("Update your source files to match that point in history, then re-run `npx slintorm migrate`.");
    } else {
      info(`Restored schema snapshot for batch ${targetBatch} — rebuilding tables…`);

      const rebuildPlan = schemaToPlan(withSyntheticPivots(restoredSchema));
      const migrator = new Migrator(exec, driver as any);

      for (let idx = 0; idx < rebuildPlan.length; idx++) {
        const unit = rebuildPlan[idx];
        const modelDef = restoredSchema[unit.modelName];
        progressBar(idx, rebuildPlan.length, `Restoring ${unit.tableName}`);

        try {
          await migrator.ensureTable(unit.tableName, modelDef.fields, modelDef.relations ?? []);
          await exec(
            `INSERT INTO "${MIGRATIONS_TABLE}" (name, batch) VALUES (${isPg ? "$1,$2" : "?,?"})`,
            [unit.name, targetBatch]
          );
          writeMigrationRecord(cfg.dir ?? "src", unit, targetBatch, modelDef);
        } catch (e: any) {
          progressBarDone();
          fail(`Failed to restore ${unit.tableName} — ${e.message}`);
        }
      }

      progressBar(rebuildPlan.length, rebuildPlan.length, "Done");
      progressBarDone();
      ok(`Rebuilt ${rebuildPlan.length} table${rebuildPlan.length === 1 ? "" : "s"} from batch ${targetBatch}.`);
    }
  }

  ok(`Rolled back from batch ${lastBatch} to batch ${targetBatch} (${rolledBack} migration${rolledBack === 1 ? "" : "s"} removed).`);
}

// fresh ─────────────────────────────────────────────────────────────────────
async function cmdFresh(cfg: ORMConfig) {
  head("Fresh migration (drop all → re-migrate)…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);

  let schema = await loadLiveSchema(cfg.dir ?? "src");
  if (!schema) {
    fail("No generated schema found. Run `npx slintorm generate` first.");
    process.exit(1);
    return; // unreachable, but keeps TS's control-flow analysis happy
  }
  schema = withSyntheticPivots(schema);

  // Drop all known tables/collections in reverse order
  const plan = schemaToPlan(schema).reverse();
  info(`Dropping ${plan.length} table${plan.length === 1 ? "" : "s"}…`);

  for (let idx = 0; idx < plan.length; idx++) {
    const unit = plan[idx];
    progressBar(idx, plan.length, `Dropping ${unit.tableName}`);
    try {
      await exec(`DROP TABLE IF EXISTS "${unit.tableName}"`);
      removeMigrationRecord(cfg.dir ?? "src", unit.name);
    } catch {
      // table/collection may not exist — non-fatal
    }
  }
  progressBar(plan.length, plan.length, "Done");
  progressBarDone();

  // Wipe migrations log
  await exec(`DELETE FROM "${MIGRATIONS_TABLE}"`);

  ok("All tables dropped.\n");
  await cmdMigrate(cfg);
}




// drop-tracking ─────────────────────────────────────────────────────────────
// Standalone production-cutover command — irreversible, drops the
// _slint_migrations table/collection entirely. Not part of rollback.
async function cmdDropTracking(cfg: ORMConfig, rawArgs: string[] = []) {
  head("Dropping migration tracking…");

  const skipConfirm = rawArgs.includes("-y") || rawArgs.includes("--yes");

  warn("This will permanently remove the _slint_migrations tracking table.");
  warn("Intended for production cutover only — this is irreversible.");

  if (!skipConfirm) {
    const confirmed = await promptConfirm("Type 'y' or 'yes' to continue: ");
    if (!confirmed) {
      info("Aborted — tracking table was not dropped.");
      return;
    }
  }

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";

  try {
    if (driver === "mongodb") {
      await exec(`DROP TABLE IF EXISTS "${MIGRATIONS_TABLE}"`);
    } else {
      const ddl = driver === "mysql"
        ? `DROP TABLE IF EXISTS \`${MIGRATIONS_TABLE}\``
        : `DROP TABLE IF EXISTS "${MIGRATIONS_TABLE}"`;
      await exec(ddl);
    }
    ok(`Tracking table "${MIGRATIONS_TABLE}" removed.`);
  } catch (e: any) {
    fail(`Failed to drop tracking table — ${e.message}`);
    process.exit(1);
  }
}

// ─── Confirmation prompt helper ──────────────────────────────────────────────
async function promptConfirm(question: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${c.yellow}?${c.reset}  ${question}`)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
// help ───────────────────────────────────────────────────────────────────────
function cmdHelp() {
  console.log(`
${c.bold}SlintORM CLI${c.reset}  ${c.gray}— database migration tool${c.reset}

${c.bold}Usage:${c.reset}
  npx slintorm <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}generate${c.reset}    Scan source files and (re)generate schema/generated.ts
  ${c.cyan}migrate${c.reset}     Apply all pending migrations
  ${c.cyan}rollback${c.reset}    Undo migrations back to a batch or migration name
  ${c.cyan}status${c.reset}      Show applied / pending migrations
  ${c.cyan}fresh${c.reset}       Drop all tables then re-run all migrations
  ${c.cyan}drop-tracking${c.reset} Drop the internal migration tracking table


${c.bold}Config:${c.reset}
  Create ${c.white}slintorm.config.js${c.reset} in your project root:

  ${c.gray}// slintorm.config.js${c.reset}
  ${c.yellow}export default ${c.reset}{
    driver:      ${c.green}"sqlite"${c.reset},          ${c.gray}// sqlite | postgres | mysql | mongodb${c.reset}
    databaseUrl: ${c.green}"./myapp.db"${c.reset},
    dir:         ${c.green}"src"${c.reset},             ${c.gray}// folder with your TypeScript interfaces${c.reset}
    logs:        ${c.yellow}false${c.reset},
  };

  ${c.gray}For mongodb, databaseUrl should include the database name, e.g.${c.reset}
  ${c.gray}Or add a "slintorm" key to package.json.${c.reset}
  ${c.gray}(orm.config.js is still read for backwards compatibility, but is deprecated.)${c.reset}

${c.bold}Migration records:${c.reset}
  Each applied migration writes a JSON record to ${c.white}<dir>/schema/migrations/${c.reset}
  in addition to the internal _slint_migrations tracking collection/table.

${c.bold}Rollback behavior:${c.reset}
  Rollback drops the tables for the rolled-back batch, then rebuilds the
  tables for the target batch from its schema snapshot automatically.
`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const [,, command = "--help", ...args] = process.argv;

async function main() {
  if (command === "--help" || command === "-h" || command === "help") {
    cmdHelp();
    return;
  }

  const cfg = await loadConfig();

  switch (command) {
    case "generate":      await cmdGenerate(cfg);      break;
    case "migrate":       await cmdMigrate(cfg);        break;
    case "rollback":      await cmdRollback(cfg, args); break;
    case "status":        await cmdStatus(cfg);         break;
    case "fresh":         await cmdFresh(cfg);          break;
    case "drop-tracking": await cmdDropTracking(cfg);   break;
    default:
      fail(`Unknown command: ${c.bold}${command}${c.reset}`);
      console.log(`Run ${c.cyan}npx slintorm --help${c.reset} to see available commands.\n`);
      process.exit(1);
  }
}

main().catch(err => {
  fail(err?.message ?? String(err));
  process.exit(1);
});