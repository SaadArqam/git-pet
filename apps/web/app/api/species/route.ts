import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSpecies, setUserSpecies } from "@/lib/redis";
import type { Species } from "@/lib/redis";
import { NextResponse } from "next/server";
 
export async function GET() {
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
 