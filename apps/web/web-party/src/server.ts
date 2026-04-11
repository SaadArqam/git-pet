import type * as Party from "partykit/server";

export interface PetPresence {
  username: string;
  species: string; // The pet type (e.g., 'dragon', 'wolf')
  x: number;
  y: number;
  rot?: number;
  petState: {
    stage: string;
    mood: string;
    primaryColor: string;
    stats: {
      health: number;
      happiness: number;
      energy: number;
      intelligence: number;
    };
  };
  lastSeen: number;
  friendCount?: number;
  buffs?: string[];
  lastInteraction?: number;
}

type ServerMessage =
  | { type: "snapshot"; pets: Record<string, PetPresence> }
  | { type: "pet_update"; pet: PetPresence }
  | { type: "pet_left"; username: string }
  | { type: "interaction"; fromUsername: string; toUsername: string; interactionType: "fight" | "befriend" | "play" | "trade"; result: string }
  | { type: "presence_update"; pet: PetPresence };

type ClientMessage =
  | { type: "join"; pet: PetPresence }
  | { type: "move"; x: number; y: number; rot?: number; petType?: string }
  | { type: "interaction"; fromUsername: string; toUsername: string; interactionType: "fight" | "befriend" | "play" | "trade"; result: string }
  | { type: "presence_update"; pet: PetPresence };

export default class WorldServer implements Party.Server {
  pets: Record<string, PetPresence> = {};
  connToUser = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const msg: ServerMessage = { type: "snapshot", pets: this.pets };
    conn.send(JSON.stringify(msg));
  }

  onMessage(message: string, sender: Party.Connection) {
    const data: ClientMessage = JSON.parse(message);

    if (data.type === "join") {
      this.connToUser.set(sender.id, data.pet.username);
      this.pets[data.pet.username] = { ...data.pet, lastSeen: Date.now() };
      const msg: ServerMessage = { type: "pet_update", pet: this.pets[data.pet.username] };
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }

    if (data.type === "move") {
      const username = this.connToUser.get(sender.id);
      if (username && this.pets[username]) {
        this.pets[username].x = data.x;
        this.pets[username].y = data.y;
        if (data.rot !== undefined) this.pets[username].rot = data.rot;
        if (data.petType) this.pets[username].species = data.petType;
        this.pets[username].lastSeen = Date.now();
        const msg: ServerMessage = { type: "pet_update", pet: this.pets[username] };
        this.room.broadcast(JSON.stringify(msg), [sender.id]);
      }
    }

    if (data.type === "presence_update") {
      const username = this.connToUser.get(sender.id);
      if (username && this.pets[username]) {
        this.pets[username].friendCount = data.pet.friendCount;
        this.pets[username].buffs = data.pet.buffs;
        this.pets[username].lastInteraction = data.pet.lastInteraction;
        this.pets[username].lastSeen = Date.now();
        const msg: ServerMessage = { type: "presence_update", pet: this.pets[username] };
        this.room.broadcast(JSON.stringify(msg));
      }
    }

    if (data.type === "interaction") {
      this.room.broadcast(JSON.stringify(data));
    }
  }

  onClose(conn: Party.Connection) {
    const username = this.connToUser.get(conn.id);
    if (username) {
      delete this.pets[username];
      this.connToUser.delete(conn.id);
      const msg: ServerMessage = { type: "pet_left", username };
      this.room.broadcast(JSON.stringify(msg));
    }
  }
}

WorldServer satisfies Party.Worker;