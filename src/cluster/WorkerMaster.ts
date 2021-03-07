import cluster from "cluster";
import { Server, Socket } from "net";
import { AikaCoin } from "../AikaCoin";
import { Pow } from "../blockchain/Pow";

export class WorkerMaster {
    static isForceKill = false;
    static workerTimers: Array<NodeJS.Timeout> = [];

    static reset() {
        this.isForceKill = false;

        for(const workerTime of this.workerTimers) {
            clearInterval(workerTime);
        }

        this.workerTimers = [];
    }

    static forceKill() {
        this.isForceKill = true;
    }

    static computeSelfHash(message: IMasterOrderMessage): Promise<IWorkerMessage | null> {
        return new Promise((resolve, reject) => {
            // 初期化
            this.reset();

            // プロセスリスト
            const workers: Array<cluster.Worker> = [];

            // 変数として用意
            const { blockHeight, blockVersion, previousHash, merkleRootHash, timestamp, difficult } = message;

            // 先に他の人が終了させないか確認する
            this.workerTimers.push(setInterval(() => {
                if(this.isForceKill || Pow.isOthersCompletedFirst(blockHeight)) {
                    AikaCoin.miningLogger.info(`[Job Not Found]: Others Completed`);
                    for(const worker of workers) {
                        worker.process.kill();
                    }

                    resolve(null);
                }
            }, 1000));

            // ノンスの分だけプロセスを起動する
            for(const nonce of message.nonceRanges) {
                // worker起動
                const worker = cluster.fork();
                // プロセスリストに追加
                workers.push(worker);
                // 送信するメッセージ
                const sendMsg: IMasterMessage = {  blockHeight, blockVersion, previousHash, merkleRootHash, timestamp, difficult, nonce };
                // 起動完了待ち
                worker.once("online", () => {
                    // 開始
                    worker.send(sendMsg);
                });
                worker.once("error", (err) => {
                    console.error(err);
                });
            }

            const onMessage = (worker: cluster.Worker, message: IWorkerMessage, handle: Socket | Server) => {
                // IDをすべて配列にして取得する
                const workerIds = workers.map((value) => value.id);

                // WorkerIDsに workerがなければ弾く
                if(!workerIds.includes(worker.id))
                    return;

                // 見つかったら他のプロセスをすべて終了させる
                workers.forEach((value) => {
                    if(value.id !== worker.id) {
                        value.process.kill();
                    }
                });
                // リセット
                this.reset();
                // イベント解除
                cluster.removeListener("message", onMessage);
                // 終了
                resolve(message);
            };
            // イベント登録
            cluster.addListener("message", onMessage);
        });
    }
}