"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";
import Link from "next/link";

const TILE = 32;
const WORLD_W = 80;
const WORLD_H = 60;
const SPEED = 3;

interface Player {
  username: string;
  x: number;
  y: number;
  petState: PetState;
  lastSeen: number;
}

interface Props {
  petState: PetState;
}

function spawnPosition(username: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.abs(hash % (WORLD_W * TILE - 200)) + 100;
  const y = Math.abs((hash * 31) % (WORLD_H * TILE - 200)) + 100;
  return { x, y };
}

function generateTileMap(): number[][] {
  const map: number[][] = [];
  for (let y = 0; y < WORLD_H; y++) {
    map[y] = [];
    for (let x = 0; x < WORLD_W; x++) {
      if (y === 30 || x === 40) { map[y]![x] = 3; continue; }
      if (y === 15 || y === 45) { map[y]![x] = 3; continue; }
      if (x === 20 || x === 60) { map[y]![x] = 3; continue; }
      if (x > 10 && x < 18 && y > 10 && y < 18) { map[y]![x] = 1; continue; }
      if (x > 62 && x < 70 && y > 42 && y < 50) { map[y]![x] = 1; continue; }
      if (x > 35 && x < 45 && y > 20 && y < 28) { map[y]![x] = 1; continue; }
      const treeHash = Math.sin(x * 127 + y * 311) * 43758;
      if ((treeHash - Math.floor(treeHash)) > 0.85) { map[y]![x] = 2; continue; }
      map[y]![x] = 0;
    }
  }
  return map;
}

const TILE_MAP = generateTileMap();

const TILE_COLORS: Record<number, string> = {
  0: "#1a3a1a",
  1: "#0a2a4a",
  2: "#0f2a0f",
  3: "#2a2018",
};

const TILE_ACCENT: Record<number, string> = {
  0: "#1f4a1f",
  1: "#0d3560",
  2: "#143514",
  3: "#3a2f22",
};

export function WorldClient({ petState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const posRef = useRef(spawnPosition(petState.gitData.username));
  const cameraRef = useRef({ x: 0, y: 0 });
  const playersRef = useRef<Map<string, Player>>(new Map());
  const petFramesRef = useRef<Map<string, number>>(new Map());

  const [inspecting, setInspecting] = useState<Player | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [size, setSize] = useState({ w: 1280, h: 800 });

  // Window size
  useEffect(() => {
    setSize({ w: window.innerWidth, h: window.innerHeight });
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Click to inspect
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const worldX = cx + cameraRef.current.x;
    const worldY = cy + cameraRef.current.y;
    for (const player of playersRef.current.values()) {
      if (Math.abs(player.x - worldX) < 24 && Math.abs(player.y - worldY) < 24) {
        setInspecting(player);
        return;
      }
    }
    setInspecting(null);
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const loop = () => {
      frameRef.current++;
      const frame = frameRef.current;
      const W = canvas.width;
      const H = canvas.height;

      const keys = keysRef.current;
      let { x, y } = posRef.current;

      if (keys.has("w") || keys.has("arrowup"))    y -= SPEED;
      if (keys.has("s") || keys.has("arrowdown"))  y += SPEED;
      if (keys.has("a") || keys.has("arrowleft"))  x -= SPEED;
      if (keys.has("d") || keys.has("arrowright")) x += SPEED;

      x = Math.max(16, Math.min(WORLD_W * TILE - 16, x));
      y = Math.max(16, Math.min(WORLD_H * TILE - 16, y));

      const tileX = Math.floor(x / TILE);
      const tileY = Math.floor(y / TILE);
      if (TILE_MAP[tileY]?.[tileX] === 1) {
        x = posRef.current.x;
        y = posRef.current.y;
      }

      posRef.current = { x, y };
      cameraRef.current = {
        x: Math.max(0, Math.min(WORLD_W * TILE - W, x - W / 2)),
        y: Math.max(0, Math.min(WORLD_H * TILE - H, y - H / 2)),
      };

      const cam = cameraRef.current;
      const startTX = Math.floor(cam.x / TILE);
      const startTY = Math.floor(cam.y / TILE);
      const endTX = Math.min(WORLD_W, startTX + Math.ceil(W / TILE) + 1);
      const endTY = Math.min(WORLD_H, startTY + Math.ceil(H / TILE) + 1);

      // Tiles
      for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
          const tile = TILE_MAP[ty]?.[tx] ?? 0;
          const sx = tx * TILE - cam.x;
          const sy = ty * TILE - cam.y;
          ctx.fillStyle = TILE_COLORS[tile] ?? TILE_COLORS[0]!;
          ctx.fillRect(sx, sy, TILE, TILE);
          ctx.fillStyle = TILE_ACCENT[tile] ?? TILE_ACCENT[0]!;
          ctx.fillRect(sx + 2, sy + 2, 4, 4);
          if (tile === 2) {
            ctx.fillStyle = "#2d1a0a";
            ctx.fillRect(sx + 12, sy + 20, 8, 12);
            ctx.fillStyle = "#1a3a0a";
            ctx.fillRect(sx + 6, sy + 6, 20, 18);
          }
          if (tile === 1 && (tx + ty + Math.floor(frame / 20)) % 3 === 0) {
            ctx.fillStyle = "rgba(100,180,255,0.15)";
            ctx.fillRect(sx, sy, TILE, TILE);
          }
        }
      }

      // Other players
      for (const [id, player] of playersRef.current.entries()) {
        if (id === petState.gitData.username) continue;
        const pf = (petFramesRef.current.get(id) ?? 0) + 1;
        petFramesRef.current.set(id, pf);
        const offscreen = document.createElement("canvas");
        offscreen.width = 72; offscreen.height = 72;
        const octx = offscreen.getContext("2d")!;
        octx.imageSmoothingEnabled = false;
        drawPet(octx, player.petState, pf, 72, 72);
        ctx.drawImage(offscreen, player.x - cam.x - 36, player.y - cam.y - 36, 72, 72);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(player.x - cam.x - 28, player.y - cam.y + 28, 56, 14);
        ctx.fillStyle = player.petState.primaryColor;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`@${player.username}`, player.x - cam.x, player.y - cam.y + 38);
      }

      // Own pet
      const offscreen = document.createElement("canvas");
      offscreen.width = 72; offscreen.height = 72;
      const octx = offscreen.getContext("2d")!;
      octx.imageSmoothingEnabled = false;
      drawPet(octx, petState, frame, 72, 72);
      ctx.drawImage(offscreen, x - cam.x - 36, y - cam.y - 36, 72, 72);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - cam.x - 28, y - cam.y + 28, 56, 14);
      ctx.fillStyle = "#22c55e";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`@${petState.gitData.username}`, x - cam.x, y - cam.y + 38);

      // HUD
      ctx.fillStyle = "rgba(2,6,23,0.85)";
      ctx.fillRect(0, 0, W, 32);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText("GIT PET WORLD", 12, 20);
      ctx.fillStyle = "#475569";
      ctx.textAlign = "right";
      ctx.fillText(`${onlineCount} online  |  WASD to move  |  click to inspect`, W - 12, 20);

      // Minimap
      const MM_W = 120;
      const MM_H = 90;
      const MM_X = W - MM_W - 12;
      const MM_Y = H - MM_H - 12;
      ctx.fillStyle = "rgba(2,6,23,0.8)";
      ctx.fillRect(MM_X, MM_Y, MM_W, MM_H);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.strokeRect(MM_X, MM_Y, MM_W, MM_H);
      for (let ty = 0; ty < WORLD_H; ty += 2) {
        for (let tx = 0; tx < WORLD_W; tx += 2) {
          const tile = TILE_MAP[ty]?.[tx] ?? 0;
          ctx.fillStyle = tile === 1 ? "#0d3560" : tile === 2 ? "#143514" : tile === 3 ? "#3a2f22" : "#1a3a1a";
          ctx.fillRect(MM_X + (tx / WORLD_W) * MM_W, MM_Y + (ty / WORLD_H) * MM_H, 2, 2);
        }
      }
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(MM_X + (x / (WORLD_W * TILE)) * MM_W - 2, MM_Y + (y / (WORLD_H * TILE)) * MM_H - 2, 4, 4);
      for (const player of playersRef.current.values()) {
        ctx.fillStyle = player.petState.primaryColor;
        ctx.fillRect(
          MM_X + (player.x / (WORLD_W * TILE)) * MM_W - 1,
          MM_Y + (player.y / (WORLD_H * TILE)) * MM_H - 1,
          3, 3
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [petState, onlineCount]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#020617" }}>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        style={{ display: "block", imageRendering: "pixelated" }}
        onClick={handleClick}
      />

      {inspecting && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#0f172a", border: "2px solid #1e293b", borderRadius: 16, padding: 20, width: 280, fontFamily: "monospace", zIndex: 100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ color: "#e2e8f0", fontSize: 12 }}>@{inspecting.username}</span>
            <button onClick={() => setInspecting(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
          {[
            { label: "HP",  value: inspecting.petState.stats.health,       color: "#22c55e" },
            { label: "NRG", value: inspecting.petState.stats.energy,       color: "#f59e0b" },
            { label: "INT", value: inspecting.petState.stats.intelligence, color: "#3b82f6" },
            { label: "JOY", value: inspecting.petState.stats.happiness,    color: "#ec4899" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "#64748b", width: 28 }}>{label}</span>
              <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3 }}>
                <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: "#e2e8f0", width: 24, textAlign: "right" }}>{value}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 9, color: "#334155", display: "flex", justifyContent: "space-between" }}>
            <span>{inspecting.petState.stage.toUpperCase()}</span>
            <span>{inspecting.petState.gitData.streak}d streak</span>
            <span style={{ color: inspecting.petState.primaryColor }}>{inspecting.petState.gitData.languages[0]?.toUpperCase()}</span>
          </div>
        </div>
      )}

      <div style={{ position: "absolute", top: 44, left: 12 }}>
        <Link href="/" style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textDecoration: "none", letterSpacing: 1 }}>
          ← HOME
        </Link>
      </div>
    </div>
  );
}