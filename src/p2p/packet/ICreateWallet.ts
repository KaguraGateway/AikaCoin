import { WalletStatus } from "../../wallet/WalletStatus";

export interface ICreateWallet {
    address: string,
    pubkey: string,
    status: WalletStatus
}