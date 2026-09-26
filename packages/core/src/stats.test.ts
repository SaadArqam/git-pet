import { describe, expect, it } from "vitest";
import { deriveMood, deriveStage, deriveStats, derivePetState, derivePrimaryColor, DEFAULT_COLOR } from "./stats";
import type { GitData } from "./types";

const base: GitData = {
  username: "test",
  totalCommits: 500,
  streak: 10,
  longestStreak: 15,
  languages: ["TypeScript", "Python"],
  stars: 100,
  daysSinceCommit: 1,
  commitsThisWeek: 8,
  repoCount: 20,
  prsMerged: 15,
};

describe("deriveStats", () => {
  it("computes each stat from GitHub activity", () => {
    expect(deriveStats(base)).toEqual({
      health: 88,       // 100 - 1 day * 12
      energy: 40,       // 8 / 20 commits this week
      intelligence: 44, // 20/50 repos * 60 + 2 languages * 10
      happiness: 24,    // 100/500 stars * 70 + 10/30 streak * 30
    });
  });

  it("drops health 12 points per day without a commit, floored at 0", () => {
    expect(deriveStats({ ...base, daysSinceCommit: 0 }).health).toBe(100);
    expect(deriveStats({ ...base, daysSinceCommit: 5 }).health).toBe(40);
    expect(deriveStats({ ...base, daysSinceCommit: 9 }).health).toBe(0);
    expect(deriveStats({ ...base, daysSinceCommit: 365 }).health).toBe(0);
  });

  it("caps every stat at 100", () => {
    const maxed = deriveStats({
      ...base,
      daysSinceCommit: 0,
      commitsThisWeek: 500,
      repoCount: 1000,
      languages: ["a", "b", "c", "d", "e", "f", "g"],
      stars: 100_000,
      streak: 1000,
    });
    expect(maxed).toEqual({ health: 100, energy: 100, intelligence: 100, happiness: 100 });
  });
});

describe("deriveMood", () => {
  const high = { health: 100, energy: 100, intelligence: 100, happiness: 100 };
  const mid = { health: 50, energy: 50, intelligence: 50, happiness: 50 };
  const low = { health: 10, energy: 10, intelligence: 10, happiness: 10 };

  it("is driven by days since last commit first, regardless of stats", () => {
    expect(deriveMood(high, 30)).toBe("coma");
    expect(deriveMood(high, 14)).toBe("sad");
    expect(deriveMood(high, 7)).toBe("tired");
  });

  it("falls back to average of health/energy/happiness for recent committers", () => {
    expect(deriveMood(high, 1)).toBe("happy");
    expect(deriveMood(mid, 1)).toBe("neutral");
    expect(deriveMood(low, 1)).toBe("tired");
  });

  it("matches the documented thresholds exactly at the boundaries", () => {
    expect(deriveMood(high, 29)).toBe("sad");
    expect(deriveMood(high, 13)).toBe("tired");
    expect(deriveMood(high, 6)).toBe("happy");
  });
});

describe("deriveStage", () => {
  it("evolves egg -> hatchling -> adult -> legend by commits and language breadth", () => {
    expect(deriveStage(0, [])).toBe("egg");
    expect(deriveStage(9, ["TypeScript"])).toBe("egg");
    expect(deriveStage(10, ["TypeScript"])).toBe("hatchling");
    expect(deriveStage(100, ["TypeScript", "Python"])).toBe("adult");
    expect(deriveStage(1000, ["TypeScript", "Python", "Go", "Rust"])).toBe("legend");
  });

  it("requires language breadth, not just commit volume, for higher stages", () => {
    expect(deriveStage(5000, ["TypeScript"])).toBe("hatchling");
    expect(deriveStage(5000, ["TypeScript", "Python", "Go"])).toBe("adult");
  });
});

describe("derivePrimaryColor", () => {
  it("uses the top language's color, falling back to the default", () => {
    expect(derivePrimaryColor(["TypeScript"])).toBe("#3B82F6");
    expect(derivePrimaryColor(["SomeUnlistedLanguage"])).toBe(DEFAULT_COLOR);
    expect(derivePrimaryColor([])).toBe(DEFAULT_COLOR);
  });
});

describe("derivePetState", () => {
  it("combines stats, mood, stage, and color into one state", () => {
    const state = derivePetState(base);
    expect(state.stats.health).toBe(88);
    expect(state.stage).toBe("adult");
    expect(state.primaryColor).toBe("#3B82F6");
    expect(state.gitData).toBe(base);
    expect(["happy", "neutral", "tired", "sad", "coma"]).toContain(state.mood);
  });
});
