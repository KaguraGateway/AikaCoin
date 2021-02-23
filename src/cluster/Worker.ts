import { Block } from "../blockchain/Block";
import cluster from "cluster";

export class Worker {
    run() {
        process.once("message", (message: IMasterMessage) => {
            if(process.send == null) {
                console.error("Fatal: process.send is null.");
                return;
            }

            // ハッシュを計算する部分
            const {selfHash, nonce} = Block.computeSelfHashBlock(message);

            // 値を返す
            process.send({selfHash, nonce});
            // お仕事終了
            cluster.worker.disconnect();
            cluster.worker.kill();
        });
    }
}