export interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export interface GitHubRepo {
  name: string;
  stargazerCount: number;
  primaryLanguage: { name: string } | null;
  updatedAt: string;
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface GitHubGraphQLResponse {
  user: {
    login: string;
    name: string;
    avatarUrl: string;
    createdAt: string;
    repositories: {
      totalCount: number;
      nodes: GitHubRepo[];
    };
    contributionsCollection: {
      totalCommitContributions: number;
      contributionCalendar: {
        weeks: ContributionWeek[];
      };
      pullRequestContributionsByRepository: {
        contributions: { totalCount: number };
      }[];
    };
  };
}