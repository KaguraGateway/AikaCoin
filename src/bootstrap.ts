import cluster from "cluster";
import { AikaCoin } from "./AikaCoin";
import { Worker } from "./cluster/Worker";

export function bootstrap() {
    if(cluster.isWorker) {
        (new Worker()).run();
    } else {
        // メイン
        // AikaCoinシステムを起動
        const aika = new AikaCoin();
        // システムを初期化
        aika.init();
    }
}