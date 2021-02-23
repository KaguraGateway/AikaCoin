interface IConfig {
    publicKeyPath: string;
    privateKeyPath: string;
}
type ConfigKeys = keyof IConfig;