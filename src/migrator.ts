// ==== IMPORTS ====
import type { ExecFn } from "./types";
import { tsTypeToSqlType } from "./utils";

// ==== INTERFACES ====
interface FieldInfo {
  type: string;
  meta?: Record<string, string | boolean>;
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

  constructor(exec: ExecFn, driver: "sqlite" | "postgres" | "mysql" = "sqlite") {
    this.exec = exec;
    this.driver = driver;
  }

  // ==== MIGRATE FULL SCHEMA ====
  async migrateSchema(schema: Record<string, SchemaModel>) {
    for (const model of Object.values(schema)) {
      if (!model.table) continue;
      await this.ensureTable(model.table, model.fields);
    }
  }

  // ==== ENSURE TABLE EXISTS OR APPLY CHANGES ====
   async ensureTable(table: string, schema: Record<string, FieldInfo>) {
    table = table.toLowerCase();
    const exists = await this.tableExists(table);

    const colsSql: string[] = [];
    const indexSql: string[] = [];
    const fkSql: string[] = [];

    // ==== BUILD COLUMN, INDEX, FK SQL ====
    for (const [col, info] of Object.entries(schema)) {
      const meta = info.meta || {};

      // Skip adding auto fields for existing tables
      if (meta.auto && exists) continue;

      let sqlType = tsTypeToSqlType(info.type);
      const isNullable = info.type.includes("undefined") ? "" : "NOT NULL";

      // ==== AUTO-INCREMENT / PRIMARY KEYS ====
      if (meta.auto) {
        if (this.driver === "sqlite") sqlType = "INTEGER PRIMARY KEY AUTOINCREMENT";
        else if (this.driver === "postgres") sqlType = "SERIAL PRIMARY KEY";
        else if (this.driver === "mysql") sqlType = "INTEGER AUTO_INCREMENT PRIMARY KEY";
      }

      colsSql.push(`"${col}" ${sqlType} ${isNullable}`.trim());

      // ==== INDEXES ====
      if (meta.index) {
        indexSql.push(
          `CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON "${table}" ("${col}")`
        );
      }

      // ==== FOREIGN KEYS ====
      const fkTarget = meta.foreignKey as string | undefined;
      const isOneToOne = !!meta["relationship onetoone"];
      if (fkTarget) {
        const fkCol = col;
        const refTable = fkTarget.toLowerCase();

        if (this.driver === "sqlite" && exists) {
          // SQLite can’t ALTER TABLE to add FKs
          continue;
        }

        fkSql.push(
          `ALTER TABLE "${table}" ADD FOREIGN KEY ("${fkCol}") REFERENCES "${refTable}"(id)`
        );

        // Unique constraint for one-to-one relationships
        if (isOneToOne) {
          if (this.driver === "postgres" || this.driver === "mysql") {
            fkSql.push(
              `ALTER TABLE "${table}" ADD CONSTRAINT unique_${table}_${fkCol} UNIQUE ("${fkCol}")`
            );
          } else if (this.driver === "sqlite" && !exists) {
            const idx = colsSql.findIndex(c => c.startsWith(`"${fkCol}"`));
            if (idx >= 0) colsSql[idx] += " UNIQUE";
          }
        }
      }
    }

    // ==== CREATE OR UPDATE TABLE ====
    if (!exists) {
      if (colsSql.length === 0) return;
      await this.exec(`CREATE TABLE "${table}" (${colsSql.join(", ")})`);
    } else {
      // ==== ALTER TABLE - ADD NEW COLUMNS ====
      const existingCols = (await this.getExistingColumns(table)).map(c => c.toLowerCase());
      for (const colDef of colsSql) {
        const colName = colDef.match(/["`]?(\w+)["`]?/)?.[1]?.toLowerCase();
        if (!colName || existingCols.includes(colName)) continue;

        try {
          await this.exec(`ALTER TABLE "${table}" ADD COLUMN ${colDef}`);
        } catch (err: any) {
          console.warn(`Failed to add column "${colName}":`, err.message || err);
        }
      }
    }

    // ==== CREATE INDEXES ====
    const existingIndexes = await this.getExistingIndexes(table);
    for (const idx of indexSql) {
      const idxName = idx.match(/idx_[^\s]+/)?.[0]?.toLowerCase() || "";
      if (existingIndexes.includes(idxName)) continue;

      try {
        await this.exec(idx);
      } catch (err: any) {
        console.warn("Index creation failed:", err.message || err);
      }
    }

    // ==== CREATE FOREIGN KEYS ====
    const existingFKs = await this.getExistingFKs(table);
    for (const fk of fkSql) {
      const fkText = fk.toLowerCase();
      if (existingFKs.some(f => fkText.includes(f))) continue;

      try {
        await this.exec(fk);
      } catch (err: any) {
        console.warn("Foreign key creation failed:", err.message || err);
      }
    }
  }

  // ==== CHECK IF TABLE EXISTS ====
  private async tableExists(table: string): Promise<boolean> {
    let query = "";
    let params: any[] = [];

    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
        break;
      case "postgres":
        query = `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND tablename=$1`;
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

  // ==== GET EXISTING COLUMNS ====
  private async getExistingColumns(table: string): Promise<string[]> {
    let query = "";
    let params: any[] = [];

    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA table_info("${table}")`;
        break;
      case "postgres":
        query = `SELECT column_name FROM information_schema.columns WHERE table_name=$1`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name=?`;
        params = [table];
        break;
    }

    const res = await this.exec(query, params);
    const rows = res?.rows || [];
    return rows.map((r: any) => (r.name || r.column_name).toLowerCase());
  }

  // ==== GET EXISTING INDEXES ====
  private async getExistingIndexes(table: string): Promise<string[]> {
    let query = "";
    let params: any[] = [];

    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`;
        break;
      case "postgres":
        query = `SELECT indexname FROM pg_indexes WHERE tablename=$1`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`;
        params = [table];
        break;
    }

    const res = await this.exec(query, params);
    const rows = res?.rows || [];
    return rows.map((r: any) => (r.name || r.indexname || r.index_name).toLowerCase());
  }

  // ==== GET EXISTING FOREIGN KEYS ====
  private async getExistingFKs(table: string): Promise<string[]> {
    let query = "";
    let params: any[] = [];

    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA foreign_key_list("${table}")`;
        break;
      case "postgres":
        query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'`;
        params = [table];
        break;
    }

    const res = await this.exec(query, params);
    const rows = res?.rows || [];
    return rows.map((r: any) =>
      (r.name || r.constraint_name || JSON.stringify(r)).toLowerCase()
    );
  }
}
