import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export function speciesKey(username: string) {
  return `species:${username}`;
}

export type Species = "wolf" | "sabertooth" | "capybara" | "dragon" | "axolotl";

export const SPECIES_LIST: Species[] = ["wolf", "sabertooth", "capybara", "dragon", "axolotl"];

export const LANGUAGE_TO_SPECIES: Record<string, Species> = {
  rust: "wolf",
  "c++": "wolf",
  cpp: "wolf",
  go: "sabertooth",
  c: "sabertooth",
  python: "capybara",
  ruby: "capybara",
  typescript: "dragon",
  javascript: "dragon",
};

export function autoAssignSpecies(languages: string[]): Species {
  for (const lang of languages) {
    const match = LANGUAGE_TO_SPECIES[lang.toLowerCase()];
    if (match) return match;
  }
  return "axolotl";
}

export async function getUserSpecies(username: string): Promise<Species | null> {
  return redis.get<Species>(speciesKey(username));
}

export async function setUserSpecies(username: string, species: Species): Promise<void> {
  await redis.set(speciesKey(username), species);
}