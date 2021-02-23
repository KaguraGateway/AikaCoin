const { BlockChain } = require("../build/blockchain/BlockChain");
const { Transaction } = require("../build/blockchain/Transaction");

const transactionPool = []

const chain = new BlockChain();

setTimeout(() => {
    const block = chain.createNewBlock();
    console.log(chain);
}, 10000);
setInterval(() => {
    const block = chain.createNewBlock();
    console.log(chain);
}, 30000);
setInterval(() => {
    const transaction = new Transaction(
        generateString(64),
        generateString(64),
        1000
    );
    transactionPool.push(transaction);
    console.log(`New Transaction: ${transaction.to} -> ${transaction.from} (Amout: ${transaction.amount}) Hash: ${transaction.transactionHash}`);
}, 5000);




function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}
function getRandomInt(min, max) {
    return Math.floor(getRandomArbitrary(min, max));
}
function generateString(digit) {
    for(var t = "", n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", o = 0; o < digit; o=(o+1)|0) {
        t += n.charAt(getRandomInt(0, n.length));
    }
    return t;
};