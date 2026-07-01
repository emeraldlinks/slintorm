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

import type { ExecFn, SQLExecResult } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProxyClientConfig {
  endpoint: string;
  headers?: Record<string, string>;
}

export interface ProxyServerConfig {
  port?: number;
  host?: string;
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

// ─── Client (edge-safe) ───────────────────────────────────────────────────────

/** Create an ExecFn that tunnels SQL through an HTTP proxy server.
 *  Use this in edge/serverless runtimes that lack TCP. */
export function proxyExec(config: ProxyClientConfig): ExecFn {
  return async (sql: string, params: any[] = []): Promise<SQLExecResult> => {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
 *  the configured database. Dynamically imports the driver when needed. */
export async function createProxyServer(config: ProxyServerConfig): Promise<{ close: () => void }> {
  const http = await import("node:http");

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
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only POST allowed" }));
      return;
    }

    let body = "";
    req.on("data", (chunk: string) => { body += chunk; });

    req.on("end", async () => {
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
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        if (config.onError) {
          const { sql, params } = JSON.parse(body || "{}");
          config.onError({ sql, params, error: err });
        }
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ error: err.message || String(err) }));
      }
    });
  });

  const port = config.port ?? 3001;
  const host = config.host ?? "0.0.0.0";
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
