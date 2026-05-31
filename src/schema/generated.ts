
// AUTO-GENERATED SCHEMA
// DO NOT EDIT

export const schema = {
  "User": {
    "primaryKey": "id",
    "fields": {
      "comment": {
        "type": "Extra user info",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra user info"
        }
      },
      "id": {
        "type": "number | undefined",
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "length": {
        "type": "100",
        "meta": {
          "nullable": true,
          "length": "100",
          "comment": "Last name"
        }
      },
      "firstName": {
        "type": "string | undefined",
        "meta": {
          "@nullable": true,
          "length": "100",
          "comment": "First name"
        }
      },
      "name": {
        "type": "string",
        "meta": {
          "@length": "100",
          "not null": true,
          "comment": "Last name"
        }
      },
      "lastname": {
        "type": "string | undefined",
        "meta": {
          "@nullable": true,
          "length": "100",
          "comment": "Last name"
        }
      },
      "email": {
        "type": "string | undefined",
        "meta": {
          "@unique": true,
          "comment": "Email"
        }
      },
      "onetomany": {
        "type": "Post",
        "meta": {
          "relationship onetomany": "Post",
          "foreignKey": "userId"
        }
      },
      "onetoone": {
        "type": "Profile",
        "meta": {
          "relationship onetoone": "Profile",
          "foreignKey": "userId",
          "onDelete": "CASCADE"
        }
      },
      "manytomany": {
        "type": "Team",
        "meta": {
          "relation manytomany": "Team",
          "through": "team_members",
          "foreignKey": "userId",
          "relatedKey": "teamId"
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
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
          "@softDelete": true
        }
      },
      "enum": {
        "type": "(active,inactive,banned)",
        "meta": {
          "enum": "(active,inactive,banned)"
        }
      },
      "status": {
        "type": "\"active\" | \"inactive\" | \"banned\" | undefined",
        "meta": {
          "@enum": "(active,inactive,banned)"
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
        "meta": {
          "@index": true
        }
      },
      "length": {
        "type": "255",
        "meta": {
          "length": "255",
          "not null": true,
          "comment": "Post title"
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "@length": "255",
          "not null": true,
          "comment": "Post title"
        }
      },
      "comment": {
        "type": "Extra post data",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra post data"
        }
      },
      "userId": {
        "type": "number | undefined",
        "meta": {
          "@nullable": true,
          "comment": "Author user ID"
        }
      },
      "manytoone": {
        "type": "User",
        "meta": {
          "relation manytoone": "User",
          "foreignKey": "userId",
          "onDelete": "SET NULL"
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
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
          "@softDelete": true
        }
      },
      "enum": {
        "type": "(draft,published,archived)",
        "meta": {
          "enum": "(draft,published,archived)"
        }
      },
      "status": {
        "type": "\"draft\" | \"published\" | \"archived\" | undefined",
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
      "comment": {
        "type": "primary key",
        "meta": {
          "index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "id": {
        "type": "number | undefined",
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "length": {
        "type": "1000",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "@nullable": true,
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
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "enum": {
        "type": "(low,medium,high)",
        "meta": {
          "enum": "(low,medium,high)"
        }
      },
      "priority": {
        "type": "\"low\" | \"medium\" | \"high\" | undefined",
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
      "comment": {
        "type": "Extra profile data",
        "meta": {
          "json": true,
          "nullable": true,
          "comment": "Extra profile data"
        }
      },
      "id": {
        "type": "number | undefined",
        "meta": {
          "@index": true,
          "auto": true,
          "comment": "primary key"
        }
      },
      "onetoone": {
        "type": "User",
        "meta": {
          "relation onetoone": "User",
          "foreignKey": "userId"
        }
      },
      "userId": {
        "type": "number",
        "meta": {}
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
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
          "@softDelete": true
        }
      },
      "enum": {
        "type": "(male,female, other)",
        "meta": {
          "enum": "(male,female, other)"
        }
      },
      "gender": {
        "type": "\"male\" | \"female\" | \"other\" | undefined",
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
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "length": {
        "type": "1000",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "@nullable": true,
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
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "enum": {
        "type": "(todo,inprogress,done)",
        "meta": {
          "enum": "(todo,inprogress,done)"
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
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
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "length": {
        "type": "1000",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "@nullable": true,
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
          "@softDelete": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
          "nullable": true
        }
      },
      "enum": {
        "type": "(todo, inprogress, done)",
        "meta": {
          "enum": "(todo, inprogress, done)"
        }
      },
      "status": {
        "type": "\"todo\" | \"inprogress\" | \"done\" | undefined",
        "meta": {
          "@enum": "(todo, inprogress, done)"
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
        "type": "number | undefined",
        "meta": {
          "@index": true,
          "auto": true
        }
      },
      "length": {
        "type": "1000",
        "meta": {
          "nullable": true,
          "length": "1000"
        }
      },
      "title": {
        "type": "string",
        "meta": {
          "@length": "255",
          "not null": true
        }
      },
      "detail": {
        "type": "string",
        "meta": {
          "@nullable": true,
          "length": "1000"
        }
      },
      "open": {
        "type": "boolean | undefined",
        "meta": {
          "@nullable": true
        }
      },
      "tested": {
        "type": "boolean | undefined",
        "meta": {
          "@nullable": true
        }
      },
      "meta": {
        "type": "Record<string, any> | undefined",
        "meta": {
          "@json": true,
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
          "@softDelete": true
        }
      },
      "enum": {
        "type": "(active,archived)",
        "meta": {
          "enum": "(active,archived)"
        }
      },
      "status": {
        "type": "\"active\" | \"archived\" | undefined",
        "meta": {
          "@enum": "(active,archived)"
        }
      },
      "manytomany": {
        "type": "User",
        "meta": {
          "relation manytomany": "User",
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
};
