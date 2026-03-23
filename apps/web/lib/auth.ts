import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";

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
