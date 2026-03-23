export type Mood = "happy" | "neutral" | "tired" | "sad" | "coma";
export type Stage = "egg" | "hatchling" | "adult" | "legend";

export interface PetStats {
  health: number;       // 0–100 — decays with days since last commit
  energy: number;       // 0–100 — commits this week
  intelligence: number; // 0–100 — repo count + language diversity
  happiness: number;    // 0–100 — stars + PR merges + streak
}

export interface GitData {
  username: string;
  totalCommits: number;
  streak: number;          // current day streak
  languages: string[];     // ordered by usage, most used first
  stars: number;           // total stars across all repos
  daysSinceCommit: number;
  commitsThisWeek: number;
  repoCount: number;
  prsMerged: number;
}

export interface PetState {
  stats: PetStats;
  mood: Mood;
  stage: Stage;
  primaryColor: string;  // derived from top language
  gitData: GitData;
}