/**
 * example.ts
 *
 * A runnable walkthrough of SlintORM covering:
 *  - model definitions with relations (1:1, 1:N, N:M), JSON fields, soft delete
 *  - ORMManager init with ModelMap for a fully typed `db`
 *  - migrations
 *  - CRUD, bulk ops, upsert, findOrCreate, soft delete/restore
 *  - query builder: preload (nested), exclude, joins, relation-path helpers,
 *    window functions, scopes, pagination
 *  - hooks
 *  - transactions and batch
 *
 * Run with: npx tsx example.ts   (or compile with tsc and run with node)
 */

import ORMManager from "slintorm";
import { ModelMap } from "./schema/generated.js";

// ──────────────────────────────────────────────────────────────────────────
// Model interfaces
// ──────────────────────────────────────────────────────────────────────────

/** Post table */
interface Post {
  // @index;
  id?: number;
  // @length:255;not null;comment:Post title
  title: string;
  // @nullable;length:1000
  body?: string;
  // @nullable;comment:Author user ID
  userId?: number;
  // @relation manytoone:User;foreignKey:userId;onDelete:SET NULL
  user?: User;
  // @json;nullable;comment:Extra post data
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(draft,published,archived)
  status?: "draft" | "published" | "archived";
}

/** User table */
interface User {
  // @index;auto;comment:primary key
  id?: number;
  // @nullable;length:100;comment:First name
  firstName?: string;
  // @length:100;nullable;comment:Last name
  name: string;
  // @nullable;length:100;comment:Last name
  lastname?: string;
  // @unique;comment:Email;nullable:false
  email?: string;
  // @relationship onetomany:Post;foreignKey:userId
  posts?: Post[];
  // @relationship onetoone:Profile;foreignKey:userId;onDelete:CASCADE
  profile?: Profile;
  // @relation manytomany:Team;through:team_members;foreignKey:userId;relatedKey:teamId
  teams?: Team[];
  // @json;nullable;comment:Extra user info
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(active,inactive,banned)
  status?: "active" | "inactive" | "banned";
  // @enum:(admin,user,guest);default:user
  type?: "admin" | "user" | "guest";
  score?: number;
}

/** Profile table */
interface Profile {
  // @index;auto;comment:primary key
  id?: number;
  // @relation onetoone:User;foreignKey:userId
  user?: User;
  userId: number;
  // @json;nullable;comment:Extra profile data
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(male,female,other)
  gender?: "male" | "female" | "other";
}

/** Todo table */
interface Todo {
  // @index;auto;comment:primary key
  id?: number;
  // @length:255;not null
  title: string;
  // @nullable;length:1000
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @json;nullable
  meta?: Record<string, any>;
  // @enum:(low,medium,high)
  priority?: "low" | "medium" | "high"; 
}

/** Team table */
interface Team {
  // @index;auto
  id?: number;
  // @length:255;not null
  title: string;
  // @nullable;length:1000
  detail: string;
  // @nullable
  open?: boolean;
  // @nullable
  tested?: boolean;
  // @json;nullable
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(active,archived)
  status?: "active" | "archived";
  // @relation manytomany:User;through:team_members;foreignKey:teamId;relatedKey:userId
  members?: User[];
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  // ── Init ───────────────────────────────────────────────────────────────
  const orm = new ORMManager<ModelMap>({
    driver: "sqlite",
    databaseUrl: "./example.db",
    dir: "src",
    logs: false,
    modelMap: {} as ModelMap,
  });

  // Generate schema from source files (if needed) and apply pending migrations
  await orm.migrate();

  const db = orm.DB;

  // Define models with hooks where useful
  const Users = await orm.defineModel<User>("users", "User");
  const Posts = await orm.defineModel<Post>("post", "Post");
  const Todos = await orm.defineModel<Todo>("todo", "Todo");
  const Profiles = await orm.defineModel<Profile>("profile", "Profile");
  const Teams = await orm.defineModel<Team>("team", "Team", {
    onCreateBefore(item) {
      console.log("before create Team:", item);
    },
    onCreateAfter(item) {
      console.log("after create Team:", item);
    },
    onUpdateAfter(oldData, newData) {
      console.log("Team updated:", { oldData, newData });
    },
  });

  console.log("=== SlintORM Example ===");

  // ── Hooked insert/update ──────────────────────────────────────────────
  const newTeam = await db.Team.insert({
    title: "Hook Team",
    detail: "Hook test",
    open: true,
    tested: false,
    createdAt: new Date().toISOString(),
  });
  console.log("newTeam:", newTeam);

  if (newTeam?.id) {
    await db.Team.update({ id: newTeam.id }, { tested: true });
  }

  // ── Basic CRUD ────────────────────────────────────────────────────────
  await Todos.insert({
    title: "Watch the plates",
    detail: "Wash all plates",
    createdAt: new Date().toISOString(),
  });
  console.log("todos:", await Todos.getAll());

  const newUser = await db.User.insert({
    name: "Catherine",
    lastname: "Christopher",
    firstName: "Chris",
    email: "catherine@example.com",
  });
  console.log("newUser:", newUser);

  await db.Profile.insert({
    userId: newUser?.id!,
    meta: { bio: "This is my profile" },
  });

  const newPost = await db.Post.insert({
    title: "Hello World",
    userId: newUser?.id,
    meta: { tags: ["hello", "world"] },
  });
  console.log("newPost:", newPost);

  // ── Preloading relations (nested, batched — no N+1) ─────────────────
  const userWithRelations = await db.User.query()
    .preload("profile")
    .preload("profile.user")
    .preload("posts")
    .first(`id = ${newUser?.id}`);
  console.dir(userWithRelations, { depth: null });

  const postWithUser = await db.Post.query()
    .preload("user")
    .preload("user.profile")
    .exclude("user.lastname")
    .first();
  console.dir(postWithUser, { depth: null });

  // ── Window functions ─────────────────────────────────────────────────
  const rankedUsers = await db.User.query()
    .window("ROW_NUMBER()", "PARTITION BY lastname ORDER BY id ASC")
    .get();
  console.log("rankedUsers:", rankedUsers);

  // ── Update / findOrCreate / delete on a fetched record ──────────────
  const user = await Users.get({ id: newUser?.id! });
  await user?.update({ name: "Catherine Updated" });

  const { record: foundOrCreated, created } = await Users.findOrCreate(
    { id: newUser?.id! },
    { name: "Fallback Name" }
  );
  console.log("findOrCreate:", { foundOrCreated, created });

  const excludedUser = await db.User.query()
    .exclude("profile")
    .first();
  console.log("excludedUser:", excludedUser);

  // ── Bulk operations ───────────────────────────────────────────────────
  await Users.insertMany([{ name: "Joe" }, { name: "Jane" }]);
  await Users.updateMany({ status: "inactive" }, { status: "banned" });
  await Users.deleteMany({ status: "banned" });

  await Users.upsert(
    { email: "joe@example.com" },
    { name: "Joe", email: "joe@example.com" }
  );

  const findOrCreateUser = await Users.findOrCreate(
    { email: "joe2@example.com" },
    { name: "Joe Two", email: "joe2@example.com" }
  );
  console.log("findOrCreateUser:", findOrCreateUser.record);

  // ── Soft delete ───────────────────────────────────────────────────────
  await Users.restore({ id: 1 });
  await db.User.query().withTrashed().get();
  await db.User.query().onlyTrashed().get();

  // ── Aggregates ────────────────────────────────────────────────────────
  console.log("sum score:", await Users.sum("score"));
  console.log("avg score (active):", await Users.avg("score", { status: "active" }));
  console.log("min score:", await Users.min("score"));
  console.log("max score:", await Users.max("score"));
  console.log("count (active):", await Users.count({ status: "active" }));

  // ── Validation ────────────────────────────────────────────────────────
  const errors = Users.check(
    { email: "not-an-email" },
    { email: { required: true, email: true } }
  );
  console.log("validation errors:", errors);

  // ── Scopes ────────────────────────────────────────────────────────────
  const scopedUsers = await db.User.query()
    .scope((qb) => qb.where("type", "=", "user"))
    .get();
  console.log("scoped users:", scopedUsers);

  // ── Pagination ────────────────────────────────────────────────────────
  const page = await db.User.query()
    .where("status", "=", "active")
    .getPaginated(1, 10);
  console.log("paginated:", { total: page.total, lastPage: page.lastPage });

  // ── Transactions & batch ─────────────────────────────────────────────
  await orm.transaction(async (trx) => {
    await trx.exec("INSERT INTO users (name, email) VALUES (?, ?)", [
      "Trx User",
      "trx@example.com",
    ]);
    await trx.exec("INSERT INTO profile (userId) VALUES (?)", [1]);
  });

  await orm.batch([
    { sql: "INSERT INTO users (name) VALUES (?)", params: ["Batched Joe"] },
    { sql: "INSERT INTO profile (userId) VALUES (?)", params: [1] },
  ]);

  // ── Cleanup example ───────────────────────────────────────────────────
  try {
    await Posts.delete({ id: newPost?.id! });
  } catch (err) {
    console.log("Delete error:", err);
  }

  console.log("=== Done ===");
}

main().catch(console.error);