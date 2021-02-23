interface IMasterOrderMessage {
    blockHeight: number;
    blockVersion: number;
    previousHash: string;
    merkleRootHash: string;
    timestamp: number;
    difficult: number;
    nonceRanges: Array<number>;
}

interface IMasterMessage {
    blockHeight: number;
    blockVersion: number;
    previousHash: string;
    merkleRootHash: string;
    timestamp: number;
    difficult: number;
    nonce: number;
}
