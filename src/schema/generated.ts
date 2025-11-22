
// AUTO-GENERATED SCHEMA
// DO NOT EDIT

export const schema = {
  "User": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "firstName": {
        "type": "string | undefined",
        "meta": {
          "nullable": true,
          "length": "100",
          "comment": "First name"
        }
      },
      "name": {
        "type": "string",
        "meta": {
          "length": "100",
          "not null": true,
          "comment": "Last name"
        }
      },
      "lastname": {
        "type": "string | undefined",
        "meta": {
          "nullable": true,
          "length": "100",
          "comment": "Last name"
        }
      },
      "email": {
        "type": "string | undefined",
        "meta": {
          "unique": true,
          "comment": "Email"
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra user info"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "status": {
        "type": "\"active\" | \"inactive\" | \"banned\" | undefined",
        "meta": {
          "enum": "(active,inactive,banned)"
        }
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
          "relationship onetomany": "Post",
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
          "relationship onetoone": "Profile",
          "foreignKey": "userId",
          "onDelete": "CASCADE"
        }
      }
    ],
    "table": "users"
  },
  "Post": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "length": "255",
          "not null": true,
          "comment": "Post title"
        }
      },
      "userId": {
        "type": "number | undefined",
        "meta": {
          "nullable": true,
          "comment": "Author user ID"
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra post data"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "status": {
        "type": "\"draft\" | \"published\" | \"archived\" | undefined",
        "meta": {
          "enum": "(draft,published,archived)"
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
          "relation manytoone": "User",
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
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true
        }
      },
      "priority": {
        "type": "\"low\" | \"medium\" | \"high\" | undefined",
        "meta": {
          "enum": "(low,medium,high)"
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
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "userId": {
        "type": "number",
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra profile data"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "gender": {
        "type": "\"male\" | \"female\" | \"other\" | undefined",
        "meta": {
          "enum": "(male,female, other)"
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
          "relation onetoone": "User",
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
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "meta": {
          "enum": "(todo,inprogress,done)"
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
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "meta": {
          "enum": "(todo, inprogress, done)"
        }
      }
    },
    "relations": [],
    "table": "tasksx"
  },
  "Team": {
    "primaryKey": "id",
    "fields": {
      "id": {
        "type": "number",
        "meta": {
          "primaryKey": true,
          "auto": true
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "open": {
        "type": "boolean | undefined",
        "meta": {
          "nullable": true
        }
      },
      "tested": {
        "type": "boolean | undefined",
        "meta": {
          "nullable": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "json": true,
          "nullable": true
        }
      },
      "createdAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "updatedAt": {
        "type": "string",
        "meta": {
          "index": true,
          "default": "CURRENT_TIMESTAMP"
        }
      },
      "deletedAt": {
        "type": "string | undefined",
        "meta": {
          "softDelete": true
        }
      },
      "status": {
        "type": "\"active\" | \"archived\" | undefined",
        "meta": {
          "enum": "(active,archived)"
        }
      }
    },
    "relations": [],
    "table": "team"
  }
};
