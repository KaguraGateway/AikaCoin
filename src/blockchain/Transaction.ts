import { AikaCoin } from "../AikaCoin";
import { WalletTbl } from "../sql/sqlite/WalletTbl";
import { HashUtils } from "../utils/HashUtils";
import { PemUtils } from "../utils/PemUtils";
import { SignUtils } from "../utils/SignUtils";
import { Wallet } from "../Wallet";
import { ITransaction, TransactionCommand, TransactionStatus } from "./interfaces/ITransaction";

export class Transaction implements ITransaction {
    /** トランザクションバージョン */
    static readonly transactionVersion: number = 1;
    /** トランザクションバージョン */
    transactionVersion: number = Transaction.transactionVersion;

    to: string;
    from: string;
    fromPubKey: string;
    amount: number;
    signature: string;
    commands: TransactionCommand[];
    nonce: number;
    status: TransactionStatus;
    fee: number;
    transactionHash: string = "";

    constructor(to: string, from: string, fromPubKey: string, amount: number, signature: string, commands: TransactionCommand[], nonce: number, status: TransactionStatus, fee: number, transactionHash: string) {
        this.to = to;
        this.from = from;
        this.fromPubKey = fromPubKey;
        this.amount = amount;
        this.signature = signature;
        this.commands = commands;
        this.nonce = nonce;
        this.status = status;
        this.fee = fee;
        this.transactionHash = transactionHash;
    }

    static createNewTransaction(to: string, from: string, fromPubKey: string, amount: number, commands: TransactionCommand[], nonce: number, privateKey: string, privateKeyPassword: string) {
        // publicKeyをpemからただのstringに
        fromPubKey = PemUtils.getRawPublicKeyFromPem(fromPubKey);

        const transactionHash = this.getTransactionHash(this.transactionVersion, to, from, fromPubKey, amount, nonce);
        let signature: string = "";

        if(privateKey != null && privateKey.length > 0)
            signature = SignUtils.signHex(transactionHash, privateKey, privateKeyPassword);

        return new Transaction(to, from, fromPubKey, amount, signature, commands, nonce, TransactionStatus.PENDDING, -1, transactionHash);
    }

    static getTransactionHash(version: number, to: string, from: string, fromPubKey: string, amount: number, nonce: number) {
        return HashUtils.computeSHA256(version + to + from + fromPubKey + amount + nonce);
    }

    /**
     * コマンドを処理する
     * @param transaction
     */
    static async processCommands(transaction: ITransaction) {
        // コマンドを処理
        for(const cmd of transaction.commands) {
            switch(cmd) {
                case TransactionCommand.CREATE_WALLET:
                    // データベースにウォレットを登録する
                    await WalletTbl.insert({
                        address: transaction.from,
                        pubkey: transaction.fromPubKey,
                        balance: 0,
                        nonce: 0,
                        status: "active"
                    });
                    console.log(transaction.from);
                    break;
            }
        }
    }
}