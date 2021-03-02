const { MerkleTree } = require("../build/utils/MerkleTree");

const tree = new MerkleTree();

tree.createTree([
    "00000001c994c6588ced2739c12aa53b5524de4775a9b048ae991a2ff34ab33d",
    "000000ffa43a160e2ed42468e5336c8544b675c67c6b34e91e6fdd2d1307a303",
    "0000007cedc37cdf54a2f076bacb7751169ff47da16c0fd4e124dd681a4a45de",
    "000000b72a5d849df30b432bcf24983a808156e8e9699e2c15b1d90a95dbe4bf",
]);
