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
exports.StatusBarPet = void 0;
const vscode = __importStar(require("vscode"));
const MOOD_EMOJI = {
    happy: "✦",
    neutral: "◆",
    tired: "◇",
    sad: "▽",
    coma: "×",
};
const STAGE_SUFFIX = {
    egg: " [EGG]",
    hatchling: " [HATCHLING]",
    adult: "",
    legend: " ★",
};
class StatusBarPet {
    constructor(context, data) {
        this.data = data;
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = "gitPet.openPanel";
        this.item.tooltip = "Click to open your Git Pet";
        this.item.show();
        context.subscriptions.push(this.item);
        // Show loading state immediately
        this.setLoading();
    }
    update() {
        const pet = this.data.getCached();
        if (!pet) {
            this.item.text = "$(squirrel) Git Pet";
            this.item.tooltip = "Click to set up your Git Pet";
            return;
        }
        const emoji = MOOD_EMOJI[pet.mood] ?? "◆";
        const suffix = STAGE_SUFFIX[pet.stage] ?? "";
        const species = pet.species.charAt(0).toUpperCase() + pet.species.slice(1);
        this.item.text = `${emoji} ${species}${suffix}`;
        this.item.tooltip = [
            `@${pet.username} · ${pet.mood.toUpperCase()}`,
            `HP ${pet.stats.health} · NRG ${pet.stats.energy} · INT ${pet.stats.intelligence} · JOY ${pet.stats.happiness}`,
            `Streak: ${pet.streak}d · ${pet.totalCommits} commits`,
            pet.localCommitsToday > 0
                ? `Local today: ${pet.localCommitsToday} commit${pet.localCommitsToday !== 1 ? "s" : ""}`
                : "No local commits today yet",
        ].join("\n");
    }
    setLoading() {
        this.item.text = "$(sync~spin) Git Pet";
    }
    dispose() {
        this.item.dispose();
    }
}
exports.StatusBarPet = StatusBarPet;
//# sourceMappingURL=statusBar.js.map