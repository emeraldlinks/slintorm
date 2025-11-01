// shared types
export type DBDriver = "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;

export type SQLExecResult = { rows: any[] };
export type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;

export type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";

export type RelationKind = "onetomany" | "manytoone" | "onetoone" | "manytomany";

export interface RelationDef {
  sourceModel: string;    // e.g. "User"
  fieldName: string;      // e.g. "posts"
  kind: RelationKind;
  targetModel: string;    // e.g. "Post"
  foreignKey?: string;    // e.g. "userId" (on target)
  through?: string;       // pivot table for manytomany
}
