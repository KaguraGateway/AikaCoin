export class PemUtils {
    /**
     * PemからPublicKeyだけを取得する
     * @param publicKeyPem
     */
    static getRawPublicKeyFromPem(publicKeyPem: string) {
        return publicKeyPem.replace(/^(.*?)-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\n/g, "");
    }
    static getPemPublicKeyFromRawPublicKey(rawPublicKey: string) {
        return `-----BEGIN PUBLIC KEY-----\n${rawPublicKey}\n-----END PUBLIC KEY-----`
    }
}