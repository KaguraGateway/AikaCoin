import { objectUtils } from "@kaguragateway/y-node-utils";
import { AikaCoin } from "../AikaCoin";
import { SignUtils } from "../utils/SignUtils";
import { Wallet } from "../Wallet";
import { IFoundBlockHash } from "./packet/IFoundBlockHash";
import { PeerToPeerService } from "./PeerToPeerService";
import os from "os";
import { WalletTbl } from "../sql/sqlite/WalletTbl";
import { BlocksTbl } from "../sql/sqlite/BlocksTbl";
import { Pow } from "../blockchain/Pow";
import { HashUtils } from "../utils/HashUtils";
import { BlockDat } from "../dat/BlockDat";
import path from "path";
import { IRequestBlocks } from "./packet/IRequestBlocks";
import { INewTransaction } from "./packet/INewTransaction";
import { Transaction } from "../blockchain/Transaction";
import { TransactionStatus } from "../blockchain/interfaces/ITransaction";

export const AikaCoinOpCode = {
    FOUND_BLOCK_HASH: 0x1,
    NEW_TRANSACTION: 0x2,
    REQUEST_NODES_LIST: 0x3,
    ANSWER_NODES_LIST: 0x4,

    REQUEST_BLOCKS: 0x5,
    REQUEST_WALLETS: 0x6
};
export type AikaCoinOpCode = typeof AikaCoinOpCode[keyof typeof AikaCoinOpCode];


export class AikaCoinNetwork {
    private p2p: PeerToPeerService;

    constructor(port: number) {
        this.p2p = new PeerToPeerService(port);
    }

    /**
     * 通信を開始
     */
    async start() {
        // P2Pの受信を待機
        this.p2p.startSocket();

        // イベント登録
        this.p2p.on("data", this.onData.bind(this));

        // メインノードをコピー
        const nodes = AikaCoin.config.mainNodes.concat();
        // メインノードをシャッフル
        objectUtils.shakeArray(nodes);

        // 初期ノードに接続する
        for(let i=0; (i < nodes.length && this.p2p.nodes.length < 3); i++) {
            const node = nodes[i];
            // ノードアドレスからIPアドレスとかを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
            // 取得失敗なら無視
            // アドレスが自分でも無視
            if(address == null || this.isNodeAddressSelf(address))
                continue;

            // 接続開始
            await this.p2p.startP2P(address.nodeAddress, address.nodePort);
        }

        // ノードリストをリクエストする
        this.requestNodesList();
    }

    /** ノードリストが返ってきた */
    private onAnswerNodesList(payload: Buffer) {
        (async() => {
            // JSONパース
            const obj = JSON.parse(payload.toString("utf-8"));
            // ノードリストがないなら返す
            if(obj.nodes == null)
                return;
            // ノードリスト
            const nodes: Array<string> = obj.nodes;

            // ノード接続数が10になるまで接続する
            for(let i=0; (i < nodes.length && this.p2p.nodes.length < 10); i++) {
                // ノード
                const node: string = nodes[i];
                // ノードから接続情報を取得
                const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
                // 取得失敗したら無視
                if(address == null)
                    continue;

                // すでに接続していたら無視
                // ノードアドレスが自分なら無視
                if(this.p2p.nodes.includes(node) || this.isNodeAddressSelf(address))
                    continue;

                // ノードに接続する
                await this.p2p.startP2P(address.nodeAddress, address.nodePort);
            }
        })()
        .catch((reason) => {
            console.error(reason);
        });
    }
    /** ノードリストがリクエストされた */
    private onRequestNodesList(remoteAddr: string, remotePort: number) {
        // ノードリストを返す
        this.sendTo(remoteAddr, remotePort, AikaCoinOpCode.ANSWER_NODES_LIST, Buffer.from(JSON.stringify({
            nodes: this.p2p.nodes
        }), "utf-8"));
    }

    /** 誰かがマイニングに成功した */
    private async onFoundBlockHash(remoteAddr: string, remotePort: number, payload: Buffer) {
        // JSONパース
        const obj: IFoundBlockHash = JSON.parse(payload.toString("utf-8"));

        // 前回のブロックハッシュが同じか？
        if(AikaCoin.blockChain.previousHash != obj.previousHash)
            return;
        // ブロックの高さが同じか？
        if(AikaCoin.blockChain.nextBlockHeight != obj.height)
            return;
        // 難易度と０の数が正しいか？
        if(Pow.checkProofOfWork(obj.blockhash, obj.difficult))
            return;
        // 実際にハッシュを生成する
        const rawText = obj.blockVersion + obj.height + obj.previousHash + obj.merkleRootHash + obj.timestamp + obj.difficult + obj.nonce;
        const checkHash = HashUtils.computeSHA256(rawText);

        // 同じになったか？
        if(obj.blockhash != checkHash)
            return;

        // ブロックハッシュでブロックテーブルを検索
        const results = await BlocksTbl.selectWhereBlockHash(obj.blockhash);
        // ないならDBとDATに保存
        if(results.length === 0) {
            // ブロックのサイズを計算
            const blockSize = BlockDat.calculateBlockSize(obj.transactions);
            // BlockDatの最新のoffsetとサイズを取得
            let previousBlock = await BlocksTbl.selectWhereLastBlock();
            // これが最初のブロックの場合
            if(previousBlock == null)
                previousBlock = {
                    blockhash: AikaCoin.blockChain.previousHash,
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
                blockVersion: obj.blockVersion,
                blockhash: obj.blockhash,
                height: obj.height,
                timestamp: obj.timestamp,
                difficult: obj.difficult,
                nonce: obj.nonce,
                previousHash: obj.previousHash,
                merkleRootHash: obj.merkleRootHash,
                stateRootHash: obj.stateRootHash,
                miner: obj.miner,
                transactions: obj.transactions,
                mainchain: true
            }, blockOffset);
            // DATファイルを保存
            dat.save();

            // DATファイルの情報をDBに保存
            BlocksTbl.insert({
                blockhash: obj.blockhash,
                height: obj.height,
                dat: datId,
                offset: datResult.offset,
                size: datResult.blockSize
            });

            AikaCoin.blockChain.previousHash = obj.blockhash;
            AikaCoin.blockChain.nextBlockHeight++;
        }

        // 内容をそのままネットワークに流す
        if(!obj.isPrivate)
            this.broadcastExcludeNode(remoteAddr, remotePort, AikaCoinOpCode.FOUND_BLOCK_HASH, payload);
    }

    private async onRequestBlocks(payload: Buffer) {
        // JSONパース
        const obj: IRequestBlocks = JSON.parse(payload.toString("utf-8"));

        // どこのブロックまで知っているのか
        const knowBlock = await BlocksTbl.selectWhereBlockHash(obj.blockhash);

        let knowBlockHeight=0;

        // 取得できたか
        if(knowBlock.length > 0) {
            // どこの高さか
            knowBlockHeight = knowBlock[0].height;
        }

        // 知っていないブロックのデータを取得
        const blocks = await BlocksTbl.selectWhereBlockHeightAfter(knowBlockHeight);

        let i=0, datCache: {[key: number]: BlockDat} = {};

        // 過去のブロックを送信する
        const loop = setInterval(() => {
            if(i < blocks.length) {
                clearInterval(loop);
                return;
            }

            // ブロック
            const block = blocks[i];

            // DATファイルを開く
            if(datCache[block.dat] == null)
                datCache[block.dat] = new BlockDat(path.join(AikaCoin.blocksPath, `${block.dat}.dat`));
            // 読み込む
            const record = datCache[block.dat].read(block.offset);

            // 読み込みできたなら送る
            if(record != null) {
                this.notifyFoundBlockHash({
                    blockVersion: record.blockVersion,
                    blockhash: record.blockhash,
                    height: record.height,
                    timestamp: record.timestamp,
                    difficult: record.difficult,
                    nonce: record.nonce,
                    previousHash: record.previousHash,
                    merkleRootHash: record.merkleRootHash,
                    stateRootHash: record.stateRootHash,
                    miner: record.miner,
                    transactions: record.transactions,

                    isPrivate: true
                });
            }

            i++;
        }, 200);
    }

    private onNewTransaction(remoteAddr: string, remotePort: number, payload: Buffer) {
        // JSONパース
        const obj: INewTransaction = JSON.parse(payload.toString("utf-8"));

        // トランザクションプールに追加
        AikaCoin.blockChain.transactionPool.push(new Transaction(
            obj.to,
            Wallet.generateWalletAddress(obj.fromPubKey),
            obj.fromPubKey,
            obj.amount,
            obj.signature,
            obj.commands,
            obj.nonce,
            TransactionStatus.PENDDING
        ));

        // 他のノードに送信する
        this.broadcastExcludeNode(remoteAddr, remotePort, AikaCoinOpCode.FOUND_BLOCK_HASH, payload);
    }

    private onData(data: Buffer, remoteAddr: string, remotePort: number) {
        // OpCodeを取得
        const opcode = data.readUInt16BE(0);
        // ペイロードを取得
        const payload = data.length > 8 ? data.slice(8) : Buffer.alloc(1);

        switch(opcode) {
            // 新しいトランザクション（取引）
            case AikaCoinOpCode.NEW_TRANSACTION:
                this.onNewTransaction(remoteAddr, remotePort, payload);
                break;
            // 新しいブロックが生成された
            case AikaCoinOpCode.FOUND_BLOCK_HASH:
                this.onFoundBlockHash(remoteAddr, remotePort, payload);
                break;
            // ノードリストをリクエスト
            case AikaCoinOpCode.REQUEST_NODES_LIST:
                this.onRequestNodesList(remoteAddr, remotePort);
                break;
            // ノードリストが返ってきた
            case AikaCoinOpCode.ANSWER_NODES_LIST:
                this.onAnswerNodesList(payload);
                break;
            // 過去のブロック情報を求めてきた
            case AikaCoinOpCode.REQUEST_BLOCKS:
                this.onRequestBlocks(payload);
                break;
            // 過去のウォレット情報を求めてきた
            case AikaCoinOpCode.REQUEST_WALLETS:
                break;
        }
    }

    /** P2Pネットワーク全体に送信する */
    private broadcast(opcode: AikaCoinOpCode, payload: Buffer) {
        for(const node of this.p2p.nodes) {
            // Nodeアドレスを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
            // 取得失敗したら無視
            if(address == null)
                continue;
            // 送信
            this.sendTo(address.nodeAddress, address.nodePort, opcode, payload);
        }
    }

    /** P2Pネットワーク全体に送信する */
    private broadcastExcludeNode(excludeNodeIp: string, excludeNodePort: number, opcode: AikaCoinOpCode, payload: Buffer) {
        for(const node of this.p2p.nodes) {
            // Nodeアドレスを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
            // 取得失敗したら無視
            if(address == null)
                continue;

            // 無視するアドレスなら無視
            if(excludeNodeIp === address.nodeAddress && excludeNodePort === address.nodePort)
                continue;

            // 送信
            this.sendTo(address.nodeAddress, address.nodePort, opcode, payload);
        }
    }

    /** 特定のノードに送信 */
    private sendTo(toAddress: string, toPort: number, opcode: AikaCoinOpCode, payload: Buffer) {
        // ヘッダー
        const headerBuf = Buffer.alloc(8);
        // OPCODEを書き込む
        headerBuf.writeUInt16BE(opcode, 0);

        // 結合
        const concatBuf = Buffer.concat([headerBuf, payload]);

        // 送信
        this.p2p.sendToData(toAddress, toPort, concatBuf);
    }

    /** そのIPアドレスは自分を指すのか調べる */
    isNodeAddressSelf(address: {nodeAddress: string, nodePort: number}) {
        // インターフェイスを全部取得
        const interfaces = os.networkInterfaces();

        for(const key in interfaces) {
            // インターフェイスを取得
            const nif = interfaces[key];
            // 取得できているか？
            if(nif == null)
                continue;
            // インターフェイス情報を回す
            for(const ip of nif) {
                if(address.nodeAddress === ip.address && address.nodePort === this.p2p.port) {
                    return true;
                }
            }
        }

        return false;
    }

    notifyNewTransaction(data: INewTransaction) {
        return this.broadcast(AikaCoinOpCode.NEW_TRANSACTION, Buffer.from(JSON.stringify(data), "utf-8"));
    }

    notifyFoundBlockHash(data: IFoundBlockHash) {
        return this.broadcast(AikaCoinOpCode.FOUND_BLOCK_HASH, Buffer.from(JSON.stringify(data), "utf-8"));
    }

    requestNodesList() {
        return this.broadcast(AikaCoinOpCode.REQUEST_NODES_LIST, Buffer.alloc(1));
    }

    requestPastBlocks(data: IRequestBlocks) {
        return this.broadcast(AikaCoinOpCode.REQUEST_BLOCKS, Buffer.from(JSON.stringify(data), "utf-8"));
    }
}