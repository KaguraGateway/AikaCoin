import { AikaCoin } from "../AikaCoin";
import { BlockChain } from "./BlockChain";
import { ITransaction } from "./interfaces/ITransaction";

export class Pow {
    /**
     * コインベースの報酬の初期値
     * 注意：BANAIK単位
     */
    private static readonly coinBaseAmount = 1000000000;

    static getCoinBaseAmount(blockHeight: number) {
        return Math.floor(this.coinBaseAmount * ((1/2)**((blockHeight-1)/10000))) + 1000;
    }

    /**
     * トランザクション手数料の合計を計算する
     */
    static getTransactionsFeeTotal(transactions: Array<ITransaction>) {
        let fees = 0;

        for(const tx of transactions) {
            fees += tx.fee;
        }

        return fees;
    }

    static getNextWorkDifficult(blockHeight: number) {
        // 1000ブロック毎に見直す
        if((blockHeight % 1000) === 0) {
            
        }
    }

    static checkProofOfWork(hash: string, difficult: number) {
        if(hash.length < 64)
            return false;

        const hashBegin = hash.slice(0, difficult);

        // ゼロの数
        let zeroBits=0;
        // 先頭からのゼロの数を数える
        for(let i=0; i < hashBegin.length; ++i) {
            if(hashBegin[i] === "0") {
                zeroBits++;
            }
        }
        // 先頭からのゼロの数と難易度が合っているか
        if(zeroBits === difficult)
            return true;

        return false;
    }

    /**
     * すでに他の人が完了させていないか？
     * これはメインプロセスでしか動作しない
     */
    static isOthersCompletedFirst(currentBlockHeight: number) {
        if(AikaCoin.blockChain.getLastBlockHeight() > currentBlockHeight) {
            return true;
        }

        return false;
    }
}