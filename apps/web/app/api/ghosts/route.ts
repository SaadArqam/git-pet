import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  redis,
  lastSeenKey,
  getUserSpecies,
  type LastSeen,
  type Species,
} from "@/lib/redis";
import { NextResponse } from "next/server";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchOnlineUsernames(): Promise<string[]> {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  const secret = process.env.INTERNAL_SECRET;
  if (!host || !secret) return [];

  try {
    const res = await fetch(`https://${host}/parties/web-party/world`, {
      headers: { "x-internal": secret },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { online?: string[] };
    return data.online ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const currentUser = (session as { login?: string } | null)?.login;
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const online = new Set(await fetchOnlineUsernames());
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    const keys = await redis.keys("species:*");
    const ghosts: { username: string; species: Species; x: number; z: number; mood: string }[] = [];

    for (const key of keys) {
      const username = key.replace("species:", "");
      if (username === currentUser || online.has(username)) continue;

      const lastSeen = await redis.get<LastSeen>(lastSeenKey(username));
      if (!lastSeen || lastSeen.timestamp < cutoff) continue;

      const species = await getUserSpecies(username);
      if (!species) continue;

      ghosts.push({
        username,
        species,
        x: lastSeen.x,
        z: lastSeen.z,
        mood: lastSeen.mood || "coma",
      });
    }

    return NextResponse.json({ ghosts });
  } catch (err) {
    console.error("[ghosts] Redis unavailable:", err);
    return NextResponse.json({ ghosts: [] });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const username = (session as { login?: string } | null)?.login;
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { x, z, mood } = (await req.json()) as { x: number; z: number; mood?: string };
  if (typeof x !== "number" || typeof z !== "number") {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }

  const payload: LastSeen = {
    timestamp: Date.now(),
    x,
    z,
    mood,
  };

  await redis.set(lastSeenKey(username), payload);
  return NextResponse.json({ ok: true });
}
