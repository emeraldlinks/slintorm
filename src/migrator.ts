// ==== IMPORTS ====
import type { ExecFn } from "./types.ts";
import { tsTypeToSqlType } from "./utils.js";
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

  constructor(exec: ExecFn, driver?: "sqlite" | "postgres" | "mysql") {
    this.exec = exec;
    if (driver) {
      this.driver = driver;
    } else {
      this.driver = "sqlite"; // default
    }
  }

  // ==== DETECT DRIVER ====

//   private detectDriver() {
// console.log("===detectDriver===")
// console.log("driver: ", this.driver)

//     const dbUrl = process.env.DATABASE_URL || "";
//     console.log(dbUrl)
//     if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))
//       this.driver = "postgres";
//     else if (dbUrl.startsWith("mysql://"))
//       this.driver = "mysql";
//     else
//       this.driver = "sqlite";
//   }

  // ==== MIGRATE FULL SCHEMA ====
  async migrateSchema(schema: Record<string, SchemaModel>) {

    for (const model of Object.values(schema)) {
      if (!model.table) continue;
      await this.ensureTable(model.table, model.fields);
    }
  }

  // ==== ENSURE TABLE EXISTS AND APPLY CHANGES ====
  async ensureTable(table: string, schema: Record<string, FieldInfo>) {
    table = table.toLowerCase();
    const exists = await this.tableExists(table);

    const colsSql: string[] = [];
    const indexSql: string[] = [];
    const fkSql: string[] = [];

    // ==== BUILD COLUMN, INDEX, FK SQL ====
    for (const [col, info] of Object.entries(schema)) {
      // Skip auto-increment PK if table exists
      
      if (info.meta?.auto && exists) {
        // console.log(`Skipping auto-increment primary key column "${col}" in existing table "${table}"`);
        continue;
      }

      let sqlType = tsTypeToSqlType(info.type);
      const isNullable = info.type.includes("undefined") ? "" : "NOT NULL";

      // ==== AUTO-INCREMENT PRIMARY KEY ====
      if (info.meta?.auto) {
        if (this.driver === "sqlite") sqlType = "INTEGER PRIMARY KEY AUTOINCREMENT";
        if (this.driver === "postgres") sqlType = "SERIAL PRIMARY KEY";
        if (this.driver === "mysql") sqlType = "INTEGER AUTO_INCREMENT PRIMARY KEY";
      }

      colsSql.push(`"${col}" ${sqlType} ${isNullable}`.trim());

      // ==== INDEXES ====
      if (info.meta?.index) {
        if (this.driver === "sqlite" || this.driver === "postgres" || this.driver === "mysql") {
          indexSql.push(`CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON "${table}"("${col}")`);
        } else {
          console.warn(`Index directive not supported on driver "${this.driver}" for column "${col}"`);
        }
      }

      // ==== FOREIGN KEYS ====
if (info.meta?.foreignKey) {
  const fkCol = col;
  const refTable = info.meta.foreignKey as string;

  // Check if it's one-to-one
  const isOneToOne = info.meta["relationship onetoone"] ? true : false;

  if (this.driver === "sqlite" && exists) {
    // SQLite cannot add FKs via ALTER TABLE if table exists
  } else if (this.driver === "postgres" || this.driver === "mysql" || (this.driver === "sqlite" && !exists)) {
    fkSql.push(`ALTER TABLE "${table}" ADD FOREIGN KEY ("${fkCol}") REFERENCES "${refTable}"(id)`);
    
    // For one-to-one, add unique constraint on FK
    if (isOneToOne) {
      if (this.driver === "postgres" || this.driver === "mysql") {
        fkSql.push(`ALTER TABLE "${table}" ADD CONSTRAINT unique_${table}_${fkCol} UNIQUE ("${fkCol}")`);
      } else if (this.driver === "sqlite" && !exists) {
        // For SQLite, unique can be in column definition at table creation
        const colIndex = colsSql.findIndex(c => c.startsWith(`"${fkCol}"`));
        if (colIndex >= 0) colsSql[colIndex] += " UNIQUE";
      }
    }
  } else {
    console.warn(`ForeignKey directive not supported on driver "${this.driver}" for column "${col}"`);
  }
}

    }

    // ==== CREATE TABLE ====
    if (!exists) {
      if (colsSql.length === 0) return;
      // console.log(`Creating table "${table}" with columns: ${colsSql.join(", ")}`);
      await this.exec(`CREATE TABLE "${table}" (${colsSql.join(", ")})`);
    } else {
      // ==== ALTER TABLE - ADD COLUMNS ====
      const existingCols = (await this.getExistingColumns(table)).map(c => c.toLowerCase());
      for (const colDef of colsSql) {
        const colName = colDef.match(/["`]?(\w+)["`]?/)?.[1]?.toLowerCase();
        if (!colName) continue;

        if (existingCols.includes(colName)) {
          // console.log(`Skipping existing column "${colName}" in table "${table}"`);
          continue;
        }

        // console.log(`Adding column "${colName}" to "${table}"`);
        try {
          await this.exec(`ALTER TABLE "${table}" ADD COLUMN ${colDef}`);
        } catch (err: any) {
          // console.warn(`Failed to add column "${colName}":`, err.message || err);
        }
      }
    }

    // ==== CREATE INDEXES ====
    const existingIndexes = await this.getExistingIndexes(table);
    for (const idx of indexSql) {
      const idxName = idx.match(/idx_[^\s]+/)?.[0]?.toLowerCase() || "";
      if (existingIndexes.includes(idxName)) {
        console.log(`Skipping existing index "${idxName}"`);
        continue;
      }
      try { 
        await this.exec(idx); 

      } catch (err){
        if (err instanceof Error)

        { console.warn("Index creation failed:", err.message || err); }
      }
    }

    // ==== CREATE FOREIGN KEYS ====
    const existingFKs = await this.getExistingFKs(table);
    for (const fk of fkSql) {
      const fkName = fk.toLowerCase();
      if (existingFKs.includes(fkName)) {
        // console.log(`Skipping existing foreign key: ${fk}`);
        continue;
      }
      try {
         await this.exec(fk); 
        } catch (err) {
          if (err instanceof Error)
           console.warn("Foreign key creation failed:", err.message || err);
           }
    }
  }

  // ==== CHECK IF TABLE EXISTS ====
  private async tableExists(table: string): Promise<boolean> {
  let query: string;
  let params: any[] = [];
  
  switch (this.driver) {
    case "sqlite":
      query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
      break;
    case "postgres":
      query = `SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND tablename=$1`;
      params = [table];
      break;
    case "mysql":
      query = `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name=?`;
      params = [table];
      break;
    default:
      query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
  }

  const res = await this.exec(query, params);
  return res.rows?.length > 0;
}


  // ==== GET EXISTING COLUMNS ====
  private async getExistingColumns(table: string): Promise<string[]> {
    let query: string;
    let params: any[] = [];

    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA table_info("${table}")`;
        break;
      case "postgres":
        query = `SELECT column_name AS name FROM information_schema.columns WHERE table_name=$1`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name=?`;
        params = [table];
        break;
      default:
        query = `PRAGMA table_info("${table}")`;
    }

    const info = await this.exec(query, params);
    const rows = info?.rows || [];

    return rows.map((r: any) => r.name.toLowerCase());
  }

  // ==== GET EXISTING INDEXES ====
  private async getExistingIndexes(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`;
        break;
      case "postgres":
        query = `SELECT indexname AS name FROM pg_indexes WHERE tablename=$1`;
        break;
      case "mysql":
        query = `SELECT index_name AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`;
        break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);

    return (res.rows || []).map((r: any) => r.name.toLowerCase());
  }

  // ==== GET EXISTING FOREIGN KEYS ====
  private async getExistingFKs(table: string): Promise<string[]> {
    let query = "";
    switch (this.driver) {
      case "sqlite":
        query = `PRAGMA foreign_key_list("${table}")`;
        break;
      case "postgres":
        query = `SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`;
        break;
      case "mysql":
        query = `SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'`;
        break;
    }
    const res = await this.exec(query, this.driver === "sqlite" ? [] : [table]);

    return (res.rows || []).map((r: any) => JSON.stringify(r).toLowerCase()); // crude but safe
  }
}
