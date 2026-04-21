import type { GitData } from "@git-pet/core";
import type { GitHubGraphQLResponse } from "./types";

export function transformToGitData(raw: GitHubGraphQLResponse): GitData {
  const user = raw.user;
  const contrib = user.contributionsCollection;

  // Flatten all contribution days
  const allDays = contrib.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  // Days since last commit
  const daysSinceCommit = allDays.findIndex((d) => d.contributionCount > 0);

  // Commits this week (last 7 days)
  const commitsThisWeek = allDays
    .slice(0, 7)
    .reduce((sum, d) => sum + d.contributionCount, 0);

  // Streak logic supporting timezone shifts
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Calculate longest streak
  for (const day of allDays) {
    if (day.contributionCount > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak
  // Start counting backward if the most recent contribution day is EITHER today OR yesterday OR future
  const firstCommitIdx = allDays.findIndex(d => d.contributionCount > 0);
  if (firstCommitIdx !== -1) {
    const firstCommitDate = allDays[firstCommitIdx].date;
    if (firstCommitDate >= yesterdayStr) {
      for (let i = firstCommitIdx; i < allDays.length; i++) {
        if (allDays[i].contributionCount > 0) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  // Languages (ordered by repo count using that language)
  const langCount: Record<string, number> = {};
  for (const repo of user.repositories.nodes) {
    const lang = repo.primaryLanguage?.name;
    if (lang) langCount[lang] = (langCount[lang] ?? 0) + 1;
  }
  const languages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  // Total stars
  const stars = user.repositories.nodes.reduce(
    (sum, r) => sum + r.stargazerCount,
    0
  );

  // PRs merged
  const prsMerged = contrib.pullRequestContributionsByRepository.reduce(
    (sum, r) => sum + r.contributions.totalCount,
    0
  );

  return {
    username: user.login,
    totalCommits: contrib.totalCommitContributions,
    streak: currentStreak,
    longestStreak,
    languages,
    stars,
    daysSinceCommit: Math.max(0, daysSinceCommit),
    commitsThisWeek,
    repoCount: user.repositories.totalCount,
    prsMerged,
  };
}