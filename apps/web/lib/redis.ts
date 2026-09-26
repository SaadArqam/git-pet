import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function safeRedis<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[redis] request failed:", err);
    return fallback;
  }
}

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

export function friendKey(username: string) {
  return `friends:${username}`;
}

export function lastSeenKey(username: string) {
  return `last_seen:${username}`;
}

export type LastSeen = {
  timestamp: number;
  x: number;
  z: number;
  mood?: string;
};

export async function getUserSpecies(username: string): Promise<Species | null> {
  return safeRedis(() => redis.get<Species>(speciesKey(username)), null);
}

export async function setUserSpecies(username: string, species: Species): Promise<void> {
  await redis.set(speciesKey(username), species);
}

export async function getFriends(username: string): Promise<string[]> {
  return safeRedis(() => redis.smembers(friendKey(username)), []);
}

export async function addFriend(user1: string, user2: string): Promise<void> {
  // Bi-directional friendship
  await Promise.all([
    redis.sadd(friendKey(user1), user2),
    redis.sadd(friendKey(user2), user1)
  ]);
}

export function winsKey(username: string) {
  return `wins:${username}`;
}

export async function incrementWins(username: string): Promise<number> {
  return safeRedis(() => redis.incr(winsKey(username)), 0);
}

export async function getWins(username: string): Promise<number> {
  return safeRedis(() => redis.get<number>(winsKey(username)), 0).then((v) => v ?? 0);
}