// ==== ORM DATABASE ERROR ====
// Wraps raw driver errors into readable, actionable messages.
// Works for SQLite, Postgres, and MySQL.

export type ORMErrorCode =
  | "UNIQUE_VIOLATION"
  | "NOT_NULL_VIOLATION"
  | "FOREIGN_KEY_VIOLATION"
  | "CHECK_VIOLATION"
  | "UNKNOWN_CONSTRAINT";

export interface ORMErrorMeta {
  code:    ORMErrorCode;
  table?:  string;
  column?: string;
  value?:  any;
  sql?:    string;
  params?: any[];
}

export class ORMError extends Error {
  readonly ormCode:  ORMErrorCode;
  readonly table?:   string;
  readonly column?:  string;
  readonly value?:   any;
  readonly sql?:     string;
  readonly params?:  any[];
  readonly original: unknown;

  constructor(message: string, meta: ORMErrorMeta, original: unknown) {
    super(message);
    this.name     = "ORMError";
    this.ormCode  = meta.code;
    this.table    = meta.table;
    this.column   = meta.column;
    this.value    = meta.value;
    this.sql      = meta.sql;
    this.params   = meta.params;
    this.original = original;
  }
}

// ----------------------------------------------------------------
// extractColIndexFromSql
// Parses the column list from an INSERT/UPDATE statement and returns
// the zero-based index of the named column so we can pull its value
// from the params array.
//
// INSERT INTO "users" ("name", "email", "createdAt") VALUES (?, ?, ?)
//                      ^^^^^^  ^^^^^^^  ^^^^^^^^^^^
// ----------------------------------------------------------------

function extractColIndexFromSql(sql: string, column: string): number {
  // Match column list between the first pair of parens before VALUES
  const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
  if (!colMatch) return -1;

  const cols = colMatch[1]
    .split(",")
    .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase());

  return cols.findIndex((c) => c === column.toLowerCase());
}

// ----------------------------------------------------------------
// extractTableCol
// Parses table and column names out of driver error messages.
// ----------------------------------------------------------------

function extractTableCol(
  msg:    string,
  driver: "sqlite" | "postgres" | "mysql",
  kind:   "unique" | "notnull" | "fk" | "check"
): { table?: string; column?: string } {

  // ---- SQLite -------------------------------------------------------
  // All constraint types: "CONSTRAINT failed: tablename.columnname"
  // FK is the exception — no table.column in the message.
  if (driver === "sqlite") {
    const m = msg.match(/failed:\s+([a-z0-9_]+)\.([a-z0-9_]+)/i);
    if (m) return { table: m[1], column: m[2] };
    return {};
  }

  // ---- Postgres -----------------------------------------------------
  if (driver === "postgres") {
    switch (kind) {
      case "unique": {
        // 'duplicate key value violates unique constraint "unq_users_email"'
        // DETAIL: 'Key (email)=(jj@test.com) already exists.'
        const col = msg.match(/Key\s*\(([^)]+)\)\s*=/i);
        const tbl = msg.match(/on table\s+"([^"]+)"/i)
                 ?? msg.match(/relation\s+"([^"]+)"/i);
        return { table: tbl?.[1], column: col?.[1] };
      }
      case "notnull": {
        // 'null value in column "name" of relation "users" violates not-null constraint'
        const m = msg.match(/column\s+"([^"]+)"\s+of\s+relation\s+"([^"]+)"/i);
        return { table: m?.[2], column: m?.[1] };
      }
      case "fk": {
        // 'insert or update on table "post" violates foreign key constraint ...'
        // DETAIL: 'Key (userId)=(999) is not present in table "users".'
        const tbl = msg.match(/on table\s+"([^"]+)"/i);
        const col = msg.match(/Key\s*\(([^)]+)\)\s*=/i);
        return { table: tbl?.[1], column: col?.[1] };
      }
      case "check": {
        // 'new row for relation "users" violates check constraint "..."'
        const tbl = msg.match(/relation\s+"([^"]+)"/i);
        return { table: tbl?.[1] };
      }
    }
  }

  // ---- MySQL --------------------------------------------------------
  if (driver === "mysql") {
    switch (kind) {
      case "unique": {
        // "Duplicate entry 'val' for key 'table.index_name'"
        // index_name is usually the column name or uniq_table_col
        const m = msg.match(/for key\s+'([^.]+)\.([^']+)'/i);
        if (m) return { table: m[1], column: m[2] };
        // fallback: "for key 'index_name'" without table prefix
        const m2 = msg.match(/for key\s+'([^']+)'/i);
        return { column: m2?.[1] };
      }
      case "notnull": {
        // "Column 'name' cannot be null"
        const m = msg.match(/Column\s+'([^']+)'\s+cannot\s+be\s+null/i);
        return { column: m?.[1] };
      }
      case "fk": {
        // "Cannot add or update a child row: a foreign key constraint fails
        //  (`db`.`post`, CONSTRAINT `fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`))"
        const col = msg.match(/FOREIGN\s+KEY\s+\(`([^`]+)`\)/i);
        const tbl = msg.match(/REFERENCES\s+`([^`]+)`/i);
        return { table: tbl?.[1], column: col?.[1] };
      }
      case "check": {
        // "Check constraint 'chk_name' is violated."
        return {};
      }
    }
  }

  return {};
}

// ----------------------------------------------------------------
// extractValue
// Pulls the offending value from the error message (Postgres/MySQL)
// or from the params array using the SQL column list (SQLite/all).
// ----------------------------------------------------------------

function extractValue(
  msg:    string,
  driver: "sqlite" | "postgres" | "mysql",
  params: any[] | undefined,
  column: string | undefined,
  sql:    string | undefined
): any {
  // Postgres DETAIL line: Key (col)=(value) already exists.
  if (driver === "postgres") {
    const m = msg.match(/Key\s*\([^)]+\)\s*=\s*\(([^)]+)\)/i);
    if (m) return m[1];
  }

  // MySQL: Duplicate entry 'value' for key ...
  if (driver === "mysql") {
    const m = msg.match(/Duplicate entry\s+'([^']+)'/i);
    if (m) return m[1];
  }

  // SQLite (and fallback for all drivers): match column position in SQL
  // so we can pull the right param from the params array.
  if (column && sql && params?.length) {
    const idx = extractColIndexFromSql(sql, column);
    if (idx >= 0 && idx < params.length) return params[idx];
  }

  // Last resort for single-param queries
  if (params?.length === 1) return params[0];

  return undefined;
}

// ----------------------------------------------------------------
// formatWhere — builds the "in table X, column Y" suffix
// ----------------------------------------------------------------

function formatWhere(table?: string, column?: string): string {
  const parts: string[] = [];
  if (table)  parts.push(`table "${table}"`);
  if (column) parts.push(`column "${column}"`);
  return parts.length ? ` in ${parts.join(", ")}` : "";
}

// ----------------------------------------------------------------
// parseConstraintError
// Converts a raw driver error into an ORMError with a readable
// message. Returns null for non-constraint errors (caller re-throws).
// ----------------------------------------------------------------

export function parseConstraintError(
  err:     unknown,
  driver:  "sqlite" | "postgres" | "mysql",
  sql?:    string,
  params?: any[]
): ORMError | null {
  if (!(err instanceof Error)) return null;

  const msg   = err.message || "";
  const raw   = err as any;
  const code  = raw.code  as string | undefined;
  const errno = raw.errno as number | undefined;

  // ---- UNIQUE -------------------------------------------------------
  if (
    (driver === "sqlite"   && (code === "SQLITE_CONSTRAINT" || errno === 19) && /UNIQUE constraint failed/i.test(msg)) ||
    (driver === "postgres" && (code === "23505" || /duplicate key value/i.test(msg))) ||
    (driver === "mysql"    && (code === "ER_DUP_ENTRY" || errno === 1062))
  ) {
    const { table, column } = extractTableCol(msg, driver, "unique");
    const value = extractValue(msg, driver, params, column, sql);

    return new ORMError(
      `Duplicate value${formatWhere(table, column)} — a record with this ${column ? `"${column}"` : "value"} already exists.` +
      (value !== undefined ? `\n  Conflicting value: ${JSON.stringify(value)}` : "") +
      `\n  Tip: check what you are inserting/updating${column ? ` for field "${column}"` : ""} and ensure it is unique.`,
      { code: "UNIQUE_VIOLATION", table, column, value, sql, params },
      err
    );
  }

  // ---- NOT NULL -----------------------------------------------------
  if (
    (driver === "sqlite"   && /NOT NULL constraint failed/i.test(msg)) ||
    (driver === "postgres" && (code === "23502" || /not-null constraint/i.test(msg))) ||
    (driver === "mysql"    && (code === "ER_BAD_NULL_ERROR" || errno === 1048))
  ) {
    const { table, column } = extractTableCol(msg, driver, "notnull");
    const value = extractValue(msg, driver, params, column, sql);

    return new ORMError(
      `Missing required value${formatWhere(table, column)} — field "${column ?? "unknown"}" cannot be null or empty.` +
      (value !== undefined ? `\n  Provided value: ${JSON.stringify(value)}` : "") +
      `\n  Tip: make sure you are providing a value for "${column ?? "this field"}" before saving.`,
      { code: "NOT_NULL_VIOLATION", table, column, value, sql, params },
      err
    );
  }

  // ---- FOREIGN KEY --------------------------------------------------
  if (
    (driver === "sqlite"   && /FOREIGN KEY constraint failed/i.test(msg)) ||
    (driver === "postgres" && (code === "23503" || /foreign key constraint/i.test(msg))) ||
    (driver === "mysql"    && (code === "ER_NO_REFERENCED_ROW_2" || errno === 1452))
  ) {
    const { table, column } = extractTableCol(msg, driver, "fk");
    const value = extractValue(msg, driver, params, column, sql);

    return new ORMError(
      `Invalid reference${formatWhere(table, column)} — the related record does not exist.` +
      (value !== undefined ? `\n  Attempted reference value: ${JSON.stringify(value)}` : "") +
      `\n  Tip: ensure the referenced record exists before linking to it.`,
      { code: "FOREIGN_KEY_VIOLATION", table, column, value, sql, params },
      err
    );
  }

  // ---- CHECK --------------------------------------------------------
  if (
    (driver === "sqlite"   && /CHECK constraint failed/i.test(msg)) ||
    (driver === "postgres" && code === "23514") ||
    (driver === "mysql"    && (code === "ER_CHECK_CONSTRAINT_VIOLATED" || errno === 3819))
  ) {
    const { table, column } = extractTableCol(msg, driver, "check");
    const value = extractValue(msg, driver, params, column, sql);

    return new ORMError(
      `Value rejected by CHECK constraint${formatWhere(table, column)} — the value you provided is not allowed.` +
      (value !== undefined ? `\n  Rejected value: ${JSON.stringify(value)}` : "") +
      `\n  Tip: verify the allowed values for "${column ?? "this field"}" (e.g. enum options).`,
      { code: "CHECK_VIOLATION", table, column, value, sql, params },
      err
    );
  }

  return null; // not a constraint error we recognise — caller re-throws
}

// ----------------------------------------------------------------
// wrapExec
// Drop-in wrapper around your exec function. Pass the wrapped version
// to the Migrator, model factory, and query builder instead of the
// raw exec — all constraint errors will then throw ORMError.
//
// Usage (in index.ts / ORMManager constructor):
//   this.adapter.exec = wrapExec(this.adapter.exec.bind(this.adapter), sqlDriver);
// ----------------------------------------------------------------

export function wrapExec(
  exec:   (sql: string, params?: any[]) => Promise<any>,
  driver: "sqlite" | "postgres" | "mysql"
): (sql: string, params?: any[]) => Promise<any> {
  return async (sql: string, params?: any[]): Promise<any> => {
    try {
      return await exec(sql, params);
    } catch (err: unknown) {
      const ormErr = parseConstraintError(err, driver, sql, params);
      if (ormErr) throw ormErr;
      throw err; // re-throw unrecognised errors unchanged
    }
  };
}