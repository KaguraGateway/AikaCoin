const crypto = require("crypto");

console.log(crypto.getCurves());

// 鍵ペアをつくる
crypto.generateKeyPair("ec", {
    namedCurve: "secp256k1",
    publicKeyEncoding: {
        type: "spki",
        format: "pem"
    },
    privateKeyEncoding: {
        type: "sec1",
        format: "pem",
        cipher: "aes-256-cbc",
        passphrase: "password"
    }
}, (err, publickey, privatekey) => {
    console.log(`public key: ${publickey}`);
    console.log(`private key: ${privatekey}`);

    const sign = crypto.createSign("sha256");
    sign.update("data");
    sign.end();
    const signature = sign.sign({
        key: privatekey,
        passphrase: "password"
    });
    console.log(`signature: ${signature.toString("base64")}`);

    const verify = crypto.createVerify("sha256");
    verify.update("data");
    console.log(verify.verify(publickey, signature, "base64"));
});
