// Reference
// https://ichi.pro/ma-kurutsuri-to-patorishia-torai-no-jisso-203112718374289
// https://gist.github.com/kashishkhullar/315c5d4b9b10b310cbbba8dc2da9f252#file-merkeltree-js

import { HashUtils } from "./HashUtils";


export class MerkleTree {
    root: Array<Array<any>> = [];

    createTree(list: Array<any>) {
        this.root.unshift(list);

        while(this.root[0].length > 1) {
            const temp = [];

            for(let i=0; i < this.root[0].length; i += 2) {
                if(i < (this.root[0].length - 1) && i % 2 == 0)
                    temp.push(HashUtils.computeSHA256(this.root[0][i] + this.root[0][i + 1]));
                else
                    temp.push(this.root[0][i]);
            }
            this.root.unshift(temp);
        }

        return this.root[0][0];
    }

}