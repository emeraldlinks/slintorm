// ── Type-safety tests ───────────────────────────────────────────────────
// These tests verify compile-time type correctness.
// They pass if the file compiles without errors under tsc.
// Runtime is never invoked — types only.

import type { ORMManagerConfig } from "./index.js";
import type { ExecFn } from "./types.js";
import { SqlExpr } from "./types.js";
import type { ModelAPI } from "./model.js";
import ORMManager from "./index.js";

// ── Helpers ─────────────────────────────────────────────────────────────

type IsExactly<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// ── 1. ExecFn type ──────────────────────────────────────────────────────

const execFn: ExecFn = async (sql: string, params?: any[]) => ({ rows: [], affected: 0 });
void execFn;

// ── 2. ORMManagerConfig type ────────────────────────────────────────────

type _c1 = ORMManagerConfig & { driver: "sqlite"; databaseUrl: ":memory:" };
type _c2 = ORMManagerConfig & { exec: ExecFn };

// ── 3. ModelAPI type ────────────────────────────────────────────────────

interface TestUser {
  id?: number;
  name: string;
  email?: string;
}

type _modelGet = ModelAPI<TestUser>["get"];
type _modelGetAll = ModelAPI<TestUser>["getAll"];
type _modelInsert = ModelAPI<TestUser>["insert"];
type _modelCount = ModelAPI<TestUser>["count"];

// Verify return types
type _getReturn = ReturnType<_modelGet>;
type _getAllReturn = ReturnType<_modelGetAll>;
type _countReturn = ReturnType<_modelCount>;
type _getIsCorrect = IsExactly<_getReturn, Promise<TestUser | null>>;
type _getAllIsCorrect = IsExactly<_getAllReturn, Promise<TestUser[]>>;
type _countIsCorrect = IsExactly<_countReturn, Promise<number>>;

// ── 4. ORMManager instantiation ─────────────────────────────────────────

async function testOrmTypes() {
  const orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:", logs: false });

  // defineModel returns ModelAPI<T>
  const users = await orm.defineModel<TestUser>("users", "User");
  const u = await users.get({ id: 1 });
  // u should be TestUser | null
  if (u) {
    void u.name;
    void u.email;
  }

  const all = await users.getAll();
  void all[0].name;

  const count = await users.count();
  void count;

  const exists = await users.exists({ id: 1 });
  void exists;

  const firstRow = await users.query().where("id", "=", 1).first();
  void firstRow;
}

void testOrmTypes;

// ── 5. SqlExpr type ─────────────────────────────────────────────────────

const raw = SqlExpr.raw("NOW()");
void raw;

// ── 6. DeleteMany parameter type ────────────────────────────────────────

async function testDeleteMany() {
  const orm = new ORMManager({ driver: "sqlite", databaseUrl: ":memory:", logs: false });
  const users = await orm.defineModel<{ id?: number; name: string }>("test_table", "TestTable");
  const result = await users.deleteMany({ id: undefined as any });
  void result;
}
void testDeleteMany;
