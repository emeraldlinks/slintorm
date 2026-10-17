import type { SQLExecResult, DBDriver, ExecFn } from "./types.ts";
import { assertDriverSupported } from "./runtime.js";
import { quoteIdentifier } from "./quoting.js";

// ─── DBAdapter ────────────────────────────────────────────────────────────────
// SERVERLESS / EDGE CHANGES:
//  1. Removed `spawnSync` / auto-install entirely — no child_process in edge.
//  2. connect() is now lazy-async; no Node-specific globals at module load time.
//  3. All driver imports are dynamic (import()) so bundlers can tree-shake them.
//  4. `autoInstallDrivers` option removed — was the root cause of crashes in
//     restricted runtimes (Vercel Edge, CF Workers, Deno, Bun).
//  5. Prepared-statement cache kept for sqlite only (it's still valid in Node).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render bound parameters for logging.
 *
 * Values are user data — access tokens, card numbers, emails, national IDs.
 * With `logs: true` these were written to stdout verbatim, which is how PII
 * ends up in CI output and log aggregation. Redact unless explicitly opted in.
 */
function redactParams(params: any[], include: boolean): any {
  if (include) return params;
  return params.map((_, i) => `$${i + 1}`);
}

/**
 * Redact a MongoDB command for logging.
 *
 * Mongo carries its values INSIDE the command document rather than in a
 * parameter array, so redactParams() was handed an empty array and every
 * inserted or updated document was written to stdout verbatim — the precise
 * leak the SQL path above exists to prevent, and invisible until the Mongo
 * suite actually ran. Rewrite leaf values to placeholders while keeping keys:
 * operator names such as `$in` are structure, not user data.
 */
function redactMongoCommand(sqlOrOp: string, include: boolean): string {
  if (include) return sqlOrOp;
  let parsed: any;
  try { parsed = JSON.parse(sqlOrOp); } catch { return sqlOrOp; }
  let n = 0;
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return `$${++n}`;
  };
  return JSON.stringify(walk(parsed));
}

/**
 * Classify a driver load/connect failure.
 *
 * These used to collapse into "driver not found. Install it: npm install X",
 * which is actively misleading in the single most common failure mode: running
 * on Vercel Edge / Cloudflare Workers / Deno, where the driver IS installed but
 * the runtime has no TCP sockets, so `import("pg")` fails for a reason
 * `npm install` can never fix.
 */
function describeDriverFailure(
  driver: string,
  pkg: string,
  err: any,
): Error {
  const msg = String(err?.message ?? err);
  const isMissing =
    err?.code === "ERR_MODULE_NOT_FOUND" ||
    err?.code === "MODULE_NOT_FOUND" ||
    /Cannot find (module|package)/i.test(msg) ||
    /Did you mean to import/i.test(msg);

  if (isMissing) {
    return new Error(
      `${driver} driver not found. Install it:\n  npm install ${pkg}\n\nOriginal error: ${msg}`
    );
  }

  // Everything else is a connection or runtime problem, not a packaging one.
  const looksLikeNoTcp =
    /TCP|net\.Socket|node:net|EACCES|EPERM|not supported|Workers|edge runtime/i.test(msg);

  return new Error(
    `Failed to connect to ${driver}.\n\n` +
      `The ${pkg} driver IS installed — this is not a missing-package problem.\n` +
      (looksLikeNoTcp
        ? `It looks like the runtime cannot open TCP sockets:\n  ${msg}\n\n` +
          `This is expected on Vercel Edge, Cloudflare Workers, and Deno Deploy.\n` +
          `The \`pg\` driver needs a real TCP socket, which V8 isolates do not provide.\n\n` +
          `Options:\n` +
          `  1. Use the Node.js runtime instead of the edge runtime.\n` +
          `  2. Use an HTTP-based driver and pass it as \`exec\` (see slintorm/browser):\n` +
          `       new ORMManager({ driver: 'postgres', exec: neonExec({ url }), schema })\n` +
          `  3. Run createProxyServer() on a Node host and use proxyExec() from the edge.\n\n`
        : `Original error: ${msg}\n\n`) +
      `Check that the host is reachable, the credentials are correct, and the ` +
      `connection string is well-formed.\n` +
      `NOTE: every Postgres error used to be reported as "driver not found" here. ` +
      `The real cause is above.`
  );
}

export class DBAdapter {
  driver?: DBDriver;
  dir?: string;
  schema?: Record<string, any>;
  customExec: ExecFn | null = null;
  private sqliteDb: any = null;
  private mysqlConn: any = null;
  private pgClient: any = null;
  /** Non-null when `poolSize > 1` was requested. */
  private pgPool: any = null;
  /** Shared in-flight connect promise — prevents duplicate connections. */
  private _connecting: Promise<void> | null = null;
  private mongoClient: any = null;
  private mongoDb: any = null;
  private _mongoObjectId: any = null;
  private connected = false;
  private stmtCache: Map<string, any> = new Map();
  private stmtCacheMax = 200;
  private _mongoSession: any = null;

  // Read replicas
  private replicaPools: { sqlite?: any; mysql?: any[]; pg?: any[] } = {};
  private replicaIndex = 0;

  private config: {
    driver?: DBDriver;
    databaseUrl?: string;
    databaseName?: string;
    dir?: string;
    logs?: boolean;
    /**
     * Include bound parameter VALUES in log output. Defaults to false.
     *
     * These are user data: with `logs: true` and this off, the SQL text is
     * logged but values are replaced by placeholders. Only enable this in a
     * local terminal where the values are yours.
     */
    logParams?: boolean;
    replicas?: string[];  // connection URLs for read replicas
    poolSize?: number;    // connection pool size (PG/MySQL)
    exec?: ExecFn;        // custom exec function (bypasses TCP — use in edge/serverless)
    /** PostgREST base URL, e.g. https://<project>.supabase.co/rest/v1 */
    postgrestUrl?: string;
    /** PostgREST api key (sent as `apikey` + Bearer). */
    postgrestKey?: string;
    postgrestSchema?: string;
    postgrestHeaders?: Record<string, string> | (() => Record<string, string>);
    /** Injectable fetch for runtimes without a global one (or for tests). */
    fetch?: typeof fetch;
    [key: string]: any;
  } = {};

  private logs = false;
  private logParams = false;

  constructor(
    config: {
      driver?: DBDriver;
      databaseUrl?: string;
      databaseName?: string;
      dir?: string;
      logs?: boolean;
      logParams?: boolean;
      exec?: ExecFn;
      [key: string]: any;
    } = {}
  ) {
    this.config = config;
    this.driver = config.driver ?? "sqlite";
    // Fail at construction, not on the first query in production.
    assertDriverSupported(this.driver);
    this.dir = config.dir;
    this.schema = config.schema;
    this.logs = !!config.logs;
    this.logParams = config.logParams === true && !!config.logs;
    if (config.exec) {
      this.customExec = config.exec;
      this.connected = true;
    }
    // NOTE: autoInstallDrivers intentionally removed. Install your driver
    // (pg, mysql2, mongodb) as a normal dependency. sqlite3/sqlite are
    // optional — only needed when driver="sqlite".
  }

  onConnect?: () => Promise<void>;

  private async defaultExport<T = any>(mod: any): Promise<T> {
    return mod?.default ?? mod;
  }

  async connect() {
    // Without this, N concurrent first-queries during a cold start all pass the
    // `connected` check (it is only set AFTER the await below) and each open
    // their own connection — leaking all but one.
    if (!this._connecting) {
      this._connecting = (async () => {
        await this._connectOnce();
      })();
      // A rejected connection promise must not stay cached: every later call
      // would re-await the same rejection, so one transient failure (a database
      // still booting, a dropped socket) would poison the adapter permanently.
      this._connecting.catch(() => { this._connecting = null; });
    }
    await this._connecting;
  }

  private async _connectOnce(): Promise<void> {
    switch (this.driver) {
      case "sqlite": {
        const filename = this.config.databaseUrl || ":memory:";

        // Fallback chain:
        //   1. better-sqlite3 — sync, fast, most capable
        //   2. sqlite3 + sqlite — async wrapper
        //   3. node:sqlite (Node 22.5+) — built-in, zero deps (last resort)
        //   4. Helpful install error

        let sqliteErr: any;

        // --- 1. Try better-sqlite3 ---
        try {
          // @ts-ignore -- optional peer dep, not in devDependencies
          const mod = await import("better-sqlite3");
          const Database = await this.defaultExport<any>(mod);
          const db = new Database(filename);
          db.pragma("journal_mode = WAL");
          db.pragma("foreign_keys = ON");

          this.sqliteDb = {
            _db: db,
            async all(sql: string, params: any[]) {
              return db.prepare(sql).all(...params);
            },
            async run(sql: string, params: any[]) {
              const r = db.prepare(sql).run(...params);
              return { changes: r.changes, lastID: r.lastInsertRowid };
            },
            async close() { db.close(); },
            _isBetterSqlite: true,
          };
          break;
        } catch {
          // fall through
        }

        // --- 2. Try sqlite3 + sqlite (async wrapper) ---
        try {
          // @ts-ignore -- optional peer deps, not in devDependencies
          const sqlite3Mod = await import("sqlite3");
          const sqlite3 = await this.defaultExport<any>(sqlite3Mod);
          // @ts-ignore -- optional peer dep
          const sqliteMod = await import("sqlite");
          const sqlite = sqliteMod as any;
          this.sqliteDb = await sqlite.open({ filename, driver: sqlite3.Database });
          break;
        } catch {
          // fall through
        }

        // --- 3. Fall back to node:sqlite (Node 22.5+) ---
        try {
          // @ts-ignore — node:sqlite is available from Node 22.5+
          const { DatabaseSync } = await import("node:sqlite");
          const db = new DatabaseSync(filename);
          db.exec("PRAGMA journal_mode = WAL");
          db.exec("PRAGMA foreign_keys = ON");

          const toSqlParam = (v: any) => typeof v === "boolean" ? Number(v) : v;
          this.sqliteDb = {
            _db: db,
            async all(sql: string, params: any[]) {
              const stmt = db.prepare(sql);
              const rows = stmt.all(...params.map(toSqlParam));
              return rows;
            },
            async run(sql: string, params: any[]) {
              const stmt = db.prepare(sql);
              const r = stmt.run(...params.map(toSqlParam));
              return { changes: r.changes, lastID: Number(r.lastInsertRowid) };
            },
            async close() { db.close(); },
            _isNodeSqlite: true,
          };
          break;
        } catch (e) {
          sqliteErr = e;
        }

        // --- 4. Nothing worked — clear error ---
        throw new Error(
          `No SQLite driver found.\n\n` +
          `  Your Node version: ${process.version}\n\n` +
          `Install one of:\n` +
          `  npm install better-sqlite3    (recommended)\n` +
          `  npm install sqlite3 sqlite     (async wrapper)\n` +
          `  # Or upgrade to Node 22.5+ to use the built-in driver.\n` +
          `\nOriginal error: ${(sqliteErr as any)?.message ?? sqliteErr}`
        );
      }

      case "mysql": {
        try {
          const mod = await import("mysql2/promise");
          const mysql = await this.defaultExport<any>(mod);
          this.mysqlConn = await mysql.createConnection({
            uri: this.config.databaseUrl,
          });
        } catch (err) {
          throw describeDriverFailure("MySQL", "mysql2", err);
        }
        break;
      }

      case "postgres": {
        try {
          const mod = await import("pg");
          const pg = await this.defaultExport<any>(mod);

          // node-postgres returns int8 (bigint) and numeric as STRINGS by
          // default, because a JS number cannot hold the full int64 range.
          // That silently breaks every aggregate: `COUNT(id)` arrives as "2",
          // so `typeof row.count === "number"` is false and arithmetic on it
          // yields NaN. COUNT/SUM/AVG/window functions all came back as text.
          //
          // The exactness trade-off is the right one here: an ORM's job is to
          // hand back usable rows, and a row count that is a string is wrong
          // for essentially every caller. Values beyond 2^53 lose precision,
          // which is an acceptable and documented trade for row counts.
          const types = pg.types;
          if (types?.setTypeParser) {
            types.setTypeParser(20, (v: string) => parseInt(v, 10));   // int8
            types.setTypeParser(1700, (v: string) => parseFloat(v));   // numeric
            types.setTypeParser(21, (v: string) => parseInt(v, 10));   // int2
            types.setTypeParser(23, (v: string) => parseInt(v, 10));   // int4
          }

          // `poolSize` was accepted but never read — the adapter always opened
          // ONE dedicated connection. In serverless that means one connection
          // per cold-start replica, which is the textbook route to Postgres
          // max_connections exhaustion. Honour the option now.
          const poolSize = Number(this.config.poolSize ?? 0) || 0;
          if (poolSize > 1) {
            const PoolCtor = pg.Pool;
            if (!PoolCtor) {
              throw new Error("poolSize > 1 requires pg's Pool export, which this build of `pg` does not provide.");
            }
            this.pgPool = new PoolCtor({
              connectionString: this.config.databaseUrl,
              max: poolSize,
            });
            this.pgClient = this.pgPool;
            // Validate eagerly so a bad URL fails at connect(), not at query().
            await this.pgPool.query("SELECT 1");
          } else {
            const ClientCtor = pg.Client ?? pg;
            this.pgClient = new ClientCtor({
              connectionString: this.config.databaseUrl,
            });
            await this.pgClient.connect();
          }

          // A `pg` Client is an EventEmitter, and an idle connection closed by
          // a pooler (Supabase, PgBouncer, RDS Proxy, any load balancer that
          // reaps idle sockets) emits an `error` event. With no listener
          // attached, Node rethrows it as an uncaught exception and the whole
          // process dies — observed as `Error: read ECONNABORTED` killing a
          // test run mid-suite. Attach a handler, surface it when logging is
          // on, and mark the adapter disconnected so the next query reconnects
          // instead of reusing a dead socket.
          this.pgClient.on?.("error", (err: any) => {
            if (this.logs) console.error("Postgres connection error:", err?.message ?? err);
            this.connected = false;
            this._connecting = null;
          });
          this.pgPool?.on?.("error", (err: any) => {
            if (this.logs) console.error("Postgres pool error:", err?.message ?? err);
          });
        } catch (err) {
          throw describeDriverFailure("Postgres", "pg", err);
        }
        break;
      }

      case "mongodb": {
        try {
          const mod = await import("mongodb");
          const mongodb = await this.defaultExport<any>(mod);
          const MongoClientClass = mongodb.MongoClient ?? mongodb;
          this._mongoObjectId = mongodb.ObjectId;
          this.mongoClient = new MongoClientClass(this.config.databaseUrl!);
          await this.mongoClient.connect();
          this.mongoDb = this.mongoClient.db(this.config.databaseName);
        } catch (err) {
          const msg = (err as any)?.message ?? String(err);
          const hint = msg.includes("Cannot find module") || msg.includes("not found")
            ? `MongoDB driver not found. Install it:\n  npm install mongodb\n\n`
            : "";
          throw new Error(`${hint}MongoDB connection failed: ${msg}`, { cause: err });
        }
        break;
      }

      case "postgrest":
        // Nothing to connect: PostgREST is stateless HTTP. The client is built
        // lazily on first exec so importing this module stays socket-free.
        this.connected = true;
        break;

      default:
        throw new Error(`Driver "${this.driver}" not implemented`);
    }

    this.connected = true;
    if (this.onConnect) await this.onConnect();
  }

  private _pgrest: any = null;

  private async execPostgrest(commandOrJson: string): Promise<SQLExecResult> {
    if (!this._pgrest) {
      const { PostgrestClient } = await import("./postgrest.js");
      const url = this.config.postgrestUrl ?? (this.config.databaseUrl || "");
      this._pgrest = new PostgrestClient({
        url,
        key: this.config.postgrestKey ?? (this.config.databaseUrl || undefined),
        schema: this.config.postgrestSchema,
        headers: this.config.postgrestHeaders,
        fetch: this.config.fetch,
      });
    }

    let cmd: any;
    try {
      cmd = typeof commandOrJson === "string" ? JSON.parse(commandOrJson) : commandOrJson;
    } catch {
      throw new Error(
        "The PostgREST path expected a JSON command but received something else. " +
          "This usually means raw SQL was passed to a postgrest-driver instance — " +
          "PostgREST has no SQL surface. Use the query builder instead.",
      );
    }

    if (this.logs) console.log("EXEC (postgrest):", JSON.stringify(cmd));
    const r = await this._pgrest.execute(cmd);
    // `total` carries the Content-Range count used by Model.count().
    return { rows: r.rows, changes: r.changes, lastID: null, total: r.total } as any;
  }

  async exec(sqlOrOp: string, params: any[] = []): Promise<SQLExecResult> {
    if (this.customExec) {
      return this.customExec(sqlOrOp, params);
    }

    // PostgREST rides on fetch — no driver package, no TCP socket. This is the
    // branch that makes Vercel Edge / Workers / Deno actually work.
    if (this.driver === "postgrest") {
      return this.execPostgrest(sqlOrOp);
    }

    await this.connect();

    switch (this.driver) {
      case "sqlite": {
        const sql = sqlOrOp.trim();
        try {
          if (/^(SELECT|PRAGMA|WITH)/i.test(sql)) {
            if (this.logs) console.log("EXEC (sqlite select):", sql, redactParams(params, this.logParams));
            let stmt = this.stmtCache.get(sql);
            if (!stmt) {
              stmt = { _prepared: sql }; // placeholder for cache key
              this.stmtCache.set(sql, stmt);
              if (this.stmtCache.size > this.stmtCacheMax) {
                const first = this.stmtCache.keys().next();
                if (!first.done) this.stmtCache.delete(first.value);
              }
            }
            const rows = await this.sqliteDb!.all(sql, params);
            return { rows: Array.isArray(rows) ? rows : [] };
          } else {
            if (this.logs) console.log("EXEC (sqlite run):", sql, redactParams(params, this.logParams));
            const result = await this.sqliteDb!.run(sql, params);
            return { rows: [], changes: result?.changes, lastID: result?.lastID ?? result?.lastInsertRowid };
          }
        } catch (err) {
          if (this.logs) console.error("SQL ERROR:", sql, redactParams(params, this.logParams), (err as any)?.message ?? err);
          throw err;
        }
      }

      case "mysql": {
        if (this.logs) console.log("EXEC (mysql):", sqlOrOp, redactParams(params, this.logParams));
        const [result] = await this.mysqlConn!.execute(sqlOrOp, params);
        if (Array.isArray(result)) {
          return { rows: result };
        } else {
          return { rows: [], changes: (result as any).affectedRows, lastID: (result as any).insertId };
        }
      }

      case "postgres": {
        if (this.logs) console.log("EXEC (postgres):", sqlOrOp, redactParams(params, this.logParams));
        let pgSql = sqlOrOp;
        if (params?.length && pgSql.includes("?")) {
          let idx = 0;
          pgSql = pgSql.replace(/\?/g, () => `$${++idx}`);
        }
        const res = await this.pgClient!.query(pgSql, params);
        return { rows: res.rows, changes: res.rowCount ?? 0 };
      }

      case "mongodb": {
        if (this.logs) console.log("EXEC (mongodb):", redactMongoCommand(sqlOrOp, this.logParams), redactParams(params, this.logParams));
        if (!this.mongoDb) throw new Error("MongoDB not initialized");
        const cmd = JSON.parse(sqlOrOp);

        // Map id ↔ _id transparently for MongoDB
        const OID = this._mongoObjectId;
        const toObjectId = (v: any) =>
          typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v) && OID ? new OID(v) : v;
        const mongoId = (key: string) => key === "id" ? "_id" : key;
        const mapIdToMongo = (obj: any): any => {
          if (!obj || typeof obj !== "object") return obj;
          if (Array.isArray(obj)) return obj.map(mapIdToMongo);
          const out: any = {};
          for (const [k, v] of Object.entries(obj)) {
            out[mongoId(k)] = toObjectId(v);
          }
          return out;
        };
        const mapMongoToId = (obj: any): any => {
          if (!obj || typeof obj !== "object") return obj;
          if (Array.isArray(obj)) return obj.map(mapMongoToId);
          const out: any = {};
          for (let [k, v] of Object.entries(obj)) {
            if (k === "_id") { k = "id"; v = String(v); }
            out[k] = v;
          }
          return out;
        };

        const filter = cmd.filter ? mapIdToMongo(cmd.filter) : {};
        const col = this.mongoDb.collection(cmd.collection);
        const sess = this._mongoSession ? { session: this._mongoSession } : {};
        switch (cmd.action) {
          case "find": {
            let cursor = col.find(filter, sess);
            if (cmd.sort) cursor = cursor.sort(cmd.sort);
            if (cmd.skip) cursor = cursor.skip(cmd.skip);
            if (cmd.limit) cursor = cursor.limit(cmd.limit);
            const rows = await cursor.toArray();
            return { rows: rows.map(mapMongoToId) };
          }
          case "insert": {
            const data = cmd.data.map((d: any) => mapIdToMongo(d));
            await col.insertMany(data, sess);
            return { rows: data.map(mapMongoToId) };
          }
          case "update": {
            const setData = mapIdToMongo(cmd.data);
            const r = await col.updateMany(filter, { $set: setData }, sess);
            return { rows: [], changes: r.modifiedCount };
          }
          case "delete": {
            const r = await col.deleteMany(filter, sess);
            return { rows: [], changes: r.deletedCount };
          }
          case "count":
            return { rows: [{ count: await col.countDocuments(filter, sess) }] };
          case "createCollection": {
            const names = await this.mongoDb.listCollections({ name: cmd.collection }, { nameOnly: true, ...sess }).toArray();
            if (!names.length) await this.mongoDb.createCollection(cmd.collection, sess);
            return { rows: [] };
          }
          case "aggregate": {
            const rows = await col.aggregate(cmd.pipeline || [], { ...sess }).toArray();
            return { rows: rows.map(mapMongoToId) };
          }
          case "createIndex": {
            await col.createIndex(cmd.spec, { ...(cmd.options || {}), ...sess });
            return { rows: [] };
          }
          case "listIndexes": {
            try {
              const indexes = await col.listIndexes(sess).toArray();
              return { rows: indexes };
            } catch {
              return { rows: [] };
            }
          }
          case "collectionExists": {
            const names = await this.mongoDb.listCollections({ name: cmd.collection }, { nameOnly: true, ...sess }).toArray();
            return { rows: [], exists: names.length > 0 };
          }
          default:
            throw new Error(`Unknown Mongo action ${cmd.action}`);
        }
      }

      default:
        throw new Error(`Unsupported driver: ${this.driver}`);
    }
  }

  async startMongoTransaction(): Promise<any> {
    if (this.driver !== "mongodb" || !this.mongoClient) return null;
    const session = this.mongoClient.startSession();
    session.startTransaction();
    this._mongoSession = session;
    return session;
  }

  async commitMongoTransaction(): Promise<void> {
    if (!this._mongoSession) return;
    try {
      await this._mongoSession.commitTransaction();
    } finally {
      await this._mongoSession.endSession();
      this._mongoSession = null;
    }
  }

  async abortMongoTransaction(): Promise<void> {
    if (!this._mongoSession) return;
    try {
      await this._mongoSession.abortTransaction();
    } finally {
      await this._mongoSession.endSession();
      this._mongoSession = null;
    }
  }

  /**
   * Await a driver's `end()`, but never longer than SLINTORM_CLOSE_TIMEOUT_MS.
   *
   * `end()` waits for every pooled client to be released. If a test left a
   * transaction open, a query in flight, or a socket already dead, it blocks
   * forever — and because shutdown happens AFTER the suite prints its results,
   * the hang is invisible: CI reports a job timeout on a log that ends with
   * "233/233 passed" and nothing after it.
   *
   * On timeout, hard-destroy the remaining sockets so the process can exit.
   */
  private async endBounded(closeFn: () => Promise<unknown>): Promise<void> {
    const ms = Number(process.env.SLINTORM_CLOSE_TIMEOUT_MS ?? 5_000);
    let timer: any;
    try {
      await Promise.race([
        Promise.resolve().then(closeFn),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            for (const c of [this.pgPool, this.pgClient] as any[]) {
              const list = c?.pool?.clients ?? (c?.connection ? [c] : []);
              for (const cl of list) {
                try { cl.end?.(true); } catch { /* already gone */ }
                try { cl.connection?.stream?.destroy?.(); } catch { /* already gone */ }
              }
            }
            resolve();
          }, ms);
        }),
      ]);
    } catch { /* a driver that throws while closing must not fail the run */ }
    finally { clearTimeout(timer); }
  }

  async close() {
    switch (this.driver) {
      case "sqlite":
        if (this.sqliteDb?.close) await this.sqliteDb.close();
        break;
      case "mysql":
        if (this.mysqlConn) await this.endBounded(() => this.mysqlConn!.end());
        break;
      case "postgres":
        // `end()` waits for every pooled client to be released. If a test left
        // a transaction open, a query in flight, or a socket already dead, it
        // blocks forever — and because this runs AFTER the suite has printed
        // its results, the hang is invisible: CI reports a job timeout with a
        // log that ends on "233/233 passed".
        if (this.pgPool) await this.endBounded(() => this.pgPool!.end());
        else if (this.pgClient) await this.endBounded(() => this.pgClient!.end());
        this.pgPool = null;
        break;
      case "mongodb":
        if (this.mongoClient) await this.mongoClient.close();
        break;
    }
    this.connected = false;
    this._connecting = null;
  }

  async connectReplicas() {
    const replicaUrls = this.config.replicas;
    if (!replicaUrls?.length) return;
    for (const url of replicaUrls) {
      try {
        if (this.driver === "postgres") {
          const mod = await import("pg");
          const pg = await this.defaultExport<any>(mod);
          const client = new (pg.Client ?? pg)({ connectionString: url });
          await client.connect();
          if (!this.replicaPools.pg) this.replicaPools.pg = [];
          this.replicaPools.pg.push(client);
        } else if (this.driver === "mysql") {
          const mod = await import("mysql2/promise");
          const mysql = await this.defaultExport<any>(mod);
          const conn = await mysql.createConnection({ uri: url });
          if (!this.replicaPools.mysql) this.replicaPools.mysql = [];
          this.replicaPools.mysql.push(conn);
        }
      } catch {}
    }
  }

  async execRead(sqlOrOp: string, params: any[] = []): Promise<SQLExecResult> {
    await this.connect();
    const replicas = this.driver === "postgres" ? this.replicaPools.pg
      : this.driver === "mysql" ? this.replicaPools.mysql
      : null;
    if (!replicas?.length) return this.exec(sqlOrOp, params);

    this.replicaIndex = (this.replicaIndex + 1) % replicas.length;
    const replica = replicas[this.replicaIndex];

    if (this.logs) console.log("EXEC (read replica):", sqlOrOp, redactParams(params, this.logParams));
    try {
      if (this.driver === "postgres") {
        const res = await replica.query(sqlOrOp, params);
        return { rows: res.rows, changes: res.rowCount ?? 0 };
      } else if (this.driver === "mysql") {
        const [result] = await replica.execute(sqlOrOp, params);
        return { rows: Array.isArray(result) ? result : [] };
      }
    } catch {
      return this.exec(sqlOrOp, params);
    }
    return this.exec(sqlOrOp, params);
  }

  async getTableInfo(table: string) {
    await this.connect();
    switch (this.driver) {
      case "sqlite":
        // PRAGMA does not accept bound parameters, so the identifier must be
        // quoted — it was interpolated raw here.
        return await this.sqliteDb!.all(`PRAGMA table_info(${quoteIdentifier("sqlite", table)})`, []);
      case "mysql":
        return (await this.mysqlConn!.execute(`DESCRIBE ${quoteIdentifier("mysql", table)}`))[0];
      case "postgres": {
        const res = await this.pgClient!.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1`,
          [table]
        );
        return res.rows;
      }
      case "mongodb": {
        if (!this.mongoDb) return [];
        const sample = await this.mongoDb.collection(table).findOne({});
        return sample ? Object.keys(sample).map((k) => ({ name: k })) : [];
      }
      default:
        return [];
    }
  }
}
