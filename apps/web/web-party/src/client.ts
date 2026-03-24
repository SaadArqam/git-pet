import PartySocket from "partysocket";
import type { PetPresence } from "./server";

export type { PetPresence };

export type ServerMessage =
  | { type: "snapshot"; pets: Record<string, PetPresence> }
  | { type: "pet_update"; pet: PetPresence }
  | { type: "pet_left"; username: string };

export type ClientMessage =
  | { type: "join"; pet: PetPresence }
  | { type: "move"; x: number; y: number };

export function createWorldSocket(host: string, room = "world") {
  return new PartySocket({ host, room });
}