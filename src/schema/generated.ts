
// AUTO-GENERATED SCHEMA - DO NOT EDIT
// Schema Hash: 154f5ce92b4b7fbc
// Source Hash: 3eca48851fb41229

export interface User {
  id?: number;
  firstName?: string;
  name: string;
  lastname?: string;
  email?: string;
  posts?: Post[];
  profile?: Profile;
  teams?: Team[];
  meta?: Record <string ,any >;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  status?: "active" | "inactive" | "banned";
  type?: "admin" | "user" | "guest";
  score?: number;
}

export interface Post {
  id?: number;
  subID?: number;
  title: string;
  body?: string;
  userId?: number;
  user?: User;
  meta?: Record <string ,any >;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  status?: "draft" | "published" | "archived";
}

export interface Todo {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record <string ,any >;
  priority?: "low" | "medium" | "high";
}

export interface Profile {
  id?: number;
  user?: User;
  userId: number;
  meta?: Record <string ,any >;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  gender?: "male" | "female" | "other";
}

export interface Task {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record <string ,any >;
  status?: "todo" | "inprogress" | "done";
}

export interface Tasksx {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record <string ,any >;
  status?: "todo" | "inprogress" | "done";
}

export interface Game {
  id?: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Team {
  id?: number;
  title: string;
  detail: string;
  open?: boolean;
  tested?: boolean;
  meta?: Record <string ,any >;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  status?: "active" | "archived";
  members?: User[];
}

export type ModelMap = {
  User: User;
  Post: Post;
  Todo: Todo;
  Profile: Profile;
  Task: Task;
  Tasksx: Tasksx;
  Game: Game;
  Team: Team;
};

export const schema = {
  "User": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "firstName": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@nullable": true,
          "length": "100",
          "comment": "First name"
        }
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "100",
          "nullable": true,
          "comment": "Last name"
        }
      },
      "lastname": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@nullable": true,
          "length": "100",
          "comment": "Last name"
        }
      },
      "email": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@unique": true,
          "comment": "Email",
          "nullable": false
        }
      },
      "posts": {
        "type": "Post[] | undefined",
        "originalType": "Post[]",
        "optional": true,
        "meta": {
          "@relationship onetomany": "Post",
          "foreignKey": "userId"
        }
      },
      "profile": {
        "type": "Profile | undefined",
        "originalType": "Profile",
        "optional": true,
        "meta": {
          "@relationship onetoone": "Profile",
          "foreignKey": "userId",
          "onDelete": "CASCADE"
        }
      },
      "teams": {
        "type": "Team[] | undefined",
        "originalType": "Team[]",
        "optional": true,
        "meta": {
          "@relation manytomany": "Team",
          "through": "team_members",
          "foreignKey": "userId",
          "relatedKey": "teamId"
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true,
          "comment": "Extra user info"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "status": {
        "type": "\"active\" | \"inactive\" | \"banned\" | undefined",
        "originalType": "\"active\" | \"inactive\" | \"banned\"",
        "optional": true,
        "meta": {
          "@enum": "(active,inactive,banned)"
        }
      },
      "type": {
        "type": "\"admin\" | \"user\" | \"guest\" | undefined",
        "originalType": "\"admin\" | \"user\" | \"guest\"",
        "optional": true,
        "meta": {
          "@enum": "(admin,user,guest)",
          "default": "user"
        }
      },
      "score": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [
      {
        "sourceModel": "User",
        "fieldName": "posts",
        "kind": "onetomany",
        "targetModel": "Post",
        "foreignKey": "userId",
        "meta": {
          "@relationship onetomany": "Post",
          "foreignKey": "userId"
        }
      },
      {
        "sourceModel": "User",
        "fieldName": "profile",
        "kind": "onetoone",
        "targetModel": "Profile",
        "foreignKey": "userId",
        "meta": {
          "@relationship onetoone": "Profile",
          "foreignKey": "userId",
          "onDelete": "CASCADE"
        }
      },
      {
        "sourceModel": "User",
        "fieldName": "teams",
        "kind": "manytomany",
        "targetModel": "Team",
        "foreignKey": "userId",
        "through": "team_members",
        "meta": {
          "@relation manytomany": "Team",
          "through": "team_members",
          "foreignKey": "userId",
          "relatedKey": "teamId"
        }
      }
    ],
    "table": "users"
  },
  "Post": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true
        }
      },
      "subID": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "255",
          "not null": true,
          "comment": "Post title"
        }
      },
      "body": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@nullable": true,
          "comment": "Author user ID"
        }
      },
      "userId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation manytoone": "User",
          "foreignKey": "userId",
          "onDelete": "SET NULL"
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true,
          "comment": "Extra post data   ← add @json here"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "status": {
        "type": "\"draft\" | \"published\" | \"archived\" | undefined",
        "originalType": "\"draft\" | \"published\" | \"archived\"",
        "optional": true,
        "meta": {
          "@enum": "(draft,published,archived)"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Post",
        "fieldName": "user",
        "kind": "manytoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation manytoone": "User",
          "foreignKey": "userId",
          "onDelete": "SET NULL"
        }
      }
    ],
    "table": "post"
  },
  "Todo": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "priority": {
        "type": "\"low\" | \"medium\" | \"high\" | undefined",
        "originalType": "\"low\" | \"medium\" | \"high\"",
        "optional": true,
        "meta": {
          "@enum": "(low,medium,high)"
        }
      }
    },
    "relations": [],
    "table": "todo"
  },
  "Profile": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true,
          "comment": "Extra profile data"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "gender": {
        "type": "\"male\" | \"female\" | \"other\" | undefined",
        "originalType": "\"male\" | \"female\" | \"other\"",
        "optional": true,
        "meta": {
          "@enum": "(male,female, other)"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Profile",
        "fieldName": "user",
        "kind": "onetoone",
        "targetModel": "User",
        "foreignKey": "userId",
        "meta": {
          "@relation onetoone": "User",
          "foreignKey": "userId"
        }
      }
    ],
    "table": "profile"
  },
  "Task": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "originalType": "\"todo\" | \"inprogress\" | \"done\"",
        "optional": true,
        "meta": {
          "@enum": "(todo,inprogress,done)"
        }
      }
    },
    "relations": [],
    "table": "tasks"
  },
  "Tasksx": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "originalType": "\"todo\" | \"inprogress\" | \"done\"",
        "optional": true,
        "meta": {
          "@enum": "(todo, inprogress, done)"
        }
      }
    },
    "relations": [],
    "table": "tasksx"
  },
  "Game": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "createdAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "originalType": "string",
        "optional": true,
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      }
    },
    "relations": [],
    "table": "game"
  },
  "Team": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {
          "@nullable": true,
          "length": "1000"
        }
      },
      "open": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {
          "@nullable": true
        }
      },
      "tested": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {
          "@nullable": true
        }
      },
      "meta": {
        "type": "Record <string ,any > | undefined",
        "originalType": "Record <string ,any >",
        "optional": true,
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "createdAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "updatedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {
          "@softDelete": true
        }
      },
      "status": {
        "type": "\"active\" | \"archived\" | undefined",
        "originalType": "\"active\" | \"archived\"",
        "optional": true,
        "meta": {
          "@enum": "(active,archived)"
        }
      },
      "members": {
        "type": "User[] | undefined",
        "originalType": "User[]",
        "optional": true,
        "meta": {
          "@relation manytomany": "User",
          "through": "team_members",
          "foreignKey": "teamId",
          "relatedKey": "userId"
        }
      }
    },
    "relations": [
      {
        "sourceModel": "Team",
        "fieldName": "members",
        "kind": "manytomany",
        "targetModel": "User",
        "foreignKey": "teamId",
        "through": "team_members",
        "meta": {
          "@relation manytomany": "User",
          "through": "team_members",
          "foreignKey": "teamId",
          "relatedKey": "userId"
        }
      }
    ],
    "table": "team"
  }
} as const;

export type Schema = typeof schema;
export type ModelName = keyof ModelMap;
