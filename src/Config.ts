import { fileUtils } from "@kaguragateway/y-node-utils";
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

    /** SQLファイルのパス */
    sqlitePath: string = path.join(AikaCoin.aikaCoinDir, "db.sqlite");

    /** P2Pのポート番号 */
    port: number = 65300;

    /** 他の人がハッシュ計算を完了させていないかチェックするインターバル */
    isOthersCompletedFirstInterval: number = 1000;

    /** P2Pのノード */
    mainNodes: Array<string> = [
        "node://[240b:253:f021:a800:47e:37b0:229e:428e]:65300",
        "node://165.100.180.123:65300",
        "node://[240b:253:f021:a800:c054:66a9:6154:cfec]:65300"
    ];


    constructor() {
        // コンフィグをロードする
        this.load();
    }

    load() {
        // ファイルがないなら生成する
        if(!fileUtils.isExistFile(AikaCoin.configPath)) {
            this.save();

            console.log("Config File Notfound.");
            console.log(`Created Config File. ${AikaCoin.configPath}`);

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

        console.log(`Loaded Config File: ${AikaCoin.configPath}`);
    }

    save() {
        // JSONに変換
        const jsonStr = JSON.stringify(this, null, 4);
        // ファイルを保存
        writeFileSync(AikaCoin.configPath, jsonStr, {encoding: "utf-8"});

        console.log(`Saved Config File: ${AikaCoin.configPath}`);
    }
}