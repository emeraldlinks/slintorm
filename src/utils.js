"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsTypeToSqlType = tsTypeToSqlType;
function tsTypeToSqlType(field) {
    // If a FieldMeta object, extract the type
    var tsType = typeof field === "string" ? field : field.type;
    var t = tsType.toLowerCase().trim();
    if (t.includes("string"))
        return "TEXT";
    if (t.includes("number") || t.includes("int") || t.includes("float"))
        return "INTEGER";
    if (t.includes("boolean") || t.includes("bool"))
        return "BOOLEAN";
    if (t.includes("date") || t.includes("time"))
        return "DATETIME";
    // console.warn(`Unknown TS type "${tsType}", defaulting to TEXT`);
    return "TEXT";
}
