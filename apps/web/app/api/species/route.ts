import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSpecies, setUserSpecies } from "@/lib/redis";
import type { Species } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Internal lookup — no session required, used by server-to-server callers
  // that already know a specific username (e.g. the card route). Gated by
  // the same shared secret every other internal route uses, not a hardcoded
  // string, so it's an actual credential rather than public knowledge.
  const internalSecret = process.env.INTERNAL_SECRET;
  const isInternal = !!internalSecret && req.headers.get("x-internal") === internalSecret;
  const queryUsername = req.nextUrl.searchParams.get("username");

  if (isInternal && queryUsername) {
    const species = await getUserSpecies(queryUsername);
    return NextResponse.json({ species: species ?? null });
  }

  // Normal session-based lookup
  const session = await getServerSession(authOptions);
  const username = (session as { login?: string } | null)?.login;
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const species = await getUserSpecies(username);
  return NextResponse.json({ species });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const username = (session as { login?: string } | null)?.login;
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { species } = await req.json() as { species: Species };
  await setUserSpecies(username, species);
  return NextResponse.json({ ok: true });
}