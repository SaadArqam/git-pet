import type { GitData, Mood, PetState, PetStats, Stage } from "./types";

export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3B82F6",
  JavaScript: "#EAB308",
  Python:     "#A855F7",
  Rust:       "#F97316",
  Go:         "#14B8A6",
  Ruby:       "#EF4444",
  Java:       "#F59E0B",
  "C++":      "#6366F1",
  Swift:      "#F43F5E",
  Kotlin:     "#8B5CF6",
  PHP:        "#7C3AED",
  Dart:       "#06B6D4",
};

export const DEFAULT_COLOR = "#64748B";

export function deriveStats(g: GitData): PetStats {
  const health = Math.max(0, 100 - g.daysSinceCommit * 12);
  const energy = Math.min(100, (g.commitsThisWeek / 20) * 100);
  const intelligence = Math.min(
    100,
    (g.repoCount / 50) * 60 + g.languages.length * 10
  );
  const happiness = Math.min(
    100,
    (g.stars / 500) * 70 + (g.streak / 30) * 30
  );
  return {
    health: Math.round(health),
    energy: Math.round(energy),
    intelligence: Math.round(intelligence),
    happiness: Math.round(happiness),
  };
}

export function deriveMood(stats: PetStats, daysSinceCommit: number): Mood {
  if (daysSinceCommit >= 30) return "coma";
  if (daysSinceCommit >= 14) return "sad";
  if (daysSinceCommit >= 7)  return "tired";
  const avg = (stats.health + stats.energy + stats.happiness) / 3;
  if (avg >= 70) return "happy";
  if (avg >= 40) return "neutral";
  return "tired";
}

export function deriveStage(totalCommits: number, languages: string[]): Stage {
  if (totalCommits >= 1000 && languages.length >= 4) return "legend";
  if (totalCommits >= 100  && languages.length >= 2) return "adult";
  if (totalCommits >= 10)                            return "hatchling";
  return "egg";
}

export function derivePrimaryColor(languages: string[]): string {
  return LANGUAGE_COLORS[languages[0] ?? ""] ?? DEFAULT_COLOR;
}

export function derivePetState(gitData: GitData): PetState {
  const stats = deriveStats(gitData);
  return {
    stats,
    mood:         deriveMood(stats, gitData.daysSinceCommit),
    stage:        deriveStage(gitData.totalCommits, gitData.languages),
    primaryColor: derivePrimaryColor(gitData.languages),
    gitData,
  };
}