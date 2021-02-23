import { PemUtils } from "../../utils/PemUtils";
import { CoinDB } from "../CoinDB";
import { IWalletTbl } from "../interface/IWalletTbl";

export class WalletTbl {
    static createWalletTable(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                db.run(`create table if not exists wallet (
                    address INT,
                    pubkey TEXT,
                    balance INT,
                    nonce INT,
                    status TEXT
                )`);
            });
            resolve(true);
        });
    }

    static insert(data: IWalletTbl): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            const pubkeyStr = PemUtils.getPublicKeyFromPem(data.pubkey);

            db.serialize(() => {
                const stmt = db.prepare("INSERT INTO wallet VALUES (?,?,?,?,?)");
                stmt.run([data.address, pubkeyStr, data.balance, data.nonce, data.status]);
                stmt.finalize();

                resolve(true);
            });
        });
    }

    static selectWhereAddress(address: string): Promise<Array<any>> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                const stmt = db.prepare("SELECT * FROM wallet where address = ?");
                // 取得
                stmt.all(address, (err, rows) => {
                    if(err)
                        return reject(err);

                    resolve(rows);
                });
                stmt.finalize();
            });
        });
    }

    static countWhereWalletAddress(address: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            db.serialize(() => {
                db.get("select count(*) from wallet", (err, row) => {
                    if(err)
                        return reject(err);

                    return resolve(row["count(*)"]);
                });
            });
        });
    }
}