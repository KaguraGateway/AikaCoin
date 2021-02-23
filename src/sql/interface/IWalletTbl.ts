import { WalletStatus } from "../../wallet/WalletStatus";

export interface IWalletTbl {
    address: string;
    pubkey: string;
    balance: number;
    nonce: number;
    status: WalletStatus;
}