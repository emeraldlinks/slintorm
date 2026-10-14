/**
 * Runtime capability detection.
 *
 * The edge/Node split is not cosmetic — it decides whether a database driver
 * can work at all. TCP drivers (`pg`, `mysql2`, `mongodb`) need a real socket;
 * V8 isolates (Vercel Edge, Cloudflare Workers, Deno Deploy) expose `fetch` and
 * WebSockets and nothing else. PostgREST needs only `fetch`.
 *
 * Previously this was only discovered on the first `connect()`, which is late:
 * the ORM would be constructed, wired into a handler, and deployed before
 * anything said "this driver cannot work here". Detecting at construction gives
 * a failure at import/boot, where it is cheap.
 *
 * Deliberately dependency-free and side-effect-free — this module must be
 * importable from an edge bundle.
 */

export type RuntimeKind =
  | "node"
  | "edge-light"      // Vercel Edge Runtime
  | "workerd"         // Cloudflare Workers
  | "deno"
  | "bun"
  | "browser"
  | "unknown";

export type RuntimeInfo = {
  kind: RuntimeKind;
  /** Has a TCP socket stack (node:net). */
  hasTcp: boolean;
  /** Has fetch. */
  hasFetch: boolean;
  /** Has process.getBuiltinModule (Node >= 22.3). */
  hasBuiltinModule: boolean;
};

function probe(): RuntimeInfo {
  const g = globalThis as any;

  const hasFetch = typeof g.fetch === "function";
  const hasTcp = typeof g.process?.versions?.node === "string";
  const hasBuiltinModule = typeof g.process?.getBuiltinModule === "function";

  let kind: RuntimeKind = "unknown";
  if (hasTcp) {
    // Bun and Deno both report a node-compat version; disambiguate.
    if (typeof (globalThis as any).Bun !== "undefined") kind = "bun";
    else if (typeof (globalThis as any).Deno !== "undefined") kind = "deno";
    else kind = "node";
  } else if (g.navigator?.userAgent === "Cloudflare-Workers" || g.WebSocketPair) {
    kind = "workerd";
  } else if (g.EdgeRuntime) {
    kind = "edge-light";
  } else if (typeof g.Deno !== "undefined") {
    kind = "deno";
  } else if (typeof g.window !== "undefined" || typeof g.document !== "undefined") {
    kind = "browser";
  }

  return { kind, hasTcp, hasFetch, hasBuiltinModule };
}

let cached: RuntimeInfo | null = null;

export function runtimeInfo(): RuntimeInfo {
  if (!cached) cached = probe();
  return cached;
}

/** True when this runtime has no TCP socket stack — a V8 isolate or browser. */
export function isSocketless(): boolean {
  return !runtimeInfo().hasTcp;
}

/** True when the current runtime can run TCP-based drivers. */
export function canUseTcpDrivers(): boolean {
  return runtimeInfo().hasTcp;
}

/** Drivers that require a TCP socket. */
const TCP_DRIVERS = new Set(["postgres", "mysql", "mongodb"]);

/**
 * Throw early when a TCP-only driver is configured on a runtime with no sockets.
 *
 * This is the same information the connect() path would eventually produce, but
 * it surfaces at construction — before the code is deployed — instead of on the
 * first query in production.
 */
export function assertDriverSupported(driver: string | undefined): void {
  if (!driver) return;
  if (!TCP_DRIVERS.has(driver)) return;
  if (canUseTcpDrivers()) return;

  const info = runtimeInfo();
  throw new Error(
    `SlintORM: driver "${driver}" cannot run in this runtime (${info.kind}).\n\n` +
      `The ${driver} driver needs a real TCP socket. This runtime provides ` +
      `fetch and WebSockets only, so the connection cannot be opened — and ` +
      `installing the driver will not change that.\n\n` +
      `Options:\n` +
      `  1. Use the Node.js runtime instead of the edge runtime.\n` +
      `  2. Use PostgREST, which speaks HTTPS over fetch and works anywhere:\n` +
      `       import ORMManager from 'slintorm/edge';\n` +
      `       new ORMManager({ driver: 'postgrest', postgrestUrl, postgrestKey, schema });\n` +
      `  3. Use a vendor HTTP driver and pass it as \`exec\`:\n` +
      `       new ORMManager({ driver: 'postgres', exec: neonExec({ url }), schema });\n` +
      `  4. Run createProxyServer() on a Node host and use proxyExec() from the edge.\n\n` +
      `See slintorm's SERVERLESS.md for the full matrix.`,
  );
}