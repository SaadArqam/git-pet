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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PetDataService = void 0;
const vscode = __importStar(require("vscode"));
const simple_git_1 = __importDefault(require("simple-git"));
const USERNAME_KEY = "gitpet.username";
const CACHE_KEY = "gitpet.cache";
class PetDataService {
    constructor(context) {
        this.context = context;
        this.cache = null;
    }
    // ── Username (stored in VS Code secrets) ──────────────────────────────────
    async getUsername() {
        return this.context.globalState.get(USERNAME_KEY);
    }
    async setUsername(username) {
        await this.context.globalState.update(USERNAME_KEY, username);
        // Clear cache so next refresh hits the API fresh
        this.cache = null;
    }
    // ── Main refresh ──────────────────────────────────────────────────────────
    async refresh() {
        const username = await this.getUsername();
        if (!username)
            return null;
        const [apiData, localData] = await Promise.allSettled([
            this.fetchFromApi(username),
            this.readLocalGit(),
        ]);
        const api = apiData.status === "fulfilled" ? apiData.value : null;
        const local = localData.status === "fulfilled" ? localData.value : null;
        if (!api) {
            // API failed — fall back to cached data with updated local stats
            if (this.cache && local) {
                this.cache = {
                    ...this.cache,
                    localCommitsToday: local.commitsToday,
                    localStreak: local.streak,
                };
            }
            return this.cache;
        }
        this.cache = {
            ...api,
            localCommitsToday: local?.commitsToday ?? 0,
            localStreak: local?.streak ?? api.streak,
        };
        // Persist to global state so panel can restore without a network call
        await this.context.globalState.update(CACHE_KEY, this.cache);
        return this.cache;
    }
    getCached() {
        if (this.cache)
            return this.cache;
        // Try restoring from persisted state
        const persisted = this.context.globalState.get(CACHE_KEY);
        if (persisted)
            this.cache = persisted;
        return this.cache;
    }
    // ── API fetch ─────────────────────────────────────────────────────────────
    async fetchFromApi(username) {
        const config = vscode.workspace.getConfiguration("gitPet");
        const base = config.get("apiBase") ?? "https://git-pet-beta.vercel.app";
        const url = `${base}/api/pet/${username}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok)
            throw new Error(`API returned ${res.status}`);
        const json = await res.json();
        // Map the /api/pet/:username response shape to PetData
        const stats = json.stats;
        const gitData = json.gitData;
        return {
            username: gitData.username,
            stage: json.stage,
            mood: json.mood,
            primaryColor: json.primaryColor,
            species: json.species ?? "axolotl",
            stats,
            streak: gitData.streak,
            totalCommits: gitData.totalCommits,
            topLanguage: gitData.languages[0] ?? "Unknown",
            localCommitsToday: 0,
            localStreak: gitData.streak,
        };
    }
    // ── Local git ─────────────────────────────────────────────────────────────
    async readLocalGit() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length)
            return { commitsToday: 0, streak: 0 };
        const repoPath = folders[0].uri.fsPath;
        const git = (0, simple_git_1.default)(repoPath);
        // Get the configured author email so we only count this user's commits
        const email = await git.raw(["config", "user.email"]).catch(() => "");
        const author = email.trim();
        const since = new Date();
        since.setHours(0, 0, 0, 0);
        // Count commits by this author since midnight
        const logOpts = ["--since=" + since.toISOString()];
        if (author)
            logOpts.push("--author=" + author);
        const logToday = await git.log(logOpts).catch(() => ({ total: 0 }));
        const commitsToday = logToday.total;
        // Calculate local streak: walk back days until we find a day with 0 commits
        let streak = 0;
        const check = new Date();
        check.setHours(0, 0, 0, 0);
        for (let i = 0; i < 365; i++) {
            const from = new Date(check);
            const to = new Date(check);
            to.setHours(23, 59, 59, 999);
            const dayOpts = [
                "--since=" + from.toISOString(),
                "--until=" + to.toISOString(),
            ];
            if (author)
                dayOpts.push("--author=" + author);
            const dayLog = await git.log(dayOpts).catch(() => ({ total: 0 }));
            if (dayLog.total === 0 && i > 0)
                break; // Gap found
            if (dayLog.total > 0)
                streak++;
            check.setDate(check.getDate() - 1);
        }
        return { commitsToday, streak };
    }
}
exports.PetDataService = PetDataService;
//# sourceMappingURL=petData.js.map