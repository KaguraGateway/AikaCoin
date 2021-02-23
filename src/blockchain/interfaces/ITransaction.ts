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
}