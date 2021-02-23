import { WorkerMaster } from "../cluster/WorkerMaster";
import { HashUtils } from "../utils/HashUtils";
import { ITransaction } from "./interfaces/ITransaction";
import { Pow } from "./Pow";


export class Block {
    // （ほぼ）固定データ
    readonly blockVersion: number = 1;

    blockHeight: number;
    nonce: number = -1;
    previousHash: string;
    timestamp: number;
    transactionPool: Array<ITransaction>;
    transactionNum: number;
    merkleRootHash: string = "";
    /** Hashの先頭から何文字が0である必要があるか（※BitCoinとは仕様が違います） */
    difficult: number;

    selfHash: string | null = null;

    constructor(blockHeight: number, previousHash: string, timestamp: number, transactionPool: Array<ITransaction>, difficult: number) {
        this.blockHeight = blockHeight;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.transactionPool = transactionPool;
        this.transactionNum = transactionPool.length;
        this.difficult = difficult;
    }

    async computeSelfHash() {
        const transactionPoolText = JSON.stringify(this.transactionPool);
        this.merkleRootHash = HashUtils.computeSHA256(transactionPoolText);

        // 送信する内容を準備する
        const {blockHeight, blockVersion, previousHash, merkleRootHash, timestamp, difficult} = this;

        // nonceアルゴリズム
        // MAX_INTERGERの半分
        const halfMaxSafeInt = Math.round(Number.MAX_SAFE_INTEGER / 2);
        const nonceRanges: Array<number> = [
            0,
            (halfMaxSafeInt),
            Number.MIN_SAFE_INTEGER
        ];

        // 計算を開始する
        const result = await WorkerMaster.computeSelfHash({blockVersion, blockHeight, previousHash, merkleRootHash, timestamp, difficult, nonceRanges});
        // nonce を適用
        this.nonce = result.nonce;
        // ハッシュを適用
        this.selfHash = result.selfHash;

        return this.selfHash;
    }

    /**
     * ハッシュを計算する部分
     * 重いので別プロセスで動かす
     */
    static computeSelfHashBlock(data: IMasterMessage) {
        let selfHash: string | null = null;
        let nonce = data.nonce;
        const rawText = data.blockVersion + data.blockHeight + data.previousHash + data.merkleRootHash + data.timestamp + data.difficult;

        while(selfHash == null || !Pow.checkProofOfWork(selfHash, data.difficult)) {
            ++nonce;
            const rawTextAndNonce = rawText + nonce;
            selfHash = HashUtils.computeSHA256(rawTextAndNonce);
        }

        return {selfHash, nonce};
    }
}