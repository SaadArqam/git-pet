import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import { getServerSession } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // GitHub now returns `iss` on the OAuth callback (RFC 9207), and
      // openid-client rejects any callback whose `iss` doesn't match the
      // configured issuer. The built-in GitHub provider sets none, so every
      // sign-in failed with error=OAuthCallback before the token exchange.
      issuer: "https://github.com/login/oauth",
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
      session.login = token.login;
      return session;
    },
  },
};

/**
 * The "get the logged-in username from the session, or null" 3-line
 * pattern was copy-pasted independently across several API routes. One
 * place to fix it if the session shape ever changes.
 */
export async function getSessionUsername(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.login ?? null;
}

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

  const sessionUsername = await getSessionUsername();
  return !!sessionUsername && sessionUsername === username;
}
