const {HashUtils} = require("../build/utils/HashUtils");
const base58 = require("base58-js");

const pb = `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAE0OeawTpkoIzUiN4FYZ5bvQ5YNKciItnw
kTY69z59BY9NMXZAl5hqqSwRuloEgnoCSL8V3wE74b+81oFw0ntBDA==
-----END PUBLIC KEY-----`;

const pbStr = pb.replace(/^(.*?)-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----$/g, "").replace(/\n/g, "");

console.log(pbStr);
const hash = HashUtils.computeSHA256(pbStr);
console.log(hash);

const hash2 = HashUtils.computeRIPEMD160(hash);
console.log(hash2);

console.log(Uint8Array.from(Buffer.from(hash2)));
console.log(base58.binary_to_base58(Uint8Array.from(Buffer.from(hash2))));