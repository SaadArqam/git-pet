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
exports.PetDataService = void 0;
const vscode = __importStar(require("vscode"));
const USERNAME_KEY = "gitpet.username";
const CACHE_KEY = "gitpet.cache";
class PetDataService {
    constructor(context) {
        this.context = context;
        this.cache = null;
    }
    async getUsername() {
        return this.context.globalState.get(USERNAME_KEY);
    }
    async setUsername(username) {
        await this.context.globalState.update(USERNAME_KEY, username);
        this.cache = null;
    }
    async refresh() {
        const username = await this.getUsername();
        if (!username)
            return null;
        const [apiData, localCommits] = await Promise.allSettled([
            this.fetchFromApi(username),
            this.getLocalCommitsToday(),
        ]);
        const api = apiData.status === "fulfilled" ? apiData.value : null;
        const local = localCommits.status === "fulfilled" ? localCommits.value : 0;
        if (!api) {
            if (this.cache) {
                this.cache = { ...this.cache, localCommitsToday: local };
            }
            return this.cache;
        }
        this.cache = { ...api, localCommitsToday: local };
        await this.context.globalState.update(CACHE_KEY, this.cache);
        return this.cache;
    }
    getCached() {
        if (this.cache)
            return this.cache;
        const persisted = this.context.globalState.get(CACHE_KEY);
        if (persisted)
            this.cache = persisted;
        return this.cache;
    }
    async fetchFromApi(username) {
        const config = vscode.workspace.getConfiguration("gitPet");
        const base = config.get("apiBase") ?? "https://git-pet-beta.vercel.app";
        const url = `${base}/api/pet/${username}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok)
            throw new Error(`API ${res.status}`);
        const json = await res.json();
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
    // Uses VS Code's built-in git extension — no extra dependencies
    async getLocalCommitsToday() {
        try {
            const gitExt = vscode.extensions.getExtension("vscode.git");
            if (!gitExt)
                return 0;
            const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
            const api = git.getAPI(1);
            const repo = api.repositories[0];
            if (!repo)
                return 0;
            // Get author email from git config
            const authorEmail = await repo.getConfig("user.email").catch(() => "");
            const since = new Date();
            since.setHours(0, 0, 0, 0);
            const log = await repo.log({
                maxEntries: 100,
                since: since,
            }).catch(() => []);
            // Filter to commits by this author today
            const todayCommits = log
                .filter(c => {
                const isAuthor = !authorEmail || c.authorEmail === authorEmail;
                const isToday = c.authorDate ? c.authorDate >= since : false;
                return isAuthor && isToday;
            });
            return todayCommits.length;
        }
        catch {
            return 0;
        }
    }
}
exports.PetDataService = PetDataService;
//# sourceMappingURL=petData.js.map