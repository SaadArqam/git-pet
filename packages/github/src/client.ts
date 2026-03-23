import type { GitData } from "@git-pet/core";
import { USER_STATS_QUERY } from "./query";
import { transformToGitData } from "./transform";
import type { GitHubGraphQLResponse } from "./types";

export class GitHubClient {
  private token: string;
  private endpoint = "https://api.github.com/graphql";

  constructor(token: string) {
    this.token = token;
  }

  async fetchUserStats(username: string): Promise<GitData> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        query: USER_STATS_QUERY,
        variables: { login: username },
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as { data: GitHubGraphQLResponse; errors?: { message: string }[] };

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0]?.message}`);
    }

    return transformToGitData(json.data);
  }
}