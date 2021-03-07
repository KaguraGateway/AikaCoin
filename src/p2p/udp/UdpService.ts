import { typeCheckUtils } from "@kaguragateway/y-node-utils";
import dgram, { RemoteInfo } from "dgram";
import EventEmitter from "events";
import { AikaCoin } from "../../AikaCoin";

export const UdpOpcode = {
    SEND_DATA: 0x1,
    RECEIVE_DATA: 0x2,
    CONFIRM_RECEIVE_DATA: 0x3,
    PING: 0x4,
    PONG: 0x5
};
export type UdpOpcode = typeof UdpOpcode[keyof typeof UdpOpcode];

interface DataHistory {
    // リモートアドレス:リモートポート番号
    [key: string]: {
        lastDataId: number;
        sizes: Array<number> // ArrayID = DataID, value=DataSize
    }
}

/**
 * AikaUdp Protocol
 */
export class SuperHybridUdp extends EventEmitter {
    private readonly defaultProtocolVer: number = 1;
    // ヘッダー部分の長さ
    // ヘッダーバッファの仕様を変えた場合は注意
    private readonly headerBufferLength: number = 16;

    private port: number;

    // IPv4用
    private socketv4: dgram.Socket;
    // IPv6用
    private socketv6: dgram.Socket;

    /**
     * Newするとソケットが生成されます
     */
    constructor(port: number) {
        super();

        this.port = port;

        // ソケットを生成
        // IPv4
        this.socketv4 = dgram.createSocket("udp4");
        // IPv6
        this.socketv6 = dgram.createSocket("udp6");

        // イベント登録
        // リスニング
        this.socketv4.on("listening", this.onListeningv4.bind(this));
        this.socketv6.on("listening", this.onListeningv6.bind(this));
        // メッセージ
        this.socketv4.on("message", this.onMessageCommon.bind(this));
        this.socketv6.on("message", this.onMessageCommon.bind(this));
    }

    start() {
        this.socketv4.bind(this.port);
        this.socketv6.bind(this.port);
    }

    private onListeningv4() {
        const address = this.socketv4.address();
        AikaCoin.systemLogger.info(`UDP Socket listening on: ${address.address}:${address.port} (${address.family})`);
    }
    private onListeningv6() {
        const address = this.socketv6.address();
        AikaCoin.systemLogger.info(`UDP Socket listening on: ${address.address}:${address.port} (${address.family})`);
    }

    private onMessageCommon(buf: Buffer, remote: RemoteInfo) {
        //console.log(`onMessage: ${remote.address}:${remote.port} (${remote.family})`);
        // 送られてきたアドレス
        const remoteAddr = remote.address;
        const remotePort = remote.port;

        // 0バイト目（通信プロトコルバージョンとOPCODE）を読み取る
        const firstByte = buf.readInt8(0);
        // 通信プロトコルバージョンを受け取る
        const protocolVer = (firstByte & 0xF0) >> 4;
        // OPCODEを読み取る
        const opcode = firstByte & 0x0F;

        // console.log(`protocol Ver: ${protocolVer}, opcode: ${opcode}`);
        // console.log(`size: ${buf.length}`);
        // console.log(buf);

        switch(opcode) {
            // Data
            case UdpOpcode.SEND_DATA:
                // ペイロードを取得
                const payload = buf.slice(this.headerBufferLength, buf.length);
                // イベント発火
                this.emit("data", payload, remoteAddr, remotePort);

                break;

            // PING
            case UdpOpcode.PING:
                // PONG返す
                this.pong(remoteAddr, remotePort);
                break;

            // PONG
            case UdpOpcode.PONG:
                this.emit("pong");
                break;
        }
    }

    ping(toAddress: string, toPort: number) {
        return this.sendTo(toAddress, toPort, UdpOpcode.PING);
    }
    pong(toAddress: string, toPort: number) {
        return this.sendTo(toAddress, toPort, UdpOpcode.PONG);
    }

    sendTo(toAddress: string, toPort: number, opcode: UdpOpcode, payload?: Buffer, addHeaderBuf?: Buffer) {
        if(payload != null && payload.length > 65535)
            throw new Error(`Payload Length Longer 65535. ${payload.length}`);

        // IPv4かIPv6か取得する
        const isFamily = typeCheckUtils.isIPv4orIPv6(toAddress);
        // 無効なIPなら弾く
        if(isFamily === "invalid")
            throw new Error(`Invalid IPAddress ${toAddress}`);

        // 合ったソケットを取得する
        const socket = isFamily === "ipv6" ? this.socketv6 : this.socketv4;


        // ヒストリーの初期化
        // if(this.sendDataHistory[`${toAddress}:${toPort}`] == null)
        //     this.sendDataHistory[`${toAddress}:${toPort}`] = {lastDataId: 0, sizes: []};


        // ヘッダー部分
        const basicHeaderBuf = Buffer.alloc(16);
        // プロトコルバージョンを書き込む
        const headProtocolVer = this.defaultProtocolVer << 4;
        // 書き込む
        basicHeaderBuf.writeInt8(headProtocolVer + opcode);

        // OPCODE 0x2（データ送信）のときはデータIDとデータサイズを送信
        // if(opcode === UdpServiceOpcode.SEND_DATA && payload != null) {
        //     // データID
        //     basicHeaderBuf.writeUInt32BE((this.sendDataHistory[`${toAddress}:${toPort}`].lastDataId));
        //     // データサイズ
        //     basicHeaderBuf.writeUInt32BE(payload.length);
        // }

        // ヘッダー部分全部入りヘッダー
        const headerBuf = addHeaderBuf != null ? this.concatHeaderBuf(basicHeaderBuf, addHeaderBuf) : basicHeaderBuf;

        // 全部盛りのバッファ
        let sendBuf: Buffer;
        if(payload == null)
            sendBuf = headerBuf;
        else
            sendBuf = Buffer.concat([headerBuf, payload]);

        // ヒストリーを更新
        // this.sendDataHistory[`${toAddress}:${toPort}`].lastDataId++;
        // this.sendDataHistory[`${toAddress}:${toPort}`].sizes.push((payload != null ? payload.length : 0));

        // 送信する
        try {
            socket.send(sendBuf, toPort, toAddress);
        } catch(e) {
            // this.sendDataHistory[`${toAddress}:${toPort}`].lastDataId--;
            // this.sendDataHistory[`${toAddress}:${toPort}`].sizes.pop();

            throw e;
        }
    }

    private concatHeaderBuf(headerBuf: Buffer, addHeaderBuf: Buffer) {
        if(headerBuf.length !== 16 || addHeaderBuf.length > 8)
            throw new Error(`Invalid HeaderBuffer Size.\nheaderBuf.length: ${headerBuf.length}, addHeaderBuf.length: ${addHeaderBuf.length}`);

        // ヘッダーバッファの仕様を変えた場合は注意
        for(let i=9; i < headerBuf.length; i++) {
            headerBuf[i] = addHeaderBuf[i-9];
        }

        return headerBuf;
    }
}