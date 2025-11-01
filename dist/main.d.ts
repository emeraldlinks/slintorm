type DBDriver = "sqlite" | "postgres" | "mysql" | "mongo" | undefined;
type SQLExecResult = {
    rows: any[];
};
type ExecFn = (sqlOrOp: string, params?: any[]) => Promise<SQLExecResult>;
type OpComparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "ILIKE" | "IN" | "NOT IN";
declare class QueryBuilder<T extends Record<string, any>> {
    private table;
    private keyPath;
    private driver;
    private exec;
    private _selects;
    private _where;
    private _joins;
    private _groupBy;
    private _having;
    private _orderBy;
    private _limit;
    private _offset;
    private _distinct;
    private _aggregates;
    private _rawSql;
    constructor(table: string, keyPath: string, driver: DBDriver | undefined, exec: ExecFn);
    select(...cols: (keyof T | string)[]): this;
    distinct(): this;
    where<K extends keyof T>(columnOrRaw: K | {
        sql: string;
        params?: any[];
    }, op?: OpComparison | T[K], val?: T[K]): this;
    andWhere<K extends keyof T>(columnOrRaw: keyof T | string | {
        sql: string;
        params?: any[];
    }, op?: OpComparison | T[K], val?: T[K]): this;
    orWhere<K extends keyof T>(columnOrRaw: keyof T | string | {
        sql: string;
        params?: any[];
    }, op?: OpComparison | T[K], val?: T[K]): this;
    raw(sql: string, params?: any[]): this;
    join(table: string, on: string): this;
    leftJoin(table: string, on: string): this;
    rightJoin(table: string, on: string): this;
    groupBy(...cols: string[]): this;
    having(rawSql: string): this;
    orderBy(col: string, dir?: "asc" | "desc"): this;
    limit(n: number): this;
    offset(n: number): this;
    count(column?: keyof T | string, alias?: string): this;
    sum(column: keyof T | string, alias?: string): this;
    avg(column: keyof T | string, alias?: string): this;
    min(column: keyof T | string, alias?: string): this;
    max(column: keyof T | string, alias?: string): this;
    get(): Promise<T[]>;
    first(): Promise<T | null>;
}
export declare class SlintORM {
    private config;
    private adapter;
    constructor(config?: {
        driver?: DBDriver;
        databaseUrl?: string;
    });
    close(): Promise<void>;
    defineModel<T extends Record<string, any>>(table: string, opts?: {
        sample?: Partial<T>;
        keyPath?: keyof T | string;
    }): {
        insert(item: T): Promise<any>;
        update(idOrFilter: any, partial?: Partial<T>): Promise<any>;
        delete(idOrFilter: any): Promise<any>;
        get(id: any): Promise<T | null>;
        getAll(): Promise<T[]>;
        query(): QueryBuilder<T>;
        raw(sqlOrOp: string, params?: any[]): Promise<SQLExecResult>;
    };
}
export default SlintORM;
