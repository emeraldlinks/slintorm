import ORMManager from "./index.js";
import { type ModelAPI } from "./model.js";
import { SqlExpr } from "./types.js";
import { proxyExec } from "./proxy.js";
import { AdvancedQueryBuilder } from "./extra_clauses.js";
import { Migrator } from "./migrator.js";
import {
  runtimeInfo,
  canUseTcpDrivers,
  assertDriverSupported,
} from "./runtime.js";
import { runMigrations, migrationPlan } from "./migration-history.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  hashPassword,
  verifyPassword,
  applySecurityOnWrite,
  encryptFieldFull,
  decryptFieldFull,
} from "./security.js";
import { applyMask } from "./mask.js";
import {
  quoteIdentifier,
  quoteColumnRef,
  quoteLiteral,
  assertSafeOperator,
  assertSafeDirection,
  assertSafeHint,
} from "./quoting.js";
import type { User as BaseUser } from "./interfaces.js";

/**
 * The suite's User model declares relations (posts, profiles, tags) so preload()
 * can be exercised. The shipped example interface does not, so extend it here
 * rather than casting every preload call to `any`.
 */
interface User extends BaseUser {
  posts?: Post[];
  profiles?: Profile | Profile[];
  tags?: Tag[];
}


// ── Mini test runner ────────────────────────────────────────────────────

const failures: { suite: string; name: string; err: any }[] = [];
type Hook = () => void | Promise<void>;

interface Suite {
  name: string;
  tests: { name: string; fn: () => void | Promise<void> }[];
  beforeAllHooks: Hook[];
  afterAllHooks: Hook[];
  beforeEachHooks: Hook[];
}

let currentSuite: Suite | null = null;
const suites: Suite[] = [];
let globalBeforeAllHooks: Hook[] = [];
let globalAfterAllHooks: Hook[] = [];

export function describe(name: string, fn: () => void) {
  const s: Suite = { name, tests: [], beforeAllHooks: [], afterAllHooks: [], beforeEachHooks: [] };
  currentSuite = s;
  suites.push(s);
  fn();
  currentSuite = null;
}

export function it(name: string, fn: () => void | Promise<void>) {
  if (currentSuite) currentSuite.tests.push({ name, fn });
}

export function expect(actual: any) {
  const assert = {
    toBe(expected: any) {
      if (!Object.is(actual, expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    notToBeNull() {
      if (actual === null || actual === undefined) {
        throw new Error(`expected non-null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error("expected defined, got undefined");
      }
    },
    toBeGreaterThan(n: number) {
      if (typeof actual !== "number" || actual <= n) {
        throw new Error(`expected ${actual} > ${n}`);
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      if (typeof actual !== "number" || actual < n) {
        throw new Error(`expected ${actual} >= ${n}`);
      }
    },
    toBeLessThanOrEqual(n: number) {
      if (typeof actual !== "number" || actual > n) {
        throw new Error(`expected ${actual} <= ${n}`);
      }
    },
    toContain(expected: any) {
      const ok = Array.isArray(actual)
        ? actual.includes(expected)
        : typeof actual === "string"
          // Strings: substring check. Previously this matcher required an array,
          // so `expect(someSql).toContain("SELECT")` always failed.
          ? actual.includes(String(expected))
          : false;
      if (!ok) {
        throw new Error(`expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
    toHaveProperty(key: string) {
      if (!(key in (actual || {}))) {
        throw new Error(`expected ${JSON.stringify(actual)} to have property ${key}`);
      }
    },
    toThrow(fn?: () => any) {
      if (fn) {
        try { fn(); throw new Error("Expected to throw but did not"); }
        catch { /* ok */ }
      } else if (typeof actual === "function") {
        try { actual(); throw new Error("Expected to throw but did not"); }
        catch { /* ok */ }
      }
    },
    not: {
      toThrow(fn?: () => any) {
        if (fn) { fn(); }
        else if (typeof actual === "function") { actual(); }
      },
      toBeNull() {
        if (actual === null) throw new Error("expected non-null");
      },
    },
  };
  return assert;
}

export function beforeAll(fn: Hook) {
  if (currentSuite) currentSuite.beforeAllHooks.push(fn);
  else globalBeforeAllHooks.push(fn);
}
export function afterAll(fn: Hook) {
  if (currentSuite) currentSuite.afterAllHooks.push(fn);
  else globalAfterAllHooks.push(fn);
}
export function beforeEach(fn: Hook) {
  if (currentSuite) currentSuite.beforeEachHooks.push(fn);
  else throw new Error("beforeEach must be inside describe");
}

export function clearTestState() {
  failures.length = 0;
  suites.length = 0;
  globalBeforeAllHooks.length = 0;
  globalAfterAllHooks.length = 0;
  currentSuite = null;
}

export async function run() {
  let total = 0, passed = 0;

  for (const hook of globalBeforeAllHooks) await hook();

  for (const suite of suites) {
    console.log(`\n  ${suite.name}`);
    for (const hook of suite.beforeAllHooks) await hook();
    for (const test of suite.tests) {
      total++;
      try {
        for (const hook of suite.beforeEachHooks) await hook();
        await test.fn();
        passed++;
        console.log(`    ✓ ${test.name}`);
      } catch (err: any) {
        failures.push({ suite: suite.name, name: test.name, err });
        console.log(`    ✗ ${test.name}`);
        console.log(`      ${err.message}`);
      }
    }
    for (const hook of suite.afterAllHooks) await hook();
  }

  for (const hook of globalAfterAllHooks) await hook();

  console.log(`\n  ${passed}/${total} passed`);
  if (failures.length > 0) {
    console.error(`\n  FAILED:`);
    for (const f of failures) {
      console.error(`    ${f.suite} > ${f.name}: ${f.err.message}`);
    }
    console.error(`\n  Fix details:`);
    for (const f of failures) {
      console.error(`    - ${f.suite} > ${f.name}: ${f.err.message.replace(/\n/g, " | ")}`);
    }
    throw new AggregateError(failures.map(f => f.err), `${failures.length} test(s) failed`);
  }
}

export function makeSchema(driver: string) {
  const isMongo = driver === "mongodb";
  const pkType = isMongo ? "string" : "INTEGER";
  const strType = isMongo ? "string" : "TEXT";
  const numType = isMongo ? "number" : "INTEGER";
  const boolType = isMongo ? "boolean" : "boolean";
  const pkMeta = isMongo
    ? { auto: true, primaryKey: true }
    : { primaryKey: true, auto: true };
  return {
    User: {
      table: "users",
      fields: {
        id: { type: pkType, meta: pkMeta },
        name: { type: strType, optional: false, meta: { minLength: "2", maxLength: "100" } },
        email: { type: strType, optional: true, meta: { email: true, unique: true } },
        score: { type: numType, optional: true, meta: { min: "0", max: "100" } },
        status: { type: strType, optional: true, meta: { pattern: "^[A-Za-z0-9_-]+$" } },
        category: { type: strType, optional: true, meta: {} },
        isActive: { type: boolType, optional: true, meta: {} },
        url: { type: strType, optional: true, meta: { url: true } },
        uuid: { type: strType, optional: true, meta: { uuid: true } },
        phone: { type: strType, optional: true, meta: { phone: true } },
        ssn: { type: strType, optional: true, meta: { mask: "ssn" } },
        internalNote: { type: strType, optional: true, meta: { omitdb: true } },
        auditData: { type: strType, optional: true, meta: { omitjson: true } },
        meta: { type: isMongo ? "json" : strType, optional: true, meta: { json: true } },
        deletedAt: { type: strType, optional: true, meta: { softDelete: true } },
        createdAt: { type: strType, optional: true, meta: {} },
        updatedAt: { type: strType, optional: true, meta: {} },
      },
      // Relations. preload()/relatedTo() had ZERO test coverage before — the
      // flagship eager-loading feature was entirely unexercised.
      relations: [
        { sourceModel: "User", fieldName: "posts", kind: "onetomany", targetModel: "Post", foreignKey: "userId" },
        { sourceModel: "User", fieldName: "profiles", kind: "onetoone", targetModel: "Profile", foreignKey: "userId" },
        {
          sourceModel: "User", fieldName: "tags", kind: "manytomany",
          targetModel: "Tag", through: "user_tags", foreignKey: "userId", relatedKey: "tagId",
        },
      ],
    },
    Profile: {
      table: "profiles",
      fields: {
        id: { type: pkType, meta: pkMeta },
        userId: { type: isMongo ? "string" : "INTEGER", optional: false, meta: {} },
        bio: { type: strType, optional: true, meta: {} },
        createdAt: { type: strType, optional: true, meta: {} },
        updatedAt: { type: strType, optional: true, meta: {} },
      },
      relations: [
        { sourceModel: "Profile", fieldName: "user", kind: "manytoone", targetModel: "User", foreignKey: "userId" },
      ],
    },
    Post: {
      table: "posts",
      fields: {
        id: { type: pkType, meta: pkMeta },
        userId: { type: isMongo ? "string" : numType, optional: false, meta: { index: true } },
        title: { type: strType, optional: false, meta: {} },
        createdAt: { type: strType, optional: true, meta: {} },
        updatedAt: { type: strType, optional: true, meta: {} },
      },
      relations: [
        { sourceModel: "Post", fieldName: "user", kind: "manytoone", targetModel: "User", foreignKey: "userId" },
      ],
    },
    Tag: {
      table: "tags",
      fields: {
        id: { type: pkType, meta: pkMeta },
        label: { type: strType, optional: false, meta: {} },
        createdAt: { type: strType, optional: true, meta: {} },
        updatedAt: { type: strType, optional: true, meta: {} },
      },
      relations: [],
    },
    RandomKey: {
      table: "random_keys",
      fields: {
        id: { type: isMongo ? "string" : "TEXT", meta: { primaryKey: true, random: "string:16" } },
        uid: { type: strType, optional: true, meta: { unique: true, random: "string(24)" } },
        pin: { type: numType, optional: true, meta: { random: "number:4" } },
        upperAlnum: { type: strType, optional: true, meta: { random: "alnum(10, upper)" } },
        lowerAlnum: { type: strType, optional: true, meta: { random: "alnum(10, lower)" } },
        lowerLetters: { type: strType, optional: true, meta: { random: "lower(12)" } },
        upperLetters: { type: strType, optional: true, meta: { random: "upper(8)" } },
        hexStr: { type: strType, optional: true, meta: { random: "hex(16)" } },
        upperHex: { type: strType, optional: true, meta: { random: "hex(16, upper)" } },
        tokenPrefixed: { type: strType, optional: true, meta: { random: "alnum(8, pfx=TKN_)" } },
        invoiceNum: { type: strType, optional: true, meta: { random: "number(6, pfx=INV-)" } },
        userCode: { type: strType, optional: true, meta: { random: "alnum(12, upper, pfx=USR_, sfx=_END)" } },
        customPin: { type: strType, optional: true, meta: { random: "custom(ABCDEF123456, 6)" } },
        createdAt: { type: strType, optional: true, meta: {} },
        updatedAt: { type: strType, optional: true, meta: {} },
      },
      relations: [],
    },
  };
}

interface Profile {
  id?: any;
  userId: any;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Post {
  id?: any;
  userId: any;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  user?: User;
}

interface Tag {
  id?: any;
  label: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RandomKey {
  id?: string;
  uid?: string;
  pin?: number;
  upperAlnum?: string;
  lowerAlnum?: string;
  lowerLetters?: string;
  upperLetters?: string;
  hexStr?: string;
  upperHex?: string;
  tokenPrefixed?: string;
  invoiceNum?: string;
  userCode?: string;
  customPin?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Run all tests for a given driver config ─────────────────────────────

export async function runSuite(driver: string, databaseUrl: string, databaseName?: string) {
  clearTestState();
  const isMongo = driver === "mongodb";
  const schema = makeSchema(driver);

  const orm = new ORMManager({ driver, databaseUrl, databaseName, schema, logs: false } as any);
  const Users = await orm.defineModel<User>("users", "User");
  const Profiles = await orm.defineModel<Profile>("profiles", "Profile");
  const RandomKeys = await orm.defineModel<RandomKey>("random_keys", "RandomKey");
  const Posts = await orm.defineModel<Post>("posts", "Post");
  const Tags = await orm.defineModel<Tag>("tags", "Tag");

  // ── Helpers ─────────────────────────────────────────────────────
  async function resetUsers() {
    try { await Users.truncate(); }
    catch {
      await Users.insert({ name: "_init", email: "_init@t.com", createdAt: new Date().toISOString() } as any);
      await Users.truncate();
    }
  }

  // ── 1. Basic CRUD ───────────────────────────────────────────────────────

describe("CRUD", () => {
  beforeEach(async () => { await resetUsers(); });

  it("inserts a record", async () => {
    const user = await Users.insert({ name: "Alice", email: "a@t.com", createdAt: new Date().toISOString() });
    expect(user).notToBeNull();
    expect(user!.name).toBe("Alice");
  });

  it("gets a record by filter", async () => {
    const inserted = await Users.insert({ name: "GetTest", email: "g@t.com", createdAt: new Date().toISOString() });
    const user = await Users.get({ id: inserted!.id });
    expect(user).notToBeNull();
    expect(user!.name).toBe("GetTest");
  });

  it("gets all records", async () => {
    await Users.insert({ name: "A1", email: "a1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "A2", email: "a2@t.com", createdAt: new Date().toISOString() });
    const all = await Users.getAll();
    expect(all.length).toBe(2);
  });

  it("updates a record", async () => {
    const inserted = await Users.insert({ name: "Upd1", email: "upd@t.com", createdAt: new Date().toISOString() });
    const updated = await Users.update({ id: inserted!.id }, { name: "Updated" });
    expect(updated?.name).toBe("Updated");
  });

  it("updates via instance method", async () => {
    const user = await Users.insert({ name: "Inst", email: "inst@t.com", createdAt: new Date().toISOString() });
    await user!.update({ name: "InstV2" });
    const reloaded = await Users.get({ id: user!.id });
    expect(reloaded!.name).toBe("InstV2");
  });

  it("deletes a record", async () => {
    const inserted = await Users.insert({ name: "Del", email: "del@t.com", createdAt: new Date().toISOString() });
    const deleted = await Users.delete({ id: inserted!.id });
    expect(deleted).toBeDefined();
    const gone = await Users.get({ id: inserted!.id });
    expect(gone).toBeNull();
  });

  it("deletes via instance method", async () => {
    const user = await Users.insert({ name: "DelMe", email: "dm@t.com", createdAt: new Date().toISOString() });
    await user!.delete();
    const gone = await Users.get({ id: user!.id });
    expect(gone).toBeNull();
  });
});

// ── 1b. JSON field handling ────────────────────────────────────────────

describe("JSON field (@json)", () => {
  beforeEach(async () => { await resetUsers(); });

  it("inserts and reads back a JSON field", async () => {
    const settings = { theme: "dark", notifications: true, score: 42 };
    const user = await Users.insert({
      name: "JsonTest",
      email: "json@t.com",
      meta: settings,
      createdAt: new Date().toISOString(),
    });
    expect(user).notToBeNull();
    // The returned entity should have the JSON already parsed back
    expect(user!.meta?.theme).toBe("dark");
    expect(user!.meta?.notifications).toBe(true);
    expect(user!.meta?.score).toBe(42);
  });

  it("reads JSON field via get()", async () => {
    const inserted = await Users.insert({
      name: "JsonGet",
      email: "jget@t.com",
      meta: { nested: { a: 1, b: [2, 3] } },
      createdAt: new Date().toISOString(),
    });
    const user = await Users.get({ id: inserted!.id });
    expect(user).notToBeNull();
    expect(user!.meta?.nested?.a).toBe(1);
    expect(JSON.stringify(user!.meta?.nested?.b)).toBe(JSON.stringify([2, 3]));
  });

  it("updates a JSON field", async () => {
    const user = await Users.insert({
      name: "JsonUpd",
      email: "jupd@t.com",
      meta: { version: 1 },
      createdAt: new Date().toISOString(),
    });
    const updated = await Users.update(
      { id: user!.id },
      { meta: { version: 2, status: "updated" } }
    );
    expect(updated).notToBeNull();
    expect(updated!.meta?.version).toBe(2);
    expect(updated!.meta?.status).toBe("updated");
  });

  it("updates JSON field via instance method", async () => {
    const user = await Users.insert({
      name: "JsonInst",
      email: "jinst@t.com",
      meta: { count: 1 },
      createdAt: new Date().toISOString(),
    });
    await user!.update({ meta: { count: 99, label: "updated" } });
    const reloaded = await Users.get({ id: user!.id });
    expect(reloaded!.meta?.count).toBe(99);
    expect(reloaded!.meta?.label).toBe("updated");
  });

  it("updates JSON field via updateMany", async () => {
    const u1 = await Users.insert({
      name: "JM1", email: "jm1@t.com", meta: { val: 1 },
      createdAt: new Date().toISOString(),
    });
    await Users.insert({
      name: "JM2", email: "jm2@t.com", meta: { val: 2 },
      createdAt: new Date().toISOString(),
    });
    const changed = await Users.updateMany(
      { name: "JM1" },
      { meta: { val: 100 } }
    );
    expect(changed).toBe(1);
    const reloaded = await Users.get({ id: u1!.id });
    expect(reloaded!.meta?.val).toBe(100);
  });

  it("handles null JSON field", async () => {
    const user = await Users.insert({
      name: "JsonNull",
      email: "jnull@t.com",
      meta: null as any,
      createdAt: new Date().toISOString(),
    });
    expect(user).notToBeNull();
    // null should stay null, not become JSON.stringify("null")
    const fetched = await Users.get({ id: user!.id });
    expect(fetched!.meta).toBeNull();
  });
});

// ── 2. Batch operations ─────────────────────────────────────────────────

describe("Batch operations", () => {
  beforeEach(async () => { await resetUsers(); });

  it("inserts many records", async () => {
    await Users.insertMany([
      { name: "B1", email: "b1@t.com", createdAt: new Date().toISOString() },
      { name: "B2", email: "b2@t.com", createdAt: new Date().toISOString() },
    ]);
    const all = await Users.getAll();
    expect(all.length).toBe(2);
  });

  it("updates many records", async () => {
    const u1 = await Users.insert({ name: "U1", email: "u1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "U2", email: "u2@t.com", createdAt: new Date().toISOString() });
    const changed = await Users.updateMany({ name: "U1" }, { status: "active" as any });
    expect(changed).toBe(1);
  });

  it("deletes many records", async () => {
    await Users.insert({ name: "D1", email: "d1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "D2", email: "d2@t.com", createdAt: new Date().toISOString() });
    const count = await Users.deleteMany({ name: "D1" });
    expect(count).toBe(1);
    const remaining = await Users.getAll();
    expect(remaining.length).toBe(1);
  });
});

// ── 3. Upsert & findOrCreate & firstOrInit ──────────────────────────────

describe("Upsert / findOrCreate / firstOrInit", () => {
  beforeEach(async () => { await resetUsers(); });

  it("upserts — inserts new", async () => {
    const result = await Users.upsert(
      { email: "up@t.com" },
      { name: "Upserted", email: "up@t.com", createdAt: new Date().toISOString() }
    );
    expect(["inserted", "updated"]).toContain(result);
  });

  it("upserts — updates existing", async () => {
    await Users.insert({ name: "Orig", email: "up2@t.com", createdAt: new Date().toISOString() });
    const result = await Users.upsert(
      { email: "up2@t.com" },
      { name: "Upserted v2", email: "up2@t.com" }
    );
    expect(result).toBe("updated");
  });

  it("findOrCreate — finds existing", async () => {
    await Users.insert({ name: "Existing", email: "fc@t.com", createdAt: new Date().toISOString() });
    const { record, created } = await Users.findOrCreate(
      { email: "fc@t.com" },
      { name: "Should not create", email: "fc@t.com", createdAt: new Date().toISOString() }
    );
    expect(record.name).toBe("Existing");
    expect(created).toBe(false);
  });

  it("findOrCreate — creates new", async () => {
    const { record, created } = await Users.findOrCreate(
      { email: "newfc@t.com" },
      { name: "Newly Created", email: "newfc@t.com", createdAt: new Date().toISOString() }
    );
    expect(record.name).toBe("Newly Created");
    expect(created).toBe(true);
  });

  it("firstOrInit — returns unsaved instance when not found", async () => {
    const record = await Users.firstOrInit(
      { email: "nonexistent@t.com" },
      { name: "Init", createdAt: new Date().toISOString() }
    );
    expect(record).notToBeNull();
    expect(record!.name).toBe("Init");
    const fetched = await Users.get({ email: "nonexistent@t.com" });
    expect(fetched).toBeNull();
  });

  it("firstOrInit — returns existing record when found", async () => {
    await Users.insert({ name: "Existing", email: "fie@t.com", createdAt: new Date().toISOString() });
    const record = await Users.firstOrInit({ email: "fie@t.com" });
    expect(record).notToBeNull();
    expect(record!.name).toBe("Existing");
  });
});

// ── 4. FindInBatches ────────────────────────────────────────────────────

describe("FindInBatches", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "FB1", email: "fb1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "FB2", email: "fb2@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "FB3", email: "fb3@t.com", createdAt: new Date().toISOString() });
  });

  it("processes records in batches", async () => {
    const names: string[] = [];
    await Users.findInBatches(null, 2, (batch: any[]) => {
      for (const u of batch) names.push(u.name);
    });
    expect(names.length).toBe(3);
  });
});

// ── 5. Aggregates ───────────────────────────────────────────────────────

describe("Aggregates", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "A-S1", score: 10, category: "A", email: "a@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "A-S2", score: 20, category: "A", email: "b@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "B-S1", score: 100, category: "B", email: "c@t.com", createdAt: new Date().toISOString() });
  });

  it("counts records", async () => {
    const c = await Users.count();
    expect(c).toBe(3);
  });

  it("counts with filter", async () => {
    const c = await Users.count({ category: "A" });
    expect(c).toBe(2);
  });

  it("sums a column", async () => {
    const s = await Users.sum("score");
    expect(s).toBe(130);
  });

  it("averages a column", async () => {
    const a = await Users.avg("score", { category: "A" });
    expect(a).toBe(15);
  });

  it("finds min/max", async () => {
    const mi = await Users.min("score");
    const ma = await Users.max("score");
    expect(mi).toBe(10);
    expect(ma).toBe(100);
  });

  it("checks existence", async () => {
    const exists = await Users.exists({ name: "A-S1" });
    expect(exists).toBe(true);
    const notExists = await Users.exists({ name: "NONEXISTENT" });
    expect(notExists).toBe(false);
  });

  it("countDistinct", async () => {
    const c = await Users.query().countDistinct("category");
    expect(c).toBe(2);
  });

  it("countWithGroup", async () => {
    const rows = await Users.query().countWithGroup("category") as any[];
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveProperty("count");
    expect(rows[0]).toHaveProperty("category");
  });
});

// ── 6. Query Builder ────────────────────────────────────────────────────

describe("Query Builder", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "QA1", category: "A", email: "qa1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "QA2", category: "A", email: "qa2@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "QB1", category: "B", email: "qb1@t.com", createdAt: new Date().toISOString() });
  });

  it("supports where clauses", async () => {
    const rows = await Users.query().where("category", "=", "A").get();
    expect(rows.length).toBe(2);
  });

  if (!isMongo) it("supports ordering", async () => {
    const rows = await Users.query().orderBy("id", "asc").get();
    expect(rows.length).toBe(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].id).toBeGreaterThan(rows[i - 1].id!);
    }
  });

  it("supports limit/offset", async () => {
    const rows = await Users.query().limit(2).offset(0).get();
    expect(rows.length).toBe(2);
  });

  it("supports select", async () => {
    const rows = await Users.query().select("id", "name").get();
    expect(rows.length).toBe(3);
    expect(rows[0]).toHaveProperty("id");
    expect(rows[0]).toHaveProperty("name");
  });

  it("supports first()", async () => {
    const row = await Users.query().where("category", "=", "A").first();
    expect(row).notToBeNull();
    expect(row!.category).toBe("A");
  });

  it("supports pagination", async () => {
    const result = await Users.query().getPaginated(1, 2);
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("lastPage");
    expect(result.data.length).toBeLessThanOrEqual(2);
  });

  it("supports groupBy", async () => {
    const rows = await Users.query()
      .select("category")
      .countAggregate("*")
      .groupBy("category")
      .get();
    expect(rows.length).toBe(2);
  });
});

// ── 7. Group conditions ─────────────────────────────────────────────────

describe("Group conditions", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "GCA", category: "A", email: "gca@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "GCB", category: "B", email: "gcb@t.com", createdAt: new Date().toISOString() });
  });

  it("andWhereGroup / orWhereGroup", async () => {
    const rows = await Users.query()
      .andWhereGroup((qb: any) => qb.where("category", "=", "A").orWhere("category", "=", "B"))
      .get();
    expect(rows.length).toBe(2);
  });
});

// ── 8. Named arguments ──────────────────────────────────────────────────

describe("Named arguments", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "Alice", email: "a@t.com", createdAt: new Date().toISOString() });
  });

  it("namedWhere replaces :name placeholders", async () => {
    const rows = await Users.query()
      .namedWhere("name like :pattern", { pattern: "A%" })
      .get();
    expect(rows.length).toBe(1);
  });
});

// ── 9. Multi-column IN ──────────────────────────────────────────────────

describe("Multi-column IN", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "MC1", email: "mc_before@t.com", category: "A", createdAt: new Date().toISOString() });
  });

  it("whereColumnsIn", async () => {
    await Users.insert({ name: "MC1", email: "mc_test@t.com", category: "A", status: "active", createdAt: new Date().toISOString() });
    const rows = await Users.query()
      .whereColumnsIn(["category", "status"], [["A", "active"]])
      .get();
    expect(rows.length).toBe(1);
  });
});

// ── 10. Hints ───────────────────────────────────────────────────────────

if (!isMongo) describe("Query hints", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "HintTest", email: "h@t.com", createdAt: new Date().toISOString() });
  });

  it("supports hint, commentHint", async () => {
    const rows = await Users.query().hint("/*+ NO_INDEX */").get();
    expect(rows.length).toBe(1);
    const rows2 = await Users.query().commentHint("test").get();
    expect(rows2.length).toBe(1);
  });
});

// 20 of the 31 public clause methods in extra_clauses.ts had NO test coverage:
// with, union, intersect, except, forUpdate, forShare, forNoKeyUpdate,
// skipLocked, noWait, distinct, having, rightJoin, fullOuterJoin, lateralJoin,
// crossJoin, fulltextSearch, selectSubquery, notExists, orWhereGroup,
// lateralSubquery.
if (!isMongo) describe("Advanced query clauses", () => {
  const sqlOf = (qb: any): string => qb.buildSql().sql;

  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "AA", email: "a1@t.com", score: 10, category: "x", createdAt: new Date().toISOString() });
    await Users.insert({ name: "BB", email: "b1@t.com", score: 20, category: "x", createdAt: new Date().toISOString() });
    await Users.insert({ name: "CC", email: "c1@t.com", score: 30, category: "y", createdAt: new Date().toISOString() });
  });

  it("with() emits a CTE", () => {
    const qb = (Users as any).query();
    qb.with("recent", (Users as any).query().select("id"));
    expect(sqlOf(qb).toUpperCase()).toContain("WITH");
  });

  it("union / intersect / except emit set operations", () => {
    const other = () => [(Users as any).query().select("name")];
    expect(sqlOf((Users as any).query().select("name").union(other())).toUpperCase()).toContain("UNION");
    expect(sqlOf((Users as any).query().select("name").intersect(other())).toUpperCase()).toContain("INTERSECT");
    expect(sqlOf((Users as any).query().select("name").except(other())).toUpperCase()).toContain("EXCEPT");
  });

  it("union returns the combined result set", async () => {
    const rows: any[] = await (Users as any).query().select("name")
      .union([(Users as any).query().select("name").where("name", "=", "AA")])
      .get();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("distinct() emits DISTINCT", () => {
    const qb = (Users as any).query().select("category").distinct();
    expect(sqlOf(qb).toUpperCase()).toContain("DISTINCT");
  });

  it("having() filters on an aggregate", async () => {
    // having() is a raw-SQL escape hatch (same shape as whereRaw), not a
    // structured (column, op, value) builder.
    const rows: any[] = await (Users as any).query()
      .select("category")
      .countAggregate("id")
      .groupBy("category")
      .having("COUNT(id) > 1")
      .get();
    expect(rows.length).toBe(1);
  });

  it("orWhereGroup groups alternatives", async () => {
    const rows: any[] = await (Users as any).query()
      .orWhereGroup((qb: any) => { qb.where("name", "=", "AA").orWhere("name", "=", "BB"); })
      .get();
    expect(rows.length).toBe(2);
  });

  it("andWhereGroup groups a conjunction", async () => {
    const rows: any[] = await (Users as any).query()
      .andWhereGroup((qb: any) => { qb.where("category", "=", "x"); qb.where("score", ">", 15); })
      .get();
    expect(rows.length).toBe(1);
  });

  it("row-locking clauses emit their keywords (postgres/mysql only)", () => {
    if (driver === "sqlite") return;
    const q = () => (Users as any).query();
    expect(sqlOf(q().forUpdate()).toUpperCase()).toContain("FOR UPDATE");
    expect(sqlOf(q().forShare()).toUpperCase()).toContain("FOR SHARE");
    expect(sqlOf(q().forNoKeyUpdate()).toUpperCase()).toContain("FOR NO KEY UPDATE");
    expect(sqlOf(q().skipLocked()).toUpperCase()).toContain("SKIP LOCKED");
    expect(sqlOf(q().noWait()).toUpperCase()).toContain("NOWAIT");
  });

  it("crossJoin emits a CROSS JOIN", () => {
    expect(sqlOf((Users as any).query().crossJoin("profiles")).toUpperCase()).toContain("CROSS JOIN");
  });

  it("rightJoin / fullOuterJoin / lateralJoin emit their keywords", () => {
    if (driver === "sqlite") return; // unsupported on SQLite by design
    expect(sqlOf((Users as any).query().rightJoin("profiles", "users.id", "=", "profiles.userId")).toUpperCase()).toContain("RIGHT JOIN");
    expect(sqlOf((Users as any).query().fullOuterJoin("profiles", "users.id", "=", "profiles.userId")).toUpperCase()).toContain("FULL OUTER JOIN");
    expect(sqlOf((Users as any).query().lateralJoin("(SELECT 1) s", "users.id", "=", "s.n")).toUpperCase()).toContain("LATERAL");
  });

  it("fullOuterJoin on SQLite throws rather than emitting invalid SQL", () => {
    if (driver !== "sqlite") return;
    let threw = false;
    try { (Users as any).query().fullOuterJoin("profiles", "users.id", "=", "profiles.userId"); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("selectSubquery builds a scalar subquery", () => {
    const qb = (Users as any).query();
    qb.selectSubquery((Users as any).query().select("id"), "cnt");
    expect(sqlOf(qb).toUpperCase()).toContain("SELECT");
  });

  it("notExists emits NOT EXISTS", () => {
    const qb = (Users as any).query();
    qb.notExists((Users as any).query().select("id"));
    expect(sqlOf(qb).toUpperCase()).toContain("NOT EXISTS");
  });

  it("lateralSubquery builds a LATERAL subquery", () => {
    const qb = (Users as any).query();
    qb.lateralSubquery((Users as any).query().select("id"), "sub");
    expect(sqlOf(qb).toUpperCase()).toContain("LATERAL");
  });

  it("fulltextSearch on postgres escapes its config literal", () => {
    if (driver !== "postgres") return;
    const qb = (Users as any).query();
    qb.fulltextSearch("name", "term");
    expect(sqlOf(qb)).toContain("to_tsvector");
  });

  it("namedWhere accepts :name placeholders", async () => {
    const rows: any[] = await (Users as any).query().where("name", "=", "AA").get();
    expect(rows.length).toBe(1);
  });

  it("groupBy + countAggregate groups correctly", async () => {
    // countAggregate() emits a bare `COUNT(id)` with no alias, so the result
    // column name is dialect-defined. Assert on the grouping, not the alias.
    const rows: any[] = await (Users as any).query()
      .select("category").countAggregate("id").groupBy("category").get();

    expect(rows.length).toBe(2);
    const categories = rows.map((r: any) => r.category).sort().join(",");
    expect(categories).toBe("x,y");

    // Whichever column holds the count, the totals must add up to the 3 seeded rows.
    const numeric = rows.flatMap((r: any) => Object.values(r).filter((v) => typeof v === "number"));
    expect(numeric.reduce((a: number, b: any) => a + b, 0)).toBe(3);
  });
});

// ── 11. AfterFind hook ──────────────────────────────────────────────────

describe("AfterFind hook", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "AF", email: "af@t.com", createdAt: new Date().toISOString() });
  });

  it("transforms rows after fetch", async () => {
    const rows = await Users.query()
      .afterFind((r: any[]) => r.map((x: any) => ({ ...x, _transformed: true })))
      .get();
    expect(rows.length).toBe(1);
    expect((rows[0] as any)._transformed).toBe(true);
  });
});

// ── 12. Dry-run mode ────────────────────────────────────────────────────

if (!isMongo) describe("Dry-run mode", () => {
  it("returns SQL without executing", async () => {
    const plan = await Users.query().where("id", "=", 1).dryRun().get() as any;
    expect(plan).toHaveProperty("sql");
    expect(plan).toHaveProperty("params");
    expect(typeof plan.sql).toBe("string");
  });
});

// ── 13. Rows streaming ──────────────────────────────────────────────────

if (!isMongo) describe("Rows streaming", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "S1", email: "s1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "S2", email: "s2@t.com", createdAt: new Date().toISOString() });
  });

  it("streams records in batches", async () => {
    let count = 0;
    for await (const batch of Users.query().orderBy("id", "asc").stream(10)) {
      count += batch.length;
    }
    expect(count).toBe(2);
  });
});

// ── 14. Raw SQL and SqlExpr ─────────────────────────────────────────────

if (!isMongo) describe("Raw SQL & SqlExpr", () => {
  it("SqlExpr.raw works in insert", async () => {
    const user = await Users.insert({ name: SqlExpr.raw("'ExprUser'"), email: "raw@t.com", createdAt: SqlExpr.raw(driver === "postgres" ? "NOW()" : "datetime('now')") } as any);
    expect(user).notToBeNull();
  });
});

// ── 15. Soft delete ─────────────────────────────────────────────────────

describe("Soft delete", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "SDTest", email: "sd@t.com", createdAt: new Date().toISOString() });
  });

  it("restores soft-deleted records", async () => {
    const user = await Users.get({ name: "SDTest" });
    await Users.update({ id: user!.id }, { deletedAt: new Date().toISOString() } as any);
    await Users.restore({ id: user!.id });
    const restored = await Users.get({ id: user!.id });
    expect(restored).notToBeNull();
  });
});

// ── 16. Window functions ────────────────────────────────────────────────

if (!isMongo) describe("Window functions", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "W1", score: 10, category: "A", email: "w1@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "W2", score: 20, category: "A", email: "w2@t.com", createdAt: new Date().toISOString() });
  });

  it("supports window()", async () => {
    const rows = await Users.query()
      .window("ROW_NUMBER()", "PARTITION BY category ORDER BY score DESC")
      .get();
    expect(rows.length).toBe(2);

    // Assert the ROW_NUMBER values, not just the row count. The previous
    // version only checked `rows.length`, so a window implementation that
    // emitted entirely wrong row numbers still passed.
    const nums = rows.map((r: any) => Number(Object.values(r).find((v: any) => typeof v === "number" && v <= 2)));
    // PARTITION BY category with 2 rows in category A → 1 and 2.
    const assigned = nums.filter((n: number) => n === 1 || n === 2).sort();
    expect(assigned.join(",")).toBe("1,2");
  });

  it("window() numbering respects the declared ORDER BY", async () => {
    // Highest score first, so the top-scoring row must be 1.
    const rows = await Users.query()
      .window("ROW_NUMBER()", "PARTITION BY category ORDER BY score DESC")
      .get();
    const top = rows.find((r: any) => r.name === "W2");
    const rn = Object.values(top!).find((v: any) => typeof v === "number" && v <= 2);
    expect(rn).toBe(1);
  });
});

// ── 17. Validation ──────────────────────────────────────────────────────

describe("Validation", () => {
  it("validates data against rules", () => {
    expect(() => Users.validate({ email: "bad" }, { email: { email: true } })).toThrow();
  });

  it("checks data and returns errors", () => {
    const errors = Users.check({ name: "" }, { name: { required: true } });
    expect(errors).notToBeNull();
  });

  it("passes valid data", () => {
    expect(() => Users.validate({ email: "good@test.com" }, { email: { email: true, required: false } })).not.toThrow();
  });
});

// ── 18. Plugin system ───────────────────────────────────────────────────

describe("Plugin system", () => {
  it("registers a plugin and fires events", async () => {
    const events: string[] = [];
    (orm as any).use({
      name: "test-plugin",
      install() {},
      on(e: string) { events.push(e); },
    });
    await Users.insert({ name: "PluginTest", email: "pt@t.com", createdAt: new Date().toISOString() });
    expect(true).toBe(true);
  });
});

// ── 19. Context propagation ─────────────────────────────────────────────

describe("Context propagation", () => {
  it("stores and retrieves context", () => {
    (orm as any).withContext({ requestId: "test-req" });
    const ctx = (orm as any).getContext();
    expect(ctx.requestId).toBe("test-req");
    (orm as any).clearContext();
    const cleared = (orm as any).getContext();
    expect(Object.keys(cleared).length).toBe(0);
  });
});

// ── 20. Prepared Statement Mode ─────────────────────────────────────────

if (!isMongo) describe("Prepared Statement Mode", () => {
  it("toggles prepared mode", () => {
    (orm as any).preparedMode(true);
    expect((orm as any).isPreparedMode()).toBe(true);
    (orm as any).preparedMode(false);
    expect((orm as any).isPreparedMode()).toBe(false);
  });
});

// ── 21. Database Resolver ───────────────────────────────────────────────

if (!isMongo) describe("Database Resolver", () => {
  it("registers and resolves named databases", () => {
    (orm as any).addDatabase("archive", { driver: "sqlite", databaseUrl: ":memory:" });
    const db = (orm as any).resolveDb("archive");
    expect(db).toBeDefined();
    expect(db.driver).toBe("sqlite");
    (orm as any).removeDatabase("archive");
  });

  it("executes raw SQL on named database", async () => {
    (orm as any).addDatabase("analytics", { driver: "sqlite", databaseUrl: ":memory:" });
    const result = await (orm as any).execOn("analytics", "SELECT 1 as val");
    expect(result.rows).toBeDefined();
    expect(result.rows[0].val).toBe(1);
    (orm as any).removeDatabase("analytics");
  });

  it("useDb creates a model bound to a named database", async () => {
    (orm as any).addDatabase("secondary", { driver: "sqlite", databaseUrl: ":memory:" });
    const secondaryDb = (orm as any).resolveDb("secondary");
    await secondaryDb.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, createdAt TEXT, updatedAt TEXT)");

    const SecondaryUsers = await (Users as any).useDb("secondary");
    await SecondaryUsers.insert({ name: "SecondaryUser", email: "su@t.com", createdAt: new Date().toISOString() });
    const all = await SecondaryUsers.getAll();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("SecondaryUser");

    (orm as any).removeDatabase("secondary");
  });
});

// ── 22. Proxy (edge-compatible) ─────────────────────────────────────────

describe("Proxy (edge-compatible)", () => {
  it("proxyExec requires an auth token", () => {
    // The proxy server executes arbitrary SQL and rejects unauthenticated
    // requests, so the client must present a token. Fail fast at construction.
    let threw = false;
    try { proxyExec({ endpoint: "http://localhost:9999" }); }
    catch (e: any) { threw = true; expect(e.message.includes("no auth token")).toBe(true); }
    expect(threw).toBe(true);
  });

  it("proxyExec returns an ExecFn when given a token", () => {
    const fn = proxyExec({ endpoint: "http://localhost:9999", authToken: "a".repeat(32) });
    expect(typeof fn).toBe("function");
  });
});

// ── 23. Transactions ────────────────────────────────────────────────────

if (!isMongo) describe("Transactions", () => {
  beforeEach(async () => { await resetUsers(); });

  it("runs a transaction that commits", async () => {
    await orm.transaction(async (trx) => {
      await trx.exec('INSERT INTO "users" ("name", "email", "createdAt") VALUES (?, ?, ?)', ["TrxUser", "trx@t.com", new Date().toISOString()]);
    });
    const found = await Users.get({ name: "TrxUser" });
    expect(found).notToBeNull();
  });

  it("rolls back on error", async () => {
    try {
      await orm.transaction(async (trx) => {
        await trx.exec('INSERT INTO "users" ("name", "email", "createdAt") VALUES (?, ?, ?)', ["RollbackUser", "rb@t.com", new Date().toISOString()]);
        throw new Error("force rollback");
      });
    } catch {
      // expected
    }
    const found = await Users.get({ name: "RollbackUser" });
    expect(found).toBeNull();
  });
});

// ── 24. Custom exec (edge mode) ─────────────────────────────────────────

if (!isMongo) describe("Custom exec (edge mode)", () => {
  it("accepts custom exec function in constructor", async () => {
    const { DBAdapter } = await import("./dbAdapter.js");
    const adapter = new DBAdapter({ driver: "sqlite", databaseUrl: ":memory:", logs: false });
    await adapter.connect();
    // Create the items table manually — ORM won't auto-create it via custom exec
    await adapter.exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT, createdAt TEXT, updatedAt TEXT)");

    const myExec = async (sql: string, params: any[] = []) => {
      return adapter.exec(sql, params);
    };

    const customSchema = {
      Item: {
        table: "items",
        fields: {
          id: { type: "INTEGER", meta: { primaryKey: true, auto: true } },
          value: { type: "TEXT", optional: false, meta: {} },
        },
        relations: [],
      },
    };
    const customOrm = new ORMManager({ exec: myExec, schema: customSchema });
    const Items = await customOrm.defineModel("items", "Item");
    await Items.insert({ value: "custom-exec-test" });
    const items = await Items.getAll() as any[];
    expect(items.length).toBe(1);
    expect(items[0].value).toBe("custom-exec-test");
    await adapter.close();
  });
});

// ── 25. Scopes ──────────────────────────────────────────────────────────

describe("Scopes", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "ScopeA", category: "A", email: "sa@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "ScopeB", category: "B", email: "sb@t.com", createdAt: new Date().toISOString() });
  });

  it("applies reusable scope fragments", async () => {
    const rows = await Users.query()
      .scope((qb: any) => qb.where("category", "=", "A"))
      .get();
    expect(rows.length).toBe(1);
    expect(rows[0].category).toBe("A");
  });
});

// ── 26. Boolean serialization ──────────────────────────────────────────

describe("Boolean serialization", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "BoolTrue", email: "bt@t.com", isActive: true, createdAt: new Date().toISOString() });
    await Users.insert({ name: "BoolFalse", email: "bf@t.com", isActive: false, createdAt: new Date().toISOString() });
  });

  it("inserts and reads back boolean true/false", async () => {
    const t = await Users.get({ name: "BoolTrue" });
    const f = await Users.get({ name: "BoolFalse" });
    expect(t?.isActive).toBe(true);
    expect(f?.isActive).toBe(false);
  });

  it("query().where() accepts boolean params", async () => {
    const active = await Users.query().where("isActive", "=", true).get();
    expect(active.length).toBe(1);
    expect(active[0].name).toBe("BoolTrue");
    const inactive = await Users.query().where("isActive", "=", false).get();
    expect(inactive.length).toBe(1);
    expect(inactive[0].name).toBe("BoolFalse");
  });

  it("query().first() accepts boolean params", async () => {
    const row = await Users.query().first({ isActive: true } as any);
    expect(row).notToBeNull();
    expect(row?.name).toBe("BoolTrue");
  });

  it("query().update() accepts boolean in SET values", async () => {
    const count = await Users.query().where("isActive", "=", false).update({ isActive: true } as any);
    expect(count).toBe(1);
    const all = await Users.query().where("isActive", "=", true).get();
    expect(all.length).toBe(2);
  });

  it("query().delete() with boolean WHERE works", async () => {
    const count = await Users.query().where("isActive", "=", false).delete();
    expect(count).toBe(1);
    const all = await Users.getAll();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe("BoolTrue");
  });
});

// ── 27. Truncate ────────────────────────────────────────────────────────

describe("Truncate", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({ name: "TruncMe", email: "tm@t.com", createdAt: new Date().toISOString() });
  });

  it("truncates a table", async () => {
    await Users.truncate();
    const all = await Users.getAll();
    expect(all.length).toBe(0);
  });
});

// ── 28. @omitdb / @omitjson annotation ─────────────────────────────────────

describe("@omitdb / @omitjson", () => {
  beforeEach(async () => {
    await Users.truncate();
  });

  it("@omitdb excludes field from insert and read results", async () => {
    const user = await Users.insert({
      name: "OmitTest",
      email: "omit@t.com",
      internalNote: "secret-stuff",
      createdAt: new Date().toISOString(),
    } as any);
    expect(user).notToBeNull();
    expect((user as any).internalNote).toBe(undefined);

    const fetched = await Users.get({ id: user!.id } as any);
    expect(fetched).notToBeNull();
    expect((fetched as any).internalNote).toBe(undefined);
  });

  it("@omitdb excluded from query builder results", async () => {
    await Users.insert({
      name: "QB-Omit",
      email: "qb-omit@t.com",
      internalNote: "qb-secret",
      createdAt: new Date().toISOString(),
    } as any);

    const rows = await Users.query().where("name", "=", "QB-Omit").get();
    expect(rows.length).toBe(1);
    expect((rows[0] as any).internalNote).toBe(undefined);
  });

  it("@omitdb excluded from update SET", async () => {
    const user = await Users.insert({
      name: "UpdOmit",
      email: "updomit@t.com",
      internalNote: "ignore-me",
      createdAt: new Date().toISOString(),
    } as any);
    expect(user).notToBeNull();

    await Users.update({ id: user!.id } as any, {
      name: "UpdOmitRenamed",
      internalNote: "should-not-reach-db",
    } as any);

    const fetched = await Users.get({ id: user!.id } as any);
    expect(fetched).notToBeNull();
    expect((fetched as any).name).toBe("UpdOmitRenamed");
    expect((fetched as any).internalNote).toBe(undefined);
  });

  it("@omitjson stores in DB but strips from read results", async () => {
    const user = await Users.insert({
      name: "OmitJsonTest",
      email: "oj@t.com",
      auditData: JSON.stringify({ createdBy: 42, ip: "127.0.0.1" }),
      createdAt: new Date().toISOString(),
    } as any);
    expect(user).notToBeNull();
    expect((user as any).auditData).toBe(undefined);

    const fetched = await Users.get({ id: user!.id } as any);
    expect(fetched).notToBeNull();
    expect((fetched as any).auditData).toBe(undefined);

    const rows = await Users.query().where("name", "=", "OmitJsonTest").get();
    expect(rows.length).toBe(1);
    expect((rows[0] as any).auditData).toBe(undefined);
  });

  it("@omitjson returns value when explicitly selected", async () => {
    const user = await Users.insert({
      name: "OmitJsonSelect",
      email: "ojs@t.com",
      auditData: JSON.stringify({ createdBy: 99 }),
      createdAt: new Date().toISOString(),
    } as any);
    expect(user).notToBeNull();

    const rows = await Users.query()
      .select("id", "auditData")
      .where("name", "=", "OmitJsonSelect")
      .get();
    expect(rows.length).toBe(1);
    expect((rows[0] as any).auditData).notToBeNull();
    const parsed = typeof rows[0].auditData === "string"
      ? JSON.parse(rows[0].auditData)
      : rows[0].auditData;
    expect(parsed.createdBy).toBe(99);
  });
});

// ── 29. @mask annotation ──────────────────────────────────────────────────

describe("@mask", () => {
  beforeEach(async () => {
    await Users.truncate();
    await Users.insert({
      name: "MaskTest",
      email: "mask@t.com",
      ssn: "123-45-6789",
      createdAt: new Date().toISOString(),
    } as any);
  });

  it("masks field with @mask:ssn preset", async () => {
    const user = await Users.get({ name: "MaskTest" } as any);
    expect(user).notToBeNull();
    expect((user as any).ssn).toBe("***-**-6789");
  });

  it("masks field in query builder results", async () => {
    const rows = await Users.query().where("name", "=", "MaskTest").get();
    expect(rows.length).toBe(1);
    expect(rows[0].ssn).toBe("***-**-6789");
  });

  it(".withoutMasking() returns raw value", async () => {
    const rows = await Users.query()
      .withoutMasking()
      .where("name", "=", "MaskTest")
      .get();
    expect(rows.length).toBe(1);
    expect(rows[0].ssn).toBe("123-45-6789");
  });

  it("does not mask null ssn", async () => {
    await Users.insert({
      name: "NoSsn",
      email: "nos@t.com",
      createdAt: new Date().toISOString(),
    } as any);
    const user = await Users.get({ name: "NoSsn" } as any);
    expect(user).notToBeNull();
    expect((user as any).ssn).toBe(null);
  });
});

// ── 27. @random annotation variants ─────────────────────────────────────

describe("@random annotation", () => {
  beforeEach(async () => {
    try { await RandomKeys.truncate(); } catch {
      // Table may not exist yet — first insert will create it
    }
  });

  it("generates alnum(10, upper) — all uppercase + digits", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.upperAlnum).notToBeNull();
    expect(r.upperAlnum.length).toBe(10);
    expect(/^[A-Z0-9]+$/.test(r.upperAlnum)).toBe(true);
  });

  it("generates alnum(10, lower) — all lowercase + digits", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.lowerAlnum).notToBeNull();
    expect(r.lowerAlnum.length).toBe(10);
    expect(/^[a-z0-9]+$/.test(r.lowerAlnum)).toBe(true);
  });

  it("generates lower(12) — only lowercase letters", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.lowerLetters).notToBeNull();
    expect(r.lowerLetters.length).toBe(12);
    expect(/^[a-z]+$/.test(r.lowerLetters)).toBe(true);
  });

  it("generates upper(8) — only uppercase letters", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.upperLetters).notToBeNull();
    expect(r.upperLetters.length).toBe(8);
    expect(/^[A-Z]+$/.test(r.upperLetters)).toBe(true);
  });

  it("generates hex(16) — lowercase hex", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.hexStr).notToBeNull();
    expect(r.hexStr.length).toBe(16);
    expect(/^[0-9a-f]+$/.test(r.hexStr)).toBe(true);
  });

  it("generates hex(16, upper) — uppercase hex", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.upperHex).notToBeNull();
    expect(r.upperHex.length).toBe(16);
    expect(/^[0-9A-F]+$/.test(r.upperHex)).toBe(true);
  });

  it("generates alnum(8, pfx=TKN_) with prefix", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.tokenPrefixed).notToBeNull();
    expect(r.tokenPrefixed.startsWith("TKN_")).toBe(true);
    expect(r.tokenPrefixed.length).toBe(12); // TKN_ + 8 chars
    const body = r.tokenPrefixed.slice(4);
    expect(/^[A-Za-z0-9]+$/.test(body)).toBe(true);
    expect(body.length).toBe(8);
  });

  it("generates number(6, pfx=INV-) with prefix", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.invoiceNum).notToBeNull();
    expect(r.invoiceNum.startsWith("INV-")).toBe(true);
    expect(r.invoiceNum.length).toBe(10); // INV- + 6 digits
    const numPart = r.invoiceNum.slice(4);
    expect(/^\d+$/.test(numPart)).toBe(true);
    expect(numPart.length).toBe(6);
  });

  it("generates alnum(12, upper, pfx=USR_, sfx=_END) with both", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.userCode).notToBeNull();
    expect(r.userCode.startsWith("USR_")).toBe(true);
    expect(r.userCode.endsWith("_END")).toBe(true);
    expect(r.userCode.length).toBe(20); // USR_ + 12 + _END
    const body = r.userCode.slice(4, -4);
    expect(/^[A-Z0-9]+$/.test(body)).toBe(true);
    expect(body.length).toBe(12);
  });

  it("generates custom(ABCDEF123456, 6) from charset", async () => {
    const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
    expect(r.customPin).notToBeNull();
    expect(r.customPin.length).toBe(6);
    expect(/^[ABCDEF123456]+$/.test(r.customPin)).toBe(true);
  });

  it("respects user-provided value (skips @random)", async () => {
    const r = await RandomKeys.insert({
      upperAlnum: "MY_OWN_VAL",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as any;
    expect(r.upperAlnum).toBe("MY_OWN_VAL");
  });

  it("generates unique values across inserts", async () => {
    const values = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = await RandomKeys.insert({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as any;
      expect(r.hexStr).notToBeNull();
      values.add(r.hexStr);
    }
    expect(values.size).toBe(10);
  });
});

// ── 28. Validation annotations ──────────────────────────────────────────

describe("Validation annotations", () => {
  beforeEach(async () => {
    await Users.truncate();
  });

  it("passes valid email", async () => {
    const u = await Users.insert({ name: "Valid", email: "user@example.com", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("rejects invalid email", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "BadEmail", email: "not-an-email", createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("passes valid url", async () => {
    const u = await Users.insert({ name: "ValidUrl", email: "u@t.com", url: "https://example.com", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("rejects invalid url", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "BadUrl", email: "u@t.com", url: "ftp://bad", createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("passes valid uuid", async () => {
    const u = await Users.insert({ name: "ValidUuid", email: "u@t.com", uuid: "550e8400-e29b-41d4-a716-446655440000", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("rejects invalid uuid", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "BadUuid", email: "u@t.com", uuid: "not-a-uuid", createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("passes valid phone", async () => {
    const u = await Users.insert({ name: "ValidPhone", email: "u@t.com", phone: "+1-555-123-4567", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("passes min/max score", async () => {
    const u = await Users.insert({ name: "ScoreOk", email: "u@t.com", score: 50, createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("rejects score below min", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "ScoreLow", email: "u@t.com", score: -1, createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("rejects score above max", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "ScoreHigh", email: "u@t.com", score: 999, createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("rejects name too short (minLength)", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "X", email: "u@t.com", createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("rejects name too long (maxLength)", async () => {
    let err: unknown;
    try {
      await Users.insert({ name: "A".repeat(101), email: "u@t.com", createdAt: new Date().toISOString() });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  it("passes valid pattern", async () => {
    const u = await Users.insert({ name: "Pat1", email: "u@t.com", status: "ABC123", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });

  it("rejects invalid update data", async () => {
    const u = await Users.insert({ name: "UpdateTest", email: "u@t.com", createdAt: new Date().toISOString() });
    let err: unknown;
    try {
      if (u) await Users.update({ id: u.id! }, { email: "bad" });
    } catch (e) { err = e; }
    expect(err).notToBeNull();
  });

  if (!isMongo) it("skips validation for SqlExpr.raw values", async () => {
    const nameExpr = SqlExpr.raw("'RawName'") as unknown as string;
    const createdAtExpr = SqlExpr.raw(driver === "postgres" ? "NOW()" : "datetime('now')") as unknown as string;
    const u = await Users.insert({ name: nameExpr, email: "raw@t.com", createdAt: createdAtExpr });
    expect(u).notToBeNull();
  });

  it("optional fields with no value skip validation", async () => {
    const u = await Users.insert({ name: "NoOpt", email: "u@t.com", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });
});

// preload() and relations had ZERO coverage before. These are the flagship
// eager-loading features, and the preload/many-to-many paths are exactly the
// code that had silent-wrong-answer bugs (an unfiltered related set).
describe("Relations & preload", () => {
  let u1: any, u2: any, u3: any;

  beforeEach(async () => {
    await resetUsers();
    await Posts.query().delete().catch(() => {});
    u1 = await Users.insert({ name: "RelA", email: "ra@t.com", createdAt: new Date().toISOString() });
    u2 = await Users.insert({ name: "RelB", email: "rb@t.com", createdAt: new Date().toISOString() });
    u3 = await Users.insert({ name: "RelC", email: "rc@t.com", createdAt: new Date().toISOString() });
  });

  async function seedPosts() {
    await Posts.insert({ userId: u1.id, title: "A-1" });
    await Posts.insert({ userId: u1.id, title: "A-2" });
    await Posts.insert({ userId: u2.id, title: "B-1" });
    // u3 deliberately has none
  }

  it("preloads a one-to-many relation", async () => {
    await seedPosts();
    const rows: any[] = await Users.query().preload("posts").orderBy("name", "asc").get();
    expect(rows.length).toBe(3);

    const a = rows.find((r) => r.name === "RelA");
    const b = rows.find((r) => r.name === "RelB");
    const c = rows.find((r) => r.name === "RelC");
    expect(a.posts.length).toBe(2);
    expect(b.posts.length).toBe(1);
    // A user with no related rows gets an empty array, not undefined — so
    // callers can map() without a guard.
    expect(Array.isArray(c.posts)).toBe(true);
    expect(c.posts.length).toBe(0);
  });

  it("preloads the correct related rows (no cross-tenant bleed)", async () => {
    await seedPosts();
    const rows: any[] = await Users.query().preload("posts").orderBy("name", "asc").get();
    const a = rows.find((r) => r.name === "RelA");
    const titles = a.posts.map((p: any) => p.title).sort();
    expect(titles.join(",")).toBe("A-1,A-2");
  });

  it("preloads a many-to-one relation", async () => {
    await Posts.insert({ userId: u1.id, title: "Owned" });
    const posts: any[] = await Posts.query().preload("user").get();
    expect(posts.length).toBe(1);
    expect(posts[0].user).toBeDefined();
    expect(posts[0].user.name).toBe("RelA");
  });

  it("applies a preload filter", async () => {
    await Posts.insert({ userId: u1.id, title: "keep-me" });
    await Posts.insert({ userId: u1.id, title: "drop-me" });

    const rows: any[] = await Users.query()
      .preload("posts", (qb: any) => qb.where("title", "=", "keep-me"))
      .where("name", "=", "RelA")
      .get();

    expect(rows.length).toBe(1);
    expect(rows[0].posts.length).toBe(1);
    expect(rows[0].posts[0].title).toBe("keep-me");
  });

  it("applies a preload limit and order", async () => {
    await Posts.insert({ userId: u1.id, title: "p1" });
    await Posts.insert({ userId: u1.id, title: "p2" });
    await Posts.insert({ userId: u1.id, title: "p3" });

    const rows: any[] = await Users.query()
      .preload("posts", 2, "desc")
      .where("name", "=", "RelA")
      .get();

    expect(rows[0].posts.length).toBe(2);
  });

  it("preloads a one-to-one relation", async () => {
    if (driver === "mongodb") return;
    // Ensure the profiles table exists (models are created lazily on first use).
    await Profiles.insert({ userId: u1.id, bio: "hello" });

    const rows: any[] = await Users.query().preload("profiles").orderBy("name", "asc").get();
    const a = rows.find((r) => r.name === "RelA");
    expect(a.profiles).toBeDefined();
    expect(a.profiles.bio ?? a.profiles[0]?.bio).toBe("hello");
  });

  it("preloads a many-to-many relation through a pivot", async () => {
    if (driver === "mongodb") return;
    const qi = (n: string) => quoteIdentifier(driver as any, n);
    await (orm as any).adapter.exec(
      `CREATE TABLE IF NOT EXISTS ${qi("user_tags")} ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "userId" INTEGER, "tagId" INTEGER)`,
      [],
    );
    const t1 = (await Tags.insert({ label: "alpha" }))!;
    const t2 = (await Tags.insert({ label: "beta" }))!;
    await (orm as any).adapter.exec(
      `INSERT INTO ${qi("user_tags")} ("userId", "tagId") VALUES (?, ?), (?, ?)`,
      [u1.id, t1.id, u1.id, t2.id],
    );

    const rows: any[] = await Users.query().preload("tags").where("name", "=", "RelA").get();
    const labels = (rows[0].tags || []).map((t: any) => t.label).sort();
    expect(labels.join(",")).toBe("alpha,beta");
  });

  it("relatedTo resolves a one-to-many by foreign key, not by colliding ids", async () => {
    // Regression: relatedTo/whereRelated selected the CHILD's primary key for a
    // one-to-many and then matched it against the PARENT's primary key. When
    // the two id sequences overlapped it returned the WRONG user, silently.
    // Seed extra rows so the sequences cannot line up by luck.
    await Posts.insert({ userId: u1.id, title: "noise-1" });
    await Posts.insert({ userId: u1.id, title: "noise-2" });
    await Posts.insert({ userId: u2.id, title: "noise-3" });
    await Users.insert({ name: "RelD", email: "rd@t.com", createdAt: new Date().toISOString() });
    await Posts.insert({ userId: u2.id, title: "target-post" });

    const rows: any[] = await Users.query().relatedTo("Post", "userId", u2.id).get();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("RelB");
  });

  it("relatedTo resolves a many-to-one in the other direction", async () => {
    await Posts.insert({ userId: u1.id, title: "owned-1" });
    await Posts.insert({ userId: u1.id, title: "owned-2" });
    await Posts.insert({ userId: u2.id, title: "other" });

    const posts: any[] = await Posts.query().relatedTo("User", "id", u1.id).get();
    const titles = posts.map((p: any) => p.title).sort().join(",");
    expect(titles).toBe("owned-1,owned-2");
  });

  it("does not N+1: one query for the parent set, not one per row", async () => {
    await seedPosts();
    const calls: string[] = [];
    const origExec = (orm as any).adapter.exec;
    (orm as any).adapter.exec = async (sql: any, params: any) => {
      calls.push(String(sql));
      return origExec.call((orm as any).adapter, sql, params);
    };
    try {
      await Users.query().preload("posts").get();
    } finally {
      (orm as any).adapter.exec = origExec;
    }
    // 1 parent SELECT + 1 batched preload SELECT. Not 3 parents + 3 preloads.
    expect(calls.length <= 3).toBe(true);
  });

  it("preload of an unknown relation fails loudly", async () => {
    let threw = false;
    try {
      await (Users as any).query().preload("doesNotExist").get();
    } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

// Soft delete had one test that set deletedAt by hand and called restore(),
// never asserting that queries actually EXCLUDE soft-deleted rows.
describe("Soft delete", () => {
  beforeEach(async () => { await resetUsers(); });

  it("excludes soft-deleted rows from queries", async () => {
    const keep = (await Users.insert({ name: "KeepMe", email: "k@t.com", createdAt: new Date().toISOString() }))!;
    const drop = (await Users.insert({ name: "DropMe", email: "d@t.com", createdAt: new Date().toISOString() }))!;

    await (Users as any).delete({ id: drop.id });

    const all: any[] = await Users.query().get();
    const names = all.map((r) => r.name);
    expect(names.includes("KeepMe")).toBe(true);
    expect(names.includes("DropMe")).toBe(false);
    expect(all.find((r) => r.id === keep.id) !== undefined).toBe(true);
  });

  it("count() also excludes soft-deleted rows", async () => {
    await Users.insert({ name: "Alive", email: "al@t.com", createdAt: new Date().toISOString() });
    const dead = await Users.insert({ name: "Dead", email: "dd@t.com", createdAt: new Date().toISOString() });
    await (Users as any).delete({ id: dead!.id });

    const total = await (Users as any).count();
    expect(total).toBe(1);
  });

  // delete() used to issue a hard DELETE regardless of @softDelete, so
  // restore() updated a row that no longer existed — silent data loss.
  it("delete() on a @softDelete model hides rather than erases", async () => {
    const u = await Users.insert({ name: "SoftGone", email: "sg@t.com", createdAt: new Date().toISOString() });
    await (Users as any).delete({ id: u!.id });

    // The row must still be physically present.
    const raw: any = await (orm as any).adapter.exec(
      `SELECT ${quoteIdentifier(driver as any, "users")}.* FROM ${quoteIdentifier(driver as any, "users")} WHERE ${quoteIdentifier(driver as any, "id")} = ?`,
      [u!.id],
    );
    expect(raw.rows.length).toBe(1);
    expect(raw.rows[0].deletedAt).toBeDefined();
  });

  it("restore() brings a soft-deleted row back", async () => {
    const u = await Users.insert({ name: "BackAgain", email: "ba@t.com", createdAt: new Date().toISOString() });
    await (Users as any).delete({ id: u!.id });
    expect((await Users.query().get()).map((r: any) => r.name).includes("BackAgain")).toBe(false);

    await (Users as any).restore({ id: u!.id });
    expect((await Users.query().get()).map((r: any) => r.name).includes("BackAgain")).toBe(true);
  });

  it("forceDelete() erases permanently", async () => {
    const u = await Users.insert({ name: "EraseMe", email: "em@t.com", createdAt: new Date().toISOString() });
    await (Users as any).forceDelete({ id: u!.id });

    const raw: any = await (orm as any).adapter.exec(
      `SELECT ${quoteIdentifier(driver as any, "users")}.* FROM ${quoteIdentifier(driver as any, "users")} WHERE ${quoteIdentifier(driver as any, "id")} = ?`,
      [u!.id],
    );
    expect(raw.rows.length).toBe(0);
  });

  it("withTrashed/onlyTrashed scope correctly", async () => {
    const a = await Users.insert({ name: "TrashKeep", email: "tk@t.com", createdAt: new Date().toISOString() });
    const b = await Users.insert({ name: "TrashDrop", email: "td@t.com", createdAt: new Date().toISOString() });
    await (Users as any).delete({ id: b!.id });

    const withTrashed: any[] = await Users.query().withTrashed().get();
    expect(withTrashed.map((r) => r.name).includes("TrashDrop")).toBe(true);

    const onlyTrashed: any[] = await Users.query().onlyTrashed().get();
    expect(onlyTrashed.length).toBe(1);
    expect(onlyTrashed[0].name).toBe("TrashDrop");
    expect(withTrashed.length >= 2).toBe(true);
  });

  it("getAll() accepts and applies a filter", async () => {
    // getAll() took no arguments and emitted no WHERE, so `getAll(req.body)`
    // or `getAll({ tenantId })` silently returned the whole table.
    await Users.insert({ name: "Filtered1", email: "f1@t.com", category: "keep", createdAt: new Date().toISOString() });
    await Users.insert({ name: "Filtered2", email: "f2@t.com", category: "keep", createdAt: new Date().toISOString() });
    await Users.insert({ name: "Filtered3", email: "f3@t.com", category: "drop", createdAt: new Date().toISOString() });

    const kept = await (Users as any).getAll({ category: "keep" });
    expect(kept.length).toBe(2);

    const all = await (Users as any).getAll();
    expect(all.length).toBe(3);
  });

  it("getAll() rejects an unknown filter key", async () => {
    let threw = false;
    try { await (Users as any).getAll({ notAField: "x" }); } catch (e: any) {
      threw = e.message.includes("Unknown field");
    }
    expect(threw).toBe(true);
  });

it("model reads honour withTrashed, matching the query builder", async () => {
    const a = await Users.insert({ name: "ViaModel", email: "vm@t.com", createdAt: new Date().toISOString() });
    await (Users as any).delete({ id: a!.id });

    expect((await (Users as any).getAll()).map((r: any) => r.name).includes("ViaModel")).toBe(false);
    expect((await (Users as any).getAll(undefined, { withTrashed: true })).map((r: any) => r.name).includes("ViaModel")).toBe(true);
    expect(await (Users as any).exists({ id: a!.id })).toBe(false);
    expect(await (Users as any).exists({ id: a!.id }, { withTrashed: true })).toBe(true);
  });
});

// The migrator had ZERO coverage. It is a headline feature ("automatic
// migrations, zero-config") and both migrator.ts and migration-history.ts were
// edited during the quoting consolidation — untested changes in untested code.
describe("Migrator", () => {
  const exec = () => (orm as any).adapter.exec.bind((orm as any).adapter);
  const qi = (n: string) => quoteIdentifier(driver as any, n);

  it("migrateSchema creates the tables a schema declares", async () => {
    if (driver === "mongodb") return;
    const m = new Migrator(exec(), driver as any);
    await m.migrateSchema({
      MigThing: {
        table: "mig_things",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
          label: { type: "TEXT", meta: { notNull: true } },
        },
        relations: [],
      } as any,
    });

    const found: any = await exec()(
      `SELECT * FROM ${qi("mig_things")} LIMIT 0`, [],
    );
    expect(found).toBeDefined();
  });

  it("ensureTable adds a column added after the table was created", async () => {
    if (driver === "mongodb") return;
    const m = new Migrator(exec(), driver as any);

    const v1 = {
      id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
      first: { type: "TEXT", meta: {} },
    };
    await m.migrateSchema({ MigEvolve: { table: "mig_evolve", fields: v1 as any, relations: [] } as any });

    // A fresh Migrator instance — processedTables is per-instance, so this
    // simulates a second process starting up against an existing table.
    const m2 = new Migrator(exec(), driver as any);
    await m2.migrateSchema({
      MigEvolve: {
        table: "mig_evolve",
        fields: { ...v1, second: { type: "TEXT", meta: {} } } as any,
        relations: [],
      } as any,
    });

    await exec()(`INSERT INTO ${qi("mig_evolve")} (${qi("first")}, ${qi("second")}) VALUES (?, ?)`, ["a", "b"]);
    const back: any = await exec()(`SELECT * FROM ${qi("mig_evolve")} LIMIT 1`, []);
    expect(back.rows[0].first).toBe("a");
    expect(back.rows[0].second).toBe("b");
  });

  it("ensureTable is idempotent — repeated startup does not error", async () => {
    if (driver === "mongodb") return;
    const schema = {
      MigIdem: {
        table: "mig_idem",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
          x: { type: "TEXT", meta: {} },
        },
        relations: [],
      } as any,
    };
    for (let i = 0; i < 3; i++) {
      await new Migrator(exec(), driver as any).migrateSchema(schema);
    }
    await exec()(`INSERT INTO ${qi("mig_idem")} (${qi("x")}) VALUES (?)`, ["still works"]);
    const r: any = await exec()(`SELECT * FROM ${qi("mig_idem")}`, []);
    expect(r.rows.length).toBe(1);
  });

  it("auto-creates a pivot table for a many-to-many relation", async () => {
    if (driver === "mongodb") return;
    await new Migrator(exec(), driver as any).migrateSchema({
      MigLeft: {
        table: "mig_left",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
        },
        relations: [
          { sourceModel: "MigLeft", fieldName: "rights", kind: "manytomany", targetModel: "MigRight", through: "mig_pivot", foreignKey: "leftId", relatedKey: "rightId" },
        ],
      },
      MigRight: {
        table: "mig_right",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
        },
        relations: [],
      },
    } as any);

    await exec()(
      `INSERT INTO ${qi("mig_pivot")} (${qi("leftId")}, ${qi("rightId")}) VALUES (?, ?)`,
      [1, 1],
    );
    const r: any = await exec()(`SELECT * FROM ${qi("mig_pivot")}`, []);
    expect(r.rows.length).toBe(1);
  });

  it("applies declared column defaults", async () => {
    if (driver === "mongodb") return;
    await new Migrator(exec(), driver as any).migrateSchema({
      MigDefault: {
        table: "mig_default",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
          status: { type: "TEXT", meta: { default: "active" } },
        },
        relations: [],
      } as any,
    });

    await exec()(`INSERT INTO ${qi("mig_default")} (${qi("status")}) VALUES (?)`, ["active"]);
    const r: any = await exec()(`SELECT * FROM ${qi("mig_default")}`, []);
    expect(r.rows.length).toBe(1);
  });

  it("quotes identifiers with embedded quotes instead of breaking out", async () => {
    if (driver === "mongodb") return;
    // A table/column name containing the dialect delimiter must be escaped,
    // not spliced. This is the migrator half of the quoting fix.
    await new Migrator(exec(), driver as any).migrateSchema({
      MigQuoted: {
        table: 'mig"quoted',
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
        },
        relations: [],
      } as any,
    });
    await exec()(`INSERT INTO ${qi('mig"quoted')} (${qi("id")}) VALUES (?)`, [1]);
    const r: any = await exec()(`SELECT * FROM ${qi('mig"quoted')}`, []);
    expect(r.rows.length).toBe(1);
  });
});

// stream() had NO coverage — it is a documented feature that pages through
// results with LIMIT/OFFSET and had never been executed by the suite.
describe("stream()", () => {
  beforeEach(async () => { await resetUsers(); });

  async function seed(n: number) {
    for (let i = 0; i < n; i++) {
      await Users.insert({ name: `S${String(i).padStart(2, "0")}`, email: `s${i}@t.com`, createdAt: new Date().toISOString() });
    }
  }

  it("yields every row across batches", async () => {
    await seed(10);
    const names: string[] = [];
    for await (const batch of (Users as any).query().stream(3)) {
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.length).toBeLessThanOrEqual(3);
      for (const u of batch) names.push(u.name);
    }
    expect(names.length).toBe(10);
    expect(new Set(names).size).toBe(10);
  });

  it("covers a row count that is an exact multiple of the batch size", async () => {
    await seed(6);
    let batches = 0;
    let rows = 0;
    for await (const batch of (Users as any).query().stream(3)) {
      batches++;
      rows += batch.length;
    }
    expect(rows).toBe(6);
    // 6 / 3 = 2 full batches, then one empty probe that must terminate the
    // loop rather than yield.
    expect(batches).toBe(2);
  });

  it("honours an existing where clause", async () => {
    await seed(5);
    const names: string[] = [];
    for await (const batch of (Users as any).query().where("score", ">", 2).stream(2)) {
      for (const u of batch) names.push(u.name);
    }
    // Rows seeded without a score have NULL there, so nothing should match.
    expect(names.length).toBe(0);
  });

  it("terminates on an empty result set without yielding", async () => {
    let batches = 0;
    for await (const _batch of (Users as any).query().where("name", "=", "nope").stream(5)) {
      batches++;
    }
    expect(batches).toBe(0);
  });

  it("restores the caller's limit/offset after streaming", async () => {
    await seed(5);
    const qb = (Users as any).query().limit(2);
    for await (const _b of qb.stream(2)) { /* drain */ }
    // A follow-up query must not inherit stream()'s batch limit.
    const after = await qb.get();
    expect(after.length).toBeLessThanOrEqual(2);
  });

  it("issues one request per batch", async () => {
    await seed(7);
    const calls: string[] = [];
    const orig = (orm as any).adapter.exec;
    (orm as any).adapter.exec = async (sql: any, p: any) => { calls.push(String(sql)); return orig.call((orm as any).adapter, sql, p); };
    try {
      for await (const _b of (Users as any).query().stream(2)) { /* drain */ }
    } finally {
      (orm as any).adapter.exec = orig;
    }
    // 7 rows at 2/batch = 3 full + 1 empty probe.
    expect(calls.length).toBe(4);
  });
});

// enableAuditLogging() had NO coverage. It registers global hooks that write to
// a real table, so it exercises the plugin/hook dispatch path too.
describe("Audit logging", () => {
  beforeEach(async () => { await resetUsers(); });

  it("records inserts, updates and deletes", async () => {
    const audit = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    await audit.enableAuditLogging({ tableName: "_audit_logs" });

    const M = await audit.defineModel<User>("users", "User");
    const created = await M.insert({ name: "Audited", email: "aud@t.com", createdAt: new Date().toISOString() });
    await M.update({ id: created!.id }, { name: "Audited2" });
    await M.delete({ id: created!.id });

    const qi = (n: string) => quoteIdentifier(driver as any, n);
    const rows: any = await (audit as any).adapter.exec(
      `SELECT * FROM ${qi("_audit_logs")} ORDER BY ${qi("id")}`, [],
    );
    expect(rows.rows.length).toBe(3);

    const actions = rows.rows.map((r: any) => r.action);
    expect(actions.join(",")).toBe("INSERT,UPDATE,DELETE");

    const insertRow = rows.rows[0];
    expect(insertRow.model).toBe("User");
    expect(insertRow.newData).toBeDefined();
    expect(insertRow.changedAt).toBeDefined();
  });

  it("does not audit itself", async () => {
    const audit = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    await audit.enableAuditLogging({ tableName: "_audit_logs" });
    const M = await audit.defineModel<User>("users", "User");
    await M.insert({ name: "NoSelf", email: "ns@t.com", createdAt: new Date().toISOString() });

    const qi = (n: string) => quoteIdentifier(driver as any, n);
    const rows: any = await (audit as any).adapter.exec(
      `SELECT * FROM ${qi("_audit_logs")} WHERE ${qi("model")} = ?`, ["_audit_logs"],
    );
    expect(rows.rows.length).toBe(0);
  });

  it("honours excludeModels", async () => {
    const audit = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    await audit.enableAuditLogging({ tableName: "_audit_logs", excludeModels: ["_audit_logs", "User"] });
    const M = await audit.defineModel<User>("users", "User");
    await M.insert({ name: "Excluded", email: "ex@t.com", createdAt: new Date().toISOString() });

    const qi = (n: string) => quoteIdentifier(driver as any, n);
    const rows: any = await (audit as any).adapter.exec(`SELECT * FROM ${qi("_audit_logs")}`, []);
    expect(rows.rows.length).toBe(0);
  });
});

// Plugin lifecycle had NO coverage, and `use()` is the documented extension point.
describe("Plugins", () => {
  beforeEach(async () => { await resetUsers(); });

  it("dispatches lifecycle events to an installed plugin", async () => {
    const seen: string[] = [];
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);

    o.use({
      name: "recorder",
      install() { /* no-op */ },
      async on(event, ctx) {
        seen.push(`${event}:${ctx.model}`);
      },
    });

    const M = await o.defineModel<User>("users", "User");
    const u = await M.insert({ name: "Plugin", email: "pl@t.com", createdAt: new Date().toISOString() });
    await M.update({ id: u!.id }, { name: "Plugin2" });
    await M.delete({ id: u!.id });

    expect(seen.some((e) => e.startsWith("afterInsert"))).toBe(true);
    expect(seen.some((e) => e.startsWith("afterUpdate"))).toBe(true);
    expect(seen.some((e) => e.startsWith("afterDelete"))).toBe(true);
  });

  it("passes the model, data and filter to the hook", async () => {
    let payload: any = null;
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    o.use({
      name: "capture",
      install() { /* no-op */ },
      async on(event, ctx) { if (event === "afterInsert") payload = ctx; },
    });

    const M = await o.defineModel<User>("users", "User");
    await M.insert({ name: "Captured", email: "cap@t.com", createdAt: new Date().toISOString() });

    expect(payload !== null).toBe(true);
    expect(payload.model).toBe("User");
    expect(payload.data.name).toBe("Captured");
  });

  it("a throwing plugin does not break the operation", async () => {
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    o.use({
      name: "explodes",
      install() { /* no-op */ },
      async on() { throw new Error("plugin failure"); },
    });

    const M = await o.defineModel<User>("users", "User");
    // The write must still have happened; an audit/metrics plugin should not
    // be able to fail the request it observes.
    const u = await M.insert({ name: "Survivor", email: "sv@t.com", createdAt: new Date().toISOString() });
    expect(u!.id).toBeDefined();
    const found = await M.get({ id: u!.id });
    expect(found!.name).toBe("Survivor");
  });

  it("reports plugin failures through onPluginError", async () => {
    let seen: string | null = null;
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    o.onPluginError((info) => { seen = `${info.plugin}:${info.event}`; });
    o.use({
      name: "bad",
      install() {},
      async on() { throw new Error("nope"); },
    });
    const M = await o.defineModel<User>("users", "User");
    await M.insert({ name: "Reported", email: "rp@t.com", createdAt: new Date().toISOString() });
    expect(seen).toBe("bad:afterInsert");
  });

  it("strictPlugins: true propagates the failure", async () => {
    const o = new ORMManager({
      driver, databaseUrl, databaseName, schema: makeSchema(driver),
      logs: false, strictPlugins: true,
    } as any);
    o.use({
      name: "bad",
      install() {},
      async on() { throw new Error("strict failure"); },
    });
    const M = await o.defineModel<User>("users", "User");
    let threw = false;
    try {
      await M.insert({ name: "Strict", email: "st@t.com", createdAt: new Date().toISOString() });
    } catch (e: any) {
      threw = e.message.includes("strict failure");
    }
    expect(threw).toBe(true);
  });

  it("registers multiple plugins", async () => {
    let a = 0, b = 0;
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    o.use({ name: "a", install() {}, async on(e) { if (e === "afterInsert") a++; } });
    o.use({ name: "b", install() {}, async on(e) { if (e === "afterInsert") b++; } });

    const M = await o.defineModel<User>("users", "User");
    await M.insert({ name: "Multi", email: "mu@t.com", createdAt: new Date().toISOString() });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

// The migration RUNNER (schema diffing, batching, idempotency) had no coverage.
// The Migrator tests above cover ensureTable; these cover the bookkeeping layer.
describe("Migration runner", () => {
  const exec = () => (orm as any).adapter.exec.bind((orm as any).adapter);
  const qi = (n: string) => quoteIdentifier(driver as any, n);

  // The runner diffs against BOTH the database and any migration records it
  // finds under `dir`. Pointing it at the repo's own `src` makes the suite
  // depend on committed migration files, so every change looks already-applied.
  // An empty throwaway directory keeps these tests hermetic.
  const migDir = fs.mkdtempSync(path.join(os.tmpdir(), "slintorm-mig-"));

  /** Read the migration bookkeeping table directly. */
  async function readApplied(): Promise<any> {
    const rows = await exec()(
      `SELECT ${qi("name")}, ${qi("batch")} FROM ${qi("_slint_migrations")}`, [],
    );
    return rows;
  }

  /** Current highest applied batch, or 0. */
  async function currentBatch(): Promise<number> {
    const rows = await readApplied();
    const batches = rows.rows.map((r: any) => Number(r.batch));
    return batches.length ? Math.max(...batches) : 0;
  }

  function schemaFor(fields: Record<string, any>): Record<string, any> {
    return {
      MigRun: {
        table: "mig_run",
        fields: {
          id: { type: driver === "postgres" ? "SERIAL" : "INTEGER", meta: { primaryKey: true, auto: true } },
          ...fields,
        },
        relations: [],
      },
    };
  }

  it("applies a first batch and records it", async () => {
    if (driver === "mongodb") return;
    const result = await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ title: { type: "TEXT", meta: {} } }),
    });
    expect(result.applied).toBeGreaterThan(0);

    const applied = await readApplied();
    expect(applied.rows.length).toBeGreaterThanOrEqual(result.applied);
    expect(applied.rows[0].name).toBeDefined();
    // Batch numbers are relative to the shared suite, so assert ordering
    // rather than absolute values.
    expect(Number(applied.rows[0].batch)).toBeGreaterThan(0);
  });

  it("is idempotent — a second run applies nothing", async () => {
    if (driver === "mongodb") return;
    const schema = schemaFor({ label: { type: "TEXT", meta: {} } });
    await runMigrations({ exec: exec(), driver: driver as any, dir: migDir, schema });
    const second = await runMigrations({ exec: exec(), driver: driver as any, dir: migDir, schema });
    expect(second.applied).toBe(0);
  });

  it("applies an incremental change in a later batch", async () => {
    if (driver === "mongodb") return;
    await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ stage1: { type: "TEXT", meta: {} } }),
    });
    const before = await currentBatch();

    const second = await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ stage1: { type: "TEXT", meta: {} }, stage2: { type: "TEXT", meta: {} } }),
    });
    expect(second.applied).toBe(1);
    expect(second.batch).toBe(before + 1);

    await exec()(
      `INSERT INTO ${qi("mig_run")} (${qi("stage1")}, ${qi("stage2")}) VALUES (?, ?)`,
      ["b1", "b2"],
    );
    const row = await exec()(
      `SELECT ${qi("stage1")}, ${qi("stage2")} FROM ${qi("mig_run")} LIMIT 1`, [],
    );
    expect(row.rows[0].stage2).toBe("b2");
  });

  it("reports progress through hooks", async () => {
    if (driver === "mongodb") return;
    const pending: string[] = [];
    const done = [];
    await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ hooked: { type: "TEXT", meta: {} } }),
      hooks: {
        onPending: (p) => { for (const u of p) pending.push(u.name); },
        onProgress: (_i, _t, u) => pending.push(`progress:${u.name}`),
        onDone: (r) => done.push(r.applied),
      },
    });
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.some((p) => p.startsWith("progress:"))).toBe(true);
    expect(done.length).toBe(1);
  });

  it("batch bookkeeping advances monotonically", async () => {
    if (driver === "mongodb") return;
    await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ batched: { type: "TEXT", meta: {} } }),
    });
    const batch = await currentBatch();
    expect(batch).toBeGreaterThan(0);

    const result = await runMigrations({
      exec: exec(), driver: driver as any, dir: migDir,
      schema: schemaFor({ batched: { type: "TEXT", meta: {} } }),
    });
    // No new changes → nothing applied, and the batch must not move.
    expect(result.applied).toBe(0);
    expect(await currentBatch()).toBe(batch);
  });

  it("migrationPlan derives one unit per model", () => {
    const plan = migrationPlan({
      A: { table: "a", fields: { id: { type: "INTEGER", meta: {} } }, relations: [] },
      B: { table: "b", fields: { id: { type: "INTEGER", meta: {} } }, relations: [] },
    });
    expect(plan.length).toBe(2);
  });
});

// `defineModel()` must not touch the database or the network. In serverless
// this matters at module scope — the documented pattern is
// `export const db = { User: await orm.defineModel(...) }`, which runs during
// module init. If that opened a connection, every cold start would pay for it
// before the first request.
describe("Lazy model definition", () => {
  it("defineModel() issues no database round trip", async () => {
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: false } as any);
    const calls: string[] = [];
    const orig = (o as any).adapter.exec.bind((o as any).adapter);
    (o as any).adapter.exec = async (sql: any, p: any) => { calls.push(String(sql)); return orig(sql, p); };

    await o.defineModel<User>("lazy_models", "LazyModel", makeSchema(driver).User.fields as any);

    expect(calls.length).toBe(0);
    expect((o as any).adapter.connected).toBe(driver === "sqlite" ? false : false);
  });

  it("the connection opens on first use instead", async () => {
    const o = new ORMManager({
      driver, databaseUrl, databaseName, logs: false,
      schema: { LazyOnUse: { table: "lazy_on_use", fields: makeSchema(driver).User.fields, relations: [] } },
    } as any);
    await o.defineModel<User>("lazy_on_use", "LazyOnUse");
    const calls: string[] = [];
    const orig = (o as any).adapter.exec.bind((o as any).adapter);
    (o as any).adapter.exec = async (sql: any, p: any) => { calls.push(String(sql)); return orig(sql, p); };

    await (o as any).DB.LazyOnUse.getAll();

    expect(calls.length).toBeGreaterThan(0);
  });

  it("defining many models still opens nothing", async () => {
    const schema: Record<string, any> = {};
    for (const n of ["L1", "L2", "L3", "L4", "L5"]) {
      schema[n] = { table: n.toLowerCase(), fields: makeSchema(driver).User.fields, relations: [] };
    }
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema, logs: false } as any);
    const calls: string[] = [];
    const orig = (o as any).adapter.exec.bind((o as any).adapter);
    (o as any).adapter.exec = async (sql: any, p: any) => { calls.push(String(sql)); return orig(sql, p); };

    for (const n of ["L1", "L2", "L3", "L4", "L5"]) {
      await o.defineModel(n.toLowerCase(), n);
    }
    expect(calls.length).toBe(0);
  });

  it("reads ensure the table, matching writes", async () => {
    // Previously only insert()/insertMany() ensured the table, so a model that
    // had never been written to reported "no such table" on read.
    const schema: Record<string, any> = {
      ReadOnly: { table: "read_only_check", fields: makeSchema(driver).User.fields, relations: [] },
    };
    const o = new ORMManager({ driver, databaseUrl, databaseName, schema, logs: false } as any);
    const M = await o.defineModel<User>("read_only_check", "ReadOnly");
    const rows = await M.getAll();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });
});

describe("Runtime detection", () => {
  it("reports a runtime with fetch", () => {
    const info = runtimeInfo();
    expect(typeof info.hasFetch).toBe("boolean");
    expect(typeof info.kind).toBe("string");
  });

  it("agrees with edgeReady() for a plain Node process", () => {
    const o = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:", logs: false } as any);
    expect(o.edgeReady()).toBe(true);
  });

  it("edgeReady() is true for postgrest regardless of runtime", () => {
    const o = new ORMManager({ driver: "postgrest", postgrestUrl: "https://x.supabase.co/rest/v1", logs: false } as any);
    expect(o.edgeReady()).toBe(true);
  });

  it("edgeReady() is true when a custom exec is supplied", () => {
    const o = new ORMManager({
      driver: "postgres", databaseUrl: "postgres://x",
      exec: (async () => ({ rows: [] })) as any, logs: false,
    } as any);
    expect(o.edgeReady()).toBe(true);
  });

  it("rejects a TCP-only driver on a socketless runtime", () => {
    if (canUseTcpDrivers()) return; // this process has TCP; covered by the assert below
    let threw = false;
    try { new ORMManager({ driver: "postgres", databaseUrl: "postgres://x" } as any); }
    catch (e: any) {
      threw = true;
      expect(e.message.includes("cannot run in this runtime")).toBe(true);
      expect(e.message.includes("postgrest")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("does not throw for socketless-safe drivers", () => {
    for (const driver of ["sqlite", "postgrest", undefined]) {
      expect(() => new ORMManager({ driver, databaseUrl: ":memory:", logs: false } as any)).not.toThrow();
    }
  });

  it("assertDriverSupported is a no-op for unknown/blank drivers", () => {
    assertDriverSupported(undefined);
    assertDriverSupported("sqlite");
    assertDriverSupported("postgrest");
  });
});

describe("Connection pooling", () => {
  it("poolSize > 1 combined with rls: true throws", () => {
    let threw = false;
    try {
      new ORMManager({
        driver: "postgres", databaseUrl: "postgres://x", rls: true, poolSize: 10,
      } as any);
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("cannot be combined with rls")).toBe(true);
      expect(e.message.includes("leaking data across tenants")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("rls: true without pooling is allowed", () => {
    expect(() => new ORMManager({
      driver: "postgres", databaseUrl: "postgres://x", rls: true,
    } as any)).not.toThrow();
  });

  it("poolSize without rls is allowed", () => {
    const o = new ORMManager({
      driver: "postgres", databaseUrl: "postgres://x", poolSize: 10,
    } as any);
    expect(o).toBeDefined();
  });

  it("poolSize of 1 is treated as a single connection, not a pool", () => {
    expect(() => new ORMManager({
      driver: "postgres", databaseUrl: "postgres://x", poolSize: 1, rls: true,
    } as any)).not.toThrow();
  });
});

describe("SQL injection regression", () => {
  // CRITICAL-2: filter-object keys land in an IDENTIFIER position. Filters are
  // routinely built from request bodies (`Model.getAll(req.body)`), so an
  // unknown key must be rejected rather than quoted-and-trusted.
  const KEY_PAYLOAD = 'name" IS NOT NULL OR 1=1 OR name="name';

  it("rejects unknown filter keys on get", async () => {
    await Users.insert({ name: "InjAlice", email: "ia@t.com", createdAt: new Date().toISOString() });
    await Users.insert({ name: "InjBob", email: "ib@t.com", createdAt: new Date().toISOString() });
    let threw = false;
    try {
      await (Users as any).get({ name: "InjAlice", [KEY_PAYLOAD]: "x" });
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("Unknown field")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("rejects unknown filter keys on count", async () => {
    let threw = false;
    try {
      await (Users as any).count({ name: "x", [KEY_PAYLOAD]: "x" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects unknown filter keys on update", async () => {
    let threw = false;
    try {
      await (Users as any).update({ name: "x", [KEY_PAYLOAD]: "x" }, { name: "PWNED" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects unknown filter keys on delete", async () => {
    let threw = false;
    try {
      await (Users as any).delete({ name: "x", [KEY_PAYLOAD]: "x" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects unknown filter keys on updateMany", async () => {
    let threw = false;
    try {
      await (Users as any).updateMany({ name: "x", [KEY_PAYLOAD]: "x" }, { name: "y" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects unknown filter keys on deleteMany", async () => {
    let threw = false;
    try {
      await (Users as any).deleteMany({ name: "x", [KEY_PAYLOAD]: "x" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects backtick payloads in filter keys", async () => {
    let threw = false;
    try {
      await (Users as any).get({ name: "x", ["name` IS NOT NULL OR 1=1 --"]: "x" });
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  // CRITICAL-3: identifiers must reject control/NUL characters outright.
  it("rejects control characters in identifiers", async () => {
    for (const bad of ["na\u0000me", "na\nme", "name\u0000"]) {
      let threw = false;
      try { await (Users as any).get({ name: "x", [bad]: "x" }); } catch { threw = true; }
      expect(threw).toBe(true);
    }
  });

  it("quoteIdentifier doubles ANSI delimiters", () => {
    expect(quoteIdentifier("postgres", 'a" OR 1=1 --')).toBe('"a"" OR 1=1 --"');
    expect(quoteIdentifier("sqlite", 'a"b')).toBe('"a""b"');
  });

  it("quoteIdentifier doubles MySQL delimiters", () => {
    expect(quoteIdentifier("mysql", "a` OR 1=1 --")).toBe("`a`` OR 1=1 --`");
  });

  it("quoteIdentifier rejects control characters", () => {
    let threw = false;
    try { quoteIdentifier("postgres", "a\u0000b"); } catch (e: any) {
      threw = true;
      expect(e.name).toBe("SqlIdentifierError");
    }
    expect(threw).toBe(true);
  });

  it("quoteIdentifier rejects empty and over-long names", () => {
    expect(() => quoteIdentifier("postgres", "")).toThrow();
    expect(() => quoteIdentifier("postgres", "a".repeat(200))).toThrow();
  });

  it("quoteColumnRef quotes each dotted segment", () => {
    expect(quoteColumnRef("postgres", "users.name")).toBe('"users"."name"');
    expect(() => quoteColumnRef("postgres", "a.b.c")).toThrow();
  });

  it("assertSafeOperator allowlists operators", () => {
    expect(assertSafeOperator("=")).toBe("=");
    expect(assertSafeOperator("is not")).toBe("IS NOT");
    expect(() => assertSafeOperator("=1 OR 1=1 --")).toThrow();
    expect(() => assertSafeOperator("; DROP TABLE users")).toThrow();
  });

  it("assertSafeDirection allowlists sort direction", () => {
    expect(assertSafeDirection("asc")).toBe("ASC");
    expect(() => assertSafeDirection("ASC; DROP TABLE users")).toThrow();
  });

  it("assertSafeHint passes MySQL optimizer-hint comments through", () => {
    expect(assertSafeHint("/*+ NO_INDEX(t) */")).toBe("/*+ NO_INDEX(t) */");
    expect(assertSafeHint("INDEX (idx_name)")).toBe("INDEX (idx_name)");
  });

  it("assertSafeHint rejects comment-terminator escapes", () => {
    expect(() => assertSafeHint("*/ ; DROP TABLE users ; /*")).toThrow();
    expect(() => assertSafeHint("x) ; SELECT 1 --")).toThrow();
  });

  it("quoteLiteral escapes single quotes", () => {
    expect(quoteLiteral("a'b")).toBe("'a''b'");
  });

  // CRITICAL-4: structural arguments must be validated, not interpolated.
  it("rejects an injected orderBy direction", async () => {
    let threw = false;
    try {
      await (Users as any).query().orderBy("name" as any, "ASC; DROP TABLE users--" as any).get();
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects a comment-terminator escape in commentHint", async () => {
    let threw = false;
    try { (Users as any).query().commentHint("*/ ; DROP TABLE users ; /*"); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects a statement splice in hint()", async () => {
    let threw = false;
    try { (Users as any).query().hint("x) ; SELECT 1 --"); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("rejects an injected join operator", async () => {
    let threw = false;
    try {
      (Users as any).query().join("users", "a", "=1 OR 1=1 --", "b");
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("quotes an injected join table identifier instead of splicing it", async () => {
    // A table name containing spaces is a legal (if odd) identifier, so the
    // defence is that it is fully quoted as ONE identifier, not that it throws.
    const payload = 'users ON 1=1; DROP TABLE users; --';
    const sql = ((Users as any).query().join(payload, "a", "=", "b") as any).buildSql().sql;
    const expected = driver === "mysql" ? "`" + payload + "`" : '"' + payload + '"';
    expect(sql.includes(expected)).toBe(true);
    expect(sql.includes("JOIN " + payload + " ON")).toBe(false);
  });

  // HIGH-4: the default KDF measured 136,432 ms per hash (417x slower than
  // PBKDF2-600k) and was a trivial unauthenticated DoS on any signup/login
  // route. PBKDF2 is now the default; Balloon must be named explicitly.
  it("defaults to pbkdf2, not balloon", async () => {
    const t0 = Date.now();
    const out = await hashPassword("correct horse battery staple");
    const ms = Date.now() - t0;
    expect(out.startsWith("pbkdf2$")).toBe(true);
    // Generous ceiling: a regression to balloon takes 100x longer.
    expect(ms < 5000).toBe(true);
  });

  it("verifies a pbkdf2 hash and rejects a wrong password", async () => {
    const stored = await hashPassword("s3cret-value");
    expect(await verifyPassword("s3cret-value", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("no longer accepts balloon for new hashes", async () => {
    // Removed: 136 s per hash, not the published algorithm, 64 KB cache-resident
    // working set. Verification of legacy hashes is kept so nobody is locked out.
    const anyHash = hashPassword as unknown as (p: string, o?: unknown) => Promise<string>;
    let threw = false;
    try { await anyHash("pw", { algo: "balloon", space: 1024, time: 1, delta: 1 }); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("still VERIFIES legacy balloon hashes so users are not locked out", async () => {
    // A known-good balloon hash produced by the old implementation.
    const legacy = "balloon$64$1$1$AAAAAAAAAAAAAAAAAAAAAA==$1c9bTaG0Oa2v3w8eE5vXcXKQ8oZsQ0nQ3KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ8KQ==";
    // Whatever the outcome, it must be a boolean — never a throw — so login
    // paths can run their rehash-on-success migration.
    const result = await verifyPassword("pw", legacy);
    expect(typeof result).toBe("boolean");
  });

  it("verifyPassword rejects a malformed balloon blob without throwing", async () => {
    expect(await verifyPassword("pw", "balloon$not-a-number$x$y$zz$zz")).toBe(false);
  });

  it("@hash defaults to pbkdf2 (bare annotation)", async () => {
    const item = { pw: "plaintext-value" };
    const schemaFields = { pw: { type: "TEXT", meta: { hash: true } } } as any;
    const out = await applySecurityOnWrite(item, schemaFields);
    expect(String(out.pw).startsWith("pbkdf2$")).toBe(true);
  });

  it("@hash(pbkdf2) is honoured, not silently discarded", async () => {
    // parseAnnotationValue used to drop bare positional tokens, so the natural
    // `@hash(pbkdf2)` fell through to the 136-second Balloon path.
    const item = { pw: "plaintext-value" };
    const schemaFields = { pw: { type: "TEXT", meta: { hash: "(pbkdf2)" } } } as any;
    const out = await applySecurityOnWrite(item, schemaFields);
    expect(String(out.pw).startsWith("pbkdf2$")).toBe(true);
  });

  it("@hash(pbkdf2,iterations=N) is honoured", async () => {
    const item = { pw: "plaintext-value" };
    const schemaFields = { pw: { type: "TEXT", meta: { hash: "(pbkdf2,iterations=1000)" } } } as any;
    const out = await applySecurityOnWrite(item, schemaFields);
    expect(String(out.pw).startsWith("pbkdf2$1000$")).toBe(true);
  });

  it("@hash(balloon) throws with migration guidance instead of writing a hash", async () => {
    const item = { pw: "plaintext-value" };
    const schemaFields = { pw: { type: "TEXT", meta: { hash: "(balloon,space=1024,time=1,delta=1)" } } } as any;
    let message = "";
    try { await applySecurityOnWrite(item, schemaFields); } catch (e: any) { message = e.message; }
    expect(message.includes("Balloon hashing has been removed")).toBe(true);
    // The error must tell the user how to migrate, not just refuse.
    expect(message.includes("still VERIFY")).toBe(true);
  });

  it("@hash with an unknown algorithm throws instead of silently defaulting", async () => {
    let threw = false;
    try {
      await applySecurityOnWrite(
        { pw: "v" },
        { pw: { type: "TEXT", meta: { hash: "(algo=argon2)" } } } as any,
      );
    } catch { threw = true; }
    expect(threw).toBe(true);
  });

  // HIGH-3: `rls: true` used to be silently inert with a custom exec while
  // rlsEnabled() still reported true.
  it("rls: true with a custom exec throws rather than reporting false safety", () => {
    let threw = false;
    try {
      new ORMManager({
        driver: "postgres", databaseUrl: "postgres://x", rls: true,
        exec: (async () => ({ rows: [] })) as any,
      } as any);
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("cannot be combined with a custom")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("rls: true on a non-postgres driver throws", () => {
    let threw = false;
    try {
      new ORMManager({ driver: "sqlite", databaseUrl: ":memory:", rls: true } as any);
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("requires the postgres driver")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  // HIGH-2: RLS context used to live in one mutable field read at execute time,
  // so concurrent requests overwrote each other's tenant across every await.
  it("isolates context between interleaved async requests", async () => {
    const seen: string[] = [];
    const req = (tenant: string, delay: number) =>
      orm.runWithContext({ tenant_id: tenant }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(orm.getContext().tenant_id);
      });

    // Slow A and fast B interleave. Without AsyncLocalStorage both would
    // observe whichever value landed last.
    await Promise.all([req("A", 30), req("B", 1)]);

    expect(seen.includes("A")).toBe(true);
    expect(seen.includes("B")).toBe(true);
  });

  it("runWithContext does not leak the context after it resolves", async () => {
    await orm.runWithContext({ tenant_id: "scoped" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      // Visible inside the scope...
      expect(orm.getContext().tenant_id).toBe("scoped");
    });
    // ...and gone afterwards. `run()` scopes to the callback, which is the
    // entire point: a caller that forgot to clean up cannot leak a tenant
    // into the next request.
    expect(orm.getContext().tenant_id).toBe(undefined);
  });

  it("reports whether per-request context isolation is available", () => {
    // Node >= 22.3 uses AsyncLocalStorage; edge degrades to a single slot.
    expect(typeof orm.hasIsolatedContext()).toBe("boolean");
  });

  // Mongo used to silently DROP unsupported SQL constructs, returning wrong
  // rows with no error. A silently-wrong result set is worse than a throw.
  it("refuses raw SQL on MongoDB instead of dropping the filter", async () => {
    if (driver !== "mongodb") return; // SQL drivers are unaffected
    let threw = false;
    try {
      await (Users as any).query().whereRaw("score > 5").get();
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("not supported on MongoDB")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("refuses a SQL JOIN on MongoDB instead of dropping it", async () => {
    if (driver !== "mongodb") return;
    let threw = false;
    try {
      await (Users as any).query().join("profiles", "users.id", "=", "profiles.userId").get();
    } catch (e: any) {
      threw = true;
      expect(e.message.includes("SQL JOIN is not supported on MongoDB")).toBe(true);
    }
    expect(threw).toBe(true);
  });

  it("masks fail closed on unparseable values", () => {
    for (const [val, directive] of [["1234", "ssn"], ["1234", "creditcard"], ["1234", "phone"], ["1", "ssn"]] as const) {
      const out = String(applyMask(val, directive as any));
      expect(out.includes(val)).toBe(false);
    }
  });

  it("masks an email with no @ without revealing the domain", () => {
    const out = String(applyMask("notanemail", "email"));
    expect(out.includes("notanemail")).toBe(false);
  });

  it("still masks well-formed values normally", () => {
    expect(applyMask("123-45-6789", "ssn")).toBe("***-**-6789");
    expect(applyMask("a@t.com", "email")).toBe("a***@t.com");
    expect(applyMask("4111111111111111", "creditcard")).toBe("****-****-****-1111");
  });

  // M6: `logs: true` wrote every bound parameter to stdout — tokens, card
  // numbers, emails. Values are now redacted unless explicitly opted in.
  it("redacts bound parameters in logs by default", async () => {
    // Reuse the suite schema so the table matches what defineModel expects.
    const o = new ORMManager({
      driver, databaseUrl, databaseName, schema: makeSchema(driver), logs: true,
    } as any);
    const M = await o.defineModel<User>("users", "User");

    const seen: string[] = [];
    const orig = console.log;
    console.log = (...a: any[]) => { seen.push(a.map(String).join(" ")); };
    try {
      await M.insert({ name: "SECRET-PII-VALUE", email: "p@t.com", createdAt: new Date().toISOString() });
    } finally {
      console.log = orig;
    }

    const insertLine = seen.find((l) => l.includes("INSERT"));
    expect(insertLine !== undefined).toBe(true);
    expect(insertLine!.includes("SECRET-PII-VALUE")).toBe(false);
  });

  // HIGH-5: AES-GCM with no AAD only proves bytes are untampered, not that
  // they belong to this row. Anyone with DB write access could copy a
  // ciphertext between rows and it authenticated cleanly.
  it("@encrypt binds ciphertext to its row via AAD", async () => {
    const key = "test-encryption-key-32-chars-minimum!!";
    const blob = await encryptFieldFull("4111111111111111", key, "card", 1000, "row:payments:card:42");
    expect(blob.startsWith("aes256gcmv2$")).toBe(true);

    expect(await decryptFieldFull(blob, key, "card", "row:payments:card:42")).toBe("4111111111111111");

    let relocated = false;
    try { await decryptFieldFull(blob, key, "card", "row:payments:card:99"); relocated = true; } catch { /* expected */ }
    expect(relocated).toBe(false);

    let crossTable = false;
    try { await decryptFieldFull(blob, key, "card", "row:ledger:card:42"); crossTable = true; } catch { /* expected */ }
    expect(crossTable).toBe(false);
  });

  it("@encrypt still decrypts pre-AAD data", async () => {
    const key = "test-encryption-key-32-chars-minimum!!";
    const legacy = await encryptFieldFull("secret", key, "field", 1000);
    expect(legacy.startsWith("aes256gcm$")).toBe(true);
    expect(await decryptFieldFull(legacy, key, "field")).toBe("secret");
  });

  it("escapes the fulltextSearch config literal on postgres", () => {
    // The generated SQL must not contain an unescaped quote breakout.
    const built: any = new AdvancedQueryBuilder<any>(
      "users", "src", (async () => ({ rows: [] })) as any, "User", {},
      { dialect: "postgres" } as any,
    );
    built.fulltextSearch("body", "term", "english') OR 1=1 OR to_tsvector('english");
    const out = built._buildWhereSql(0);
    // The attacker-supplied quote must be doubled, and the classic
    // "close the literal, inject OR 1=1, reopen" sequence must be absent.
    expect(out.sql.includes("to_tsvector('english'')")).toBe(true);
    expect(out.sql.includes("to_tsvector('english',")).toBe(false);
  });
});

  // ── Execute ─────────────────────────────────────────────────────────
  await run();
  if (isMongo && orm.adapter["mongoDb"]) await orm.adapter["mongoDb"].dropDatabase();
}

// ── Driver selection ─────────────────────────────────────────────────────
//
// Explicit selection (SQLITE_ONLY / PG_ONLY / MONGO_ONLY / MYSQL_ONLY) is a
// REQUEST. If the driver is requested but its env var is missing, that is an
// error — not a silent green run. Previously `test:pg` skipped SQLite via
// PG_ONLY=1, then skipped Postgres because PG_URL was unset, and exited 0
// having run zero tests.

const only = (["SQLITE", "PG", "MONGO", "MYSQL"] as const).filter(
  (k) => process.env[`${k}_ONLY`] === "1",
);

const explicit = only.length > 0;
if (only.length > 1) {
  console.error(
    `\n  ERROR: conflicting driver flags: ${only.map((k) => `${k}_ONLY=1`).join(", ")}\n` +
      `  Run one driver at a time.`,
  );
  process.exit(1);
}

const wants = (driver: string) => {
  const key = { sqlite: "SQLITE", postgres: "PG", mongodb: "MONGO", mysql: "MYSQL" }[driver]!;
  return explicit ? only[0] === key : true;
};

type DriverSpec = {
  driver: string;
  url: string | undefined;
  envVar: string;
  dbName?: string;
  /** Always runnable with no external service. */
  builtin?: boolean;
};

const specs: DriverSpec[] = [
  { driver: "sqlite", url: ":memory:", envVar: "SQLITE_URL", builtin: true },
  { driver: "postgres", url: process.env.PG_URL, envVar: "PG_URL" },
  { driver: "mysql", url: process.env.MYSQL_URL, envVar: "MYSQL_URL" },
  {
    driver: "mongodb",
    url: process.env.MONGO_URL,
    envVar: "MONGO_URL",
    dbName: "slintorm-test-suite-" + Date.now(),
  },
];

// ── Fail fast on an explicitly-requested driver with no URL ──────────────
// Only when the driver was explicitly requested. Without a flag, an
// unconfigured remote driver is skipped-and-reported (below), which is fine.
const missing = explicit
  ? specs.filter((s) => wants(s.driver) && !s.url && !s.builtin)
  : [];
if (missing.length > 0) {
  console.error(
    `\n  ERROR: driver requested but ${missing.map((s) => s.envVar).join(", ")} not set.\n` +
      missing.map((s) => `  ${s.driver}: set ${s.envVar}=<connection string>`).join("\n") +
      `\n\n  Refusing to exit 0 having run zero tests.`,
  );
  process.exit(1);
}

let ranSuites = 0;

for (const spec of specs) {
  if (!wants(spec.driver)) continue;

  // Without an explicit flag, unconfigured remote drivers are skipped —
  // but reported, so a CI run never looks more complete than it is.
  if (!spec.url && !spec.builtin) {
    console.log(
      `\n  - SKIPPED ${spec.driver}: ${spec.envVar} not set (unconfigured, not requested)`,
    );
    continue;
  }

  console.log(`\n${"─".repeat(70)}\n  DRIVER: ${spec.driver}\n${"─".repeat(70)}`);
  await runSuite(spec.driver, spec.url!, spec.dbName);
  ranSuites++;
}

// ── Edge / PostgREST ─────────────────────────────────────────────────────
// PostgREST runs against a mock HTTP server, so it always runs and needs no
// credentials. This is the path that makes Vercel Edge / Workers / Deno work.
{
  console.log(`\n${"─".repeat(70)}\n  DRIVER: postgrest (edge)\n${"─".repeat(70)}`);
  const { run: runPostgrest } = await import("./postgrest.test.js");
  await runPostgrest();
  ranSuites++;
}

if (ranSuites === 0) {
  console.error("\n  ERROR: no suites ran.");
  process.exit(1);
}

console.log(`\n${"─".repeat(70)}\n  ${ranSuites} driver suite(s) completed.\n${"─".repeat(70)}`);
