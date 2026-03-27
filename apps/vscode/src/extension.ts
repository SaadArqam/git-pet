import * as vscode from "vscode";
import { StatusBarPet } from "./statusBar";
import { PetPanelProvider } from "./panel";
import { PetDataService } from "./petData";

let statusBar: StatusBarPet | undefined;
let dataService: PetDataService | undefined;

export async function activate(context: vscode.ExtensionContext) {
  dataService = new PetDataService(context);
  statusBar = new StatusBarPet(context, dataService);

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("gitPet.openPanel", () => {
      PetPanelProvider.createOrShow(context.extensionUri, dataService!);
    }),

    vscode.commands.registerCommand("gitPet.setUsername", async () => {
      const current = await dataService!.getUsername();
      const input = await vscode.window.showInputBox({
        prompt: "Enter your GitHub username",
        placeHolder: "e.g. SaadArqam",
        value: current ?? "",
      });
      if (input?.trim()) {
        await dataService!.setUsername(input.trim());
        vscode.window.showInformationMessage(`Git Pet: username set to @${input.trim()}`);
        await dataService!.refresh();
        statusBar!.update();
        PetPanelProvider.refresh(dataService!);
      }
    }),

    vscode.commands.registerCommand("gitPet.refresh", async () => {
      await dataService!.refresh();
      statusBar!.update();
      PetPanelProvider.refresh(dataService!);
    }),
  );

  // ── Initial load ──────────────────────────────────────────────────────────
  const username = await dataService.getUsername();
  if (!username) {
    // First time — prompt for username
    const action = await vscode.window.showInformationMessage(
      "Git Pet: Set your GitHub username to meet your pet!",
      "Set Username"
    );
    if (action === "Set Username") {
      vscode.commands.executeCommand("gitPet.setUsername");
    }
  } else {
    await dataService.refresh();
    statusBar.update();
  }

  // ── Auto-refresh timer ────────────────────────────────────────────────────
  const config = vscode.workspace.getConfiguration("gitPet");
  const intervalMs = (config.get<number>("refreshIntervalMinutes") ?? 5) * 60 * 1000;

  const timer = setInterval(async () => {
    await dataService!.refresh();
    statusBar!.update();
    PetPanelProvider.refresh(dataService!);
  }, intervalMs);

  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

export function deactivate() {
  statusBar?.dispose();
}