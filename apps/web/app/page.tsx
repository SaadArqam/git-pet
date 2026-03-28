import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { PetCard } from "@/components/PetCard";
import { SpeciesSelect } from "@/components/SpeciesSelect";
import { getUserSpecies, autoAssignSpecies } from "@/lib/redis";
import Link from "next/link";
import type { PetState } from "@git-pet/core";
import { LandingPage } from "./LandingPage";

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

export default async function Home() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  const username = (session as { login?: string } | null)?.login;

  if (!token || !username) {
    return <LandingPage />;
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

  // Check if user has chosen a species yet
  const savedSpecies = await getUserSpecies(username);
  const isNewUser = savedSpecies === null;

  if (isNewUser) {
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