import { deriveMood, deriveStage, deriveStats } from "./stats";

const base = {
  username: "test", totalCommits: 500, streak: 10,
  languages: ["TypeScript", "Python"], stars: 100,
  daysSinceCommit: 1, commitsThisWeek: 8,
  repoCount: 20, prsMerged: 15,
};

const stats = deriveStats(base);
console.assert(stats.health === 88,        `health: ${stats.health}`);
console.assert(deriveStage(500, ["TypeScript", "Python"]) === "adult",  "stage");
console.assert(deriveMood(stats, 1) === "happy", "mood");
console.log("✓ core tests passed");