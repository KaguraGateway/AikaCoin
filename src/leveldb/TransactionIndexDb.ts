import { LevelUpChain } from "levelup";
import { AikaCoin } from "../AikaCoin";
import { ITransaction } from "../blockchain/interfaces/ITransaction";
import { Transaction } from "../blockchain/Transaction";
import { ITransactionIndex } from "./ITransactionIndex";
import { LevelDb } from "./LevelDb";


/**
 * トランザクションハッシュとブロックハッシュが１：１になっている
 * TransactionId : [BlockHash]
 */
export class TransactionIndexDb extends LevelDb {
    async putTransactionForBatch(batch: LevelUpChain<any, any>, transactionHash: string, blockHash: string, blockTxIndex: number, transaction: ITransaction) {
        // トランザクションがすでに存在するか
        const includes = await this.getBlockHashIncludeTransaction(transactionHash);

        // indexInfo
        const indexInfo = {index: blockTxIndex, hash: blockHash};

        // 存在しない
        if(includes == null) {
            return batch.put(transactionHash, JSON.stringify([ indexInfo ]));
        }

        // Indexの中にあるか検索
        const isIncluded = includes.some(v => {
            return v.hash === blockHash && v.index === blockTxIndex;
        });

        // 内容変更していないのに処理している
        // 無駄な処理（後に要修正）
        if(isIncluded)
            return batch.put(transactionHash, JSON.stringify(includes));

        includes.push(indexInfo);

        return batch.put(transactionHash, JSON.stringify(includes));
    }
    async putTransaction(transactionHash: string, blockHash: string, blockTxIndex: number, transaction: ITransaction) {
        // トランザクションがすでに存在するか
        const includes = await this.getBlockHashIncludeTransaction(transactionHash);

        // indexInfo
        const indexInfo = {index: blockTxIndex, hash: blockHash};

        // 存在しない
        if(includes == null) {
            return await AikaCoin.txIndex.put(transactionHash, JSON.stringify([ indexInfo ]));
        }

        // Indexの中にあるか検索
        const isIncluded = includes.some(v => {
            return v.hash === blockHash && v.index === blockTxIndex;
        });

        // 既に含まれてた
        if(isIncluded)
            return;

        includes.push(indexInfo);

        return await AikaCoin.txIndex.put(transactionHash, JSON.stringify(includes));
    }

    async getBlockHashIncludeTransaction(transactionHash: string): Promise<ITransactionIndex | null> {
        try {
            return JSON.parse((await (this.get(transactionHash))));
        } catch(e) {
            return null;
        }
    }
}