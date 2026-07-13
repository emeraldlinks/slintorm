import { default as pg } from "pg";

// Try direct connection (not pooler)
const databaseUrl = "postgresql://postgres.bibysoybtjvjainuopyh:pXBQrdTiv2D50CdH@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  // Create a non-bypassrls role on this connection
  const roleName = `rls_user_${Date.now()}`;
  try {
    await client.query(`DROP ROLE IF EXISTS "${roleName}"`);
    await client.query(`CREATE ROLE "${roleName}" WITH LOGIN PASSWORD 'test123' NOBYPASSRLS`);
    console.log(`Created role: ${roleName}`);
  } catch(e) {
    console.error("Failed to create role:", e);
    // Maybe we can't create roles on this instance
  }

  const tableName = `rls_test_${Date.now()}`;
  await client.query(`DROP TABLE IF EXISTS "${tableName}"`);
  await client.query(`CREATE TABLE "${tableName}" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tenant" TEXT NOT NULL
  )`);
  await client.query(`INSERT INTO "${tableName}" ("name", "tenant") VALUES ('A', 'a'), ('B', 'b'), ('C', 'a')`);

  await client.query(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`);
  await client.query(`CREATE POLICY tenant_isolation ON "${tableName}"
    USING ("tenant" = current_setting('rls.tenant_id', true))
  `);

  // Grant to our test role
  try {
    await client.query(`GRANT ALL ON "${tableName}" TO "${roleName}"`);
    await client.query(`GRANT ALL ON SEQUENCE "${tableName}_id_seq" TO "${roleName}"`);
  } catch(e) {
    console.error("Grant failed:", e);
  }

  // Now try to connect as the new role through the pooler  
  await client.end();

  try {
    const userClient = new pg.Client({
      connectionString: `postgresql://${roleName}:test123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
    });
    await userClient.connect();

    await userClient.query("SELECT set_config('rls.tenant_id', 'a', false)");
    const r = await userClient.query(`SELECT * FROM "${tableName}"`);
    console.log("Non-bypassrls user (tenant_a):", r.rows.length, r.rows.map((r: any) => r.name));

    await userClient.end();
  } catch(e) {
    console.error("Connection as test user failed:", (e as Error).message || e);
    console.log("This is expected - Supabase pooler blocks custom roles via password auth");
    console.log("Need to use the Supabase dashboard or API to create the user");
  }
}

main().catch(err => console.error("FAILED:", err));
