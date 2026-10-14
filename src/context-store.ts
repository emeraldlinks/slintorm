/**
 * Request-scoped context storage.
 *
 * The RLS tenant context used to live in a single mutable field on the ORM
 * instance (`this._context`), read at EXECUTE time rather than when the query
 * was built. One ORMManager serves every concurrent request in a Node process,
 * so two in-flight requests overwrote each other's tenant across every `await`
 * — a direct cross-tenant disclosure path, and the documented per-request usage
 * pattern (`orm.withContext({ userId })`) was guaranteed to race.
 *
 * `AsyncLocalStorage` fixes that: each async execution context gets its own
 * store, so interleaved requests cannot see each other's values.
 *
 * Edge runtimes (Vercel Edge, Workers, Deno) have no `node:async_hooks`. This
 * module therefore loads it WITHOUT a static import — a static
 * `import "node:async_hooks"` would execute at module load and break every edge
 * bundle. It resolves the constructor through `process.getBuiltinModule()`,
 * which is synchronous and edge-safe (where `process` is simply absent), and
 * degrades to the legacy single-slot behaviour when unavailable.
 */

type Ctx = Record<string, any>;

interface ALS {
  getStore(): Ctx | undefined;
  enterWith(store: Ctx): void;
  run<R>(store: Ctx, fn: () => R): R;
}

let _als: ALS | null | undefined; // undefined = not yet probed

function probe(): ALS | null {
  if (_als !== undefined) return _als;
  _als = null;
  try {
    const proc = (globalThis as any).process;
    if (!proc?.versions?.node) return _als; // edge runtime
    const mod = typeof proc.getBuiltinModule === "function"
      ? proc.getBuiltinModule("node:async_hooks")
      : null;
    const Ctor = mod?.AsyncLocalStorage;
    if (Ctor) _als = new Ctor() as ALS;
  } catch {
    _als = null;
  }
  return _als;
}

/** True when true per-request isolation is available (Node >= 22.3). */
export function hasAsyncContext(): boolean {
  return probe() !== null;
}

/** The current context for this async execution context. */
export function getCurrentContext(fallback: Ctx): Ctx {
  return probe()?.getStore() ?? fallback;
}

/** Merge into the current async context. */
export function setCurrentContext(merge: Ctx, fallback: Ctx): Ctx {
  const als = probe();
  if (als) {
    const next = { ...(als.getStore() ?? fallback), ...merge };
    als.enterWith(next);
    return next;
  }
  // No AsyncLocalStorage (edge runtime): write THROUGH to the shared object,
  // otherwise the merge is computed and discarded and withContext() silently
  // does nothing.
  for (const [k, v] of Object.entries(merge)) fallback[k] = v;
  return fallback;
}

/** Replace the current async context wholesale. */
export function replaceCurrentContext(next: Ctx, fallback: Ctx): Ctx {
  const als = probe();
  if (als) {
    als.enterWith(next);
    return next;
  }
  for (const k of Object.keys(fallback)) delete fallback[k];
  Object.assign(fallback, next);
  return fallback;
}

/**
 * Run `fn` with an isolated context. This is the SAFE form: `runWithContext`
 * scopes the context to `fn` and to anything it awaits, so concurrent callers
 * cannot observe each other's tenant.
 *
 * On runtimes without AsyncLocalStorage there is no way to scope context across
 * an async boundary, so the context is applied for the synchronous portion and
 * restored once the returned promise settles. Concurrent `runWithContext` calls
 * are therefore NOT isolated there — check `hasAsyncContext()` if that matters.
 */
export function runWithContext<R>(ctx: Ctx, fallback: Ctx, fn: () => R): R {
  const als = probe();
  if (als) return als.run({ ...(als.getStore() ?? fallback), ...ctx }, fn);

  const saved = { ...fallback };
  Object.assign(fallback, ctx);
  const restore = () => {
    for (const k of Object.keys(fallback)) delete fallback[k];
    Object.assign(fallback, saved);
  };

  let result: R;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  // If fn returned a promise, hold the context until it settles — restoring
  // synchronously would clear it before any awaited body ran.
  if (result && typeof (result as any).then === "function") {
    return (result as any).then(
      (v: any) => { restore(); return v; },
      (e: any) => { restore(); throw e; },
    );
  }
  restore();
  return result;
}

/**
 * Serialise work that must not interleave with other work sharing mutable
 * session state (e.g. `set_config` followed by the query it scopes).
 *
 * Implemented as a promise chain rather than a worker pool, so it works on any
 * runtime and does not reorder anything that was previously safe to run
 * concurrently.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    // Keep the chain alive regardless of rejection.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}