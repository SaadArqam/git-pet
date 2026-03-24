"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { PetPresence, ServerMessage, ClientMessage } from "../web-party/src/client";

interface PetState {
  stage: string;
  mood: string;
  primaryColor: string;
  stats: { health: number; happiness: number; energy: number };
}

interface Props {
  username: string;
  initialPetState: PetState;
  partyKitHost: string;
}

const WORLD_W = 800;
const WORLD_H = 500;
const SPRITE_SIZE = 32;
const SPEED = 3;

const MOOD_COLORS: Record<string, string> = {
  happy: "#4ade80",
  neutral: "#facc15",
  tired: "#f97316",
  sad: "#60a5fa",
  coma: "#ef4444",
};

function drawPet(
  ctx: CanvasRenderingContext2D,
  pet: PetPresence,
  isMe: boolean,
  frame: number,
) {
  const { x, y, petState, username } = pet;
  const bob = Math.sin(frame * 0.12) * 2;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(x, y + SPRITE_SIZE / 2 + 2, SPRITE_SIZE / 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fill();

  // Body
  ctx.fillStyle = isMe ? "#a78bfa" : (petState.primaryColor ?? "#60a5fa");
  ctx.beginPath();
  ctx.roundRect(
    x - SPRITE_SIZE / 2,
    y - SPRITE_SIZE / 2 + bob,
    SPRITE_SIZE,
    SPRITE_SIZE,
    8,
  );
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 7, y - 4 + bob, 5, 0, Math.PI * 2);
  ctx.arc(x + 7, y - 4 + bob, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e1b4b";
  ctx.beginPath();
  ctx.arc(x - 6, y - 4 + bob, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 8, y - 4 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Mood dot
  ctx.beginPath();
  ctx.arc(x, y - SPRITE_SIZE / 2 - 8 + bob, 4, 0, Math.PI * 2);
  ctx.fillStyle = MOOD_COLORS[petState.mood] ?? "#fff";
  ctx.fill();

  // "Me" ring
  if (isMe) {
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + bob, SPRITE_SIZE / 2 + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Username label
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = isMe ? "#c4b5fd" : "#94a3b8";
  ctx.fillText(username, x, y + SPRITE_SIZE / 2 + 16);
}

export default function WorldCanvas({ username, initialPetState, partyKitHost }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petsRef = useRef<Record<string, PetPresence>>({});
  const posRef = useRef({
    x: 100 + Math.random() * (WORLD_W - 200),
    y: 100 + Math.random() * (WORLD_H - 200),
  });
  const keysRef = useRef<Set<string>>(new Set());
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const socketRef = useRef<PartySocket | null>(null);
  const [inspected, setInspected] = useState<PetPresence | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const socket = new PartySocket({ host: partyKitHost, room: "world" });
    socketRef.current = socket;

    socket.addEventListener("message", (evt) => {
      const msg: ServerMessage = JSON.parse(evt.data);

      if (msg.type === "snapshot") {
        petsRef.current = msg.pets;
        setOnlineCount(Object.keys(msg.pets).length + 1); // +1 for self before join ack
      }
      if (msg.type === "pet_update") {
        petsRef.current[msg.pet.username] = msg.pet;
        setOnlineCount(Object.keys(petsRef.current).length);
      }
      if (msg.type === "pet_left") {
        delete petsRef.current[msg.username];
        setOnlineCount(Object.keys(petsRef.current).length);
      }
    });

    socket.addEventListener("open", () => {
      const joinMsg: ClientMessage = {
        type: "join",
        pet: {
          username,
          x: posRef.current.x,
          y: posRef.current.y,
          petState: initialPetState,
          lastSeen: Date.now(),
        },
      };
      socket.send(JSON.stringify(joinMsg));
    });

    return () => socket.close();
  }, [username, partyKitHost, initialPetState]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      // Prevent page scroll with arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Click to inspect
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    for (const pet of Object.values(petsRef.current)) {
      if (
        Math.abs(pet.x - cx) < SPRITE_SIZE / 2 + 4 &&
        Math.abs(pet.y - cy) < SPRITE_SIZE / 2 + 4
      ) {
        setInspected(pet);
        return;
      }
    }
    setInspected(null);
  }, []);

  // Game loop
  useEffect(() => {
    let lastMove = 0;

    const tick = (time: number) => {
      frameRef.current++;
      const keys = keysRef.current;
      let moved = false;

      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
        posRef.current.y = Math.max(SPRITE_SIZE, posRef.current.y - SPEED);
        moved = true;
      }
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
        posRef.current.y = Math.min(WORLD_H - SPRITE_SIZE, posRef.current.y + SPEED);
        moved = true;
      }
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) {
        posRef.current.x = Math.max(SPRITE_SIZE, posRef.current.x - SPEED);
        moved = true;
      }
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) {
        posRef.current.x = Math.min(WORLD_W - SPRITE_SIZE, posRef.current.x + SPEED);
        moved = true;
      }

      // Throttle move broadcasts to ~20/sec
      if (moved && time - lastMove > 50 && socketRef.current) {
        lastMove = time;
        const moveMsg: ClientMessage = { type: "move", x: posRef.current.x, y: posRef.current.y };
        socketRef.current.send(JSON.stringify(moveMsg));

        if (petsRef.current[username]) {
          petsRef.current[username].x = posRef.current.x;
          petsRef.current[username].y = posRef.current.y;
        }
      }

      // Draw
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx && canvas) {
        ctx.clearRect(0, 0, WORLD_W, WORLD_H);

        // Grid
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        for (let gx = 0; gx < WORLD_W; gx += 40) {
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke();
        }
        for (let gy = 0; gy < WORLD_H; gy += 40) {
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke();
        }

        // All pets
        for (const [uname, pet] of Object.entries(petsRef.current)) {
          drawPet(ctx, pet, uname === username, frameRef.current);
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [username]);

  return (
    <div className="relative select-none">
      {/* Online count */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-gray-400 font-mono">{onlineCount} online</span>
      </div>

      <canvas
        ref={canvasRef}
        width={WORLD_W}
        height={WORLD_H}
        className="rounded-xl border border-gray-800 bg-gray-900 cursor-crosshair block"
        onClick={handleClick}
      />

      <p className="text-center text-xs text-gray-600 mt-2 font-mono">
        WASD / arrow keys to move · click a pet to inspect
      </p>

      {/* Inspect panel */}
      {inspected && (
        <div className="absolute top-10 right-0 bg-gray-900 border border-gray-700 rounded-lg p-4 w-52 text-sm font-mono shadow-xl">
          <button
            className="absolute top-2 right-3 text-gray-500 hover:text-white text-base"
            onClick={() => setInspected(null)}
          >
            ✕
          </button>
          <p className="font-bold text-purple-400 mb-3">@{inspected.username}</p>
          <div className="space-y-1 text-gray-400">
            <p>Stage <span className="text-white float-right">{inspected.petState.stage}</span></p>
            <p>Mood <span className="text-white float-right">{inspected.petState.mood}</span></p>
            <p>Health <span className="text-white float-right">{inspected.petState.stats.health}</span></p>
            <p>Energy <span className="text-white float-right">{inspected.petState.stats.energy}</span></p>
            <p>Happiness <span className="text-white float-right">{inspected.petState.stats.happiness}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}