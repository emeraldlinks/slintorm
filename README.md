# Simple TypeScript ORM

A lightweight TypeScript ORM for SQLite, PostgreSQL, and MySQL.  
Inspired by Go's GORM, this ORM focuses on **simplicity, type safety, and full-featured query building** while keeping the API intuitive for TypeScript developers.

It is designed for:

- Rapid development with auto table creation and migrations
- Fully type-safe model definitions
- Easy handling of relationships: one-to-one, one-to-many, and many-to-many
- Advanced query building with joins, aggregates, subqueries, window functions, and preloads
- Minimal configuration with sensible defaults

---
## Installation

```bash
npm install slintorm

```

---




## Model Interfaces

```ts

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
  // unique;comment:Email
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
```



## Initialization

```ts
import ORMManager from "slintorm";

// Initialize ORM
const orm = new ORMManager({
  driver: "sqlite",
  databaseUrl: "./test.db",
});

// Run migrations automatically
await orm.migrate();
```
---

## Define Models

```ts

const Users = await orm.defineModel<User>("users", "User");
const Posts = await orm.defineModel<Post>("posts", "Post");
const Todos = await orm.defineModel<Todo>("todos", "Todo");
const Profiles = await orm.defineModel<Profile>("profiles", "Profile");
const Tasks = await orm.defineModel<Task>("tasks", "Task");
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
```
---
---

## Basic CRUD Examples

```ts

// Insert
await Todos.insert({
  title: "To watch plates",
  detail: "Wash all plates",
  createdAt: new Date().toISOString(),
});

// Fetch all
const allTodos = await Todos.getAll();

// Fetch one
const user = await Users.get({ id: 1 });

// Update
await Users.update({ id: 1 }, { name: "Amike Catherine" });

// Update instance
const fetchedUser = await Users.get({ id: 1 });
await fetchedUser?.update({ name: "Amike Egwamene" });

// Delete
await Posts.delete({ id: 3 });

```

---

## Query Builder Examples
```ts
// Preload relationships and filter
  const postWithUser = await Posts.query()
    .exclude("title")
    .preload("user")
    .preload("user.posts")
    .preload("user.profile")
    .preload("user.posts.user")
    .exclude("user.lastname")
    .first();


const userWithRelations = await Users.query()
  .preload("posts")
  .preload("profile")
  .first("id = 2");
  // .first({id: 2}); both are valid

// Nested preloads
const postWithUser = await Posts.query()
  .preload("user")
  .preload("user.posts")
  .preload("user.profile")
  .get();

// Filtering, ordering, and limiting
const todos = await Todos.query()
  .where("title", "LIKE", "%plates%")
  .orderBy("createdAt", "desc")
  .limit(5)
  .get();

// Distinct and aggregates
const counts = await Users.query()
  .count("id")
  .groupBy("lastname")
  .ILike("name", "jane")
  .get();

// Window function example
const rankedUsers = await Users.query()
  .window("ROW_NUMBER()", "PARTITION BY lastname ORDER BY id ASC")
  .get();

// Subquery example
const subquery = Users.query().select("id").where("name", "=", "Amike");
const usersFromSub = await Users.query()
  .selectSubquery(subquery, "sub_id")
  .get();

// EXISTS / NOT EXISTS example
const existsQuery = await Posts.query()
  .exists(subquery)
  .get();


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
    console.log("Updated user:", updated);
    console.log("excluded user fields:", excupuser);

  } catch (err) {
    console.log("error updated user: ", err)

  }


  const pp = await Profiles.query()
  .preload("user").preload("user.profile").preload("user.profile.user")
  .exclude("user.name")
  .first(`userId = ${2}`)
  console.log("profile: ", pp)


  const nnew = await Teams.insert({
    title: "To watch dishes",
    detail: "Wash all dishes",
    open: true,
    tested: false
  });
  console.log("Teams:", nnew);



```
---

## Relationships

* One-to-many: @relation onetomany:Post;foreignKey:userId
* Many-to-one: @relation manytoone:User;foreignKey:userId
* One-to-one: @relationship onetoone:Profile;foreignKey:userId
* Many-to-many: Use a through table in schema metadata

---

## Migrations

The ORM automatically ensures that tables exist and applies schema changes based on your model metadata. Use:

```ts
await orm.migrate();
```
to synchronize your database schema.

---


## Why use Simple TypeScript ORM?

Many TypeScript ORMs are either minimal but lack features (like Drizzle) or extremely heavy (like Prisma). Simple TypeScript ORM balances **ease of use, flexibility, and performance**, making it ideal for projects that require quick iteration, full control over queries, and GORM-inspired patterns in TypeScript.

| Feature                         | Simple TypeScript ORM | Drizzle        | Prisma        |
|---------------------------------|---------------------|----------------|---------------|
| Auto table creation & migration  | ✅ Automatic and zero-config migrations | ❌ Manual or CLI-based | ✅ CLI-based migrations |
| Type-safe queries                | ✅ Full TypeScript support | ✅ Type-safe | ✅ Type-safe |
| Relationships (1:1,1:N,N:M)     | ✅ Fully supported with preloads | ✅ Supported via join tables | ✅ Supported via relations |
| Query builder with joins & HAVING| ✅ Advanced SQL capabilities | ❌ Limited | ✅ Limited to client API, raw SQL for complex cases |
| Aggregates & window functions    | ✅ COUNT, SUM, AVG, custom window functions | ❌ Limited | ✅ Raw SQL required for window functions |
| Subquery support                 | ✅ Easy subquery integration | ❌ Limited | ✅ Possible via raw SQL |
| Preload / eager loading          | ✅ Preload nested relations | ❌ Not supported | ✅ Supports select/include |
| Lightweight & minimal boilerplate| ✅ Minimal setup, single import | ✅ Minimal | ❌ Requires Prisma Client generation and schema setup |
| Inspiration / design             | GORM-like (Go ORM) | TypeScript-only | Prisma Engine with schema DSL |
| Learning curve                   | ✅ Very low, intuitive | ✅ Low | ❌ Medium, requires learning schema DSL and client |
| Flexibility / raw SQL            | ✅ Direct SQL injection when needed | ✅ Limited raw SQL | ✅ Raw SQL available but requires Prisma Client |
| Ideal use case                   | Rapid prototyping, small to medium apps, GORM-style workflow | Type-safe lightweight projects | Large-scale apps, strong typing, ecosystem-heavy projects |

---

### Summary

SlintORM is **best suited for developers who want a GORM-inspired workflow in TypeScript**: minimal setup, automatic migrations, and full SQL query control.  
Drizzle is lightweight and type-safe but lacks advanced query features.  
Prisma is powerful and production-ready, but heavier and requires more boilerplate and tooling setup.  

SlintORM fills the niche for **quick iteration, flexible queries, and minimal friction**, making it perfect for both learning and production projects.


## Notes

- Supports SQLite, PostgreSQL, and MySQL.
- MongoDB support is limited to basic CRUD via the adapter.
- All queries are type-safe and return mapped Boolean fields and excluded columns if configured.
- Advanced query builder supports joins, group by, having, distinct, window functions, subqueries, and preloads.
