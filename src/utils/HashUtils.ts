import crypto from "crypto";

export class HashUtils {
    static computeSHA256(rawText: string) {
        const sha256 = crypto.createHash("sha256");
        sha256.update(rawText);
        return sha256.digest("hex");
    }
    static computeRIPEMD160(rawText: string) {
        const ripemd160 = crypto.createHash("ripemd160");
        ripemd160.update(rawText);
        return ripemd160.digest("hex");
    }
}