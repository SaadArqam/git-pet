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
    return NextResponse.json({ ...petState, species });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
