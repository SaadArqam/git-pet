"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";
import PartySocket from "partysocket";
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
  species: string;
  lastSeen: number;
}

interface Props {
  petState: PetState;
  species: string;
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

function playSound(type: "fight" | "befriend" | "play" | "trade") {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === "fight") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "befriend") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "play") {
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "square";
        o.frequency.setValueAtTime(330, ctx.currentTime + i * 0.15);
        g.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.15);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.15 + 0.1);
        o.start(ctx.currentTime + i * 0.15);
        o.stop(ctx.currentTime + i * 0.15 + 0.1);
      }
    } else if (type === "trade") {
      const freqs = [261, 329, 392, 523];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.1);
        g.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.1 + 0.15);
        o.start(ctx.currentTime + i * 0.1);
        o.stop(ctx.currentTime + i * 0.1 + 0.15);
      });
    }
  } catch(e) {}
}

// Defined outside component so it's stable and not recreated on render
function presenceToPlayer(presence: any): Player {
  return {
    username: presence.username,
    x: presence.x,
    y: presence.y,
    lastSeen: presence.lastSeen,
    species: presence.species ?? "default",
    petState: {
      stage: presence.petState.stage,
      mood: presence.petState.mood,
      primaryColor: presence.petState.primaryColor,
      stats: {
        health: presence.petState.stats.health,
        happiness: presence.petState.stats.happiness,
        energy: presence.petState.stats.energy,
        intelligence: presence.petState.stats.intelligence ?? 0,
      },
      gitData: {
        username: presence.username,
        commits: 0,
        streak: 0,
        stars: 0,
        languages: [],
        pullRequests: 0,
        reviews: 0,
      },
    } as any,
  };
}

export function WorldClient({ petState, species }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const posRef = useRef(spawnPosition(petState.gitData.username));
  const cameraRef = useRef({ x: 0, y: 0 });
  const playersRef = useRef<Map<string, Player>>(new Map());
  const petFramesRef = useRef<Map<string, number>>(new Map());

  const socketRef = useRef<PartySocket | null>(null);
  const activeInteractionsRef = useRef<{id:string, type:string, emoji:string, resultText:string, color:string, uA:string, uB:string, startedAt:number, expiresAt:number}[]>([]);
  const tempMoodsRef = useRef<Map<string, { mood: string, expiresAt: number }>>(new Map());
  const cooldownsRef = useRef<Map<string, number>>(new Map());
  const nearPlayersRef = useRef<Map<string, number>>(new Map());
  const [interactionTarget, setInteractionTarget] = useState<Player | null>(null);

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
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current.add(k);
      
      if (k === "e") {
        const now = Date.now();
        let nearest: Player | null = null;
        let minDist = 80;
        
        for (const player of playersRef.current.values()) {
           const dist = Math.hypot(player.x - posRef.current.x, player.y - posRef.current.y);
           if (dist <= minDist) {
              const cdKey = [petState.gitData.username, player.username].sort().join(":");
              const cd = cooldownsRef.current.get(cdKey) || 0;
              if (now > cd) { 
                nearest = player;
                minDist = dist;
              }
           }
        }
        
        if (nearest) {
           setInteractionTarget(nearest);
        }
      }
      
      if (k === "escape") {
         setInteractionTarget(null);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [petState]);

  // Socket connection
  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!host) return;

    const socket = new PartySocket({ host, room: "world" });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        type: "join",
        pet: {
          username: petState.gitData.username,
          x: posRef.current.x,
          y: posRef.current.y,
          species: species,
          petState: {
            stage: petState.stage,
            mood: petState.mood,
            primaryColor: petState.primaryColor,
            stats: {
              health: petState.stats.health,
              happiness: petState.stats.happiness,
              energy: petState.stats.energy,
              intelligence: petState.stats.intelligence, // ✅ included
            },
          },
          lastSeen: Date.now(),
        },
      }));
    });

    socket.addEventListener("message", (evt: MessageEvent) => {
      const msg = JSON.parse(evt.data);

      if (msg.type === "snapshot") {
        playersRef.current.clear();
        for (const [uname, presence] of Object.entries(msg.pets as Record<string, any>)) {
          if (uname === petState.gitData.username) continue;
          playersRef.current.set(uname, presenceToPlayer(presence));
        }
        setOnlineCount(playersRef.current.size + 1);
      }

      if (msg.type === "pet_update") {
        if (msg.pet.username === petState.gitData.username) return;
        playersRef.current.set(msg.pet.username, presenceToPlayer(msg.pet));
        setOnlineCount(playersRef.current.size + 1);
      }

      if (msg.type === "pet_left") {
        playersRef.current.delete(msg.username);
        setOnlineCount(playersRef.current.size + 1);
      }

      if (msg.type === "interaction") {
        const { fromUsername, toUsername, interactionType, result } = msg;

        const isMe =
          fromUsername === petState.gitData.username ||
          toUsername === petState.gitData.username;

        let emoji = "✨";
        let color = "255, 215, 0"; 
        if (interactionType === "fight") { emoji = "⚔️"; color = "239, 68, 68"; }
        else if (interactionType === "befriend") { emoji = "💛"; color = "16, 185, 129"; }
        else if (interactionType === "play") { emoji = "🎮"; color = "59, 130, 246"; }

        const now = Date.now();

        if (interactionType === "fight") {
           tempMoodsRef.current.set(toUsername, { mood: "sad", expiresAt: now + 30000 });
        } else if (interactionType === "befriend") {
           tempMoodsRef.current.set(fromUsername, { mood: "happy", expiresAt: now + 30000 });
           tempMoodsRef.current.set(toUsername, { mood: "happy", expiresAt: now + 30000 });
        }

        activeInteractionsRef.current.push({
          id: Math.random().toString(),
          type: interactionType,
          emoji,
          resultText: result,
          color,
          uA: fromUsername,
          uB: toUsername,
          startedAt: now,
          expiresAt: now + 1500,
        });

        const key = [fromUsername, toUsername].sort().join(":");
        cooldownsRef.current.set(key, now + 10000);

        if (isMe) {
          playSound(interactionType as any);
        }
      }
    });

    // Broadcast position every 50ms while a key is held
    const interval = setInterval(() => {
      if (keysRef.current.size > 0 && socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: "move",
          x: posRef.current.x,
          y: posRef.current.y,
        }));
      }

      const now = Date.now();
      const meName = petState.gitData.username;
      
      for (const [id, player] of playersRef.current.entries()) {
        const dist = Math.hypot(player.x - posRef.current.x, player.y - posRef.current.y);
        if (dist <= 80) {
          if (!nearPlayersRef.current.has(id)) {
            nearPlayersRef.current.set(id, now);
          } else {
            const timeNear = now - nearPlayersRef.current.get(id)!;
            const key = [meName, id].sort().join(":");
            const cd = cooldownsRef.current.get(key) || 0;
            
            if (timeNear >= 3000 && now > cd) {
              const types = ["fight", "befriend", "play", "trade"] as const;
              const type = types[Math.floor(Math.random() * types.length)];
              
              let result = "INTERACTED!";
              if (type === "fight") result = "FOUGHT!";
              else if (type === "befriend") result = "NEW FRIEND!";
              else if (type === "play") result = "LET'S PLAY!";
              else if (type === "trade") result = "TRADED!";

              if (socket.readyState === 1) {
                socket.send(JSON.stringify({
                  type: "interaction",
                  fromUsername: meName,
                  toUsername: id,
                  interactionType: type,
                  result
                }));
              }
              cooldownsRef.current.set(key, now + 10000);
              nearPlayersRef.current.set(id, now); 
            }
          }
        } else {
          nearPlayersRef.current.delete(id);
        }
      }
    }, 50);

    return () => {
      clearInterval(interval);
      socket.close();
    };
  }, [petState]);

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

      const now = Date.now();
      activeInteractionsRef.current = activeInteractionsRef.current.filter(i => i.expiresAt > now);

      // Other players
      for (const [id, player] of playersRef.current.entries()) {
        if (id === petState.gitData.username) continue;
        const pf = (petFramesRef.current.get(id) ?? 0) + 1;
        petFramesRef.current.set(id, pf);
        const offscreen = document.createElement("canvas");
        offscreen.width = 72; offscreen.height = 72;
        const octx = offscreen.getContext("2d")!;
        octx.imageSmoothingEnabled = false;

        const tempState = { ...player.petState };
        const tempMoodInfo = tempMoodsRef.current.get(player.username);
        if (tempMoodInfo && tempMoodInfo.expiresAt > now) {
           tempState.mood = tempMoodInfo.mood as any;
        }
        let bounceOffY = 0;
        const playInteraction = activeInteractionsRef.current.find(i => i.type === "play" && (i.uA === id || i.uB === id));
        if (playInteraction) bounceOffY = Math.abs(Math.sin((now - playInteraction.startedAt) / 100)) * 10;

        drawPet(octx, tempState, pf, 72, 72, "front", player.species as any, { transparent: true });
        ctx.drawImage(offscreen, player.x - cam.x - 36, player.y - cam.y - 36 - bounceOffY, 72, 72);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(player.x - cam.x - 28, player.y - cam.y + 28, 56, 14);
        ctx.fillStyle = player.petState.primaryColor;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`@${player.username}`, player.x - cam.x, player.y - cam.y + 38);

        const cdKey = [petState.gitData.username, player.username].sort().join(":");
        const cd = cooldownsRef.current.get(cdKey);
        if (cd && cd > now) {
            ctx.fillStyle = "white";
            ctx.font = "8px monospace";
            ctx.fillText(`⏳ ${Math.ceil((cd - now) / 1000)}s`, player.x - cam.x, player.y - cam.y - 40);
        }
      }

      // Own pet
      const offscreen = document.createElement("canvas");
      offscreen.width = 72; offscreen.height = 72;
      const octx = offscreen.getContext("2d")!;
      octx.imageSmoothingEnabled = false;

      const myTempState = { ...petState };
      const myMoodInfo = tempMoodsRef.current.get(petState.gitData.username);
      if (myMoodInfo && myMoodInfo.expiresAt > now) {
         myTempState.mood = myMoodInfo.mood as any;
      }
      let myBounceOffY = 0;
      const myPlayInteraction = activeInteractionsRef.current.find(i => i.type === "play" && (i.uA === petState.gitData.username || i.uB === petState.gitData.username));
      if (myPlayInteraction) myBounceOffY = Math.abs(Math.sin((now - myPlayInteraction.startedAt) / 100)) * 10;

      drawPet(octx, myTempState, frame, 72, 72, "front", species as any, { transparent: true });
      ctx.drawImage(offscreen, x - cam.x - 36, y - cam.y - 36 - myBounceOffY, 72, 72);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - cam.x - 28, y - cam.y + 28, 56, 14);
      ctx.fillStyle = "#22c55e";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`@${petState.gitData.username}`, x - cam.x, y - cam.y + 38);

      for (const interaction of activeInteractionsRef.current) {
         const progress = (now - interaction.startedAt) / 1500;
         const offsetY = progress * 40;
         const alpha = Math.max(0, 1 - progress);
         
         ctx.textAlign = "center";
         
         const renderAt = (pX: number, pY: number) => {
            ctx.globalAlpha = alpha;
            ctx.font = "24px sans-serif";
            ctx.fillText(interaction.emoji, pX - cam.x, pY - cam.y - 40 - offsetY);
            ctx.font = "10px monospace";
            ctx.fillStyle = "white";
            ctx.fillText(interaction.resultText, pX - cam.x, pY - cam.y - 20 - offsetY);
            if (interaction.type === "play") {
               ctx.fillStyle = "#f59e0b";
               ctx.fillText("-NRG", pX - cam.x + 20, pY - cam.y - 30 - offsetY);
            }
            ctx.globalAlpha = 1;
         };

         if (interaction.uA === petState.gitData.username) renderAt(posRef.current.x, posRef.current.y);
         else {
            const p = playersRef.current.get(interaction.uA);
            if (p) renderAt(p.x, p.y);
         }

         if (interaction.uB === petState.gitData.username) renderAt(posRef.current.x, posRef.current.y);
         else {
            const p = playersRef.current.get(interaction.uB);
            if (p) renderAt(p.x, p.y);
         }
      }

      for (const interaction of activeInteractionsRef.current) {
         if (now - interaction.startedAt < 300) {
            ctx.fillStyle = `rgba(${interaction.color}, 0.15)`;
            ctx.fillRect(0, 0, W, H);
         }
      }

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

      {interactionTarget && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(2,6,23,0.95)", border: "2px solid #3b82f6", borderRadius: 16, padding: 24, width: 320, fontFamily: "monospace", zIndex: 101, boxShadow: "0 0 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(59,130,246,0.3)", backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
               <h3 style={{ margin: 0, color: "white", fontSize: 16 }}>@{interactionTarget.username}</h3>
               <span style={{ color: "#64748b", fontSize: 12 }}>{interactionTarget.species.toUpperCase()}</span>
            </div>
            <button onClick={() => setInteractionTarget(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          
          {[
            { label: "HP",  value: interactionTarget.petState.stats.health,       color: "#22c55e" },
            { label: "NRG", value: interactionTarget.petState.stats.energy,       color: "#f59e0b" },
            { label: "INT", value: interactionTarget.petState.stats.intelligence, color: "#3b82f6" },
            { label: "JOY", value: interactionTarget.petState.stats.happiness,    color: "#ec4899" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "#64748b", width: 28 }}>{label}</span>
              <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3 }}>
                <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: "#e2e8f0", width: 24, textAlign: "right" }}>{value}</span>
            </div>
          ))}
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
             <button onClick={() => {
                if (!socketRef.current) return;
                socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "fight", result: "FOUGHT!" }));
                cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                nearPlayersRef.current.set(interactionTarget.username, Date.now());
                setInteractionTarget(null);
             }} style={{ padding: "12px", background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8, color: "white", cursor: "pointer" }}>⚔️ FIGHT</button>
             <button onClick={() => {
                if (!socketRef.current) return;
                socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "befriend", result: "NEW FRIEND!" }));
                cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                nearPlayersRef.current.set(interactionTarget.username, Date.now());
                setInteractionTarget(null);
             }} style={{ padding: "12px", background: "#064e3b", border: "1px solid #10b981", borderRadius: 8, color: "white", cursor: "pointer" }}>💛 BEFRIEND</button>
             <button onClick={() => {
                if (!socketRef.current) return;
                socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "play", result: "LET'S PLAY!" }));
                cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                nearPlayersRef.current.set(interactionTarget.username, Date.now());
                setInteractionTarget(null);
             }} style={{ padding: "12px", background: "#1e3a8a", border: "1px solid #3b82f6", borderRadius: 8, color: "white", cursor: "pointer" }}>🎮 PLAY</button>
             <button onClick={() => {
                if (!socketRef.current) return;
                socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "trade", result: "TRADED!" }));
                cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                nearPlayersRef.current.set(interactionTarget.username, Date.now());
                setInteractionTarget(null);
             }} style={{ padding: "12px", background: "#713f12", border: "1px solid #eab308", borderRadius: 8, color: "white", cursor: "pointer" }}>✨ TRADE</button>
          </div>
        </div>
      )}

      {interactionTarget && (
         <div onClick={() => setInteractionTarget(null)} style={{position: "absolute", top:0, left:0, width:"100%", height:"100%", zIndex: 100}} />
      )}

      <div style={{ position: "absolute", top: 44, left: 12 }}>
        <Link href="/" style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", textDecoration: "none", letterSpacing: 1 }}>
          ← HOME
        </Link>
      </div>
    </div>
  );
}