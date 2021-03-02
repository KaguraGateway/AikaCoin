export interface ITransaction {
    /** トランザクションバージョン */
    transactionVersion: number;
    /** 送金先のアドレス */
    to: string;

    /** 送金元のアドレス */
    from: string;
    /** 送金元の公開鍵 */
    fromPubKey: string;

    /** 量（1以上） */
    amount: number;
    /** 署名 */
    signature: string;

    /** 送金者の取引回数 */
    nonce: number;

    /** トランザクションの状態 */
    status: TransactionStatus;

    /** トランザクションのコマンド */
    commands: Array<TransactionCommand>;
}



export const TransactionStatus = {
    PENDDING: 0,
    SUCCESS: 1,
    REJECT: 2
};
export type TransactionStatus = typeof TransactionStatus[keyof typeof TransactionStatus];



export const TransactionCommand = {
    CREATE_WALLET: 0x0
};
export type TransactionCommand = typeof TransactionCommand[keyof typeof TransactionCommand];