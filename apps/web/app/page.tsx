import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { PetCard } from "@/components/PetCard";
import { SpeciesSelect } from "@/components/SpeciesSelect";
import { getUserSpecies, autoAssignSpecies } from "@/lib/redis";
import Link from "next/link";
import type { PetState } from "@git-pet/core";

const pageStyle = {
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  minHeight: "100vh",
  background: "#020617",
  gap: 16,
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
    return (
      <main style={pageStyle}>
        <h1 style={{ fontFamily: "monospace", color: "#e2e8f0", fontSize: 24, letterSpacing: 4 }}>
          GIT PET
        </h1>
        <p style={{ fontFamily: "monospace", color: "#475569", fontSize: 12 }}>
          connect github to meet your pet
        </p>
        <Link
          href="/api/auth/signin"
          style={{ fontFamily: "monospace", fontSize: 11, color: "#22c55e", border: "1px solid rgba(34,197,94,0.27)", padding: "10px 20px", borderRadius: 6, textDecoration: "none", letterSpacing: 2 }}
        >
          SIGN IN WITH GITHUB
        </Link>
      </main>
    );
  }

  const petState = await getPetState(token, username).catch(() => null);

  if (!petState) {
    return (
      <main style={pageStyle}>
        <p style={{ fontFamily: "monospace", color: "#ef4444", fontSize: 12 }}>
          failed to load pet — check your token
        </p>
        <Link href="/api/auth/signout" style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", textDecoration: "none" }}>
          sign out and try again
        </Link>
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

  return (
    <main style={centerStyle}>
      <PetCard petState={petState} species={savedSpecies} />
    </main>
  );
}