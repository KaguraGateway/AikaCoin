interface ITransactionIndexInfo {
    index: number;
    hash: string;
}

/** 配列の中身はトランザクションを含むブロックのハッシュ */
export type ITransactionIndex = Array<ITransactionIndexInfo>;

