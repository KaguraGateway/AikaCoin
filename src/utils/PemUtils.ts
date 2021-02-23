export class PemUtils {
    /**
     * PemからPublicKeyだけを取得する
     * @param publicKeyPem
     */
    static getPublicKeyFromPem(publicKeyPem: string) {
        return publicKeyPem.replace(/^(.*?)-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\n/g, "");
    }
}