import EventEmitter from "events";
import { AikaCoin } from "../AikaCoin";
import { SuperHybridUdp, UdpOpcode } from "./udp/UdpService";

export const PeerToPeerOpcode = {
    START_P2P: 0x0,
    ASK_START_P2P: 0x1,
    END_P2P: 0x2,
    ASK_END_P2P: 0x3,
    DATA: 0x4
};
export type PeerToPeerOpcode = typeof PeerToPeerOpcode[keyof typeof PeerToPeerOpcode];

/**
 * AikaP2Pプロトコル
 */
export class PeerToPeerService extends EventEmitter {
    /** Udp Socket */
    socket: SuperHybridUdp;
    /** 待受ポート番号 */
    port: number;

    readonly sentPingSpan = 5000;


    /** 接続先のノード value: `node://${ID}@${IP}:${PORT}`  */
    nodes: Array<string> = [];

    constructor(port: number) {
        super();

        this.port = port;
        this.socket = new SuperHybridUdp(port);

        // イベント登録
        this.socket.addListener("data", this.onMessage.bind(this));
    }

    private pingCycle() {
        for(const node of this.nodes) {
            // アドレスを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
            // 取得失敗？
            if(address == null)
                continue;

            // PINGを送信する
            this.socket.ping(address.nodeAddress, address.nodePort);
        }

        // 次のサイクルを準備
        setTimeout(this.pingCycle.bind(this), this.sentPingSpan);
    }

    private onMessage(data: Buffer, remoteAddr: string, remotePort: number) {
        // ヘッダー部分を取り出す
        const protocolVer = data.readUInt16BE(0);
        const opCode = data.readUInt8(2);
        const payload = data.slice(4);

        switch(opCode) {
            case PeerToPeerOpcode.DATA:
                this.emit("data", payload, remoteAddr, remotePort);
                break;


            case PeerToPeerOpcode.START_P2P:
                const nodeId = payload.toString("utf-8");
                AikaCoin.systemLogger.info(`[Request] Start P2P from ${remoteAddr}:${remotePort} (NodeID: ${nodeId})`);

                if(AikaCoin.protocolVersion === protocolVer && nodeId === AikaCoin.config.myNodeId) {
                    // PINGコマンド
                    this.socket.ping(remoteAddr, remotePort);
                    // P2P通信を始めましょうコマンド
                    this.sendTo(remoteAddr, remotePort, PeerToPeerOpcode.ASK_START_P2P, Buffer.from(AikaCoin.config.myNodeId, "utf-8"));
                    // ノードアドレスに変換
                    const nodeAddress = PeerToPeerService.getNodeURIFormat(nodeId, remoteAddr, remotePort);
                    // 接続リストに追加
                    this.nodes.push(nodeAddress);
                }
                break;
            case PeerToPeerOpcode.ASK_START_P2P:
                if(AikaCoin.protocolVersion === protocolVer)
                    this.emit("start_p2p", remoteAddr, remotePort, payload.toString("utf-8"));
                break;


            case PeerToPeerOpcode.END_P2P:
                if(AikaCoin.protocolVersion === protocolVer)
                    this.sendTo(remoteAddr, remotePort, PeerToPeerOpcode.ASK_END_P2P);
                break;
        }
    }

    /**
     * 通信を受け取れるようにする（サーバー機能を起動する）
     */
    startSocket() {
        // ソケットを開く
        this.socket.start();

        // PINGサイクル
        this.pingCycle();
    }

    /**
     * 特定のノードをP2P通信を開始する
     */
    async startP2P(nodeId: string, nodeAddress: string, nodePort: number) {
        return new Promise((resolve, reject) => {
            // タイムアウト
            const timeoutTimer = setTimeout(() => { resolve("TIMEOUT") }, 5000);

            // イベント登録
            const eventFuc = (remoteAddr: string, remotePort: number, responseNodeId: string) => {
                AikaCoin.systemLogger.info(`Resoponse StartP2P: ${remoteAddr} ${remotePort} (NodeId: ${responseNodeId})`);

                if(responseNodeId === nodeId) {
                    // ノードURL
                    const nodeURI = PeerToPeerService.getNodeURIFormat(nodeId, nodeAddress, nodePort);
                    // ノードリストに追加
                    this.nodes.push(nodeURI);
                    // イベント登録を削除
                    this.removeListener("start_p2p", eventFuc);
                    // タイマー解除
                    clearTimeout(timeoutTimer);

                    resolve(nodeURI);
                }
            };
            this.addListener("start_p2p", eventFuc);

            // ダミーデータ
            this.socket.ping(nodeAddress, nodePort);
            // 送信する
            this.sendTo(nodeAddress, nodePort, PeerToPeerOpcode.START_P2P, Buffer.from(nodeId, "utf-8"));
        });
    }

    /** P2Pネットワーク全体に送信する */
    broadcast(opcode: PeerToPeerOpcode, payload?: Buffer) {
        for(const node of this.nodes) {
            // Nodeアドレスを取得
            const address = PeerToPeerService.getNodeAddressFromNodeURIFormat(node);
            // 取得失敗したら無視
            if(address == null)
                continue;
            // 送信
            this.sendTo(address.nodeAddress, address.nodePort, opcode, payload);
        }
    }

    /** 特定のノードに送信する */
    sendTo(toAddress: string, toPort: number, opcode: PeerToPeerOpcode, payload?: Buffer) {
        // ヘッダー部分
        const basicHeaderBuf = Buffer.alloc(4);
        // プロトコルバージョンを書き込む
        basicHeaderBuf.writeUInt16BE(AikaCoin.protocolVersion, 0);
        // オペレーションコードを書き込む
        basicHeaderBuf.writeUInt8(opcode, 2);

        // 全部盛りのヘッダー
        const bagBuff = payload == null ? basicHeaderBuf : Buffer.concat([basicHeaderBuf, payload]);

        // 送信する
        this.socket.sendTo(toAddress, toPort, UdpOpcode.SEND_DATA, bagBuff);
    }
    /** 特定のノードにデータ送信する */
    sendToData(toAddress: string, toPort: number, payload: Buffer) {
        return this.sendTo(toAddress, toPort, PeerToPeerOpcode.DATA, payload);
    }

    static getNodeURIFormat(nodeId: string, nodeAddress: string, nodePort: number) {
        return `node://${nodeId}@${nodeAddress}:${nodePort}`;
    }
    static getNodeAddressFromNodeURIFormat(nodeURI: string) {
        // 分割
        const nodeMatch = nodeURI.match(/^node:\/\/(.*?)@(.*?):([\d]{5})$/);
        if(nodeMatch == null)
            return null;
        // ID取得
        const nodeId = nodeMatch[1];
        // IP取得
        const nodeAddress = nodeMatch[2];
        // ポート番号取得
        const nodePort = Number(nodeMatch[3]);

        return {nodeId, nodeAddress, nodePort};
    }
}