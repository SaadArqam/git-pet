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
  friendCount: number;
  buffs: string[];
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

    if (type === "fight") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);

      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.connect(thudGain); thudGain.connect(ctx.destination);
      thud.type = "sine";
      thud.frequency.setValueAtTime(80, ctx.currentTime + 0.4);
      thudGain.gain.setValueAtTime(0.5, ctx.currentTime + 0.4);
      thudGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      thud.start(ctx.currentTime + 0.4); thud.stop(ctx.currentTime + 0.5);

    } else if (type === "befriend") {
      const playTone = (freq: number, start: number) => {
        const osc1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        osc1.connect(g1); g1.connect(ctx.destination);
        osc1.type = "sine";
        osc1.frequency.value = freq;
        g1.gain.setValueAtTime(0.3, start);
        g1.gain.linearRampToValueAtTime(0, start + 0.4);
        osc1.start(start); osc1.stop(start + 0.4);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.value = freq + 5;
        g2.gain.setValueAtTime(0.08, start);
        g2.gain.linearRampToValueAtTime(0, start + 0.4);
        osc2.start(start); osc2.stop(start + 0.4);
      };
      playTone(440, ctx.currentTime);
      playTone(660, ctx.currentTime + 0.4);

    } else if (type === "play") {
      const freqs = [330, 415, 494];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "square";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.15 + 0.15);
        o.start(ctx.currentTime + i * 0.15);
        o.stop(ctx.currentTime + i * 0.15 + 0.15);
      });
    } else if (type === "trade") {
      const freqs = [261, 329, 392, 523];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.12 + 0.12);
        o.start(ctx.currentTime + i * 0.12);
        o.stop(ctx.currentTime + i * 0.12 + 0.12);
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
    friendCount: presence.friendCount ?? 0,
    buffs: presence.buffs ?? [],
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
        totalCommits: 0,
        streak: 0,
        stars: 0,
        languages: [],
        daysSinceCommit: 0,
        commitsThisWeek: 0,
        repoCount: 0,
        prsMerged: 0,
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
  const activeInteractionsRef = useRef<{id:string, type:string, emoji:string, resultText:string, color:string, uA:string, uB:string, startedAt:number, expiresAt:number, customVis?: string}[]>([]);
  const tempMoodsRef = useRef<Map<string, { mood: string, expiresAt: number }>>(new Map());
  const cooldownsRef = useRef<Map<string, number>>(new Map());
  const nearPlayersRef = useRef<Map<string, number>>(new Map());
  const myFriendCountRef = useRef(0);
  const myBuffsRef = useRef<Set<string>>(new Set());
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
          friendCount: myFriendCountRef.current,
          buffs: Array.from(myBuffsRef.current),
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

      if (msg.type === "presence_update") {
        if (msg.pet.username === petState.gitData.username) return;
        playersRef.current.set(msg.pet.username, presenceToPlayer(msg.pet));
      }

      if (msg.type === "interaction") {
        const { fromUsername, toUsername, interactionType, result } = msg;

        const isMe =
          fromUsername === petState.gitData.username ||
          toUsername === petState.gitData.username;

        let emoji = "✨";
        let color = "255, 215, 0"; 
        if (interactionType === "fight") { emoji = "⚔️"; color = "239, 68, 68"; }
        else if (interactionType === "befriend") { emoji = "❤️"; color = "16, 185, 129"; }
        else if (interactionType === "play") { emoji = "🎮"; color = "59, 130, 246"; }

        const now = Date.now();
        let customVis = undefined;
        let finalResult = result;

        if (interactionType === "fight") {
           const pA = fromUsername === petState.gitData.username ? petState.gitData : playersRef.current.get(fromUsername)?.petState.gitData;
           const pB = toUsername === petState.gitData.username ? petState.gitData : playersRef.current.get(toUsername)?.petState.gitData;
           let loser = "";
           if (pA && pB) {
              if (pA.totalCommits !== pB.totalCommits) loser = pA.totalCommits > pB.totalCommits ? toUsername : fromUsername;
              else if (pA.streak !== pB.streak) loser = pA.streak > pB.streak ? toUsername : fromUsername;
              else loser = Math.random() > 0.5 ? fromUsername : toUsername;
           } else {
              loser = Math.random() > 0.5 ? fromUsername : toUsername;
           }
           tempMoodsRef.current.set(loser, { mood: "sad", expiresAt: now + 30000 });
           customVis = loser;
        } else if (interactionType === "befriend") {
           if (isMe) {
              myFriendCountRef.current += 1;
              socketRef.current?.send(JSON.stringify({
                 type: "presence_update",
                 pet: { username: petState.gitData.username, friendCount: myFriendCountRef.current, buffs: Array.from(myBuffsRef.current) }
              }));
           }
        } else if (interactionType === "trade") {
           if (isMe && finalResult.includes(" → ")) {
               const parts = finalResult.split(" → ");
               let myNewBuff = "";
               if (petState.gitData.username === fromUsername) {
                   myNewBuff = parts[1].split(" gave ")[1];
               } else {
                   myNewBuff = parts[0].split(" gave ")[1];
               }
               
               if (myNewBuff) {
                  myBuffsRef.current.add(myNewBuff);
                  socketRef.current?.send(JSON.stringify({
                     type: "presence_update",
                     pet: { username: petState.gitData.username, friendCount: myFriendCountRef.current, buffs: Array.from(myBuffsRef.current) }
                  }));
                  setTimeout(() => {
                     myBuffsRef.current.delete(myNewBuff);
                     if (socketRef.current?.readyState === 1) {
                       socketRef.current.send(JSON.stringify({
                          type: "presence_update",
                          pet: { username: petState.gitData.username, friendCount: myFriendCountRef.current, buffs: Array.from(myBuffsRef.current) }
                       }));
                     }
                  }, 5 * 60 * 1000);
               }
           }
        }

        activeInteractionsRef.current.push({
          id: Math.random().toString(),
          type: interactionType,
          emoji,
          resultText: finalResult,
          color,
          uA: fromUsername,
          uB: toUsername,
          startedAt: now,
          expiresAt: now + (interactionType === "play" ? 3000 : 2000),
          customVis,
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
              else if (type === "trade") {
                 const avail = ["⚡ Speed Boost", "🌟 Star Power", "🔥 Fire Trail", "❄️ Ice Aura", "🌈 Rainbow Mode", "💎 Diamond Shield"];
                 const buffA = avail[Math.floor(Math.random() * avail.length)];
                 const buffB = avail[Math.floor(Math.random() * avail.length)];
                 result = `@${meName} gave ${buffA} → @${id} gave ${buffB}`;
              }

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

      let shakeX = 0; let shakeY = 0;
      const shakeFight = activeInteractionsRef.current.find(i => i.type === "fight" && (now - i.startedAt) < 100 && (i.uA === petState.gitData.username || i.uB === petState.gitData.username));
      if (shakeFight) {
         shakeX = (Math.random() - 0.5) * 8;
         shakeY = (Math.random() - 0.5) * 8;
      }

      ctx.save();
      if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

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
        
        let drawShield = false;
        if (tempMoodInfo && tempMoodInfo.expiresAt > now && tempMoodInfo.mood === "sad") drawShield = true;
        
        ctx.fillText(`@${player.username}`, player.x - cam.x, player.y - cam.y + 38);
        if (drawShield) ctx.fillText("🛡️", player.x - cam.x + 30, player.y - cam.y + 38);
        if (player.friendCount) ctx.fillText(`👥 ${player.friendCount}`, player.x - cam.x, player.y - cam.y + 48);
        
        if (player.buffs && player.buffs.length > 0) {
           player.buffs.slice(0, 3).forEach((buff, idx) => {
              ctx.fillStyle = "#1e293b";
              const w = ctx.measureText(buff).width + 4;
              ctx.fillRect(player.x - cam.x - w/2, player.y - cam.y + 52 + idx * 10, w, 10);
              ctx.fillStyle = "white";
              ctx.fillText(buff, player.x - cam.x, player.y - cam.y + 60 + idx * 10);
           });
        }

        const cdKey = [petState.gitData.username, player.username].sort().join(":");
        const cd = cooldownsRef.current.get(cdKey);
        if (cd && cd > now) {
            const ratio = (cd - now) / 10000;
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(player.x - cam.x, player.y - cam.y - 45, 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * ratio));
            ctx.stroke();
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
      
      let myDrawShield = false;
      if (myMoodInfo && myMoodInfo.expiresAt > now && myMoodInfo.mood === "sad") myDrawShield = true;
      
      ctx.fillText(`@${petState.gitData.username}`, x - cam.x, y - cam.y + 38);
      if (myDrawShield) ctx.fillText("🛡️", x - cam.x + 30, y - cam.y + 38);
      if (myFriendCountRef.current) ctx.fillText(`👥 ${myFriendCountRef.current}`, x - cam.x, y - cam.y + 48);

      const myBuffsArr = Array.from(myBuffsRef.current);
      if (myBuffsArr.length > 0) {
         myBuffsArr.slice(0, 3).forEach((buff, idx) => {
            ctx.fillStyle = "#1e293b";
            const w = ctx.measureText(buff).width + 4;
            ctx.fillRect(x - cam.x - w/2, y - cam.y + 52 + idx * 10, w, 10);
            ctx.fillStyle = "white";
            ctx.fillText(buff, x - cam.x, y - cam.y + 60 + idx * 10);
         });
      }

      let someoneNear = false;
      for (const player of playersRef.current.values()) {
        if (Math.hypot(player.x - posRef.current.x, player.y - posRef.current.y) <= 80) someoneNear = true;
      }
      if (someoneNear) {
         ctx.strokeStyle = petState.primaryColor;
         ctx.setLineDash([4, 4]);
         ctx.globalAlpha = 0.2 + 0.3 * Math.abs(Math.sin(now / 300));
         ctx.beginPath();
         ctx.arc(x - cam.x, y - cam.y, 80, 0, Math.PI * 2);
         ctx.stroke();
         ctx.setLineDash([]);
         ctx.globalAlpha = 1;
      }

      for (const interaction of activeInteractionsRef.current) {
         const progress = (now - interaction.startedAt) / (interaction.expiresAt - interaction.startedAt);
         const offsetY = progress * 60;
         const alpha = Math.max(0, 1 - progress);
         
         ctx.textAlign = "center";
         
         const renderAt = (pX: number, pY: number, pName: string) => {
            const rx = pX - cam.x;
            const ry = pY - cam.y;

            if (interaction.type === "befriend") {
                ctx.globalAlpha = alpha;
                for (let i = 0; i < 6; i++) {
                   const seed = (i + 1) * 123.45;
                   const xOff = Math.sin(progress * 10 + seed) * 10 - 20 + (i * 8);
                   ctx.font = (i % 2 === 0) ? "20px sans-serif" : "14px sans-serif";
                   ctx.fillText("❤️", rx + xOff, ry - 30 - offsetY * (0.5 + i*0.1));
                }
                ctx.globalAlpha = 1;
            } else if (interaction.type === "fight") {
                const isLoser = interaction.customVis === pName;
                ctx.globalAlpha = alpha;
                ctx.font = "24px sans-serif";
                if (isLoser) {
                    ctx.fillText("💔", rx, ry - 40 - offsetY);
                    const drainProg = Math.min(1, Math.max(0, (now - interaction.startedAt) / 500));
                    const w = 40;
                    ctx.fillStyle = "black"; ctx.fillRect(rx - w/2, ry - 70 - offsetY, w, 6);
                    ctx.fillStyle = "red"; ctx.fillRect(rx - w/2, ry - 70 - offsetY, w * (1 - drainProg * 0.3), 6);
                    ctx.font = "10px monospace";
                    ctx.fillText("-30 HP", rx, ry - 80 - offsetY);
                } else {
                    ctx.fillText("⭐", rx, ry - 40 - offsetY);
                }
                ctx.globalAlpha = 1;
            } else if (interaction.type === "play") {
                ctx.globalAlpha = alpha;
                const emojis = ["🎮", "🎲", "🎯"];
                emojis.forEach((em, i) => {
                   ctx.font = "16px sans-serif";
                   const xOff = (i - 1) * 15;
                   const yOff = Math.sin(progress * Math.PI + i) * 15;
                   ctx.fillText(em, rx + xOff, ry - 40 - offsetY + yOff);
                });
                ctx.globalAlpha = 1;
            } else if (interaction.type === "trade") {
                ctx.globalAlpha = alpha;
                for (let i = 0; i < 8; i++) {
                   const angle = (i / 8) * Math.PI * 2 + progress;
                   const dist = progress * 40;
                   ctx.font = "12px sans-serif";
                   ctx.fillText("✨", rx + Math.cos(angle)*dist, ry - 30 + Math.sin(angle)*dist);
                }
                ctx.globalAlpha = 1;
            }
         };

         if (interaction.uA === petState.gitData.username) renderAt(posRef.current.x, posRef.current.y, interaction.uA);
         else {
            const p = playersRef.current.get(interaction.uA);
            if (p) renderAt(p.x, p.y, interaction.uA);
         }

         if (interaction.uB === petState.gitData.username) renderAt(posRef.current.x, posRef.current.y, interaction.uB);
         else {
            const p = playersRef.current.get(interaction.uB);
            if (p) renderAt(p.x, p.y, interaction.uB);
         }

         let pAx = 0, pAy = 0, pBx = 0, pBy = 0;
         if (interaction.uA === petState.gitData.username) { pAx = posRef.current.x; pAy = posRef.current.y; }
         else { const p = playersRef.current.get(interaction.uA); if(p) { pAx = p.x; pAy = p.y; } }
         if (interaction.uB === petState.gitData.username) { pBx = posRef.current.x; pBy = posRef.current.y; }
         else { const p = playersRef.current.get(interaction.uB); if(p) { pBx = p.x; pBy = p.y; } }

         if (pAx && pBx) {
            const cx = (pAx + pBx) / 2 - cam.x;
            const cy = (pAy + pBy) / 2 - cam.y;

            if (interaction.type === "fight") {
               ctx.globalAlpha = alpha;
               ctx.font = "24px sans-serif";
               ctx.fillText("⚔️", cx, cy - 20);
               ctx.globalAlpha = 1;
            } else if (interaction.type === "play") {
               if (now - interaction.startedAt < 1000) {
                  const confProg = (now - interaction.startedAt) / 1000;
                  ctx.globalAlpha = 1 - confProg;
                  const colors = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"];
                  for (let i = 0; i < 12; i++) {
                     const seed = i * 99;
                     const angle = (seed % 360) * (Math.PI/180);
                     const speed = 20 + (seed % 30);
                     const cX = cx + Math.cos(angle) * speed * confProg;
                     const cY = cy + Math.sin(angle) * speed * confProg + (confProg * confProg * 20);
                     ctx.fillStyle = colors[i % colors.length];
                     ctx.fillRect(cX, cY, 4, 4);
                  }
                  ctx.globalAlpha = 1;
               }
            }

            // Results text (Trade output etc)
            ctx.globalAlpha = alpha;
            ctx.font = "10px monospace";
            ctx.fillStyle = "white";
            ctx.fillText(interaction.resultText, cx, cy - 60 - offsetY);
            ctx.globalAlpha = 1;
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

      if (interactionTarget) {
         const tCanvas = document.createElement("canvas");
         tCanvas.width = 60; tCanvas.height = 60;
         const tCtx = tCanvas.getContext("2d")!;
         tCtx.imageSmoothingEnabled = false;
         
         const targetState = { ...interactionTarget.petState };
         const targetMoodInfo = tempMoodsRef.current.get(interactionTarget.username);
         if (targetMoodInfo && targetMoodInfo.expiresAt > now) {
            targetState.mood = targetMoodInfo.mood as any;
         }
         
         const pf = (petFramesRef.current.get(interactionTarget.username) ?? 0);
         drawPet(tCtx, targetState, pf, 60, 60, "front", interactionTarget.species as any, { transparent: true });
         
         const img = document.getElementById("interaction-target-sprite") as HTMLImageElement;
         if (img) img.src = tCanvas.toDataURL();
      }

      ctx.restore();
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
               <img id="interaction-target-sprite" width={60} height={60} style={{ imageRendering: "pixelated", background: "#0f172a", borderRadius: 8 }} />
               <div>
                  <h3 style={{ margin: 0, color: "white", fontSize: 16 }}>@{interactionTarget.username}</h3>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{interactionTarget.species.toUpperCase()}</span>
                  {(interactionTarget.friendCount && interactionTarget.friendCount > 0) ? <span style={{ marginLeft: 8, color: "#10b981", fontSize: 12 }}>👥 {interactionTarget.friendCount}</span> : null}
               </div>
            </div>
            <button onClick={() => setInteractionTarget(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, height: 24 }}>✕</button>
          </div>

          <div style={{ marginTop: 12, marginBottom: 12, color: "#94a3b8", fontSize: 11 }}>
             💻 {interactionTarget.petState.gitData.totalCommits} commits · 🔥 {interactionTarget.petState.gitData.streak}d streak
          </div>

          {interactionTarget.buffs && interactionTarget.buffs.length > 0 && (
             <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
               {interactionTarget.buffs.map(b => <span key={b} style={{ background: "#1e293b", padding: "2px 6px", borderRadius: 4, fontSize: 10, color: "white" }}>{b}</span>)}
             </div>
          )}
          
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
             {(() => {
                const key = [petState.gitData.username, interactionTarget.username].sort().join(":");
                const cd = cooldownsRef.current.get(key) || 0;
                const isOnCooldown = cd > Date.now();
                const remaining = Math.ceil((cd - Date.now()) / 1000);

                const getBtnStyle = (base: string, border: string) => ({
                   padding: "12px", background: isOnCooldown ? "#1e293b" : base, border: `1px solid ${isOnCooldown ? "#334155" : border}`, borderRadius: 8, color: isOnCooldown ? "#64748b" : "white", cursor: isOnCooldown ? "not-allowed" : "pointer"
                });

                return (
                   <>
                     <button disabled={isOnCooldown} onClick={() => {
                        if (!socketRef.current) return;
                        socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "fight", result: "FOUGHT!" }));
                        cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                        nearPlayersRef.current.set(interactionTarget.username, Date.now());
                        setInteractionTarget(null);
                     }} style={getBtnStyle("#7f1d1d", "#ef4444")}>⚔️ FIGHT {isOnCooldown && `(${remaining}s)`}</button>
                     <button disabled={isOnCooldown} onClick={() => {
                        if (!socketRef.current) return;
                        socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "befriend", result: "NEW FRIEND!" }));
                        cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                        nearPlayersRef.current.set(interactionTarget.username, Date.now());
                        setInteractionTarget(null);
                     }} style={getBtnStyle("#064e3b", "#10b981")}>❤️ BEFRIEND {isOnCooldown && `(${remaining}s)`}</button>
                     <button disabled={isOnCooldown} onClick={() => {
                        if (!socketRef.current) return;
                        socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "play", result: "LET'S PLAY!" }));
                        cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                        nearPlayersRef.current.set(interactionTarget.username, Date.now());
                        setInteractionTarget(null);
                     }} style={getBtnStyle("#1e3a8a", "#3b82f6")}>🎮 PLAY {isOnCooldown && `(${remaining}s)`}</button>
                     <button disabled={isOnCooldown} onClick={() => {
                        if (!socketRef.current) return;
                        socketRef.current.send(JSON.stringify({ type: "interaction", fromUsername: petState.gitData.username, toUsername: interactionTarget.username, interactionType: "trade", result: "TRADED!" }));
                        cooldownsRef.current.set([petState.gitData.username, interactionTarget.username].sort().join(":"), Date.now() + 10000);
                        nearPlayersRef.current.set(interactionTarget.username, Date.now());
                        setInteractionTarget(null);
                     }} style={getBtnStyle("#713f12", "#eab308")}>✨ TRADE {isOnCooldown && `(${remaining}s)`}</button>
                   </>
                );
             })()}
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