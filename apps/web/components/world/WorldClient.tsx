"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PetState } from "@git-pet/core";
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
  // ── existing refs ──────────────────────────────────────────────
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

  // ── 1A: new refs ───────────────────────────────────────────────
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const mounted = useRef(true);
  const rendererRef = useRef<any>(null);
  const cleanupFns = useRef<(() => void)[]>([]);
  const broadcastRef = useRef<any>(null);
  const activeOverlayRef = useRef<string | null>(null);
  const biomeStateRef = useRef<string>('CHERRY');
  const joystickRef = useRef({ active: false, dx: 0, dy: 0 });

  // ── existing state ─────────────────────────────────────────────
  const [interactionTarget, setInteractionTarget] = useState<Player | null>(null);
  const [inspecting, setInspecting] = useState<Player | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [size, setSize] = useState({ w: 1280, h: 800 });

  // ── 1A: new state ──────────────────────────────────────────────
  const [currentBiomeState, setCurrentBiomeState] = useState('CHERRY');
  const [interactPrompt, setInteractPrompt] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [joystick, setJoystick] = useState({ active: false, dx: 0, dy: 0 });

  // mounted flag cleanup
  useEffect(() => () => { mounted.current = false; }, []);

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

  // ── Three.js bootstrap (Parts 1-5 fill this out) ──────────────
  useEffect(() => {
    let effectActive = true;

    const init = async () => {
      if (!canvasRef.current) return;

      // 1B ── load Three.js ──────────────────────────────────────
      const loadScript = (src: string): Promise<void> =>
        new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
          const s = document.createElement('script');
          s.src = src; s.onload = () => resolve(); s.onerror = reject;
          document.head.appendChild(s);
        });

      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      );
      if (!effectActive) return;
      const THREE = (window as any).THREE;

      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current!, antialias: true, alpha: false,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const sceneFog = new THREE.FogExp2(0xb8cce0, 0.012);
      scene.fog = sceneFog;
      scene.background = new THREE.Color(0x87b4d0);

      const camera = new THREE.PerspectiveCamera(
        60, window.innerWidth / window.innerHeight, 0.1, 200
      );
      camera.position.set(60, 7, 0);
      camera.lookAt(60, 2, -20);

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);
      cleanupFns.current.push(() => window.removeEventListener('resize', onResize));

      // 1C ── world constants ────────────────────────────────────
      const WORLD_SIZE = 200;
      const SPAWN = new THREE.Vector3(60, 0.5, -20);
      const PROXIMITY_RANGE = 6.0;

      const BIOMES = {
        CHERRY:   { minX:   0, maxX: 100, minZ: -100, maxZ:   0 },
        BAMBOO:   { minX:   0, maxX: 100, minZ:    0, maxZ: 100 },
        OCEAN:    { minX:-100, maxX:   0, minZ:    0, maxZ: 100 },
        VOLCANIC: { minX:-100, maxX:   0, minZ: -100, maxZ:   0 },
        TUNDRA:   { minX: -50, maxX:  50, minZ: -100, maxZ:-140 },
      };
      const BIOME_FOG = {
        CHERRY:   { color: 0xb8cce0, density: 0.012 },
        BAMBOO:   { color: 0x8ab89a, density: 0.022 },
        OCEAN:    { color: 0x6090c0, density: 0.018 },
        VOLCANIC: { color: 0x4a2010, density: 0.015 },
        TUNDRA:   { color: 0xd0e8f8, density: 0.014 },
      };
      const BIOME_SKY = {
        CHERRY:   0x87b4d0,
        BAMBOO:   0x6a9a7a,
        OCEAN:    0x4a80c0,
        VOLCANIC: 0x3a1808,
        TUNDRA:   0xb0d4f0,
      };
      const BIOME_LIGHTS = {
        CHERRY:   { sunColor: 0xffd4a0, sunInt: 2.4, ambColor: 0xffe8c0, ambInt: 0.55, hemiSky: 0x87ceeb, hemiGnd: 0x4a6741 },
        BAMBOO:   { sunColor: 0x90d4a0, sunInt: 1.8, ambColor: 0xc8e8c0, ambInt: 0.60, hemiSky: 0x6a9a7a, hemiGnd: 0x3a6a3a },
        OCEAN:    { sunColor: 0xa0c8ff, sunInt: 2.0, ambColor: 0xb0d0ff, ambInt: 0.50, hemiSky: 0x4a80c0, hemiGnd: 0x204060 },
        VOLCANIC: { sunColor: 0xff6030, sunInt: 1.6, ambColor: 0xff8040, ambInt: 0.70, hemiSky: 0x3a1808, hemiGnd: 0x200808 },
        TUNDRA:   { sunColor: 0xd0e8ff, sunInt: 1.4, ambColor: 0xe0f0ff, ambInt: 0.80, hemiSky: 0xb0d4f0, hemiGnd: 0xd0e8f8 },
      };
      function getBiome(x: number, z: number): keyof typeof BIOMES {
        if (z < -80) return 'TUNDRA';
        if (x < 0 && z < 0) return 'VOLCANIC';
        if (x < 0 && z >= 0) return 'OCEAN';
        if (x >= 0 && z >= 0) return 'BAMBOO';
        return 'CHERRY';
      }

      // 1D ── lighting ───────────────────────────────────────────
      const sun = new THREE.DirectionalLight(0xffd4a0, 2.4);
      sun.position.set(40, 60, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 200;
      sun.shadow.camera.left = -80;
      sun.shadow.camera.right = 80;
      sun.shadow.camera.top = 80;
      sun.shadow.camera.bottom = -80;
      sun.shadow.bias = -0.001;
      scene.add(sun);

      const fillLight = new THREE.DirectionalLight(0x9bb8d4, 0.7);
      fillLight.position.set(-30, 20, -20);
      scene.add(fillLight);

      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.4);
      scene.add(hemiLight);

      function updateBiomeLighting(biome: keyof typeof BIOMES) {
        const t = BIOME_LIGHTS[biome];
        sun.color.lerp(new THREE.Color(t.sunColor), 0.02);
        sun.intensity += (t.sunInt - sun.intensity) * 0.02;
        ambientLight.color.lerp(new THREE.Color(t.ambColor), 0.02);
        ambientLight.intensity += (t.ambInt - ambientLight.intensity) * 0.02;
        hemiLight.color.lerp(new THREE.Color(t.hemiSky), 0.02);
        hemiLight.groundColor.lerp(new THREE.Color(t.hemiGnd), 0.02);
        sceneFog.color.lerp(new THREE.Color(BIOME_FOG[biome].color), 0.02);
        sceneFog.density += (BIOME_FOG[biome].density - sceneFog.density) * 0.02;
        if (scene.background instanceof THREE.Color) {
          scene.background.lerp(new THREE.Color(BIOME_SKY[biome]), 0.02);
        }
      }

      // 1E ── core helpers ───────────────────────────────────────
      function darken(hex: string, f: number): string {
        const c = new THREE.Color(hex);
        return '#' + [c.r, c.g, c.b]
          .map((v: number) => Math.floor(v * f * 255).toString(16).padStart(2, '0'))
          .join('');
      }

      function vox(
        x: number, y: number, z: number,
        color: number | string,
        w = 1, h = 1, d = 1,
        cast = false, receive = false
      ) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = cast;
        m.receiveShadow = receive;
        scene.add(m);
        return m;
      }

      function addBoxToGroup(
        g: any,
        x: number, y: number, z: number,
        w: number, h: number, d: number,
        color: number | string,
        cast = false
      ) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = cast;
        g.add(mesh);
        return mesh;
      }

      // 1F ── shared animation arrays ────────────────────────────
      const toriiBars: any[] = [];
      const lanternMats: any[] = [];
      const lavaLights: any[] = [];
      const waterMats: any[] = [];
      const koiData: any[] = [];
      const allParticles: { mesh: any; data: any[]; type: string }[] = [];
      const auroraMeshes: { mesh: any; mat: any; phase: number }[] = [];
      let lightBeam: any = null;

      // suppress unused-until-later warnings (used in Parts 3-6)
      void WORLD_SIZE; void SPAWN; void PROXIMITY_RANGE; void BIOMES;
      void updateBiomeLighting; void darken;
      void setCurrentBiomeState; void setInteractPrompt; void setIsMobile; void setJoystick;
      void currentBiomeState; void interactPrompt; void isMobile; void joystick;
      void biomeStateRef; void joystickRef; void activeOverlayRef;
      void frameRef; void petFramesRef; void size; void inspecting;

      // ── 2A: World Ground Plane ────────────────────────────────────────
      const groundGeo = new THREE.PlaneGeometry(240, 240, 80, 80);
      groundGeo.rotateX(-Math.PI / 2);
      const gColors: number[] = [];
      const gPos = groundGeo.attributes.position;
      for (let i = 0; i < gPos.count; i++) {
        const gx = gPos.getX(i);
        const gz = gPos.getZ(i);
        const biome = getBiome(gx, gz);
        const noise = Math.sin(gx * 2.1) * Math.cos(gz * 1.8) * 0.5 + 0.5;
        const GROUND_COLS: Record<string, number[][]> = {
          CHERRY:   [[0.28,0.54,0.22],[0.32,0.60,0.26],[0.26,0.50,0.20]],
          BAMBOO:   [[0.22,0.48,0.18],[0.26,0.52,0.22],[0.20,0.44,0.16]],
          OCEAN:    [[0.28,0.38,0.20],[0.22,0.32,0.18],[0.30,0.40,0.22]],
          VOLCANIC: [[0.15,0.10,0.08],[0.12,0.08,0.06],[0.18,0.12,0.08]],
          TUNDRA:   [[0.90,0.92,0.95],[0.85,0.88,0.92],[0.88,0.90,0.94]],
        };
        const cols = GROUND_COLS[biome]!;
        const col = cols[noise < 0.33 ? 0 : noise < 0.66 ? 1 : 2]!;
        gColors.push(...col);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(gColors, 3));
      const groundMesh = new THREE.Mesh(
        groundGeo,
        new THREE.MeshLambertMaterial({ vertexColors: true })
      );
      groundMesh.receiveShadow = true;
      scene.add(groundMesh);

      // Sky dome
      const skyGeo = new THREE.SphereGeometry(180, 16, 8);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0x7db8d4, side: THREE.BackSide });
      scene.add(new THREE.Mesh(skyGeo, skyMat));

      // ── 2B: Shared building helpers ────────────────────────────────────
      function buildTorii(x: number, z: number, rotY = 0) {
        const grp = new THREE.Group();
        const red = 0xcc3300, dark = 0x992200;
        for (let py = 0; py < 5; py++) {
          addBoxToGroup(grp, -2, py + 0.5, 0, 1, 1, 0.35, red, true);
          addBoxToGroup(grp, 2, py + 0.5, 0, 1, 1, 0.35, red, true);
        }
        const k = addBoxToGroup(grp, 0, 5.3, 0, 7, 0.45, 0.5, dark, true);
        const s = addBoxToGroup(grp, 0, 4.6, 0, 6, 0.35, 0.45, red, true);
        toriiBars.push(k, s);
        addBoxToGroup(grp, -2, 4.6, 0, 0.25, 0.8, 0.35, dark);
        addBoxToGroup(grp, 2, 4.6, 0, 0.25, 0.8, 0.35, dark);
        grp.position.set(x, 0, z);
        grp.rotation.y = rotY;
        scene.add(grp);
      }

      function buildLantern(x: number, z: number) {
        vox(x, 0.2, z, 0x888880, 0.85, 0.45, 0.85);
        vox(x, 0.65, z, 0x888880, 0.45, 0.6, 0.45);
        vox(x, 1.1, z, 0x888880, 0.45, 0.55, 0.45);
        const lGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
        const lMat = new THREE.MeshLambertMaterial({
          color: 0xffcc66,
          emissive: new THREE.Color(0xffaa22),
          emissiveIntensity: 1.0,
        });
        const lMesh = new THREE.Mesh(lGeo, lMat);
        lMesh.position.set(x, 1.75, z);
        lMesh.castShadow = true;
        scene.add(lMesh);
        lanternMats.push(lMat);
        vox(x, 2.15, z, 0x888880, 0.95, 0.2, 0.95);
        const pl = new THREE.PointLight(0xffaa22, 1.4, 8);
        pl.position.set(x, 1.8, z);
        scene.add(pl);
      }

      function buildCherryTree(x: number, z: number, h: number) {
        for (let ty = 0; ty < h; ty++) {
          vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true);
        }
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let bx = -3; bx <= 3; bx++) {
          for (let by = -1; by <= 2; by++) {
            for (let bz = -3; bz <= 3; bz++) {
              const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz);
              if (dist < 3.2 && Math.random() > dist * 0.15) {
                vox(x + bx * 0.88, h + by * 0.88, z + bz * 0.88,
                  blossoms[Math.floor(Math.random() * 4)]!, 0.85, 0.85, 0.85, true);
              }
            }
          }
        }
      }

      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        for (let s = 0; s < 3; s++) {
          for (let sx = -(3 - s); sx <= (3 - s); sx++) {
            for (let sz = -(2 - s); sz <= (2 - s); sz++) {
              vox(x + sx, s * 0.45, z + sz + 3, stone, 1, 0.45, 1, false, true);
            }
          }
        }
        for (let wx = -3; wx <= 3; wx++) {
          for (let wy = 0; wy < 4; wy++) {
            for (let wz = -2; wz <= 2; wz++) {
              const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0;
              if (!isWall) continue;
              const isDoor = wx === 0 && wz === -2 && wy < 2;
              if (isDoor) continue;
              const isWin = Math.abs(wx) === 2 && wz === -2 && wy === 1;
              const m = vox(x + wx, 1.4 + wy, z + wz, isWin ? 0xffcc66 : wood, 1, 1, 1, true);
              if (isWin) {
                m.material.emissive = new THREE.Color(0xffaa22);
                m.material.emissiveIntensity = 1.2;
              }
            }
          }
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry;
          for (let rx = -(3 + ext); rx <= (3 + ext); rx++) {
            for (let rz = -(2 + ext); rz <= (2 + ext); rz++) {
              const isEdge = Math.abs(rx) === 3 + ext || Math.abs(rz) === 2 + ext;
              if (!isEdge && ry > 0) continue;
              vox(x + rx, 5.4 + ry * 0.5, z + rz, ry === 0 ? 0x3a2f1e : roof, 1, 0.4, 1, true);
            }
          }
        }
      }

      function buildKoiPond(cx: number, cz: number, w: number, d: number) {
        for (let bx = -w / 2; bx <= w / 2; bx++) {
          for (let bz = -d / 2; bz <= d / 2; bz++) {
            if (Math.abs(bx) > w / 2 - 1 || Math.abs(bz) > d / 2 - 1) {
              vox(cx + bx, 0.1, cz + bz, 0x7a7a7a, 1, 0.22, 1);
            }
          }
        }
        const wGeo = new THREE.PlaneGeometry(w - 1.5, d - 1.5);
        wGeo.rotateX(-Math.PI / 2);
        const wMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
        const wMesh = new THREE.Mesh(wGeo, wMat);
        wMesh.position.set(cx, 0.1, cz);
        scene.add(wMesh);
        waterMats.push(wMat);
        for (let l = 0; l < Math.floor(w * d / 8); l++) {
          vox(cx + (Math.random() - 0.5) * (w - 2), 0.13,
              cz + (Math.random() - 0.5) * (d - 2), 0x3a8a3a, 0.7, 0.06, 0.7);
        }
        const kCount = Math.floor(w * d / 12);
        for (let k = 0; k < kCount; k++) {
          const km = vox(cx, 0.12, cz,
            ([0xff6633, 0xff4400, 0xffaa44, 0xffffff, 0xff8800] as number[])[k % 5]!, 0.5, 0.15, 0.9);
          koiData.push({
            mesh: km, cx, cz,
            angle: (k / kCount) * Math.PI * 2,
            radius: 1.5 + Math.random() * (Math.min(w, d) / 2 - 2),
            speed: 0.004 + Math.random() * 0.003,
          });
        }
      }

      function buildSignpost(x: number, z: number, text: string, rotY = 0) {
        const grp = new THREE.Group();
        addBoxToGroup(grp, 0, 0.8, 0, 0.2, 1.6, 0.2, 0x6b4423, true);
        addBoxToGroup(grp, 0, 1.75, 0, 1.8, 0.7, 0.12, 0x8B6914, true);
        const sc = document.createElement('canvas');
        sc.width = 256; sc.height = 96;
        const sx = sc.getContext('2d')!;
        sx.fillStyle = '#f0ddb0'; sx.fillRect(0, 0, 256, 96);
        sx.fillStyle = '#3a2010';
        sx.font = 'bold 18px monospace';
        sx.textAlign = 'center';
        sx.fillText(text, 128, 52);
        const sTex = new THREE.CanvasTexture(sc);
        const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: sTex, transparent: true }));
        sign.scale.set(1.7, 0.6, 1);
        sign.position.set(0, 1.75, -0.09);
        grp.add(sign);
        grp.position.set(x, 0, z);
        grp.rotation.y = rotY;
        scene.add(grp);
      }

      // ── 2C: Cherry Blossom Biome ──────────────────────────────────────
      function buildCherryBiome() {
        buildTorii(60, -80); buildTorii(60, -55);
        buildTorii(2, -40, Math.PI / 2); buildTorii(60, -2);
        for (let pz = -80; pz < -12; pz++) {
          for (let pw = -1; pw <= 1; pw++) {
            vox(60 + pw, 0.06, pz, ([0x9a9a9a, 0x8a8a8a, 0xaaaaaa] as number[])[Math.abs(pw)]!, 1, 0.12, 1);
          }
        }
        for (let px = 15; px < 95; px++) { vox(px, 0.06, -40, 0x9a9a9a, 1, 0.12, 1); }
        buildShrine(60, -15);
        buildCherryTree(35, -30, 7); buildCherryTree(42, -22, 5);
        buildCherryTree(78, -35, 6); buildCherryTree(82, -20, 5);
        buildCherryTree(50, -55, 8); buildCherryTree(70, -60, 6);
        buildCherryTree(30, -50, 5);
        buildKoiPond(80, -25, 12, 8);
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2;
          buildLantern(60 + Math.cos(angle) * 14, -25 + Math.sin(angle) * 14);
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          vox(60 + Math.cos(a) * 0.8, 0.5, -38 + Math.sin(a) * 0.8, 0x888880, 0.55, 1, 0.55);
        }
        vox(60, 1.5, -38, 0x6b4423, 2.2, 0.25, 0.25, true);
        vox(60, 1.7, -38, 0x6b4423, 0.2, 0.8, 0.2, true);
        vox(45, 0.8, -38, 0x6b4423, 0.2, 1.6, 0.2, true);
        vox(45, 1.8, -38, 0x8B6914, 1.4, 1.0, 0.15, true);
        const PETAL_COUNT = 150;
        const petDummy = new THREE.Object3D();
        void petDummy;
        const petGeo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
        const petMat = new THREE.MeshLambertMaterial({ color: 0xffb7c5 });
        const petMesh = new THREE.InstancedMesh(petGeo, petMat, PETAL_COUNT);
        scene.add(petMesh);
        const petData = Array.from({ length: PETAL_COUNT }, () => ({
          x: 30 + Math.random() * 70, y: Math.random() * 14 + 2,
          z: -80 + Math.random() * 80,
          vy: -(0.007 + Math.random() * 0.01),
          vx: (Math.random() - 0.5) * 0.004,
          vz: (Math.random() - 0.5) * 0.004,
          rx: Math.random() * Math.PI, ry: Math.random() * Math.PI,
          rz: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.025,
          originX: 60, originZ: -40,
        }));
        allParticles.push({ mesh: petMesh, data: petData, type: 'blossom' });
        buildSignpost(60, 0, '→ Bamboo Forest');
        buildSignpost(2, -40, '→ Volcanic Badlands', Math.PI / 2);
      }
      buildCherryBiome();

      // ── 2D: Bamboo Forest Biome ───────────────────────────────────────
      function buildBambooBiome() {
        for (let i = 0; i < 80; i++) {
          const bx = 10 + Math.random() * 85;
          const bz = 10 + Math.random() * 85;
          vox(bx, 6, bz, 0x7aab5a, 0.28, 12, 0.28, true);
          for (let ny = 0; ny < 6; ny++) { vox(bx, ny * 2 + 1, bz, 0x5a8a40, 0.35, 0.2, 0.35); }
          for (let l = 0; l < 4; l++) {
            const la = (l / 4) * Math.PI * 2;
            vox(bx + Math.cos(la) * 0.8, 11 + l * 0.3, bz + Math.sin(la) * 0.8, 0x6ab04a, 1.2, 0.06, 0.3);
          }
        }
        for (let rx = -4; rx <= 4; rx++) {
          for (let rz = -4; rz <= 4; rz++) { vox(50 + rx, 0.2, 50 + rz, 0x707060, 1, 0.4, 1, false, true); }
        }
        for (let wh = 0; wh < 3; wh++) {
          for (let wx = -3; wx <= 3; wx++) {
            if (Math.random() > 0.55) continue;
            vox(50 + wx, 0.6 + wh, 45, 0x808070, 1, 1, 1, true);
            vox(50 + wx, 0.6 + wh, 55, 0x808070, 1, 1, 1, true);
          }
          for (let wz = -3; wz <= 3; wz++) {
            if (Math.random() > 0.55) continue;
            vox(45, 0.6 + wh, 50 + wz, 0x808070, 1, 1, 1, true);
            vox(55, 0.6 + wh, 50 + wz, 0x808070, 1, 1, 1, true);
          }
        }
        vox(50, 1, 50, 0x606050, 1.2, 2, 1.2, true);
        vox(50, 2.8, 50, 0x606050, 1.8, 0.4, 1.8);
        for (let pz = 2; pz < 95; pz += 3) { vox(50, 0.06, pz, 0x8a8a7a, 1.8, 0.1, 2.2); }
        vox(70, 0.5, 70, 0x8B6914, 1.2, 0.9, 0.8, true);
        vox(70, 1.05, 70, 0x6b4a10, 1.25, 0.2, 0.85);
        vox(70, 0.85, 69.6, 0xd4a820, 0.3, 0.3, 0.1);
        const streamGeo = new THREE.PlaneGeometry(4, 30);
        streamGeo.rotateX(-Math.PI / 2);
        const streamMat = new THREE.MeshLambertMaterial({ color: 0x4a7a9a, transparent: true, opacity: 0.7 });
        const stream = new THREE.Mesh(streamGeo, streamMat);
        stream.position.set(30, 0.05, 50);
        scene.add(stream);
        waterMats.push(streamMat);
        for (let bp = -3; bp <= 3; bp++) { vox(30, 0.3, 50 + bp * 1.1, 0x7a5c2a, 5, 0.18, 0.85, true); }
        for (let br = -3; br <= 3; br++) {
          vox(28, 0.8, 50 + br * 1.1, 0x6b4423, 0.18, 0.8, 0.18);
          vox(32, 0.8, 50 + br * 1.1, 0x6b4423, 0.18, 0.8, 0.18);
        }
        buildSignpost(50, 2, '← Cherry Village', Math.PI);
        buildSignpost(2, 50, '← Ocean Cliffs', Math.PI / 2);
      }
      buildBambooBiome();

      // ── 2E: Ocean Cliffs Biome ────────────────────────────────────────
      function buildOceanBiome() {
        for (let cz = 0; cz < 100; cz++) {
          for (let ch = 0; ch < 8; ch++) {
            if (Math.random() > 0.7) continue;
            vox(-90, -(ch + 0.5), cz, ch < 4 ? 0x6a7a8a : 0x8a9aaa, 1, 1, 1);
          }
        }
        const oceanGeo = new THREE.PlaneGeometry(60, 120);
        oceanGeo.rotateX(-Math.PI / 2);
        const oceanMat = new THREE.MeshLambertMaterial({ color: 0x1a4a7a, transparent: true, opacity: 0.88 });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.position.set(-120, -7, 50);
        scene.add(ocean);
        waterMats.push(oceanMat);
        const LHX = -70, LHZ = 20;
        vox(LHX, 1, LHZ, 0xd0c8b8, 4, 2, 4, true);
        for (let lh = 0; lh < 10; lh++) {
          const w = lh < 7 ? 2.8 : 2.2;
          vox(LHX, 2 + lh + 0.5, LHZ, 0xd8d0c0, w, 1, w, true);
        }
        vox(LHX, 6.5, LHZ, 0xcc3300, 3, 0.8, 3, true);
        vox(LHX, 12.5, LHZ, 0x88aacc, 2.5, 1.5, 2.5, true);
        const beamGrp = new THREE.Group();
        beamGrp.position.set(LHX, 13, LHZ);
        const beamGeo = new THREE.BoxGeometry(0.3, 0.3, 22);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.3 });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.z = 11;
        beamGrp.add(beam);
        scene.add(beamGrp);
        lightBeam = beamGrp;
        const SWX = -60, SWZ = 70;
        const hullGrp = new THREE.Group();
        for (let hx = -5; hx <= 5; hx++) {
          for (let hz = 0; hz < 12; hz++) {
            const isEdge = Math.abs(hx) === 5 || hz === 0 || hz === 11;
            if (!isEdge) continue;
            addBoxToGroup(hullGrp, hx, 0, hz, 1, 1.5, 1, hz < 4 ? 0x2a1a0e : 0x3a2a1e, true);
          }
        }
        addBoxToGroup(hullGrp, 0, 1, 6, 0.4, 8, 0.4, 0x5a3a1a, true);
        addBoxToGroup(hullGrp, 2, 4, 8, 4, 0.4, 0.4, 0x5a3a1a, true);
        hullGrp.position.set(SWX, -0.5, SWZ);
        hullGrp.rotation.z = 0.3; hullGrp.rotation.y = 0.6;
        scene.add(hullGrp);
        for (let px = -88; px < -82; px++) {
          for (let pzv = 45; pzv < 55; pzv++) { vox(px, 0.15, pzv, 0x7a5c2a, 1, 0.18, 1, false, true); }
        }
        for (let rp = 45; rp < 55; rp++) { vox(-88, 0.8, rp, 0x6b4423, 0.18, 0.8, 0.18); }
        for (let r = 0; r < 25; r++) {
          const rx = -95 + Math.random() * 20, rz = Math.random() * 100;
          const rs = 0.5 + Math.random() * 2;
          vox(rx, rs * 0.5, rz, 0x6a7a8a, rs * 1.5, rs, rs, true);
        }
        buildSignpost(-50, 2, '← Cherry Village', Math.PI);
        buildSignpost(-50, 98, '→ Volcanic Zone', Math.PI);
      }
      buildOceanBiome();

      // ── 2F: Volcanic Biome ────────────────────────────────────────────
      function buildVolcanicBiome() {
        const VX = -50, VZ = -50;
        for (let vh = 0; vh < 20; vh++) {
          const vr = 18 - vh;
          for (let va = 0; va < vr * 2; va++) {
            const angle = (va / (vr * 2)) * Math.PI * 2;
            const col = vh > 15 ? 0x1a0a08 : vh > 10 ? 0x3a1808 : vh > 5 ? 0x5a2010 : 0x6a2a14;
            vox(VX + Math.cos(angle) * vr, vh * 0.8 + 0.5, VZ + Math.sin(angle) * vr, col, 1.2, 0.8, 1.2, true);
          }
        }
        const craterGeo = new THREE.PlaneGeometry(8, 8);
        craterGeo.rotateX(-Math.PI / 2);
        const craterMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.9 });
        const crater = new THREE.Mesh(craterGeo, craterMat);
        crater.position.set(VX, 16.5, VZ);
        scene.add(crater);
        const vLight = new THREE.PointLight(0xff4400, 4, 40);
        vLight.position.set(VX, 18, VZ);
        scene.add(vLight);
        lavaLights.push(vLight);
        const crackSegs: [number, number, number, number][] = [
          [-80, -60, -60, -40], [-70, -80, -50, -60],
          [-40, -70, -20, -50], [-90, -30, -70, -10], [-50, -90, -30, -70],
        ];
        crackSegs.forEach(([x1, z1, x2, z2]) => {
          for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            const lx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 3;
            const lz = z1 + (z2 - z1) * t + (Math.random() - 0.5) * 3;
            const lm = vox(lx, 0.02, lz, 0xff4400, 1.5, 0.08, 0.8);
            lm.material.emissive = new THREE.Color(0xff2200);
            lm.material.emissiveIntensity = 2.0;
            if (s % 3 === 0) {
              const lpl = new THREE.PointLight(0xff4400, 2, 8);
              lpl.position.set(lx, 1, lz);
              scene.add(lpl);
              lavaLights.push(lpl);
            }
          }
        });
        ([[-80,-80],[-60,-70],[-70,-50],[-40,-80],[-90,-40],[-50,-30]] as [number,number][]).forEach(([ox, oz]) => {
          const h = 3 + Math.random() * 6, w = 1.5 + Math.random() * 2;
          for (let oh = 0; oh < h; oh++) {
            vox(ox + (Math.random() - 0.5) * 0.4, oh + 0.5, oz + (Math.random() - 0.5) * 0.4,
              0x1a0a2a, w * (1 - oh / h * 0.5), 1, w * (1 - oh / h * 0.5), true);
          }
        });
        const FIRE_COUNT = 200;
        const fGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        const fMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
        const fMesh = new THREE.InstancedMesh(fGeo, fMat, FIRE_COUNT);
        scene.add(fMesh);
        const fData = Array.from({ length: FIRE_COUNT }, () => ({
          x: VX + (Math.random() - 0.5) * 20, y: Math.random() * 4,
          z: VZ + (Math.random() - 0.5) * 20,
          vy: 0.04 + Math.random() * 0.06,
          life: Math.random(), maxLife: 1 + Math.random() * 2,
          originX: VX, originZ: VZ,
        }));
        allParticles.push({ mesh: fMesh, data: fData, type: 'fire' });
        buildSignpost(-50, -2, '← Cherry Village', Math.PI);
      }
      buildVolcanicBiome();

      // ── 2G: Tundra Biome ──────────────────────────────────────────────
      function buildTundraBiome() {
        for (let si = 0; si < 60; si++) {
          const sx = (Math.random() - 0.5) * 90, sz = -110 - Math.random() * 25;
          const ss = 0.5 + Math.random() * 2;
          vox(sx, ss * 0.3, sz, 0xeef4ff, ss * 3, ss * 0.6, ss * 2);
        }
        const crystalPos: [number, number][] = [
          [20, -110], [-30, -120], [10, -130], [-15, -115], [35, -125], [-40, -110]
        ];
        crystalPos.forEach(([cx, cz]) => {
          const h = 4 + Math.random() * 8, bw = 0.8 + Math.random() * 1.2;
          for (let ch = 0; ch < h; ch++) {
            const w = bw * (1 - ch / h * 0.8);
            const m = vox(cx, ch + 0.5, cz, 0xa0d8ef, w, 1, w, true);
            m.material.transparent = true; m.material.opacity = 0.7 + (ch / h) * 0.2;
          }
        });
        const iceGeo = new THREE.PlaneGeometry(14, 10);
        iceGeo.rotateX(-Math.PI / 2);
        const iceMat = new THREE.MeshLambertMaterial({ color: 0xb0d8e8, transparent: true, opacity: 0.88 });
        const iceMesh = new THREE.Mesh(iceGeo, iceMat);
        iceMesh.position.set(0, 0.08, -120);
        scene.add(iceMesh);
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2, h = 2 + Math.random() * 2.5;
          vox(-10 + Math.cos(a) * 10, h * 0.5, -128 + Math.sin(a) * 10, 0x8a8a9a, 1.2, h, 1.4, true);
        }
        vox(-10, 0.5, -128, 0x707080, 3, 1, 3, true);
        const aColors = [0x00ff88, 0x0088ff, 0xff00aa, 0x00ffcc, 0x8800ff];
        aColors.forEach((col, i) => {
          const aGeo = new THREE.PlaneGeometry(120, 30);
          const aMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide });
          const aM = new THREE.Mesh(aGeo, aMat);
          aM.position.set(0, 42 + i * 6, -120);
          aM.rotation.x = Math.PI / 2 + 0.3;
          aM.rotation.z = (i / 5) * Math.PI * 0.4;
          scene.add(aM);
          auroraMeshes.push({ mesh: aM, mat: aMat, phase: i });
        });
        const SNOW_COUNT = 300;
        const sGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sMesh = new THREE.InstancedMesh(sGeo, sMat, SNOW_COUNT);
        sMesh.position.set(0, 0, -120);
        scene.add(sMesh);
        const sData = Array.from({ length: SNOW_COUNT }, () => ({
          x: (Math.random() - 0.5) * 100, y: Math.random() * 25 + 2,
          z: (Math.random() - 0.5) * 60,
          vy: -(0.03 + Math.random() * 0.04),
          vx: (Math.random() - 0.5) * 0.008,
          spin: (Math.random() - 0.5) * 0.02,
          rx: Math.random() * Math.PI, ry: 0, rz: 0,
        }));
        allParticles.push({ mesh: sMesh, data: sData, type: 'snow' });
        buildSignpost(0, -102, '→ Frozen Tundra');
        buildSignpost(0, -98, '← Return to Village', Math.PI);
      }
      buildTundraBiome();


      // ── 3A: Species mesh builder ──────────────────────────────────────
      interface PetMeshResult {
        group: any;
        legs: { FL: any; FR: any; BL: any; BR: any };
      }

      function buildSpeciesMesh(sp: string, color: string, dark: string): PetMeshResult {
        const g = new THREE.Group();
        const b = (
          x: number, y: number, z: number,
          w: number, h: number, d: number,
          c: string, cast = true
        ) => {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ color: new THREE.Color(c) })
          );
          mesh.position.set(x, y, z);
          mesh.castShadow = cast;
          g.add(mesh);
          return mesh;
        };
        const legs: any = {};

        switch (sp) {
          case 'wolf': {
            b(0, 0.45, 0, 0.70, 0.50, 0.90, color);
            b(0, 1.05, 0.1, 0.52, 0.50, 0.52, color);
            b(0, 0.95, -0.32, 0.22, 0.18, 0.30, dark);
            b(-0.18, 1.45, 0.12, 0.10, 0.30, 0.10, dark);
            b(0.18, 1.45, 0.12, 0.10, 0.30, 0.10, dark);
            b(-0.12, 1.08, -0.25, 0.09, 0.09, 0.02, '#0a0906');
            b(0.12, 1.08, -0.25, 0.09, 0.09, 0.02, '#0a0906');
            b(0, 0.45, 0.55, 0.20, 0.22, 0.52, dark);
            b(0, 0.60, 0.85, 0.15, 0.18, 0.35, dark);
            legs.FL = b(-0.20, 0.15, -0.30, 0.13, 0.30, 0.13, dark);
            legs.FR = b(0.20, 0.15, -0.30, 0.13, 0.30, 0.13, dark);
            legs.BL = b(-0.20, 0.15, 0.30, 0.13, 0.30, 0.13, dark);
            legs.BR = b(0.20, 0.15, 0.30, 0.13, 0.30, 0.13, dark);
            break;
          }
          case 'sabertooth': {
            b(0, 0.55, 0, 0.90, 0.65, 0.80, color);
            b(0, 1.20, 0.05, 0.68, 0.60, 0.60, color);
            b(-0.12, 0.85, -0.20, 0.08, 0.60, 0.08, '#e8e0d0');
            b(0.12, 0.85, -0.20, 0.08, 0.60, 0.08, '#e8e0d0');
            b(-0.20, 1.55, 0.08, 0.14, 0.18, 0.12, dark);
            b(0.20, 1.55, 0.08, 0.14, 0.18, 0.12, dark);
            b(-0.14, 1.22, -0.28, 0.10, 0.10, 0.02, '#0a0906');
            b(0.14, 1.22, -0.28, 0.10, 0.10, 0.02, '#0a0906');
            b(0, 0.50, 0.42, 0.18, 0.18, 0.22, dark);
            legs.FL = b(-0.26, 0.18, -0.22, 0.18, 0.36, 0.18, dark);
            legs.FR = b(0.26, 0.18, -0.22, 0.18, 0.36, 0.18, dark);
            legs.BL = b(-0.26, 0.18, 0.22, 0.18, 0.36, 0.18, dark);
            legs.BR = b(0.26, 0.18, 0.22, 0.18, 0.36, 0.18, dark);
            break;
          }
          case 'capybara': {
            b(0, 0.38, 0, 0.85, 0.55, 1.10, color);
            b(0, 0.90, 0.30, 0.75, 0.45, 0.62, color);
            b(0, 0.88, 0.62, 0.30, 0.18, 0.22, color);
            b(-0.22, 1.12, 0.28, 0.12, 0.14, 0.10, dark);
            b(0.22, 1.12, 0.28, 0.12, 0.14, 0.10, dark);
            b(-0.16, 0.98, 0.00, 0.09, 0.09, 0.02, '#0a0906');
            b(0.16, 0.98, 0.00, 0.09, 0.09, 0.02, '#0a0906');
            b(0, 0.38, -0.58, 0.12, 0.10, 0.12, dark);
            legs.FL = b(-0.25, 0.12, -0.32, 0.14, 0.24, 0.14, dark);
            legs.FR = b(0.25, 0.12, -0.32, 0.14, 0.24, 0.14, dark);
            legs.BL = b(-0.25, 0.12, 0.35, 0.14, 0.24, 0.14, dark);
            legs.BR = b(0.25, 0.12, 0.35, 0.14, 0.24, 0.14, dark);
            break;
          }
          case 'dragon': {
            b(0, 0.55, 0, 0.65, 0.55, 0.62, color);
            b(0, 1.20, 0.05, 0.50, 0.50, 0.50, color);
            b(-0.18, 1.60, 0.08, 0.09, 0.35, 0.09, dark);
            b(0.18, 1.60, 0.08, 0.09, 0.35, 0.09, dark);
            b(-0.22, 1.70, 0.08, 0.06, 0.20, 0.06, dark);
            b(0.22, 1.70, 0.08, 0.06, 0.20, 0.06, dark);
            b(-0.12, 1.22, -0.24, 0.09, 0.09, 0.02, '#0a0906');
            b(0.12, 1.22, -0.24, 0.09, 0.09, 0.02, '#0a0906');
            b(-0.40, 0.90, 0.05, 0.22, 0.38, 0.08, dark);
            b(0.40, 0.90, 0.05, 0.22, 0.38, 0.08, dark);
            b(0, 0.45, 0.38, 0.20, 0.20, 0.42, dark);
            b(0, 0.50, 0.72, 0.15, 0.15, 0.30, dark);
            b(0, 0.55, 0.94, 0.10, 0.10, 0.18, dark);
            legs.FL = b(-0.18, 0.18, -0.20, 0.13, 0.32, 0.13, dark);
            legs.FR = b(0.18, 0.18, -0.20, 0.13, 0.32, 0.13, dark);
            legs.BL = b(-0.18, 0.18, 0.20, 0.13, 0.32, 0.13, dark);
            legs.BR = b(0.18, 0.18, 0.20, 0.13, 0.32, 0.13, dark);
            break;
          }
          case 'axolotl': {
            b(0, 0.50, 0, 0.72, 0.58, 0.80, color);
            b(0, 1.15, 0.05, 0.62, 0.55, 0.58, color);
            [-0.12, 0, 0.12].forEach((go, gi) => {
              const gh = 0.28 + gi * 0.08;
              b(-0.40, 1.25 + gh * 0.5, go, 0.08, gh, 0.08, dark);
              b(0.40, 1.25 + gh * 0.5, go, 0.08, gh, 0.08, dark);
              b(-0.40, 1.25 + gh, go, 0.14, 0.08, 0.14, dark);
              b(0.40, 1.25 + gh, go, 0.14, 0.08, 0.14, dark);
            });
            b(-0.12, 1.18, -0.28, 0.09, 0.09, 0.02, '#0a0906');
            b(0.12, 1.18, -0.28, 0.09, 0.09, 0.02, '#0a0906');
            b(0, 0.45, 0.42, 0.55, 0.08, 0.55, dark);
            b(0, 0.55, 0.65, 0.35, 0.18, 0.25, dark);
            legs.FL = b(-0.20, 0.15, -0.25, 0.12, 0.28, 0.12, dark);
            legs.FR = b(0.20, 0.15, -0.25, 0.12, 0.28, 0.12, dark);
            legs.BL = b(-0.20, 0.15, 0.28, 0.12, 0.28, 0.12, dark);
            legs.BR = b(0.20, 0.15, 0.28, 0.12, 0.28, 0.12, dark);
            break;
          }
          default: {
            b(0, 0.55, 0, 0.65, 0.55, 0.65, color);
            b(0, 1.18, 0, 0.48, 0.48, 0.48, color);
            b(-0.12, 1.22, -0.25, 0.09, 0.09, 0.02, '#0a0906');
            b(0.12, 1.22, -0.25, 0.09, 0.09, 0.02, '#0a0906');
            legs.FL = b(-0.16, 0.15, -0.19, 0.13, 0.30, 0.13, dark);
            legs.FR = b(0.16, 0.15, -0.19, 0.13, 0.30, 0.13, dark);
            legs.BL = b(-0.16, 0.15, 0.19, 0.13, 0.30, 0.13, dark);
            legs.BR = b(0.16, 0.15, 0.19, 0.13, 0.30, 0.13, dark);
          }
        }
        g.castShadow = true;
        scene.add(g);
        return { group: g, legs };
      }

      // ── 3B: Local player setup ────────────────────────────────────────
      const playerSpecies = species || 'dragon';
      const playerColor = petState?.primaryColor || '#3d4a33';
      const playerDark = darken(playerColor, 0.65);

      const player = {
        pos: new THREE.Vector3(60, 0.5, -75),
        rot: 0,
        vel: new THREE.Vector3(),
        speed: 0.09,
        isMoving: false,
      };

      const playerMesh = buildSpeciesMesh(playerSpecies, playerColor, playerDark);
      playerMesh.group.position.copy(player.pos);

      // ── 3C: Input system ─────────────────────────────────────────────
      const keys3d: Record<string, boolean> = {};

      // Stub — actual PartyKit interaction fired by the existing keyboard
      // useEffect (E key handler at component level); this just guards UI.
      function triggerNearestInteraction() {
        // Proximity interactions are handled by the socket interval in the
        // existing PartyKit useEffect — nothing extra needed here.
      }

      const onKeyDown3d = (e: KeyboardEvent) => {
        keys3d[e.code] = true;
        if (e.code === 'KeyE') triggerNearestInteraction();
        if (e.code === 'Escape') { activeOverlayRef.current = null; }
      };
      const onKeyUp3d = (e: KeyboardEvent) => { keys3d[e.code] = false; };
      window.addEventListener('keydown', onKeyDown3d);
      window.addEventListener('keyup', onKeyUp3d);
      cleanupFns.current.push(() => {
        window.removeEventListener('keydown', onKeyDown3d);
        window.removeEventListener('keyup', onKeyUp3d);
      });

      // ── 3C: Collision system ─────────────────────────────────────────
      const COLLIDERS: [number, number, number, number][] = [
        [56, -18, 64, -10],   // shrine
        [58, -82, 62, -78],   // spawn torii
        [73, -28, 87, -22],   // koi pond
        [43, -40, 47, -36],   // notice board
        [58, -40, 62, -36],   // well
        [10, 10, 40, 45],     // west bamboo cluster
        [55, 20, 90, 80],     // east bamboo cluster
        [46, 46, 54, 54],     // ruined temple
        [-75, 15, -65, 25],   // lighthouse
        [-65, 62, -50, 75],   // shipwreck
        [-58, -58, -42, -42], // volcano center
        [-18, -132, -2, -124],// stone circle
      ];

      function checkCollision(p: { x: number; z: number }): boolean {
        const r = 0.55;
        return COLLIDERS.some(([x0, z0, x1, z1]) =>
          p.x + r > x0 && p.x - r < x1 &&
          p.z + r > z0 && p.z - r < z1
        );
      }

      function updatePlayer(_delta: number) {
        if (activeOverlayRef.current) return;
        let moved = false;
        if (keys3d['KeyW'] || keys3d['ArrowUp']) {
          player.vel.x -= Math.sin(player.rot) * player.speed;
          player.vel.z -= Math.cos(player.rot) * player.speed;
          moved = true;
        }
        if (keys3d['KeyS'] || keys3d['ArrowDown']) {
          player.vel.x += Math.sin(player.rot) * player.speed;
          player.vel.z += Math.cos(player.rot) * player.speed;
          moved = true;
        }
        if (keys3d['KeyA'] || keys3d['ArrowLeft']) player.rot += 0.045;
        if (keys3d['KeyD'] || keys3d['ArrowRight']) player.rot -= 0.045;

        if (joystickRef.current.active) {
          const { dx, dy } = joystickRef.current;
          player.vel.x -= Math.sin(player.rot) * player.speed * dy;
          player.vel.z -= Math.cos(player.rot) * player.speed * dy;
          player.rot -= dx * 0.04;
          if (Math.abs(dy) > 0.1) moved = true;
        }

        player.isMoving = moved;
        player.vel.multiplyScalar(0.72);

        const next = player.pos.clone().add(player.vel);
        next.x = Math.max(-95, Math.min(95, next.x));
        next.z = Math.max(-140, Math.min(95, next.z));
        next.y = 0.5;

        if (!checkCollision(next)) {
          player.pos.copy(next);
        } else {
          const nx = new THREE.Vector3(player.pos.x + player.vel.x, 0.5, player.pos.z);
          if (!checkCollision(nx)) player.pos.x = nx.x;
          const nz = new THREE.Vector3(player.pos.x, 0.5, player.pos.z + player.vel.z);
          if (!checkCollision(nz)) player.pos.z = nz.z;
        }
      }

      // ── 3D: Camera follow ────────────────────────────────────────────
      const camPos = new THREE.Vector3(60, 7, -60);
      const camLook = new THREE.Vector3(60, 2, -75);

      function updateCamera() {
        const offset = new THREE.Vector3(0, 7, 14);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rot);
        camPos.lerp(player.pos.clone().add(offset), 0.06);
        const fwd = new THREE.Vector3(0, 1, 3);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rot);
        camLook.lerp(player.pos.clone().add(fwd), 0.1);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
      }

      // ── 3E: Mobile detection ─────────────────────────────────────────
      const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (mounted.current) setIsMobile(isMobileDevice);

      // ── 4A: Peer mesh map ─────────────────────────────────────────────
      const peerMeshes = new Map<string, {
        group: any; legs: { FL: any; FR: any; BL: any; BR: any };
        username: string;
        targetPos: any; currentPos: any;
        targetRot: number; currentRot: number;
        lastUpdate: number;
      }>();

      function addPeer(id: string, pState: any, px: number, pz: number) {
        if (peerMeshes.has(id)) {
          const existing = peerMeshes.get(id)!;
          existing.targetPos.set(px, 0.5, pz);
          return;
        }
        const color = pState?.primaryColor || '#94a3b8';
        const sp = pState?.species || 'wolf';
        const dk = darken(color, 0.65);
        const { group, legs } = buildSpeciesMesh(sp, color, dk);
        group.position.set(px, 0.5, pz);

        // Name label sprite
        const lc = document.createElement('canvas');
        lc.width = 280; lc.height = 56;
        const lctx = lc.getContext('2d')!;
        lctx.fillStyle = 'rgba(20,14,8,0.78)';
        lctx.fillRect(8, 8, 264, 40);
        lctx.fillStyle = '#f0ebe0';
        lctx.font = '18px monospace';
        lctx.textAlign = 'center';
        const uname = pState?.username || id.slice(0, 8);
        lctx.fillText(`@${uname}`, 140, 32);
        const lTex = new THREE.CanvasTexture(lc);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: lTex, transparent: true })
        );
        label.scale.set(2.4, 0.5, 1);
        label.position.set(0, 2.6, 0);
        group.add(label);

        peerMeshes.set(id, {
          group, legs, username: uname,
          targetPos: new THREE.Vector3(px, 0.5, pz),
          currentPos: new THREE.Vector3(px, 0.5, pz),
          targetRot: 0, currentRot: 0,
          lastUpdate: Date.now(),
        });
      }

      function removePeer(id: string) {
        const p = peerMeshes.get(id);
        if (!p) return;
        scene.remove(p.group);
        p.group.traverse((c: any) => {
          c.geometry?.dispose();
          c.material?.dispose();
        });
        peerMeshes.delete(id);
      }

      // ── 4B: Emote/chat sprite ────────────────────────────────────────
      function showEmote(group: any, text: string, ms = 3000) {
        const ec = document.createElement('canvas');
        ec.width = 220; ec.height = 72;
        const ectx = ec.getContext('2d')!;
        ectx.fillStyle = 'rgba(20,14,8,0.85)';
        ectx.fillRect(0, 0, 220, 72);
        ectx.fillStyle = '#f0ebe0';
        ectx.font = '22px serif';
        ectx.textAlign = 'center';
        ectx.fillText(text.slice(0, 14), 110, 44);
        const eTex = new THREE.CanvasTexture(ec);
        const eMat = new THREE.SpriteMaterial({ map: eTex, transparent: true });
        const sprite = new THREE.Sprite(eMat);
        sprite.scale.set(2.0, 0.72, 1);
        sprite.position.set(0, 3.2, 0);
        group.add(sprite);
        let t = 0;
        const animateEmote = () => {
          t += 0.016;
          sprite.position.y = 3.2 + t * 0.4;
          eMat.opacity = Math.max(0, 1 - t / (ms / 1000));
          if (t < ms / 1000) requestAnimationFrame(animateEmote);
          else { group.remove(sprite); eTex.dispose(); eMat.dispose(); }
        };
        requestAnimationFrame(animateEmote);
      }

      // ── 4C: Wire PartyKit snapshot/updates → 3D meshes ────────────────
      // Hook into existing socketRef: listen for messages and call
      // addPeer/removePeer/showEmote alongside existing business logic.
      const onPeerMessage = (evt: MessageEvent) => {
        const msg = JSON.parse(evt.data);
        const myName = petState.gitData.username;

        if (msg.type === 'snapshot') {
          // Populate 3D peers from initial snapshot
          for (const [uname, presence] of Object.entries(msg.pets as Record<string, any>)) {
            if (uname === myName) continue;
            const p = presence as any;
            addPeer(uname, {
              username: uname,
              primaryColor: p.petState?.primaryColor,
              species: p.species,
            }, p.x ?? 60, p.y ?? -20);
          }
        }

        if (msg.type === 'pet_update') {
          if (msg.pet.username === myName) return;
          const p = msg.pet;
          const existing = peerMeshes.get(p.username);
          if (existing) {
            // Update target position (server uses x/y for 2D coords;
            // map y→z for the 3D world)
            existing.targetPos.set(p.x ?? existing.targetPos.x, 0.5, p.y ?? existing.targetPos.z);
            existing.lastUpdate = Date.now();
          } else {
            addPeer(p.username, {
              username: p.username,
              primaryColor: p.petState?.primaryColor,
              species: p.species,
            }, p.x ?? 60, p.y ?? -20);
          }
        }

        if (msg.type === 'pet_left') {
          removePeer(msg.username);
        }

        if (msg.type === 'presence_update') {
          if (msg.pet.username === myName) return;
          const existing = peerMeshes.get(msg.pet.username);
          if (existing) existing.lastUpdate = Date.now();
        }

        if (msg.type === 'interaction') {
          // Show emote bubble on the from-peer's mesh
          const { fromUsername, interactionType } = msg;
          const emojiMap: Record<string, string> = {
            fight: '⚔️', befriend: '❤️', play: '🎮', trade: '✨',
          };
          const emote = emojiMap[interactionType] ?? '✨';
          const fromPeer = peerMeshes.get(fromUsername);
          if (fromPeer?.group) showEmote(fromPeer.group, emote, 3000);
        }
      };

      // Attach to socket once it exists — check each frame until ready
      const attachPeerListener = () => {
        const sock = socketRef.current;
        if (sock) {
          sock.addEventListener('message', onPeerMessage);
          cleanupFns.current.push(() => sock.removeEventListener('message', onPeerMessage));
        } else {
          // Socket not yet created — retry after a tick
          setTimeout(attachPeerListener, 200);
        }
      };
      attachPeerListener();

      // ── 4D: Position broadcast (3D coords) ───────────────────────────
      broadcastRef.current = setInterval(() => {
        const sock = socketRef.current;
        if (!sock || sock.readyState !== 1) return;
        // Send 3D x/z as x/y so server stores them in PetPresence.
        // The server treats x/y as opaque numbers, so this is safe.
        sock.send(JSON.stringify({
          type: 'move',
          x: player.pos.x,
          y: player.pos.z, // server field is 'y'; we use it for Z
          rot: player.rot,
        }));
      }, 50);

      // ── 4E: Proximity detection (used inside RAF in Part 5) ───────────
      let nearestPeer: { id: string; peer: any } | null = null;

      function detectProximity() {
        let nearestDist = Infinity;
        nearestPeer = null;
        peerMeshes.forEach((peer, id) => {
          const d = Math.sqrt(
            Math.pow(player.pos.x - peer.currentPos.x, 2) +
            Math.pow(player.pos.z - peer.currentPos.z, 2)
          );
          if (d < PROXIMITY_RANGE && d < nearestDist) {
            nearestDist = d;
            nearestPeer = { id, peer };
          }
        });
        if (nearestPeer) {
          const np = nearestPeer as { id: string; peer: any };
          if (mounted.current) setInteractPrompt(`[ E ]  Challenge @${np.peer.username}`);
        } else {
          if (mounted.current) setInteractPrompt(null);
        }
      }

      // Wire triggerNearestInteraction to the existing React state
      // (setInteractionTarget opens the fight/befriend/play/trade popup)
      const triggerNearestInteractionImpl = () => {
        if (!nearestPeer) return;
        const np = nearestPeer as { id: string; peer: any };
        const partyPlayer = playersRef.current.get(np.id);
        if (partyPlayer && mounted.current) setInteractionTarget(partyPlayer);
      };

      // Patch the handler registered in Part 3's onKeyDown3d
      // (cleanest: re-register with the real implementation)
      const onKeyDown4 = (e: KeyboardEvent) => {
        if (e.code === 'KeyE') triggerNearestInteractionImpl();
      };
      window.addEventListener('keydown', onKeyDown4);
      cleanupFns.current.push(() => window.removeEventListener('keydown', onKeyDown4));

      // ── 4F: Peer animation (called from RAF in Part 5) ────────────────
      function updatePeers(elapsed: number) {
        peerMeshes.forEach((peer) => {
          peer.currentPos.x += (peer.targetPos.x - peer.currentPos.x) * 0.10;
          peer.currentPos.z += (peer.targetPos.z - peer.currentPos.z) * 0.10;
          peer.currentRot += (peer.targetRot - peer.currentRot) * 0.1;
          peer.group.position.copy(peer.currentPos);
          peer.group.position.y = 0.5 + Math.sin(elapsed * 2.1) * 0.03;
          peer.group.rotation.y = peer.currentRot;
          const dx = peer.targetPos.x - peer.currentPos.x;
          const dz = peer.targetPos.z - peer.currentPos.z;
          const moving = Math.sqrt(dx * dx + dz * dz) > 0.04;
          const sw = moving ? Math.sin(elapsed * 9 + peer.group.id) * 0.35 : 0;
          peer.legs.FL.rotation.x = sw;
          peer.legs.BR.rotation.x = sw;
          peer.legs.FR.rotation.x = -sw;
          peer.legs.BL.rotation.x = -sw;
          // Stale fade after 5s no update
          if (Date.now() - peer.lastUpdate > 5000) {
            peer.group.traverse((c: any) => {
              if (c.material) {
                c.material.transparent = true;
                c.material.opacity = Math.max(0, (c.material.opacity ?? 1) - 0.003);
              }
            });
          }
        });
      }

      // ── 5A: Particle update ──────────────────────────────────────────
      const particleDummy = new THREE.Object3D();

      function updateParticles(elapsedSec: number) {
        allParticles.forEach(({ mesh, data, type }) => {
          data.forEach((p: any, i: number) => {
            if (type === 'blossom') {
              p.y += p.vy;
              p.x += p.vx + Math.sin(elapsedSec * 0.4 + p.z) * 0.002;
              p.z += p.vz;
              p.rz += p.spin;
              if (p.y < 0) {
                p.y = 14 + Math.random() * 4;
                p.x = p.originX + (Math.random() - 0.5) * 40;
                p.z = p.originZ + (Math.random() - 0.5) * 40;
              }
              particleDummy.position.set(p.x, p.y, p.z);
              particleDummy.rotation.set(p.rx, p.ry, p.rz);
              particleDummy.scale.setScalar(1);
            } else if (type === 'fire') {
              p.y += p.vy;
              p.x += Math.sin(elapsedSec * 2 + i) * 0.01;
              p.life += p.vy;
              if (p.y > 8 || p.life > p.maxLife) {
                p.y = 0; p.life = 0;
                p.x = p.originX + (Math.random() - 0.5) * 6;
                p.z = p.originZ + (Math.random() - 0.5) * 6;
              }
              const s = Math.max(0.1, 1 - p.life / p.maxLife);
              particleDummy.position.set(p.x, p.y, p.z);
              particleDummy.rotation.set(0, 0, 0);
              particleDummy.scale.setScalar(s);
            } else if (type === 'snow') {
              p.y += p.vy;
              p.x += p.vx + Math.sin(elapsedSec * 0.3 + i * 0.5) * 0.003;
              p.rx += p.spin;
              if (p.y < -2) {
                p.y = 22 + Math.random() * 5;
                p.x = (Math.random() - 0.5) * 100;
              }
              particleDummy.position.set(
                mesh.position.x + p.x,
                mesh.position.y + p.y,
                mesh.position.z + p.z
              );
              particleDummy.rotation.set(p.rx, 0, 0);
              particleDummy.scale.setScalar(1);
            }
            particleDummy.updateMatrix();
            mesh.setMatrixAt(i, particleDummy.matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
        });
      }

      // ── 5B: Minimap draw ─────────────────────────────────────────────
      function drawMinimap() {
        const mc = minimapRef.current?.getContext('2d');
        if (!mc) return;
        mc.fillStyle = '#1a1812';
        mc.fillRect(0, 0, 140, 140);

        // World x[-100,100] z[-140,95] → [4,136]
        const wx = (x: number) => ((x + 100) / 200) * 132 + 4;
        const wz = (z: number) => ((z + 140) / 235) * 132 + 4;

        // Biome zone tints
        mc.fillStyle = 'rgba(90,120,60,0.2)';
        mc.fillRect(wx(0), wz(-100), wx(100) - wx(0), wz(0) - wz(-100));    // Cherry
        mc.fillStyle = 'rgba(60,100,50,0.2)';
        mc.fillRect(wx(0), wz(0), wx(100) - wx(0), wz(100) - wz(0));         // Bamboo
        mc.fillStyle = 'rgba(40,80,140,0.2)';
        mc.fillRect(wx(-100), wz(0), wx(0) - wx(-100), wz(100) - wz(0));     // Ocean
        mc.fillStyle = 'rgba(100,40,10,0.2)';
        mc.fillRect(wx(-100), wz(-100), wx(0) - wx(-100), wz(0) - wz(-100)); // Volcanic
        mc.fillStyle = 'rgba(160,200,220,0.2)';
        mc.fillRect(wx(-50), wz(-140), wx(50) - wx(-50), wz(-100) - wz(-140)); // Tundra

        // Peer dots
        peerMeshes.forEach((peer) => {
          mc.fillStyle = '#94a3b8';
          mc.beginPath();
          mc.arc(wx(peer.currentPos.x), wz(peer.currentPos.z), 3, 0, Math.PI * 2);
          mc.fill();
        });

        // Player dot + direction line
        mc.fillStyle = '#ffffff';
        mc.beginPath();
        mc.arc(wx(player.pos.x), wz(player.pos.z), 5, 0, Math.PI * 2);
        mc.fill();
        mc.strokeStyle = '#ffffff'; mc.lineWidth = 1.5;
        mc.beginPath();
        mc.moveTo(wx(player.pos.x), wz(player.pos.z));
        mc.lineTo(
          wx(player.pos.x) - Math.sin(player.rot) * 10,
          wz(player.pos.z) - Math.cos(player.rot) * 10
        );
        mc.stroke();

        // Border
        mc.strokeStyle = 'rgba(240,200,140,0.25)';
        mc.lineWidth = 1;
        mc.strokeRect(0, 0, 140, 140);
      }

      // ── 5C: Main RAF loop ─────────────────────────────────────────────
      let elapsed = 0;
      let lastTime = performance.now();
      let mapFrame = 0;
      let biomeFrame = 0;

      const tick = () => {
        if (!mounted.current || !effectActive) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += delta;
        mapFrame++;
        biomeFrame++;

        // 1. Player movement + collision
        updatePlayer(delta);

        // 2. Camera follow
        updateCamera();

        // 3. Player mesh
        playerMesh.group.position.copy(player.pos);
        playerMesh.group.rotation.y = player.rot;
        playerMesh.group.position.y = 0.5 + Math.sin(elapsed * 2.2) * 0.035;
        const sw = player.isMoving ? Math.sin(elapsed * 9) * 0.35 : 0;
        playerMesh.legs.FL.rotation.x = sw;
        playerMesh.legs.BR.rotation.x = sw;
        playerMesh.legs.FR.rotation.x = -sw;
        playerMesh.legs.BL.rotation.x = -sw;

        // 4. Biome lighting every frame (lerp is cheap)
        const currentBiome = getBiome(player.pos.x, player.pos.z);
        updateBiomeLighting(currentBiome as any);

        // 5. Biome state for React HUD — throttled to ~2fps
        if (biomeFrame % 30 === 0 && currentBiome !== biomeStateRef.current) {
          biomeStateRef.current = currentBiome;
          if (mounted.current) setCurrentBiomeState(currentBiome);
        }

        // 6. Peer interpolation + leg animation
        updatePeers(elapsed);

        // 7. Proximity detection + interact prompt
        let nDist = Infinity;
        let nPeer: { id: string; peer: any } | null = null;
        peerMeshes.forEach((peer, id) => {
          const dx = player.pos.x - peer.currentPos.x;
          const dz = player.pos.z - peer.currentPos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < PROXIMITY_RANGE && d < nDist) { nDist = d; nPeer = { id, peer }; }
        });
        if (mounted.current) {
          setInteractPrompt(nPeer
            ? `[ E ]  Challenge @${(nPeer as any).peer.username}`
            : null
          );
        }

        // 8. Particles
        updateParticles(elapsed);

        // 9. Koi elliptical orbit
        koiData.forEach((k: any) => {
          k.angle += k.speed;
          k.mesh.position.set(
            k.cx + Math.cos(k.angle) * k.radius,
            0.12,
            k.cz + Math.sin(k.angle) * k.radius * 0.6
          );
          k.mesh.rotation.y = -k.angle + Math.PI / 2;
        });

        // 10. Water color HSL pulse
        waterMats.forEach((mat: any, i: number) => {
          mat.color.setHSL(0.55, 0.5, 0.35 + Math.sin(elapsed * 0.9 + i) * 0.025);
        });

        // 11. Lantern flicker
        lanternMats.forEach((mat: any, i: number) => {
          mat.emissiveIntensity = 0.7 + Math.sin(elapsed * 1.8 + i * 1.3) * 0.45;
        });

        // 12. Lava glow pulse
        lavaLights.forEach((light: any, i: number) => {
          light.intensity = 2 + Math.sin(elapsed * 2.5 + i * 0.7) * 1.5;
        });

        // 13. Lighthouse beam
        if (lightBeam) lightBeam.rotation.y = elapsed * 0.4;

        // 14. Aurora — only when near tundra
        if (player.pos.z < -75) {
          auroraMeshes.forEach((a: any) => {
            a.mat.opacity = 0.04 + Math.sin(elapsed * 0.5 + a.phase) * 0.06;
            a.mesh.rotation.z += 0.0002;
          });
        }

        // 15. Minimap at ~10fps
        if (mapFrame % 6 === 0) drawMinimap();

        // 16. Render
        renderer.render(scene, camera);
      };
      rafRef.current = requestAnimationFrame(tick);


    };

    init();


    // 1G ── full cleanup ────────────────────────────────────────────
    return () => {
      mounted.current = false;
      cancelAnimationFrame(rafRef.current);
      if (broadcastRef.current) clearInterval(broadcastRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
      cleanupFns.current.forEach(fn => fn());
      // NOTE: peerMeshes / playerMesh / allParticles are scoped inside
      // init() so they are gc'd automatically when init resolves.
      // The cleanupFns array holds the socket listener removals.
    };
  }, []);

  // 6C ── joystick helper (keeps ref + state in sync) ─────────────
  const updateJoystick = (v: { active: boolean; dx: number; dy: number }) => {
    joystickRef.current = v;
    setJoystick(v);
  };

  // 6D ── Full JSX return ───────────────────────────────────────────
  const BIOME_NAMES: Record<string, string> = {
    CHERRY:   '🌸 Cherry Village',
    BAMBOO:   '🌿 Bamboo Forest',
    OCEAN:    '🌊 Ocean Cliffs',
    VOLCANIC: '🌋 Volcanic Badlands',
    TUNDRA:   '❄️ Frozen Tundra',
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      position: 'relative', background: '#0d0f18',
      fontFamily: "'Syne', sans-serif",
    }}>
      {/* Font loading */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet" />

      {/* 3D Canvas */}
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        background: 'radial-gradient(ellipse 78% 78% at 50% 50%, transparent 38%, rgba(8,6,4,0.55) 100%)',
      }} />

      {/* Film grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        opacity: 0.025,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: 'grain 0.4s steps(1) infinite',
      }} />

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(8,6,4,0.65)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(240,200,140,0.1)',
      }}>
        <Link href="/" style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 10, color: '#f0ebe0', textDecoration: 'none',
          letterSpacing: 2,
          textShadow: '0 0 20px rgba(255,180,80,0.4)',
        }}>← GIT-PET</Link>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontWeight: 300,
          fontSize: 11, color: 'rgba(240,235,224,0.45)',
          letterSpacing: 3, textTransform: 'uppercase',
        }}>
          {BIOME_NAMES[currentBiomeState] ?? currentBiomeState}
        </div>
        <Link href="/dashboard" style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700,
          fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
          color: '#ffd4a0', textDecoration: 'none',
          background: 'rgba(181,71,10,0.35)',
          border: '1px solid rgba(255,180,80,0.3)',
          padding: '8px 18px',
        }}>My Pet →</Link>
      </nav>

      {/* Player info panel — top left */}
      <div style={{
        position: 'fixed', top: 72, left: 24, zIndex: 20,
        background: 'rgba(20,14,8,0.72)',
        border: '1px solid rgba(240,200,140,0.15)',
        backdropFilter: 'blur(8px)',
        padding: '12px 16px', minWidth: 160,
      }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8, color: '#ffd4a0', marginBottom: 10,
        }}>@{petState.gitData.username}</div>
        <div style={{ marginBottom: 6 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 300,
            fontSize: 9, color: 'rgba(240,235,224,0.4)',
            letterSpacing: 1, marginBottom: 3,
          }}>HEALTH</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${petState.stats.health}%`,
              background: '#3d8a4a', borderRadius: 2,
            }} />
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 300,
            fontSize: 9, color: 'rgba(240,235,224,0.4)',
            letterSpacing: 1, marginBottom: 3,
          }}>MOOD</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${petState.stats.happiness}%`,
              background: '#c8930a', borderRadius: 2,
            }} />
          </div>
        </div>
      </div>

      {/* Online count — top right */}
      <div style={{
        position: 'fixed', top: 72, right: 24, zIndex: 20,
        background: 'rgba(20,14,8,0.72)',
        border: '1px solid rgba(240,200,140,0.15)',
        backdropFilter: 'blur(8px)',
        padding: '12px 16px',
        fontFamily: "'DM Mono', monospace", fontWeight: 300,
        fontSize: 11, color: 'rgba(240,235,224,0.55)',
        letterSpacing: 2, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
          animation: 'pip 1.2s infinite',
        }} />
        {onlineCount} online
      </div>

      {/* Interaction prompt */}
      {interactPrompt && (
        <div style={{
          position: 'fixed', bottom: 110, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20,14,8,0.88)',
          border: '1px solid rgba(240,200,140,0.3)',
          backdropFilter: 'blur(10px)',
          padding: '10px 22px', zIndex: 20,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9, color: '#ffd4a0', letterSpacing: 1,
          whiteSpace: 'nowrap',
          animation: 'floatBob 2s ease-in-out infinite',
        }}>
          {interactPrompt}
        </div>
      )}

      {/* Controls hint */}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: "'DM Mono', monospace", fontWeight: 300,
        fontSize: 9, color: 'rgba(240,235,224,0.3)',
        letterSpacing: 2, textTransform: 'uppercase',
        pointerEvents: 'none', zIndex: 15, whiteSpace: 'nowrap',
      }}>
        WASD · MOVE &nbsp;·&nbsp; A/D · TURN &nbsp;·&nbsp; E · INTERACT
      </div>

      {/* Minimap */}
      <canvas ref={minimapRef} width={140} height={140}
        style={{
          position: 'fixed', bottom: 60, right: 24, zIndex: 20,
          border: '1px solid rgba(240,200,140,0.2)',
          background: '#1a1812', display: 'block',
        }} />

      {/* Mobile joystick */}
      {isMobile && (
        <div
          style={{
            position: 'fixed', bottom: 60, left: 40, zIndex: 25,
            width: 120, height: 120, borderRadius: '50%',
            background: 'rgba(240,235,224,0.07)',
            border: '1px solid rgba(240,235,224,0.15)',
            touchAction: 'none',
          }}
          onTouchStart={() => updateJoystick({ active: true, dx: 0, dy: 0 })}
          onTouchMove={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            updateJoystick({
              active: true,
              dx: Math.max(-1, Math.min(1, (e.touches[0].clientX - cx) / 60)),
              dy: Math.max(-1, Math.min(1, (e.touches[0].clientY - cy) / 60)),
            });
          }}
          onTouchEnd={() => updateJoystick({ active: false, dx: 0, dy: 0 })}
        >
          <div style={{
            position: 'absolute',
            left: `${50 + joystick.dx * 30}%`,
            top: `${50 + joystick.dy * 30}%`,
            transform: 'translate(-50%,-50%)',
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(240,235,224,0.22)',
            border: '1px solid rgba(240,235,224,0.35)',
            pointerEvents: 'none',
          }} />
        </div>
      )}

      {/* Interaction overlay (fight/befriend/play/trade) — preserved exactly */}
      {interactionTarget && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'rgba(2,6,23,0.95)', border: '2px solid #3b82f6',
          borderRadius: 16, padding: 24, width: 320,
          fontFamily: "'DM Mono', monospace",
          zIndex: 101,
          boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(59,130,246,0.3)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, color: 'white', fontSize: 16, fontFamily: "'Syne', sans-serif" }}>
                @{interactionTarget.username}
              </h3>
              <span style={{ color: '#64748b', fontSize: 12 }}>{interactionTarget.species.toUpperCase()}</span>
              {(interactionTarget.friendCount ?? 0) > 0 && (
                <span style={{ marginLeft: 8, color: '#10b981', fontSize: 12 }}>
                  👥 {interactionTarget.friendCount}
                </span>
              )}
            </div>
            <button onClick={() => setInteractionTarget(null)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {[
            { label: 'HP',  value: interactionTarget.petState.stats.health,       color: '#22c55e' },
            { label: 'NRG', value: interactionTarget.petState.stats.energy,       color: '#f59e0b' },
            { label: 'INT', value: interactionTarget.petState.stats.intelligence, color: '#3b82f6' },
            { label: 'JOY', value: interactionTarget.petState.stats.happiness,    color: '#ec4899' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#64748b', width: 28 }}>{label}</span>
              <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3 }}>
                <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: '#e2e8f0', width: 24, textAlign: 'right' }}>{value}</span>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 }}>
            {(() => {
              const key = [petState.gitData.username, interactionTarget.username].sort().join(':');
              const cd = cooldownsRef.current.get(key) || 0;
              const isCd = cd > Date.now();
              const rem = Math.ceil((cd - Date.now()) / 1000);
              const btnStyle = (base: string, border: string): React.CSSProperties => ({
                padding: '12px', fontFamily: "'DM Mono', monospace",
                background: isCd ? '#1e293b' : base,
                border: `1px solid ${isCd ? '#334155' : border}`,
                borderRadius: 8, color: isCd ? '#64748b' : 'white',
                cursor: isCd ? 'not-allowed' : 'pointer', fontSize: 11,
              });
              const send = (type: string, result: string) => {
                socketRef.current?.send(JSON.stringify({
                  type: 'interaction', fromUsername: petState.gitData.username,
                  toUsername: interactionTarget.username, interactionType: type, result,
                }));
                cooldownsRef.current.set(key, Date.now() + 10000);
                nearPlayersRef.current.set(interactionTarget.username, Date.now());
                setInteractionTarget(null);
              };
              return (
                <>
                  <button disabled={isCd} onClick={() => send('fight', 'FOUGHT!')}
                    style={btnStyle('#7f1d1d', '#ef4444')}>⚔️ FIGHT {isCd && `(${rem}s)`}</button>
                  <button disabled={isCd} onClick={() => send('befriend', 'NEW FRIEND!')}
                    style={btnStyle('#064e3b', '#10b981')}>❤️ BEFRIEND {isCd && `(${rem}s)`}</button>
                  <button disabled={isCd} onClick={() => send('play', "LET'S PLAY!")}
                    style={btnStyle('#1e3a8a', '#3b82f6')}>🎮 PLAY {isCd && `(${rem}s)`}</button>
                  <button disabled={isCd} onClick={() => send('trade', 'TRADED!')}
                    style={btnStyle('#713f12', '#eab308')}>✨ TRADE {isCd && `(${rem}s)`}</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {interactionTarget && (
        <div onClick={() => setInteractionTarget(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 100 }} />
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes grain {
          0%,100%{transform:translate(0,0)} 25%{transform:translate(-2px,1px)}
          50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,2px)}
        }
        @keyframes floatBob {
          0%,100%{transform:translateX(-50%) translateY(0)}
          50%{transform:translateX(-50%) translateY(-5px)}
        }
        @keyframes pip {
          0%,100%{opacity:1} 50%{opacity:0.2}
        }
      `}</style>
    </div>
  );
}
