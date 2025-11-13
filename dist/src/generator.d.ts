/**
 * ORM Schema Generator using ts-morph (Fully working)
 *
 * Usage:
 *   import generateSchema from './generator';
 *   await generateSchema();
 */
export interface RelationDef {
    sourceModel: string;
    fieldName: string;
    kind: "onetomany" | "manytoone" | "onetoone" | "manytomany";
    targetModel: string;
    foreignKey: string;
    through?: string;
}
export default function generateSchema(srcGlob: string): Promise<boolean>;
