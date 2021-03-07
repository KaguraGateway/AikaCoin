import { fileUtils } from "@kaguragateway/y-node-utils";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { AikaCoin } from "../AikaCoin";
import { ITransaction, TransactionCommand } from "../blockchain/interfaces/ITransaction";
import { IDatInfo } from "../leveldb/IDatInfo";


export interface IBlockRecord {
    blockVersion: number;
    blockhash: string;
    height: number;
    timestamp: number;
    difficult: number;
    nonce: number;
    previousHash: string;
    merkleRootHash: string;
    stateRootHash: string;
    miner: string;
    mainchain: boolean;
    transactions: Array<ITransaction>;
}

export class FatalDataLocked extends Error {}

export class BlockDat {
    private static readonly datVersion: number = 1;
    private static readonly datRecordLen: number = 511;
    private static  readonly headerLen = 8;
    /** DATの長さ（8はファイルのヘッダーサイズ） */
    private static readonly datLen: number = 64000000 + BlockDat.headerLen;

    //private static readonly txLen: number = 516;
    /** トランザクションの固定の長さ（commandsを含まない長さ） */
    private static readonly txFixedLen: number = 652;
    /** commandsの長さ */
    private static readonly txCmdFixedLen: number = 4;

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
        // if((offset + BlockDat.datRecordLen) > this.recordsBuf.length)
        //     return null;

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
        const stateRootHash = recordBuf.slice(372, 436).toString("utf-8");
        const minerLen = recordBuf.readUInt16BE(436);
        const miner = recordBuf.slice(438, 438+minerLen).toString("utf-8");

        // フラグを読み取る
        const flags = recordBuf.readInt8(502);
        // メインチェーンか読み取る
        const mainchain = (flags & 0x1) ? true : false;

        // トランザクション数を取得
        const txNum = recordBuf.readUInt32BE(503);
        // トランザクションサイズを取得
        const txsSize = recordBuf.readUInt32BE(507);

        // トランザクションレコードを取得
        const txBuf = recordBuf.slice(BlockDat.datRecordLen, BlockDat.datRecordLen+txsSize);

        // トランザクション用変数
        const transactions: Array<ITransaction> = [];
        // トランザクションを取得
        for(let i=0, txOffset=0; i < txNum; i++) {
            const transactionVersion = txBuf.readUInt16BE(0 + txOffset);
            const txSize = txBuf.readUInt16BE(2 + txOffset)

            const toLen = txBuf.readUInt16BE(4);
            const to = txBuf.slice(6 + txOffset, 6 + toLen + txOffset).toString("utf-8");

            const fromLen = txBuf.readUInt16BE(70);
            const from = txBuf.slice(72 + txOffset, 72 + fromLen + txOffset).toString("utf-8");

            const fromPubKeySize = txBuf.readUInt16BE(136 + txOffset);
            const fromPubKey = txBuf.slice(138 + txOffset, 138 + fromPubKeySize + txOffset).toString("utf-8");
            const amount = txBuf.readDoubleBE(266 + txOffset);

            const signatureLen = txBuf.readUInt16BE(330 + txOffset);
            const signature = txBuf.slice(332 + txOffset, 332 + signatureLen + txOffset).toString("utf-8");

            const nonce = txBuf.readUInt32BE(512 + txOffset);
            const status = txBuf.readUInt16BE(516 + txOffset);

            const fee = txBuf.readDoubleBE(518 + txOffset);
            const hashLen = txBuf.readUInt16BE(582 + txOffset);
            const transactionHash = txBuf.slice(584 + txOffset, 584 + hashLen + txOffset).toString("utf-8");

            const commandsNum = txBuf.readUInt16BE(648 + txOffset);
            const commandsLen = txBuf.readUInt16BE(650 + txOffset);
            const commandsBuf = txBuf.slice(BlockDat.txFixedLen + txOffset, BlockDat.txFixedLen + commandsLen + txOffset);

            const commands: Array<TransactionCommand> = [];

            // コマンドを取得
            for(let j=0, cmdOffset=txOffset; j < commandsNum; j++) {
                // コマンド１つ取得
                const commandBuf = commandsBuf.slice(cmdOffset, cmdOffset + BlockDat.txCmdFixedLen);

                // コマンド
                const cmdOpcode = commandBuf.readUInt16BE(2);
                // 追加
                commands.push(cmdOpcode);

                cmdOffset += BlockDat.txCmdFixedLen;
            }

            transactions.push({transactionVersion, to, from, fromPubKey, amount, signature, nonce, status, fee, transactionHash, commands});

            txOffset += txSize;
        }

        // 返すやつ
        const record: IBlockRecord = {blockVersion, blockhash, height, timestamp, difficult, nonce, previousHash, merkleRootHash, stateRootHash, miner, transactions, mainchain};

        return record;
    }

    write(record: IBlockRecord, offset: number) {
        // ロック中はだめ
        if(this.isLock)
            throw new FatalDataLocked();

        this.isLock = true;

        // トランザクションリスト全体のサイズ（１つのトランザクションのサイズは可変です）
        const txsSize = BlockDat.calculateTxsSize(record.transactions);
        // Bufferを生成
        const txBuf = Buffer.alloc(txsSize);

        // トランザクションを変換
        for(let i=0, bufOffset=0; i < record.transactions.length; i++) {
            const tx = record.transactions[i];

            // このトランザクションの長さを計算
            const txSize = BlockDat.txFixedLen + (BlockDat.txCmdFixedLen * tx.commands.length);

            txBuf.writeUInt16BE(tx.transactionVersion, 0 + bufOffset);
            txBuf.writeInt16BE(txSize, 2 + bufOffset);

            txBuf.writeUInt16BE(tx.to.length, 4 + bufOffset);
            txBuf.write(tx.to, 6 + bufOffset, 6 + tx.to.length + bufOffset, "utf-8");

            txBuf.writeUInt16BE(tx.from.length, bufOffset + 70);
            txBuf.write(tx.from, 72 + bufOffset, 72 + tx.from.length + bufOffset, "utf-8");
            txBuf.writeUInt16BE(tx.fromPubKey.length, 136+bufOffset);
            txBuf.write(tx.fromPubKey, 138 + bufOffset, 138 + tx.fromPubKey.length + bufOffset, "utf-8");
            txBuf.writeDoubleBE(tx.amount, 266 + bufOffset);
            txBuf.writeUInt16BE(tx.signature.length, bufOffset + 330);
            txBuf.write(tx.signature, 332 + bufOffset, 332 + tx.signature.length + bufOffset, "utf-8");

            txBuf.writeUInt32BE(tx.nonce, 512 + bufOffset);
            txBuf.writeUInt16BE(tx.status, 516 + bufOffset);
            txBuf.writeDoubleBE(tx.fee, 518 + bufOffset);

            txBuf.writeUInt16BE(tx.transactionHash.length, 582 + bufOffset);
            txBuf.write(tx.transactionHash, 584 + bufOffset, 584 + tx.transactionHash.length + bufOffset, "utf-8");

            txBuf.writeUInt16BE(tx.commands.length, 648 + bufOffset);
            txBuf.writeUInt16BE((tx.commands.length * BlockDat.txCmdFixedLen), 650 + bufOffset);

            // コマンドを書き込む
            for(let j=0, cmdOffset=(bufOffset + BlockDat.txFixedLen); j < tx.commands.length; j++) {
                // 取得
                const cmd = tx.commands[j];

                // コマンドバージョン
                txBuf.writeInt16BE(1, 0 + cmdOffset);
                // コマンドコード
                txBuf.writeInt16BE(cmd, 2 + cmdOffset);

                cmdOffset += BlockDat.txCmdFixedLen;
            }

            bufOffset += txSize;
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
        recordBuf.write(record.stateRootHash, 372, 436, "utf-8");
        recordBuf.writeUInt16BE(record.miner.length, 436);
        recordBuf.write(record.miner, 438, 438 + record.miner.length, "utf-8");

        // フラグ
        const mainchain = record.mainchain ? 1 : 0;
        recordBuf.writeInt8(mainchain, 502);

        recordBuf.writeUInt32BE(record.transactions.length, 503);
        recordBuf.writeUInt32BE(txBuf.length, 507);

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

    /**
     * 一番最後に記入する
     * @param record
     */
    static async writeLast(record: IBlockRecord) {
        // BlockDat情報を取得
        const datInfo = await AikaCoin.datInfo.getDatInfo();
        // ブロックのサイズを計算
        const nextBlockSize = BlockDat.calculateBlockSize(record.transactions);
        // 次のDatファイルのIDを取得
        const nextDatId = BlockDat.getNextFileId(nextBlockSize, datInfo);
        // オフセットを計算する
        const nextOffset = BlockDat.calculateOffset(nextDatId, datInfo.lastFileId, datInfo.lastOffset, datInfo.lastLength);

        // DATファイルを開く
        const dat = new BlockDat(BlockDat.getFilePath(nextDatId));
        // DATファイルに保存する
        const {offset, blockSize} = dat.write(record, nextOffset);
        // DATファイルを保存する
        dat.save();

        // DAT情報を保存する
        await AikaCoin.datInfo.putDatInfo({lastFileId: nextDatId, lastOffset: nextOffset, lastLength: nextBlockSize});

        return {offset, blockSize, nextDatId};
    }

    static calculateTxsCmdSize(transactions: Array<ITransaction>) {
        let cmdSize = 0;

        for(const tx of transactions) {
            cmdSize += tx.commands.length * this.txCmdFixedLen;
        }

        return cmdSize;
    }

    static calculateTxsSize(transactions: Array<ITransaction>) {
        return transactions.length * BlockDat.txFixedLen + this.calculateTxsCmdSize(transactions);
    }

    static calculateBlockSize(transactions: Array<ITransaction>) {
        return BlockDat.datRecordLen + (this.calculateTxsSize(transactions));
    }

    static getNextFileId(blockSize: number, datInfo: IDatInfo) {
        const last = datInfo.lastLength + blockSize;

        if(last > BlockDat.datLen)
            return (datInfo.lastFileId+1);

        return datInfo.lastFileId;
    }

    static calculateOffset(blockDatId: number, previousBlockDatId: number, previousBlockOffset: number, previousBlockSize: number) {
        if(blockDatId === previousBlockDatId)
            return previousBlockOffset + previousBlockSize;

        return 0;
    }

    static getFilePath(datId: number) {
        return path.join(AikaCoin.blocksPath, `${datId}.dat`);
    }
}