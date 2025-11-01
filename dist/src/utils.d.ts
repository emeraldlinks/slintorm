export interface FieldMeta {
    type: string;
    meta?: Record<string, string | boolean>;
}
export declare function tsTypeToSqlType(field: string | FieldMeta): "TEXT" | "INTEGER" | "BOOLEAN" | "DATETIME";
