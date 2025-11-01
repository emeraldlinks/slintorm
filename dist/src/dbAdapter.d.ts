import type { SQLExecResult, DBDriver } from "./types.ts";
export declare class DBAdapter {
    driver?: DBDriver;
    private sqliteDb;
    private mysqlConn;
    private pgClient;
    private mongoClient;
    private mongoDb;
    private connected;
    private config;
    constructor(config?: {
        driver?: DBDriver;
        databaseUrl?: string;
        databaseName?: string;
        [key: string]: any;
    });
    onConnect?: () => Promise<void>;
    connect(): Promise<void>;
    exec(sqlOrOp: string, params?: any[]): Promise<SQLExecResult>;
    close(): Promise<void>;
    getTableInfo(table: string): Promise<any[]>;
}
