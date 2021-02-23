import { createSign, createVerify } from "crypto";

export class SignUtils {
    static sign(data: string, privateKey: string, password: string) {
        const signer = createSign("sha256");
        signer.update(data);
        signer.end();
        return signer.sign({
            key: privateKey,
            passphrase: password
        });
    }
    static signHex(data: string, privateKey: string, password: string) {
        return SignUtils.sign(data, privateKey, password).toString("hex");
    }

    /**
     * 検証する
     * @param signedData
     * @param publicKey
     * @param signatureFormat
     */
    static verify(signature: string, data: string, publicKey: string, signatureFormat?: "hex" | "base64") {
        const verifer = createVerify("sha256");
        verifer.update(data);
        verifer.end();
        return verifer.verify(publicKey, signature, signatureFormat);
    }
}