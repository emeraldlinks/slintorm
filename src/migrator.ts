// ==== IMPORTS ====
import type { ExecFn } from "./types.ts";
import { tsTypeToSqlType } from "./utils.js";

// ==== INTERFACES ====
export interface FieldInfo {
  type: string;
  meta: Record<string, string | number | boolean | null>;
}

interface SchemaModel {
  fields: Record<string, FieldInfo>;
  relations: any[];
  table?: string;
}

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
    createdAt: { type: "Date", meta: { default: "CURRENT_TIMESTAMP", index: true } },
    updatedAt: { type: "Date", meta: { default: "CURRENT_TIMESTAMP", index: true } },
    deletedAt: { type: "Date", meta: { default: null, index: true } },
  };

  for (const [key, def] of Object.entries(timestampDefaults)) {
    if (!fields[key]) fields[key] = def;
  }
}

// ==== ENSURE TABLE EXISTS OR ALTERED ====
async ensureTable(table: string, schema: Record<string, FieldInfo>) {
  table = table.toLowerCase();
  const exists = await this.tableExists(table);

  const colsSql: string[] = [];
  const indexSql: string[] = [];
  const fkSql: string[] = [];

  for (const [col, info] of Object.entries(schema)) {
    let sqlType = "";
    // driver-aware timestamp mapping
    if (info.type === "Date") {
      if (this.driver === "sqlite") sqlType = "INTEGER";       // store as epoch
      if (this.driver === "postgres") sqlType = "TIMESTAMP";   // or TIMESTAMPTZ if you prefer
      if (this.driver === "mysql") sqlType = "DATETIME";
    } else {
      sqlType = tsTypeToSqlType(info.type);
    }

    const isNullable = info.type.includes("undefined") ? "" : "NOT NULL";

    // handle default values
    let defaultClause = "";
    if (info.meta?.default !== undefined) {
      const def = info.meta.default;
      if (def === "CURRENT_TIMESTAMP") {
        if (this.driver === "sqlite") defaultClause = "DEFAULT (strftime('%s','now'))";
        else defaultClause = "DEFAULT CURRENT_TIMESTAMP";
      } else if (typeof def === "string") defaultClause = `DEFAULT '${def}'`;
      else if (typeof def === "boolean") defaultClause = `DEFAULT ${def ? 1 : 0}`;
    }

    // auto primary key
    if (info.meta?.auto) {
      if (this.driver === "sqlite") sqlType = "INTEGER PRIMARY KEY AUTOINCREMENT";
      if (this.driver === "postgres") sqlType = "SERIAL PRIMARY KEY";
      if (this.driver === "mysql") sqlType = "INTEGER AUTO_INCREMENT PRIMARY KEY";
      defaultClause = "";
    }

    colsSql.push(`"${col}" ${sqlType} ${isNullable} ${defaultClause}`.trim());

    if (info.meta?.index) {
      indexSql.push(`CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON "${table}"("${col}")`);
    }

    if (info.meta?.foreignKey) {
      const fkCol = col;
      const refTable = info.meta.foreignKey as string;
      const isOneToOne = !!info.meta["relationship onetoone"];
      if (!exists || this.driver !== "sqlite") {
        fkSql.push(`ALTER TABLE "${table}" ADD FOREIGN KEY ("${fkCol}") REFERENCES "${refTable}"(id)`);
        if (isOneToOne && this.driver !== "sqlite") {
          fkSql.push(`ALTER TABLE "${table}" ADD CONSTRAINT unique_${table}_${fkCol} UNIQUE ("${fkCol}")`);
        }
      }
    }
  }

  if (!exists) await this.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${colsSql.join(", ")})`);
  else {
    const existingCols = await this.getExistingColumns(table);
    for (const colDef of colsSql) {
      const colName = colDef.match(/["`]?(\w+)["`]?/)?.[1]?.toLowerCase();
      if (!colName || existingCols.includes(colName)) continue;
      try { await this.exec(`ALTER TABLE "${table}" ADD COLUMN ${colDef}`); } catch {}
    }
  }

  // indexes
  const existingIndexes = await this.getExistingIndexes(table);
  for (const idx of indexSql) {
    const idxName = idx.match(/idx_[^\s]+/)?.[0]?.toLowerCase() || "";
    if (existingIndexes.includes(idxName)) continue;
    try { await this.exec(idx); } catch {}
  }

  // foreign keys
  const existingFKs = await this.getExistingFKs(table);
  for (const fk of fkSql) {
    const fkName = fk.toLowerCase();
    if (existingFKs.includes(fkName)) continue;
    try { await this.exec(fk); } catch {}
  }
}

// ==== APPLY DEFAULTS TO EXISTING ROWS ====
private async applyDefaults(table: string, schema: Record<string, FieldInfo>) {
  for (const [col, info] of Object.entries(schema)) {
    if (!info.meta?.default) continue;
    const def = info.meta.default;
    if (def === null) continue;

    let value: string | number;
    if (def === "CURRENT_TIMESTAMP") {
      value = this.driver === "sqlite" ? "strftime('%s','now')" : "CURRENT_TIMESTAMP";
    } else if (typeof def === "boolean") {
      value = def ? 1 : 0;
    } else if (typeof def === "string") {
      value = `'${def}'`;
    } else {
      value = def as string | number;
    }

    await this.exec(`UPDATE "${table}" SET "${col}" = ${value} WHERE "${col}" IS NULL`);
  }
}



  // ==== TABLE CHECK ====
  private async tableExists(table: string): Promise<boolean> {
    let query = "";
    let params: any[] = [];
    switch (this.driver) {
      case "sqlite": query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`; break;
      case "postgres": query = `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename=$1`; params = [table]; break;
      case "mysql": query = `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name=?`; params = [table]; break;
    }
    const res = await this.exec(query, params);
    return res.rows?.length > 0;
  }

  private async getExistingColumns(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite": query = `PRAGMA table_info("${table}")`; break;
      case "postgres": query = `SELECT column_name FROM information_schema.columns WHERE table_name=$1`; break;
      case "mysql": query = `SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`; break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) => (r.name || r.column_name).toLowerCase());
  }

  private async getExistingIndexes(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite": query = `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`; break;
      case "postgres": query = `SELECT indexname FROM pg_indexes WHERE tablename=$1`; break;
      case "mysql": query = `SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`; break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) => (r.name || r.indexname).toLowerCase());
  }

  private async getExistingFKs(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite": query = `PRAGMA foreign_key_list("${table}")`; break;
      case "postgres": query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`; break;
      case "mysql": query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'`; break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);
    return (res.rows || []).map((r: any) => JSON.stringify(r).toLowerCase());
  }
}
