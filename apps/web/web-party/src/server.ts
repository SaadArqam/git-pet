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
  | { type: "presence_update"; pet: PetPresence }
  | { type: "befriend_received"; fromId: string }
  | { type: "befriend_request"; fromId: string }
  | { type: "befriend_confirmed"; fromId: string }
  | { type: "befriend_expired"; fromId: string }
  | { type: "fight_received"; fromId: string; damage: number }
  | { type: "emoji_received"; fromId: string; emoji: string };

type ClientMessage =
  | { type: "join"; pet: PetPresence }
  | { type: "move"; x: number; y: number; rot?: number; petType?: string }
  | { type: "interaction"; fromUsername: string; toUsername: string; interactionType: "fight" | "befriend" | "play" | "trade"; result: string }
  | { type: "presence_update"; pet: PetPresence }
  | { type: "befriend"; fromId: string; toId: string }
  | { type: "befriend_request"; fromId: string; toId: string }
  | { type: "befriend_confirmed"; fromId: string; toId: string }
  | { type: "befriend_expired"; fromId: string; toId: string }
  | { type: "fight"; fromId: string; toId: string; damage: number }
  | { type: "emoji"; fromId: string; toId: string; emoji: string };

export default class WorldServer implements Party.Server {
  pets: Record<string, PetPresence> = {};
  connToUser = new Map<string, string>();
  userToConns = new Map<string, Set<string>>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const msg: ServerMessage = { type: "snapshot", pets: this.pets };
    conn.send(JSON.stringify(msg));
  }

  onMessage(message: string, sender: Party.Connection) {
    const data: ClientMessage = JSON.parse(message);

    if (data.type === "join") {
      this.connToUser.set(sender.id, data.pet.username);
      if (!this.userToConns.has(data.pet.username)) this.userToConns.set(data.pet.username, new Set());
      this.userToConns.get(data.pet.username)!.add(sender.id);

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

    if (data.type === "befriend") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_received", fromId: data.fromId };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
      
      // Persist to Redis via API proxy
      fetch(`${this.room.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fromId: data.fromId, 
          toId: data.toId, 
          secret: this.room.env.INTERNAL_SECRET 
        })
      }).catch(err => console.error("Persistence failed", err));
    }

    if (data.type === "befriend_request") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_request", fromId: data.fromId };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "befriend_confirmed") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_confirmed", fromId: data.fromId };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }

      // Persist to Redis via API proxy — only on confirmed reciprocal befriend
      fetch(`${this.room.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId: data.fromId,
          toId: data.toId,
          secret: this.room.env.INTERNAL_SECRET
        })
      }).catch(err => console.error("Persistence failed", err));
    }

    if (data.type === "befriend_expired") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_expired", fromId: data.fromId };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "fight") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "fight_received", fromId: data.fromId, damage: data.damage };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "emoji") {
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "emoji_received", fromId: data.fromId, emoji: data.emoji };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
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
      this.userToConns.get(username)?.delete(conn.id);
      if (this.userToConns.get(username)?.size === 0) {
          delete this.pets[username];
          this.userToConns.delete(username);
      }
      this.connToUser.delete(conn.id);
      const msg: ServerMessage = { type: "pet_left", username };
      this.room.broadcast(JSON.stringify(msg));
    }
  }

  onRequest(req: Party.Request) {
    if (req.headers.get("x-internal") !== this.room.env.INTERNAL_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (req.method === "GET") {
      return Response.json({ online: Object.keys(this.pets) });
    }
    return new Response("Not found", { status: 404 });
  }
}

WorldServer satisfies Party.Worker;