import { isAuthorizedAs } from "@/lib/auth";
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

  // Allows the PartyKit server's shared secret, or a session that matches
  // the winner — never an unset secret matching an unset secret.
  if (!(await isAuthorizedAs(winnerId, secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wins = await incrementWins(winnerId);
  return NextResponse.json({ ok: true, wins });
}
