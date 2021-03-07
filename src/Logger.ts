import EventEmitter from "events";

export const LoggerLevel = {
    TRACE: "TRACE",
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR"
}
export type LoggerLevel = typeof LoggerLevel[keyof typeof LoggerLevel];

/**
 * 日時をログフォーマット系の文字列に変換
 * @param {new Date()} date_obj 
 */
function dateFormatter(dateObj: Date) {
    const year  = dateObj.getFullYear();
    const month = ( (dateObj.getMonth() + 1) < 10 ) ? '0' + (dateObj.getMonth() + 1) : (dateObj.getMonth() + 1);
    const day   = ( dateObj.getDate() < 10 ) ? '0' + dateObj.getDate() : dateObj.getDate();
    const hour  = ( dateObj.getHours()   < 10 ) ? '0' + dateObj.getHours()   : dateObj.getHours();
    const min   = ( dateObj.getMinutes() < 10 ) ? '0' + dateObj.getMinutes() : dateObj.getMinutes();
    const sec   = ( dateObj.getSeconds() < 10 ) ? '0' + dateObj.getSeconds() : dateObj.getSeconds();
    const date = year+'-'+month+'-'+day+' '+hour+':'+min+':'+sec;

    return date;
}

function logFormatter(...args: any[]) {
    // フォーマットされた時間を挿入
    let formatMessage = `[${ dateFormatter(new Date()) }]`;

    // 0番目にはレベルが入ってるので取り出して削除
    const logLevel = args[0];
    args.shift();

    // ログのタイプPrefixを付ける
    formatMessage += `[${logLevel}]`;

    // メッセージ部分とスペース開ける
    formatMessage += " ";

    // 初期化
    const toString = Object.prototype.toString;

    // メッセージ付ける
    for(let i=0; i < args.length; i=(i+1)|0) {
        // 文字列に変換してみる
        let str = toString.call(args[i]);

        // String型 か Number型以外はチョメチョメする
        if(str === '[object String]' || str === '[object Number]') {
            formatMessage = formatMessage + args[i];
        } else if(str === '[object Object]' || str === '[object Array]') {
            try {
                formatMessage = formatMessage + JSON.stringify(args[i]);
            } catch {
                formatMessage = formatMessage + str;
            }
        } else {
            formatMessage += args[i];
        }
    }

    return formatMessage;
}

export interface ILogEvent {
    logLevel: LoggerLevel,
    message: string
}

export class Logger extends EventEmitter {

    category?: string;

    constructor(category?: string) {
        super();

        this.category = category;
    }

    //consoleLevel = LoggerLevel.TRACE;

    console(logLevel: string, message: string) {
        // レベルがコンソール表示レベル以下なら出さない
        //if(logLevel < this.consoleLevel) return true;

        switch(logLevel) {
            case LoggerLevel.TRACE:
                console.trace(message);
                break;
            case LoggerLevel.DEBUG:
                console.debug(message);
                break;
            case LoggerLevel.INFO:
                console.log(message);
                break;
            case LoggerLevel.WARNING:
                console.warn(message);
                break;
            case LoggerLevel.ERROR:
                console.error(message);
                break;
        }
    }

    log(...args: any[]) {
        // 0番目よりログレベルを取得
        const logLevel = args[0];

        // メッセージ生成
        const message = logFormatter.apply(null, args);

        // コンソールへ
        this.console(logLevel, message);

        // イベント発火
        const eventLog: ILogEvent = {
            logLevel: logLevel,
            message: message
        };
        this.emit("log", eventLog);
    }

    trace(...args: any[]) {
        // ログレベル追加
        args.unshift(LoggerLevel.TRACE);
        // ログへ
        this.log.apply(this, args);
    }
    debug(...args: any[]) {
        // ログレベル追加
        args.unshift(LoggerLevel.DEBUG);
        // ログへ
        this.log.apply(this, args);
    }
    info(...args: any[]) {
        // ログレベル追加
        args.unshift(LoggerLevel.INFO);
        // ログへ
        this.log.apply(this, args);
    }
    warn(...args: any[]) {
        // ログレベル追加
        args.unshift(LoggerLevel.WARNING);
        // ログへ
        this.log.apply(this, args);
    }
    error(...args: any[]) {
        // ログレベル追加
        args.unshift(LoggerLevel.ERROR);console.log(args);
        // ログへ
        this.log.apply(this, args);
    }
}