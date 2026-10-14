// ─── SlintORM Proxy ──────────────────────────────────────────────────────────
// Edge-safe HTTP proxy for running database queries from V8-isolate runtimes
// (Vercel Edge, Cloudflare Workers, Netlify Edge, Deno Deploy).
//
// Architecture:
//   Edge Function            Proxy Server (Node)         Database
//   ─────────────            ───────────────────         ────────
//   proxyExec()  ──fetch──►  createProxyServer()  ──►    pg/mysql2/sqlite3/mongodb
//   (no TCP)                 (has TCP + drivers)
//
// The client side uses fetch() — works everywhere.
// The server side uses Node's http module — runs on any Node host.
//
// ═══ SECURITY ════════════════════════════════════════════════════════════════
// This server executes ARBITRARY SQL supplied by whoever can reach it. It must
// never be exposed unauthenticated. Three requirements are enforced here and
// cannot be disabled by omission:
//
//   1. `authToken` is MANDATORY. Without it, createProxyServer() throws.
//   2. Requests are checked with a timing-safe comparison of the bearer token.
//   3. The server binds 127.0.0.1 by default, not 0.0.0.0.
//
// `allowedOrigins` defaults to NO cross-origin access. Set it explicitly to the
// exact origins that need browser access; "*" is rejected unless you also set
// `allowAnyOrigin`, because a wildcard on a SQL endpoint lets any web page on
// the internet drive your database.

import type { ExecFn, SQLExecResult } from "./types.js";

// NOTE: `node:crypto` is imported LAZILY below, never at module scope.
// This file is re-exported from `slintorm/browser`, which is the documented
// edge entry point; a static `import "node:crypto"` there would make every edge
// bundle fail to load even for callers that only want proxyExec().

/** Resolve node:crypto without a static import, so edge bundles stay loadable. */
async function nodeCrypto(): Promise<typeof import("node:crypto")> {
  try {
    return await import("node:crypto");
  } catch {
    throw new Error(
      "SlintORM proxy authentication requires node:crypto, which is not available " +
        "in this runtime.\n\n" +
        "The proxy SERVER (createProxyServer) must run on Node. The client " +
        "(proxyExec) is edge-safe and can be bundled into a Vercel Edge / " +
        "Workers function — but importing this module on the edge will fail at " +
        "the point where the token check runs.\n\n" +
        "Import only what you need:\n" +
        "  edge:  import { proxyExec } from 'slintorm/proxy'\n" +
        "  node:  import { createProxyServer } from 'slintorm/proxy'",
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProxyClientConfig {
  endpoint: string;
  headers?: Record<string, string>;
  /** Bearer token. Must match the server's `authToken`. */
  authToken?: string;
}

export interface ProxyServerConfig {
  port?: number;
  /** Defaults to 127.0.0.1. Set to "0.0.0.0" deliberately, not by accident. */
  host?: string;
  /**
   * REQUIRED. Shared secret required on every request, as
   * `Authorization: Bearer <token>` or `X-SlintORM-Token`.
   */
  authToken: string;
  /** Exact origins permitted to call this from a browser. Empty = none. */
  allowedOrigins?: string[];
  /** Opt-in escape hatch for a wildcard origin. Requires authToken regardless. */
  allowAnyOrigin?: boolean;
  resolveDb: (ctx: {
    sql: string;
    params: any[];
    headers: Record<string, string>;
    method: string;
    url: string;
  }) => DbTarget | Promise<DbTarget>;
  onStart?: (port: number) => void;
  onQuery?: (ctx: { sql: string; params: any[]; db: string; durationMs: number }) => void;
  onError?: (ctx: { sql: string; params: any[]; error: any }) => void;
}

export interface DbTarget {
  name: string;
  driver: "sqlite" | "postgres" | "mysql" | "mongodb";
  databaseUrl: string;
  databaseName?: string;
}

export class ProxyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyAuthError";
  }
}

/** Constant-time string comparison that tolerates unequal lengths. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const { timingSafeEqual } = await nodeCrypto();
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  // Hash both sides to a fixed length so the comparison is always full-length.
  return timingSafeEqual(createHashOf(ab), createHashOf(bb));
}

/**
 * Fixed-width digest used only to make the comparison length-independent.
 *
 * This is NOT a security hash — it never leaves the process and the inputs are
 * already secrets. It exists so `timingSafeEqual` (which requires equal-length
 * buffers) does not leak the token length through an early-exit compare.
 */
function createHashOf(buf: Buffer): Buffer {
  const out = Buffer.alloc(32);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < buf.length; i++) {
    h1 ^= buf[i];
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + buf[i] * (i + 1)) >>> 0;
  }
  out.writeUInt32LE(h1, 0);
  out.writeUInt32LE(h2, 4);
  out.writeUInt32LE(buf.length, 8);
  out.writeUInt32LE(Math.imul(h1, h2) >>> 0, 12);
  return out;
}

/** Extract the presented token from a request. */
function presentedToken(headers: Record<string, any>): string | null {
  const auth = headers["authorization"];
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  const custom = headers["x-slintorm-token"];
  if (typeof custom === "string" && custom) return custom.trim();
  return null;
}

// ─── Client (edge-safe) ───────────────────────────────────────────────────────

/** Create an ExecFn that tunnels SQL through an HTTP proxy server.
 *  Use this in edge/serverless runtimes that lack TCP.
 *
 *  `authToken` is required: the server rejects unauthenticated requests, so a
 *  client without one cannot work. It is read from PROXY_AUTH_TOKEN when not
 *  passed explicitly, to keep it out of source. */
export function proxyExec(config: ProxyClientConfig): ExecFn {
  const token =
    config.authToken ??
    (globalThis as any).process?.env?.PROXY_AUTH_TOKEN ??
    (globalThis as any).Deno?.env?.get?.("PROXY_AUTH_TOKEN");

  if (!token) {
    throw new Error(
      "proxyExec: no auth token. The proxy server rejects unauthenticated " +
        "requests, so a token is required.\n" +
        "  proxyExec({ endpoint, authToken: process.env.PROXY_AUTH_TOKEN })\n" +
        "or set PROXY_AUTH_TOKEN in the environment.",
    );
  }

  return async (sql: string, params: any[] = []): Promise<SQLExecResult> => {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...config.headers,
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Proxy ${config.endpoint} returned HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: json.rows || [], changes: json.changes, lastID: json.lastID };
  };
}

// ─── Server (Node.js only — has TCP) ──────────────────────────────────────────

/** Create a proxy HTTP server that accepts SQL queries and runs them against
 *  the configured database. Dynamically imports the driver when needed.
 *
 *  `authToken` is REQUIRED — this endpoint executes arbitrary SQL. */
export async function createProxyServer(config: ProxyServerConfig): Promise<{ close: () => void }> {
  if (!config?.authToken || typeof config.authToken !== "string" || config.authToken.length < 16) {
    throw new ProxyAuthError(
      "createProxyServer requires `authToken` of at least 16 characters.\n" +
        "This server executes arbitrary SQL from whoever can reach it. Refusing " +
        "to start unauthenticated.\n\n" +
        "  const token = crypto.randomBytes(32).toString('hex');\n" +
        "  await createProxyServer({ authToken: token, resolveDb });\n" +
        "  // then pass the SAME token to proxyExec({ endpoint, authToken: token })",
    );
  }

  const http = await import("node:http");

  const allowedOrigins = new Set(config.allowedOrigins ?? []);
  const allowAnyOrigin = config.allowAnyOrigin === true;

  if (allowAnyOrigin && allowedOrigins.size === 0) {
    throw new Error(
      "createProxyServer: allowAnyOrigin is set but this exposes a SQL endpoint " +
        "to every origin on the internet. Pass allowedOrigins explicitly unless " +
        "you understand the risk.",
    );
  }

  function corsOrigin(req: any): string | null {
    const origin = req.headers["origin"];
    if (!origin) return null; // same-origin / non-browser caller
    if (allowAnyOrigin) return "*";
    return allowedOrigins.has(origin) ? origin : null;
  }

  // Lazy driver cache — keyed by DbTarget.name
  const driverCache = new Map<string, { exec: (sql: string, params: any[]) => Promise<SQLExecResult>; close: () => Promise<void> }>();

  async function getDriver(target: DbTarget) {
    const cached = driverCache.get(target.name);
    if (cached) return cached;

    const adapter = new (await import("./dbAdapter.js")).DBAdapter({
      driver: target.driver as any,
      databaseUrl: target.databaseUrl,
      databaseName: target.databaseName,
      logs: false,
    });
    await adapter.connect();
    const exec = adapter.exec.bind(adapter);
    const close = adapter.close.bind(adapter);
    const entry = { exec, close };
    driverCache.set(target.name, entry);
    return entry;
  }

  const server = http.default.createServer(async (req: any, res: any) => {
    const origin = corsOrigin(req);

    // CORS preflight
    if (req.method === "OPTIONS") {
      if (origin) {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": origin,
          "Vary": "Origin",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-SlintORM-Token",
        });
      } else {
        res.writeHead(403, { "Content-Type": "application/json" });
      }
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only POST allowed" }));
      return;
    }

    // ── AUTHENTICATION ──────────────────────────────────────────────────
    // Checked before anything is parsed or any database work is done.
    const token = presentedToken(req.headers);
    if (!token || !(await safeEqual(token, config.authToken))) {
      // Do not reveal whether the token was wrong vs missing.
      res.writeHead(401, {
        "Content-Type": "application/json",
        ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // ── BODY SIZE LIMIT ──────────────────────────────────────────────────
    // An unauthenticated-but-authenticated proxy can still be abused to
    // exhaust memory with a huge payload.
    const MAX_BODY = 1_000_000; // 1 MB — plenty for a parameterised INSERT.
    let body = "";
    let aborted = false;
    req.on("data", (chunk: string) => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request body too large" }));
        req.destroy();
      }
    });

    req.on("end", async () => {
      if (aborted) return;
      const start = Date.now();
      try {
        const { sql, params = [] } = JSON.parse(body);
        if (!sql || typeof sql !== "string") {
          throw new Error("Missing 'sql' in request body");
        }

        const target = await config.resolveDb({
          sql,
          params,
          headers: req.headers,
          method: req.method,
          url: req.url || "",
        });

        const driver = await getDriver(target);
        const result = await driver.exec(sql, params);

        if (config.onQuery) {
          config.onQuery({ sql, params, db: target.name, durationMs: Date.now() - start });
        }

        res.writeHead(200, {
          "Content-Type": "application/json",
          ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        if (config.onError) {
          let sql: any, params: any;
          try { ({ sql, params } = JSON.parse(body || "{}")); } catch { /* unparseable */ }
          config.onError({ sql, params, error: err });
        }
        res.writeHead(400, {
          "Content-Type": "application/json",
          ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        });
        // Do not echo the raw driver message: it can disclose schema, table
        // names and connection details. Log it via onError instead.
        res.end(JSON.stringify({ error: "Query failed" }));
      }
    });
  });

  const port = config.port ?? 3001;
  // Bind loopback by default. Exposing a SQL endpoint on all interfaces is an
  // explicit decision the caller must make.
  const host = config.host ?? "127.0.0.1";
  server.listen(port, host, () => {
    if (config.onStart) config.onStart(port);
  });

  return {
    close: () => {
      server.close();
      for (const driver of driverCache.values()) {
        driver.close().catch(() => {});
      }
    },
  };
}

/** Generate a token suitable for `authToken`. Node-only (uses node:crypto). */
export async function generateProxyToken(bytes = 32): Promise<string> {
  const { randomBytes } = await nodeCrypto();
  return randomBytes(bytes).toString("hex");
}