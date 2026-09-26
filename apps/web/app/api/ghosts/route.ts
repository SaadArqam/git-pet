import { getSessionUsername } from "@/lib/auth";
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
  const currentUser = await getSessionUsername();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const online = new Set(await fetchOnlineUsernames());
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    const keys = await redis.keys("species:*");
    const candidates = keys
      .map((key) => key.replace("species:", ""))
      .filter((username) => username !== currentUser && !online.has(username));

    // Was a plain for-of loop doing 2 sequential Redis round trips per
    // candidate — with even 50-100 onboarded users that's 100-200 round
    // trips, one at a time, before the World page can finish loading. Fetch
    // every candidate's data concurrently instead (same pattern the
    // leaderboard route already uses for its per-user fan-out).
    type Ghost = { username: string; species: Species; x: number; z: number; mood: string };
    const results = await Promise.all(
      candidates.map(async (username): Promise<Ghost | null> => {
        const [lastSeen, species] = await Promise.all([
          redis.get<LastSeen>(lastSeenKey(username)),
          getUserSpecies(username),
        ]);
        if (!lastSeen || lastSeen.timestamp < cutoff || !species) return null;
        return { username, species, x: lastSeen.x, z: lastSeen.z, mood: lastSeen.mood || "coma" };
      })
    );
    const ghosts = results.filter((g): g is Ghost => g !== null);

    return NextResponse.json({ ghosts });
  } catch (err) {
    console.error("[ghosts] Redis unavailable:", err);
    return NextResponse.json({ ghosts: [] });
  }
}

export async function POST(req: Request) {
  const username = await getSessionUsername();
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
