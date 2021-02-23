import { fileUtils } from "@kaguragateway/y-node-utils";
import { readFileSync, writeFileSync } from "fs";
import { ITransaction } from "../blockchain/interfaces/ITransaction";


export interface IBlockRecord {
    blockVersion: number;
    blockhash: string;
    height: number;
    timestamp: number;
    difficult: number;
    nonce: number;
    previousHash: string;
    merkleRootHash: string;
    miner: string;
    transactions: Array<ITransaction>;
}

export class FatalDataLocked extends Error {}

export class BlockDat {
    private static readonly datVersion: number = 1;
    private static readonly datRecordLen: number = 460;
    private static  readonly headerLen = 8;
    /** DATの長さ（8はファイルのヘッダーサイズ） */
    private static readonly datLen: number = 64000000 + BlockDat.headerLen;

    private static readonly txLen: number = 512;

    private filePath: string;
    private buf: Buffer;
    private recordsBuf: Buffer;

    private isLock = false;

    constructor(filePath: string) {
        // ファイルパス
        this.filePath = filePath;
        // ファイルを開く
        if(fileUtils.isExistFile(this.filePath)) {
            this.buf = readFileSync(this.filePath);
        } else {
            // 新しくバッファを生成
            this.buf = Buffer.alloc(BlockDat.datLen);
            // 書き込む
            this.buf.writeInt16BE(BlockDat.datVersion, 0);
        }
        // レコードだけ
        this.recordsBuf = this.buf.slice(BlockDat.headerLen);
    }

    /**
     * ブロック番号のブロックを取得
     */
    read(offset: number) {
        // レコードの長さを超えてないか？
        if((offset + BlockDat.datRecordLen) > this.recordsBuf.length)
            return null;

        // レコードのサイズを取得
        const recordSize = this.recordsBuf.readUInt16BE(offset);

        // レコード部分を取り出す
        const recordBuf = this.recordsBuf.slice(offset, offset + recordSize);

        // 読み取る
        const blockVersion = recordBuf.readUInt16BE(2);
        const blockhash = recordBuf.slice(4, 68).toString("utf-8");
        const height = recordBuf.readUInt32BE(68);
        const timestamp = recordBuf.readDoubleBE(100);
        const difficult = recordBuf.readUInt16BE(164);
        const nonce = recordBuf.readDoubleBE(180);
        const previousHash = recordBuf.slice(244, 308).toString("utf-8");
        const merkleRootHash = recordBuf.slice(308, 372).toString("utf-8");
        const minerLen = recordBuf.readUInt16BE(372);
        const miner = recordBuf.slice(388, 388+minerLen).toString("utf-8");

        // トランザクション数を取得
        const txNum = recordBuf.readUInt32BE(452);
        // トランザクションサイズを取得
        const txSize = recordBuf.readUInt32BE(456);

        // トランザクションレコードを取得
        const txBuf = recordBuf.slice(BlockDat.datRecordLen, BlockDat.datRecordLen+txSize);

        // トランザクション用変数
        const transactions: Array<ITransaction> = [];
        // トランザクションを取得
        for(let i=0; i < txNum; i++) {
            const offset = i * BlockDat.txLen;

            const transactionVersion = txBuf.readUInt16BE(0 + offset);

            const toLen = txBuf.readUInt16BE(4);
            const to = txBuf.slice(6 + offset, 6 + toLen + offset).toString("utf-8");

            const fromLen = txBuf.readUInt16BE(70);
            const from = txBuf.slice(72 + offset, 72 + fromLen + offset).toString("utf-8");

            const fromPubKeySize = txBuf.readUInt16BE(136 + offset);
            const fromPubKey = txBuf.slice(138 + offset, 138 + fromPubKeySize + offset).toString("utf-8");
            const amount = txBuf.readDoubleBE(266 + offset);
            const signatureLen = txBuf.readUInt16BE(330 + offset);
            const signature = txBuf.slice(332 + offset, 332 + signatureLen + offset).toString("utf-8");

            transactions.push({transactionVersion, to, from, fromPubKey, amount, signature});
        }

        // 返すやつ
        const record: IBlockRecord = {blockVersion, blockhash, height, timestamp, difficult, nonce, previousHash, merkleRootHash, miner, transactions};

        return record;
    }

    write(record: IBlockRecord, offset: number) {
        // ロック中はだめ
        if(this.isLock)
            throw new FatalDataLocked();

        this.isLock = true;

        const txBuf = Buffer.alloc(BlockDat.txLen * record.transactions.length);

        // トランザクションを変換
        for(let i=0; i < record.transactions.length; i++) {
            const tx = record.transactions[i];
            const bufOffset = i * BlockDat.txLen;

            txBuf.writeUInt16BE(tx.transactionVersion, 0 + bufOffset);
            txBuf.writeInt16BE(BlockDat.txLen, 2 + bufOffset);

            txBuf.writeUInt16BE(tx.to.length, 4 + bufOffset);
            txBuf.write(tx.to, 6 + bufOffset, 6 + tx.to.length + bufOffset, "utf-8");

            txBuf.writeUInt16BE(tx.from.length, bufOffset + 70);
            txBuf.write(tx.from, 72 + bufOffset, 72 + tx.from.length + bufOffset, "utf-8");
            txBuf.writeUInt16BE(tx.fromPubKey.length, 136+bufOffset);
            txBuf.write(tx.fromPubKey, 138 + bufOffset, 138 + tx.fromPubKey.length + bufOffset, "utf-8");
            txBuf.writeDoubleBE(tx.amount, 266 + bufOffset);
            txBuf.writeUInt16BE(tx.signature.length, bufOffset + 330);
            txBuf.write(tx.signature, 332 + bufOffset, 332 + tx.signature.length + bufOffset, "utf-8");
        }

        // 中身
        const blockSize = BlockDat.datRecordLen + txBuf.length;
        const recordBuf = Buffer.alloc(blockSize);

        // 書き込む
        recordBuf.writeUInt16BE(blockSize, 0);
        recordBuf.writeUInt16BE(record.blockVersion, 2);
        recordBuf.write(record.blockhash, 4, 68, "utf-8");
        recordBuf.writeInt32BE(record.height, 68);
        recordBuf.writeDoubleBE(record.timestamp, 100);
        recordBuf.writeUInt16BE(record.difficult, 164);
        recordBuf.writeDoubleBE(record.nonce, 180);
        recordBuf.write(record.previousHash, 244, 308, "utf-8");
        recordBuf.write(record.merkleRootHash, 308, 372, "utf-8");
        recordBuf.writeUInt16BE(record.miner.length, 372);
        recordBuf.write(record.miner, 388, 388 + record.miner.length, "utf-8");
        recordBuf.writeUInt32BE(record.transactions.length, 452);
        recordBuf.writeUInt32BE(txBuf.length, 456);

        // レコードバッファに書き込む
        for(let i=0; i < txBuf.length; i++) {
            recordBuf[(i + BlockDat.datRecordLen)] = txBuf[i];
        }

        // ファイル本体に書き込む
        for(let i=(offset+BlockDat.headerLen); i < (offset+BlockDat.headerLen+blockSize); i++) {
            this.buf[i] = recordBuf[(i - offset - BlockDat.headerLen)];
        }

        // レコードバッファを開く
        this.recordsBuf = this.buf.slice(BlockDat.headerLen);

        this.isLock = false;

        return {offset, blockSize};
    }

    /**
     * 変更を保存する
     */
    save(retry?: number) {
        if(retry == null)
            retry = 0;

        // ファイルを保存する
        try {
            writeFileSync(this.filePath, this.buf);
        } catch(e) {
            retry++;
            if(retry < 10)
                setTimeout(this.save.bind(this, retry), 500);
        }
    }

    static calculateBlockSize(transactions: Array<ITransaction>) {
        return BlockDat.datRecordLen + (transactions.length * BlockDat.txLen);
    }

    static getFileIdByPreviousBlock(blockSize: number, previousBlockDatId: number, previousBlockOffset: number, previousBlockSize: number) {
        const last = previousBlockOffset + previousBlockSize + blockSize;

        if(last > BlockDat.datLen)
            return (previousBlockDatId+1);

        return previousBlockDatId;
    }

    static calculateOffset(blockDatId: number, previousBlockDatId: number, previousBlockOffset: number, previousBlockSize: number) {
        if(blockDatId === previousBlockDatId)
            return previousBlockOffset + previousBlockSize;

        return 0;
    }
}