/**
 * PostgREST transport — Postgres over plain HTTP, via fetch.
 *
 * This is the edge path. PostgREST speaks JSON over HTTPS and needs no TCP
 * socket, so it runs unchanged in Vercel Edge, Cloudflare Workers, Deno
 * Deploy and browsers. Supabase exposes PostgREST at `<project>.supabase.co/rest/v1`,
 * but any PostgREST instance works — the two are the same thing.
 *
 * It is a TRANSPORT, not an `exec`. `exec` takes a SQL string; PostgREST has no
 * SQL surface, so it cannot be dropped in behind the existing SQL path. Instead
 * the query builder emits a normalized command (see QueryBuilder.buildPostgrestCommand)
 * and this module turns that into an HTTP request. Same design as the Mongo path.
 *
 * No Node built-ins are imported, anywhere, at any scope.
 */

export type PostgrestOp =
  | "select" | "insert" | "update" | "delete";

/** A filter, already normalised from the query builder. */
export type PostgrestFilter = {
  column: string;
  op: string;
  value?: any;
  negate?: boolean;
};

export type PostgrestCommand = {
  op: PostgrestOp;
  table: string;
  select?: string[];
  filters?: PostgrestFilter[];
  orFilters?: PostgrestFilter[][];
  order?: { column: string; dir: "asc" | "desc"; nulls?: "first" | "last" }[];
  limit?: number;
  offset?: number;
  data?: any;
  /** Return the affected rows instead of just a count. */
  returning?: boolean;
  /** Include a total count in the response. */
  count?: "exact" | "planned" | "estimated";
  /** Expect at most one row (drives the Accept header). */
  single?: boolean;
  /** Only test for existence. */
  maybeSingle?: boolean;
};

export type PostgrestConfig = {
  /** Base URL of the PostgREST service, e.g. `https://xyz.supabase.co/rest/v1`. */
  url: string;
  /** API key. Sent as both `apikey` and a Bearer token. */
  key?: string;
  /** Postgres schema. Defaults to `public`. */
  schema?: string;
  /**
   * Extra headers merged into every request. Either a static object, or a
   * function evaluated per request — the latter is what multi-tenant setups
   * need, since the tenant differs per request while the client is shared.
   */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Injectable fetch, for tests and for runtimes with a non-global fetch. */
  fetch?: typeof fetch;
  /** Request timeout in ms. Default 15000. */
  timeoutMs?: number;
};

export class PostgrestError extends Error {
  readonly status: number;
  readonly body: any;
  readonly code?: string;
  constructor(message: string, status: number, body: any, code?: string) {
    super(message);
    this.name = "PostgrestError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/** Map the ORM's operator vocabulary onto PostgREST's. */
const OP_MAP: Record<string, string> = {
  "=": "eq",
  "!=": "neq",
  "<>": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  "LIKE": "like",
  "NOT LIKE": "like",
  "ILIKE": "ilike",
  "NOT ILIKE": "ilike",
  "IS": "is",
  "IS NOT": "is",
  // PostgREST renders lists as `col=in.(a,b,c)` — the parentheses come from
  // encodeFilterValue, so the operator itself is just `in`.
  "IN": "in",
  "NOT IN": "in",
  "BETWEEN": "between",
};

function encodeFilterValue(value: any): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `(${value.map((v) => encodeFilterValue(v)).join(",")})`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  // PostgREST values are URL query params; a literal comma or dot inside a
  // value would otherwise be read as list/separator syntax.
  return String(value).replace(/[,()]/g, (c) => encodeURIComponent(c));
}

function buildFilterQuery(filters: PostgrestFilter[] = []): URLSearchParams {
  const p = new URLSearchParams();
  for (const f of filters) p.append(f.column, renderFilter(f));
  return p;
}

/** Render one filter as PostgREST's `column=op.value` syntax. */
function renderFilter(f: PostgrestFilter): string {
  const rawOp = String(f.op).toUpperCase();
  // Negation can arrive either as an explicit `negate` flag (set by the query
  // builder) or embedded in the operator name ("NOT IN"). OP_MAP maps both
  // "IN" and "NOT IN" to "in", so the prefix has to be detected here or the
  // negation is silently lost.
  const negated = f.negate || rawOp.startsWith("NOT ");
  let op = OP_MAP[rawOp] ?? "eq";
  let value = f.value;

  if (negated && ["like", "ilike"].includes(op)) return `not.${op}.${encodeFilterValue(value)}`;
  if (negated) op = `not.${op}`;
  if (op === "is") value = value === true ? "true" : value === false ? "false" : "null";
  return `${op}.${encodeFilterValue(value)}`;
}

function applyOrGroups(groups: PostgrestFilter[][] = []): URLSearchParams {
  const p = new URLSearchParams();
  for (const group of groups) {
    const inner = new URLSearchParams();
    for (const f of group) inner.append(f.column, renderFilter(f));
    p.append("or", `(${inner.toString()})`);
  }
  return p;
}

/**
 * Execute a command against a PostgREST service.
 *
 * Returns the same shape the rest of SlintORM uses (`{ rows, changes }`) so the
 * model and query-builder layers are unchanged.
 */
export class PostgrestClient {
  private base: string;
  private schema: string;
  private key?: string;
  private extraHeaders: Record<string, string> | (() => Record<string, string>);
  private doFetch: typeof fetch;
  private timeoutMs: number;

  constructor(config: PostgrestConfig) {
    if (!config?.url) {
      throw new Error(
        "PostgrestClient requires `url` — the base URL of your PostgREST service " +
          "(Supabase: https://<project-ref>.supabase.co/rest/v1).",
      );
    }
    this.base = config.url.replace(/\/+$/, "");
    this.schema = config.schema ?? "public";
    this.key = config.key;
    this.extraHeaders = config.headers ?? {};

    const f = config.fetch ?? (globalThis as any).fetch;
    if (typeof f !== "function") {
      throw new Error(
        "No fetch available. PostgREST requires fetch. On Node use Node 18+; " +
          "elsewhere pass `fetch` explicitly via the `fetch` option.",
      );
    }
    this.doFetch = f as typeof fetch;
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  private buildUrl(cmd: PostgrestCommand): URL {
    const url = new URL(`${this.base}/${cmd.table}`);

    const p = new URLSearchParams();
    p.set("select", (cmd.select?.length ? cmd.select : ["*"]).join(","));

    for (const f of buildFilterQuery(cmd.filters).entries()) p.append(f[0], f[1]);
    for (const g of applyOrGroups(cmd.orFilters).entries()) {
      p.append(g[0], g[1]);
    }

    if (cmd.order?.length) {
      for (const o of cmd.order) {
        p.append("order", `${o.column}.${o.dir}${o.nulls ? `.nulls${o.nulls}` : ""}`);
      }
    }
    if (cmd.limit != null) p.set("limit", String(cmd.limit));
    if (cmd.offset != null) p.set("offset", String(cmd.offset));

    for (const [k, v] of p.entries()) url.searchParams.append(k, v);
    return url;
  }

  private buildHeaders(cmd: PostgrestCommand): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(typeof this.extraHeaders === "function" ? this.extraHeaders() : this.extraHeaders),
    };
    if (this.key) {
      headers["apikey"] = this.key;
      headers["Authorization"] = `Bearer ${this.key}`;
    }
    if (this.schema && this.schema !== "public") {
      headers["Accept-Profile"] = this.schema;
      headers["Content-Profile"] = this.schema;
    }

    const prefer: string[] = [];
    if (cmd.returning) prefer.push("return=representation");
    else if (cmd.op !== "select") prefer.push("return=minimal");
    if (cmd.count === "exact") prefer.push("count=exact");
    if (prefer.length) headers["Prefer"] = prefer.join(", ");

    if (cmd.single) headers["Accept"] = "application/vnd.pgrst.object+json";
    else if (cmd.maybeSingle) headers["Accept"] = "application/vnd.pgrst.object+json";
    return headers;
  }

  /** Read the total row count out of the `Content-Range` response header. */
  private parseCount(res: Response): number | null {
    const cr = res.headers.get("Content-Range");
    if (!cr) return null;
    const m = cr.match(/\/(\d+|\*)$/);
    if (!m || m[1] === "*") return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  async execute(cmd: PostgrestCommand): Promise<{ rows: any[]; changes: number; total: number | null }> {
    const url = this.buildUrl(cmd);
    const headers = this.buildHeaders(cmd);

    let method: string;
    let body: string | undefined;
    switch (cmd.op) {
      case "select": method = "GET"; break;
      case "insert": method = "POST"; body = JSON.stringify(cmd.data); break;
      case "update": method = "PATCH"; body = JSON.stringify(cmd.data); break;
      case "delete": method = "DELETE"; break;
      default: throw new PostgrestError(`Unsupported PostgREST operation: ${cmd.op}`, 400, null);
    }

    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.timeoutMs) : null;

    let res: Response;
    try {
      res = await this.doFetch(url.toString(), {
        method,
        headers,
        body,
        signal: ctl?.signal,
      });
    } catch (err: any) {
      throw new PostgrestError(
        `PostgREST request failed: ${err?.message ?? err}\n` +
          `  ${method} ${url.origin}${url.pathname}\n` +
          `  Check the url, the api key, and that the service is reachable.`,
        0,
        null,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    const total = cmd.count === "exact" ? this.parseCount(res) : null;

    if (res.status === 204 || res.status === 201 || res.status === 200) {
      const text = await res.text().catch(() => "");
      let rows: any[] = [];
      if (text) {
        try {
          const parsed = JSON.parse(text);
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rows = [];
        }
      }
      const changes = cmd.op === "select" ? rows.length : (total ?? rows.length);
      return { rows, changes, total };
    }

    let parsed: any = null;
    const text = await res.text().catch(() => "");
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    const message =
      (parsed && (parsed.message || parsed.hint || parsed.error)) ||
      (typeof parsed === "string" && parsed) ||
      `HTTP ${res.status}`;

    throw new PostgrestError(
      `PostgREST error (${res.status}) on ${method} ${url.pathname}: ${message}`,
      res.status,
      parsed,
      parsed?.code,
    );
  }
}

/**
 * Create an `exec`-shaped function that speaks PostgREST.
 *
 * Useful when you want a one-off query without going through the query
 * builder. The command is passed as a JSON string in the same slot `exec`
 * normally receives SQL, and the result is normalised to the shape the rest of
 * SlintORM expects.
 */
export function postgrestExec(config: PostgrestConfig): (cmd: string, params?: any[]) => Promise<{ rows: any[]; changes: number | null }> {
  const client = new PostgrestClient(config);
  return async (cmd: string) => {
    let parsed: PostgrestCommand;
    try {
      parsed = typeof cmd === "string" ? JSON.parse(cmd) : cmd;
    } catch {
      throw new PostgrestError(
        "postgrestExec expects a PostgREST command as JSON, not SQL.\n" +
          "PostgREST has no SQL surface. Prefer the query builder " +
          "(db.Model.query().where(...)), which emits the correct command.",
        400,
        null,
      );
    }
    const r = await client.execute(parsed);
    return { rows: r.rows, changes: r.changes };
  };
}