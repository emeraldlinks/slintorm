import ORMManager, { createORM } from "./index";

// ==== MODEL INTERFACES (UNCHANGED) ====
interface Post {
  // @index;auto
  id?: number;
  title: string;
  userId?: number;
  // @relation manytoone:User;foreignKey:userId
  user?: User;
}

interface User {
  // @index;auto
  id?: number;
  name: string;
  lastname?: string;
  // @relation onetomany:Post;foreignKey:userId
  posts?: Post[];
  // @relationship onetoone:Profile;foreignKey:userId
  profile?: Profile;
}

interface Profile {
  // @index;auto
  id?: number;
  // @relationship onetoone:User;foreignKey:userId
  user?: User;
  userId: number;
}

interface Todo {
  // @index;auto
  id?: number;
  title: string;
  detail: string;
  createdAt: string;
}

// ==== MAIN FUNCTION ====
async function main() {
  // Initialize ORM
  // const orm = await createORM({
  //   driver: "postgres",
  //   databaseUrl:
  //     "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
  // }, );

  //   const orm = new ORMManager({
  //   driver: "postgres",
  //   databaseUrl: "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
  //   dir: "/models",
  // });


  const orm = new ORMManager({
    driver: "sqlite",
    databaseUrl: "./test.db",
  });

  // Define models
  const Users = await orm.defineModel<User>("users", "User");
  const Posts = await orm.defineModel<Post>("post", "Post");
  const Todos = await orm.defineModel<Todo>("todo", "Todo");
  const Profiles = await orm.defineModel<Profile>("profile", "Profile");

  console.log("=== ORM Example ===");

  // ==== CREATE TODOS ====
  await Todos.insert({
    title: "To watch plates",
    detail: "Wash all plates",
    createdAt: new Date().toISOString(),
  });
  console.log("todos:", await Todos.getAll());

  // ==== CREATE USERS AND POSTS ====
  const newUser = await Users.insert({
    name: "Catherine",
    lastname: "Christopher",
  });
  console.log("newUser: ", newUser);

  const newPost = await Posts.insert({ title: "Hello Boys", userId: 2 });
  console.log("newPost: ", newPost);

  // const oo = await Users.query().preload("posts").first()
  // console.log("profile: ", oo)

  // ==== CREATE PROFILE FOR USER (one-to-one) ====
  const profile = await Profiles.insert({ userId: 2 });

  // ==== FETCH USER WITH POSTS AND PROFILE ====
  const userWithRelations = await Users.query()
    .preload("posts")
    .preload("profile")
    // .preload("posts.user")
    .first("id = 2");

  console.dir(userWithRelations, { depth: null });

  // ==== FETCH POST WITH USER RELATION ====
  console.log("posts with user =====>");
  const postWithUser = await Posts.query()
    .preload("user")
    .preload("user.posts")
    .preload("user.profile")
    .preload("user.posts.user")
    .preload("user.posts.user.posts")
    .get();
  // console.dir(postWithUser, { depth: null });

  // ==== DELETE EXAMPLE ====
  try {
    await Posts.delete({ id: 3 });
  } catch (err) {
    console.log("Delete error:", err);
  }


  const user = await Users.get({id: 1})
  console.log("user: ", user)


  try {
   const uup = await Users.update({id: 1}, {name: "Amike Catherine"})
   console.log("immediate update: ", uup)

  const upuser = await Users.get({id: 1})
  console.log("fetched updated user: ", upuser)
  const updated = await upuser?.update({ name: "EntityWithUpdate" });
console.log("Updated user:", updated);
    
  } catch (err)  {
    console.log("error updated user: ", err)
    
  }


 const pp = await Profiles.query().preload("user").preload("user.profile").preload("user.profile.user").first("userId = 2")
 console.log("profile: ", pp)
  console.log("=== Done ===");
}

// ==== RUN MAIN ====
main().catch(console.error);
