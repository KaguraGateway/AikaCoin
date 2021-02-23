import { Database } from "sqlite3";
import { Wallet } from "../Wallet";
import { BlocksTbl } from "./sqlite/BlocksTbl";
import { SQLite } from "./sqlite/SQLite";
import { WalletTbl } from "./sqlite/WalletTbl";

export class CoinDB {
    static db: Database | undefined;

    public async init(path: string) {
        console.log(`Start Database... ${path}`);

        CoinDB.db = await SQLite.newDatabase(path);

        console.log(`Started Database.`);
        console.log(`CREATE TABLE`);

        // ウォレットテーブルを生成
        await WalletTbl.createWalletTable();
        // ブロックチェーンテーブルを生成
        await BlocksTbl.createBlocksTable();
    }
}