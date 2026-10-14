/**
 * SQL identifier and literal quoting.
 *
 * This is the ONLY place in the codebase that quotes an identifier. It used
 * to be duplicated six times (queryBuilder, model x2, migration-history,
 * extra_clauses) and none of them escaped the delimiter, so any string that
 * reached an identifier position could terminate the identifier and inject
 * arbitrary SQL.
 *
 * The strategy is two-layer:
 *   1. REJECT characters that can never legitimately appear in an identifier
 *      (NUL, control characters, whitespace-only, over-long). These are an
 *      attack signal, not a schema authorial choice.
 *   2. ESCAPE the delimiter by doubling it, per SQL standard. This is what
 *      makes it impossible to break out of the quoted identifier.
 *
 * Values are never quoted with these functions — values must always go
 * through bound parameters. See `quoteLiteral` for the rare case where a
 * literal must be inlined (and even then, prefer a placeholder).
 */

export type QuoteDriver = "sqlite" | "postgres" | "mysql" | "mongodb";

/** Delimiter used by each dialect's quoting syntax. */
function delimiterFor(driver: QuoteDriver): '"' | "`" | null {
  switch (driver) {
    case "mysql":
      return "`";
    case "sqlite":
    case "postgres":
      return '"';
    case "mongodb":
      return null; // JSON keys — nothing to quote, but still validate.
  }
}

/**
 * Characters that must never appear in an identifier. Even after escaping the
 * delimiter, these enable truncation in downstream consumers (regexes,
 * shell-outs, log injection) or are simply never authored deliberately.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f]/;

export class SqlIdentifierError extends Error {
  constructor(identifier: string, reason: string) {
    super(
      `Unsafe SQL identifier rejected (${reason}): ${JSON.stringify(identifier)}.\n` +
        `Column and table names must be plain identifiers. If this value came from ` +
        `user input, allowlist it against your schema before passing it to SlintORM.`,
    );
    this.name = "SqlIdentifierError";
  }
}

function assertSafe(identifier: string): void {
  if (typeof identifier !== "string") {
    throw new SqlIdentifierError(String(identifier), "not a string");
  }
  if (identifier.length === 0) {
    throw new SqlIdentifierError(identifier, "empty");
  }
  if (identifier.length > 128) {
    throw new SqlIdentifierError(identifier.slice(0, 32) + "…", "too long");
  }
  if (FORBIDDEN.test(identifier)) {
    throw new SqlIdentifierError(identifier, "contains a control or NUL character");
  }
}

/**
 * Quote a SQL identifier (table or column name) safely.
 *
 * @throws {SqlIdentifierError} if the name contains characters that can never
 *   legitimately appear in an identifier.
 */
export function quoteIdentifier(driver: QuoteDriver, name: string): string {
  assertSafe(name);

  const delim = delimiterFor(driver);
  if (delim === null) return name; // MongoDB: JSON keys, no quoting syntax.

  // SQL standard: a delimiter inside an identifier is escaped by doubling it.
  // MySQL additionally treats backslash as an escape character, so a literal
  // backslash must be doubled as well or `` ` `` would not round-trip.
  if (driver === "mysql") {
    return `\`${name.replace(/\\/g, "\\\\").replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote a possibly-qualified column reference (`col` or `table.col`).
 *
 * Each dotted segment is quoted as its own identifier. Anything that is not a
 * plain dotted identifier chain is rejected — this deliberately does NOT
 * support inline expressions, because those are the injection vector.
 */
export function quoteColumnRef(driver: QuoteDriver, ref: string): string {
  assertSafe(ref);
  const parts = ref.split(".");
  if (parts.length > 2) {
    throw new SqlIdentifierError(ref, "expected at most 'table.column'");
  }
  return parts.map((p) => quoteIdentifier(driver, p)).join(".");
}

/**
 * Escape a string for inclusion inside single-quoted SQL literal.
 *
 * Prefer a bound parameter. This exists for the handful of call sites that
 * genuinely must inline a literal (e.g. a Postgres tsvector configuration
 * name), and it closes the injection there.
 */
export function quoteLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Operators that may appear in a WHERE clause. Anything else is rejected
 * rather than emitted raw.
 */
const ALLOWED_OPERATORS = new Set([
  "=", "!=", "<>", "<", "<=", ">", ">=",
  "LIKE", "NOT LIKE", "ILIKE", "NOT ILIKE",
  "IS", "IS NOT", "IN", "NOT IN", "BETWEEN", "NOT BETWEEN",
  "@>", "<@", "&&", "|", "-", "#>", "#>>", "?", "?&", "@@",
]);

/**
 * Validate a WHERE operator. Operators are structural, so this is an
 * allowlist — anything unrecognised is a bug or an attack.
 */
export function assertSafeOperator(op: string): string {
  const normalized = String(op).trim().toUpperCase().replace(/\s+/g, " ");
  if (!ALLOWED_OPERATORS.has(normalized)) {
    throw new Error(
      `Unsafe SQL operator rejected: ${JSON.stringify(op)}.\n` +
        `Allowed operators: ${[...ALLOWED_OPERATORS].join(", ")}`,
    );
  }
  return normalized;
}

/**
 * Validate a sort direction. `orderBy` accepts a direction from its caller and
 * the `keyof T` constraint is erased at runtime, so `orderBy(req.query.sort)`
 * type-checks. The column is escaped by quoteIdentifier; the direction has no
 * escape mechanism, so it must be allowlisted.
 */
export function assertSafeDirection(dir: string): "ASC" | "DESC" {
  const normalized = String(dir).trim().toUpperCase();
  if (normalized !== "ASC" && normalized !== "DESC") {
    throw new Error(
      `Unsafe sort direction rejected: ${JSON.stringify(dir)}. Use "asc" or "desc".`,
    );
  }
  return normalized;
}

/**
 * Validate an optimizer hint. Hints are spliced into the statement verbatim
 * (`SELECT <hint> * FROM ...`), so they cannot be escaped — only allowlisted.
 * Accepts the shapes Postgres/MySQL actually support.
 */
const HINT_RE = /^[A-Za-z0-9_]+\s*(\([^()]*\))?(\s+[A-Za-z0-9_]+\s*=\s*[A-Za-z0-9_]+)*$/;

/** MySQL optimizer hints arrive already wrapped in an optimizer-hint comment. */
const MYSQL_HINT_RE = /^\/\*\+([\s\S]*)\*\/$/;

export function assertSafeHint(hint: string): string {
  const value = String(hint).trim();
  if (!value) throw new Error("Empty optimizer hint.");

  // A complete MySQL hint comment is self-contained and safe to pass through.
  const wrapped = value.match(MYSQL_HINT_RE);
  const inner = wrapped ? wrapped[1].trim() : value;

  // A bare comment terminator (with no opening) escapes the /* */ wrapper
  // that commentHint() applies, letting the attacker continue the statement.
  if (inner.includes("*/") || inner.includes("/*")) {
    throw new Error(
      `Unsafe optimizer hint rejected (nested comment sequence): ${JSON.stringify(hint)}`,
    );
  }
  if (!HINT_RE.test(inner)) {
    throw new Error(
      `Unsafe optimizer hint rejected: ${JSON.stringify(hint)}.\n` +
        `Hints must look like: "INDEX (idx_name)", "NO_INDEX", "/*+ NO_INDEX(t) */", ` +
        `"SET_VAR(foreign_keys = OFF)".`,
    );
  }
  return wrapped ? value : inner;
}