import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";

export class AikaCoinDbService {

    static db: LevelUp;

    constructor(dbFilePath: string) {
        AikaCoinDbService.db = levelup(leveldown(dbFilePath));
    }

}