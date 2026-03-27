import * as vscode from "vscode";
import * as path from "path";
import simpleGit from "simple-git";

export interface PetStats {
  health: number;
  energy: number;
  intelligence: number;
  happiness: number;
}

export interface PetData {
  username: string;
  stage: "egg" | "hatchling" | "adult" | "legend";
  mood: "happy" | "neutral" | "tired" | "sad" | "coma";
  primaryColor: string;
  species: string;
  stats: PetStats;
  streak: number;
  totalCommits: number;
  topLanguage: string;
  // Local git data merged in
  localCommitsToday: number;
  localStreak: number;
}

const USERNAME_KEY = "gitpet.username";
const CACHE_KEY    = "gitpet.cache";

export class PetDataService {
  private cache: PetData | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ── Username (stored in VS Code secrets) ──────────────────────────────────

  async getUsername(): Promise<string | undefined> {
    return this.context.globalState.get<string>(USERNAME_KEY);
  }

  async setUsername(username: string): Promise<void> {
    await this.context.globalState.update(USERNAME_KEY, username);
    // Clear cache so next refresh hits the API fresh
    this.cache = null;
  }

  // ── Main refresh ──────────────────────────────────────────────────────────

  async refresh(): Promise<PetData | null> {
    const username = await this.getUsername();
    if (!username) return null;

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

  getCached(): PetData | null {
    if (this.cache) return this.cache;
    // Try restoring from persisted state
    const persisted = this.context.globalState.get<PetData>(CACHE_KEY);
    if (persisted) this.cache = persisted;
    return this.cache;
  }

  // ── API fetch ─────────────────────────────────────────────────────────────

  private async fetchFromApi(username: string): Promise<PetData> {
    const config = vscode.workspace.getConfiguration("gitPet");
    const base = config.get<string>("apiBase") ?? "https://git-pet-beta.vercel.app";
    const url = `${base}/api/pet/${username}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const json = await res.json() as Record<string, unknown>;

    // Map the /api/pet/:username response shape to PetData
    const stats = json.stats as PetStats;
    const gitData = json.gitData as {
      username: string;
      streak: number;
      totalCommits: number;
      languages: string[];
    };

    return {
      username:          gitData.username,
      stage:             json.stage as PetData["stage"],
      mood:              json.mood as PetData["mood"],
      primaryColor:      json.primaryColor as string,
      species:           json.species as string ?? "axolotl",
      stats,
      streak:            gitData.streak,
      totalCommits:      gitData.totalCommits,
      topLanguage:       gitData.languages[0] ?? "Unknown",
      localCommitsToday: 0,
      localStreak:       gitData.streak,
    };
  }

  // ── Local git ─────────────────────────────────────────────────────────────

  private async readLocalGit(): Promise<{ commitsToday: number; streak: number }> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return { commitsToday: 0, streak: 0 };

    const repoPath = folders[0]!.uri.fsPath;
    const git = simpleGit(repoPath);

    // Get the configured author email so we only count this user's commits
    const email = await git.raw(["config", "user.email"]).catch(() => "");
    const author = email.trim();

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    // Count commits by this author since midnight
    const logOpts = ["--since=" + since.toISOString()];
    if (author) logOpts.push("--author=" + author);
    const logToday = await git.log(logOpts).catch(() => ({ total: 0 }));

    const commitsToday = logToday.total;

    // Calculate local streak: walk back days until we find a day with 0 commits
    let streak = 0;
    const check = new Date();
    check.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const from = new Date(check);
      const to   = new Date(check);
      to.setHours(23, 59, 59, 999);

      const dayOpts = [
        "--since=" + from.toISOString(),
        "--until=" + to.toISOString(),
      ];
      if (author) dayOpts.push("--author=" + author);
      const dayLog = await git.log(dayOpts).catch(() => ({ total: 0 }));

      if (dayLog.total === 0 && i > 0) break; // Gap found
      if (dayLog.total > 0) streak++;

      check.setDate(check.getDate() - 1);
    }

    return { commitsToday, streak };
  }
}