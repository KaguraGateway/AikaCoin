import { fileUtils } from "@kaguragateway/y-node-utils";
import { generateKeyPair } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { AikaCoin } from "./AikaCoin";
import { TransactionCommand } from "./blockchain/interfaces/ITransaction";
import { Config } from "./Config";
import { WalletTbl } from "./sql/sqlite/WalletTbl";
import { HashUtils } from "./utils/HashUtils";
import { PemUtils } from "./utils/PemUtils";

export class Wallet {
    /** ウォレットのアドレス */
    static walletAddress: string;
    /** ウォレットの公開鍵 */
    static walletPublicKey: string;
    /** ウォレットの秘密鍵（暗号化済み） */
    static walletEncryptedPrivateKey: string;

    static nonce: number = 0;

    init() {
        return new Promise(async(resolve, reject) => {
            if(!fileUtils.isExistFile(AikaCoin.config.publicKeyPath)) {
                console.log("NotFound My Wallet.");
                console.log("ウォレットの公開鍵と秘密鍵を生成します。");

                AikaCoin.std.question("秘密鍵を守るパスワードを入力してください（A-Z a-z 0-9 *+-/!$%）", (answer) => {
                    this.generateWalletKeyPair(answer)
                    .then(() => {
                        // ウォレット生成トランザクションを送信する
                        AikaCoin.newTransaction("", 0, [TransactionCommand.CREATE_WALLET], answer);

                        resolve(null);
                    })
                });

                return;
            }

            // ウォレットの公開鍵を読み込む
            Wallet.walletPublicKey = readFileSync(AikaCoin.config.publicKeyPath).toString();
            // ウォレットの秘密鍵を読み込む
            if(fileUtils.isExistFile(AikaCoin.config.privateKeyPath))
                Wallet.walletEncryptedPrivateKey = readFileSync(AikaCoin.config.privateKeyPath).toString();


            // ウォレットアドレスを適用
            if(AikaCoin.config.walletAddress.length === 0) {
                AikaCoin.config.walletAddress = Wallet.generateWalletAddress(Wallet.walletPublicKey);
                AikaCoin.config.save();
            }
            Wallet.walletAddress = AikaCoin.config.walletAddress;


            // NonceをDBから取得
            const myWalletRecord = await WalletTbl.selectWhereAddress(Wallet.walletAddress);
            if(myWalletRecord == null)
                return reject();

            Wallet.nonce = myWalletRecord.nonce;

            console.log("Loaded Wallet Info.");

            resolve(null);
        })
    }

    /**
     * ウォレットのキーペアをつくる
     */
    private generateWalletKeyPair(privateKeySecretKey: string) {
        return new Promise((resolve, reject) => {
            // キーペアをつくる
            generateKeyPair("ec", {
                namedCurve: "secp256k1",
                publicKeyEncoding: {
                    type: "spki",
                    format: "pem"
                },
                privateKeyEncoding: {
                    type: "sec1",
                    format: "pem",
                    cipher: "aes-256-cbc",
                    passphrase: privateKeySecretKey
                }
            }, (err, publickey, encryptedPrivatekey) => {
                // 受け取る
                Wallet.walletPublicKey = publickey;
                Wallet.walletEncryptedPrivateKey = encryptedPrivatekey;
                // 保存する
                writeFileSync(AikaCoin.config.publicKeyPath, publickey);
                writeFileSync(AikaCoin.config.privateKeyPath, encryptedPrivatekey);

                // ウォレットアドレスを生成する
                Wallet.walletAddress = Wallet.generateWalletAddress(publickey);
                // コンフィグにも適用
                AikaCoin.config.walletAddress = Wallet.walletAddress;

                console.log(`\n-----Generated Wallet-----\n`);
                console.log(`Wallet Address: ${Wallet.walletAddress}`);
                console.log(`-----Wallet Public Key-----`);
                console.log(publickey);
                console.log(`\n-----End Wallet-----`);

                // コンフィグを保存する
                AikaCoin.config.save();

                resolve(null);
            });
        })
    }

    /** ウォレットアドレスを生成する */
    public static generateWalletAddress(publicKey: string) {
        return "$0x$" + HashUtils.computeRIPEMD160(HashUtils.computeSHA256(PemUtils.getPublicKeyFromPem(Wallet.walletPublicKey)));
    }
}