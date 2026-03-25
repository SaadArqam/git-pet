import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSpecies } from "@/lib/redis";
import { SpeciesSwitch } from "@/components/SpeciesSwitch";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const username = (session as { login?: string } | null)?.login;
  if (!username) redirect("/");
  
  const currentSpecies = await getUserSpecies(username) ?? "default";
  return <SpeciesSwitch currentSpecies={currentSpecies} />;
}
