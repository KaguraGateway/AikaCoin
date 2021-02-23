import { fileUtils } from "@kaguragateway/y-node-utils";
import { generateKeyPair } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { AikaCoin } from "./AikaCoin";
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

    isCreateWallet = false;

    init() {
        return new Promise((resolve, reject) => {
            if(AikaCoin.config.walletAddress.length === 0 || !fileUtils.isExistFile(AikaCoin.config.publicKeyPath) || !fileUtils.isExistFile(AikaCoin.config.privateKeyPath)) {
                console.log("NotFound My Wallet.");
                console.log("ウォレットの公開鍵と秘密鍵を生成します。");

                this.isCreateWallet = true;

                AikaCoin.std.question("秘密鍵を守るパスワードを入力してください（A-Z a-z 0-9 *+-/!$%）", (answer) => {
                    this.generateWalletKeyPair(answer)
                    .then(() => {
                        resolve(null);
                    })
                });

                return;
            }

            // ウォレットアドレスを適用
            Wallet.walletAddress = AikaCoin.config.walletAddress;
            // ウォレットの公開鍵を読み込む
            Wallet.walletPublicKey = readFileSync(AikaCoin.config.publicKeyPath).toString();
            // ウォレットの秘密鍵を読み込む
            Wallet.walletEncryptedPrivateKey = readFileSync(AikaCoin.config.privateKeyPath).toString();

            console.log("Loaded Wallet Info.");

            resolve(null);
        })
    }

    /**
     * ネットワークやデータベースの起動後に呼び出す
     */
    init2() {
        if(this.isCreateWallet) {
            // データベースにウォレットを登録する
            WalletTbl.insert({
                address: Wallet.walletAddress,
                pubkey: Wallet.walletPublicKey,
                balance: 0,
                nonce: 0,
                status: "active"
            });

            // ネットワークに知らせる
            AikaCoin.network.notifyCreateWallet({
                address: Wallet.walletAddress,
                pubkey: Wallet.walletPublicKey,
                status: "active"
            });
        }
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
                Wallet.walletAddress = this.generateWalletAddress(publickey);
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
    generateWalletAddress(publicKey: string) {
        return "$0x$" + HashUtils.computeRIPEMD160(HashUtils.computeSHA256(PemUtils.getPublicKeyFromPem(Wallet.walletPublicKey)));
    }
}