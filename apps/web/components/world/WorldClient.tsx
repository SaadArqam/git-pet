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
  const [cinematicDone, setCinematicDone] = useState(false);
  const [controlsHint, setControlsHint] = useState(true);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [npcDialogue, setNpcDialogue] = useState<{ name:string, lines:string[] }|null>(null);
  const [dialogueLine, setDialogueLine] = useState(0);
  const [tabletText, setTabletText] = useState<string|null>(null);
  const [chestLoot, setChestLoot] = useState<string|null>(null);
  const [biomeFlash, setBiomeFlash] = useState(false);
  const [showRest, setShowRest] = useState(false);

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
      renderer.toneMappingExposure = 0.85; // DARKER — prevents washed out look
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      
      scene.fog = new THREE.FogExp2(0xb8cce0, 0.018);
      scene.background = new THREE.Color(0x87b4d0);

      const camera = new THREE.PerspectiveCamera(
        60, window.innerWidth / window.innerHeight, 0.1, 120
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
      const SPAWN = new THREE.Vector3(0, 0.5, 30); // Spawn at south end of path
      const PROXIMITY_RANGE = 6.0;

      // 1C ── Single Layout Mode ─────────────────────────────────
      function getBiome(x: number, z: number) {
        return 'CHERRY'; // Hardcode biome name to avoid breaking audio handlers
      }

      // 1D ── Core Lighting (Match Landing)
      const sun = new THREE.DirectionalLight(0xffd4a0, 2.4);
      sun.position.set(20, 40, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 120;
      sun.shadow.camera.left = -80;
      sun.shadow.camera.right = 80;
      sun.shadow.camera.top = 80;
      sun.shadow.camera.bottom = -80;
      sun.shadow.bias = -0.001;
      scene.add(sun);

      const fillLight = new THREE.DirectionalLight(0x9bb8d4, 0.7);
      fillLight.position.set(-20, 15, -10);
      scene.add(fillLight);

      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.45);
      scene.add(hemiLight);

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
      const interactables: { x: number; z: number; type: string; id: string; meta?: any; group?: any }[] = [];
      let koiPondGeo: any = null;
      let koiPondWaterMesh: any = null;
      let audioCtx: AudioContext | null = null;
      const shrineData: { group: any; light: any; originY: number; pos: any }[] = [];
      const treeGroups: { group: any; originRotZ: number; originRotX: number }[] = [];
      let cameraShakeTimer = 0;
      
      const initAudio = () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      };
      window.addEventListener('click', initAudio);
      window.addEventListener('keydown', initAudio);
      cleanupFns.current.push(() => {
        window.removeEventListener('click', initAudio);
        window.removeEventListener('keydown', initAudio);
      });

      function addGlowBlock(
        x: number, y: number, z: number,
        color: number, emissive: number, intensity: number,
        lightRange = 8
      ) {
        const m = vox(x, y, z, color, 0.8, 0.8, 0.8);
        m.material.emissive = new THREE.Color(emissive);
        m.material.emissiveIntensity = intensity;
        const pl = new THREE.PointLight(emissive, intensity * 0.8, lightRange);
        pl.position.set(x, y + 0.5, z);
        scene.add(pl);
        lanternMats.push(m.material);
        lavaLights.push(pl);
        return m;
      }

      function buildChest(x: number, y: number, z: number, id: string, loot: string) {
        const grp = new THREE.Group();
        addBoxToGroup(grp, 0, 0.5, 0, 1.2, 1, 0.8, 0x8B6914, true);
        addBoxToGroup(grp, 0, 1.05, 0, 1.25, 0.2, 0.85, 0x4B3914, true);
        grp.position.set(x, y, z);
        scene.add(grp);
        interactables.push({ x, z, type: 'chest', id, meta: loot, group: grp });
      }

      function buildTablet(x: number, y: number, z: number, id: string, text: string) {
        const grp = new THREE.Group();
        addBoxToGroup(grp, 0, 1, 0, 0.8, 2, 0.2, 0x5a5a5a, true);
        grp.position.set(x, y, z);
        scene.add(grp);
        interactables.push({ x, z, type: 'tablet', id, meta: text, group: grp });
      }

      function buildCampfire(x: number, y: number, z: number) {
        const grp = new THREE.Group();
        for(let i=0; i<6; i++) {
          const a = (i/6)*Math.PI*2;
          addBoxToGroup(grp, Math.cos(a)*0.4, 0.1, Math.sin(a)*0.4, 0.4, 0.2, 0.4, 0x3a2f1e, true);
        }
        addBoxToGroup(grp, 0, 0.3, 0, 0.6, 0.6, 0.6, 0xff5500); 
        grp.position.set(x, y, z);
        scene.add(grp);
        interactables.push({ x, z, type: 'campfire', id: `camp_${x}_${z}`, group: grp });
      }

      // suppress unused-until-later warnings (used in Parts 3-6)
      void WORLD_SIZE; void SPAWN; void PROXIMITY_RANGE;
      void darken;
      void setCurrentBiomeState; void setInteractPrompt; void setIsMobile; void setJoystick;
      void currentBiomeState; void interactPrompt; void isMobile; void joystick;
      void biomeStateRef; void joystickRef; void activeOverlayRef;
      void frameRef; void petFramesRef; void size; void inspecting;

      // ── 2A: Flat Ground Plane ────────────────────────────
      // Ground flat plane matching landing aesthetics but scaled up
      const GSIZE = 400;
      const GSEGS = 80;
      const groundGeo = new THREE.PlaneGeometry(GSIZE, GSIZE, GSEGS, GSEGS);
      groundGeo.rotateX(-Math.PI / 2);

      const groundColors: number[] = [];
      const groundPos = groundGeo.attributes.position;
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i);
        const n = Math.sin(gx * 2.3) * Math.cos(gz * 1.9);
        if (n > 0.2) groundColors.push(0.28, 0.54, 0.22);
        else if (n > -0.2) groundColors.push(0.32, 0.60, 0.26);
        else groundColors.push(0.26, 0.50, 0.20);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));

      const groundMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.receiveShadow = true;
      scene.add(groundMesh);

      // ── 2B: Visual Noise Removed ──────────────────────────────────────
      // No extra cliffs, boulders, grass tufts, or scattered flowers.
      // Keeping it clean and structurally simple to match the landing page.


      // ── 2B: Shared building helpers ────────────────────────────────────
      function buildTorii(x: number, z: number, rotY = 0) {
        const grp = new THREE.Group();
        const red = 0x8B1A1A, dark = 0x4a0e0e, aged = 0x6a1414;
        for (let py = 0; py < 5; py++) {
          addBoxToGroup(grp, -2, py + 0.5, 0, 1, 1, 0.35, red, true);
          addBoxToGroup(grp, 2, py + 0.5, 0, 1, 1, 0.35, red, true);
        }
        const k = addBoxToGroup(grp, 0, 5.3, 0, 7, 0.45, 0.5, dark, true);
        const s = addBoxToGroup(grp, 0, 4.6, 0, 6, 0.35, 0.45, aged, true);
        (k.material as any).emissive = new THREE.Color(0xff1100);
        (k.material as any).emissiveIntensity = 0;
        toriiBars.push({ mesh: k, originZ: z, originX: x });
        addBoxToGroup(grp, -2, 4.6, 0, 0.25, 0.8, 0.35, aged);
        addBoxToGroup(grp, 2, 4.6, 0, 0.25, 0.8, 0.35, aged);
        grp.position.set(x, 0, z);
        grp.rotation.y = rotY;
        grp.scale.setScalar(1.5);
        scene.add(grp);
      }

      function buildLantern(x: number, z: number) {
        const grp = new THREE.Group();
        addBoxToGroup(grp, 0, 0.2, 0, 0.85, 0.45, 0.85, 0x888880, true);
        addBoxToGroup(grp, 0, 0.65, 0, 0.45, 0.6, 0.45, 0x888880, true);
        addBoxToGroup(grp, 0, 1.1, 0, 0.45, 0.55, 0.45, 0x888880, true);
        const lGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
        const lMat = new THREE.MeshLambertMaterial({
          color: 0xffcc66, emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.0,
        });
        const lMesh = new THREE.Mesh(lGeo, lMat);
        lMesh.position.set(0, 1.75, 0);
        lMesh.castShadow = true;
        grp.add(lMesh);
        lanternMats.push(lMat);
        addBoxToGroup(grp, 0, 2.15, 0, 0.95, 0.2, 0.95, 0x888880, true);
        const pl = new THREE.PointLight(0xffaa22, 1.4, 12);
        pl.position.set(0, 1.8, 0);
        grp.add(pl);
        grp.position.set(x, 0, z);
        grp.scale.setScalar(1.4);
        scene.add(grp);
      }

      function buildCherryTree(x: number, z: number, h: number) {
        const grp = new THREE.Group();
        for (let ty = 0; ty < h; ty++) {
          addBoxToGroup(grp, 0, ty + 0.5, 0, 0.7, 1, 0.7, 0x6b3f1e, true);
        }
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let bx = -3; bx <= 3; bx++) {
          for (let by = -1; by <= 2; by++) {
            for (let bz = -3; bz <= 3; bz++) {
              const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz);
              if (dist < 3.2 && Math.random() > dist * 0.15) {
                addBoxToGroup(grp, bx * 0.88, h + by * 0.88, bz * 0.88,
                  0.85, 0.85, 0.85, blossoms[Math.floor(Math.random() * 4)]!, true);
              }
            }
          }
        }
        grp.position.set(x, 0, z);
        grp.scale.setScalar(1.5);
        scene.add(grp);
        treeGroups.push({ group: grp, originRotZ: Math.random() * Math.PI, originRotX: Math.random() * Math.PI });
      }

      function buildShrine(x: number, z: number) {
        const grp = new THREE.Group();
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        for (let s = 0; s < 3; s++) {
          for (let sx = -(3 - s); sx <= (3 - s); sx++) {
            for (let sz = -(2 - s); sz <= (2 - s); sz++) {
              addBoxToGroup(grp, sx, s * 0.45, sz + 3, 1, 0.45, 1, stone, false);
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
              const m = addBoxToGroup(grp, wx, 1.4 + wy, wz, 1, 1, 1, isWin ? 0xffcc66 : wood, true);
              if (isWin) {
                (m.material as any).emissive = new THREE.Color(0xffaa22);
                (m.material as any).emissiveIntensity = 1.2;
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
              addBoxToGroup(grp, rx, 5.4 + ry * 0.5, rz, 1, 0.4, 1, ry === 0 ? 0x3a2f1e : roof, true);
            }
          }
        }
        grp.position.set(x, 0, z);
        grp.scale.setScalar(1.35); // Big imposing shrine
        scene.add(grp);

        const pl = new THREE.PointLight(0xffcc66, 1.2, 20);
        pl.position.set(0, 3, 0);
        grp.add(pl);
        
        shrineData.push({ group: grp, light: pl, originY: 0, pos: new THREE.Vector3(x, 0, z) });
      }

      function buildKoiPond(cx: number, cz: number, w: number, d: number) {
        for (let bx = -w / 2; bx <= w / 2; bx++) {
          for (let bz = -d / 2; bz <= d / 2; bz++) {
            if (Math.abs(bx) > w / 2 - 1 || Math.abs(bz) > d / 2 - 1) {
              vox(cx + bx, 0.1, cz + bz, 0x7a7a7a, 1, 0.22, 1);
            }
          }
        }
        const wGeo = new THREE.PlaneGeometry(w - 1.5, d - 1.5, 8, 6);
        wGeo.rotateX(-Math.PI / 2);
        koiPondGeo = wGeo;
        const wMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
        const wMesh = new THREE.Mesh(wGeo, wMat);
        koiPondWaterMesh = wMesh;
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
          const r = 1.5 + Math.random() * (Math.min(w, d) / 2 - 2);
          koiData.push({
            mesh: km, cx, cz,
            angle: (k / kCount) * Math.PI * 2,
            radius: r,
            baseRadius: r,
            speed: 0.004 + Math.random() * 0.003,
            vy: 0,
            yPos: 0.12,
            jumpTimer: Math.random() * 10,
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


      // ── 2C: Central Garden Layout ──────────────────────────────────────
      function buildGardenLayout() {
        // Center Shrine at origin
        buildShrine(0, -40);
        buildTablet(-5, 0, -32, 'tab1', 'Welcome to the Pet Spirits Shrine.');
        buildCampfire(12, 0, -28);

        // Gateway Sequence
        buildTorii(0, -10);
        buildTorii(0, -25);

        // Flanking Cherry Trees
        const treeZ = [-5, -15, -20, -25, -35];
        treeZ.forEach(z => {
          buildCherryTree(-10 - Math.random() * 4, z, 6 + Math.random() * 2);
          buildCherryTree(10 + Math.random() * 4, z, 6 + Math.random() * 2);
        });

        // Deep Forest Background
        for (let a = 0; a < Math.PI * 2; a += 0.15) {
          const r = 40 + Math.random() * 5;
          buildCherryTree(Math.cos(a) * r, Math.sin(a) * r, 8 + Math.random() * 3);
        }

        // Feature: Koi Pond
        buildKoiPond(15, -15, 12, 16);

        // Flanking Lanterns
        const lanternZ = [0, -12, -22, -32];
        lanternZ.forEach(z => {
          buildLantern(-5.5, z);
          buildLantern(5.5, z);
        });

        // Scatter path stepping stones
        for (let i = 0; i < 40; i++) {
            const rx = (Math.random() - 0.5) * 6;
            const rz = 25 - Math.random() * 60;
            const w = 0.8 + Math.random() * 0.5;
            const d = 0.6 + Math.random() * 0.4;
            vox(rx, 0.05, rz, 0x9a9a9a, w, 0.1, d, true, true);
        }

        // Global ambient particles (slow drifting blossoms)
        const PETAL_COUNT = 300;
        const petGeo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
        const petMat = new THREE.MeshLambertMaterial({ color: 0xffb7c5 });
        const petMesh = new THREE.InstancedMesh(petGeo, petMat, PETAL_COUNT);
        scene.add(petMesh);
        const petData = Array.from({ length: PETAL_COUNT }, () => ({
          x: (Math.random() - 0.5) * 80, 
          y: Math.random() * 10 + 2,
          z: (Math.random() - 0.5) * 80,
          vy: -(0.01 + Math.random() * 0.01),
          vx: Math.random() * 0.01,
          spin: (Math.random() - 0.5) * 0.05,
          rx: Math.random() * Math.PI, ry: 0, rz: 0,
        }));
        allParticles.push({ mesh: petMesh, data: petData, type: 'blossom' });
      }
      buildGardenLayout();

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
      const rawSpecies = (petState as any)?.species;
      const rawColor = (petState as any)?.primaryColor;

      const VALID_SPECIES = ['wolf','sabertooth','capybara','dragon','axolotl'];
      const playerSpecies = VALID_SPECIES.includes(rawSpecies) ? rawSpecies : 'dragon';

      const playerColor = (rawColor && rawColor.startsWith('#')) ? rawColor : '#3d4a33';
      const playerDark = darken(playerColor, 0.60);

      const player = {
        pos: new THREE.Vector3(60, 0.5, -75),
        rot: 0,
        vel: new THREE.Vector3(),
        speed: 0.09,
        isMoving: false,
      };

      const playerMesh = buildSpeciesMesh(playerSpecies, playerColor, playerDark);
      playerMesh.group.position.copy(player.pos);
      console.log('[GitPet World] Player species:', playerSpecies, 'color:', playerColor);

      // ── 3B+. NPC definitions and building ─────────────────────────────
      const NPC_DEFS = [
        // Cherry Village NPCs (5)
        { x:45,  z:-30, species:'wolf',       col:'#7a8070', dark:'#4a5040', name:'Ash'   },
        { x:72,  z:-45, species:'axolotl',    col:'#8a5a60', dark:'#5a2a30', name:'Coral' },
        { x:35,  z:-55, species:'capybara',   col:'#8a6a3a', dark:'#5a4420', name:'Pip'   },
        { x:80,  z:-30, species:'sabertooth', col:'#c5c0b8', dark:'#8a8680', name:'Fang'  },
        { x:55,  z:-50, species:'dragon',     col:'#5a3a8a', dark:'#3a1a5a', name:'Ember' },
        // Bamboo Forest NPCs (3)
        { x:30,  z:30,  species:'axolotl',    col:'#4a8a6a', dark:'#2a5a3a', name:'Sage'  },
        { x:65,  z:55,  species:'wolf',       col:'#6a7a60', dark:'#3a4a30', name:'Moss'  },
        { x:45,  z:80,  species:'capybara',   col:'#9a8060', dark:'#6a5030', name:'Gus'   },
        // Ocean Cliffs NPCs (3)
        { x:-40, z:25,  species:'dragon',     col:'#4a6a9a', dark:'#2a3a6a', name:'Mist'  },
        { x:-60, z:60,  species:'wolf',       col:'#8a9aaa', dark:'#5a6a7a', name:'Tide'  },
        { x:-75, z:80,  species:'sabertooth', col:'#b0b8c0', dark:'#707880', name:'Salt'  },
        // Volcanic NPCs (2)
        { x:-30, z:-30, species:'dragon',     col:'#8a2a1a', dark:'#5a0a0a', name:'Char'  },
        { x:-65, z:-65, species:'axolotl',    col:'#aa3a1a', dark:'#6a1a0a', name:'Cinder'},
        // Tundra NPCs (2)
        { x:10,  z:-115,species:'sabertooth', col:'#c8d8e8', dark:'#8898a8', name:'Frost' },
        { x:-20, z:-125,species:'wolf',       col:'#d0e0f0', dark:'#9090a0', name:'Bliz'  },
      ];

      type NPCType = {
        group: any; legs: any;
        pos: any; vel: any;
        rot: number; timer: number;
        homeX: number; homeZ: number;
        wanderRadius: number; name: string;
      };
      const npcData: NPCType[] = [];

      NPC_DEFS.forEach(def => {
        const { group, legs } = buildSpeciesMesh(def.species, def.col, def.dark);
        group.position.set(def.x, 0.5, def.z);
      
        // NPC name label sprite
        const nc = document.createElement('canvas');
        nc.width = 220; nc.height = 48;
        const nctx = nc.getContext('2d')!;
        nctx.fillStyle = 'rgba(10,8,4,0.7)';
        nctx.fillRect(6,6,208,36);
        nctx.fillStyle = '#ffd4a0';
        nctx.font = '13px monospace';
        nctx.textAlign = 'center';
        nctx.fillText(def.name, 110, 28);
        const nTex = new THREE.CanvasTexture(nc);
        const nLabel = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: nTex, transparent: true })
        );
        nLabel.scale.set(1.8, 0.42, 1);
        nLabel.position.set(0, 2.4, 0);
        group.add(nLabel);
      
        npcData.push({
          group, legs,
          pos: new THREE.Vector3(def.x, 0.5, def.z),
          vel: new THREE.Vector3(),
          rot: Math.random() * Math.PI * 2,
          timer: Math.random() * 4,
          homeX: def.x, homeZ: def.z,
          wanderRadius: 8 + Math.random() * 6,
          name: def.name,
        });
      });

      function updateNPCs(elapsed: number, delta: number) {
        npcData.forEach((npc, i) => {
          npc.timer -= delta;
          if (npc.timer <= 0) {
            const homeAngle = Math.atan2(npc.homeX - npc.pos.x, npc.homeZ - npc.pos.z);
            const distFromHome = Math.sqrt((npc.pos.x-npc.homeX)**2 + (npc.pos.z-npc.homeZ)**2);
            const bias = distFromHome > npc.wanderRadius ? 0.7 : 0.15;
            npc.rot = homeAngle * bias + (Math.random()*Math.PI*2) * (1-bias);
            npc.timer = 2 + Math.random() * 4;
          }
      
          const spd = 0.03;
          npc.vel.x = -Math.sin(npc.rot) * spd;
          npc.vel.z = -Math.cos(npc.rot) * spd;
          npc.pos.add(npc.vel);
          npc.pos.y = 0.5;
      
          npc.group.position.copy(npc.pos);
          npc.group.position.y = 0.5 + Math.sin(elapsed*1.8 + i)*0.025;
          npc.group.rotation.y = npc.rot;
      
          const sw = Math.sin(elapsed*7 + i*1.5) * 0.28;
          npc.legs.FL.rotation.x = sw;
          npc.legs.BR.rotation.x = sw;
          npc.legs.FR.rotation.x = -sw;
          npc.legs.BL.rotation.x = -sw;
        });
      }

      function getNPCDialogue(name: string): string[] {
        const lines: Record<string, string[]> = {
          Ash:    ["I've been here since my first commit.", "Miss a day and I get grumpy."],
          Coral:  ["The koi pond is my favorite spot.", "Have you seen the bamboo forest?"],
          Pip:    ["I thrive on consistent commits.", "30-day streak and counting!"],
          Fang:   ["I guard the village entrance.", "The volcanic lands are dangerous."],
          Ember:  ["I evolved from an egg last week.", "Feed me commits and I'll grow stronger."],
          Sage:   ["The bamboo whispers secrets.", "The ruined temple holds ancient code."],
          Moss:   ["I rarely leave the forest.", "Watch out for the hidden chest."],
          Gus:    ["Slowest pet, most commits.", "Capybaras never rush."],
          Mist:   ["The ocean calms me.", "I watch the lighthouse every night."],
          Tide:   ["I swim between the tidal pools.", "The shipwreck has stories."],
          Salt:   ["Been here longer than the lighthouse.", "The cliffs keep me company."],
          Char:   ["I was born near the volcano.", "The lava is warm."],
          Cinder: ["I glow in the dark.", "Volcanic biome suits my species."],
          Frost:  ["The aurora is beautiful tonight.", "Ice suits a sabertooth."],
          Bliz:   ["Tundra wolves are rare.", "I haven't committed in 3 days. I'm cold."],
        };
        return lines[name] || ["...", "I have nothing to say."];
      }

      let nearestNPC: NPCType | null = null;
      let nearestPeer: { id: string; peer: any } | null = null;
      let nearestInteractable: any = null;

      // ── 3C: Input system ─────────────────────────────────────────────
      const keys3d: Record<string, boolean> = {};

      function triggerNearestInteraction() {
        // Proximity interactions are handled by the socket interval in the
        // existing PartyKit useEffect...
      }

      const onKeyDown3d = (e: KeyboardEvent) => {
        keys3d[e.code] = true;
        if (e.code === 'KeyE') {
          triggerNearestInteraction();
          cameraShakeTimer = 0.15;
          triggerFlash();
          playChime();
          if (nearestPeer) {
            // Handled by PartyKit overlay
          } else if (nearestNPC) {
            setNpcDialogue({ name: nearestNPC.name, lines: getNPCDialogue(nearestNPC.name) });
          } else {
            // Find interactable again since scope might be stale here
            let objDist = Infinity;
            interactables.forEach(obj => {
              const d = Math.sqrt((player.pos.x - obj.x)**2 + (player.pos.z - obj.z)**2);
              if (d < 4.0 && d < objDist) { objDist = d; nearestInteractable = obj; }
            });
            if (nearestInteractable && objDist < 4.0) {
              if (nearestInteractable.type === 'tablet') setTabletText(nearestInteractable.meta);
              else if (nearestInteractable.type === 'chest') setChestLoot(nearestInteractable.meta);
              else if (nearestInteractable.type === 'campfire') {
                setShowRest(true);
                setTimeout(() => setShowRest(false), 4000);
              }
            }
          }
        }
        if (e.code === 'Escape') { 
          activeOverlayRef.current = null;
          if (mounted.current) setShowPauseMenu(prev => !prev);
        }
      };

      const onKeyUp3d = (e: KeyboardEvent) => { keys3d[e.code] = false; };
      window.addEventListener('keydown', onKeyDown3d);
      window.addEventListener('keyup', onKeyUp3d);
      cleanupFns.current.push(() => {
        window.removeEventListener('keydown', onKeyDown3d);
        window.removeEventListener('keyup', onKeyUp3d);
        
        npcData.forEach(npc => {
          npc.group.traverse((c: any) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
              if (Array.isArray(c.material)) c.material.forEach((m: any) => m.dispose());
              else c.material.dispose();
            }
            scene.remove(npc.group);
          });
        });
        
        allParticles.forEach(({ mesh }) => {
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
          scene.remove(mesh);
        });

        if (audioCtx) {
          audioCtx.close();
          audioCtx = null;
        }
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

      const MOVE_SPEED = 4.0;
      const TURN_SPEED = 2.5;

      function updatePlayer(delta: number) {
        if (activeOverlayRef.current) {
          player.isMoving = false;
          return;
        }

        let moved = false;
        const dir = new THREE.Vector3(0, 0, 0);

        if (keys3d['KeyW'] || keys3d['ArrowUp']) {
          dir.x -= Math.sin(player.rot);
          dir.z -= Math.cos(player.rot);
          moved = true;
        }
        if (keys3d['KeyS'] || keys3d['ArrowDown']) {
          dir.x += Math.sin(player.rot);
          dir.z += Math.cos(player.rot);
          moved = true;
        }

        if (keys3d['KeyA'] || keys3d['ArrowLeft']) player.rot += TURN_SPEED * delta;
        if (keys3d['KeyD'] || keys3d['ArrowRight']) player.rot -= TURN_SPEED * delta;

        if (joystickRef.current.active) {
          const { dx, dy } = joystickRef.current;
          dir.x -= Math.sin(player.rot) * (-dy);
          dir.z -= Math.cos(player.rot) * (-dy);
          player.rot -= dx * TURN_SPEED * delta;
          if (Math.abs(dy) > 0.1) moved = true;
        }

        player.isMoving = moved;
        if (moved) {
          dir.normalize().multiplyScalar(MOVE_SPEED * delta);
          const next = player.pos.clone().add(dir);
          next.x = Math.max(-95, Math.min(95, next.x));
          next.z = Math.max(-140, Math.min(95, next.z));
          next.y = 0.5;

          if (!checkCollision(next)) {
            player.pos.copy(next);
          } else {
            // Sliding collision
            const nx = new THREE.Vector3(player.pos.x + dir.x, 0.5, player.pos.z);
            if (!checkCollision(nx)) player.pos.x = nx.x;
            const nz = new THREE.Vector3(player.pos.x, 0.5, player.pos.z + dir.z);
            if (!checkCollision(nz)) player.pos.z = nz.z;
          }
        }
      }

      // ── 3D: Camera follow ────────────────────────────────────────────
      const camPos = new THREE.Vector3(0, 5.2, 42);
      const camLook = new THREE.Vector3(0, 1.5, 27);

      const CAM_HEIGHT = 7.0;
      const CAM_DISTANCE = 14.0;
      const CAM_LERP = 0.065;
      const CAM_LOOK_LERP = 0.1;

      let headBob = 0;
      let currentFov = 60;

      function updateCamera() {
        const sinRot = Math.sin(player.rot);
        const cosRot = Math.cos(player.rot);

        const targetX = player.pos.x + sinRot * CAM_DISTANCE;
        const targetY = player.pos.y + CAM_HEIGHT + headBob;
        const targetZ = player.pos.z + cosRot * CAM_DISTANCE;

        camPos.lerp(new THREE.Vector3(targetX, targetY, targetZ), CAM_LERP);

        // Look slightly AHEAD of player, not AT player
        const lookX = player.pos.x - sinRot * 3;
        const lookY = player.pos.y + 1.2;
        const lookZ = player.pos.z - cosRot * 3;

        camLook.lerp(new THREE.Vector3(lookX, lookY, lookZ), CAM_LOOK_LERP);

        camera.position.copy(camPos);
        camera.lookAt(camLook);
        
        const targetFov = 60 + (player.isMoving ? 3 : 0);
        if (Math.abs(currentFov - targetFov) > 0.1) {
          currentFov += (targetFov - currentFov) * 0.05;
          camera.fov = currentFov;
          camera.updateProjectionMatrix();
        }
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

      let cinematicPhase = 0;
      let cinematicTimer = 0;
      let controlEnabled = false;
      let waterRippleTime = 0;
      let ambientTimer = 20;

      function playChime() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = 1200 + Math.random()*200;
        osc.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        osc.start(); osc.stop(audioCtx.currentTime + 0.6);
      }

      function triggerFlash() {
        if (!scene) return;
        const flash = new THREE.PointLight(0xffffee, 3.0, 15);
        flash.position.copy(player.pos).add(new THREE.Vector3(0, 2, 0));
        scene.add(flash);
        let life = 0.2;
        const fn = () => {
          life -= 0.02;
          flash.intensity = life * 15;
          if (life <= 0) scene.remove(flash);
          else requestAnimationFrame(fn);
        };
        requestAnimationFrame(fn);
      }

      function playAmbientSound(biome: string) {
        if (!audioCtx) return;
        const createOscillator = (f: number, type: any, vol: number, dur: number) => {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = type; osc.frequency.value = f;
          osc.connect(gain); gain.connect(audioCtx.destination);
          gain.gain.setValueAtTime(0, audioCtx.currentTime);
          gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
          osc.start(); osc.stop(audioCtx.currentTime + dur);
        };
        const sounds: Record<string, () => void> = {
          CHERRY: () => {
            [880,1100,1320].forEach((f,i) => {
              setTimeout(() => createOscillator(f, 'sine', 0.06, 0.12), i * 80);
            });
          },
          BAMBOO: () => createOscillator(220 + Math.random()*80, 'sawtooth', 0.02, 0.8),
          OCEAN: () => {
            createOscillator(80 + Math.random()*40, 'sine', 0.08, 1.2);
            setTimeout(() => createOscillator(100, 'sine', 0.05, 0.8), 300);
          },
          VOLCANIC: () => createOscillator(40 + Math.random()*20, 'sine', 0.12, 1.5),
          TUNDRA: () => createOscillator(160 + Math.random()*40, 'sawtooth', 0.025, 2.0),
        };
        sounds[biome]?.();
      }

      function playFootstep(biome: string) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = biome === 'BAMBOO' ? 220 : 120;
        osc.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
      }
      let footstepTimer = 0;

      setTimeout(() => {
        controlEnabled = true;
        if (mounted.current) {
          setCinematicDone(true);
          setTimeout(() => {
            if (mounted.current) setControlsHint(false);
          }, 10000);
        }
      }, 6000);

      const tick = () => {
        if (!mounted.current || !effectActive) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += delta;
        mapFrame++;
        biomeFrame++;

        if (!controlEnabled) {
          cinematicTimer += delta;
          if (cinematicTimer < 2) {
            camPos.lerp(new THREE.Vector3(60, 20, 30), 0.02);
            camLook.lerp(new THREE.Vector3(60, 0, -80), 0.03);
          } else if (cinematicTimer < 4) {
            camPos.lerp(new THREE.Vector3(60, 10, -50), 0.025);
            camLook.lerp(new THREE.Vector3(60, 1, -100), 0.03);
          } else {
            camPos.lerp(
              player.pos.clone().add(new THREE.Vector3(0, 4.5, 10)), 0.04
            );
            camLook.lerp(player.pos.clone().add(new THREE.Vector3(0, 1, -3)), 0.05);
          }
          camera.position.copy(camPos);
          camera.lookAt(camLook);
          
          renderer.render(scene, camera);
          return;
        }

        // 1. Player movement + collision
        updatePlayer(delta);

        // 2. Camera follow
        if (player.isMoving) {
          headBob = Math.sin(elapsed * 9) * 0.08;
        } else {
          headBob *= 0.85;
        }
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

        // 4. Update simple world effects
        const currentBiome = getBiome(player.pos.x, player.pos.z);

        // 5. Biome state for React HUD + Reveal Animation
        if (currentBiome !== biomeStateRef.current) {
          biomeStateRef.current = currentBiome;
          if (mounted.current) {
            setCurrentBiomeState(currentBiome);
            setBiomeFlash(true);
            setTimeout(() => { if (mounted.current) setBiomeFlash(false); }, 3000);
          }
        }

        // 6. Audio updates
        if (player.isMoving) {
          footstepTimer += delta;
          if (footstepTimer > 0.38) {
            playFootstep(currentBiome);
            footstepTimer = 0;
          }
        } else {
          footstepTimer = 0;
        }

        ambientTimer -= delta;
        if (ambientTimer <= 0 && audioCtx) {
          ambientTimer = 15 + Math.random() * 25;
          playAmbientSound(currentBiome);
        }

        if (koiPondGeo) {
          waterRippleTime += delta;
          const wPos = koiPondGeo.attributes.position;
          for (let i = 0; i < wPos.count; i++) {
            const wx = wPos.getX(i);
            const wz = wPos.getZ(i);
            const ripple = Math.sin(wx*1.5 + waterRippleTime*2) *
                           Math.cos(wz*1.5 + waterRippleTime*1.8) * 0.04;
            wPos.setY(i, ripple);
          }
          wPos.needsUpdate = true;
          koiPondGeo.computeVertexNormals();
        }

        waterMats.forEach((mat, i) => {
          const h = 0.54 + Math.sin(elapsed*0.8+i*0.7)*0.01;
          const s = 0.55 + Math.sin(elapsed*0.5+i)*0.05;
          const l = 0.32 + Math.sin(elapsed*0.9+i*1.3)*0.04;
          mat.color.setHSL(h, s, l);
        });

        // 7. Entities update
        updatePeers(elapsed);
        updateNPCs(elapsed, delta);

        // 8. Proximity detection (Peers, NPCs, Interactables)
        let nDist = Infinity;
        let nPeer: { id: string; peer: any } | null = null;
        peerMeshes.forEach((peer, id) => {
          const dx = player.pos.x - peer.currentPos.x;
          const dz = player.pos.z - peer.currentPos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < PROXIMITY_RANGE && d < nDist) { nDist = d; nPeer = { id, peer }; }
        });
        nearestPeer = nPeer;

        let nearestNPCDist = Infinity;
        nearestNPC = null;
        npcData.forEach(npc => {
          const d = player.pos.distanceTo(npc.pos);
          if (d < 4.0 && d < nearestNPCDist) {
            nearestNPCDist = d;
            nearestNPC = npc;
          }
        });

        let nearestObj: any = null;
        let nearestObjDist = Infinity;
        interactables.forEach(obj => {
          const d = Math.sqrt((player.pos.x - obj.x)**2 + (player.pos.z - obj.z)**2);
          if (d < 4.0 && d < nearestObjDist) {
            nearestObjDist = d;
            nearestObj = obj;
          }
        });

        if (mounted.current) {
          if (nPeer) {
            setInteractPrompt(`[ E ]  Challenge @${(nPeer as any).peer.username}`);
          } else if (nearestNPC) {
            setInteractPrompt(`[ E ]  Talk to ${(nearestNPC as NPCType).name}`);
          } else if (nearestObj) {
            if (nearestObj.type === 'tablet') setInteractPrompt('[ E ]  Read Tablet');
            else if (nearestObj.type === 'chest') setInteractPrompt('[ E ]  Open Chest');
            else if (nearestObj.type === 'campfire') setInteractPrompt('[ E ]  Rest');
            else setInteractPrompt('[ E ]  Interact');
          } else {
            setInteractPrompt(null);
          }
        }

        // 8. Particles
        updateParticles(elapsed);

        // 9. Koi elliptical orbit & jumping
        koiData.forEach((k: any) => {
          k.angle += k.speed;
          k.jumpTimer -= delta;
          if (k.jumpTimer <= 0 && k.yPos <= 0.12) {
            k.vy = 0.06 + Math.random() * 0.04;
            k.jumpTimer = 5 + Math.random() * 10;
          }
          k.yPos += k.vy;
          k.vy -= 0.003; // gravity
          if (k.yPos < 0.12) {
            k.yPos = 0.12;
            k.vy = 0;
          }
          let targetRad = k.baseRadius;
          let targetSpeed = 0.004 + (k.baseRadius % 0.003);
          if (player.pos.x > 35 && player.pos.x < 48 && player.pos.z < 5 && player.pos.z > -10) {
            targetSpeed *= 3.0;
            targetRad *= 0.8;
          }
          k.radius += (targetRad - k.radius) * 0.05;
          k.speed += (targetSpeed - k.speed) * 0.02;

          k.mesh.position.set(
            k.cx + Math.cos(k.angle) * k.radius,
            k.yPos,
            k.cz + Math.sin(k.angle) * k.radius * 0.6
          );
          k.mesh.rotation.y = -k.angle + Math.PI / 2;
        });

        // Prox reaction
        interactables.forEach((obj: any) => {
          if (!obj.group) return;
          const d = Math.sqrt((player.pos.x - obj.x)**2 + (player.pos.z - obj.z)**2);
          const targetScale = d < 4.0 ? 1.05 + Math.sin(elapsed * 4) * 0.02 : 1.0;
          obj.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
          obj.group.traverse((c: any) => {
            if (c.material && c.material.emissive) {
              const targetEmissive = d < 4.0 ? 0.2 + Math.sin(elapsed * 4) * 0.1 : 0.0;
              c.material.emissiveIntensity += (targetEmissive - c.material.emissiveIntensity) * 0.1;
              if (c.material.emissive.getHex() === 0x000000 && d < 4.0) {
                c.material.emissive.setHex(0x555544);
              }
            }
          });
        });

        treeGroups.forEach(t => {
          t.group.rotation.z = Math.sin(elapsed + t.originRotX) * 0.02;
          t.group.rotation.x = Math.cos(elapsed * 0.8 + t.originRotZ) * 0.015;
        });

        toriiBars.forEach((t: any) => {
          const d = Math.sqrt((player.pos.x - t.originX)**2 + (player.pos.z - t.originZ)**2);
          const targetI = d < 12.0 ? 1.5 + Math.sin(elapsed * 5) * 0.5 : 0.1 + Math.sin(elapsed * 1.5) * 0.1;
          if (t.mesh.material.emissiveIntensity !== undefined) {
             t.mesh.material.emissiveIntensity += (targetI - t.mesh.material.emissiveIntensity) * 0.05;
          }
        });

        shrineData.forEach(s => {
          s.group.position.y = Math.sin(elapsed) * 0.2;
          s.light.position.y = 3 + Math.sin(elapsed) * 0.2;
          const d = player.pos.distanceTo(s.pos);
          const targetL = d < 10 ? 2.5 + Math.sin(elapsed * 8) * 0.5 : 1.2;
          s.light.intensity += (targetL - s.light.intensity) * 0.05;
        });

        if (cameraShakeTimer > 0) {
          cameraShakeTimer -= delta;
          camLook.x += (Math.random() - 0.5) * 0.8;
          camLook.y += (Math.random() - 0.5) * 0.8;
          camLook.z += (Math.random() - 0.5) * 0.8;
        }

        // 10. Water color HSL pulse
        waterMats.forEach((mat: any, i: number) => {
          const interactScale = (player.pos.x > 35 && player.pos.x < 48 && player.pos.z < 5 && player.pos.z > -10) ? 0.08 : 0.025;
          mat.color.setHSL(0.55, 0.5, 0.35 + Math.sin(elapsed * 0.9 + i) * interactScale);
        });

        // 11. Lantern flicker
        lanternMats.forEach((mat: any, i: number) => {
          mat.emissiveIntensity = 0.7 + Math.sin(elapsed * 1.8 + i * 1.3) * 0.45 + (Math.random() * 0.15);
        });

        if (!player.isMoving && playerMesh) {
          playerMesh.group.scale.y = 1 + Math.sin(elapsed * 2) * 0.03;
        } else if (playerMesh) {
          playerMesh.group.scale.y = 1;
        }

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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,6,4,0.65)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(240,200,140,0.1)',
        pointerEvents: 'none', // let clicks pass through to exit button
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontWeight: 300,
          fontSize: 11, color: 'rgba(240,235,224,0.45)',
          letterSpacing: 3, textTransform: 'uppercase',
        }}>
          {BIOME_NAMES[currentBiomeState] ?? currentBiomeState}
        </div>
      </nav>

      {/* Exit World button — top left, always visible */}
      <div style={{
        position: 'fixed', top: 16, left: 16, zIndex: 50,
        display: 'flex', gap: 8,
      }}>
        <a href="/" style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8, color: '#ffd4a0', textDecoration: 'none',
          background: 'rgba(20,14,8,0.88)',
          border: '1px solid rgba(240,200,140,0.3)',
          backdropFilter: 'blur(10px)',
          padding: '10px 16px',
          letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'border-color 0.2s',
        }}>
          ← EXIT WORLD
        </a>
        <a href="/dashboard" style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8, color: '#f0ebe0', textDecoration: 'none',
          background: 'rgba(181,71,10,0.45)',
          border: '1px solid rgba(255,180,80,0.4)',
          backdropFilter: 'blur(10px)',
          padding: '10px 16px',
          letterSpacing: 1,
        }}>MY PET →</a>
      </div>

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
          border: '1px solid rgba(240,200,140,0.5)',
          backdropFilter: 'blur(10px)',
          padding: '10px 22px', zIndex: 20,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9, color: '#ffd4a0', letterSpacing: 1,
          whiteSpace: 'nowrap',
          boxShadow: '0 0 15px rgba(240,200,140,0.3)',
          transition: 'all 0.2s ease',
          animation: 'interactBounce 0.5s ease 1, floatBob 2s ease-in-out infinite alternate',
        }}>
          {interactPrompt}
        </div>
      )}

      {/* Controls hint */}
      {controlsHint && (
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
      )}

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

      {/* Opening cinematic fade */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: '#000',
        opacity: cinematicDone ? 0 : 1,
        transition: 'opacity 2s ease',
        pointerEvents: cinematicDone ? 'none' : 'all',
      }} />
      {!cinematicDone && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 81,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic',
            fontSize: 'clamp(18px,3vw,32px)',
            color: 'rgba(240,235,224,0.8)',
            animation: 'floatBob 4s ease 1s both',
          }}>
            Enter the world.
          </div>
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

      {/* NPC Dialogue Overlay */}
      {npcDialogue && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40, width: 480,
          background: 'rgba(20,14,8,0.94)',
          border: '1px solid rgba(240,200,140,0.25)',
          backdropFilter: 'blur(12px)',
          padding: '20px 28px',
        }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8, color: '#ffd4a0', marginBottom: 12,
          }}>
            {npcDialogue.name.toUpperCase()}
          </div>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 300,
            fontSize: 14, color: '#f0ebe0', lineHeight: 1.7,
            marginBottom: 16,
          }}>
            {npcDialogue.lines[dialogueLine]}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {dialogueLine < npcDialogue.lines.length - 1 ? (
              <button onClick={() => setDialogueLine(d => d+1)} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: '#ffd4a0', background: 'none',
                border: '1px solid rgba(240,200,140,0.3)',
                padding: '6px 16px', cursor: 'pointer',
              }}>Next →</button>
            ) : (
              <button onClick={() => {
                setNpcDialogue(null); setDialogueLine(0)
              }} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: '#ffd4a0', background: 'none',
                border: '1px solid rgba(240,200,140,0.3)',
                padding: '6px 16px', cursor: 'pointer',
              }}>Close ✕</button>
            )}
          </div>
        </div>
      )}

      {/* Pause Menu */}
      {showPauseMenu && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(8,6,4,0.85)',
          backdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(20,14,8,0.96)',
            border: '1px solid rgba(240,200,140,0.2)',
            padding: '52px 64px',
            textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 14, color: '#ffd4a0', marginBottom: 24,
              letterSpacing: 2,
            }}>PAUSED</div>
            {[
              { label: 'Resume',      action: () => setShowPauseMenu(false), primary: true },
              { label: 'My Pet',      action: () => window.location.href = '/dashboard' },
              { label: 'Exit World',  action: () => window.location.href = '/' },
            ].map(btn => (
              <button key={btn.label} onClick={btn.action} style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 700,
                fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
                background: btn.primary ? 'rgba(181,71,10,0.5)' : 'rgba(240,235,224,0.06)',
                border: `1px solid ${btn.primary ? 'rgba(255,180,80,0.5)' : 'rgba(240,235,224,0.15)'}`,
                color: btn.primary ? '#ffd4a0' : 'rgba(240,235,224,0.6)',
                padding: '14px 48px', cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {biomeFlash && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 25, textAlign: 'center',
          pointerEvents: 'none',
          animation: 'biomeReveal 3s ease forwards',
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 300,
            fontSize: 11, color: 'rgba(240,235,224,0.5)',
            letterSpacing: 4, textTransform: 'uppercase',
            marginBottom: 8,
          }}>Entering</div>
          <div style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic',
            fontSize: 'clamp(28px,5vw,56px)',
            color: '#f0ebe0',
            textShadow: '0 0 40px rgba(240,180,80,0.4)',
          }}>
            {({
              CHERRY: 'Cherry Village',
              BAMBOO: 'Bamboo Forest',
              OCEAN: 'Ocean Cliffs',
              VOLCANIC: 'Volcanic Badlands',
              TUNDRA: 'Frozen Tundra',
            } as Record<string,string>)[currentBiomeState]}
          </div>
        </div>
      )}

      {tabletText && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            maxWidth: 600, padding: 40, border: '1px solid #444',
            background: 'rgba(20,20,20,0.95)', color: '#eaeaea',
            fontFamily: "'Syne', sans-serif", fontSize: 24, textAlign: 'center',
            lineHeight: 1.5,
          }}>
            <p>{tabletText}</p>
            <button onClick={() => setTabletText(null)} style={{
              marginTop: 30, padding: '10px 20px', background: 'transparent',
              color: '#888', border: '1px solid #555', cursor: 'pointer',
              fontFamily: "'DM Mono', monospace",
            }}>Close</button>
          </div>
        </div>
      )}

      {chestLoot && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            maxWidth: 400, padding: 40, border: '2px solid #8B6914',
            background: 'linear-gradient(180deg, #2a2212 0%, #111 100%)', color: '#ffcc00',
            fontFamily: "'Press Start 2P', monospace", fontSize: 14, textAlign: 'center',
            lineHeight: 1.8,
            boxShadow: '0 0 40px rgba(255,180,0,0.2)',
          }}>
            <p style={{ color: 'white', marginBottom: 20 }}>Found Loot!</p>
            <p style={{ fontSize: 18 }}>{chestLoot}</p>
            <button onClick={() => setChestLoot(null)} style={{
              marginTop: 30, padding: '10px 20px', background: '#8B6914',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: "'DM Mono', monospace",
            }}>Take</button>
          </div>
        </div>
      )}

      {showRest && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'black',
          animation: 'fadeInOutRest 4s ease forwards',
          pointerEvents: 'none',
        }} />
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes interactBounce {
          0% { transform: translate(-50%, 20px) scale(0.8); opacity: 0; }
          50% { transform: translate(-50%, -10px) scale(1.05); }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        @keyframes biomeReveal {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(0.9) }
          15%  { opacity:1; transform:translate(-50%,-50%) scale(1) }
          70%  { opacity:1; transform:translate(-50%,-50%) scale(1) }
          100% { opacity:0; transform:translate(-50%,-50%) scale(1.05) }
        }
        @keyframes fadeInOutRest {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
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
