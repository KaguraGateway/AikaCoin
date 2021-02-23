import { createSocket, Socket } from "dgram";
import os from "os";
import { ISsdpHeader, SsdpHeader } from "./SsdpHeader";
import ip from "ip";

// Reference
// https://github.com/diversario/node-ssdp/blob/master/lib/client.js
// https://github.com/bazwilliams/node-ssdp/blob/master/index.js
// https://github.com/nodejs/node-v0.x-archive/issues/4944#issuecomment-16528739

export class Ssdp {
    private host = "239.255.255.250";
    private port = 1900;

    udpSocket: Socket;

    constructor() {
        this.udpSocket = createSocket({type: "udp4", reuseAddr: true}, (msg, rinfo) => {
            console.log("udpSocket");
            console.log(msg.toString("ascii"), rinfo);
        });
        this.udpSocket.bind(this.port, '0.0.0.0', () => {
            this.udpSocket.addMembership(this.host, ip.address(undefined, "ipv4"));
        });
    }

    async search(serviceType: string) {
        const header = new SsdpHeader("M-SEARCH", {
            HOST: `${this.host}:${this.port}`,
            ST: serviceType,
            MAN: '"ssdp:discover"',
            MX: 5
        });

        this.send(header);
    }

    private async send(message: SsdpHeader) {
        const listenerSocket = createSocket({type: "udp4", reuseAddr: true}, (msg, rinfo) => {
            console.log(msg, rinfo);
        });
        const requesterSocket = createSocket({type: "udp4", reuseAddr: true}, (msg, rinfo) => {
            console.log(msg, rinfo);
        });

        // メッセージをバッファ化
        console.log(message.toString());
        const buf = Buffer.from(message.toString(), "ascii");

        listenerSocket.on("listening", () => {
            requesterSocket.send(buf, 0, buf.length, this.port, this.host, (err, bytes) => {
                console.log(err, bytes);
            });
        });
        requesterSocket.on("message", (msg, rinfo) => {
            console.log("requesterSocket");
            console.log(msg.toString("ascii"), rinfo);
        });
        listenerSocket.on("message", (msg, rinfo) => {
            console.log("listenerSocket");
            console.log(msg.toString("ascii"), rinfo);
        });
        requesterSocket.on("listening", () => {
            listenerSocket.bind(requesterSocket.address().port);
        });

        requesterSocket.bind(undefined, ip.address());
    }
}