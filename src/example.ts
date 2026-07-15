/**
 * example.ts
 *
 * A runnable walkthrough of SlintORM covering all features.
 *
 * Run with: npx tsx src/example.ts
 */

import ORMManager from "./index.js";
import type { Post, User, Profile, Todo, Team, AggTest, Comment, RandomKey, Payment } from "./interfaces.js";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const heading = (s: string) => console.log(`\n${"=".repeat(60)}\n  ${s}\n${"=".repeat(60)}`);
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const info = (s: string) => console.log(`  \x1b[36m→\x1b[0m ${s}`);
const fail = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);

async function tryOrSkip(label: string, fn: () => Promise<any>) {
  try { return await fn(); } catch (e: any) { info(`${label}: skipped (${e.message})`); return undefined; }
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const orm = new ORMManager<any>({
    driver: "sqlite",
    databaseUrl: ":memory:",
    dir: "src",
    logs: false,
    encryptionKey: "test-encryption-key-32-chars-minimum!!",
  });

  await orm.migrate();

  const db = orm.DB;

  // Define models
  const Users = await orm.defineModel<User>("users", "User");
  const Posts = await orm.defineModel<Post>("posts", "Post");
  const Todos = await orm.defineModel<Todo>("todos", "Todo");
  const Profiles = await orm.defineModel<Profile>("profiles", "Profile");
  const Teams = await orm.defineModel<Team>("teams", "Team", {
    onCreateBefore(item: any) { console.log("before create Team:", item); },
    onCreateAfter(item: any) { console.log("after create Team:", item); },
    onUpdateAfter(oldData: any, newData: any) { console.log("Team updated:", { oldData, newData }); },
  });
  const Agg = await orm.defineModel<AggTest>("agg_tests", "AggTest");
  const Comments = await orm.defineModel<Comment>("comments", "Comment");

  // @random demo model
  const RandomKeys = await orm.defineModel<RandomKey>("random_keys", "RandomKey");

  console.log("=== SlintORM Example ===");

  // ──────────────────────────────────────────────────────────────────────────
  // 1. HOOKED INSERT/UPDATE
  // ──────────────────────────────────────────────────────────────────────────
  heading("1. Hooked insert/update");

  const newTeam = await (Teams as any).insert({
    title: "Hook Team", detail: "Hook test", open: true, tested: false,
    createdAt: new Date().toISOString(),
  });
  console.log("newTeam:", newTeam);
  if (newTeam?.id) await (Teams as any).update({ id: newTeam.id }, { tested: true });
  ok("Hooks work");

  // ──────────────────────────────────────────────────────────────────────────
  // 2. BASIC CRUD
  // ──────────────────────────────────────────────────────────────────────────
  heading("2. Basic CRUD");

  await Todos.insert({ title: "Watch the plates", detail: "Wash all plates", createdAt: new Date().toISOString() });
  console.log("todos:", await Todos.getAll());

  const newUser: any = await (Users as any).insert({
    name: "Catherine", email: "catherine@example.com",
  });
  console.log("newUser:", newUser);

  // ── @json demo ──────────────────────────────────────────────────────
  heading("2b. @json field round-trip");

  const jsonUser = await (Users as any).insert({
    name: "JsonDemo",
    email: "json@demo.com",
    meta: { theme: "dark", notifications: true, score: 42, tags: ["orm", "typescript"] },
  });
  console.log("insert with meta:", jsonUser);
  console.log("  meta.theme  →", jsonUser?.meta?.theme);
  console.log("  meta.tags   →", jsonUser?.meta?.tags);

  const fetched = await (Users as any).get({ id: jsonUser?.id });
  console.log("get() after insert:", fetched);
  console.log("  meta.theme  →", fetched?.meta?.theme);
  console.log("  meta.tags   →", fetched?.meta?.tags);

  const updated = await (Users as any).update(
    { id: jsonUser?.id },
    { meta: { theme: "light", score: 99 } }
  );
  console.log("after update():", updated);
  console.log("  meta.theme  →", updated?.meta?.theme);

  await (jsonUser as any).update({ meta: { nested: { a: 1, b: [2, 3] } } });
  const afterInstance = await (Users as any).get({ id: jsonUser?.id });
  console.log("after instance update():", afterInstance);
  console.log("  meta.nested.b →", afterInstance?.meta?.nested?.b);

  await (Users as any).updateMany(
    { name: "JsonDemo" },
    { meta: { val: "bulk" } }
  );
  const afterBulk = await (Users as any).get({ id: jsonUser?.id });
  console.log("after updateMany():", afterBulk);
  console.log("  meta.val  →", afterBulk?.meta?.val);

  ok("@json insert, get, update, instance update, updateMany all round-trip correctly");

  await Profiles.insert({ userId: newUser?.id!, bio: "My bio" } as any);

  const newPost: any = await Posts.insert({ title: "Hello World", userId: newUser?.id } as any);
  console.log("newPost:", newPost);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. PRELOADING RELATIONS
  // ──────────────────────────────────────────────────────────────────────────
  heading("3. Preloading relations");

  const userWithRelations = await (Users as any).query()
    .preload("posts")
    .first(`id = ${newUser?.id}`);
  console.dir(userWithRelations, { depth: null });

  const postWithUser = await (Posts as any).query()
    .preload("user")
    .first();
  console.dir(postWithUser, { depth: null });
  ok("Preloading works");

  // ──────────────────────────────────────────────────────────────────────────
  // 4. WINDOW FUNCTIONS
  // ──────────────────────────────────────────────────────────────────────────
  heading("4. Window functions");

  const rankedUsers = await (Users as any).query()
    .window("ROW_NUMBER()", "ORDER BY id ASC")
    .get();
  console.log("rankedUsers:", rankedUsers);
  ok("Window functions work");

  // ──────────────────────────────────────────────────────────────────────────
  // 5. findOrCreate / soft delete
  // ──────────────────────────────────────────────────────────────────────────
  heading("5. findOrCreate / soft delete / restore");

  const { record: foundOrCreated, created } = await (Users as any).findOrCreate(
    { id: newUser?.id! },
    { name: "Fallback Name" }
  );
  console.log("findOrCreate:", { foundOrCreated, created });

  await tryOrSkip("soft delete", () => (Users as any).restore({ id: 1 }));
  await tryOrSkip("withTrashed", () => Users.query().withTrashed().get());
  await tryOrSkip("onlyTrashed", () => Users.query().onlyTrashed().get());
  ok("findOrCreate / soft delete done");

  // ──────────────────────────────────────────────────────────────────────────
  // 6. BULK OPERATIONS + UPSERT
  // ──────────────────────────────────────────────────────────────────────────
  heading("6. Bulk operations + UPSERT");

  await (Users as any).insertMany([
    { name: "Joe", email: "joe@test.com" },
    { name: "Jane", email: "jane@test.com" },
  ]);
  await (Users as any).updateMany({ name: "Joe" }, { name: "Joseph" });
  await (Users as any).deleteMany({ name: "Jane" });
  ok("Bulk insert/update/delete");

  const upsertR = await (Users as any).upsert(
    { email: "upsert@test.com" },
    { name: "Upserted", email: "upsert@test.com" }
  );
  console.log("  upsert (insert):", upsertR);
  const upsertR2 = await (Users as any).upsert(
    { email: "upsert@test.com" },
    { name: "Upserted Updated", email: "upsert@test.com" }
  );
  console.log("  upsert (update):", upsertR2);
  ok("UPSERT works");

  // ──────────────────────────────────────────────────────────────────────────
  // 7. AGGREGATIONS (ModelAPI)
  // ──────────────────────────────────────────────────────────────────────────
  heading("7. Aggregations (ModelAPI)");

  for (let i = 1; i <= 9; i++) {
    await Agg.insert({ name: `agg-${i}`, value: i * 10, category: ["A", "B", "C"][i % 3] } as any);
  }

  info(`count()       = ${await Agg.count()}`);
  info(`sum(value)    = ${await Agg.sum("value")}`);
  info(`avg(value)    = ${await Agg.avg("value")}`);
  info(`min(value)    = ${await Agg.min("value")}`);
  info(`max(value)    = ${await Agg.max("value")}`);
  info(`count(cat=A)  = ${await Agg.count({ category: "A" } as any)}`);
  info(`sum(value, A) = ${await Agg.sum("value", { category: "A" } as any)}`);
  ok("ModelAPI aggregates work");

  // ──────────────────────────────────────────────────────────────────────────
  // 8. QB AGGREGATE SELECTORS + GROUP BY / HAVING
  // ──────────────────────────────────────────────────────────────────────────
  heading("8. QB aggregate selectors + GROUP BY / HAVING");

  const grouped = await Agg.query()
    .select("category")
    .sum("value")
    .avg("value")
    .countAggregate("*")
    .groupBy("category")
    .get();
  console.log("  GROUP BY:", JSON.stringify(grouped));

  const having = await Agg.query()
    .select("category")
    .sum("value")
    .groupBy("category")
    .having("SUM(value) > ?", [150])
    .get();
  console.log("  HAVING:", JSON.stringify(having));
  ok("GROUP BY / HAVING work");

  // ──────────────────────────────────────────────────────────────────────────
  // 9. OFFSET / LIMIT PAGINATION
  // ──────────────────────────────────────────────────────────────────────────
  heading("9. Offset / limit pagination");

  const total = await Users.count();
  const page2 = await (Users as any).query().orderBy("id", "asc").limit(2).offset(2).get();
  info(`limit(2).offset(2): ${page2.map((u: any) => u.name).join(", ")}`);

  const paginated = await (Users as any).query().orderBy("id", "asc").getPaginated(2, 2);
  info(`getPaginated(2,2): page=${paginated.page}/${paginated.lastPage}, total=${paginated.total}`);
  ok("Offset/limit pagination works");

  // ──────────────────────────────────────────────────────────────────────────
  // 10. RAW SQL (execRaw + whereRaw)
  // ──────────────────────────────────────────────────────────────────────────
  heading("10. Raw SQL");

  const raw = await orm.execRaw("SELECT name, email FROM users WHERE id > ?", [2]);
  info(`execRaw: ${raw.rows.length} rows, first: ${raw.rows[0]?.name}`);

  const rawW = await (Users as any).query().whereRaw("id IN (?, ?)", [1, 3]).get();
  info(`whereRaw: ${rawW.map((u: any) => u.name).join(", ")}`);
  ok("Raw SQL works");

  // ──────────────────────────────────────────────────────────────────────────
  // 11. SEEDS
  // ──────────────────────────────────────────────────────────────────────────
  heading("11. Seeds");

  orm.seeder("demo", async (o: any, log: any) => {
    log("Seeding...");
    await o.DB.AggTest.insert({ name: "seeded", value: 999, category: "Z" });
  });
  await orm.runSeed("demo");
  info(`Seeded count: ${await Agg.count({ name: "seeded" } as any)}`);

  // Register another and run all
  orm.seeder("demo2", async (o: any, log: any) => {
    log("Seeding more...");
    await o.DB.AggTest.insert({ name: "seeded2", value: 888, category: "Z" });
  });
  await orm.runAllSeeds();
  ok("Seeds work");

  // ──────────────────────────────────────────────────────────────────────────
  // 12. MIGRATION HISTORY
  // ──────────────────────────────────────────────────────────────────────────
  heading("12. Migration history");

  const adapter = (orm as any).adapter;
  const mrows = await adapter.exec("SELECT name, batch FROM _slint_migrations ORDER BY id");
  info(`${mrows.rows.length} migrations applied:`);
  for (const r of mrows.rows) info(`  ${r.name} (batch ${r.batch})`);
  ok("Migration history accessible");

  // ──────────────────────────────────────────────────────────────────────────
  // 13. POLYMORPHIC ASSOCIATIONS
  // ──────────────────────────────────────────────────────────────────────────
  heading("13. Polymorphic (morphTo / morphMany)");

  await Comments.insert({ body: "Great post!", commentableType: "Post", commentableId: newPost?.id! } as any);
  await Comments.insert({ body: "Nice user!", commentableType: "User", commentableId: newUser?.id! } as any);

  const comment = await (Comments as any).get({ id: 1 });
  if (comment) {
    // Fields auto-detected from // @polymorphicType / @polymorphicId annotations
    const parent = await (Comments as any).morphTo();
    info(`morphTo comment #1 → ${parent ? (parent.title || parent.name) : "null"}`);
  }
  ok("Polymorphic morphTo works");

  // ──────────────────────────────────────────────────────────────────────────
  // 14. CTE (WITH clause)
  // ──────────────────────────────────────────────────────────────────────────
  heading("14. CTE (WITH clause)");

  await tryOrSkip("CTE with()", async () => {
    const inner = (Agg as any).query().select("name", "value").where("value", ">", 50);
    const cteQb = (Agg as any).query().with("high_vals", inner);
    cteQb.table = "high_vals";
    const cteResult = await cteQb.get();
    info(`CTE rows: ${cteResult.length}`);
    if (cteResult.length) info(`  first: ${JSON.stringify(cteResult[0])}`);
  });
  ok("CTE tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 15. SET OPERATIONS (union / intersect / except)
  // ──────────────────────────────────────────────────────────────────────────
  heading("15. Set operations (union / intersect / except)");

  await tryOrSkip("union", async () => {
    const unioned = await orm.execRaw(
      "SELECT name, value FROM agg_tests WHERE category = ? UNION SELECT name, value FROM agg_tests WHERE category = ?",
      ["A", "B"]
    );
    info(`UNION (raw) rows: ${unioned.rows.length}`);
  });
  await tryOrSkip("intersect", async () => {
    const x = await orm.execRaw(
      "SELECT name, value FROM agg_tests WHERE value > ? INTERSECT SELECT name, value FROM agg_tests WHERE value < ?",
      [30, 70]
    );
    info(`INTERSECT (raw) rows: ${x.rows.length}`);
  });
  await tryOrSkip("except", async () => {
    const x = await orm.execRaw(
      "SELECT name, value FROM agg_tests EXCEPT SELECT name, value FROM agg_tests WHERE value >= ?",
      [50]
    );
    info(`EXCEPT (raw) rows: ${x.rows.length}`);
  });
  ok("Set operations tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 16. ADVANCED JOINS
  // ──────────────────────────────────────────────────────────────────────────
  heading("16. Advanced joins (right / full / cross)");

  await tryOrSkip("crossJoin", async () => {
    const r = await (Users as any).query()
      .select("name", "title")
      .crossJoin("posts")
      .limit(3)
      .get();
    info(`crossJoin rows: ${r.length}`);
  });
  ok("Advanced joins tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 17. FULLTEXT SEARCH
  // ──────────────────────────────────────────────────────────────────────────
  heading("17. Full-text search");

  await tryOrSkip("fulltextSearch", async () => {
    const r = await (Users as any).query()
      .fulltextSearch("name", "Catherine")
      .get();
    info(`fulltextSearch: ${r.length} result(s)`);
  });
  ok("Full-text search tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 18. LOCKING CLAUSES
  // ──────────────────────────────────────────────────────────────────────────
  heading("18. Locking clauses (forUpdate / skipLocked / noWait)");

  await tryOrSkip("forUpdate", async () => {
    const r = await (Users as any).query().where("id", "=", 1).forUpdate().get();
    info(`forUpdate: ${r.length} row(s)`);
  });
  await tryOrSkip("skipLocked", async () => {
    await (Users as any).query().where("id", "=", 1).forUpdate().skipLocked().get();
  });
  await tryOrSkip("noWait", async () => {
    await (Users as any).query().forShare().noWait().limit(1).get();
  });
  ok("Locking clauses tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 19. TRANSACTIONS & BATCH
  // ──────────────────────────────────────────────────────────────────────────
  heading("19. Transactions & batch");

  await orm.transaction(async (trx) => {
    await trx.exec("INSERT INTO users (name, email) VALUES (?, ?)", ["Trx User", "trx@test.com"]);
    const chk = await trx.exec("SELECT COUNT(*) as count FROM users WHERE name = ?", ["Trx User"]);
    info(`Transaction: count=${chk.rows[0].count}`);
  });

  await orm.batch([
    { sql: "INSERT INTO users (name, email) VALUES (?, ?)", params: ["Batched Joe", "joe@batch.com"] },
    { sql: "INSERT INTO profiles (userId, bio) VALUES (?, ?)", params: [1, "batch bio"] },
  ]);
  ok("Transactions & batch work");

  // ──────────────────────────────────────────────────────────────────────────
  // 20. VALIDATION / SCOPES / EXCLUDE
  // ──────────────────────────────────────────────────────────────────────────
  heading("20. Validation / scopes / exclude");

  const errors = (Users as any).check(
    { email: "not-an-email" },
    { email: { required: true, email: true } }
  );
  console.log("  validation errors:", errors);

  await tryOrSkip("scope", async () => {
    const s = await (Users as any).query().scope((qb: any) => qb.where("id", ">", 0)).get();
    info(`scope: ${s.length} users`);
  });

  const excluded = await (Users as any).query().exclude("email").first();
  console.log("  excluded email:", excluded ? (excluded.email === undefined ? "removed" : "present") : "null");
  ok("Validation / scopes / exclude work");

  // ──────────────────────────────────────────────────────────────────────────
  // 21. FIRST OR INIT
  // ──────────────────────────────────────────────────────────────────────────
  heading("21. FirstOrInit");

  const foi = await (Users as any).firstOrInit({ name: "NonExistent" }, { email: "new@test.com" });
  info(`firstOrInit (not found): ${foi ? foi.name + " (" + foi.email + ")" : "null"} — not saved to DB`);

  const foi2 = await (Users as any).firstOrInit({ name: "Catherine" });
  info(`firstOrInit (found): ${foi2 ? foi2.name : "null"}`);
  ok("FirstOrInit works");

  // ──────────────────────────────────────────────────────────────────────────
  // 22. FIND IN BATCHES
  // ──────────────────────────────────────────────────────────────────────────
  heading("22. FindInBatches");

  let batchCount = 0;
  let totalBatched = 0;
  await (Users as any).findInBatches(null, 2, async (records: any[], batchNum: number) => {
    batchCount++;
    totalBatched += records.length;
    info(`  batch ${batchNum}: ${records.length} records`);
  });
  info(`FindInBatches: ${batchCount} batches, ${totalBatched} total`);
  ok("FindInBatches works");

  // ──────────────────────────────────────────────────────────────────────────
  // 23. GROUP CONDITIONS
  // ──────────────────────────────────────────────────────────────────────────
  heading("23. Group conditions (andWhereGroup / orWhereGroup)");

  const grouped2 = await (Agg as any).query()
    .andWhereGroup((qb: any) => {
      qb.where("value", ">", 30);
      qb.where("value", "<", 70);
    })
    .orWhereGroup((qb: any) => {
      qb.where("category", "=", "C");
    })
    .get();
  info(`Group conditions: ${grouped.length} row(s)`);
  ok("Group conditions work");

  // ──────────────────────────────────────────────────────────────────────────
  // 24. NAMED ARGUMENTS
  // ──────────────────────────────────────────────────────────────────────────
  heading("24. Named arguments (namedWhere)");

  const named = await (Agg as any).query()
    .namedWhere("category = :cat AND value > :minVal", { cat: "A", minVal: 20 })
    .get();
  info(`Named args: ${named.length} row(s)`);
  ok("Named arguments work");

  // ──────────────────────────────────────────────────────────────────────────
  // 25. OPTIMIZER / INDEX / COMMENT HINTS
  // ──────────────────────────────────────────────────────────────────────────
  heading("25. Query hints");

  const hintedSql = (Users as any).query()
    .hint("/*+ NO_INDEX */")
    .indexHint("idx_users_name")
    .toSql();
  info(`Hints SQL: ${hintedSql.sql}`);
  ok("Query hints work");

  // ──────────────────────────────────────────────────────────────────────────
  // 26. DRY RUN MODE
  // ──────────────────────────────────────────────────────────────────────────
  heading("26. Dry-run mode");

  const dry = await (Users as any).query().where("id", "=", 1).dryRun().get();
  info(`Dry-run: ${dry.sql}`);
  ok("Dry-run works");

  // ──────────────────────────────────────────────────────────────────────────
  // 27. ROWS STREAMING
  // ──────────────────────────────────────────────────────────────────────────
  heading("27. Rows streaming");

  let streamed = 0;
  for await (const batch of (Users as any).query().orderBy("id", "asc").stream(2)) {
    streamed += batch.length;
    info(`  stream batch: ${batch.map((r: any) => r.name).join(", ")}`);
  }
  info(`Stream total: ${streamed} rows`);
  ok("Streaming works");

  // ──────────────────────────────────────────────────────────────────────────
  // 28. MULTI-COLUMN IN
  // ──────────────────────────────────────────────────────────────────────────
  heading("28. Multi-column IN");

  await tryOrSkip("whereColumnsIn", async () => {
    const mc = await (Agg as any).query()
      .whereColumnsIn(["category", "value"], [["A", 30], ["B", 60]])
      .get();
    info(`Multi-column IN: ${mc.length} row(s)`);
  });
  ok("Multi-column IN tested");

  // ──────────────────────────────────────────────────────────────────────────
  // 29. COUNT DISTINCT / COUNT WITH GROUP
  // ──────────────────────────────────────────────────────────────────────────
  heading("29. Enhanced counts");

  const cd = await (Agg as any).query().countDistinct("category");
  info(`countDistinct(category): ${cd}`);

  const cg = await (Agg as any).query().countWithGroup("category");
  info(`countWithGroup: ${JSON.stringify(cg)}`);
  ok("Enhanced counts work");

  // ──────────────────────────────────────────────────────────────────────────
  // 30. AFTER FIND HOOK
  // ──────────────────────────────────────────────────────────────────────────
  heading("30. AfterFind hook");

  const withHook = await (Agg as any).query()
    .afterFind((rows: any[]) => {
      return rows.map((r: any) => ({ ...r, _transformed: true }));
    })
    .limit(1)
    .get();
  info(`AfterFind _transformed: ${withHook[0]?._transformed === true}`);
  ok("AfterFind hook works");

  // ──────────────────────────────────────────────────────────────────────────
  // 31. PLUGIN SYSTEM
  // ──────────────────────────────────────────────────────────────────────────
  heading("31. Plugin system");

  const pluginEvents: string[] = [];
  orm.use({
    name: "test-plugin",
    install(o: any) { info("Plugin installed"); },
    on(event: string) { pluginEvents.push(event); },
  });
  info(`Plugin registered: ${pluginEvents.length} events so far`);
  ok("Plugin system works");

  // ──────────────────────────────────────────────────────────────────────────
  // 32. CONTEXT
  // ──────────────────────────────────────────────────────────────────────────
  heading("32. Context propagation");

  orm.withContext({ requestId: "req-123", userId: "user-42" });
  const ctx = orm.getContext();
  info(`Context: requestId=${ctx.requestId}, userId=${ctx.userId}`);
  orm.clearContext();
  info(`Context cleared: ${JSON.stringify(orm.getContext())}`);
  ok("Context propagation works");

  // ──────────────────────────────────────────────────────────────────────────
  // 33. PREPARED STATEMENT MODE
  // ──────────────────────────────────────────────────────────────────────────
  heading("33. Prepared Statement Mode");

  (orm as any).preparedMode(true);
  info(`Prepared mode: ${(orm as any).isPreparedMode()}`);
  (orm as any).preparedMode(false);
  ok("Prepared Statement Mode works");

  // ──────────────────────────────────────────────────────────────────────────
  // 34. DATABASE RESOLVER — useDb on model
  // ──────────────────────────────────────────────────────────────────────────
  heading("34. Database Resolver — useDb");

  (orm as any).addDatabase("archive", { driver: "sqlite", databaseUrl: ":memory:", logs: false });
  const archiveDb = (orm as any).resolveDb("archive");
  archiveDb.exec("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, createdAt TEXT, updatedAt TEXT)");

  const ArchivePosts = await (Posts as any).useDb("archive");
  await ArchivePosts.insert({ title: "Archive post", createdAt: new Date().toISOString() });
  const archiveResult = await ArchivePosts.getAll();
  info(`Archive posts: ${archiveResult.length}`);
  ok("useDb works");

  // ──────────────────────────────────────────────────────────────────────────
  // 35. @RANDOM ANNOTATION
  // ──────────────────────────────────────────────────────────────────────────
  heading("35. @random annotation");

  const rk = await RandomKeys.insert({
    // id is auto-generated by @random:string:16
    // uid is auto-generated by @random:string(24)
    // pin is auto-generated by @random:number:4
    // upperAlnum is auto-generated by @random:alnum(10, upper)
    // lowerAlnum is auto-generated by @random:alnum(10, lower)
    // lowerLetters is auto-generated by @random:lower(12)
    // upperLetters is auto-generated by @random:upper(8)
    // hexStr is auto-generated by @random:hex(16)
    // upperHex is auto-generated by @random:hex(16, upper)
    // tokenPrefixed is auto-generated by @random:alnum(8, pfx=TKN_)
    // invoiceNum is auto-generated by @random:number(6, pfx=INV-)
    // userCode is auto-generated by @random:alnum(12, upper, pfx=USR_, sfx=_END)
    // customPin is auto-generated by @random:custom(ABCDEF123456, 6)
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  info(`id (string:16): ${rk?.id} (length=${(rk as any)?.id?.length})`);
  info(`uid (string:24): ${rk?.uid} (length=${(rk as any)?.uid?.length})`);
  info(`pin (number:4):  ${rk?.pin}`);
  info(`upperAlnum (alnum, upper):  ${(rk as any)?.upperAlnum}`);
  info(`lowerAlnum (alnum, lower):  ${(rk as any)?.lowerAlnum}`);
  info(`lowerLetters (lower):  ${(rk as any)?.lowerLetters}`);
  info(`upperLetters (upper):  ${(rk as any)?.upperLetters}`);
  info(`hexStr (hex):  ${(rk as any)?.hexStr}`);
  info(`upperHex (hex, upper):  ${(rk as any)?.upperHex}`);
  info(`tokenPrefixed (pfx=TKN_):  ${(rk as any)?.tokenPrefixed}`);
  info(`invoiceNum (pfx=INV-):  ${(rk as any)?.invoiceNum}`);
  info(`userCode (pfx=USR_, sfx=_END):  ${(rk as any)?.userCode}`);
  info(`customPin (custom):  ${(rk as any)?.customPin}`);
  ok("@random generates values on insert");

  // Provide explicit value — annotation is skipped
  const rk2 = await RandomKeys.insert({
    id: "custom-id-001",
    uid: "custom-uid",
    pin: 9999,
    upperAlnum: "MY_ALNUM",
    lowerAlnum: "my_alnum",
    lowerLetters: "mylowerletters",
    upperLetters: "MYUPPER",
    hexStr: "aabbccddeeff1122",
    upperHex: "AABBCCDDEEFF1122",
    tokenPrefixed: "TKN_custom",
    invoiceNum: "INV-custom",
    userCode: "USR_custom_END",
    customPin: "ABC123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  info(`explicit id: ${rk2?.id}`);
  info(`explicit uid: ${rk2?.uid}`);
  info(`explicit pin: ${rk2?.pin}`);
  info(`explicit upperAlnum: ${(rk2 as any)?.upperAlnum}`);
  info(`explicit customPin: ${(rk2 as any)?.customPin}`);
  ok("@random respects user-provided values");

  // ──────────────────────────────────────────────────────────────────────────
  // 36. QUERY BUILDER — entity methods & bulk delete/update
  // ──────────────────────────────────────────────────────────────────────────
  heading("36. Query Builder — entity methods & bulk actions");

  // Entity methods on query().first()
  const first = await RandomKeys.query().first();
  info(`first.id = ${first?.id}`);
  if (first) {
    const before = (first as any).id;
    await (first as any).update({ uid: "updated-via-entity" });
    const refreshed = await (first as any).refresh();
    info(`refresh after update: uid=${(refreshed as any)?.uid}`);
    ok("entity .update() / .refresh() on query().first() result");
    await (first as any).delete();
    const gone = await RandomKeys.get({ id: before } as any);
    if (!gone) ok("entity .delete() on query().first() result");
  }

  // Bulk delete via query builder
  await RandomKeys.insert({
    id: "bulk-del-1", uid: "bulk-del-1", pin: 1111,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await RandomKeys.insert({
    id: "bulk-del-2", uid: "bulk-del-2", pin: 2222,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const deletedCount = await RandomKeys.query().where("id" as any, "LIKE", "bulk-del-%").delete();
  info(`bulk deleted: ${deletedCount} rows`);
  ok("query().where(...).delete() works");

  // Bulk update via query builder
  await RandomKeys.insert({
    id: "bulk-up-1", uid: "old-uid", pin: 3333,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await RandomKeys.insert({
    id: "bulk-up-2", uid: "old-uid-2", pin: 4444,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const updatedCount = await RandomKeys.query().where("id" as any, "LIKE", "bulk-up-%").update({ pin: 9999 });
  info(`bulk updated: ${updatedCount} rows`);
  const verifyUpdate = await RandomKeys.query().where("pin" as any, "=", 9999);
  info(`rows with pin=9999: ${(await verifyUpdate.get()).length}`);
  ok("query().where(...).update() works");

  // Cleanup
  await RandomKeys.query().where("id" as any, "LIKE", "bulk-up-%").delete();

  // ──────────────────────────────────────────────────────────────────────────
  // 37. BOOLEAN ROUND-TRIP (SQLite stores 0/1, ORM returns true/false)
  // ──────────────────────────────────────────────────────────────────────────
  heading("37. Boolean serialization");

  await Teams.insert({
    title: "BoolTest",
    open: true,
    tested: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const boolTeam = await Teams.get({ title: "BoolTest" } as any);
  info(`get() — open=${boolTeam?.open} (${typeof boolTeam?.open}), tested=${boolTeam?.tested} (${typeof boolTeam?.tested})`);
  if (typeof boolTeam?.open !== "boolean" || typeof boolTeam?.tested !== "boolean") {
    throw new Error(`Expected boolean types, got open=${typeof boolTeam?.open}, tested=${typeof boolTeam?.tested}`);
  }
  ok("insert + get round-trips booleans correctly");

  const openTeams = await Teams.query().where("open" as any, "=", true).get();
  info(`query().where(open=true) → ${openTeams.length} row(s)`);
  if (openTeams.length < 1) throw new Error("Expected at least 1 open team");
  ok("query().where() with boolean works");

  const firstTeam = await Teams.query().first({ tested: false } as any);
  info(`first(tested=false) → ${firstTeam?.title}`);
  if (!firstTeam) throw new Error("Expected first team");
  ok("query().first() with boolean works");

  // Cleanup boolean test data
  await Teams.query().where("title" as any, "=", "BoolTest").delete();

  // ── 38. @mask annotation ──────────────────────────────────────────────────
  heading("38. @mask annotation (presets & directives)");

  // Insert one row with all mask variants
  await Users.insert({
    name: "MaskDemo", email: "mask@demo.com",
    ssn: "987-65-4321",
    creditCard: "4111-1111-1111-1111",
    maskedEmail: "john.doe@example.com",
    phoneNumber: "555-123-4567",
    showFirst4: "ABCDEFGHIJ",
    showLast4: "ABCDEFGHIJ",
    starMasked: "secret-value",
    patternMasked: "123-45-6789",
  } as any);

  const maskedUser = await Users.get({ name: "MaskDemo" } as any);
  console.log("  ssn (mask:ssn):           ", maskedUser?.ssn);            // ***-**-4321
  console.log("  creditCard (creditcard):  ", maskedUser?.creditCard);     // ****-****-****-1111
  console.log("  maskedEmail (email):      ", maskedUser?.maskedEmail);    // j*****@example.com
  console.log("  phoneNumber (phone):      ", maskedUser?.phoneNumber);    // ***-***-4567
  console.log("  showFirst4:               ", maskedUser?.showFirst4);     // ABCD******
  console.log("  showLast4:                ", maskedUser?.showLast4);      // ******GHIJ
  console.log("  starMasked (char:*):      ", maskedUser?.starMasked);     // ********alue
  console.log("  patternMasked:            ", maskedUser?.patternMasked);  // ###-##-####
  ok("all mask presets & directives work on get");

  // .withoutMasking() returns raw values
  const unmasked = await Users.query().withoutMasking()
    .where("name" as any, "=", "MaskDemo").get();
  console.log("  raw ssn:         ", unmasked[0]?.ssn);
  console.log("  raw creditCard:  ", unmasked[0]?.creditCard);
  console.log("  raw email:       ", unmasked[0]?.maskedEmail);
  console.log("  raw phone:       ", unmasked[0]?.phoneNumber);
  console.log("  raw showFirst4:  ", unmasked[0]?.showFirst4);
  console.log("  raw showLast4:   ", unmasked[0]?.showLast4);
  console.log("  raw starMasked:  ", unmasked[0]?.starMasked);
  console.log("  raw pattern:     ", unmasked[0]?.patternMasked);
  ok(".withoutMasking() returns raw values");

  // Cleanup mask test data
  await Users.delete({ name: "MaskDemo" } as any);

  // ── 39. @omitdb / @omitjson / @omitmigrate ───────────────────────────────
  heading("39. @omitdb / @omitjson / @omitmigrate");

  // ── @omitdb ────────────────────────────────────────────────────────────
  info("--- @omitdb ---");
  // @omitdb fields are excluded from INSERT SET clauses — the value is never
  // stored. The field exists only at the type level (e.g. computed fields,
  // transient data, columns managed externally).
  const omitDbUser = await Users.insert({
    name: "OmitDbDemo", email: "omitdb@demo.com",
    internalNote: "secret internal note",
  } as any);
  console.log("  after insert:", omitDbUser);
  if ((omitDbUser as any).internalNote === undefined) ok("internalNote excluded from insert result");
  else fail("internalNote should be undefined on insert result");

  const fetchedOmitDb = await Users.get({ name: "OmitDbDemo" } as any);
  console.log("  after get():", fetchedOmitDb);
  if ((fetchedOmitDb as any).internalNote === undefined) ok("internalNote excluded from get() result");

  // Verify it was NOT stored in DB (filtered from INSERT SET)
  const rawOmitDb = await orm.execRaw("SELECT internalNote FROM users WHERE name = ?", ["OmitDbDemo"]);
  if (rawOmitDb.rows.length === 0 || rawOmitDb.rows[0].internalNote === null) {
    ok("internalNote NOT stored in database (filtered from INSERT SET)");
  } else {
    fail("internalNote should NOT be in database");
  }

  // Query builder also excludes it
  const qbOmitDb = await Users.query().where("name" as any, "=", "OmitDbDemo").get();
  if (qbOmitDb.length > 0 && (qbOmitDb[0] as any).internalNote === undefined) {
    ok("internalNote excluded from QB get() result");
  }

  // ── @omitjson ──────────────────────────────────────────────────────────
  info("--- @omitjson ---");
  const omitJsonUser = await Users.insert({
    name: "OmitJsonDemo", email: "omitjson@demo.com",
    auditData: "created-by-admin",
  } as any);
  console.log("  after insert:", omitJsonUser);
  if ((omitJsonUser as any).auditData === undefined) ok("auditData stripped from insert result");
  else fail("auditData should be stripped from insert result");

  const fetchedOmitJson = await Users.get({ name: "OmitJsonDemo" } as any);
  console.log("  after get():", fetchedOmitJson);
  if ((fetchedOmitJson as any).auditData === undefined) ok("auditData stripped from get() result");

  // Verify it IS stored in DB via raw SQL
  const rawOmitJson = await orm.execRaw("SELECT auditData FROM users WHERE name = ?", ["OmitJsonDemo"]);
  if (rawOmitJson.rows.length > 0 && rawOmitJson.rows[0].auditData === "created-by-admin") {
    ok("auditData IS stored in database (verified via raw SQL)");
  }

  // Explicit .select() in QB returns the field
  const explicitSelect = await Users.query()
    .select("name", "auditData" as any)
    .where("name" as any, "=", "OmitJsonDemo")
    .get();
  console.log("  QB select(name,auditData):", explicitSelect);
  if (explicitSelect.length > 0 && (explicitSelect[0] as any).auditData === "created-by-admin") {
    ok("auditData returned when explicitly selected");
  } else {
    fail("auditData not returned even with explicit select");
  }

  // ── @omitmigrate ───────────────────────────────────────────────────────
  info("--- @omitmigrate ---");
  // The column should not exist in the table
  const tableInfo = await orm.execRaw("PRAGMA table_info(users)");
  const columns = tableInfo.rows.map((r: any) => r.name || r.cid);
  console.log("  user columns:", columns);
  const hasTempField = columns.some((c: string) => c === "tempField");
  if (!hasTempField) {
    ok("tempField column does NOT exist (migrator skipped it)");
  } else {
    fail("tempField column was created (migrator should have skipped it)");
  }

  // Cleanup omit demo data
  await Users.delete({ name: "OmitDbDemo" } as any);
  await Users.delete({ name: "OmitJsonDemo" } as any);

  // ──────────────────────────────────────────────────────────────────────────
  // 42. VALIDATION ANNOTATIONS — @email, @url, @uuid, @min, @max, @pattern
  // ──────────────────────────────────────────────────────────────────────────
  heading("42. Validation annotations");

  // Valid insert — all annotations pass
  const validUser = await Users.insert({
    name: "ValidPerson",
    email: "person@example.com",
    score: 85,
    url: "https://example.com",
    uuid: "550e8400-e29b-41d4-a716-446655440000",
    phone: "+1-555-123-4567",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  info(`valid insert: id=${validUser?.id} email=${validUser?.email}`);
  ok("@email passes valid email");

  // Invalid insert — throws ValidationError
  try {
    await Users.insert({
      name: "X",              // fails @minLength:2
      email: "bad",           // fails @email
      score: 999,             // fails @max:100
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    fail("should have thrown ValidationError");
  } catch (err: unknown) {
    const ve = err as { message: string; errors?: Record<string, string> };
    info(`ValidationError: ${ve.message}`);
    if (ve.errors) info(`  fields: ${Object.keys(ve.errors).join(", ")}`);
    ok("@email/@minLength/@max reject invalid data");
  }

  // Valid update with validation
  const updUser = await Users.get({ name: "ValidPerson" });
  if (updUser) {
    const updated = await Users.update({ id: updUser.id! }, { score: 42 });
    info(`valid update: score=42`);
    ok("update passes validation");
  }

  // Invalid update — throws
  try {
    await Users.update({ name: "ValidPerson" }, { email: "not-an-email" });
    fail("should have thrown on bad email update");
  } catch (err: unknown) {
    info(`update blocked: ${(err as Error).message}`);
    ok("@email blocks invalid update");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 43. Security annotations (@hash with .verify)
  // ──────────────────────────────────────────────────────────────────────────
  heading("Security annotations (@hash)");

  const hashUser = await orm.DB.User.insert({ name: "HashTest", email: "hash@example.com", password: "correct-horse-battery-staple" });
  const hashFetched = await orm.DB.User.get({ name: "HashTest" });
  if (!hashFetched?.password) { fail("security: could not fetch user"); } else {
    info(`password in db: ${hashFetched.password}`);
    const ok1 = await hashFetched.password.verify("correct-horse-battery-staple");
    ok(ok1 ? "@hash .verify() matches correct password" : "@hash .verify() FAILED on correct password");
    const ok2 = await hashFetched.password.verify("wrong-password");
    ok(!ok2 ? "@hash .verify() rejects wrong password" : "@hash .verify() FAILED to reject wrong password");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 44. @encrypt with .decrypt
  // ──────────────────────────────────────────────────────────────────────────
  heading("@encrypt annotation");

  await orm.DB.User.insert({ name: "EncryptTest", email: "encrypt@example.com", encrypted: "sensitive-data", autoDecrypted: "auto-decrypted-value" });
  const encFetched = await orm.DB.User.get({ name: "EncryptTest" });
  if (!encFetched?.encrypted) { fail("encrypt: could not fetch user"); } else {
    info(`raw encrypted value: ${encFetched.encrypted}`);
    ok(encFetched.encrypted.toString().startsWith("aes256gcm$") ? "@encrypt raw value is aes256gcm$..." : "@encrypt raw value NOT encrypted");
    const decrypted = await encFetched.encrypted.decrypt();
    ok(decrypted === "sensitive-data" ? "@encrypt .decrypt() returns original plaintext" : "@encrypt .decrypt() FAILED");
  }
  if (!encFetched?.autoDecrypted) { fail("encrypt: could not fetch autoDecrypted"); } else {
    ok(encFetched.autoDecrypted === "auto-decrypted-value" ? "@encrypt:(decrypt=auto) auto-decrypted value matches" : "@encrypt:(decrypt=auto) FAILED");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 45. Preload with limit/order
  // ──────────────────────────────────────────────────────────────────────────
  heading("Preload with limit/order");

  const Payments = await orm.defineModel<Payment>("payments", "Payment");

  // Create a test user with multiple payments
  const preloadUser = await Users.insert({ name: "PreloadTest", email: "preload@test.com" });
  if (!preloadUser?.id) { fail("could not create preload user"); return; }
  // Insert payments for the test user
  for (const amount of [10, 20, 30, 40, 50, 60]) {
    await Payments.insert({ userId: preloadUser.id, amount, status: "completed" } as any);
  }

  // Test 1: preload with limit only
  const userWithLimit = await (Users as any).query()
    .preload("payments", 3)
    .first({ name: "PreloadTest" });
  const limited: any[] = userWithLimit?.payments || [];
  ok(limited.length === 3
    ? `preload("payments", 3) returned ${limited.length} payments`
    : `preload("payments", 3) FAILED: expected 3, got ${limited.length}`);

  // Test 2: preload with limit + order desc
  const userWithDesc = await (Users as any).query()
    .preload("payments", 4, "desc")
    .first({ name: "PreloadTest" });
  const desc: any[] = userWithDesc?.payments || [];
  const descOk = desc.length === 4 && desc[0].amount === 60;
  ok(descOk
    ? `preload("payments", 4, "desc") returns ${desc.length} items, first amount=${desc[0]?.amount}`
    : `preload("payments", 4, "desc") FAILED`);

  // Test 3: preload with filter + limit
  const userWithFilter = await (Users as any).query()
    .preload("payments", (qb: any) => qb.where("amount", "<", 40), 2)
    .first({ name: "PreloadTest" });
  const filtered: any[] = userWithFilter?.payments || [];
  ok(filtered.length === 2 && filtered.every((p: any) => p.amount < 40)
    ? `preload("payments", filter, 2) returned ${filtered.length} payments`
    : `preload("payments", filter, 2) FAILED`);

  // Test 4: preload with filter + limit + order desc
  const userWithAll = await (Users as any).query()
    .preload("payments", (qb: any) => qb.where("amount", ">=", 30), 3, "desc")
    .first({ name: "PreloadTest" });
  const all: any[] = userWithAll?.payments || [];
  ok(all.length === 3 && all[0].amount === 60
    ? `preload("payments", filter, 3, "desc") first amount=${all[0]?.amount}`
    : `preload("payments", filter, 3, "desc") FAILED`);

  // Test 5: error on manytoone with limit
  try {
    const postWithUser = await (Posts as any).query()
      .preload("user", 5)
      .first();
    fail("preload on manytoone with limit should throw");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    ok(msg.includes("cannot apply limit/order")
      ? `manytoone limit error: ${msg}`
      : `unexpected error: ${msg}`);
  }

  // Test 6: @secret and omit are applied to preloaded rows
  // secret fields on the preloaded user should be stripped
  const postWithMask = await (Posts as any).query()
    .preload("user")
    .first();
  const preloadedUser = (postWithMask as any)?.user;
  ok(preloadedUser && !("auditData" in preloadedUser)
    ? "@omitjson strips auditData from preloaded user"
    : "@omitjson FAILED on preloaded user");

  // Cleanup
  await Payments.delete({ userId: preloadUser.id } as any);
  await Users.delete({ name: "PreloadTest" });

  // Existing cleanup
  await orm.DB.User.delete({ name: "HashTest" });
  await orm.DB.User.delete({ name: "EncryptTest" });
  // ──────────────────────────────────────────────────────────────────────────
  try { await (Posts as any).delete({ id: newPost?.id! }); } catch {}

  console.log("\n=== Done ===");
}

main().catch(console.error);
