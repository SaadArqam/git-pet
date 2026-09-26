import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWins, incrementWins } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("userId");
  if (!username) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const wins = await getWins(username);
  return NextResponse.json({ wins });
}

export async function POST(req: Request) {
  const { winnerId, secret } = await req.json();
  if (!winnerId) return NextResponse.json({ error: "Missing winnerId" }, { status: 400 });

  // Basic security for internal route, mirroring /api/friends: allow the
  // PartyKit server's shared secret, or a session that matches the winner.
  if (secret !== process.env.INTERNAL_SECRET) {
    const session = await getServerSession(authOptions);
    const username = (session as { login?: string } | null)?.login;
    if (!username || username !== winnerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const wins = await incrementWins(winnerId);
  return NextResponse.json({ ok: true, wins });
}
