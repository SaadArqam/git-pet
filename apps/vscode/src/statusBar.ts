import * as vscode from "vscode";
import { PetDataService } from "./petData";

const MOOD_EMOJI: Record<string, string> = {
  happy:   "✦",
  neutral: "◆",
  tired:   "◇",
  sad:     "▽",
  coma:    "×",
};

const STAGE_SUFFIX: Record<string, string> = {
  egg:       " [EGG]",
  hatchling: " [HATCHLING]",
  adult:     "",
  legend:    " ★",
};

export class StatusBarPet {
  private item: vscode.StatusBarItem;

  constructor(
    context: vscode.ExtensionContext,
    private readonly data: PetDataService,
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "gitPet.openPanel";
    this.item.tooltip = "Click to open your Git Pet";
    this.item.show();

    context.subscriptions.push(this.item);

    // Show loading state immediately
    this.setLoading();
  }

  update(): void {
    const pet = this.data.getCached();
    if (!pet) {
      this.item.text = "$(squirrel) Git Pet";
      this.item.tooltip = "Click to set up your Git Pet";
      return;
    }

    const emoji  = MOOD_EMOJI[pet.mood]  ?? "◆";
    const suffix = STAGE_SUFFIX[pet.stage] ?? "";
    const species = pet.species.charAt(0).toUpperCase() + pet.species.slice(1);

    this.item.text    = `${emoji} ${species}${suffix}`;
    this.item.tooltip = [
      `@${pet.username} · ${pet.mood.toUpperCase()}`,
      `HP ${pet.stats.health} · NRG ${pet.stats.energy} · INT ${pet.stats.intelligence} · JOY ${pet.stats.happiness}`,
      `Streak: ${pet.streak}d · ${pet.totalCommits} commits`,
      pet.localCommitsToday > 0
        ? `Local today: ${pet.localCommitsToday} commit${pet.localCommitsToday !== 1 ? "s" : ""}`
        : "No local commits today yet",
    ].join("\n");
  }

  setLoading(): void {
    this.item.text = "$(sync~spin) Git Pet";
  }

  dispose(): void {
    this.item.dispose();
  }
}