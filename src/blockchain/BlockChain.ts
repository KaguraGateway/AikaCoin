import { timeUtils } from "@kaguragateway/y-node-utils";
import path from "path";
import { Database } from "sqlite3";
import { AikaCoin } from "../AikaCoin";
import { BlockDat } from "../dat/BlockDat";
import { AikaCoinNetwork, AikaCoinOpCode } from "../p2p/AikaCoinNetwork";
import { CoinDB } from "../sql/CoinDB";
import { BlocksTbl } from "../sql/sqlite/BlocksTbl";
import { WalletTbl } from "../sql/sqlite/WalletTbl";
import { HashUtils } from "../utils/HashUtils";
import { MathUtils } from "../utils/MathUtils";
import { SignUtils } from "../utils/SignUtils";
import { Wallet } from "../Wallet";
import { Block } from "./Block"
import { ITransaction, TransactionCommand, TransactionStatus } from "./interfaces/ITransaction";
import { Pow } from "./Pow";
import { Transaction } from "./Transaction";


export class BlockChain {
    /** チェーン */
    chains: Array<Array<Block>> = [];

    previousHash = "0000000000000000000000000000000000000000000000000000000000000000";

    // 未承認のトランザクション
    transactionPool: Array<ITransaction> = []
    // 処理中のトランザクション
    transactionBlocking: Array<ITransaction> = []
    // 難易度
    difficult: number = 6;
    // 次の難易度
    nextDifficult: number = 6;
    // 次のブロックの高さ
    nextBlockHeight: number = 1;
    // 採掘にかかった時間プール
    miningTimePool: Array<number> = [];

    constructor() {}

    async init() {
        // 昔のデータを取得
        let previousBlock = await BlocksTbl.selectWhereLastBlock();

        if(previousBlock != null) {
            this.previousHash = previousBlock.blockhash;
            this.nextBlockHeight = previousBlock.height+1;
        }
    }

    public async processBlock2(db: Database, previousBlock: Block, transactionPool: Array<ITransaction>) {
        // UnixTimeを取得
        const unixTime = timeUtils.getNowUnixTime();
        const beginMsTime = (new Date()).getTime();

        // ブロック番号を取得
        const blockHeight = this.nextBlockHeight;

        console.log(`[New Job] CreateNewBlock (Height: ${blockHeight}, Diff: ${this.difficult}, TxNum: ${transactionPool.length}, Start: ${unixTime})`);

        // SQLのトランザクションを開始
        db.run("BEGIN TRANSACTION CB");

        // トランザクションを処理
        txFor: for(const tx of transactionPool) {
            // コマンドを処理
            for(const cmd of tx.commands) {
                switch(cmd) {
                    case TransactionCommand.CREATE_WALLET:
                        // データベースにウォレットを登録する
                        WalletTbl.insert({
                            address: tx.from,
                            pubkey: tx.fromPubKey,
                            balance: 0,
                            nonce: 0,
                            status: "active"
                        });
                        continue txFor;
                        break;
                }
            }

            // 必要なパラメータの検証
            // 署名を検証する
            if(tx.fromPubKey == null || tx.from == null || tx.signature == null || tx.amount == null || !SignUtils.verify(tx.signature, HashUtils.computeSHA256(tx.transactionVersion + tx.to + tx.from + tx.fromPubKey + tx.amount), tx.fromPubKey, "hex")) {
                tx.status = TransactionStatus.REJECT;
                continue;
            }

            // ウォレットアドレスからウォレットを取得
            const fromWallet = await WalletTbl.selectWhereAddressNonSerialized(tx.from);
            const toWallet = await WalletTbl.selectWhereAddressNonSerialized(tx.to);
            // ウォレットの存在を確認
            if(fromWallet == null || toWallet == null || fromWallet.pubkey !== tx.fromPubKey) {
                tx.status = TransactionStatus.REJECT;
                continue;
            }

            // ノンスチェック
            fromWallet.nonce++;
            toWallet.nonce++;
            if(fromWallet.nonce !== tx.nonce) {
                tx.status = TransactionStatus.REJECT;
                continue;
            }

            // 手数料を計算する
            // 注意：BANAIK単位
            const fee = tx.amount * 0.001;

            // 送金量と手数料の合算分
            const total = tx.amount + fee;
            // 合算分がウォレットにあるか
            if(fromWallet.balance < total) {
                tx.status = TransactionStatus.REJECT;
                continue;
            }

            // 残り残高を計算
            const fromBalance = fromWallet.balance - total;
            const toBalance = toWallet.balance + tx.amount;

            // DBを変更
            await WalletTbl.updateBalanceAndNonceWhereAddressNonSerialized(tx.from, fromBalance, fromWallet.nonce);
            await WalletTbl.updateBalanceAndNonceWhereAddressNonSerialized(tx.to, toBalance, toWallet.nonce);

            // 確認全部できたらTX成功に
            tx.status = TransactionStatus.SUCCESS;
        }

        const txMsTime = (new Date()).getTime();
        console.log(`Ended Transaction Approval Process: ${txMsTime - beginMsTime}ms`);

        // 10個前のブロックインデックスを取得する
        const tenMinusblockIndex = await BlocksTbl.selectWhereBlockHeightMinusTenNonSerialized(blockHeight);

        if(tenMinusblockIndex != null) {
            // BlockDatを取得
            const tenMinusblock = (new BlockDat(BlockDat.getFilePath(tenMinusblockIndex.dat))).read(tenMinusblockIndex.offset);
            // ブロックの取得できたか？
            if(tenMinusblock != null) {
                // ウォレットを取得
                const tenMinusMiner = await WalletTbl.selectWhereAddressNonSerialized(tenMinusblock.miner);
                // ウォレットを取得できたか？
                if(tenMinusMiner != null) {
                    tenMinusMiner.nonce++;
                    // コインベース
                    const coinBaseTransaction = Transaction.createNewTransaction(tenMinusblock.miner, "COINBASE", "", Pow.getCoinBaseAmount(this.nextBlockHeight), [], tenMinusMiner.nonce, "", "");
                    // 承認
                    coinBaseTransaction.status = TransactionStatus.SUCCESS;
                    // コインベース支払い後の残高を計算
                    const minerBalance = tenMinusMiner.balance + coinBaseTransaction.amount;
                    // DB変更
                    await WalletTbl.updateBalanceAndNonceWhereAddressNonSerialized(tenMinusMiner.address, minerBalance, tenMinusMiner.nonce);
                    // トランザクションに追加
                    transactionPool.push(coinBaseTransaction);
                }
            }
        }

        const coinbaseMsTime = (new Date()).getTime();
        console.log(`Ended CoinBase Process: ${coinbaseMsTime - txMsTime}ms`);

        // ウォレットをすべて取得
        const wallets = await WalletTbl.getAll();

        // ブロックを生成
        const block = new Block(blockHeight, previousBlock.selfHash, unixTime, transactionPool, wallets, this.difficult);

        // ブロックを計算する
        const blockHash = await block.computeSelfHash();
        // 計算失敗してないか？
        if(blockHash == null || Pow.isOthersCompletedFirst(blockHeight)) {
            db.run("ROLLBACK TRANSACTION CB");
            return null;
        }

        // 計算にかかった時間
        const computeTime = timeUtils.getNowUnixTime() - unixTime;
        // 計算にかかった時間を追加
        this.miningTimePool.push(computeTime);

        console.log(`Complete Compute Hash: ${blockHash} (Nonce: ${block.nonce} Time: ${computeTime} sec)`);

        db.run("COMMIT TRANSACTION CB");

        return block;
    }

    private processBlock(previousBlock: Block, transactionPool: Array<ITransaction>): Promise<Block | null> {
        return new Promise((resolve, reject) => {
            const db = CoinDB.db;
            if(db == null)
                throw new Error("db is undefined.");

            db.serialize(() => {
                (async() => {
                    const block = await this.processBlock2(db, previousBlock, transactionPool);
                    resolve(block);
                })()
                .catch((reason) => {
                    reject(reason);
                });
            });
        })
    }

    /**
     * ブロックを生成
     * @param previousHash 前のブロックのハッシュ
     */
    public async createNewBlock() {
        // 難易度を取得
        this.difficult = this.nextDifficult;

        // トランザクションプールをコピーする
        const transactionPool = this.transactionPool.concat();
        this.transactionBlocking = transactionPool;
        // トランザクションプールを初期化
        this.transactionPool=[];

        // メインチェーンを取得
        const mainChain = this.getMainChain();
        // 前のブロックを取得
        const previousBlock = mainChain.length > 0 ? mainChain[mainChain.length - 1] : new Block(0, "0000000000000000000000000000000000000000000000000000000000000000", 0, [], [], 6);

        // 処理部分
        const block = await this.processBlock(previousBlock, transactionPool);
        console.log(block);

        // 失敗してないか
        if(block == null)
            return null;

        // ブロックハッシュ
        const blockHash = block.selfHash;
        if(blockHash.length === 0)
            return null;

        this.chainJobCycle(block);

        // チェーンに追加する
        if(this.chains.length == 0) {
            this.chains.push([block]);
        } else{
            mainChain.push(block);
        }
        // 前の状態を保持
        this.previousHash = blockHash;
        this.nextBlockHeight++;
        this.transactionBlocking = [];

        return block;
    }

    /** メインチェーンを取得する */
    public getMainChain() {
        let mainChain: Array<Block> = [];

        for(const chain of this.chains) {
            if(chain.length > mainChain.length)
                mainChain = chain;
        }

        return mainChain;
    }

    /** チェーンの切り捨て選定とか */
    public async chainJobCycle(block: Block) {
        // ブロックのサイズを計算
        const blockSize = BlockDat.calculateBlockSize(block.transactionPool);
        // BlockDatの最新のoffsetとサイズを取得
        let previousBlock = await BlocksTbl.selectWhereLastBlock();
        // これが最初のブロックの場合
        if(previousBlock == null)
            previousBlock = {
                blockhash: this.previousHash,
                height: 0,
                dat: 0,
                offset: 0,
                size: 0
            }

        // DATファイルのIDを取得
        const datId = BlockDat.getFileIdByPreviousBlock(blockSize, previousBlock.dat, previousBlock.offset, previousBlock.size);
        // オフセットを計算する
        const blockOffset = BlockDat.calculateOffset(datId, previousBlock.dat, previousBlock.offset, previousBlock.size);
        // // DATファイルを開く
        const dat = new BlockDat(BlockDat.getFilePath(datId));
        // DATファイルに保存する
        const datResult = dat.write({
            blockVersion: block.blockVersion,
            blockhash: block.selfHash,
            height: block.blockHeight,
            timestamp: block.timestamp,
            difficult: block.difficult,
            nonce: block.nonce,
            previousHash: block.previousHash,
            merkleRootHash: block.merkleRootHash,
            stateRootHash: block.stateRootHash,
            miner: Wallet.walletAddress,
            transactions: block.transactionPool,
            mainchain: true
        }, blockOffset);
        // DATファイルを保存
        dat.save();

        // DATファイルの情報をDBに保存
        BlocksTbl.insert({
            blockhash: block.selfHash,
            height: block.blockHeight,
            dat: datId,
            offset: datResult.offset,
            size: datResult.blockSize
        });

        // 計算結果をネットワークに主張する
        AikaCoin.network.notifyFoundBlockHash({
            blockVersion: block.blockVersion,
            blockhash: block.selfHash,
            height: block.blockHeight,
            timestamp: block.timestamp,
            difficult: block.difficult,
            nonce: block.nonce,
            previousHash: block.previousHash,
            merkleRootHash: block.merkleRootHash,
            stateRootHash: block.stateRootHash,
            miner: Wallet.walletAddress,
            transactions: block.transactionPool
        });
    }
}