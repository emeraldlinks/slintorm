#!/bin/sh
# Clean-and-run for the Postgres suite.
#
#   PGHOST=… PGUSER=… SUPABASE_PW=… PG_URL=… sh scripts/run-pg.sh
#
# The suite is NOT idempotent against a shared/persistent database: migrator
# and audit tests assume a clean schema, so leftovers from a previous run show
# up as spurious failures. This drops the test tables first, which is what CI
# gets for free from a fresh container.
#
# Credentials come from the environment. Nothing is written to disk.
set -e

: "${PGHOST:?set PGHOST}" "${PGUSER:?set PGUSER}" "${SUPABASE_PW:?set SUPABASE_PW}" "${PG_URL:?set PG_URL}"

if [ "${SKIP_CLEAN:-0}" != "1" ]; then
  node -e '
    const pg = require("pg");
    (async () => {
      const c = new pg.Client({ host: process.env.PGHOST, port: 5432, user: process.env.PGUSER,
        password: process.env.SUPABASE_PW, database: "postgres", ssl: { rejectUnauthorized: false } });
      await c.connect();
      const t = await c.query("select table_name from information_schema.tables where table_schema = $$public$$");
      for (const r of t.rows) {
        await c.query(`DROP TABLE IF EXISTS "${r.table_name.replace(/"/g, "\"\"")}" CASCADE`);
      }
      await c.end();
      console.error(`  cleaned ${t.rowCount} table(s)`);
    })().catch(e => { console.error(e.message); process.exit(1); });
  '
fi

cd "$(dirname "$0")/.."
PG_ONLY=1 npm run test:pg 2>&1 | grep -E "^[0-9]+/[0-9]+ passed|^  FAILED:|^    [A-Z].*:" | head -40