// shared types
export type DBDriver = "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;

export type SQLExecResult = { rows: any[],  changes?: number | null; };
export type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;

export type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";

export type RelationKind = "onetomany" | "manytoone" | "onetoone" | "manytomany";
export type EntityWithUpdate<T> = T & {
  update(data: Partial<T>): Promise<T | null>;
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
  array?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  enum?: string[];
  check?: string;
  jsonDefault?: any;
  uniqueComposite?: string[][];
}
