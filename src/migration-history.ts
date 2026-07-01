import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { Migrator, type SchemaModel } from "./migrator.js";
import type { DBDriver, ExecFn } from "./types.js";

export interface MigrationUnit {
  name: string;
  modelName: string;
  tableName: string;
  schemaHash: string;
}

export interface MigrationRunResult {
  batch: number;
  applied: number;
  pending: MigrationUnit[];
}

export interface MigrationRunOptions {
  exec: ExecFn;
  driver?: DBDriver;
  dir?: string;
  schema: Record<string, SchemaModel | any>;
  hooks?: MigrationRunHooks;
}

export interface MigrationRunHooks {
  onPending?: (pending: MigrationUnit[]) => void;
  onProgress?: (index: number, total: number, unit: MigrationUnit) => void;
  onDone?: (result: MigrationRunResult) => void;
  onError?: (unit: MigrationUnit, error: unknown) => void;
}

const MIGRATIONS_TABLE = "_slint_migrations";
const SCHEMA_SNAPSHOT_ROOT = "_schema_snapshots";

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

function migrationsDir(dir: string): string {
  const p = path.join(process.cwd(), dir, "schema", "migrations");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function schemaSnapshotDir(dir: string, batch: number): string {
  const p = path.join(migrationsDir(dir), SCHEMA_SNAPSHOT_ROOT, `batch-${batch}`);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function currentGeneratedSchemaPaths(dir: string) {
  const base = path.join(process.cwd(), dir, "schema");
  return {
    ts: path.join(base, "generated.ts"),
    json: path.join(base, "generated.json"),
  };
}

function snapshotGeneratedSchema(dir: string, batch: number) {
  const source = currentGeneratedSchemaPaths(dir);
  if (!fs.existsSync(source.ts) && !fs.existsSync(source.json)) return false;

  const targetDir = schemaSnapshotDir(dir, batch);
  let copied = false;

  for (const key of ["ts", "json"] as const) {
    const sourcePath = source[key];
    if (!fs.existsSync(sourcePath)) continue;
    fs.copyFileSync(sourcePath, path.join(targetDir, `generated.${key}`));
    copied = true;
  }

  return copied;
}

// Restores a previously-snapshotted generated.ts/json back onto disk AND
// returns the parsed schema object for that batch, so callers (rollback)
// can actually rebuild tables from it — not just leave files on disk.
function restoreGeneratedSchemaSnapshot(dir: string, batch: number): Record<string, any> | null {
  const snapshotDir = path.join(migrationsDir(dir), SCHEMA_SNAPSHOT_ROOT, `batch-${batch}`);
  if (!fs.existsSync(snapshotDir)) return null;

  const target = currentGeneratedSchemaPaths(dir);
  const jsonSnapshotPath = path.join(snapshotDir, "generated.json");
  const tsSnapshotPath = path.join(snapshotDir, "generated.ts");

  let schema: Record<string, any> | null = null;

  if (fs.existsSync(jsonSnapshotPath)) {
    schema = JSON.parse(fs.readFileSync(jsonSnapshotPath, "utf8"));
  }

  // Copy whichever snapshot files exist back onto disk so generated.ts/json
  // reflect the restored batch too, keeping `generate`/`status` consistent.
  for (const [snapshotPath, targetPath] of [
    [jsonSnapshotPath, target.json],
    [tsSnapshotPath, target.ts],
  ] as const) {
    if (!fs.existsSync(snapshotPath)) continue;
    fs.copyFileSync(snapshotPath, targetPath);
  }

  return schema;
}

export async function snapshotCurrentGeneratedSchema(options: {
  exec: ExecFn;
  driver?: DBDriver;
  dir?: string;
}) {
  const driver = options.driver ?? "sqlite";
  const dir = options.dir ?? "src";

  await ensureMigrationsTable(options.exec, driver as string);
  const batch = await getLastBatch(options.exec);
  return snapshotGeneratedSchema(dir, batch);
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

function withSyntheticPivots(schema: Record<string, any>): Record<string, any> {
  for (const [name, model] of Object.entries(schema)) {
    for (const r of model.relations || []) {
      if (r.kind !== "manytomany" || !r.through) continue;
      const pivot = String(r.through);
      if (schema[pivot]) continue;

      const leftFk = r.foreignKey || r.meta?.foreignKey || `${name.toLowerCase()}Id`;
      const rightFk = r.relatedKey || r.meta?.relatedKey || `${String(r.targetModel).toLowerCase()}Id`;

      schema[pivot] = {
        fields: {
          id: { type: "number", meta: { primaryKey: true, auto: true } },
          [leftFk]: { type: "number", meta: { index: true } },
          [rightFk]: { type: "number", meta: { index: true } },
        },
        relations: [],
        table: pivot,
      };
    }
  }
  return schema;
}

function schemaToPlan(schema: Record<string, any>): MigrationUnit[] {
  const fullSchema = withSyntheticPivots(schema);

  return Object.entries(fullSchema).map(([modelName, def]: [string, any]) => {
    const schemaHash = hashSchemaModel(def);
    return {
      name: migrationUnitName(modelName, schemaHash),
      modelName,
      tableName: def.table ?? modelName.toLowerCase(),
      schemaHash,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureMigrationsTable(exec: ExecFn, driver: string) {
  if (driver === "mongodb") {
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

async function insertMigrationRow(exec: ExecFn, driver: string, name: string, batch: number) {
  if (driver === "mongodb") {
    await exec(`INSERT INTO "${MIGRATIONS_TABLE}" (name, batch) VALUES (?,?)`, [name, batch]);
    return;
  }

  const isPg = driver === "postgres";
  await exec(
    `INSERT INTO "${MIGRATIONS_TABLE}" (name, batch) VALUES (${isPg ? "$1,$2" : "?,?"})`,
    [name, batch]
  );
}

export function migrationRecordModelName(unitName: string) {
  return migrationModelName(unitName);
}

export function migrationRecordForPath(dir: string, name: string) {
  return readMigrationRecord(dir, name);
}

export function migrationPlan(schema: Record<string, any>) {
  return schemaToPlan(schema);
}

// Returns the restored schema object for the given batch (or null if no
// snapshot exists), and also rewrites generated.ts/json on disk to match.
export function restoreGeneratedSchemaForBatch(dir: string, batch: number) {
  return restoreGeneratedSchemaSnapshot(dir, batch);
}

export async function runMigrations(options: MigrationRunOptions): Promise<MigrationRunResult> {
  const driver = options.driver ?? "sqlite";
  const dir = options.dir ?? "src";
  const schema = withSyntheticPivots(options.schema);

  await ensureMigrationsTable(options.exec, driver as string);

  const plan = schemaToPlan(schema);
  const rows = await getApplied(options.exec);
  const records = loadMigrationRecords(dir);
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
  const pending = plan.filter((unit) => !applied.has(unit.name));

  options.hooks?.onPending?.(pending);

  if (!pending.length) {
    const result = {
      batch: await getLastBatch(options.exec),
      applied: 0,
      pending: [],
    };
    options.hooks?.onDone?.(result);
    return result;
  }

  const migrator = new Migrator(options.exec, driver as any);
  const batch = (await getLastBatch(options.exec)) + 1;
  let appliedCount = 0;

  if (batch === 1) {
    snapshotGeneratedSchema(dir, 0);
  }

  for (let index = 0; index < pending.length; index++) {
    const unit = pending[index];
    const modelDef = schema[unit.modelName];
    options.hooks?.onProgress?.(index, pending.length, unit);

    try {
      await migrator.ensureTable(unit.tableName, modelDef.fields, modelDef.relations ?? []);
      await insertMigrationRow(options.exec, driver as string, unit.name, batch);
      writeMigrationRecord(dir, unit, batch, modelDef);
      appliedCount++;
    } catch (error) {
      options.hooks?.onError?.(unit, error);
      throw error;
    }
  }

  snapshotGeneratedSchema(dir, batch);

  const result = { batch, applied: appliedCount, pending };
  options.hooks?.onDone?.(result);
  return result;
}