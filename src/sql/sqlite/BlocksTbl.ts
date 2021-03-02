import { CoinDB } from "../CoinDB";
import { IBlocksTbl } from "../interface/IBlocksTbl";

export class BlocksTbl {
    static createBlocksTable(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                db.run(`create table if not exists blocks (
                    blockhash text,
                    height int,
                    dat int,
                    offset int,
                    size int
                )`);
            });
            resolve(true);
        });
    }

    static countAll() {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            db.serialize(() => {
                db.get("select count(*) from blocks", (err, row) => {
                    if(err)
                        return reject(err);

                    return resolve(row["count(*)"]);
                });
            });
        });
    }

    static insert(record: IBlocksTbl): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                const stmt = db.prepare("insert into blocks values (?,?,?,?,?)");
                stmt.run([record.blockhash, record.height, record.dat, record.offset, record.size]);
                stmt.finalize();
            });
            resolve(true);
        });
    }

    static selectWhereBlockHash(blockhash: string): Promise<Array<IBlocksTbl>> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            db.serialize(() => {
                const stmt = db.prepare("select * from blocks where blockhash = ?");
                stmt.all(blockhash, (err, rows) => {
                    resolve(rows);
                });
                stmt.finalize();
            });
        });
    }

    static selectWhereBlockHeightAfter(blockHeight: number): Promise<Array<IBlocksTbl>> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            db.serialize(() => {
                const stmt = db.prepare("select * from blocks where height > ?");
                stmt.all(blockHeight, (err, rows) => {
                    resolve(rows);
                });
                stmt.finalize();
            });
        });
    }

    static selectWhereBlockHeightMinusTenNonSerialized(currentBlockHeight: number): Promise<IBlocksTbl | null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            const blockHeight = currentBlockHeight - 10;
            if(blockHeight <= 0)
                return resolve(null);

            const stmt = db.prepare("select * from blocks where height = ? limit 1");
            stmt.each(blockHeight, (err, row) => {
                resolve(row);
            }, (err, count) => {
                if(err)
                    return reject(err);
                if(count == 0)
                    return resolve(null);
            });
            stmt.finalize();
        });
    }

    static selectWhereLastBlock(): Promise<IBlocksTbl | null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined");

            db.serialize(() => {
                db.each("select * from blocks order by height desc limit 1", (err, row) => {
                    if(err)
                        return reject(err);

                    resolve(row);
                }, (err, count) => {
                    if(err)
                        return reject(err);

                    if(count == 0)
                        return resolve(null);
                });
            });
        });
    }
}