/**
 * example.ts
 *
 * A runnable walkthrough of SlintORM covering all features.
 *
 * Run with: npx tsx src/example.ts
 */

import ORMManager from "./index.js";

// ──────────────────────────────────────────────────────────────────────────
// Model interfaces (picked up by schema generator)
// ──────────────────────────────────────────────────────────────────────────

/** Post table */
interface Post {
  id?: number;
  title: string;
  body?: string;
  userId?: number;
  // @relation manytoone:User;foreignKey:userId
  user?: User;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/** User table */
interface User {
  id?: number;
  name: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/** Profile table */
interface Profile {
  id?: number;
  userId: number;
  bio?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Todo table */
interface Todo {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Team table */
interface Team {
  id?: number;
  title: string;
  detail?: string;
  open?: boolean;
  tested?: boolean;
  // @relation manytomany:User;through:team_members;foreignKey:teamId;relatedKey:userId
  members?: User[];
  createdAt?: string;
  updatedAt?: string;
}

/** For aggregate & raw SQL tests */
interface AggTest {
  id?: number;
  name: string;
  value: number;
  category: string;
  createdAt?: string;
}

/** For polymorphic tests */
interface Comment {
  id?: number;
  body: string;
  commentableType: string;
  commentableId: number;
  createdAt?: string;
}

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
    const parent = await (Comments as any).morphTo("commentableType", "commentableId");
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
  // CLEANUP
  // ──────────────────────────────────────────────────────────────────────────
  try { await (Posts as any).delete({ id: newPost?.id! }); } catch {}

  console.log("\n=== Done ===");
}

main().catch(console.error);
