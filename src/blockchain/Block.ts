import { WorkerMaster } from "../cluster/WorkerMaster";
import { IWalletTbl } from "../sql/interface/IWalletTbl";
import { HashUtils } from "../utils/HashUtils";
import { MerkleTree } from "../utils/MerkleTree";
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
    statePool: Array<IWalletTbl>;

    transactionNum: number;
    merkleRootHash: string = "";
    stateRootHash: string = "";
    /** Hashの先頭から何文字が0である必要があるか（※BitCoinとは仕様が違います） */
    difficult: number;

    selfHash: string = "";

    constructor(blockHeight: number, previousHash: string, timestamp: number, transactionPool: Array<ITransaction>, statePool: Array<IWalletTbl>, difficult: number) {
        this.blockHeight = blockHeight;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.transactionPool = transactionPool;
        this.statePool = statePool;
        this.transactionNum = transactionPool.length;
        this.difficult = difficult;
    }

    async computeSelfHash() {
        // マークルツリー
        const merkleRoot = [];
        for(const tx of this.transactionPool) {
            merkleRoot.push(tx.transactionHash);
        }
        this.merkleRootHash = (new MerkleTree()).createTree(merkleRoot) || "NULL";

        // ステートを計算
        const stateRoot = [];
        for(const w of this.statePool) {
            const hash = HashUtils.computeSHA256(w.address + w.balance + w.nonce + w.pubkey + w.status);
            stateRoot.push(hash);
        }
        this.stateRootHash = (new MerkleTree()).createTree(stateRoot);
        console.log(`stateRoot: ${this.stateRootHash}`);

        // 送信する内容を準備する
        const {blockHeight, blockVersion, previousHash, merkleRootHash, timestamp, difficult} = this;

        // nonceアルゴリズム
        // MAX_INTERGERの半分
        const halfMaxSafeInt = Math.round(Number.MAX_SAFE_INTEGER / 2);
        // MAX_INTERGERの1/4
        const quarterMaxSafeInt = Math.round(Number.MAX_SAFE_INTEGER / 4);
        // MIN_INTEGERの半分
        const halfMinSafeInt = Math.round(Number.MIN_SAFE_INTEGER / 2);
        const nonceRanges: Array<number> = [
            0,
            (halfMaxSafeInt),
            (quarterMaxSafeInt),
            (halfMinSafeInt),
            Number.MIN_SAFE_INTEGER
        ];

        // 計算を開始する
        const result = await WorkerMaster.computeSelfHash({blockVersion, blockHeight, previousHash, merkleRootHash, timestamp, difficult, nonceRanges});
        if(result == null)
            return null;

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

    setSelfHash(selfHash: string) {
        this.selfHash = selfHash;
        return this;
    }
}