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
  relatedKey?: string;
  through?: string;
  meta: Record<string, string | number | boolean | null>;
}

export interface SchemaModel {
  fields: Record<string, FieldInfo>;
  relations: any[];
  table?: string;
}

// Known relation directive key prefixes — checked with and without leading "@"
const RELATION_DIRECTIVE_ROOTS = [
  "relation",
  "relationship",
  "relation onetomany",
  "relation manytoone",
  "relation onetoone",
  "relation manytomany",
  "relationship onetomany",
  "relationship manytoone",
  "relationship onetoone",
  "relationship manytomany",
];

const RELATION_KEY_SET = new Set<string>([
  ...RELATION_DIRECTIVE_ROOTS,
  ...RELATION_DIRECTIVE_ROOTS.map((r) => `@${r}`),
]);

// ==== MIGRATOR CLASS ====
export class Migrator {
  private exec: ExecFn;
  private driver: "sqlite" | "postgres" | "mysql";

  // Per-instance so multiple Migrator instances / test runs don't share state
  private processedTables = new Set<string>();

  constructor(exec: ExecFn, driver?: "sqlite" | "postgres" | "mysql") {
    this.exec = exec;
    this.driver = driver || "sqlite";
  }

  // ----------------------------------------------------------------
  // Meta helpers — transparently handle both "key" and "@key" variants
  // so the migrator works regardless of whether the schema generator
  // strips the leading "@" from directive names or leaves it in.
  // ----------------------------------------------------------------

  private m(meta: Record<string, any> | undefined | null, key: string): any {
    if (!meta) return undefined;
    const v = meta[key];
    if (v !== undefined) return v;
    const vAt = meta[`@${key}`];
    if (vAt !== undefined) return vAt;
    return undefined;
  }

  private hasM(meta: Record<string, any> | undefined | null, key: string): boolean {
    return this.m(meta, key) !== undefined;
  }

  // ----------------------------------------------------------------
  // isRelationPlaceholder — returns true when the field exists only to
  // express a relation in the TypeScript interface and must NOT become a
  // DB column. Uses an exact-key set instead of a broad regex to avoid
  // false positives on field names that merely contain "relation".
  // ----------------------------------------------------------------

  private isRelationPlaceholder(info: FieldInfo): boolean {
    const keys = Object.keys(info.meta || {});
    return keys.some((k) => RELATION_KEY_SET.has(k.toLowerCase()));
  }

  // ----------------------------------------------------------------
  // migrateSchema — top-level entry point
  // ----------------------------------------------------------------

  async migrateSchema(schema: Record<string, SchemaModel>) {
    // Auto-create pivot/junction tables for many-to-many relations when
    // a `through` name is provided but no explicit model exists for it.
    for (const [name, model] of Object.entries(schema)) {
      for (const r of model.relations || []) {
        if (r.kind !== "manytomany" || !r.through) continue;
        const pivot = String(r.through);
        if (schema[pivot]) continue;

        const leftFk  = r.foreignKey  || this.m(r.meta, "foreignKey")  || `${name.toLowerCase()}Id`;
        const rightFk = r.relatedKey  || this.m(r.meta, "relatedKey")  || `${String(r.targetModel).toLowerCase()}Id`;

        schema[pivot] = {
          fields: {
            id:         { type: "number", meta: { primaryKey: true, auto: true } },
            [leftFk]:   { type: "number", meta: { index: true } },
            [rightFk]:  { type: "number", meta: { index: true } },
          },
          relations: [],
          table: pivot,
        } as any;
      }
    }

    for (const [name, model] of Object.entries(schema)) {
      if (!model.table) model.table = name.toLowerCase();
      this.ensureTimestamps(model);
      await this.ensureTable(model.table, model.fields, model.relations || []);
      await this.applyDefaults(model.table, model.fields);
    }
  }

  // ----------------------------------------------------------------
  // ensureTimestamps — adds createdAt / updatedAt always, and deletedAt
  // only when the model explicitly uses @softDelete so clean tables stay
  // clean.
  // ----------------------------------------------------------------

  private ensureTimestamps(model: SchemaModel) {
    const fields = model.fields;

    if (!fields.createdAt) {
      fields.createdAt = { type: "string", meta: { default: "CURRENT_TIMESTAMP", index: true } };
    }
    if (!fields.updatedAt) {
      fields.updatedAt = { type: "string", meta: { default: "CURRENT_TIMESTAMP", index: true } };
    }

    const hasSoftDelete = Object.values(fields).some((f) => this.hasM(f.meta, "softDelete"));
    if (hasSoftDelete && !fields.deletedAt) {
      fields.deletedAt = { type: "string", meta: { nullable: true, index: true, default: null } };
    }
  }

  // ----------------------------------------------------------------
  // ensureTable — create or alter a table to match the schema
  // ----------------------------------------------------------------

  async ensureTable(
    table: string,
    schema: Record<string, FieldInfo>,
    relations?: Relation[]
  ) {
    table = table.toLowerCase();
    if (this.processedTables.has(table)) return;

    // Heuristic: ensure `id` gets PK + auto when the generator left them out
    if (schema["id"] && schema["id"].meta) {
      if (!this.hasM(schema["id"].meta, "primaryKey")) schema["id"].meta.primaryKey = true;
      if (!this.hasM(schema["id"].meta, "auto"))       schema["id"].meta.auto       = true;
    }

    const exists = await this.tableExists(table);

    const colsSql:            string[] = [];
    const indexSql:           string[] = [];
    const inlineConstraints:  string[] = [];
    const postConstraints:    string[] = [];
    const commentSql:         string[] = [];
    let   primaryDeclared              = false;

    for (const [col, info] of Object.entries(schema)) {
      if (!info?.type) continue;

      // Skip relation placeholder fields (user?: User, posts?: Post[], etc.)
      if (this.isRelationPlaceholder(info)) continue;

      // Skip generator artefacts where the field's type is a bare number
      // (e.g. a stray `length` field produced by `@length:255`)
      const typeStr = String(info.type).trim();
      if (/^\(?\d+\)?$/.test(typeStr)) continue;

      const meta = info.meta || {};

      // ---- SQL TYPE --------------------------------------------------
      let sqlType = "";

      const enumVal = this.m(meta, "enum");
      const isJson  = this.hasM(meta, "json");

      if (enumVal) {
        const enumValues = this.parseEnumValues(String(enumVal));
        sqlType = this.driver === "postgres"
          ? await this.createEnumColumn(table, col, enumValues)
          : "VARCHAR(255)";
      } else if (isJson) {
        sqlType =
          this.driver === "postgres" ? "JSONB"
          : this.driver === "sqlite"  ? "TEXT"
          : "JSON";
      } else if (
        info.type === "Date" ||
        (info.type === "string" && col.toLowerCase().endsWith("at"))
      ) {
        // Store date/timestamp columns as TEXT on SQLite (ISO-8601 strings)
        // so sub-second precision is preserved and sorting still works.
        sqlType =
          this.driver === "sqlite"   ? "TEXT"
          : this.driver === "postgres" ? "TIMESTAMPTZ"
          : "DATETIME";
      } else {
        sqlType = tsTypeToSqlType(info.type);
        const lengthVal = this.m(meta, "length");
        if (lengthVal && /char|varchar/i.test(sqlType)) {
          sqlType = sqlType.replace(/\(.+\)$/, "") + `(${lengthVal})`;
        }
      }

      // ---- NULLABILITY -----------------------------------------------
      // A column is nullable when ANY of these are true:
      //   • @nullable / nullable meta is present
      //   • The TS type includes "undefined" (optional field marked with ?)
      //   • It is an enum without an explicit default
      //       (avoids NOT NULL failures on existing rows during migration)
      //   • It has @softDelete
      //
      // A column is NOT NULL when:
      //   • @unique is present (unique columns must be NOT NULL)
      //   • "not null" / "notnull" is explicitly set in meta
      //   • none of the nullable conditions above apply

      const isNullableMeta   = this.hasM(meta, "nullable");
      const isOptionalType   = typeStr.includes("undefined");
      const isSoftDelete     = this.hasM(meta, "softDelete");
      const isEnumNoDefault  = !!enumVal && this.m(meta, "default") === undefined;
      const isUnique         = this.hasM(meta, "unique");
      const isExplicitNotNull =
        this.hasM(meta, "not null") ||
        this.hasM(meta, "notnull")  ||
        meta["not null"] === true   ||
        meta["notnull"]  === true;

      // Unique columns are implicitly NOT NULL regardless of other flags
      let isNullable: boolean;
      if (isUnique) {
        isNullable = false;
      } else if (isExplicitNotNull) {
        isNullable = false;
      } else {
        isNullable = isNullableMeta || isOptionalType || isSoftDelete || isEnumNoDefault;
      }

      const nullFrag = isNullable ? "" : "NOT NULL";

      // ---- DEFAULT ---------------------------------------------------
      let defaultClause = "";
      const defVal = this.m(meta, "default");

      if (defVal !== undefined && defVal !== null) {
        if (defVal === "CURRENT_TIMESTAMP") {
          defaultClause =
            this.driver === "sqlite"
              ? "DEFAULT (datetime('now'))"
              : "DEFAULT CURRENT_TIMESTAMP";
        } else if (typeof defVal === "boolean") {
          defaultClause = `DEFAULT ${defVal ? 1 : 0}`;
        } else if (typeof defVal === "string") {
          defaultClause = `DEFAULT '${defVal}'`;
        } else {
          defaultClause = `DEFAULT ${defVal}`;
        }
      }

      const defaultFn = this.m(meta, "defaultFn");
      if (defaultFn) defaultClause = `DEFAULT ${defaultFn}`;

      const jsonDefault = this.m(meta, "jsonDefault");
      if (isJson && jsonDefault) defaultClause = `DEFAULT '${JSON.stringify(jsonDefault)}'`;

      if (isSoftDelete && !defaultClause) defaultClause = "DEFAULT NULL";

      if (this.hasM(meta, "onUpdateNow") && this.driver === "mysql") {
        defaultClause = defaultClause
          ? `${defaultClause} ON UPDATE CURRENT_TIMESTAMP`
          : "ON UPDATE CURRENT_TIMESTAMP";
      }

      // ---- GENERATED / COLLATE / CHECK -------------------------------
      const generatedAlways = this.m(meta, "generatedAlways");
      const generated = generatedAlways
        ? `GENERATED ALWAYS AS (${generatedAlways}) STORED`
        : "";

      const collateVal = this.m(meta, "collate");
      const collate    = collateVal ? `COLLATE ${collateVal}` : "";

      const checkVal = this.m(meta, "check");
      const check    = checkVal ? `CHECK (${checkVal})` : "";

      // ---- PRIMARY KEY -----------------------------------------------
      let pkFragment = "";
      if (this.hasM(meta, "auto") && !primaryDeclared) {
        if (this.driver === "sqlite") {
          sqlType    = "INTEGER";
          pkFragment = "PRIMARY KEY AUTOINCREMENT";
        } else if (this.driver === "postgres") {
          sqlType    = "SERIAL";
          pkFragment = "PRIMARY KEY";
        } else {
          sqlType    = "INTEGER";
          pkFragment = "AUTO_INCREMENT PRIMARY KEY";
        }
        primaryDeclared = true;
      } else if (this.m(meta, "primaryKey") === true && !primaryDeclared) {
        pkFragment      = "PRIMARY KEY";
        primaryDeclared = true;
      }

      // ---- ASSEMBLE COL DEF -----------------------------------------
      const parts = [
        `"${col}"`,
        sqlType,
        pkFragment,
        nullFrag,
        defaultClause,
        generated,
        collate,
        check,
      ]
        .filter(Boolean)
        .join(" ");

      colsSql.push(parts);

      // ---- COLUMN COMMENT (Postgres) ---------------------------------
      const comment = this.m(meta, "comment");
      if (comment && this.driver === "postgres") {
        commentSql.push(
          `COMMENT ON COLUMN "${table}"."${col}" IS '${String(comment).replace(/'/g, "''")}'`
        );
      }

      // ---- INDEX (single-column) ------------------------------------
      // Supports @index, @index:unique, @index:where:condition
      const indexVal = this.m(meta, "index");
      if (indexVal) {
        const indexStr = String(indexVal);
        let uniquePrefix = "";
        let whereClause = "";
        if (indexStr.includes("unique") || indexStr.includes(":unique")) {
          uniquePrefix = "UNIQUE ";
        }
        const whereMatch = indexStr.match(/where:(.+)/i);
        if (whereMatch) {
          whereClause = ` WHERE ${whereMatch[1]}`;
        }
        indexSql.push(
          `CREATE ${uniquePrefix}INDEX IF NOT EXISTS idx_${table}_${col} ON "${table}"("${col}")${whereClause}`
        );
      }

      // ---- UNIQUE CONSTRAINT ----------------------------------------
      if (isUnique) {
        if (!exists) {
          inlineConstraints.push(
            `CONSTRAINT unq_${table}_${col} UNIQUE ("${col}")`
          );
        } else {
          postConstraints.push(
            `ALTER TABLE "${table}" ADD CONSTRAINT unq_${table}_${col} UNIQUE ("${col}")`
          );
        }
      }

      // ---- Polymorphic fields (type + ID) ---------------------------
      const polyType = this.m(meta, "polymorphicType");
      const polyId = this.m(meta, "polymorphicId");
      if (polyType && polyId) {
        // These fields are handled by the relation system
      }

      // ---- INLINE FK (from field-level meta, not the relations array) -
      const fkRef = this.m(meta, "foreignKey");
      if (fkRef) {
        const onDelete   = this.m(meta, "onDelete");
        const onUpdate   = this.m(meta, "onUpdate");
        const matchVal   = this.m(meta, "match");
        const deferrable = this.hasM(meta, "deferrable");

        const fkStmt =
          `FOREIGN KEY ("${col}") REFERENCES "${fkRef}"(id)` +
          (onDelete   ? ` ON DELETE ${onDelete}`  : "") +
          (onUpdate   ? ` ON UPDATE ${onUpdate}`  : "") +
          (matchVal   ? ` MATCH ${matchVal}`      : "") +
          (deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");

        if (!exists) inlineConstraints.push(fkStmt);
        else         postConstraints.push(`ALTER TABLE "${table}" ADD ${fkStmt}`);
      }
    }

    // ---- CREATE OR ALTER TABLE --------------------------------------
    if (!exists) {
      // Fallback PK: if no PK was declared and an `id` column exists,
      // make it AUTOINCREMENT so SQLite last_insert_rowid() works reliably.
      if (!primaryDeclared && this.driver === "sqlite") {
        const idIdx = colsSql.findIndex((c) => c.startsWith('"id"'));
        if (idIdx >= 0) {
          colsSql[idIdx] += " PRIMARY KEY AUTOINCREMENT";
          primaryDeclared = true;
        }
      }

      const createSQL =
        `CREATE TABLE IF NOT EXISTS "${table}" (\n` +
        colsSql.concat(inlineConstraints).join(",\n") +
        `\n);`;
      await this.exec(createSQL);
    } else {
      const existingCols = await this.getExistingColumns(table);

      // Build the set of valid column names from this schema run so we can
      // drop any orphan columns that an earlier, buggier migrator version
      // accidentally created (e.g. a stray "fields" or "relations" column).
      const validCols = new Set(
        colsSql
          .map((c) => c.match(/^"([^"]+)"/)?.[1]?.toLowerCase())
          .filter(Boolean) as string[]
      );

      // Drop orphan columns (SQLite 3.35+, Postgres, MySQL 8.0.29+)
      for (const existingCol of existingCols) {
        if (validCols.has(existingCol)) continue;
        // Never drop timestamp / soft-delete columns automatically
        if (["createdat", "updatedat", "deletedat"].includes(existingCol)) continue;
        try {
          await this.exec(`ALTER TABLE "${table}" DROP COLUMN "${existingCol}"`);
        } catch {
          // Older SQLite versions don't support DROP COLUMN — that's fine
        }
      }

      // ---- Column rename via @rename:oldName --------------------------
      for (const [col, info] of Object.entries(schema)) {
        const renameVal = this.m(info?.meta, "rename");
        if (renameVal) {
          const oldName = String(renameVal).toLowerCase();
          if (existingCols.includes(oldName) && !existingCols.includes(col.toLowerCase())) {
            try {
              await this.exec(`ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${col}"`);
            } catch {
              // Fallback: some databases don't support RENAME COLUMN
            }
          }
        }
      }

      // Add missing columns — never touch existing ones
      for (const colDef of colsSql) {
        const m = colDef.match(/^"([^"]+)"/);
        if (!m) continue;
        const colName = m[1].toLowerCase();
        if (existingCols.includes(colName)) continue;

        // SQLite cannot add a NOT NULL column without a DEFAULT to an
        // existing table. Inject a safe default when none is present.
        let safeColDef = colDef.replace(/\s+PRIMARY KEY(\s+AUTOINCREMENT)?/i, "");
        if (
          this.driver === "sqlite" &&
          /NOT NULL/i.test(safeColDef) &&
          !/DEFAULT/i.test(safeColDef)
        ) {
          safeColDef = safeColDef.replace(/NOT NULL/i, "NOT NULL DEFAULT ''");
        }

        try {
          await this.exec(`ALTER TABLE "${table}" ADD COLUMN ${safeColDef}`);
        } catch {
          // Ignore duplicate-column errors on concurrent runs
        }
      }
    }

    this.processedTables.add(table);

    // ---- COMMENTS (Postgres) ----------------------------------------
    for (const c of commentSql) {
      try { await this.exec(c); } catch {}
    }

    // ---- INDEXES (single-column) ------------------------------------
    const existingIndexes = await this.getExistingIndexes(table);
    for (const idx of indexSql) {
      const idxName = (idx.match(/(?:idx_|unq_)[^\s]+/)?.[0] || "").toLowerCase();
      if (!idxName || existingIndexes.includes(idxName)) continue;
      try { await this.exec(idx); } catch {}
    }

    // ---- Multi-column indexes (from @index:(col1,col2) meta) -------
    const compositeIndexes: { cols: string[]; unique: boolean; where?: string }[] = [];
    for (const [col, info] of Object.entries(schema)) {
      const indexVal = this.m(info?.meta, "index");
      if (!indexVal) continue;
      const indexStr = String(indexVal);
      const parenMatch = indexStr.match(/^\((.+)\)$/);
      if (!parenMatch) continue;
      // This field defines a composite index: the field itself + other columns
      const otherCols = parenMatch[1].split(",").map(c => c.trim()).filter(Boolean);
      const allCols = [col, ...otherCols.filter(c => c !== col)];
      const unique = indexStr.includes("unique") || indexStr.includes(":unique");
      const whereMatch = indexStr.match(/where:(.+)/i);
      compositeIndexes.push({
        cols: allCols,
        unique,
        where: whereMatch ? whereMatch[1] : undefined,
      });
    }
    for (const ci of compositeIndexes) {
      const idxName = `idx_${table}_${ci.cols.join("_")}`.toLowerCase();
      if (existingIndexes.includes(idxName)) continue;
      const uniquePrefix = ci.unique ? "UNIQUE " : "";
      const whereClause = ci.where ? ` WHERE ${ci.where}` : "";
      const cols = ci.cols.map(c => `"${c}"`).join(", ");
      try {
        await this.exec(`CREATE ${uniquePrefix}INDEX IF NOT EXISTS "${idxName}" ON "${table}"(${cols})${whereClause}`);
      } catch {}
    }

    // ---- FK CONSTRAINTS FROM THE RELATIONS ARRAY --------------------
    if (relations?.length) {
      const existingFKs = await this.getExistingFKs(table);
      await Promise.all(
        relations.map(async (rel) => {
          const fkCol    = rel.foreignKey;
          const refTable = String(rel.targetModel || "").toLowerCase();
          if (!fkCol || !refTable) return;
          if (!(await this.tableExists(refTable))) return;

          const onDelete   = rel.meta?.onDelete;
          const onUpdate   = rel.meta?.onUpdate;
          const matchVal   = rel.meta?.match;
          const deferrable = rel.meta?.deferrable;

          const fkStatement =
            `ALTER TABLE "${table}" ADD FOREIGN KEY ("${fkCol}") REFERENCES "${refTable}"(id)` +
            (onDelete   ? ` ON DELETE ${onDelete}`  : "") +
            (onUpdate   ? ` ON UPDATE ${onUpdate}`  : "") +
            (matchVal   ? ` MATCH ${matchVal}`      : "") +
            (deferrable ? " DEFERRABLE INITIALLY DEFERRED" : "");

          const uniqueStatement =
            rel.kind === "onetoone" && this.driver !== "sqlite"
              ? `ALTER TABLE "${table}" ADD CONSTRAINT unique_${table}_${fkCol} UNIQUE ("${fkCol}")`
              : null;

          if (!existingFKs.includes(fkStatement.toLowerCase())) {
            try { await this.exec(fkStatement); } catch {}
          }
          if (
            uniqueStatement &&
            !existingFKs.includes(uniqueStatement.toLowerCase())
          ) {
            try { await this.exec(uniqueStatement); } catch {}
          }
        })
      );
    }

    // ---- POST-CREATE CONSTRAINTS (unique / FK on existing tables) ---
    const existingFKsNow = await this.getExistingFKs(table);
    for (const fk of postConstraints) {
      if (existingFKsNow.includes(fk.toLowerCase())) continue;
      try { await this.exec(fk); } catch {}
    }
  }

  // ----------------------------------------------------------------
  // applyDefaults — back-fill NULL values for columns that have a
  // non-null default. Skips tables with no defaults.
  // ----------------------------------------------------------------

  private async applyDefaults(table: string, schema: Record<string, FieldInfo>) {
    for (const [col, info] of Object.entries(schema)) {
      const def = this.m(info.meta, "default");
      if (def === undefined || def === null) continue;

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

      try {
        await this.exec(
          `UPDATE "${table}" SET "${col}" = ${value} WHERE "${col}" IS NULL`
        );
      } catch {}
    }
  }

  // ----------------------------------------------------------------
  // Enum helpers
  // ----------------------------------------------------------------

  private parseEnumValues(enumMeta: string): string[] {
    const cleaned = String(enumMeta).replace(/^[\(\s]+|[\)\s]+$/g, "");
    return cleaned.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  }

  private async createEnumColumn(
    table: string,
    col: string,
    values: string[]
  ): Promise<string> {
    if (this.driver !== "postgres") return `"${table}_${col}_enum"`;
    const typeName = `${table}_${col}_enum`;
    try {
      const res = (await this.exec(
        `SELECT 1 FROM pg_type WHERE typname = $1`,
        [typeName]
      )) as any;
      if (!res.rows?.length) {
        const vals = values
          .map((v) => `'${v.replace(/'/g, "''")}'`)
          .join(", ");
        await this.exec(`CREATE TYPE "${typeName}" AS ENUM (${vals})`);
      }
    } catch {}
    return `"${typeName}"`;
  }

  // ----------------------------------------------------------------
  // diffSchema — dry-run: returns the SQL statements that would be
  // executed without applying them.
  // ----------------------------------------------------------------

  async diffSchema(table: string, schema: Record<string, FieldInfo>, relations?: Relation[], dryRun = false): Promise<string[]> {
    const statements: string[] = [];
    const tableLower = table.toLowerCase();
    const exists = await this.tableExists(tableLower);

    if (!exists) {
      // Create table
      const colsSql: string[] = [];
      const inlineConstraints: string[] = [];
      for (const [col, info] of Object.entries(schema)) {
        if (!info?.type) continue;
        if (this.isRelationPlaceholder(info)) continue;
        const colDef = await this._buildColumnDef(tableLower, col, info, false);
        if (colDef) colsSql.push(colDef);
      }
      if (colsSql.length) {
        statements.push(`CREATE TABLE IF NOT EXISTS "${tableLower}" (\n${colsSql.concat(inlineConstraints).join(",\n")}\n);`);
      }
    } else {
      const existingCols = await this.getExistingColumns(tableLower);
      for (const [col, info] of Object.entries(schema)) {
        if (!info?.type) continue;
        if (this.isRelationPlaceholder(info)) continue;
        const colName = col.toLowerCase();
        if (!existingCols.includes(colName)) {
          const colDef = await this._buildColumnDef(tableLower, col, info, true);
          if (colDef) statements.push(`ALTER TABLE "${tableLower}" ADD COLUMN ${colDef};`);
        }
      }
    }

    if (!dryRun) return [];
    return statements;
  }

  private async _buildColumnDef(table: string, col: string, info: FieldInfo, forAlter: boolean): Promise<string | null> {
    const meta = info.meta || {};
    let sqlType = "";
    const enumVal = this.m(meta, "enum");
    const isJson = this.hasM(meta, "json");
    if (enumVal) {
      const enumValues = this.parseEnumValues(String(enumVal));
      sqlType = this.driver === "postgres" ? `"${table}_${col}_enum"` : "VARCHAR(255)";
    } else if (isJson) {
      sqlType = this.driver === "postgres" ? "JSONB" : this.driver === "sqlite" ? "TEXT" : "JSON";
    } else if (info.type === "Date" || (info.type === "string" && col.toLowerCase().endsWith("at"))) {
      sqlType = this.driver === "sqlite" ? "TEXT" : this.driver === "postgres" ? "TIMESTAMPTZ" : "DATETIME";
    } else {
      sqlType = tsTypeToSqlType(info.type);
    }
    if (!sqlType) return null;
    return `"${col}" ${sqlType}`;
  }

  // ----------------------------------------------------------------
  // Introspection helpers
  // ----------------------------------------------------------------

  private async tableExists(table: string): Promise<boolean> {
    let query = "";
    let params: any[] = [];
    switch (this.driver) {
      case "sqlite":
        query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
        break;
      case "postgres":
        query = `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename=$1`;
        params = [table];
        break;
      case "mysql":
        query = `SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`;
        params = [table];
        break;
    }
    const res = await this.exec(query, params);
    return (res.rows?.length ?? 0) > 0;
  }

  private async getExistingColumns(table: string): Promise<string[]> {
    let res: any;
    switch (this.driver) {
      case "sqlite":
        res = await this.exec(`PRAGMA table_info("${table}")`);
        return (res.rows || []).map((r: any) => String(r.name).toLowerCase());
      case "postgres":
        res = await this.exec(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.column_name).toLowerCase()
        );
      case "mysql":
        res = await this.exec(
          `SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.column_name).toLowerCase()
        );
    }
    return [];
  }

  private async getExistingIndexes(table: string): Promise<string[]> {
    let res: any;
    switch (this.driver) {
      case "sqlite":
        res = await this.exec(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`
        );
        return (res.rows || []).map((r: any) => String(r.name).toLowerCase());
      case "postgres":
        res = await this.exec(
          `SELECT indexname FROM pg_indexes WHERE tablename=$1`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.indexname).toLowerCase()
        );
      case "mysql":
        res = await this.exec(
          `SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.index_name).toLowerCase()
        );
    }
    return [];
  }

  private async getExistingFKs(table: string): Promise<string[]> {
    let res: any;
    switch (this.driver) {
      case "sqlite":
        res = await this.exec(`PRAGMA foreign_key_list("${table}")`);
        return (res.rows || []).map((r: any) =>
          JSON.stringify(r).toLowerCase()
        );
      case "postgres":
        res = await this.exec(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.constraint_name).toLowerCase()
        );
      case "mysql":
        res = await this.exec(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='FOREIGN KEY'`,
          [table]
        );
        return (res.rows || []).map((r: any) =>
          String(r.constraint_name).toLowerCase()
        );
    }
    return [];
  }
}