import * as vscode from "vscode";

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
  localCommitsToday: number;
  localStreak: number;
}

const USERNAME_KEY = "gitpet.username";
const CACHE_KEY    = "gitpet.cache";

export class PetDataService {
  private cache: PetData | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async getUsername(): Promise<string | undefined> {
    return this.context.globalState.get<string>(USERNAME_KEY);
  }

  async setUsername(username: string): Promise<void> {
    await this.context.globalState.update(USERNAME_KEY, username);
    this.cache = null;
  }

  async refresh(): Promise<PetData | null> {
    const username = await this.getUsername();
    if (!username) return null;

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

  getCached(): PetData | null {
    if (this.cache) return this.cache;
    const persisted = this.context.globalState.get<PetData>(CACHE_KEY);
    if (persisted) this.cache = persisted;
    return this.cache;
  }

  private async fetchFromApi(username: string): Promise<PetData> {
    const config = vscode.workspace.getConfiguration("gitPet");
    const base = config.get<string>("apiBase") ?? "https://git-pet-beta.vercel.app";
    const url = `${base}/api/pet/${username}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json() as Record<string, unknown>;

    const stats  = json.stats as PetStats;
    const gitData = json.gitData as {
      username: string; streak: number;
      totalCommits: number; languages: string[];
    };

    return {
      username:          gitData.username,
      stage:             json.stage as PetData["stage"],
      mood:              json.mood  as PetData["mood"],
      primaryColor:      json.primaryColor as string,
      species:           (json.species as string) ?? "axolotl",
      stats,
      streak:            gitData.streak,
      totalCommits:      gitData.totalCommits,
      topLanguage:       gitData.languages[0] ?? "Unknown",
      localCommitsToday: 0,
      localStreak:       gitData.streak,
    };
  }

  // Uses VS Code's built-in git extension — no extra dependencies
  private async getLocalCommitsToday(): Promise<number> {
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git");
      if (!gitExt) return 0;

      const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
      const api = git.getAPI(1);
      const repo = api.repositories[0];
      if (!repo) return 0;

      // Get author email from git config
      const authorEmail = await repo.getConfig("user.email").catch(() => "");

      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const log = await repo.log({
        maxEntries: 100,
        since: since,
      }).catch(() => []);

      // Filter to commits by this author today
      const todayCommits = (log as Array<{ authorEmail?: string; authorDate?: Date }>)
        .filter(c => {
          const isAuthor = !authorEmail || c.authorEmail === authorEmail;
          const isToday  = c.authorDate ? c.authorDate >= since : false;
          return isAuthor && isToday;
        });

      return todayCommits.length;
    } catch {
      return 0;
    }
  }
}