import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
//   const { username } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = new GitHubClient(token);
    const gitData = await client.fetchUserStats(params.username);
    const petState = derivePetState(gitData);
    return NextResponse.json(petState);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}