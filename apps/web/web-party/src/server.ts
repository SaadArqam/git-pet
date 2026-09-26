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
}

type ServerMessage =
  | { type: "snapshot"; pets: Record<string, PetPresence> }
  | { type: "pet_update"; pet: PetPresence }
  | { type: "pet_left"; username: string }
  | { type: "befriend_request"; fromId: string }
  | { type: "befriend_confirmed"; fromId: string }
  | { type: "befriend_expired"; fromId: string }
  | { type: "fight_received"; fromId: string; damage: number }
  | { type: "emoji_received"; fromId: string; emoji: string };

type ClientMessage =
  | { type: "join"; pet: PetPresence }
  | { type: "move"; x: number; y: number; rot?: number; petType?: string }
  | { type: "befriend_request"; fromId: string; toId: string }
  | { type: "befriend_confirmed"; fromId: string; toId: string }
  | { type: "befriend_expired"; fromId: string; toId: string }
  | { type: "fight"; fromId: string; toId: string; damage: number }
  | { type: "emoji"; fromId: string; toId: string; emoji: string };

// Basic per-connection rate limit: a single misbehaving or malicious client
// broadcasts to the whole shared room, so without this, one bad connection
// spamming move/fight/emoji messages can visibly lag everyone else too, not
// just themselves.
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 20;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export default class WorldServer implements Party.Server {
  pets: Record<string, PetPresence> = {};
  connToUser = new Map<string, string>();
  userToConns = new Map<string, Set<string>>();
  messageTimestamps = new Map<string, number[]>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const msg: ServerMessage = { type: "snapshot", pets: this.pets };
    conn.send(JSON.stringify(msg));
  }

  onMessage(message: string, sender: Party.Connection) {
    // A single malformed message (bad JSON, a missing field) must never
    // crash the handler — that would disconnect just this one sender
    // without running our own cleanup below, permanently leaking their name
    // and pet into the shared room state for everyone else to see.
    try {
      if (this.isRateLimited(sender.id)) return;

      let data: ClientMessage;
      try {
        data = JSON.parse(message);
      } catch {
        console.error("Dropped malformed (non-JSON) message from", sender.id);
        return;
      }

      this.handleMessage(data, sender);
    } catch (err) {
      console.error("Error handling message from", sender.id, err);
    }
  }

  private isRateLimited(connId: string): boolean {
    const now = Date.now();
    const recent = (this.messageTimestamps.get(connId) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    );
    recent.push(now);
    this.messageTimestamps.set(connId, recent);
    return recent.length > RATE_LIMIT_MAX_MESSAGES;
  }

  private async persistFriendship(fromId: string, toId: string, attempt = 1): Promise<void> {
    const url = `${this.room.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/friends`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId, toId, secret: this.room.env.INTERNAL_SECRET }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`/api/friends responded ${res.status}`);
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
        return this.persistFriendship(fromId, toId, attempt + 1);
      }
      console.error(`Persisting friendship ${fromId}<->${toId} failed after retry:`, err);
    }
  }

  private handleMessage(data: ClientMessage, sender: Party.Connection) {
    // The authoritative identity of whoever is actually sending this
    // message. Interaction messages below use this instead of trusting a
    // client-supplied `fromId` — otherwise any connection could claim to be
    // any username and attack/friend-request/emoji as someone else.
    const senderUsername = this.connToUser.get(sender.id);

    if (data.type === "join") {
      if (!data.pet?.username) return;
      this.connToUser.set(sender.id, data.pet.username);
      if (!this.userToConns.has(data.pet.username)) this.userToConns.set(data.pet.username, new Set());
      this.userToConns.get(data.pet.username)!.add(sender.id);

      this.pets[data.pet.username] = { ...data.pet, lastSeen: Date.now() };
      const msg: ServerMessage = { type: "pet_update", pet: this.pets[data.pet.username] };
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }

    if (data.type === "move") {
      const username = this.connToUser.get(sender.id);
      if (!username || !this.pets[username]) return;
      // This gets written into shared room state and handed to every future
      // joiner via "snapshot", so a bad value here would poison the world
      // for everyone, not just the sender, until they send a valid move.
      if (!isFiniteNumber(data.x) || !isFiniteNumber(data.y)) return;

      this.pets[username].x = data.x;
      this.pets[username].y = data.y;
      if (data.rot !== undefined && isFiniteNumber(data.rot)) this.pets[username].rot = data.rot;
      if (data.petType) this.pets[username].species = data.petType;
      this.pets[username].lastSeen = Date.now();
      const msg: ServerMessage = { type: "pet_update", pet: this.pets[username] };
      this.room.broadcast(JSON.stringify(msg), [sender.id]);
    }

    if (data.type === "befriend_request") {
      if (!senderUsername || !data.toId) return;
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_request", fromId: senderUsername };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "befriend_confirmed") {
      if (!senderUsername || !data.toId) return;
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_confirmed", fromId: senderUsername };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }

      // Persist to Redis via API proxy — only on confirmed reciprocal
      // befriend. Both clients are already told "you're friends!" as soon as
      // this message is broadcast above, so a save that silently fails here
      // (a slow/down API, a dropped connection) would otherwise leave both
      // sides believing it happened when a page refresh would actually
      // revert it. One retry covers a transient blip; a timeout stops a
      // hung request from lingering either way.
      this.persistFriendship(senderUsername, data.toId);
    }

    if (data.type === "befriend_expired") {
      if (!senderUsername || !data.toId) return;
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "befriend_expired", fromId: senderUsername };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "fight") {
      if (!senderUsername || !data.toId || !isFiniteNumber(data.damage)) return;
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "fight_received", fromId: senderUsername, damage: data.damage };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }

    if (data.type === "emoji") {
      if (!senderUsername || !data.toId || !data.emoji) return;
      const targetConns = this.userToConns.get(data.toId);
      if (targetConns) {
        const msg: ServerMessage = { type: "emoji_received", fromId: senderUsername, emoji: data.emoji };
        targetConns.forEach(connId => {
          const conn = this.room.getConnection(connId);
          if (conn) conn.send(JSON.stringify(msg));
        });
      }
    }
  }

  onClose(conn: Party.Connection) {
    this.messageTimestamps.delete(conn.id);
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

  onError(conn: Party.Connection, err: Error) {
    // A transport-level error (as opposed to a clean close) previously got
    // no cleanup and no log line at all — the connection's entry in
    // connToUser/userToConns/pets could be left behind depending on whether
    // the runtime separately fires a close event for it. Run the same
    // cleanup onClose does, defensively, regardless of how the socket died.
    console.error("Connection error", conn.id, err);
    this.onClose(conn);
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
