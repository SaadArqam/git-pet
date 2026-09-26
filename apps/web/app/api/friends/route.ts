import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFriends, addFriend } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const queryUserId = req.nextUrl.searchParams.get("userId");
  
  // If query is provided, use it (for fetching specific user's friends)
  if (queryUserId) {
    const friends = await getFriends(queryUserId);
    return NextResponse.json({ friends });
  }

  // Fallback to session
  const session = await getServerSession(authOptions);
  const username = (session as { login?: string } | null)?.login;
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const friends = await getFriends(username);
  return NextResponse.json({ friends });
}

export async function POST(req: Request) {
  // Internal-only: the PartyKit server calls this after both sides have
  // already confirmed a reciprocal befriend in-game (see server.ts's
  // befriend_confirmed handler). There is no legitimate direct-from-browser
  // caller — a regular user session is deliberately not accepted here, so a
  // logged-in user can't force a one-sided "friendship" onto a stranger by
  // calling this endpoint directly.
  const { fromId, toId, secret } = await req.json();
  if (!fromId || !toId) {
    return NextResponse.json({ error: "Missing fromId/toId" }, { status: 400 });
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret || secret !== internalSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await addFriend(fromId, toId);
  return NextResponse.json({ ok: true });
}
