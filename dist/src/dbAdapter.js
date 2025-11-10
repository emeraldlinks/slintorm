import sqlite3 from "sqlite3";
import { open } from "sqlite";
import mysql from "mysql2/promise";
import { Client as PgClient } from "pg";
import { MongoClient } from "mongodb";
export class DBAdapter {
    driver;
    sqliteDb = null;
    mysqlConn = null;
    pgClient = null;
    mongoClient = null;
    mongoDb = null;
    connected = false;
    config = {};
    constructor(config = {}) {
        this.config = config;
        this.driver = config.driver ?? "sqlite";
    }
    onConnect;
    async connect() {
        if (this.connected)
            return;
        switch (this.driver) {
            case "sqlite": {
                const filename = this.config.databaseUrl || ":memory:";
                this.sqliteDb = await open({ filename, driver: sqlite3.Database });
                break;
            }
            case "mysql": {
                this.mysqlConn = await mysql.createConnection({
                    uri: this.config.databaseUrl,
                });
                break;
            }
            case "postgres": {
                this.pgClient = new PgClient({
                    connectionString: this.config.databaseUrl,
                });
                await this.pgClient.connect();
                break;
            }
            case "mongodb": {
                this.mongoClient = new MongoClient(this.config.databaseUrl);
                await this.mongoClient.connect();
                this.mongoDb = this.mongoClient.db(this.config.databaseName);
                break;
            }
            default:
                throw new Error(`Driver "${this.driver}" not implemented`);
        }
        this.connected = true;
        if (this.onConnect)
            await this.onConnect();
    }
    async exec(sqlOrOp, params = []) {
        await this.connect();
        switch (this.driver) {
            case "sqlite": {
                const sql = sqlOrOp.trim();
                if (sql.toUpperCase().startsWith("SELECT")) {
                    const rows = await this.sqliteDb.all(sql, params);
                    return { rows };
                }
                else {
                    await this.sqliteDb.run(sql, params);
                    return { rows: [] };
                }
            }
            case "mysql": {
                const [rows] = await this.mysqlConn.execute(sqlOrOp, params);
                return { rows: Array.isArray(rows) ? rows : [] };
            }
            case "postgres": {
                const res = await this.pgClient.query(sqlOrOp, params);
                return { rows: res.rows };
            }
            case "mongodb": {
                // For Mongo, sqlOrOp should be a JSON command object
                if (!this.mongoDb)
                    throw new Error("MongoDB not initialized");
                // naive: sqlOrOp as stringified JSON { collection, action, filter?, data? }
                const cmd = JSON.parse(sqlOrOp);
                const col = this.mongoDb.collection(cmd.collection);
                switch (cmd.action) {
                    case "find":
                        return { rows: await col.find(cmd.filter || {}).toArray() };
                    case "insert":
                        await col.insertMany(cmd.data);
                        return { rows: cmd.data };
                    case "update":
                        await col.updateMany(cmd.filter, { $set: cmd.data });
                        return { rows: [] };
                    case "delete":
                        await col.deleteMany(cmd.filter);
                        return { rows: [] };
                    default:
                        throw new Error(`Unknown Mongo action ${cmd.action}`);
                }
            }
            default:
                return { rows: [] };
        }
    }
    async close() {
        switch (this.driver) {
            case "sqlite":
                if (this.sqliteDb)
                    await this.sqliteDb.close();
                break;
            case "mysql":
                if (this.mysqlConn)
                    await this.mysqlConn.end();
                break;
            case "postgres":
                if (this.pgClient)
                    await this.pgClient.end();
                break;
            case "mongodb":
                if (this.mongoClient)
                    await this.mongoClient.close();
                break;
        }
        this.connected = false;
    }
    async getTableInfo(table) {
        await this.connect();
        switch (this.driver) {
            case "sqlite":
                return await this.sqliteDb.all(`PRAGMA table_info(${table})`);
            case "mysql":
                return await this.mysqlConn.query(`DESCRIBE ${table}`);
            case "postgres":
                return await this.pgClient.query(`SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1`, [table]).then((r) => r.rows);
            case "mongodb":
                if (!this.mongoDb)
                    return [];
                const sample = await this.mongoDb.collection(table).findOne({});
                return sample ? Object.keys(sample).map((k) => ({ name: k })) : [];
            default:
                return [];
        }
    }
}
