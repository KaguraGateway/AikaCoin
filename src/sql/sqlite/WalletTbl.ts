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
                    balance REAL,
                    nonce INT,
                    status TEXT
                )`);
            });
            resolve(true);
        });
    }

    static getAll(): Promise<Array<IWalletTbl>> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                const stmt = db.prepare("SELECT * FROM wallet");
                // 取得
                stmt.all((err, rows) => {
                    if(err)
                        return reject(err);

                    resolve(rows);
                });
                stmt.finalize();
            });
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

    static selectWhereAddress(address: string): Promise<IWalletTbl | null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                const stmt = db.prepare("SELECT * FROM wallet where address = ? limit 1");

                let resultRow: IWalletTbl | null;

                // 取得
                stmt.each(address, (err, row) => {
                    if(err)
                        return reject(err);

                    resultRow = row;
                }, (err) => {
                    resolve(resultRow);
                });
                stmt.finalize();
            });
        });
    }

    /**
     * addressからWalletを探す（トランザクション用）
     * @param address
     */
    static selectWhereAddressNonSerialized(address: string): Promise<IWalletTbl | null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            const stmt = db.prepare("SELECT * FROM wallet where address = ? limit 1");

            let resultRow: IWalletTbl | null;

            // 取得
            stmt.each(address, (err, row) => {
                if(err)
                    return reject(err);

                resultRow = row;
            }, (err) => {
                resolve(resultRow);
            });
            stmt.finalize();
        });
    }

    static updateBalanceAndNonceWhereAddressNonSerialized(address: string, balance: number, nonce: number): Promise<null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            const stmt = db.prepare("UPDATE wallet SET balance = ? , nonce = ? where address = ?");
            stmt.run([balance, nonce, address]);

            stmt.finalize((err) => {
                if(err)
                    return reject(err);

                resolve(null);
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