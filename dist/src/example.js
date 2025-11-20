import ORMManager from "./index";
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
    //   dir: "src",
    // });
    const orm = new ORMManager({
        driver: "sqlite",
        databaseUrl: "./testx.db",
        dir: "src"
    });
    await orm.migrate();
    // Define models
    const Users = await orm.defineModel("users", "User");
    const Posts = await orm.defineModel("post", "Post");
    const Todos = await orm.defineModel("todo", "Todo");
    const Profiles = await orm.defineModel("profile", "Profile");
    const Tasks = await orm.defineModel("tasks", "Task");
    const Tasksx = await orm.defineModel("tasksx", "Tasksx");
    const Teams = await orm.defineModel("team", "Team", {
        onCreateBefore(item) {
            console.log("before create Team: ", item);
        },
        onCreateAfter(item) {
            console.log("after create: ", item);
        },
        onUpdateAfter(oldData, newData) {
        },
    });
    Tasksx.query().first();
    const uu = await Users.insert({ name: "McGarret", firstName: "Helpper" });
    console.log("instered: ", uu);
    console.log("=== ORM Example ===");
    // ==== CREATE TODOS ====
    await Todos.insert({
        title: "To watch plates",
        detail: "Wash all plates",
        createdAt: new Date().toISOString(),
    });
    // console.log("todos:", await Todos.getAll());
    // ==== CREATE USERS AND POSTS ====
    // const newUser = await Users.insert({
    //   name: "Catherine",
    //   lastname: "Christopher",
    //   firstName: "Chris"
    // });
    // console.log("newUser: ", newUser);
    const newPost = await Posts.insert({ title: "Hello Boys", userId: 2 });
    console.log("newPost: ", newPost);
    const oo = await Users.query().preload("posts").first();
    console.log("profile: ", oo);
    // ==== CREATE PROFILE FOR USER (one-to-one) ====
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
    }
    catch (err) {
        console.log("Delete error:", err);
    }
    const user = await Users.get({ id: 1 });
    // console.log("user: ", user)
    try {
        const uup = await Users.update({ id: 1 }, { name: "Amike Catherine" });
        //  console.log("immediate update: ", uup)
        const upuser = await Users.get({ id: 1 });
        // console.log("fetched updated user: ", upuser)
        const excupuser = await Users.query().exclude("profile")
            // .preload("posts").exclude("posts.user")
            .first();
        const updated = await upuser?.update({ name: "Amike Egwamene" });
        console.log("Updated user:", updated);
        console.log("excluded user fields:", excupuser);
    }
    catch (err) {
        console.log("error updated user: ", err);
    }
    const pp = await Profiles.query()
        .preload("user").preload("user.profile").preload("user.profile.user")
        .exclude("user.name")
        .first(`userId = ${2}`);
    console.log("profile: ", pp);
    const nnew = await Teams.insert({
        title: "To watch plates",
        detail: "Wash all plates",
        open: true,
        tested: false
    });
    // console.log("Teams:", nnew);
    console.log("=== Done ===");
}
// ==== RUN MAIN ====
main().catch(console.error);
