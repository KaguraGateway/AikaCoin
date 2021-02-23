import { Database } from "sqlite3";
import { CoinDB } from "../CoinDB";

export class SQLite {
    static newDatabase(path: string): Promise<Database> {
        return new Promise((resolve, reject) => {
            const db = new Database(path, (err) => {
                if(err)
                    return reject(err);

                resolve(db);
            })
        });
    }
}