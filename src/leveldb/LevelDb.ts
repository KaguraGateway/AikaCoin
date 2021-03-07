import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";

export class LevelDb {

    db: LevelUp;

    constructor(dbFilePath: string) {
        this.db = levelup(leveldown(dbFilePath));
    }

    protected async put(key: string, value: string) {
        return await this.db.put(key, value);
    }

    protected async get(key: string) {
        return await this.db.get(key);
    }
}