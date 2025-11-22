// ==== IMPORTS ====
import type { ExecFn } from "./types.ts";
import { tsTypeToSqlType } from "./utils.js";

// ==== INTERFACES ====
export interface FieldInfo {
  type: string;
  meta: Record<string, string | number | boolean | null>;
}

interface Relation {
  sourceModel: string;
  fieldName: string;
  kind: string;
  targetModel: string;
  foreignKey: string;
  meta: Record<string, string | number | boolean | null>;
}

interface SchemaModel {
  fields: Record<string, FieldInfo>;
  relations: any[];
  table?: string;
}

const processedTables = new Set<string>();


// ==== MIGRATOR CLASS ====
export class Migrator {
  private exec: ExecFn;
  private driver: "sqlite" | "postgres" | "mysql";

  constructor(exec: ExecFn, driver?: "sqlite" | "postgres" | "mysql") {
    this.exec = exec;
    this.driver = driver || "sqlite";
  }
  // ==== MIGRATE FULL SCHEMA ====
  async migrateSchema(schema: Record<string, SchemaModel>) {
    for (const [name, model] of Object.entries(schema)) {
      if (!model.table) model.table = name.toLowerCase();
      this.ensureTimestamps(model.fields);
      await this.ensureTable(model.table, model.fields);
      await this.applyDefaults(model.table, model.fields);
    }
  }

  // ==== ADD TIMESTAMP FIELDS ====
  private ensureTimestamps(fields: Record<string, FieldInfo>) {
    const timestampDefaults: Record<string, FieldInfo> = {
      createdAt: {
        type: "Date",
        meta: { default: "CURRENT_TIMESTAMP", index: true },
      },
      updatedAt: {
        type: "Date",
        meta: { default: "CURRENT_TIMESTAMP", index: true },
      },
      deletedAt: { type: "Date", meta: { default: null, index: true } },
    };

    for (const [key, def] of Object.entries(timestampDefaults)) {
      if (!fields[key]) fields[key] = def;
    }
  }
  // inside Migrator class - replace ensureTable with this implementation
async ensureTable(
  table: string,
  schema: Record<string, FieldInfo>,
  relations?: Relation[]
) {
  table = table.toLowerCase();
  if (processedTables.has(table)) return;

  const exists = await this.tableExists(table);
  const addToProcessed = () => processedTables.add(table);

  const colsSql: string[] = [];
  const indexSql: string[] = [];
  const inlineConstraints: string[] = [];
  const postConstraints: string[] = [];
  const commentSql: string[] = [];

  let primaryDeclared = false;

  for (const [col, info] of Object.entries(schema)) {
    if (!info || !info.type) continue;

    let sqlType = "";
    if (info.meta?.enum) {
      const enumValues = this.parseEnumValues(info.meta.enum as string);
      sqlType = this.driver === "postgres"
        ? await this.createEnumColumn(table, col, enumValues)
        : "VARCHAR(255)";
    } else if (info.meta?.json) {
      sqlType = this.driver === "postgres" ? "JSONB" : this.driver === "sqlite" ? "TEXT" : "JSON";
    } else if (info.type === "Date") {
      sqlType = this.driver === "sqlite" ? "INTEGER" : this.driver === "postgres" ? "TIMESTAMP" : "DATETIME";
    } else {
      sqlType = tsTypeToSqlType(info.type);
      if (info.meta?.length && /char|varchar/i.test(sqlType)) {
        sqlType = sqlType.replace(/\(.+\)$/, "") + `(${info.meta.length})`;
      }
    }

    const generated = info.meta?.generatedAlways ? `GENERATED ALWAYS AS (${info.meta.generatedAlways}) STORED` : "";
    const collate = info.meta?.collate ? `COLLATE ${info.meta.collate}` : "";
    const check = Array.isArray(info.meta?.enum)
      ? `CHECK ("${col}" IN (${(info.meta!.enum as string[]).map((v) => `'${v}'`).join(", ")}))`
      : info.meta?.check ? `CHECK (${info.meta.check})` : "";

    const isNullable = info.meta?.nullable || info.type.includes("undefined") ? "" : "NOT NULL";

    let defaultClause = "";
    if (info.meta?.default !== undefined) {
      const def = info.meta.default;
      if (def === "CURRENT_TIMESTAMP") defaultClause = this.driver === "sqlite" ? "DEFAULT (datetime('now'))" : "DEFAULT CURRENT_TIMESTAMP";
      else if (typeof def === "string") defaultClause = `DEFAULT '${def}'`;
      else if (typeof def === "boolean") defaultClause = `DEFAULT ${def ? 1 : 0}`;
      else defaultClause = `DEFAULT ${def}`;
    }
    if (info.meta?.defaultFn) defaultClause = `DEFAULT ${info.meta.defaultFn}`;
    if (info.meta?.json && info.meta?.jsonDefault) defaultClause = `DEFAULT '${JSON.stringify(info.meta.jsonDefault)}'`;
    if (info.meta?.softDelete && !defaultClause) defaultClause = "DEFAULT NULL";
    if (info.meta?.onUpdateNow && this.driver === "mysql") {
      defaultClause = defaultClause ? defaultClause + " ON UPDATE CURRENT_TIMESTAMP" : "ON UPDATE CURRENT_TIMESTAMP";
    }

    let pkFragment = "";
    if (info.meta?.auto && !primaryDeclared) {
      if (this.driver === "sqlite") { sqlType = "INTEGER"; pkFragment = "PRIMARY KEY AUTOINCREMENT"; }
      else if (this.driver === "postgres") { sqlType = "SERIAL"; pkFragment = "PRIMARY KEY"; }
      else { sqlType = "INTEGER"; pkFragment = "AUTO_INCREMENT PRIMARY KEY"; }
      primaryDeclared = true;
    } else if (info.meta?.primaryKey === true && !primaryDeclared) {
      pkFragment = "PRIMARY KEY";
      primaryDeclared = true;
    }

    const parts = [`"${col}"`, sqlType, pkFragment, isNullable, defaultClause, generated, collate, check]
      .filter(Boolean).join(" ");

    colsSql.push(parts);

    if (info.meta?.comment && this.driver === "postgres") {
      commentSql.push(`COMMENT ON COLUMN "${table}"."${col}" IS '${String(info.meta.comment)}'`);
    }

    if (info.meta?.index) {
      indexSql.push(`CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON "${table}"("${col}")`);
    }

    if (info.meta?.unique) {
      // Use inline constraint if table does not exist
      if (!exists) inlineConstraints.push(`CONSTRAINT unq_${table}_${col} UNIQUE ("${col}")`);
      else postConstraints.push(`ALTER TABLE "${table}" ADD CONSTRAINT unq_${table}_${col} UNIQUE ("${col}")`);
    }

    if (info.meta?.foreignKey) {
      const refTable = String(info.meta.foreignKey);
      const fkStmt = `FOREIGN KEY ("${col}") REFERENCES "${refTable}"(id)` +
        (info.meta?.onDelete ? ` ON DELETE ${info.meta.onDelete}` : "") +
        (info.meta?.onUpdate ? ` ON UPDATE ${info.meta.onUpdate}` : "") +
        (info.meta?.match ? ` MATCH ${info.meta.match}` : "") +
        (info.meta?.deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");

      if (!exists) inlineConstraints.push(fkStmt);
      else postConstraints.push(`ALTER TABLE "${table}" ADD ${fkStmt}`);
    }
  }

  // Create or alter table
  if (!exists) {
    const createSQL = `CREATE TABLE IF NOT EXISTS "${table}" (\n${colsSql.concat(inlineConstraints).join(",\n")}\n);`;
    console.log(`Creating table ${table}`);
    await this.exec(createSQL);
    addToProcessed();
  } else {
    const existingCols = await this.getExistingColumns(table);
    for (const colDef of colsSql) {
      const m = colDef.match(/^"([^"]+)"/);
      if (!m) continue;
      const name = m[1].toLowerCase();
      if (existingCols.includes(name)) continue;
      const safeColDef = colDef.replace(/\s+PRIMARY KEY( AUTOINCREMENT|)/i, "");
      try { await this.exec(`ALTER TABLE "${table}" ADD COLUMN ${safeColDef}`); } catch {}
    }
    addToProcessed();
  }

  // Comments
  for (const c of commentSql) { try { await this.exec(c); } catch {} }

  // Indexes
  const existingIndexes = await this.getExistingIndexes(table);
  for (const idx of indexSql) {
    const idxName = (idx.match(/(?:idx_|unq_)[^\s]+/)?.[0] || "").toLowerCase();
    if (!idxName || existingIndexes.includes(idxName)) continue;
    try { await this.exec(idx); } catch {}
  }

  // Relations array
  if (relations && relations.length) {
    const existingFKs = await this.getExistingFKs(table);
    await Promise.all(relations.map(async (rel) => {
      const fkCol = rel.foreignKey;
      const refTable = rel.targetModel?.toLowerCase();
      if (!fkCol || !refTable) return;
      const refExists = await this.tableExists(refTable);
      if (!refExists) return;

      const fkStatement = `ALTER TABLE "${table}" ADD FOREIGN KEY ("${fkCol}") REFERENCES "${refTable}"(id)` +
        (rel.meta?.onDelete ? ` ON DELETE ${rel.meta.onDelete}` : "") +
        (rel.meta?.onUpdate ? ` ON UPDATE ${rel.meta.onUpdate}` : "") +
        (rel.meta?.match ? ` MATCH ${rel.meta.match}` : "") +
        (rel.meta?.deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");

      const uniqueStatement = rel.kind === "onetoone" && this.driver !== "sqlite"
        ? `ALTER TABLE "${table}" ADD CONSTRAINT unique_${table}_${fkCol} UNIQUE ("${fkCol}")`
        : null;

      if (!existingFKs.includes(fkStatement.toLowerCase())) {
        try { await this.exec(fkStatement); } catch {}
      }
      if (uniqueStatement && !existingFKs.includes(uniqueStatement.toLowerCase())) {
        try { await this.exec(uniqueStatement); } catch {}
      }
    }));
  }

  // Post-create constraints
  const existingFKsNow = await this.getExistingFKs(table);
  for (const fk of postConstraints) {
    if (existingFKsNow.includes(fk.toLowerCase())) continue;
    try { await this.exec(fk); } catch {}
  }

  console.log(`=== Finished ensuring table: "${table}" ===`);
}

  private parseEnumValues(enumMeta: string): string[] {
    // accepts formats like "('a','b')" or "(a,b)" or "a,b" and returns ['a','b']
    const s = String(enumMeta);
    const cleaned = s.replace(/^[\(\s]+|[\)\s]+$/g, "");
    return cleaned.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  }

  private async createEnumColumn(
    table: string,
    col: string,
    values: string[]
  ): Promise<string> {
    // create a dedicated enum type for postgres and return the type name to use
    if (this.driver !== "postgres") return `"${table}_${col}_enum"`;
    const typeName = `${table}_${col}_enum`;
    try {
      // Create type only if it doesn't exist
      const check = `SELECT 1 FROM pg_type WHERE typname = $1`;
      const res = (await this.exec(check, [typeName])) as any;
      if (!res.rows || !res.rows.length) {
        const vals = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
        await this.exec(`CREATE TYPE "${typeName}" AS ENUM (${vals})`);
      }
    } catch (err) {
      // ignore if race or exists
      console.error("enum create error:", err);
    }
    return `"${typeName}"`;
  }

  // ==== APPLY DEFAULTS TO EXISTING ROWS ====
  private async applyDefaults(
    table: string,
    schema: Record<string, FieldInfo>
  ) {
    for (const [col, info] of Object.entries(schema)) {
      if (!info.meta?.default) continue;
      const def = info.meta.default;
      if (def === null) continue;

      let value: string | number;
      if (def === "CURRENT_TIMESTAMP") {
        value =
          this.driver === "sqlite"
            ? "strftime('%s','now')"
            : "CURRENT_TIMESTAMP";
      } else if (typeof def === "boolean") {
        value = def ? 1 : 0;
      } else if (typeof def === "string") {
        value = `'${def}'`;
      } else {
        value = def as string | number;
      }

      await this.exec(
        `UPDATE "${table}" SET "${col}" = ${value} WHERE "${col}" IS NULL`
      );
    }
  }

  // ==== TABLE CHECK ====
  private async tableExists(table: string): Promise<boolean> {
    let query = "";
    let params: any[] = [];
    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
        break;
      case "postgres":
        query = `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename=$1`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name=?`;
        params = [table];
        break;
    }
    const res = await this.exec(query, params);
    return res.rows?.length > 0;
  }

  private async getExistingColumns(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA table_info("${table}")`;
        break;
      case "postgres":
        query = `SELECT column_name FROM information_schema.columns WHERE table_name=$1`;
        break;
      case "mysql":
        query = `SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`;
        break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) =>
      (r.name || r.column_name).toLowerCase()
    );
  }

  private async getExistingIndexes(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`;
        break;
      case "postgres":
        query = `SELECT indexname FROM pg_indexes WHERE tablename=$1`;
        break;
      case "mysql":
        query = `SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`;
        break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) =>
      (r.name || r.indexname).toLowerCase()
    );
  }

  private async getExistingFKs(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA foreign_key_list("${table}")`;
        break;
      case "postgres":
        query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`;
        break;
      case "mysql":
        query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'`;
        break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) => JSON.stringify(r).toLowerCase());
  }
}