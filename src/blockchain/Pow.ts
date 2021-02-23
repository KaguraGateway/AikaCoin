import { AikaCoin } from "../AikaCoin";
import { BlockChain } from "./BlockChain";

export class Pow {
    private static readonly coinBaseAmount = 1000;

    static getCoinBaseAmount(blockHeight: number) {
        return this.coinBaseAmount >> (blockHeight / 50000);
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
        if(AikaCoin.blockChain.nextBlockHeight > (currentBlockHeight + 1)) {
            return true;
        }

        return false;
    }
}