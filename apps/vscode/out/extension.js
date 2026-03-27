"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const statusBar_1 = require("./statusBar");
const panel_1 = require("./panel");
const petData_1 = require("./petData");
let statusBar;
let dataService;
async function activate(context) {
    dataService = new petData_1.PetDataService(context);
    statusBar = new statusBar_1.StatusBarPet(context, dataService);
    // ── Commands ──────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand("gitPet.openPanel", () => {
        panel_1.PetPanelProvider.createOrShow(context.extensionUri, dataService);
    }), vscode.commands.registerCommand("gitPet.setUsername", async () => {
        const current = await dataService.getUsername();
        const input = await vscode.window.showInputBox({
            prompt: "Enter your GitHub username",
            placeHolder: "e.g. SaadArqam",
            value: current ?? "",
        });
        if (input?.trim()) {
            await dataService.setUsername(input.trim());
            vscode.window.showInformationMessage(`Git Pet: username set to @${input.trim()}`);
            await dataService.refresh();
            statusBar.update();
            panel_1.PetPanelProvider.refresh(dataService);
        }
    }), vscode.commands.registerCommand("gitPet.refresh", async () => {
        await dataService.refresh();
        statusBar.update();
        panel_1.PetPanelProvider.refresh(dataService);
    }));
    // ── Initial load ──────────────────────────────────────────────────────────
    const username = await dataService.getUsername();
    if (!username) {
        // First time — prompt for username
        const action = await vscode.window.showInformationMessage("Git Pet: Set your GitHub username to meet your pet!", "Set Username");
        if (action === "Set Username") {
            vscode.commands.executeCommand("gitPet.setUsername");
        }
    }
    else {
        await dataService.refresh();
        statusBar.update();
    }
    // ── Auto-refresh timer ────────────────────────────────────────────────────
    const config = vscode.workspace.getConfiguration("gitPet");
    const intervalMs = (config.get("refreshIntervalMinutes") ?? 5) * 60 * 1000;
    const timer = setInterval(async () => {
        await dataService.refresh();
        statusBar.update();
        panel_1.PetPanelProvider.refresh(dataService);
    }, intervalMs);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
}
function deactivate() {
    statusBar?.dispose();
}
//# sourceMappingURL=extension.js.map