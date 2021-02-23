import { AikaCoin } from "../AikaCoin";
import { HashUtils } from "../utils/HashUtils";
import { PemUtils } from "../utils/PemUtils";
import { SignUtils } from "../utils/SignUtils";
import { Wallet } from "../Wallet";
import { ITransaction } from "./interfaces/ITransaction";

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

    constructor(to: string, from: string, fromPubKey: string, amount: number, signature: string) {
        this.to = to;
        this.from = from;
        this.fromPubKey = fromPubKey;
        this.amount = amount;
        this.signature = signature;
    }

    static createNewTransaction(to: string, from: string, fromPubKey: string, amount: number, privateKey: string, privateKeyPassword: string) {
        // publicKeyをpemからただのstringに
        fromPubKey = PemUtils.getPublicKeyFromPem(fromPubKey);

        const transactionHash = HashUtils.computeSHA256(this.transactionVersion + to + from + fromPubKey + amount);
        let signature: string = "";

        if(privateKey != null && privateKey.length > 0)
            signature = SignUtils.signHex(transactionHash, privateKey, privateKeyPassword);

        return new Transaction(to, from, fromPubKey, amount, signature);
    }
}