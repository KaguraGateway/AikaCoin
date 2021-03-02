import { TransactionCommand } from "../../blockchain/interfaces/ITransaction";

export interface INewTransaction {
        /** トランザクションバージョン */
        transactionVersion: number;
        /** 送金先のアドレス */
        to: string;

        /** 送金元の公開鍵 */
        fromPubKey: string;

        /** 量（1以上） */
        amount: number;
        /** 署名 */
        signature: string;

        /** 送金者の取引回数 */
        nonce: number;

        /** トランザクションのコマンド */
        commands: Array<TransactionCommand>;
}