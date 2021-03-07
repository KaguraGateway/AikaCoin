import { IDatInfo } from "./IDatInfo";
import { LevelDb } from "./LevelDb";

export class DatInfoDb extends LevelDb {

    async putDatInfo(datInfo: IDatInfo) {
        return await this.put("dat", JSON.stringify(datInfo));
    }
    async getDatInfo(): Promise<IDatInfo> {
        try {
            return JSON.parse((await this.get("dat")));
        } catch(e) {
            return {lastFileId: 0, lastLength: 0, lastOffset: 0};
        }
    }

}