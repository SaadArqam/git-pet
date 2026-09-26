import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    // GitHub username, set in lib/auth.ts's session callback. Declared here
    // so callers read `session?.login` directly instead of casting.
    login?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
  }
}