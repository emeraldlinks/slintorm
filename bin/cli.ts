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
 */

import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

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
// Every log line gets a HH:MM:SS timestamp so you can see how long each step
// actually took when reading back over CLI output.

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
// Simple inline progress bar that re-draws on the same line.
// Call progressBar(current, total, label) repeatedly, then progressBarDone() once finished.

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
// We keep a _slint_migrations table so the CLI knows what has / hasn't run.

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
  driver?: "sqlite" | "postgres" | "mysql";
  databaseUrl?: string;
  dir?: string;
  logs?: boolean;
  [key: string]: any;
}

async function loadConfig(): Promise<ORMConfig> {
  const cwd = process.cwd();

  // Primary: slintorm.config.*
  const primaryCandidates = [
    path.join(cwd, "slintorm.config.js"),
    path.join(cwd, "slintorm.config.mjs"),
    path.join(cwd, "slintorm.config.cjs"),
    path.join(cwd, "slintorm.config.ts"),     // works when run via tsx
    path.join(cwd, "slintorm.config.json"),
  ];

  // Legacy fallback: orm.config.* — still supported, but warns
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

  // Fallback: try package.json "slintorm" key
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.slintorm) {
        info("Loading config from package.json \"slintorm\" key");
        return pkg.slintorm;
      }
    } catch {}
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

// ─── Adapter bootstrap (tiny — avoids importing the full ORM graph) ──────────

interface ExecResult { rows: any[]; changes?: number; lastID?: number; insertId?: number }
type ExecFn = (sql: string, params?: any[]) => Promise<ExecResult>;

async function buildExec(cfg: ORMConfig): Promise<ExecFn> {
  const driver = cfg.driver ?? "sqlite";
  const url    = cfg.databaseUrl ?? "./database.db";

  info(`Connecting to ${driver} database (${url})…`);

  if (driver === "sqlite") {
    // Prefer better-sqlite3 (sync), fall back to sqlite3 (async)
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
      // better-sqlite3 not available — try sqlite3
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

  fail(`Unsupported driver: ${driver}`);
  process.exit(1);
}

// ─── Migrations table helpers ────────────────────────────────────────────────

async function ensureMigrationsTable(exec: ExecFn, driver: string) {
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
// On-disk trail of what's been applied, separate from the DB tracking table.
// Useful for diffing across branches / reviewing in PRs.

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
    batch,
    appliedAt: new Date().toISOString(),
    fields: Object.keys(modelDef?.fields ?? {}),
  };
  fs.writeFileSync(recPath, JSON.stringify(record, null, 2), "utf8");
}

function removeMigrationRecord(dir: string, name: string) {
  const recPath = path.join(migrationsDir(dir), `${name}.json`);
  if (fs.existsSync(recPath)) fs.unlinkSync(recPath);
}

// ─── Schema-based migration plan ─────────────────────────────────────────────
// We treat each model in the generated schema as a "migration unit".
// Name format: <timestamp>_<ModelName>   — stable once generated.

interface MigrationUnit {
  name: string;        // e.g. "20240101000000_User"
  modelName: string;
  tableName: string;
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
    } catch {}
  }
  return null;
}

function schemaToPlan(schema: Record<string, any>): MigrationUnit[] {
  // Give each model a deterministic timestamp based on its name so the
  // order is always alphabetical but the names don't change between runs.
  return Object.entries(schema).map(([modelName, def]: [string, any]) => {
    const hash = modelName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const ts   = `20000101${String(hash % 100000).padStart(6, "0")}`;
    return {
      name:      `${ts}_${modelName}`,
      modelName,
      tableName: def.table ?? modelName.toLowerCase(),
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

  // Dynamically import the generator from the user's installed package
  let generateSchema: (dir: string) => Promise<any>;
  try {
    const mod = await import(pathToFileURL(
      path.join(process.cwd(), "node_modules", "slintorm", "dist", "generator.js")
    ).href);
    generateSchema = mod.default;
  } catch {
    // Try relative path (monorepo / local dev)
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

  const schema = await loadGeneratedSchema(cfg.dir ?? "src");
  if (!schema) {
    warn("No generated schema found. Run `npx slintorm generate` first.");
    return;
  }

  const plan    = schemaToPlan(schema);
  const applied = new Set((await getApplied(exec)).map(r => r.name));
  const rows    = await getApplied(exec);

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
}

// migrate ───────────────────────────────────────────────────────────────────
async function cmdMigrate(cfg: ORMConfig) {
  head("Running migrations…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);
  log("Migrations table ready");

  const schema = await loadGeneratedSchema(cfg.dir ?? "src");
  if (!schema) {
    warn("No generated schema found. Running `generate` first…\n");
    await cmdGenerate(cfg);
    return cmdMigrate(cfg);  // retry after generate
  }

  const plan    = schemaToPlan(schema);
  const applied = new Set((await getApplied(exec)).map(r => r.name));
  const pending = plan.filter(u => !applied.has(u.name));

  if (!pending.length) {
    ok("Nothing to migrate — all migrations are up to date.");
    return;
  }

  info(`${pending.length} migration${pending.length === 1 ? "" : "s"} pending`);

  // Dynamically load the Migrator from the installed package
  let Migrator: any;
  try {
    const mod = await import(pathToFileURL(
      path.join(process.cwd(), "node_modules", "slintorm", "dist", "migrator.js")
    ).href);
    Migrator = mod.Migrator;
  } catch {
    try {
      const mod = await import(pathToFileURL(
        path.join(process.cwd(), "src", "migrator.js")
      ).href);
      Migrator = mod.Migrator;
    } catch (e: any) {
      fail(`Could not load Migrator: ${e.message}`);
      process.exit(1);
    }
  }

  const migrator = new Migrator(exec, driver);
  const batch    = (await getLastBatch(exec)) + 1;
  let   count    = 0;
  const failed: string[] = [];
  const startedAt = Date.now();

  for (let idx = 0; idx < pending.length; idx++) {
    const unit = pending[idx];
    const modelDef = schema[unit.modelName];

    progressBar(idx, pending.length, `Migrating ${unit.name}`);

    try {
      await migrator.ensureTable(unit.tableName, modelDef.fields, modelDef.relations ?? []);

      // Record in migrations table
      const isPg = driver === "postgres";
      await exec(
        `INSERT INTO "${MIGRATIONS_TABLE}" (name, batch) VALUES (${isPg ? "$1,$2" : "?,?"})`,
        [unit.name, batch]
      );

      // On-disk migration record
      writeMigrationRecord(cfg.dir ?? "src", unit, batch, modelDef);

      count++;
    } catch (e: any) {
      progressBarDone();
      fail(`${unit.name} — ${e.message}`);
      failed.push(unit.name);
      process.exit(1);
    }
  }

  progressBar(pending.length, pending.length, "Done");
  progressBarDone();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  ok(`${count} migration${count === 1 ? "" : "s"} applied (batch ${batch}) in ${elapsed}s.`);
  info(`Migration records written to ${cfg.dir ?? "src"}/schema/migrations/`);
}

// rollback ──────────────────────────────────────────────────────────────────
async function cmdRollback(cfg: ORMConfig) {
  head("Rolling back last batch…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);

  const lastBatch = await getLastBatch(exec);
  if (!lastBatch) {
    warn("Nothing to roll back — migrations table is empty.");
    return;
  }

  const isPg = driver === "postgres";
  const res  = await exec(
    `SELECT name FROM "${MIGRATIONS_TABLE}" WHERE batch = ${isPg ? "$1" : "?"} ORDER BY id DESC`,
    [lastBatch]
  );
  const toRollback: string[] = res.rows.map((r: any) => r.name);

  if (!toRollback.length) {
    warn("Nothing to roll back.");
    return;
  }

  info(`Rolling back batch ${lastBatch} — ${toRollback.length} migration${toRollback.length === 1 ? "" : "s"}`);

  const schema = await loadGeneratedSchema(cfg.dir ?? "src");
  let rolledBack = 0;

  for (let idx = 0; idx < toRollback.length; idx++) {
    const name = toRollback[idx];
    progressBar(idx, toRollback.length, `Rolling back ${name}`);

    // Extract table name from the migration name → "<ts>_<ModelName>"
    const modelName = name.replace(/^\d+_/, "");
    const tableName = schema?.[modelName]?.table ?? modelName.toLowerCase();

    try {
      // Rollback = DROP TABLE (schema-based ORM has no down() functions)
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

  ok(`Batch ${lastBatch} rolled back (${rolledBack} migration${rolledBack === 1 ? "" : "s"}).`);
  warn("Tables were dropped. Re-run `npx slintorm migrate` to recreate them.");
}

// fresh ─────────────────────────────────────────────────────────────────────
async function cmdFresh(cfg: ORMConfig) {
  head("Fresh migration (drop all → re-migrate)…");

  const exec   = await buildExec(cfg);
  const driver = cfg.driver ?? "sqlite";
  await ensureMigrationsTable(exec, driver);

  const schema = await loadGeneratedSchema(cfg.dir ?? "src");
  if (!schema) {
    fail("No generated schema found. Run `npx slintorm generate` first.");
    process.exit(1);
  }

  // Drop all known tables in reverse order
  const plan = schemaToPlan(schema).reverse();
  info(`Dropping ${plan.length} table${plan.length === 1 ? "" : "s"}…`);

  for (let idx = 0; idx < plan.length; idx++) {
    const unit = plan[idx];
    progressBar(idx, plan.length, `Dropping ${unit.tableName}`);
    try {
      await exec(`DROP TABLE IF EXISTS "${unit.tableName}"`);
      removeMigrationRecord(cfg.dir ?? "src", unit.name);
    } catch {}
  }
  progressBar(plan.length, plan.length, "Done");
  progressBarDone();

  // Wipe migrations log
  await exec(`DELETE FROM "${MIGRATIONS_TABLE}"`);

  ok("All tables dropped.\n");
  await cmdMigrate(cfg);
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
  ${c.cyan}rollback${c.reset}    Undo the last migration batch (drops the tables)
  ${c.cyan}status${c.reset}      Show applied / pending migrations
  ${c.cyan}fresh${c.reset}       Drop all tables then re-run all migrations

${c.bold}Config:${c.reset}
  Create ${c.white}slintorm.config.js${c.reset} in your project root:

  ${c.gray}// slintorm.config.js${c.reset}
  ${c.yellow}export default ${c.reset}{
    driver:      ${c.green}"sqlite"${c.reset},          ${c.gray}// sqlite | postgres | mongodb | mysql${c.reset}
    databaseUrl: ${c.green}"./myapp.db"${c.reset},
    dir:         ${c.green}"src"${c.reset},             ${c.gray}// folder with your TypeScript interfaces${c.reset}
    logs:        ${c.yellow}false${c.reset},
  };

  ${c.gray}Or add a "slintorm" key to package.json.${c.reset}
  ${c.gray}(orm.config.js is still read for backwards compatibility, but is deprecated.)${c.reset}

${c.bold}Migration records:${c.reset}
  Each applied migration writes a JSON record to ${c.white}<dir>/schema/migrations/${c.reset}
  in addition to the internal _slint_migrations DB table.
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
    case "generate": await cmdGenerate(cfg); break;
    case "migrate":  await cmdMigrate(cfg);  break;
    case "rollback": await cmdRollback(cfg); break;
    case "status":   await cmdStatus(cfg);   break;
    case "fresh":    await cmdFresh(cfg);    break;
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