

export interface ISsdpHeader {
    HOST: string;
    ST: string;
    MAN: string;
    MX: number;
}

export class SsdpHeader {
    method: string;
    header: ISsdpHeader;

    constructor(method: string, header: ISsdpHeader) {
        this.method = method;
        this.header = header;
    }

    toString() {
        let str = `${this.method} * HTTP/1.1\r\n`;

        let key: keyof ISsdpHeader;
        for(key in this.header) {
            str += `${key}: ${this.header[key]}\r\n`;
        }

        return str;
    }
}