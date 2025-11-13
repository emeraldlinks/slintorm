export type DBDriver = "sqlite" | "postgres" | "mysql" | "mongodb" | undefined;
export type SQLExecResult = {
    rows: any[];
    changes?: number | null;
};
export type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;
export type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";
export type RelationKind = "onetomany" | "manytoone" | "onetoone" | "manytomany";
export type EntityWithUpdate<T> = T & {
    update(data: Partial<T>): Promise<T | null>;
};
export interface RelationDef {
    sourceModel: string;
    fieldName: string;
    kind: RelationKind;
    targetModel: string;
    foreignKey?: string;
    through?: string;
}
