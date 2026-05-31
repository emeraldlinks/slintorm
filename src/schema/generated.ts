
// AUTO-GENERATED SCHEMA
// DO NOT EDIT

export interface User {
  id?: number;
  firstName?: string;
  name: string;
  lastname?: string;
  email?: string;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  status?: "active" | "inactive" | "banned";
  posts?: Post[];
  profile?: Profile;
  teams?: Team[];
}

export interface Post {
  id?: number;
  title: string;
  userId?: number;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  status?: "draft" | "published" | "archived";
  user?: User;
}

export interface Todo {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record<string, any>;
  priority?: "low" | "medium" | "high";
}

export interface Profile {
  id?: number;
  userId: number;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  gender?: "male" | "female" | "other";
  user?: User;
}

export interface Task {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record<string, any>;
  status?: "todo" | "inprogress" | "done";
}

export interface Tasksx {
  id?: number;
  title: string;
  detail: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  meta?: Record<string, any>;
  status?: "todo" | "inprogress" | "done";
}

export interface Team {
  id?: number;
  title: string;
  detail: string;
  open?: boolean;
  tested?: boolean;
  meta?: Record<string, any>;
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
        "meta": {}
      },
      "firstName": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "name": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "lastname": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "email": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "\"active\" | \"inactive\" | \"banned\" | undefined",
        "originalType": "\"active\" | \"inactive\" | \"banned\"",
        "optional": true,
        "meta": {}
      },
      "posts": {
        "type": "Post[] | undefined",
        "originalType": "Post[]",
        "optional": true,
        "meta": {}
      },
      "profile": {
        "type": "Profile | undefined",
        "originalType": "Profile",
        "optional": true,
        "meta": {}
      },
      "teams": {
        "type": "Team[] | undefined",
        "originalType": "Team[]",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "users"
  },
  "Post": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "userId": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "\"draft\" | \"published\" | \"archived\" | undefined",
        "originalType": "\"draft\" | \"published\" | \"archived\"",
        "optional": true,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "post"
  },
  "Todo": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
        "meta": {}
      },
      "priority": {
        "type": "\"low\" | \"medium\" | \"high\" | undefined",
        "originalType": "\"low\" | \"medium\" | \"high\"",
        "optional": true,
        "meta": {}
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
        "meta": {}
      },
      "userId": {
        "type": "number",
        "originalType": "number",
        "optional": false,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "gender": {
        "type": "\"male\" | \"female\" | \"other\" | undefined",
        "originalType": "\"male\" | \"female\" | \"other\"",
        "optional": true,
        "meta": {}
      },
      "user": {
        "type": "User | undefined",
        "originalType": "User",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "profile"
  },
  "Task": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "originalType": "\"todo\" | \"inprogress\" | \"done\"",
        "optional": true,
        "meta": {}
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
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "originalType": "\"todo\" | \"inprogress\" | \"done\"",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "tasksx"
  },
  "Team": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number | undefined",
        "originalType": "number",
        "optional": true,
        "meta": {}
      },
      "title": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "detail": {
        "type": "string",
        "originalType": "string",
        "optional": false,
        "meta": {}
      },
      "open": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "tested": {
        "type": "boolean | undefined",
        "originalType": "boolean",
        "optional": true,
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "originalType": "Record<string, any>",
        "optional": true,
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
      },
      "deletedAt": {
        "type": "string | undefined",
        "originalType": "string",
        "optional": true,
        "meta": {}
      },
      "status": {
        "type": "\"active\" | \"archived\" | undefined",
        "originalType": "\"active\" | \"archived\"",
        "optional": true,
        "meta": {}
      },
      "members": {
        "type": "User[] | undefined",
        "originalType": "User[]",
        "optional": true,
        "meta": {}
      }
    },
    "relations": [],
    "table": "team"
  }
} as const;

export type Schema = typeof schema;
export type ModelName = keyof ModelMap;
