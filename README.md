
  # Simple TypeScript ORM

  A lightweight TypeScript ORM for SQLite, PostgreSQL, and MySQL with support for:

  - Auto table creation and migration
  - One-to-one, one-to-many, and many-to-many relationships
  - Timestamps and default values
  - Query builder with preloads, filters, ordering, and limits
  - Type-safe model definitions

  ---

  ## Installation

  ```bash
  npm install slintorm
```

### Usage

```ts

import ORMManager, { createORM } from "slintorm";

// Initialize ORM
const orm = new ORMManager({
  driver: "sqlite",
  databaseUrl: "./test.db",
});

// Define models
const Users = await orm.defineModel<User>("users", "User");
const Posts = await orm.defineModel<Post>("post", "Post");
const Todos = await orm.defineModel<Todo>("todo", "Todo");
const Profiles = await orm.defineModel<Profile>("profile", "Profile");
const Tasks = await orm.defineModel<Task>("tasks", "Task");
const Teams = await orm.defineModel<Team>("team", "Team");


```



### Model Interfaces


```ts

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

interface Task {
  // @index;auto
  id?: number;
  title: string;
  detail: string;
  createdAt: string;
}


interface Team {
  // @index;auto
  id?: number;
  title: string;
  detail: string;
  open?: boolean
  tested?: boolean
}



```

### Basic CRUD Examples


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


### Query Builder

```ts
const userWithRelations = await Users.query()
  .preload("posts")
  .preload("profile")
  .first("id = 2");

const postWithUser = await Posts.query()
  .preload("user")
  .preload("user.posts")
  .preload("user.profile")
  .get();


```


----
#### Relationships

* One-to-many: @relation onetomany:Post;foreignKey:userId

* Many-to-one: @relation manytoone:User;foreignKey:userId

* One-to-one: @relationship onetoone:Profile;foreignKey:userId

* Many-to-many: Use through table in schema metadata