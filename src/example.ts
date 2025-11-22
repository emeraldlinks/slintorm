import ORMManager, { createORM } from "./index";

/** Post table */
interface Post {
  // @index;
  id?: number;
  // @length:255;not null;comment:Post title
  title: string;
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
  // @length:100;not null;comment:Last name
  name: string;
  // @nullable;length:100;comment:Last name
  lastname?: string;
  // @unique;comment:Email
  email?: string;
  // @relationship onetomany:Post;foreignKey:userId
  posts?: Post[];
  // @relationship onetoone:Profile;foreignKey:userId;onDelete:CASCADE
  profile?: Profile;
  // @json;nullable;comment:Extra user info
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  // @softDelete
  deletedAt?: string;
  // @enum:(active,inactive,banned)
  status?: "active" | "inactive" | "banned";
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
}


// ==== MAIN FUNCTION ====
async function main() {
  // Initialize ORM
  // const orm = await createORM({
  //   driver: "postgres",
  //   databaseUrl:
  //     "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
  // }, );

    const orm = new ORMManager({
    driver: "postgres",
    databaseUrl: "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
    dir: "src",
  });


  // const orm = new ORMManager({
  //   driver: "sqlite",
  //   databaseUrl: "./testx.db",
  //   dir: "src"
  // });

  await orm.migrate()
  // Define models
  const Users = await orm.defineModel<User>("users", "User");
  const Posts = await orm.defineModel<Post>("post", "Post");
  const Todos = await orm.defineModel<Todo>("todo", "Todo");
  const Profiles = await orm.defineModel<Profile>("profile", "Profile");
  const Tasks = await orm.defineModel<Task>("tasks", "Task");
  const Tasksx = await orm.defineModel<Tasksx>("tasksx", "Tasksx");
  const Teams = await orm.defineModel<Team>("team", "Team", {
    onCreateBefore(item) {
      console.log("before create Team: ", item)
    },
    onCreateAfter(item) {
      console.log("after create: ", item)
    },
    onUpdateAfter(oldData, newData) {

    },
  });
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
  const newUser = await Users.insert({
    name: "Catherine",
    lastname: "Christopher",
    firstName: "Chris",
    email: "jj@test.com"
  });
  console.log("newUser: ", newUser);
  // const profile = await Profiles.insert({userId: 2})

  const newPost = await Posts.insert({ title: "Hello Boys", userId: 2 });
  // console.log("newPost: ", newPost);

  const oo = await Users.query()
  // .preload("posts")
  .preload("profile").first()
  // console.log("profile:x ", oo)

  // ==== CREATE PROFILE FOR USER (one-to-one) ====

  // ==== FETCH USER WITH POSTS AND PROFILE ====
  const userWithRelations = await Users.query()
    // .preload("posts")
    .preload("profile")
    .preload("profile.user")
    // .preload("posts.user")
    .first("id = 2");
console.log("userxs: ", userWithRelations)
  // console.dir(userWithRelations, { depth: null });

  // ==== FETCH POST WITH USER RELATION ====
  console.log("posts with user =====>");
  const postWithUser = await Posts.query()
  
    .preload("user")
    // .preload("user.posts")
    .preload("user.profile")
    // .preload("user.posts.user")
    .exclude("user.lastname")
    .first();
  // console.dir(postWithUser, { depth: null });
const rankedUsers = await Users.query()
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
    // console.log("fetched updated user: ", upuser)
    const excupuser = await Users.query().exclude("profile")
    // .preload("posts").exclude("posts.user")
    .first()

    const updated = await upuser?.update({ name: "Amike Egwamene" });
    // console.log("Updated user:", updated);
    // console.log("excluded user fields:", excupuser);

  } catch (err) {
    console.log("error updated user: ", err)

  }


  const pp = await Profiles.query()
  .preload("user").preload("user.profile").preload("user.profile.user")
  .preload("user.profile.user.profile.user")
  .exclude("user.name")
  .first(`userId = ${2}`)
  console.log("profile: ", pp)


  // const nnew = await Teams.insert({
  //   title: "To watch plates",
  //   detail: "Wash all plates",
  //   open: true,
  //   tested: false
  // });
  // console.log("Teams:", nnew);




  console.log("=== Done ===");
}

// ==== RUN MAIN ====
main().catch(console.error);
