var { PeerToPeerService, PeerToPeerServiceOpcode } = require("../build/p2p/PeerToPeerService");

const ports = [65300,65301,65302,65303,65304];
const nodes = [];

// P2Pサーバーを起動
for(const port of ports) {
    const a = new PeerToPeerService(port);
    a.startSocket();
    nodes.push(a);
}

// P2P通信ネットワークを張る
for(const node of nodes) {
    for(const port of ports) {
        if(node.port !== port) {
            node.startP2P("::1", port);

            node.on("data", (data) => {
                console.log(data.toString("utf-8"));
            });
        }
    }
}

setInterval(() => {
    nodes[0].broadcast(PeerToPeerServiceOpcode.DATA, Buffer.from("BOKAN"));
}, 500);