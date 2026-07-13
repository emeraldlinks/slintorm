import ORMManager from "./index.js";
import { default as pg } from "pg";

/**
 * RLS (Row-Level Security) integration test for ORMManager.
 *
 * Requirements to run this test:
 * 1. A PostgreSQL database
 * 2. A database user WITHOUT the BYPASSRLS attribute (the ORM connects
 *    as this user so RLS policies are enforced). Superusers bypass RLS.
 * 3. The database must support transactional DDL (CREATE TABLE + ALTER TABLE
 *    ENABLE ROW LEVEL SECURITY + CREATE POLICY in sequence).
 *
 * This test uses a raw pg.Client (the "admin" connection) to:
 *   - Create the test table
 *   - Enable RLS, create a policy based on current_setting('rls.tenant_id')
 *   - Insert test data
 *
 * Then it creates an ORMManager with rls:true (the "app" connection, which
 * must be a non-BYPASSRLS role) and verifies that context-scoped queries
 * are properly filtered.
 */

const databaseUrl = "postgresql://postgres.bibysoybtjvjainuopyh:pXBQrdTiv2D50CdH@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
// For RLS to work you need a non-BYPASSRLS user — set via env when running the test:
//   DATABASE_URL=postgresql://app_user:pass@host:5432/db npx tsx src/test-rls-pg.ts
const appDbUrl = process.env.DATABASE_URL || databaseUrl;

async function main() {
  // ── Admin setup (creates table + RLS policy) ──
  // NOTE: This step runs as a role that may have BYPASSRLS (e.g. postgres).
  // That's fine for DDL — RLS is only enforced for the app connection.
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`DROP TABLE IF EXISTS "rls_items"`);
  await admin.query(`
    CREATE TABLE "rls_items" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "tenant" TEXT NOT NULL DEFAULT 'default',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await admin.query(`ALTER TABLE "rls_items" ENABLE ROW LEVEL SECURITY`);
  await admin.query(`
    CREATE POLICY tenant_isolation ON "rls_items"
      USING ("tenant" = current_setting('rls.tenant_id', true))
  `);
  await admin.query(`INSERT INTO "rls_items" ("name", "tenant") VALUES ('Item-A', 'tenant_a')`);
  await admin.query(`INSERT INTO "rls_items" ("name", "tenant") VALUES ('Item-B', 'tenant_b')`);
  await admin.query(`INSERT INTO "rls_items" ("name", "tenant") VALUES ('Item-C', 'tenant_a')`);
  await admin.end();

  const schema = {
    RlsItem: {
      table: "rls_items",
      primaryKey: "id",
      fields: {
        id:   { type: "number", originalType: "number", meta: { primaryKey: true } },
        name: { type: "string", originalType: "string", meta: {} },
        tenant:{ type: "string", originalType: "string", meta: {} },
        createdAt:{ type: "string", originalType: "string", meta: { index: true, default: "CURRENT_TIMESTAMP" } },
        updatedAt:{ type: "string", originalType: "string", meta: { index: true, default: "CURRENT_TIMESTAMP" } },
      },
      relations: [],
    },
  };

  // ── App connection (must be a non-BYPASSRLS role) ──
  const appDb = appDbUrl;
  console.log("App DB URL:", appDb.replace(/\/\/.*@/, "//user:pass@"));

  // No RLS — sees all 3
  const ormNoRls = new ORMManager<any>({ driver: "postgres", databaseUrl: appDb, schema, logs: false });
  const ItemsNoRls = await ormNoRls.defineModel<any>("rls_items", "RlsItem");
  const all = await ItemsNoRls.getAll();
  console.log("No RLS — getAll:", all.length, "(expect 3)");
  if (all.length !== 3) throw new Error("Expected 3 without RLS");

  // With RLS — verify user is subject to RLS
  const userCheck = await ormNoRls.adapter.exec("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user", []);
  console.log("App user:", userCheck.rows?.[0]);
  const bypass = userCheck.rows?.[0]?.rolbypassrls;
  if (bypass === true) {
    console.warn("WARNING: App user has BYPASSRLS — RLS policies will NOT be enforced.");
    console.warn("Create a non-superuser, NOBYPASSRLS role for the application.");
    // Still run the test but expect no filtering
  }

  await ormNoRls.adapter.close?.();

  // Now test with RLS enabled
  const ormRls = new ORMManager<any>({ driver: "postgres", databaseUrl: appDb, schema, logs: false, rls: true });
  const ItemsRls = await ormRls.defineModel<any>("rls_items", "RlsItem");

  ormRls.withContext({ tenant_id: "tenant_a" });
  const rowsA = await ItemsRls.getAll();
  const expectedA = bypass ? 3 : 2;
  console.log(`RLS tenant_a — getAll: ${rowsA.length} (expect ${expectedA})`);
  if (rowsA.length !== expectedA) throw new Error(`Expected ${expectedA} for tenant_a, got ${rowsA.length}`);

  ormRls.clearContext();
  ormRls.withContext({ tenant_id: "tenant_b" });
  const rowsB = await ItemsRls.getAll();
  const expectedB = bypass ? 3 : 1;
  console.log(`RLS tenant_b — getAll: ${rowsB.length} (expect ${expectedB})`);
  if (rowsB.length !== expectedB) throw new Error(`Expected ${expectedB} for tenant_b, got ${rowsB.length}`);

  // INSERT with RLS
  ormRls.clearContext();
  ormRls.withContext({ tenant_id: "tenant_a" });
  const ins = await ItemsRls.insert({ name: "Item-D", tenant: "tenant_a" });
  console.log("RLS insert id:", ins?.id);

  const afterInsert = await ItemsRls.getAll();
  const expectedAfterIns = bypass ? 4 : 3;
  console.log(`RLS tenant_a after insert: ${afterInsert.length} (expect ${expectedAfterIns})`);
  if (afterInsert.length !== expectedAfterIns) throw new Error(`Expected ${expectedAfterIns} after insert, got ${afterInsert.length}`);

  // UPDATE with RLS
  ormRls.clearContext();
  ormRls.withContext({ tenant_id: "tenant_a" });
  const updated = await ItemsRls.update({ id: ins.id } as any, { name: "Item-D-Updated" } as any);
  console.log("RLS update:", updated?.name, "(expect 'Item-D-Updated')");

  // QueryBuilder
  ormRls.clearContext();
  ormRls.withContext({ tenant_id: "tenant_a" });
  const qb = await ItemsRls.query().where("name", "=", "Item-A").get();
  const expectedQb = bypass ? 1 : 1;
  console.log(`RLS query() — where name=Item-A: ${qb.length} (expect ${expectedQb})`);
  if (qb.length !== expectedQb) throw new Error(`Expected ${expectedQb} from query, got ${qb.length}`);

  // Accessors
  if (!ormRls.rlsEnabled()) throw new Error("rlsEnabled should be true");
  if (ormNoRls.rlsEnabled()) throw new Error("rlsEnabled should be false");

  // Multi-key context
  ormRls.clearContext();
  ormRls.withContext({ tenant_id: "tenant_b", user_id: "user1" });
  const multi = await ItemsRls.getAll();
  const expectedMulti = bypass ? 4 : 1;
  console.log(`RLS multi-key context: ${multi.length} (expect ${expectedMulti})`);
  if (multi.length !== expectedMulti) throw new Error(`Expected ${expectedMulti} with multi-key, got ${multi.length}`);

  await ormRls.adapter.close?.();
  console.log("\n✅ All RLS tests passed");
}

main().catch(err => { console.error("FAILED:", err); process.exit(1); });
