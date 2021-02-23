///Reference https://ichi.pro/ma-kurutsuri-to-patorishia-torai-no-jisso-203112718374289

import { HashUtils } from "../utils/HashUtils";
import { ITransaction } from "./interfaces/ITransaction";


export class MerkleTree {
    merkelRoot: Array<Array<ITransaction | string>>;

    constructor() {
        this.merkelRoot = [];
    }

    createTree(transactionList: Array<ITransaction>) {
        this.merkelRoot.unshift(transactionList);
        //this.merkelRoot.unshift(transactionList.map(t => t.transactionHash));

        while(this.merkelRoot[0].length > 1) {
            let temp: Array<string> = [];

            for(let i=0; i < this.merkelRoot[0].length; i+=2) {
                if(i < this.merkelRoot[0].length -1 && i % 2 == 0)
                    //@ts-ignore
                    temp.push(HashUtils.computeSHA256(this.merkelRoot[0][i] + this.merkelRoot[0][i+1]));
                else
                    //@ts-ignore
                    temp.push(this.merkelRoot[0][i]);
            }
            this.merkelRoot.unshift(temp);
        }
    }
}