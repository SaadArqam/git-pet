import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSpecies, setUserSpecies } from "@/lib/redis";
import type { Species } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const queryUsername = req.nextUrl.searchParams.get("username");

  // A species is public info — it's shown to every other player in the
  // world and on public pet cards — so a lookup by username needs no auth
  // at all, same treatment as /api/friends' ?userId=. This is also what
  // fetchSpeciesForUser() in WorldClient.tsx actually relies on: it looks up
  // *other* players' species from the browser, which can never carry a
  // server-side secret. (Previously this branch required a secret the
  // browser could never send, so it silently fell through below and
  // returned the caller's own species instead of the one that was asked
  // for — fixed here.)
  if (queryUsername) {
    const species = await getUserSpecies(queryUsername);
    return NextResponse.json({ species: species ?? null });
  }

  // No username given — return the signed-in caller's own species.
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