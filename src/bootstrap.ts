import cluster from "cluster";
import { AikaCoin } from "./AikaCoin";
import { Worker } from "./cluster/Worker";
import { app } from "electron";

process.on("uncaughtException", (err) => {
    console.error(err);
});
process.on("unhandledRejection", (reason) => {
    console.error(reason);
});


function handleStartupEvent() {
    if(process.platform !== "win32") {
        return false;
    }

    switch(process.argv[1]) {
        case '--squirrel-install':
        case '--squirrel-updated':
            app.quit();
            return true;
        case '--squirrel-uninstall':
            app.quit();
            return true;
        case '--squirrel-obsolete':
            app.quit();
            return  true;
    }
}


export function bootstrap() {
    if(cluster.isWorker) {
        (new Worker()).run();
    } else {
        // nogui パラメータがついていないならElectron
        if(app != null && (process.argv.length <= 2 || process.argv[2] !== "nogui")) {
            //  Windows 系の場合はインストール時に複数回起動するためそれを避ける
            if(handleStartupEvent()) {
                process.exit(0);
            }

            // 複数起動防止
            const isInstanceLock = app.requestSingleInstanceLock();
            if(!isInstanceLock) {
                app.quit();
                process.exit(0);
            }

            // Application ID（package.jsonのappIdと同じである必要）
            if(process.platform === 'win32')
                app.setAppUserModelId('kaguragateway.aikacoin');

            app.whenReady()
            .then(() => {
            });
        }

        // メイン
        // AikaCoinシステムを起動
        const aika = new AikaCoin();
        // システムを初期化
        aika.init();
    }
}

bootstrap();