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
  // This can be used for internal persistence calls from PartyKit
  const { fromId, toId, secret } = await req.json();
  
  // Basic security for internal route
  if (secret !== process.env.INTERNAL_SECRET) {
      const session = await getServerSession(authOptions);
      const username = (session as { login?: string } | null)?.login;
      if (!username || username !== fromId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await addFriend(fromId, toId);
  return NextResponse.json({ ok: true });
}
