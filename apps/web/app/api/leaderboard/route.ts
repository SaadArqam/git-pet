import { NextResponse } from "next/server";
import { redis, lastSeenKey, friendKey } from "@/lib/redis";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";

// Cap — fetch at most this many users per request.
// Beyond this, GitHub rate limits become a concern and latency grows linearly.
const USER_CAP = 50;

// GitHub calls are batched instead of all firing at once: 50 simultaneous
// requests from one shared token risks tripping GitHub's own anti-abuse
// throttling for request bursts, which would show up here as usernames
// silently getting 0s (see the catch block below, which now at least logs
// this instead of staying completely silent about it).
const GITHUB_BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface LeaderboardEntry {
  username: string;
  species: string;
  value: number; // the stat being ranked (streak, commits, or friend count)
}

export interface LeaderboardResponse {
  topStreak: LeaderboardEntry[];
  topCommits: LeaderboardEntry[];
  topFriends: LeaderboardEntry[];
}

export async function GET() {
  try {
    // 1. Discover onboarded users from species:* keys
    const allSpeciesKeys: string[] = await redis.keys("species:*");

    if (allSpeciesKeys.length === 0) {
      const empty: LeaderboardResponse = {
        topStreak: [],
        topCommits: [],
        topFriends: [],
      };
      return NextResponse.json(empty, {
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    if (allSpeciesKeys.length > USER_CAP) {
      console.warn(
        `[leaderboard] Known username count (${allSpeciesKeys.length}) exceeds ${USER_CAP}. ` +
          `Only the ${USER_CAP} most recently active users will be included. ` +
          `Revisit this cap if the user base grows significantly.`
      );
    }

    // 2. Extract all usernames and sort by last_seen timestamp (most recent first)
    //    so we process the most active users when we need to cap.
    const allUsernames = allSpeciesKeys.map((k) => k.replace("species:", ""));

    let usernamesForRanking = allUsernames;

    if (allUsernames.length > USER_CAP) {
      // Fetch all last_seen timestamps in parallel to rank by recency
      const lastSeenEntries = await Promise.all(
        allUsernames.map(async (username) => {
          try {
            const ls = await redis.get<{ timestamp: number; x: number; z: number }>(
              lastSeenKey(username)
            );
            return { username, timestamp: ls?.timestamp ?? 0 };
          } catch {
            return { username, timestamp: 0 };
          }
        })
      );
      // Sort newest first and take the cap
      lastSeenEntries.sort((a, b) => b.timestamp - a.timestamp);
      usernamesForRanking = lastSeenEntries
        .slice(0, USER_CAP)
        .map((e) => e.username);
    }

    // 3. Fetch GitHub stats + friend counts for each user in parallel
    const ghToken =
      process.env.GITHUB_CARD_TOKEN ?? process.env.GITHUB_TOKEN ?? "";

    type Entry = {
      username: string;
      species: string;
      streak: number;
      totalCommits: number;
      friendCount: number;
    };

    const results: PromiseSettledResult<Entry>[] = [];
    for (const batch of chunk(usernamesForRanking, GITHUB_BATCH_SIZE)) {
      const batchResults = await Promise.allSettled(
        batch.map(async (username): Promise<Entry> => {
          // Get species (already known but re-read to keep it simple)
          const species =
            (await redis.get<string>(`species:${username}`)) ?? "capybara";

          // Friend count — direct Redis Set cardinality
          let friendCount = 0;
          try {
            friendCount = await redis.scard(friendKey(username));
          } catch {
            friendCount = 0;
          }

          // GitHub stats — skip if no token
          let streak = 0;
          let totalCommits = 0;

          if (ghToken) {
            try {
              const client = new GitHubClient(ghToken);
              const gitData = await client.fetchUserStats(username);
              const petState = derivePetState(gitData);
              streak = petState.gitData.streak;
              totalCommits = petState.gitData.totalCommits;
            } catch (err) {
              // Was silently swallowed with zero logging, so a GitHub
              // rate-limit failure was indistinguishable from a genuinely
              // inactive user (both just showed up as "0 commits").
              console.warn(
                `[leaderboard] GitHub fetch failed for ${username} (deleted/private/rate-limited?):`,
                err
              );
            }
          }

          return { username, species, streak, totalCommits, friendCount };
        })
      );
      results.push(...batchResults);
    }

    // 4. Collect successful results
    const entries = results
      .filter((r): r is PromiseFulfilledResult<Entry> => r.status === "fulfilled")
      .map((r) => r.value);

    // 5. Build three ranked lists (descending, top 10 each)
    const topStreak: LeaderboardEntry[] = [...entries]
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 10)
      .map(({ username, species, streak }) => ({
        username,
        species,
        value: streak,
      }));

    const topCommits: LeaderboardEntry[] = [...entries]
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, 10)
      .map(({ username, species, totalCommits }) => ({
        username,
        species,
        value: totalCommits,
      }));

    const topFriends: LeaderboardEntry[] = [...entries]
      .sort((a, b) => b.friendCount - a.friendCount)
      .slice(0, 10)
      .map(({ username, species, friendCount }) => ({
        username,
        species,
        value: friendCount,
      }));

    const payload: LeaderboardResponse = { topStreak, topCommits, topFriends };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[leaderboard] Failed:", err);
    // Return empty payload rather than crashing — UI shows empty state
    const empty: LeaderboardResponse = {
      topStreak: [],
      topCommits: [],
      topFriends: [],
    };
    return NextResponse.json(empty, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
