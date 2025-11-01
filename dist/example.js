import { createORM } from "./src/index";
// ==== MAIN FUNCTION ====
async function main() {
    // Initialize ORM
    const orm = await createORM({
        driver: "postgres",
        databaseUrl: "postgres://postgres@localhost:5432/postgres?connect_timeout=10",
    });
    //   const orm = await createORM({
    //   driver: "sqlite",
    //   databaseUrl: "./test.db",
    // });
    // Define models
    const Users = orm.defineModel("users", "User");
    const Posts = orm.defineModel("post", "Post");
    const Todos = orm.defineModel("todo", "Todo");
    const Profiles = orm.defineModel("profile", "Profile");
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
        .preload("posts.user")
        .first();
    console.dir(userWithRelations, { depth: null });
    // ==== FETCH POST WITH USER RELATION ====
    console.log("posts with user =====>");
    const postWithUser = await Posts.query()
        .preload("user")
        .preload("user.posts")
        .preload("user.profile")
        .preload("user.posts.user")
        .first();
    console.dir(postWithUser, { depth: null });
    // ==== DELETE EXAMPLE ====
    try {
        await Posts.delete({ id: 3 });
    }
    catch (err) {
        console.log("Delete error:", err);
    }
    console.log("=== Done ===");
}
// ==== RUN MAIN ====
main().catch(console.error);
