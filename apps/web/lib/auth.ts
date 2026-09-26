import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import { getServerSession } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: { scope: "read:user repo" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        // Fetch the real login from GitHub API
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });
        const ghUser = await res.json() as { login: string };
        token.login = ghUser.login;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      (session as any).login = token.login;
      return session;
    },
  },
};

/**
 * Shared "is this call allowed to act as `username`?" check used by internal
 * routes (called either by the PartyKit server with a shared secret, or by a
 * logged-in browser session acting as itself).
 *
 * A secret only counts if INTERNAL_SECRET is actually set AND matches —
 * two unset/blank values must never be treated as a match, otherwise a
 * deployment that's missing the env var accepts any caller with no secret
 * at all as "internal."
 */
export async function isAuthorizedAs(
  username: string,
  providedSecret?: string
): Promise<boolean> {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (internalSecret && providedSecret === internalSecret) return true;

  const session = await getServerSession(authOptions);
  const sessionUsername = (session as { login?: string } | null)?.login;
  return !!sessionUsername && sessionUsername === username;
}
