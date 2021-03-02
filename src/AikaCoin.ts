import { fileUtils } from "@kaguragateway/y-node-utils";
import { homedir } from "os";
import path from "path";
import { Config } from "./Config";
import readline from "readline";
import { Wallet } from "./Wallet";
import { BlockChain } from "./blockchain/BlockChain";
import { generateString } from "@kaguragateway/y-node-utils/dist/math";
import { Transaction } from "./blockchain/Transaction";
import cluster from "cluster";
import { CoinDB } from "./sql/CoinDB";
import { PeerToPeerService } from "./p2p/PeerToPeerService";
import { AikaCoinNetwork } from "./p2p/AikaCoinNetwork";
import { WalletTbl } from "./sql/sqlite/WalletTbl";
import { TransactionCommand } from "./blockchain/interfaces/ITransaction";

export class AikaCoin {
    /** AikaCoin プロトコルバージョン */
    static readonly protocolVersion: number = 1;

    /** ユーザーのホームディレクトリ */
    static readonly homeDir = homedir();
    /** AikaCoinのディレクトリ名 */
    static aikaCoinDirName = ".AikaCoinTest";
    /** AikaCoinのディレクトリ */
    static aikaCoinDir = path.join(AikaCoin.homeDir, AikaCoin.aikaCoinDirName);

    /** コンフィグファイル名 */
    static readonly configFileName = "config.json";
    /** コンフィグファイルパス */
    static readonly configPath = path.join(AikaCoin.aikaCoinDir, AikaCoin.configFileName);

    /** ブロックを保存する場所のパス */
    static readonly blocksPath: string = path.join(AikaCoin.aikaCoinDir, "blocks");
    /** ウォレットを保存する場所のパス */
    static readonly walletsPath: string = path.join(AikaCoin.aikaCoinDir, "wallets");

    static config: Config;
    static wallet: Wallet;
    static blockChain: BlockChain;
    static coinDb: CoinDB;
    static network: AikaCoinNetwork;

    // リードラインを作成
    static std = readline.createInterface({input: process.stdin, output: process.stdout});

    async init() {
        // AikaCoinのディレクトリをホームディレクトリにつくる
        await fileUtils.createDir(AikaCoin.homeDir, AikaCoin.aikaCoinDirName);

        console.log(`Created AikaCoin Dir: ${AikaCoin.aikaCoinDir}`);

        // blocksディレクトリを生成
        await fileUtils.createDir(AikaCoin.aikaCoinDir, "blocks");

        // Configを読み込む
        AikaCoin.config = new Config();

        // データベースを読み込む
        AikaCoin.coinDb = new CoinDB();
        await AikaCoin.coinDb.init(AikaCoin.config.sqlitePath);

        // P2P起動
        AikaCoin.network = new AikaCoinNetwork(AikaCoin.config.port);
        AikaCoin.network.start();

        // ブロックチェーンシステムを起動
        AikaCoin.blockChain = new BlockChain();

        // ウォレット
        AikaCoin.wallet = new Wallet();
        // ウォレットを読み込む
        await AikaCoin.wallet.init();



        /**
         * 準備パート２
         */
        // ブロックチェーンのデータを同期
        await AikaCoin.blockChain.init();

        this.mining()
        .catch((e) => {
            console.log(e);
        });
    }

    async mining() {
        // マイニング
        await AikaCoin.blockChain.createNewBlock();
        // 実質無限ループ
        setTimeout(async() => {
            await this.mining();
        });
    }

    static newTransaction(to: string, amount: number, commands: TransactionCommand[], privateKeyPassword: string) {
        // ウォレットノンスを増やす
        Wallet.nonce++;
        // トランザクションを生成する
        const transaction = Transaction.createNewTransaction(
            to,
            Wallet.walletAddress,
            Wallet.walletPublicKey,
            amount,
            commands,
            Wallet.nonce,
            Wallet.walletEncryptedPrivateKey,
            privateKeyPassword
        );
        // トランザクションプールに追加
        AikaCoin.blockChain.transactionPool.push(transaction);
        // ネットワークで主張
        AikaCoin.network.notifyNewTransaction({
            transactionVersion: transaction.transactionVersion,
            to: transaction.to,
            fromPubKey: transaction.fromPubKey,
            amount: transaction.amount,
            signature: transaction.signature,
            nonce: transaction.nonce,
            commands: transaction.commands
        });
    }
}