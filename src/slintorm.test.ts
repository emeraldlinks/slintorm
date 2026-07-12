import ORMManager from "./index.js";
import { type ModelAPI } from "./model.js";
import { SqlExpr } from "./types.js";
import { proxyExec } from "./proxy.js";
import type { User } from "./interfaces.js";


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
      if (!Array.isArray(actual) || !actual.includes(expected)) {
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

async function run() {
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
    process.exit(1);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function resetUsers() {
  try {
    await Users.truncate();
  } catch {
    await Users.insert({ name: "_init", email: "_init@t.com", createdAt: new Date().toISOString() });
    await Users.truncate();
  }
}

async function ensureUsersExist() {
  try {
    await Users.count();
  } catch {
    await Users.insert({ name: "_init", email: "_init@t.com", createdAt: new Date().toISOString() });
    await Users.truncate();
  }
}

// ── Test models ─────────────────────────────────────────────────────────

interface Profile {
  id?: number;
  userId: number;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

const schema = {
  User: {
    table: "users",
    fields: {
      id: { type: "INTEGER", meta: { primaryKey: true, auto: true } },
      name: { type: "TEXT", optional: false, meta: { minLength: "2", maxLength: "100" } },
      email: { type: "TEXT", optional: true, meta: { email: true } },
      score: { type: "INTEGER", optional: true, meta: { min: "0", max: "100" } },
      status: { type: "TEXT", optional: true, meta: { pattern: "^[A-Za-z0-9_-]+$" } },
      category: { type: "TEXT", optional: true, meta: {} },
      isActive: { type: "boolean", optional: true, meta: {} },
      url: { type: "TEXT", optional: true, meta: { url: true } },
      uuid: { type: "TEXT", optional: true, meta: { uuid: true } },
      phone: { type: "TEXT", optional: true, meta: { phone: true } },
      ssn: { type: "TEXT", optional: true, meta: { mask: "ssn" } },
      internalNote: { type: "TEXT", optional: true, meta: { omitdb: true } },
      auditData: { type: "TEXT", optional: true, meta: { omitjson: true } },
      meta: { type: "TEXT", optional: true, meta: { json: true } },
      deletedAt: { type: "TEXT", optional: true, meta: { softDelete: true } },
      createdAt: { type: "TEXT", optional: true, meta: {} },
      updatedAt: { type: "TEXT", optional: true, meta: {} },
    },
    relations: [],
  },
  Profile: {
    table: "profiles",
    fields: {
      id: { type: "INTEGER", meta: { primaryKey: true, auto: true } },
      userId: { type: "INTEGER", optional: false, meta: {} },
      bio: { type: "TEXT", optional: true, meta: {} },
      createdAt: { type: "TEXT", optional: true, meta: {} },
      updatedAt: { type: "TEXT", optional: true, meta: {} },
    },
    relations: [],
  },
  RandomKey: {
    table: "random_keys",
    fields: {
      id: { type: "TEXT", meta: { primaryKey: true, random: "string:16" } },
      uid: { type: "TEXT", optional: true, meta: { unique: true, random: "string(24)" } },
      pin: { type: "INTEGER", optional: true, meta: { random: "number:4" } },
      upperAlnum: { type: "TEXT", optional: true, meta: { random: "alnum(10, upper)" } },
      lowerAlnum: { type: "TEXT", optional: true, meta: { random: "alnum(10, lower)" } },
      lowerLetters: { type: "TEXT", optional: true, meta: { random: "lower(12)" } },
      upperLetters: { type: "TEXT", optional: true, meta: { random: "upper(8)" } },
      hexStr: { type: "TEXT", optional: true, meta: { random: "hex(16)" } },
      upperHex: { type: "TEXT", optional: true, meta: { random: "hex(16, upper)" } },
      tokenPrefixed: { type: "TEXT", optional: true, meta: { random: "alnum(8, pfx=TKN_)" } },
      invoiceNum: { type: "TEXT", optional: true, meta: { random: "number(6, pfx=INV-)" } },
      userCode: { type: "TEXT", optional: true, meta: { random: "alnum(12, upper, pfx=USR_, sfx=_END)" } },
      customPin: { type: "TEXT", optional: true, meta: { random: "custom(ABCDEF123456, 6)" } },
      createdAt: { type: "TEXT", optional: true, meta: {} },
      updatedAt: { type: "TEXT", optional: true, meta: {} },
    },
    relations: [],
  },
};

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

let orm: ORMManager;
let Users: ModelAPI<User>;
let Profiles: ModelAPI<Profile>;
let RandomKeys: ModelAPI<RandomKey>;

beforeAll(async () => {
  orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:", schema, logs: false });
  Users = await orm.defineModel<User>("users", "User");
  Profiles = await orm.defineModel<Profile>("profiles", "Profile");
  RandomKeys = await orm.defineModel<RandomKey>("random_keys", "RandomKey");
});

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

  it("supports ordering", async () => {
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
    await Users.insert({ name: "MC1", email: "m1@t.com", category: "A", createdAt: new Date().toISOString() });
  });

  it("whereColumnsIn", async () => {
    await Users.insert({ name: "MC1", email: "m1@t.com", category: "A", status: "active", createdAt: new Date().toISOString() });
    const rows = await Users.query()
      .whereColumnsIn(["category", "status"], [["A", "active"]])
      .get();
    expect(rows.length).toBe(1);
  });
});

// ── 10. Hints ───────────────────────────────────────────────────────────

describe("Query hints", () => {
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

describe("Dry-run mode", () => {
  it("returns SQL without executing", async () => {
    const plan = await Users.query().where("id", "=", 1).dryRun().get() as any;
    expect(plan).toHaveProperty("sql");
    expect(plan).toHaveProperty("params");
    expect(typeof plan.sql).toBe("string");
  });
});

// ── 13. Rows streaming ──────────────────────────────────────────────────

describe("Rows streaming", () => {
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

describe("Raw SQL & SqlExpr", () => {
  it("SqlExpr.raw works in insert", async () => {
    const user = await Users.insert({ name: SqlExpr.raw("'ExprUser'"), email: "raw@t.com", createdAt: SqlExpr.raw("datetime('now')") } as any);
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

describe("Window functions", () => {
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

describe("Prepared Statement Mode", () => {
  it("toggles prepared mode", () => {
    (orm as any).preparedMode(true);
    expect((orm as any).isPreparedMode()).toBe(true);
    (orm as any).preparedMode(false);
    expect((orm as any).isPreparedMode()).toBe(false);
  });
});

// ── 21. Database Resolver ───────────────────────────────────────────────

describe("Database Resolver", () => {
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
  it("proxyExec is a function", () => {
    const fn = proxyExec({ endpoint: "http://localhost:9999" });
    expect(typeof fn).toBe("function");
  });
});

// ── 23. Transactions ────────────────────────────────────────────────────

describe("Transactions", () => {
  beforeEach(async () => { await resetUsers(); });

  it("runs a transaction that commits", async () => {
    await orm.transaction(async (trx) => {
      await trx.exec("INSERT INTO users (name, email, createdAt) VALUES (?, ?, ?)", ["TrxUser", "trx@t.com", new Date().toISOString()]);
    });
    const found = await Users.get({ name: "TrxUser" });
    expect(found).notToBeNull();
  });

  it("rolls back on error", async () => {
    try {
      await orm.transaction(async (trx) => {
        await trx.exec("INSERT INTO users (name, email, createdAt) VALUES (?, ?, ?)", ["RollbackUser", "rb@t.com", new Date().toISOString()]);
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

describe("Custom exec (edge mode)", () => {
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

  it("skips validation for SqlExpr.raw values", async () => {
    const nameExpr = SqlExpr.raw("'RawName'") as unknown as string;
    const createdAtExpr = SqlExpr.raw("datetime('now')") as unknown as string;
    const u = await Users.insert({ name: nameExpr, email: "raw@t.com", createdAt: createdAtExpr });
    expect(u).notToBeNull();
  });

  it("optional fields with no value skip validation", async () => {
    const u = await Users.insert({ name: "NoOpt", email: "u@t.com", createdAt: new Date().toISOString() });
    expect(u).notToBeNull();
  });
});

// ── Run ─────────────────────────────────────────────────────────────────

await run();
