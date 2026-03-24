import type * as Party from "partykit/server";

export interface PlayerMessage {
  type: "position" | "join" | "leave";
  username: string;
  x: number;
  y: number;
  petState: string; // JSON stringified PetState
}

export default class WorldServer implements Party.Server {
  players: Map<string, PlayerMessage> = new Map();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // Send existing players to the new connection
    const existing: PlayerMessage[] = Array.from(this.players.values());
    conn.send(JSON.stringify({ type: "init", players: existing }));
  }

  onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message) as PlayerMessage;

    if (data.type === "join" || data.type === "position") {
      this.players.set(sender.id, data);
      // Broadcast to everyone except sender
      this.room.broadcast(message, [sender.id]);
    }

    if (data.type === "leave") {
      this.players.delete(sender.id);
      this.room.broadcast(JSON.stringify({
        type: "leave",
        username: data.username,
        x: 0, y: 0, petState: "",
      }), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    if (player) {
      this.players.delete(conn.id);
      this.room.broadcast(JSON.stringify({
        type: "leave",
        username: player.username,
        x: 0, y: 0, petState: "",
      }));
    }
  }
}

export const onFetch = async (req: Party.Request) => {
  return new Response("Git Pet World Party Server", { status: 200 });
};