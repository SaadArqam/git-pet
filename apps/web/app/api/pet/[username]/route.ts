import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { NextRequest, NextResponse } from "next/server";
import { getUserSpecies } from "@/lib/redis";

// Public, read-only endpoint — no session required. Uses the same
// server-side PAT as /api/card/[username] and /api/leaderboard so any
// visitor (or a bot, badge, editor extension, etc.) can look up any
// GitHub user's pet, not just their own.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const ghToken = process.env.GITHUB_CARD_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return NextResponse.json({ error: "Server misconfigured: no GitHub token" }, { status: 500 });
  }

  try {
    const [gitData, species] = await Promise.all([
      new GitHubClient(ghToken).fetchUserStats(username),
      getUserSpecies(username),
    ]);
    const petState = derivePetState(gitData);
    // This is a public endpoint meant for outside pollers (bots, badges,
    // editor extensions) and shares its GitHub token with /api/card and
    // /api/leaderboard — without caching, frequent polling here could burn
    // through that token's hourly quota and break those too. Same
    // hour-long cache as those two routes.
    return NextResponse.json(
      { ...petState, species },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
