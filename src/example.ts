import { Game } from "./_tmp_runtime_model.js";
import ORMManager from "./index.js";
import {ModelMap} from "./schema/generated.js";

/** Post table */
interface Post {
  // @index;
  id?: number;
  subID?: number
  // @length:255;not null;comment:Post title
  title: string;
  // @nullable;comment:Author user ID
  body?: string;
  userId?: number;
  // @relation manytoone:User;foreignKey:userId;onDelete:SET NULL
  user?: User;
// @json;nullable;comment:Extra post data   ← add @json here
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
  // @unique;comment:Email;nullable:false;
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
  score?: number
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
  // @enum:(male,female, other)
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

/** Task table */
interface Task {
  // @index;auto
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
  // @enum:(todo,inprogress,done)
  status?: "todo" | "inprogress" | "done";
}

/** Tasksx table */
interface Tasksx {
  // @index;auto
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
  // @enum:(todo, inprogress, done)
  status?: "todo" | "inprogress" | "done";
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



// ==== MAIN FUNCTION ====
async function main() {
  // Initialize ORM
  // const orm = await createORM({
  //   driver: "postgres",
  //   databaseUrl:
  //     "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
  // }, );

    /* const orm = new ORMManager({
    driver: "postgres",
    databaseUrl: "postgres://u_e0449281:1efcf44e34b1@localhost:15435/test_db",
     dir: "src",
    logs: false
  }); */
  

  const orm = new ORMManager<ModelMap>({
    driver: "sqlite",
    databaseUrl: "./testx.db",
    dir: "src",
    logs: false,
    modelMap: {} as ModelMap,
    
    // schema: schema
  });

  const db = orm.DB
  
  
  
  
  
  
  await orm.migrate()
  // Define models
  const Users = await orm.defineModel<User>("users", "User");
  const Posts = await orm.defineModel<Post>("post", "Post");
  const Todos = await orm.defineModel<Todo>("todo", "Todo");
  const Profiles = await orm.defineModel<Profile>("profile", "Profile");
  const Tasks = await orm.defineModel<Task>("tasks", "Task");
  const Tasksx = await orm.defineModel<Tasksx>("tasksx", "Tasksx");
  const Game = await orm.defineModel<Game>("game", "Game");
  const Teams = await orm.defineModel<Team>("team", "Team", {
    onCreateBefore(item) {
      console.log("before create Team:", item);
    },
    onCreateAfter(item) {
      console.log("after create:", item);
    },
    onUpdateAfter(oldData, newData) {
      console.log("after update Team:", { oldData, newData });
    },
  });
  const Games = await orm.defineModel<Game>("game", "Game");
  const createdGame = await db.Game.insert({ name: "Demo Game" });
  console.log("createdGame:", createdGame);

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

  Tasksx.query().first()
  // const uu =  await Users.insert({name: "McGarret", firstName: "Helpper" });
  //  console.log("instered: ", uu)


  console.log("=== ORM Example ===");

  // ==== CREATE TODOS ====
  await Todos.insert({
    title: "To watch plates",
    detail: "Wash all plates",
    createdAt: new Date().toISOString(),
  });
  // console.log("todos:", await Todos.getAll());

  // ==== CREATE USERS AND POSTS ====
  const newUser = await db.User.insert({
    name: "Catherine",
    lastname: "Christopher",
    firstName: "Chris",
    email: "jj@test.com"
  });
  console.log("newUser: ", newUser);
  // const profile = await Profiles.insert({userId: 2})

 
  const oo = await db.User.query()
    // .preload("posts") 
    .preload("profile").first()
  // console.log("profile:x ", oo)

  // ==== CREATE PROFILE FOR USER (one-to-one) ====

  // ==== FETCH USER WITH POSTS AND PROFILE ====
  const xpp = await db.Profile.insert({ userId: newUser?.id!, meta: { bio: "This is my profile" } });
  const userWithRelations = await db.User.query()
    // .preload("posts")
    .preload("profile")
    .preload("profile.user")
    // .preload("posts.user")
    .first(`id = ${newUser?.id}`);
  console.log("userxs: ", userWithRelations)
  // console.dir(userWithRelations, { depth: null });

  // ==== FETCH POST WITH USER RELATION ====
  console.log("posts with user =====>");
  const postWithUser = await db.Post.query()

    .preload("user")
    // .preload("user.posts")
    .preload("user.profile")
    // .preload("user.posts.user")
    .exclude("user.lastname")
    .first();
  // console.dir(postWithUser, { depth: null });
  const rankedUsers = await db.User.query()
    .window("ROW_NUMBER()", "PARTITION BY lastname ORDER BY id ASC")
    .get();

  // Subquery example
  // const subquery = Users.query().select("id").where("name", "=", "Amike");
  // const usersFromSub = await Users.query()
  //   .selectSubquery(subquery, "sub_id")
  //   .get();

  // EXISTS / NOT EXISTS example
  // const existsQuery  = await Posts.query()
  //   .exists(subquery)
  //   .get();
  // ==== DELETE EXAMPLE ====
  try {
    await Posts.delete({ id: 3 });
  } catch (err) {
    console.log("Delete error:", err);
  }


  const user = await Users.get({ id: 1 })
  // console.log("user: ", user)


  try {
    const uup = await Users.update({ id: 1 }, { name: "Amike Catherine" })
    //  console.log("immediate update: ", uup)

    const upuser = await Users.get({ id: 1 })
    const findd = await Users.findOrCreate({ id: 1 }, { name: "James Egwamene" })
    console.log("fetched findOrCreate user: ", findd)
    console.log("======> updated user: ", upuser)
    const excupuser = await Users.query().exclude("profile")
      // .preload("posts").exclude("posts.user")
      .first()

    const updated = await upuser?.update({ name: "Amike Egwamene" });

    // console.log("Updated user:", updated);
    // console.log("excluded user fields:", excupuser);

    console.log("json: ",await upuser?.delete())

  } catch (err) {
    console.log("error updated user: ", err)

  }


  const pp = await Profiles.query()
    .preload("user").preload("user.profile").preload("user.profile.user")
    .preload("user.profile.user.profile.user")
    .exclude("user.name")
    .first(`userId = ${newUser?.id}`);
  console.log("profile: ", pp)


  // const nnew = await Teams.insert({
  //   title: "To watch plates",
  //   detail: "Wash all plates",
  //   open: true,
  //   tested: false
  // });
  // console.log("Teams:", nnew);
console.log("inserMany")
// await Users.insertMany([{ name: "Joe" }, { name: "Jane"}])
console.log("updateMany")
await Users.updateMany({ status: "inactive" }, { status: "banned" })
await Users.deleteMany({ status: "banned" })
await Users.upsert({ email: "joef@x.com" }, { name: "Joe", email: "jodedd@x.com" })
const findOrCreateUser = await Users.findOrCreate({ email: "joecc@x.com" }, { name: "Joe", email: "joegjdxkhv@x.com" })
console.log("findOrCreateUser:", findOrCreateUser.record)
await Users.restore({ id: 1 })
await Users.sum("score")
await Users.avg("score", { status: "active" })
await Users.min("score")
await Users.max("score")
await Users.count({ status: "active" })
await Users.validate({ email: "bad@example.com" }, { email: { required: false, email: true } })
await db.User.query().withTrashed().get()
await db.User.query().onlyTrashed().get()
const scopee = await db.User.query().scope(qb => qb.where("type", "=", "user")).get()
// console.log("scoped users:", scopee)

await orm.transaction(async (trx) => {
  await trx.exec("INSERT INTO users (name, email) VALUES (?, ?)", ["Joe", "joe@example.com"])
  await trx.exec("INSERT INTO profile (userId) VALUES (?)", [1])
})

// const bhhsu = await orm.batch([
//   { sql: "INSERT INTO users (name) VALUES (?)", params: ["Joe"] },
//   { sql: "INSERT INTO profile (userId) VALUES (?)", params: [1] },
// ])

// console.log("batch insert result:", bhhsu)

 const newPost = await db.Post.insert({ title: "Hello Boys", userId: 2, meta: { tags: ["hello", "world"] } });
  console.log("newPost: ", newPost);
  console.log("post with meta: ", await db.Post.query().preload("user").first(`id = ${newPost?.id}`));

  console.log("=== Done ===");
}

// ==== RUN MAIN ====
main().catch(console.error);
