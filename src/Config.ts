import { fileUtils, mathUtils } from "@kaguragateway/y-node-utils";
import { readFileSync, writeFileSync } from "fs";
import { AikaCoin } from "./AikaCoin";
import path from "path";

export class Config implements IConfig {
    /** 最新のコンフィグバージョン */
    static readonly mustConfigVersion = 1;
    /** コンフィグバージョン */
    configVersion: number = 1;

    /** ウォレットの公開鍵の場所 */
    publicKeyPath: string = path.join(AikaCoin.aikaCoinDir, "walletPubKey.pem");
    /** ウォレットの秘密鍵の場所 */
    privateKeyPath: string = path.join(AikaCoin.aikaCoinDir, "walletPrivateKey.pem");
    /** ウォレットアドレス */
    walletAddress: string = "";

    /** LevelDBのパス */
    datDbPath: string = path.join(AikaCoin.aikaCoinDir, "datinfo");
    txIndexDbPath: string = path.join(AikaCoin.aikaCoinDir, "txindex");

    /** SQLファイルのパス */
    sqlitePath: string = path.join(AikaCoin.aikaCoinDir, "db.sqlite");

    /** P2Pのポート番号 */
    port: number = 65300;

    /** 他の人がハッシュ計算を完了させていないかチェックするインターバル */
    isOthersCompletedFirstInterval: number = 1000;

    /** ノードIDを生成する */
    myNodeId: string = mathUtils.generateStringT3(128);

    constructor() {
        // コンフィグをロードする
        this.load();
    }

    load() {
        // ファイルがないなら生成する
        if(!fileUtils.isExistFile(AikaCoin.configPath)) {
            this.save();

            AikaCoin.systemLogger.info("Config File Notfound.");
            AikaCoin.systemLogger.info(`Created Config File. ${AikaCoin.configPath}`);

            return;
        }

        // ファイルを取得
        const configFile = readFileSync(AikaCoin.configPath, {encoding: "utf-8"});
        // 適用
        const config: IConfig = JSON.parse(configFile);
        Object.keys(config).map((key) => {
            //@ts-ignore
            this[key] = config[key];
        });

        AikaCoin.systemLogger.info(`Loaded Config File: ${AikaCoin.configPath}`);
    }

    save() {
        // JSONに変換
        const jsonStr = JSON.stringify(this, null, 4);
        // ファイルを保存
        writeFileSync(AikaCoin.configPath, jsonStr, {encoding: "utf-8"});

        AikaCoin.systemLogger.info(`Saved Config File: ${AikaCoin.configPath}`);
    }
}