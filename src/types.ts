// shared types
export type DBDriver = "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;

export type SQLExecResult = { rows: any[]; changes?: number | null; lastID?: number | null; exists?: boolean };
export type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;

export type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";

export type RelationKind = "onetomany" | "manytoone" | "onetoone" | "manytomany";
export type EntityWithUpdate<T> = T & {
  update(data: Partial<T>): Promise<EntityWithUpdate<T> | null>;
  delete(): Promise<Partial<T>>;
  refresh(): Promise<EntityWithUpdate<T> | null>;
  toJSON(): T;
};

export interface RelationDef {
  sourceModel: string;    // e.g. "User"
  fieldName: string;      // e.g. "posts"
  kind: RelationKind;
  targetModel: string;    // e.g. "Post"
  foreignKey?: string;    // e.g. "userId" (on target)
  through?: string;       // pivot table for manytomany
}


interface FieldMeta {
  nullable?: boolean;
  unsigned?: boolean;
  collate?: string;
  comment?: string;
  index?: boolean;
  unique?: boolean;
  auto?: boolean;
  default?: string | number | boolean;
  defaultFn?: string;
  generatedAlways?: string;
  onUpdateNow?: boolean;
  json?: boolean;
  random?: string | boolean;
  array?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  enum?: string[];
  check?: string;
  jsonDefault?: any;
  uniqueComposite?: string[][];
  omitdb?: boolean;
  omitjson?: boolean;
  omitmigrate?: boolean;
  mask?: string | boolean;
}

// ── SqlExpr: embed raw SQL expressions in field values ──────────────────
export class SqlExpr {
  constructor(
    public sql: string,
    public params: any[] = []
  ) {}
  static raw(sql: string, params: any[] = []) {
    return new SqlExpr(sql, params);
  }
}

// ── Named arguments (e.g. :name → ?) ───────────────────────────────────
export type NamedArgs = Record<string, any>;

// ── Plugin system ──────────────────────────────────────────────────────
export type PluginEventType =
  | "beforeQuery" | "afterQuery"
  | "beforeInsert" | "afterInsert"
  | "beforeUpdate" | "afterUpdate"
  | "beforeDelete" | "afterDelete"
  | "beforeMigrate" | "afterMigrate";

export interface Plugin {
  name: string;
  priority?: number;
  install(orm: any): void;
  on?(event: PluginEventType, ctx: any): void | Promise<void>;
}

// ── Context propagation ────────────────────────────────────────────────
export interface OrmContext {
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

// ── AfterFind hook ─────────────────────────────────────────────────────
export type AfterFindHook<T> = (rows: T[]) => T[] | Promise<T[]>;

// ── Dry-run mode ───────────────────────────────────────────────────────
export type DryRunResult = { sql: string; params: any[] };

// ── Composite primary key descriptor ───────────────────────────────────
export type CompositeKey = string[];
