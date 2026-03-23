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

  // Current streak
  let streak = 0;
  for (const day of allDays) {
    if (day.contributionCount > 0) streak++;
    else break;
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
    streak,
    languages,
    stars,
    daysSinceCommit: Math.max(0, daysSinceCommit),
    commitsThisWeek,
    repoCount: user.repositories.totalCount,
    prsMerged,
  };
}