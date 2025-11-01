export type DBDriver = "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;
export type SQLExecResult = {
    rows: any[];
};
export type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;
export type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";
export type RelationKind = "onetomany" | "manytoone" | "onetoone" | "manytomany";
export interface RelationDef {
    sourceModel: string;
    fieldName: string;
    kind: RelationKind;
    targetModel: string;
    foreignKey?: string;
    through?: string;
}
