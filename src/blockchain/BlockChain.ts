import { timeUtils } from "@kaguragateway/y-node-utils";
import path from "path";
import { AikaCoin } from "../AikaCoin";
import { BlockDat } from "../dat/BlockDat";
import { AikaCoinNetwork, AikaCoinOpCode } from "../p2p/AikaCoinNetwork";
import { BlocksTbl } from "../sql/sqlite/BlocksTbl";
import { MathUtils } from "../utils/MathUtils";
import { Wallet } from "../Wallet";
import { Block } from "./Block"
import { ITransaction } from "./interfaces/ITransaction";
import { Pow } from "./Pow";
import { Transaction } from "./Transaction";


export class BlockChain {
    // 未承認のトランザクション
    transactionPool: Array<ITransaction> = []
    // 処理中のトランザクション
    transactionBlocking: Array<ITransaction> = []
    // 難易度
    difficult: number = 6;
    // 次の難易度
    nextDifficult: number = 6;
    // 前回のハッシュ値
    previousHash: string = "0000000000000000000000000000000000000000000000000000000000000000";
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

    /**
     * ブロックを生成
     * @param previousHash 前のブロックのハッシュ
     */
    public async createNewBlock() {
        // 難易度を取得
        this.difficult = this.nextDifficult;

        // コインベース
        const coinBaseTransaction = Transaction.createNewTransaction(Wallet.walletAddress, "COINBASE", "", Pow.getCoinBaseAmount(this.nextBlockHeight), "", "");
        // 未承認のトランザクションに追加
        this.transactionPool.unshift(coinBaseTransaction);

        // UnixTimeを取得
        const unixTime = timeUtils.getNowUnixTime();

        // トランザクションプールをコピーする
        const transactionPool = this.transactionPool.concat();
        this.transactionBlocking = transactionPool;
        // トランザクションプールを初期化
        this.transactionPool=[];
        // ブロック番号を取得
        const blockHeight = this.nextBlockHeight;
        // ブロックを生成
        const block = new Block(blockHeight, this.previousHash, unixTime, transactionPool, this.difficult);

        console.log(`[New Job] CreateNewBlock (Height: ${blockHeight}, Diff: ${this.difficult}, TxNum: ${transactionPool.length}, Start: ${unixTime})`);

        // ブロックを計算する
        const blockHash = await block.computeSelfHash();
        // 計算失敗してないか？
        if(blockHash == null || Pow.isOthersCompletedFirst(blockHeight))
            return null;

        // 計算にかかった時間
        const computeTime = timeUtils.getNowUnixTime() - unixTime;
        // 計算にかかった時間を追加
        this.miningTimePool.push(computeTime);

        console.log(`Complete Compute Hash: ${blockHash} (Nonce: ${block.nonce} Time: ${computeTime} sec)`);

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
        const dat = new BlockDat(path.join(AikaCoin.blocksPath, `${datId}.dat`));
        // DATファイルに保存する
        const datResult = dat.write({
            blockVersion: block.blockVersion,
            blockhash: blockHash,
            height: block.blockHeight,
            timestamp: block.timestamp,
            difficult: block.difficult,
            nonce: block.nonce,
            previousHash: block.previousHash,
            merkleRootHash: block.merkleRootHash,
            miner: Wallet.walletAddress,
            transactions: block.transactionPool
        }, blockOffset);
        // DATファイルを保存
        dat.save();

        // DATファイルの情報をDBに保存
        BlocksTbl.insert({
            blockhash: blockHash,
            height: block.blockHeight,
            dat: datId,
            offset: datResult.offset,
            size: datResult.blockSize
        });

        // 計算結果をネットワークに主張する
        AikaCoin.network.notifyFoundBlockHash({
            blockVersion: block.blockVersion,
            blockhash: blockHash,
            height: block.blockHeight,
            timestamp: block.timestamp,
            difficult: block.difficult,
            nonce: block.nonce,
            previousHash: block.previousHash,
            merkleRootHash: block.merkleRootHash,
            miner: Wallet.walletAddress,
            transactions: transactionPool
        });

        // 100ブロックに1回調整する
        if(this.miningTimePool.length >= 100) {
            // 中央時間を取得
            const median = MathUtils.calculateMedianFromArray(this.miningTimePool);
            const average = MathUtils.calculateAverageFromArray(this.miningTimePool);
            console.log(`中央値: ${median}sec 平均値: ${average}sec`);

            // 計算にかかった時間が1分以上なら難易度を下げる
            if(average >= 60)
                this.nextDifficult--;
            // 計算にかかった時間が15秒未満なら難易度を上げる
            else if(average < 15)
                this.nextDifficult++;

            this.miningTimePool = [];
        }

        this.previousHash = blockHash;
        this.nextBlockHeight++;
        this.transactionBlocking = [];

        return block;
    }
}