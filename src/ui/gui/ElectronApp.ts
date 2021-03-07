import { BrowserWindow } from "electron";

export class ElectronApp {
    mainWindow: BrowserWindow;

    constructor() {
        // Windowを起動
        this.mainWindow = new BrowserWindow({
            title: `AikaCoin`,
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
    }
}