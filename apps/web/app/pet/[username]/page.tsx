import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import type { PetState } from "@git-pet/core";
import { PetCard } from "@/components/PetCard";
import { getUserSpecies, getWins } from "@/lib/redis";
import Link from "next/link";
import type { Metadata } from "next";

// No sign-in required — this is the shareable, public view of any GitHub
// user's pet (e.g. git-pet-beta.vercel.app/pet/torvalds). Mirrors the same
// "GITHUB_CARD_TOKEN, no session" fetch pattern as /api/card/[username] and
// /api/leaderboard, so it works for visitors who have never signed in.

const SPECIES_PRIMARY_COLOR: Record<string, string> = {
  wolf: "#94a3b8",
  sabertooth: "#f8fafc",
  capybara: "#a16207",
  dragon: "#7c3aed",
  axolotl: "#db2777",
};

const centerStyle = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 16,
  minHeight: "100vh",
  padding: 24,
  background: "#020617",
};

async function getPublicPetState(username: string): Promise<PetState | null> {
  const ghToken = process.env.GITHUB_CARD_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!ghToken) return null;
  try {
    const gitData = await new GitHubClient(ghToken).fetchUserStats(username);
    return derivePetState(gitData);
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params;
  const title = `@${username}'s Git Pet`;
  const description = `See how ${username}'s GitHub streak keeps their pet alive in git-pet.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/api/card/${username}`],
    },
  };
}

export default async function PublicPetPage(
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const [species, petState, wins] = await Promise.all([
    getUserSpecies(username),
    getPublicPetState(username),
    getWins(username),
  ]);

  if (!species || !petState) {
    return (
      <main style={centerStyle}>
        <div style={{ textAlign: "center", fontFamily: "monospace" }}>
          <div style={{ fontSize: 12, color: "#475569", letterSpacing: 2, marginBottom: 12 }}>
            NO PET FOUND FOR
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#e2e8f0", marginBottom: 20 }}>
            @{username}
          </div>
          <Link
            href="/"
            style={{
              fontSize: 11,
              color: "#22c55e",
              textDecoration: "none",
              border: "1px solid #22c55e44",
              padding: "10px 20px",
              borderRadius: 6,
            }}
          >
            CLAIM THIS USERNAME →
          </Link>
        </div>
      </main>
    );
  }

  const speciesColor = SPECIES_PRIMARY_COLOR[species];
  const petStateWithSpeciesColor: PetState = speciesColor
    ? { ...petState, primaryColor: speciesColor }
    : petState;

  return (
    <main style={centerStyle}>
      <PetCard petState={petStateWithSpeciesColor} species={species} mode="public" wins={wins} />
    </main>
  );
}
