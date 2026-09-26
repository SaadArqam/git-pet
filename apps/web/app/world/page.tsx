import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { WorldClient } from "@/components/world/WorldClient";
import Link from "next/link";

const signInStyle = {
  display: "flex", flexDirection: "column" as const, alignItems: "center",
  justifyContent: "center", minHeight: "100vh", background: "#020617",
  gap: 16, fontFamily: "monospace"
};

export default async function WorldPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  const username = session?.login;

  if (!token || !username) {
    return (
      <main style={signInStyle}>
        <h1 style={{ color: "#e2e8f0", fontSize: 20, letterSpacing: 4 }}>GIT PET WORLD</h1>
        <p style={{ color: "#475569", fontSize: 12 }}>sign in to enter the world</p>
        <Link href="/api/auth/signin" style={{ color: "#22c55e", border: "1px solid rgba(34,197,94,0.27)", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 11, letterSpacing: 2 }}>
          SIGN IN WITH GITHUB
        </Link>
      </main>
    );
  }

  let petState;
  try {
    const client = new GitHubClient(token);
    const gitData = await client.fetchUserStats(username);
    petState = derivePetState(gitData);
  } catch (err) {
    console.error("[WorldPage] Failed to fetch GitHub stats:", err);
    return (
      <main style={signInStyle}>
        <h1 style={{ color: "#e2e8f0", fontSize: 20, letterSpacing: 4 }}>GIT PET WORLD</h1>
        <p style={{ color: "#ef4444", fontSize: 12 }}>failed to load your pet — GitHub API unreachable</p>
        <p style={{ color: "#475569", fontSize: 10 }}>check your connection or try signing out and back in</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/world" style={{ color: "#ffd4a0", border: "1px solid rgba(255,212,160,0.3)", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 11, letterSpacing: 2 }}>
            RETRY
          </Link>
          <Link href="/api/auth/signout" style={{ color: "#475569", border: "1px solid rgba(100,116,139,0.3)", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 11, letterSpacing: 2 }}>
            SIGN OUT
          </Link>
        </div>
      </main>
    );
  }

  let species = "default";
  try {
    const { getUserSpecies } = await import("@/lib/redis");
    species = (await getUserSpecies(username)) ?? "default";
  } catch (err) {
    console.error("[WorldPage] Redis unavailable, using default species:", err);
  }

  return <WorldClient petState={petState} species={species} />;
}