import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { WorldClient } from "@/components/world/WorldClient";
import Link from "next/link";

export default async function WorldPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  const username = (session as any)?.login as string | undefined;

  if (!token || !username) {
    return (
      <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#020617", gap: 16, fontFamily: "monospace" }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 20, letterSpacing: 4 }}>GIT PET WORLD</h1>
        <p style={{ color: "#475569", fontSize: 12 }}>sign in to enter the world</p>
        <Link href="/api/auth/signin" style={{ color: "#22c55e", border: "1px solid rgba(34,197,94,0.27)", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 11, letterSpacing: 2 }}>
          SIGN IN WITH GITHUB
        </Link>
      </main>
    );
  }

  const client = new GitHubClient(token);
  const gitData = await client.fetchUserStats(username);
  const petState = derivePetState(gitData);

  return <WorldClient petState={petState} />;
}