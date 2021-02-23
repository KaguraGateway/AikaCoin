import { ITransaction } from "../../blockchain/interfaces/ITransaction";

export interface IFoundBlockHash {
    /** この情報をP2Pネットワーク全体に流さない */
    isPrivate?: boolean;

    blockVersion: number;
    blockhash: string;
    height: number;
    timestamp: number;
    difficult: number;
    nonce: number;
    previousHash: string;
    merkleRootHash: string;
    miner: string;
    transactions: Array<ITransaction>
}