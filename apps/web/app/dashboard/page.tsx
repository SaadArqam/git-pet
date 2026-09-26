import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { PetCard } from "@/components/PetCard";
import { SpeciesSelect } from "@/components/SpeciesSelect";
import { getUserSpeciesOrThrow, autoAssignSpecies } from "@/lib/redis";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { PetState } from "@git-pet/core";

// The canonical primary color for each species
const SPECIES_PRIMARY_COLOR: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#f8fafc",
  capybara:   "#a16207",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};

const centerStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  minHeight: "100vh",
  background: "#020617",
};

async function getPetState(token: string, username: string): Promise<PetState> {
  const client = new GitHubClient(token);
  const gitData = await client.fetchUserStats(username);
  return derivePetState(gitData);
}

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  const username = (session as { login?: string } | null)?.login;

  if (!token || !username) {
    redirect("/");
  }

  const petState = await getPetState(token, username).catch(() => null);

  if (!petState) {
    return (
      <main style={centerStyle}>
        <div style={{textAlign: "center"}}>
          <p style={{ fontFamily: "monospace", color: "#ef4444", fontSize: 12, marginBottom:16 }}>
            failed to load pet — check your token
          </p>
          <Link href="/api/auth/signout" style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", textDecoration: "none" }}>
            sign out and try again
          </Link>
        </div>
      </main>
    );
  }

  // Check if user has chosen a species yet. A real Redis failure here must
  // not be treated the same as "no species set" — that would silently
  // bounce an existing user back into species selection during a database
  // blip, so it's surfaced as its own error state instead.
  let savedSpecies;
  try {
    savedSpecies = await getUserSpeciesOrThrow(username);
  } catch (err) {
    console.error("[dashboard] Redis unavailable while checking species:", err);
    return (
      <main style={centerStyle}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "monospace", color: "#ef4444", fontSize: 12, marginBottom: 16 }}>
            couldn&apos;t reach the database — try again in a moment
          </p>
          <Link href="/dashboard" style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", textDecoration: "none" }}>
            retry
          </Link>
        </div>
      </main>
    );
  }
  if (savedSpecies === null) {
    return (
      <SpeciesSelect
        username={username}
        suggestedSpecies={autoAssignSpecies(petState.gitData.languages)}
        topLanguage={petState.gitData.languages[0] ?? null}
      />
    );
  }

  // Override primaryColor with the species' canonical color so the
  // renderer draws the right sprite palette, not the GitHub-derived color
  const speciesColor = SPECIES_PRIMARY_COLOR[savedSpecies];
  const petStateWithSpeciesColor: PetState = speciesColor
    ? { ...petState, primaryColor: speciesColor }
    : petState;

  return (
    <main style={centerStyle}>
      <PetCard petState={petStateWithSpeciesColor} species={savedSpecies} />
    </main>
  );
}