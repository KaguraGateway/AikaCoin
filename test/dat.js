const { BlockDat } = require("../build/dat/BlockDat");

const dat = new BlockDat("./test/1.dat");

const result1 = dat.write({
    blockVersion: 1,
    blockhash: "000000cde7da16bff8a25e5411c1cad5a93193d0859e9064655cd399e03bdd6b",
    height: 1,
    timestamp: 1613799619,
    difficult: 6,
    nonce: -9007199247024231,
    previousHash: "0000007cedc37cdf54a2f076bacb7751169ff47da16c0fd4e124dd681a4a45de",
    merkleRootHash: "000000b72a5d849df30b432bcf24983a808156e8e9699e2c15b1d90a95dbe4bf",
    stateRootHash: "000000b72a5d849df30b432bcf24983a808156e8e9699e2c15b1d90a95dbe4bf",
    miner: "$0x$ceff9bda5487b6a2121c85a851038f48236900d8",
    transactions: []
}, 0);

console.log(result1.offset, result1.blockSize);

const result2 = dat.write({
    blockVersion: 1,
    blockhash: "000000e8b4701d2b468fad4c57d11459dcdc9af3c663a19262aa0d95f9f9bd7c",
    height: 2,
    timestamp: 1613799657,
    difficult: 6,
    nonce: 4503599628983341,
    previousHash: "0000007cedc37cdf54a2f076bacb7751169ff47da16c0fd4e124dd681a4a45de",
    merkleRootHash: "000000b72a5d849df30b432bcf24983a808156e8e9699e2c15b1d90a95dbe4bf",
    stateRootHash: "000000b72a5d849df30b432bcf24983a808156e8e9699e2c15b1d90a95dbe4bf",
    miner: "$0x$ceff9bda5487b6a2121c85a851038f48236900d8",
    transactions: [
        {
            transactionVersion: 1,
            to: "$0x$ceff9bda5487b6a2121c85a851038f48236900d8",
            from: "$0x$ceff9bda5487b6a2121c85a851038f48236900d8",
            fromPubKey: "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAENEXC+JV1ekF2ExqU56fyADO/gDIuC+r8TSagPI2oNn7Jrq7Jg+UV13YHtw3wHeP3roFF2+PSUj5xsX2yi7JS5g==",
            amount: 1000,
            signature: "304502205cc3cb15055da643c4992ab8c4b653f0d95557e23a533d4f1e543c6e5285e9bc022100fbb229d45ae2bad0794a30067c5d628f2b50b5bc61f9b27f94320ca0858198ae",
            commands: [
                0x0
            ]
        }
    ]
}, (result1.offset+result1.blockSize));

console.log(result2.offset, result2.blockSize);

dat.save();

console.log(dat.read(result1.offset));

const read2 = dat.read(result2.offset);
console.log(read2);

// for(const tx of read2.transactions) {
//     for(const cmd of tx.commands) {
//         console.log(cmd);
//     }
// }

// const dat = new BlockDat("C:\\Users\\yuchan\\.AikaCoinTest\\blocks\\0.dat");
// console.log(dat.read(972));