import { ICompactBlock } from "./interfaces/ICompactBlock";

export class CompactBlock implements ICompactBlock {
    blockHash: string;
    height: number;
    previousHash: string;

    constructor(blockHash: string, height: number, previousHash: string) {
        this.blockHash = blockHash;
        this.height = height;
        this.previousHash = previousHash;
    }
}