import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LandingPage from "./LandingPage";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isSignedIn = !!session;

  return <LandingPage isSignedIn={isSignedIn} />;
}
