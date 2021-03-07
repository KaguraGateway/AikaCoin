import { timeUtils } from "@kaguragateway/y-node-utils";
import path from "path";
import { Database } from "sqlite3";
import { AikaCoin } from "../AikaCoin";
import { BlockDat } from "../dat/BlockDat";
import { ITransactionIndex } from "../leveldb/ITransactionIndex";
import { TransactionIndexDb } from "../leveldb/TransactionIndexDb";
import { AikaCoinNetwork, AikaCoinOpCode } from "../p2p/AikaCoinNetwork";
import { CoinDB } from "../sql/CoinDB";
import { BlocksTbl } from "../sql/sqlite/BlocksTbl";
import { WalletTbl } from "../sql/sqlite/WalletTbl";
import { HashUtils } from "../utils/HashUtils";
import { MathUtils } from "../utils/MathUtils";
import { PemUtils } from "../utils/PemUtils";
import { SignUtils } from "../utils/SignUtils";
import { Wallet } from "../Wallet";
import { Block } from "./Block"
import { CompactBlock } from "./CompactBlock";
import { Constant } from "./Constant";
import { ICompactBlock } from "./interfaces/ICompactBlock";
import { ITransaction, TransactionCommand, TransactionStatus } from "./interfaces/ITransaction";
import { Pow } from "./Pow";
import { Transaction } from "./Transaction";


export class BlockChain {
    /** チェーン */
    chains: Array<Array<ICompactBlock>> = [];

    previousHash = "0000000000000000000000000000000000000000000000000000000000000000";

    // 未承認のトランザクション
    transactionPool: Array<ITransaction> = []
    // 処理中のトランザクション
    transactionBlocking: Array<ITransaction> = []
    // 難易度
    difficult: number = 6;
    // 次の難易度
    nextDifficult: number = 6;
    // 採掘にかかった時間プール
    miningTimePool: Array<number> = [];

    constructor() {
    }

    async init() {
        // 昔のデータを取得
        const previousBlock = await BlocksTbl.selectWhereLastBlock();

        if(previousBlock != null) {
            this.previousHash = previousBlock.blockhash;

            // チェーンを生成
            this.addCompactBlockToChain(new CompactBlock(previousBlock.blockhash, previousBlock.height, previousBlock.previousHash));

            // 過去１０個のブロックを取得
            for(let i=0, previousBlock2=previousBlock; i < 10; i++) {
                // 取得
                const block = await BlocksTbl.selectWhereBlockHash(previousBlock2.previousHash);
                // 取得できなかった？
                if(block == null)
                    continue;

                // チェーン追加
                this.addCompactBlockToChain(new CompactBlock(block.blockhash, block.height, block.previousHash));

                // 前回に追加
                previousBlock2 = block;
            }
        }
    }

    public async processBlock2(db: Database, previousBlock: ICompactBlock, transactionPool: Array<ITransaction>) {
        // UnixTimeを取得
        const unixTime = timeUtils.getNowUnixTime();
        const beginMsTime = (new Date()).getTime();

        // ブロック番号を取得
        const blockHeight = previousBlock.height+1;

        AikaCoin.miningLogger.info(`[New Job] CreateNewBlock (Height: ${blockHeight}, Diff: ${this.difficult}, TxNum: ${transactionPool.length}, Start: ${unixTime})`);

        // SQLのトランザクションを開始
        db.run("BEGIN TRANSACTION CB");

        // LevelDBのトランザクション
        let txIndexBatch = AikaCoin.txIndex.db.batch();
        const txIndexKeys: Array<{transactionHash: string, transaction: ITransaction}> = [];console.log(transactionPool);

        // トランザクションを処理
        for(const [i, tx] of transactionPool.entries()) {
            // トランザクションのハッシュを計算
            const transactionHash = Transaction.getTransactionHash(tx.transactionVersion, tx.to, tx.from, tx.fromPubKey, tx.amount, tx.nonce);

            // 必要なパラメータの検証
            // 署名を検証する
            if(tx.fromPubKey == null || tx.from == null || tx.signature == null || tx.amount == null || tx.transactionHash !== transactionHash || tx.signature.length === 0 || tx.fromPubKey.length === 0 || !SignUtils.verify(tx.signature, transactionHash, PemUtils.getPemPublicKeyFromRawPublicKey(tx.fromPubKey), "hex")) {
                tx.status = TransactionStatus.REJECT;
                continue;
            }

            // このトランザクションが既に処理させていないか
            if((await AikaCoin.txIndex.getBlockHashIncludeTransaction(transactionHash)) != null)
                continue;

            // コマンドを処理
            Transaction.processCommands(tx);

            // コマンド処理のみならここで終了
            if(tx.to === "CMDONLY" && tx.amount === 0) {
                // 成功に
                tx.status = TransactionStatus.SUCCESS;
                // トランザクションIndexに追加
                txIndexKeys.push({transactionHash: transactionHash, transaction: tx});
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
            // 小数第19位以下（1RIPAIKより小さい位）を切り捨て
            tx.fee = MathUtils.orgFloor((tx.amount * Constant.feePercent), 10**(13));

            // 送金量と手数料の合算分
            const total = tx.amount + tx.fee;
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

            // トランザクションIndexに追加
            txIndexKeys.push({transactionHash: transactionHash, transaction: tx});

            // 確認全部できたらTX成功に
            tx.status = TransactionStatus.SUCCESS;
        }

        const txMsTime = (new Date()).getTime();
        AikaCoin.miningLogger.debug(`Ended Transaction Approval Process: ${txMsTime - beginMsTime}ms`);

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
                    const coinBaseTransaction = Transaction.createNewTransaction(tenMinusblock.miner, "COINBASE", "", Pow.getCoinBaseAmount(blockHeight), [], tenMinusMiner.nonce, "", "");
                    // 承認
                    coinBaseTransaction.status = TransactionStatus.SUCCESS;

                    // 手数料を計算
                    const feeTotal = Pow.getTransactionsFeeTotal(tenMinusblock.transactions);

                    // コインベース支払い後の残高を計算
                    const minerBalance = tenMinusMiner.balance + coinBaseTransaction.amount + feeTotal;
                    // DB変更
                    await WalletTbl.updateBalanceAndNonceWhereAddressNonSerialized(tenMinusMiner.address, minerBalance, tenMinusMiner.nonce);
                    // トランザクションに追加
                    transactionPool.push(coinBaseTransaction);
                    // トランザクションインデックスにも追加
                    txIndexKeys.push({transactionHash: coinBaseTransaction.transactionHash, transaction: coinBaseTransaction});
                }
            }
        }

        const coinbaseMsTime = (new Date()).getTime();
        AikaCoin.miningLogger.debug(`Ended CoinBase Process: ${coinbaseMsTime - txMsTime}ms`);

        // ウォレットをすべて取得
        const wallets = await WalletTbl.getAll();

        // ブロックを生成
        const block = new Block(blockHeight, previousBlock.blockHash, unixTime, transactionPool, wallets, this.difficult);

        // ブロックを計算する
        const blockHash = await block.computeSelfHash();
        // 計算失敗してないか？
        // 他の人が実は先に計算していないか？
        if(blockHash == null || Pow.isOthersCompletedFirst(blockHeight)) {
            db.run("ROLLBACK TRANSACTION CB");
            return null;
        }

        for(const [i, v] of txIndexKeys.entries()) {
            // トランザクションIndexに追加
            txIndexBatch = await AikaCoin.txIndex.putTransactionForBatch(txIndexBatch, v.transactionHash, blockHash, i, v.transaction);
        }

        // 計算にかかった時間
        const computeTime = timeUtils.getNowUnixTime() - unixTime;
        // 計算にかかった時間を追加
        this.miningTimePool.push(computeTime);

        AikaCoin.miningLogger.info(`[End Job] Complete Compute Hash: ${blockHash} (Nonce: ${block.nonce} Time: ${computeTime} sec)`);

        // バッチ処理
        await txIndexBatch.write();
        db.run("COMMIT TRANSACTION CB");

        return block;
    }

    private processBlock(previousBlock: ICompactBlock, transactionPool: Array<ITransaction>): Promise<Block | null> {
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
        const previousBlock = mainChain.length > 0 ? mainChain[mainChain.length - 1] : {blockHash: "0000000000000000000000000000000000000000000000000000000000000000", previousHash: "0000000000000000000000000000000000000000000000000000000000000000", height: 0};

        // 処理部分
        const block = await this.processBlock(previousBlock, transactionPool);

        // 失敗してないか
        if(block == null)
            return null;

        // ブロックハッシュ
        const blockHash = block.selfHash;
        if(blockHash.length === 0)
            return null;

        // ネットワークで主張したり保存したり
        this.chainJobCycle(block);

        // チェーンに追加する
        this.addBlockToChain(block);

        // 前の状態を保持
        this.previousHash = blockHash;
        this.transactionBlocking = [];

        return block;
    }

    /** メインチェーンを取得する */
    public getMainChain() {
        let mainChain: Array<ICompactBlock> = [];

        for(const chain of this.chains) {
            if(chain.length > 0 && chain[chain.length - 1].height > (mainChain.length > 0 ? mainChain[mainChain.length - 1].height : 0))
                mainChain = chain;
        }

        return mainChain;
    }
    /** 一番最新のブロック番号を取得する */
    public getLastBlockHeight() {
        // メインチェーンを取得する
        const mainChain = this.getMainChain();

        if(mainChain.length > 0)
            return mainChain[mainChain.length - 1].height + 1;

        return 1;
    }

    public addBlockToChain(block: Block) {
        const compactBlock = new CompactBlock(block.selfHash, block.blockHeight, block.previousHash);

        return this.addCompactBlockToChain(compactBlock);
    }
    public addCompactBlockToChain(compactBlock: CompactBlock) {
        for(const chain of this.chains) {
            for(const chainBlock of chain) {
                if(chainBlock.blockHash == compactBlock.previousHash) {
                    chain.push(compactBlock);
                    return;
                }
            }
        }

        this.chains.push([compactBlock]);
    }

    /** チェーンの切り捨て選定とか */
    public async chainJobCycle(block: Block) {
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


        // DATファイルに保存する
        const datResult = await BlockDat.writeLast({
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
        });

        // DATファイルの情報をDBに保存
        BlocksTbl.insert({
            blockhash: block.selfHash,
            previousHash: block.previousHash,
            height: block.blockHeight,
            dat: datResult.nextDatId,
            offset: datResult.offset,
            size: datResult.blockSize
        });
    }
}