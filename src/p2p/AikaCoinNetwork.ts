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
import { NodeList } from "./NodeList";
import EventEmitter from "events";
import { CompactBlock } from "../blockchain/CompactBlock";
import { MathUtils } from "../utils/MathUtils";
import { Constant } from "../blockchain/Constant";
import { PemUtils } from "../utils/PemUtils";

const Traceroute = require('nodejs-traceroute');

export const AikaCoinOpCode = {
    FOUND_BLOCK_HASH: 0x1,
    NEW_TRANSACTION: 0x2,
    REQUEST_NODES_LIST: 0x3,
    ANSWER_NODES_LIST: 0x4,

    REQUEST_BLOCKS: 0x5,
    END_BLOCKS: 0x6
};
export type AikaCoinOpCode = typeof AikaCoinOpCode[keyof typeof AikaCoinOpCode];


export class AikaCoinNetwork extends EventEmitter {
    p2p: PeerToPeerService;

    constructor(port: number) {
        super();

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
        const nodes = NodeList.mainNodes.concat();
        // メインノードをシャッフル
        objectUtils.shakeArray(nodes);

        // 初期ノードに接続する
        for(let i=0; (i < nodes.length && this.p2p.nodes.length < 3); i++) {
            const node = nodes[i];
            // ノードアドレスからIPアドレスとかを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);

            AikaCoin.systemLogger.info(`Start P2P: Testing... ${JSON.stringify(address)}`);

            // 取得失敗なら無視
            // アドレスが自分でも無視
            if(address == null || this.isNodeAddressSelf(address) || (await this.isNodeIPv4AddressSelf(address.nodeAddress)))
                continue;

                AikaCoin.systemLogger.info(`Start P2P: Connecting... ${address.nodeAddress} ${address.nodePort}`);

            // 接続開始
            const result = await this.p2p.startP2P(address.nodeId, address.nodeAddress, address.nodePort);
            // 結果
            if(result === "TIMEOUT")
                AikaCoin.systemLogger.warn(`Connection Fatal: TIMEOUT (IP: ${address.nodeAddress} Port: ${address.nodePort})`);
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
                await this.p2p.startP2P(address.nodeId, address.nodeAddress, address.nodePort);
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

        // とりあえずネットワークに放出されたものはハッシュ計算さえあってれば保存する
        // 実際にハッシュを生成する
        const rawText = obj.blockVersion + obj.height + obj.previousHash + obj.merkleRootHash + obj.timestamp + obj.difficult + obj.nonce;
        const checkHash = HashUtils.computeSHA256(rawText);

        // 同じになったか？
        if(obj.blockhash != checkHash)
            return;

        // ブロックハッシュでブロックテーブルを検索
        const result = await BlocksTbl.selectWhereBlockHash(obj.blockhash);console.log(result);
        // ないならDBとDATに保存
        if(result == null) {
            // トランザクションを処理
            for(const [i, tx] of obj.transactions.entries()) {
                // トランザクションのハッシュを計算
                const transactionHash = Transaction.getTransactionHash(tx.transactionVersion, tx.to, tx.from, tx.fromPubKey, tx.amount, tx.nonce);
                // 必要なパラメータの検証
                // 署名を検証する
                if(tx.from == null || tx.amount == null || tx.transactionHash !== transactionHash || (tx.fromPubKey.length !== 0 && tx.signature.length !== 0 && !SignUtils.verify(tx.signature, transactionHash, PemUtils.getPemPublicKeyFromRawPublicKey(tx.fromPubKey), "hex"))) {
                    tx.status = TransactionStatus.REJECT;
                    continue;
                }

                // このトランザクションが既に処理させていないか
                if((await AikaCoin.txIndex.getBlockHashIncludeTransaction(transactionHash)) != null)
                    continue;

                // コマンドを処理
                await Transaction.processCommands(tx);
                // コマンド処理のみならここで終了
                if(tx.to === "CMDONLY" && tx.amount === 0) {
                    // 成功に
                    tx.status = TransactionStatus.SUCCESS;
                    // トランザクションIndexに追加
                    await AikaCoin.txIndex.putTransaction(transactionHash, obj.blockhash, i, tx);
                    continue;
                }

                // ウォレットアドレスからウォレットを取得
                const fromWallet = tx.from !== "COINBASE" ? await WalletTbl.selectWhereAddress(tx.from) : null;
                const toWallet = await WalletTbl.selectWhereAddress(tx.to);
                // ウォレットの存在を確認
                if(((fromWallet == null || fromWallet.pubkey !== tx.fromPubKey) && tx.from !== "COINBASE") || toWallet == null) {
                    tx.status = TransactionStatus.REJECT;
                    continue;
                }

                // ノンスチェック
                (fromWallet != null) && fromWallet.nonce++;
                toWallet.nonce++;
                if((fromWallet != null && fromWallet.nonce !== tx.nonce) || (tx.from === "COINBASE" && toWallet.nonce !== tx.nonce)) {
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
                if(fromWallet != null && fromWallet.balance < total) {
                    tx.status = TransactionStatus.REJECT;
                    continue;
                }

                // 残り残高を計算
                const fromBalance = fromWallet != null ? (fromWallet.balance - total) : 0;
                const toBalance = toWallet.balance + tx.amount;

                // DBを変更
                fromWallet != null && (await WalletTbl.updateBalanceAndNonceWhereAddress(tx.from, fromBalance, fromWallet.nonce));
                await WalletTbl.updateBalanceAndNonceWhereAddress(tx.to, toBalance, toWallet.nonce);

                console.log(transactionHash);
                // トランザクションIndexに追加
                await AikaCoin.txIndex.putTransaction(transactionHash, obj.blockhash, i, tx);

                // 確認全部できたらTX成功に
                tx.status = TransactionStatus.SUCCESS;
            }

            // DATファイルに保存
            const datResult = await BlockDat.writeLast({
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
            });

            // DATファイルの情報をDBに保存
            await BlocksTbl.insert({
                blockhash: obj.blockhash,
                previousHash: obj.previousHash,
                height: obj.height,
                dat: datResult.nextDatId,
                offset: datResult.offset,
                size: datResult.blockSize
            });

            // ブロックチェーンに追加
            AikaCoin.blockChain.addCompactBlockToChain(new CompactBlock(obj.blockhash, obj.height, obj.previousHash));
        }

        // 内容をそのままネットワークに流す
        if(!obj.isPrivate)
            this.broadcastExcludeNode(remoteAddr, remotePort, AikaCoinOpCode.FOUND_BLOCK_HASH, payload);
    }

    private async onRequestBlocks(remoteAddr: string, remotePort: number, payload: Buffer) {
        // JSONパース
        const obj: IRequestBlocks = JSON.parse(payload.toString("utf-8"));

        // どこのブロックまで知っているのか
        const knowBlock = await BlocksTbl.selectWhereBlockHash(obj.blockhash);

        let knowBlockHeight=0;

        // 取得できたか
        if(knowBlock != null) {
            // どこの高さか
            knowBlockHeight = knowBlock.height;
        }

        // 知っていないブロックのデータを取得
        const blocks = await BlocksTbl.selectWhereBlockHeightAfter(knowBlockHeight);

        let i=0, datCache: {[key: number]: BlockDat} = {};

        // 過去のブロックを送信する
        const loop = setInterval(() => {
            if(i >= blocks.length || blocks[i] == null) {
                this.sendTo(remoteAddr, remotePort, AikaCoinOpCode.END_BLOCKS, Buffer.alloc(1));
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
                this.sendTo(remoteAddr, remotePort, AikaCoinOpCode.FOUND_BLOCK_HASH, Buffer.from(JSON.stringify({
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
                }), "utf-8"));
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
            TransactionStatus.PENDDING,
            -1,
            obj.transactionHash
        ));

        // 他のノードに送信する
        this.broadcastExcludeNode(remoteAddr, remotePort, AikaCoinOpCode.FOUND_BLOCK_HASH, payload);
    }

    private onData(data: Buffer, remoteAddr: string, remotePort: number) {
        // OpCodeを取得
        const opcode = data.readUInt16BE(0);
        // ペイロードを取得
        const payload = data.length > 8 ? data.slice(8) : Buffer.alloc(1);

        console.log(`AikaCoinNetwork.onData: OPCODE: ${opcode}`);

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
                this.onRequestBlocks(remoteAddr, remotePort, payload);
                break;
            // 過去のブロックの情報全部送り終わったらしい
            case AikaCoinOpCode.END_BLOCKS:
                this.emit("END_BLOCKS");
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
    isNodeAddressSelf(address: {nodeId: string, nodeAddress: string, nodePort: number}) {
        // ノードIDが自分
        if(address.nodeId === AikaCoin.config.myNodeId)
            return true;

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
                const ipv6Address = `[${ip.address}]`;
                if((address.nodeAddress === ip.address || address.nodeAddress === ipv6Address) && address.nodePort === this.p2p.port) {
                    return true;
                }
            }
        }

        return false;
    }

    isNodeIPv4AddressSelf(nodeAddress: string): Promise<boolean> {
        return new Promise((resolve) => {
            const tracer = new Traceroute();
            const timeoutTimer = setTimeout(() => {resolve(false)}, 2000);

            const hops: Array<any> = [];

            tracer
            .on("hop", (hop: any) => {
                hops.push(hop);
            })
            .on("close", () => {
                clearTimeout(timeoutTimer);

                if(hops.length <= 0 || hops.length === 1)
                    return resolve(true);
                resolve(false);
            });

            tracer.trace(nodeAddress);
        });
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

    requestPastBlocks(data: IRequestBlocks): Promise<null> {
        return new Promise((resolve) => {
            if(this.p2p.nodes.length === 0)
                return resolve(null);

            // イベント受信
            this.once("END_BLOCKS", () => {
                resolve(null);
            });
            // 送信
            this.broadcast(AikaCoinOpCode.REQUEST_BLOCKS, Buffer.from(JSON.stringify(data), "utf-8"));
        });
    }
}