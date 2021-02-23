import EventEmitter from "events";
import { AikaCoin } from "../AikaCoin";
import { SuperHybridUdp, UdpOpcode } from "./udp/UdpService";

export const PeerToPeerOpcode = {
    START_P2P: 0x0,
    ASK_START_P2P: 0x1,
    END_P2P: 0x2,
    ASK_END_P2P: 0x3,
    PING: 0x4,
    PONG: 0x5,
    DATA: 0x6
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


    /** 接続先のノード value: `node://${IP}:${PORT}`  */
    nodes: Array<string> = [];

    constructor(port: number) {
        super();

        this.port = port;
        this.socket = new SuperHybridUdp(port);

        // イベント登録
        this.socket.addListener("data", this.onMessage.bind(this));
    }

    private onMessage(data: Buffer, remoteAddr: string, remotePort: number) {
        // ヘッダー部分を取り出す
        const protocolVer = data.readUInt16BE(0);
        const opCode = data.readUInt8(2);

        console.log(`P2P protocolVer: ${protocolVer}, opcode: ${opCode}`);

        switch(opCode) {
            case PeerToPeerOpcode.START_P2P:
                if(AikaCoin.protocolVersion === protocolVer)
                    this.sendTo(remoteAddr, remotePort, PeerToPeerOpcode.ASK_START_P2P);
                break;
            case PeerToPeerOpcode.ASK_START_P2P:
                if(AikaCoin.protocolVersion === protocolVer)
                    this.emit("start_p2p", remoteAddr, remotePort);
                break;
            case PeerToPeerOpcode.START_P2P:
                if(AikaCoin.protocolVersion === protocolVer)
                    this.sendTo(remoteAddr, remotePort, PeerToPeerOpcode.ASK_END_P2P);
                break;
            case PeerToPeerOpcode.DATA:
                this.emit("data", data.slice(4), remoteAddr, remotePort);
                break;
        }
    }

    /**
     * 通信を受け取れるようにする（サーバー機能を起動する）
     */
    startSocket() {
        this.socket.start();
    }

    /**
     * 特定のノードをP2P通信を開始する
     */
    async startP2P(nodeAddress: string, nodePort: number) {
        return new Promise((resolve, reject) => {
            // イベント登録
            const eventFuc = (remoteAddr: string, remotePort: number) => {console.log(remoteAddr, remotePort);
                if(nodeAddress === remoteAddr && nodePort === remotePort) {
                    // ノードURL
                    const nodeURI = PeerToPeerService.getNodeURIFormat(nodeAddress, nodePort);
                    // ノードリストに追加
                    this.nodes.push(nodeURI);
                    // イベント登録を削除
                    this.removeListener("start_p2p", eventFuc);

                    resolve(nodeURI);
                }
            };
            this.addListener("start_p2p", eventFuc);

            // ダミーデータ
            this.socket.ping(nodeAddress, nodePort);
            // 送信する
            this.sendTo(nodeAddress, nodePort, PeerToPeerOpcode.START_P2P);
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

    static getNodeURIFormat(nodeAddress: string, nodePort: number) {
        return `node://${nodeAddress}:${nodePort}`;
    }
    static getNodeAddressFromNodeURIFormat(nodeURI: string) {
        // 分割
        const nodeMatch = nodeURI.match(/^node:\/\/(.*?):([\d]{5})$/);console.log(nodeMatch);
        if(nodeMatch == null)
            return null;
        // IP取得
        const nodeAddress = nodeMatch[1];
        // ポート番号取得
        const nodePort = Number(nodeMatch[2]);

        return {nodeAddress, nodePort};
    }
}