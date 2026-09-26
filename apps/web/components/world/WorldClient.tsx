"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PetState, PetStats } from "@git-pet/core";
import PartySocket from "partysocket";
import { drawPet, getSpeciesRects, CANON_COLORS } from "@git-pet/renderer";
import type { SpriteView } from "@git-pet/renderer";
import { getThree, type ThreeNS } from "@/lib/three-global";
import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";

interface Props {
  petState: PetState;
  species: string;
}

// A player's floating 2D sprite: a canvas redrawn with drawPet(), used as a
// texture on a camera-facing plane. Built by createPetBillboard().
interface Billboard {
  group: ThreeNS.Group;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: ThreeNS.CanvasTexture;
  species: string;
  pState: PetState;
  labelSprite: ThreeNS.Sprite;
  redrawOffset: number;
}

interface RemotePlayer {
  bb: Billboard;
  targetPos: ThreeNS.Vector3;
  targetRot: number;
  species: string;
}

interface InteractionTarget {
  id: string;
  mesh: ThreeNS.Object3D;
}

// One step of a transient animation; returns false when finished.
type AnimationStep = () => boolean;

// A player's presence as sent by the PartyKit server (PetPresence in
// web-party/src/server.ts), in "snapshot" and "pet_update" messages.
interface RemotePresence {
  username?: string;
  species?: string;
  petType?: string;
  x: number;
  y: number;
  rot?: number;
  petState?: PetState;
}

export function WorldClient({ petState, species: initialSpecies }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mounted = useRef(true);
  const rendererRef = useRef<ThreeNS.WebGLRenderer | null>(null);
  const cleanupFns = useRef<(() => void)[]>([]);
  const socketRef = useRef<PartySocket | null>(null);

  // Movement & State
  const keysRef = useRef<Record<string, boolean>>({});
  const playerStateRef = useRef({
    pos: { x: 0, y: 0.5, z: -21.5 },
    rot: Math.PI,
    vel: { x: 0, y: 0, z: 0 },
    isMoving: false,
    controlEnabled: false,
    speed: 0.09,
  });

  const petStateRef = useRef({
    pos: { x: 0, y: 0.5, z: -22.5 },
    rot: Math.PI,
  });

  const playerRef = useRef<ThreeNS.Group | null>(null); // Billboard group ref
  const remotePlayersRef = useRef<Record<string, RemotePlayer>>({});
  const ghostsRef = useRef<Map<string, { group: ThreeNS.Group, mood?: string }>>(new Map());
  const nearbyPlayer = useRef<InteractionTarget | null>(null);
  const interactionOpen = useRef(false);
  const prevNearbyId = useRef<string | null>(null);
  // Reciprocal befriend: pending incoming requests keyed by sender username
  const pendingBefriendRef = useRef<Map<string, { timestamp: number; timerId: ReturnType<typeof setTimeout> }>>(new Map());
  // Ambient proximity: seconds each remote player has been continuously within 4 units
  const proximityTimers = useRef<Map<string, number>>(new Map());
  // Tracks which pairs have an active ambient head-tilt to avoid re-triggering
  const ambientTiltActive = useRef<Set<string>>(new Set());

  const [showInteractHint, setShowInteractHint] = useState(false);
  const [cinematicDone, setCinematicDone] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [promptLabel, setPromptLabel] = useState<string | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [localHP, setLocalHP] = useState(100);
  // Derived once from the server-fetched `initialSpecies` prop and never
  // reassigned — see the hydration effect below for why.
  const [selectedPet] = useState<{ type: string; id: string }>({ type: initialSpecies, id: 'prop-fallback' });
  const [isHydrated, setIsHydrated] = useState(false);
  const [friendCount, setFriendCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isFighting, setIsFighting] = useState(false);
  const [targetHP, setTargetHP] = useState(100);
  const lastFightTime = useRef<number>(0);
  const [isPickingEmoji, setIsPickingEmoji] = useState(false);

  // Interaction Data Refs
  const friendsRef = useRef<Set<string>>(new Set());
  const remotePlayerHealth = useRef<Map<string, number>>(new Map());
  const healthBarsRef = useRef<Map<string, { container: HTMLDivElement, bar: HTMLDivElement }>>(new Map());
  const shakeRef = useRef(0);
  const animationsRef = useRef<AnimationStep[]>([]);
  const sceneRef = useRef<ThreeNS.Scene | null>(null);
  const cssContainerRef = useRef<HTMLDivElement>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);

  // Interaction Menu State
  const [interactionTarget, setInteractionTarget] = useState<InteractionTarget | null>(null);
  const interactionTargetRef = useRef<InteractionTarget | null>(null);
  const movementBlocked = useRef(false);
  const speciesCache = useRef<Map<string, string>>(new Map());

  const closeInteractionMenu = () => {
    interactionTargetRef.current = null;
    setInteractionTarget(null);
    setIsPickingEmoji(false);
    setIsFighting(false);
    setTargetHP(100);
    movementBlocked.current = false;
    interactionOpen.current = false;
    // Hard-clear all keys and velocity so no drift/lurch on close
    keysRef.current = {};
    playerStateRef.current.vel.x = 0;
    playerStateRef.current.vel.z = 0;
    playerStateRef.current.isMoving = false;
  };




  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // Sync Hydration & Friends
  //
  // This used to also re-read a cached `selectedPet` from localStorage and
  // call setSelectedPet() with it (and a second, near-identical effect below
  // did the exact same thing again). world/page.tsx already does a fresh
  // Redis lookup for the current species on every server render and passes
  // it in as `initialSpecies`, so that read was both redundant and actively
  // harmful: JSON.parse always returns a new object, so calling
  // setSelectedPet() with it — twice, from two separate effects — changed
  // `selectedPet`'s identity shortly after mount for any returning user, and
  // `selectedPet` sits in the giant Three.js effect's dependency array
  // below. That silently tore down and rebuilt the entire world (new
  // WebGLRenderer, a second "join" broadcast to other players, doubled
  // keyboard listeners) moments after every such user entered it.
  useEffect(() => {
    setIsHydrated(true);

    // Fetch friends
    fetch(`/api/friends?userId=${petState.gitData.username}`)
      .then(res => res.json())
      .then(data => {
        if (data.friends) {
          friendsRef.current = new Set(data.friends);
          setFriendCount(data.friends.length);
        }
      })
      .catch(err => console.error("Failed to fetch friends", err));

    return () => { mounted.current = false; };
  }, [initialSpecies, petState.gitData.username]);

  // --- Interaction Logic ---

  const triggerHeartAnim = (mesh: ThreeNS.Object3D | null | undefined) => {
    if (!mesh || !sceneRef.current) return;
    const THREE = getThree();
    if (!THREE || !THREE.CSS2DObject) return;

    for (let i = 0; i < 8; i++) {
      const div = document.createElement('div');
      div.innerHTML = "♥";
      div.style.color = "#FF4466";
      div.style.fontSize = "22px";
      div.style.fontWeight = "bold";
      div.style.userSelect = "none";
      div.style.pointerEvents = "none";
      const heart = new THREE.CSS2DObject(div);
      // Position relative to mesh position
      heart.position.set(
        mesh.position.x + (Math.random() - 0.5) * 1.5,
        mesh.position.y + 1.5 + i * 0.25,
        mesh.position.z + (Math.random() - 0.5) * 0.5
      );
      sceneRef.current.add(heart);
      const heartStart = Date.now();
      animationsRef.current.push(() => {
        const el = (Date.now() - heartStart) / 2000;
        heart.position.y += 0.018;
        heart.position.x += Math.sin(Date.now() * 0.005) * 0.005;
        div.style.opacity = String(Math.max(0, 1 - el));
        if (el >= 1) {
          if (sceneRef.current) sceneRef.current.remove(heart);
          return false;
        }
        return true;
      });
    }

    // Scale-only pulse — safe on any mesh type including billboard
    const originalScale = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
    const pulseStart = Date.now();
    animationsRef.current.push(() => {
      const el = Date.now() - pulseStart;
      if (el < 200) {
        const s = 1 + (0.35 * (el / 200));
        mesh.scale.set(originalScale.x * s, originalScale.y * s, originalScale.z * s);
      } else if (el < 400) {
        const s = 1 + (0.35 * (1 - (el - 200) / 200));
        mesh.scale.set(originalScale.x * s, originalScale.y * s, originalScale.z * s);
      } else if (el < 600) {
        const s = 1 + (0.2 * ((el - 400) / 200));
        mesh.scale.set(originalScale.x * s, originalScale.y * s, originalScale.z * s);
      } else if (el < 800) {
        const s = 1 + (0.2 * (1 - (el - 600) / 200));
        mesh.scale.set(originalScale.x * s, originalScale.y * s, originalScale.z * s);
      } else {
        mesh.scale.set(originalScale.x, originalScale.y, originalScale.z);
        return false;
      }
      return true;
    });
  };

  // Trigger a fizzle (failed befriend) animation — fewer particles, faster fade
  const triggerFizzleAnim = (mesh: ThreeNS.Object3D | null | undefined) => {
    if (!mesh || !sceneRef.current) return;
    const THREE = getThree();
    if (!THREE?.CSS2DObject) return;
    for (let i = 0; i < 4; i++) {
      const div = document.createElement('div');
      div.innerHTML = '💔';
      div.style.fontSize = '16px';
      div.style.userSelect = 'none';
      div.style.pointerEvents = 'none';
      const obj = new THREE.CSS2DObject(div);
      obj.position.set(
        mesh.position.x + (Math.random() - 0.5) * 1.2,
        mesh.position.y + 1.2 + i * 0.2,
        mesh.position.z + (Math.random() - 0.5) * 0.4
      );
      sceneRef.current.add(obj);
      const t0 = Date.now();
      animationsRef.current.push(() => {
        const el = (Date.now() - t0) / 600;
        obj.position.y += 0.012;
        div.style.opacity = String(Math.max(0, 1 - el));
        if (el >= 1) { sceneRef.current?.remove(obj); return false; }
        return true;
      });
    }
  };

  // Enhanced heart animation spawning hearts from both pets converging at midpoint
  const triggerMidpointHeartAnim = (meshA: ThreeNS.Object3D | null | undefined, meshB: ThreeNS.Object3D | null | undefined) => {
    if (!sceneRef.current) return;
    const THREE = getThree();
    if (!THREE?.CSS2DObject) return;
    const mid = meshA && meshB
      ? new THREE.Vector3().addVectors(meshA.position, meshB.position).multiplyScalar(0.5)
      : (meshA || meshB)?.position?.clone() || new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const div = document.createElement('div');
      div.innerHTML = '♥';
      div.style.color = '#FF4466';
      div.style.fontSize = '22px';
      div.style.fontWeight = 'bold';
      div.style.userSelect = 'none';
      div.style.pointerEvents = 'none';
      const obj = new THREE.CSS2DObject(div);
      obj.position.set(
        mid.x + (Math.random() - 0.5) * 2,
        mid.y + 1.5 + i * 0.22,
        mid.z + (Math.random() - 0.5) * 0.8
      );
      sceneRef.current.add(obj);
      const t0 = Date.now();
      animationsRef.current.push(() => {
        const el = (Date.now() - t0) / 2200;
        obj.position.y += 0.018;
        obj.position.x += Math.sin(Date.now() * 0.005) * 0.005;
        div.style.opacity = String(Math.max(0, 1 - el));
        if (el >= 1) { sceneRef.current?.remove(obj); return false; }
        return true;
      });
    }
    // Pulse both meshes
    [meshA, meshB].forEach(mesh => {
      if (!mesh) return;
      const ox = mesh.scale.x, oy = mesh.scale.y, oz = mesh.scale.z;
      const t1 = Date.now();
      animationsRef.current.push(() => {
        const el = Date.now() - t1;
        if (el < 200) { const s = 1 + 0.4 * (el / 200); mesh.scale.set(ox * s, oy * s, oz * s); }
        else if (el < 400) { const s = 1 + 0.4 * (1 - (el - 200) / 200); mesh.scale.set(ox * s, oy * s, oz * s); }
        else { mesh.scale.set(ox, oy, oz); return false; }
        return true;
      });
    });
  };

  const triggerDamageAnim = (mesh: ThreeNS.Object3D | null | undefined, damageAmount: number) => {
    if (!mesh || !sceneRef.current) return;
    const THREE = getThree();
    if (!THREE?.CSS2DObject) return;

    // Floating damage number
    const dmgDiv = document.createElement('div');
    dmgDiv.innerText = `-${damageAmount}`;
    dmgDiv.style.color = "#FF3333";
    dmgDiv.style.fontWeight = "bold";
    dmgDiv.style.fontSize = "28px";
    dmgDiv.style.textShadow = "0 0 10px rgba(255,0,0,0.9)";
    dmgDiv.style.pointerEvents = "none";
    dmgDiv.style.userSelect = "none";
    const dmgObj = new THREE.CSS2DObject(dmgDiv);
    dmgObj.position.set(mesh.position.x, mesh.position.y + 2.5, mesh.position.z);
    sceneRef.current.add(dmgObj);
    const t0 = Date.now();
    animationsRef.current.push(() => {
      const el = (Date.now() - t0) / 1000;
      dmgObj.position.y += 0.022;
      dmgDiv.style.opacity = String(Math.max(0, 1 - el));
      if (el >= 1) { sceneRef.current?.remove(dmgObj); return false; }
      return true;
    });

    // Scale hit reaction on target mesh
    const ox = mesh.scale.x, oy = mesh.scale.y, oz = mesh.scale.z;
    const t1 = Date.now();
    animationsRef.current.push(() => {
      const el = Date.now() - t1;
      if (el < 100) {
        mesh.scale.set(ox * 1.3, oy * 0.8, oz * 1.3);
      } else if (el < 250) {
        mesh.scale.set(ox, oy, oz);
      } else {
        mesh.scale.set(ox, oy, oz);
        return false;
      }
      return true;
    });
  };

  // Fight damage is driven by real GitHub-derived stats, not a flat number:
  // an attacker with a healthy streak (high health/energy) hits harder, and a
  // defender with a healthy streak (high health) resists more of it. Kept on
  // the familiar 0-100 HP scale so none of the bar/UI math has to change.
  const computeFightDamage = (attackerStats: PetStats, defenderStats: PetStats) => {
    const attackPower = (attackerStats.health + attackerStats.energy) / 2; // 0-100
    const attackMult = 0.5 + attackPower / 100;         // 0.5x (neglected) – 1.5x (thriving)
    const defenseMult = 1 - defenderStats.health / 200; // 1.0x (neglected) – 0.5x (thriving)
    const damage = Math.round(20 * attackMult * defenseMult);
    return Math.min(35, Math.max(5, damage));
  };

  // Persist a fight win so it durably counts for something (survives reconnects,
  // can feed the leaderboard later) instead of only living in in-memory HP refs.
  const username = petState.gitData.username;
  const persistFightWin = useCallback(() => {
    fetch("/api/fights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId: username }),
      keepalive: true,
    }).catch(() => { });
  }, [username]);


  // Main Three.js logic
  useEffect(() => {
    if (typeof window === "undefined" || !canvasRef.current) return;
    if (!selectedPet) return;
    // Same array init() pushes into below; captured once so the cleanup
    // at the end runs exactly the functions registered by this run.
    const cleanups = cleanupFns.current;

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src; s.onload = () => resolve(); s.onerror = reject;
        document.head.appendChild(s);
      });

    const init = async () => {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/renderers/CSS2DRenderer.js");
      if (!mounted.current || !canvasRef.current) return;

      const loadedThree = getThree();
      if (!loadedThree) return;
      // Re-bound so hoisted function declarations below (which TypeScript
      // can't see the null check from) get the non-undefined type too.
      const THREE = loadedThree;

      // ─── SETUP ───
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current, antialias: true, alpha: false,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;
      // Kept as typed references so the day/night cycle can recolor them
      // directly instead of casting scene.fog / scene.background every frame.
      const sceneFog = new THREE.FogExp2(0xb8cce0, 0.018);
      const skyColor = new THREE.Color(0x87b4d0);
      scene.fog = sceneFog;
      scene.background = skyColor;

      const labelRenderer = new THREE.CSS2DRenderer();
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.domElement.style.position = 'absolute';
      labelRenderer.domElement.style.top = '0px';
      labelRenderer.domElement.style.pointerEvents = 'none';
      if (cssContainerRef.current) cssContainerRef.current.appendChild(labelRenderer.domElement);
      labelRendererRef.current = labelRenderer;

      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 140);
      const camPos = new THREE.Vector3(0, 14, 40);
      const camLook = new THREE.Vector3(0, 2, 0);

      // --- Lighting ---
      const sunLink = new THREE.DirectionalLight(0xffd4a0, 2.4);
      sunLink.position.set(20, 40, 10); sunLink.castShadow = true;
      sunLink.shadow.mapSize.width = 2048; sunLink.shadow.mapSize.height = 2048;
      sunLink.shadow.camera.near = 1; sunLink.shadow.camera.far = 140;
      sunLink.shadow.camera.left = -60; sunLink.shadow.camera.right = 60;
      sunLink.shadow.camera.top = 60; sunLink.shadow.camera.bottom = -60;
      sunLink.shadow.bias = -0.001;
      scene.add(sunLink);
      const fillLight = new THREE.DirectionalLight(0x9bb8d4, 0.7);
      fillLight.position.set(-20, 15, -10); scene.add(fillLight);
      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55); scene.add(ambientLight);
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.45); scene.add(hemiLight);

      // billboard sprite helper
      // Redrawing a billboard's canvas + re-uploading it as a GPU texture is
      // the one part of the render loop whose cost scales with player count
      // (it happens once per remote player, every frame). The sway/idle
      // animation is slow enough that redrawing every few frames instead of
      // every single frame is visually indistinguishable, so remote players'
      // billboards are throttled to this interval (staggered per-player via
      // redrawOffset below, so N players don't all redraw on the same
      // frame). The local player's own billboard is left unthrottled since
      // there's only ever one of it — it doesn't scale with room size.
      const BILLBOARD_REDRAW_INTERVAL = 3;

      function createPetBillboard(username: string, species: string, pState: PetState) {
        const canvas = document.createElement('canvas');
        canvas.width = 80; canvas.height = 80;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: true });
        const geometry = new THREE.PlaneGeometry(2.5, 2.5);
        const plane = new THREE.Mesh(geometry, material);
        plane.position.y = 1.25;

        // billboard behavior
        plane.onBeforeRender = (_renderer, _scene, camera) => {
          plane.quaternion.copy(camera.quaternion);
        };

        const group = new THREE.Group();
        group.add(plane);

        // Add Label
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256; labelCanvas.height = 64;
        const lctx = labelCanvas.getContext('2d')!;
        lctx.fillStyle = 'rgba(0,0,0,0.5)';
        lctx.font = 'bold 24px monospace';
        lctx.textAlign = 'center';
        lctx.fillStyle = '#ffffff';
        let indicator = "⚪";
        if (pState.mood === "happy" || pState.mood === "neutral") indicator = "🟢";
        else if (pState.mood === "tired" || pState.mood === "sad") indicator = "🟡";
        lctx.fillText(`@${username.toUpperCase()} ${indicator}`, 128, 40);

        const lTex = new THREE.CanvasTexture(labelCanvas);
        const lMat = new THREE.SpriteMaterial({ map: lTex, transparent: true });
        const labelSprite = new THREE.Sprite(lMat);
        labelSprite.scale.set(4, 1, 1);
        labelSprite.position.set(0, 2.8, 0);
        group.add(labelSprite);

        // Health Bar UI
        if (username !== petState.gitData.username) {
          const container = document.createElement('div');
          container.style.width = '60px';
          container.style.height = '6px';
          container.style.background = '#333';
          container.style.borderRadius = '3px';
          container.style.overflow = 'hidden';
          container.style.border = '1px solid #000';

          const bar = document.createElement('div');
          bar.style.height = '100%';
          bar.style.width = '100%';
          bar.style.background = '#4CAF50';
          bar.style.transition = 'width 200ms';
          container.appendChild(bar);

          const hpBar = new THREE.CSS2DObject(container);
          hpBar.position.set(0, 3.2, 0);
          group.add(hpBar);
          healthBarsRef.current.set(username, { container, bar });
        }

        const redrawOffset = Math.floor(Math.random() * BILLBOARD_REDRAW_INTERVAL);
        return { group, canvas, ctx, texture, species, pState, labelSprite, redrawOffset };
      }

      function updateBillboard(bb: Billboard, frame: number, view: SpriteView) {
        const { ctx, canvas, texture, species, pState } = bb;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        let adjustedFrame = frame;
        if (pState.mood === "coma") {
          ctx.filter = 'grayscale(100%) opacity(70%)';
          adjustedFrame = 0;
        } else if (pState.mood === "tired" || pState.mood === "sad") {
          ctx.filter = 'saturate(50%)';
          adjustedFrame = Math.floor(frame * 0.5);
        }
        
        drawPet(ctx, pState, adjustedFrame, canvas.width, canvas.height, view, species, { transparent: true });
        ctx.restore();
        texture.needsUpdate = true;
      }

      function buildVoxelPet(species: string, position: { x: number; z: number }, mood: string = "coma") {
        const voxelGroup = new THREE.Group();
        const primary = CANON_COLORS[species] || CANON_COLORS.wolf;
        const rects = getSpeciesRects(species, 0, primary, "front");
        const scale = 0.025;
        const centerX = 20;
        const centerY = 22;

        if (rects) {
          for (const [rx, ry, rw, rh, color] of rects) {
            const baseColor = new THREE.Color(color);
            if (mood === "coma") {
              baseColor.setHex(0x9ca3af);
            } else if (mood === "tired" || mood === "sad") {
              baseColor.lerp(new THREE.Color(0x9ca3af), 0.5);
            }
            const mat = new THREE.MeshLambertMaterial({ color: baseColor });
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(rw * scale, rh * scale, 0.08), mat);
            mesh.position.set(
              (rx + rw / 2 - centerX) * scale,
              (centerY - (ry + rh / 2)) * scale,
              0
            );
            voxelGroup.add(mesh);
          }
        }

        const groundY = getGroundHeight(position.x, position.z);
        voxelGroup.position.set(position.x, groundY + 0.5, position.z);
        return voxelGroup;
      }

      // Frees the GPU/JS-heap resources (geometry, material, texture) backing
      // every mesh in a group before it's dropped for good. Three.js does not
      // do this automatically on scene.remove() — without it, every player
      // who leaves, changes species, or every ghost that respawns leaks this
      // memory for the rest of the session.
      function disposeGroup(group: ThreeNS.Object3D | null | undefined) {
        if (!group) return;
        group.traverse((child) => {
          // Meshes, sprites, and points all carry geometry/material; plain
          // groups and CSS2D labels don't, so both are optional here.
          const renderable = child as Partial<Pick<ThreeNS.Mesh, "geometry" | "material">>;
          renderable.geometry?.dispose();
          if (renderable.material) {
            const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
            materials.forEach((mat) => {
              (mat as Partial<ThreeNS.MeshBasicMaterial>).map?.dispose();
              mat.dispose();
            });
          }
        });
      }

      // Fully removes a remote player: scene object, its GPU resources, and
      // every tracker keyed by their username (health bar DOM node, in-memory
      // battle HP, cached species) — otherwise these keep growing for every
      // distinct player who ever passes through the room over a session.
      // Shared by the explicit pet_left message and by the snapshot-diff
      // cleanup below (for a player who left while we were reconnecting and
      // so never got an explicit pet_left).
      function removeRemotePlayer(uid: string) {
        const peer = remotePlayersRef.current[uid];
        if (peer) {
          scene.remove(peer.bb.group);
          disposeGroup(peer.bb.group);
          delete remotePlayersRef.current[uid];
        }
        healthBarsRef.current.delete(uid);
        remotePlayerHealth.current.delete(uid);
        speciesCache.current.delete(uid);
      }

      function removeGhost(username: string) {
        const ghost = ghostsRef.current.get(username);
        if (!ghost) return;
        scene.remove(ghost.group);
        disposeGroup(ghost.group);
        ghostsRef.current.delete(username);
      }

      function spawnGhost(username: string, species: string, position: { x: number; z: number }, mood: string = "coma") {
        removeGhost(username);
        const voxelGroup = buildVoxelPet(species, position, mood);
        voxelGroup.traverse((child) => {
          const material = (child as Partial<Pick<ThreeNS.Mesh, "material">>).material;
          if (material && !Array.isArray(material)) {
            material.opacity = mood === "coma" ? 0.4 : 0.6;
            material.transparent = true;
          }
        });

        let indicator = "⚪";
        if (mood === "happy" || mood === "neutral") indicator = "🟢";
        else if (mood === "tired" || mood === "sad") indicator = "🟡";

        const labelDiv = document.createElement("div");
        labelDiv.textContent = `@${username} ${indicator}`;
        labelDiv.style.fontFamily = "monospace";
        labelDiv.style.fontSize = "12px";
        labelDiv.style.color = "#64748b";
        labelDiv.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
        labelDiv.style.pointerEvents = "none";
        const label = new THREE.CSS2DObject(labelDiv);
        label.position.set(0, 2.2, 0);
        voxelGroup.add(label);

        scene.add(voxelGroup);
        ghostsRef.current.set(username, { group: voxelGroup, mood });
      }

      // --- Helpers ---
      const colliders: { box: ThreeNS.Box3, mesh: ThreeNS.Object3D }[] = [];
      function vox(x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, castShadow = false, receiveShadow = false, isSolid = false): ThreeNS.Mesh {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
        mesh.position.set(x, y, z); mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        scene.add(mesh);
        if (isSolid) { mesh.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(mesh), mesh }); }
        return mesh;
      }

      // ─── AUDIO SYSTEM ───
      let audioInit = false; let audioCtx: AudioContext | null = null; let audioListener: ThreeNS.AudioListener | null = null;
      function initAudio() {
        if (audioInit) return; audioInit = true;
        try {
          audioListener = new THREE.AudioListener(); camera.add(audioListener);
          audioCtx = audioListener.context;
        } catch (e) { console.warn("Audio init failed", e); }
      }

      function playFootstep() {
        if (!audioInit || !audioCtx || !audioListener) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(120, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.015, audioCtx.currentTime); osc.connect(gain); gain.connect(audioListener.getInput());
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
      }

      function playInteract() {
        if (!audioInit || !audioCtx || !audioListener) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime); osc.connect(gain); gain.connect(audioListener.getInput());
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
      }

      // ─── WORLD BUILDING ───
      const swayables: { mesh: ThreeNS.Object3D; speed: number; offset: number }[] = [];
      const worldDecor = new THREE.Group();
      scene.add(worldDecor);

      const fallingPetals: { mesh: ThreeNS.Object3D; offset: number }[] = [];
      let pondMesh: ThreeNS.Mesh<ThreeNS.CylinderGeometry, ThreeNS.MeshLambertMaterial> | null = null;
      let shrineBellHitbox: ThreeNS.Object3D | null = null;
      let shrineBellMesh: ThreeNS.Mesh | null = null;
      function getGroundHeight(x: number, z: number) {
        const dist = Math.sqrt(x * x + z * z);
        const yOffset = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 1.2 + Math.sin(x * 0.02) * 0.5;
        let groundY = dist < 30 ? 0 : yOffset * Math.min(1, (dist - 30) / 40);

        // Edge drop-off
        if (dist > 240) {
          const edgeFactor = (dist - 240) / 60;
          groundY -= edgeFactor * edgeFactor * 20;
        }
        return groundY;
      }

      function buildPath(startX: number, startZ: number, endX: number, endZ: number, count: number) {
        const stoneColors = [0x9a9a9a, 0x8a8a8a, 0xaaaaaa, 0x888888];
        for (let i = 0; i < count; i++) {
          const t = i / count;
          const x = startX + (endX - startX) * t;
          const z = startZ + (endZ - startZ) * t;
          const y = getGroundHeight(x, z);
          const pathPiece = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 0.06, 0.7),
            new THREE.MeshLambertMaterial({ color: stoneColors[Math.floor(Math.random() * 4)] })
          );
          pathPiece.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.03, z + (Math.random() - 0.5) * 0.5);
          pathPiece.rotation.y = Math.atan2(endX - startX, endZ - startZ) + (Math.random() - 0.5) * 0.6;
          worldDecor.add(pathPiece);
        }
      }

      buildPath(0, 8, 0, 100, 35);    // Plains (Front)
      buildPath(0, -15, 0, -100, 35); // Mountain (Back)
      buildPath(8, 0, 100, 0, 35);   // Desert (Right)
      buildPath(-8, 0, -100, 0, 35); // Forest (Left)

      const instancedRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.0, 0), new THREE.MeshLambertMaterial({ color: 0x888888 }), 600);
      let rockIndex = 0;

      const instancedBushes = new THREE.InstancedMesh(new THREE.SphereGeometry(1.0, 5, 5), new THREE.MeshLambertMaterial({ color: 0x4B7B31 }), 600);
      let bushIndex = 0;

      const instancedGrass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x7BAF5A }), 1200);
      let grassIndex = 0;

      const instancedTreeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a1a }), 800);
      let treeTrunkIndex = 0;

      const instancedTreeCanopies = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2, 0), new THREE.MeshLambertMaterial({ color: 0x3a5a28 }), 1600);
      let treeCanopyIndex = 0;

      const instancedCacti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.MeshLambertMaterial({ color: 0x2d5a27 }), 200);
      let cactusIndex = 0;

      worldDecor.add(instancedRocks, instancedBushes, instancedGrass, instancedTreeTrunks, instancedTreeCanopies, instancedCacti);

      const matrix = new THREE.Matrix4();

      function addInstancedRock(x: number, y: number, z: number, scale: number) {
        if (rockIndex >= 600) return;
        matrix.compose(new THREE.Vector3(x, y + scale * 0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale, scale, scale));
        instancedRocks.setMatrixAt(rockIndex, matrix);
        instancedRocks.setColorAt(rockIndex, new THREE.Color(0x888888).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
        rockIndex++;
      }

      function addInstancedBush(x: number, y: number, z: number, scale: number) {
        if (bushIndex >= 600) return;
        matrix.compose(new THREE.Vector3(x, y + scale * 0.5, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedBushes.setMatrixAt(bushIndex, matrix);
        instancedBushes.setColorAt(bushIndex, new THREE.Color(0x4B7B31).offsetHSL((Math.random() - 0.5) * 0.05, 0, 0));
        bushIndex++;
      }

      function addInstancedGrass(x: number, y: number, z: number, scale: number) {
        if (grassIndex >= 1200) return;
        matrix.compose(new THREE.Vector3(x, y + scale * 0.3, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedGrass.setMatrixAt(grassIndex, matrix);
        instancedGrass.setColorAt(grassIndex, new THREE.Color(0x7BAF5A).offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05));
        grassIndex++;
      }

      function addInstancedTree(x: number, y: number, z: number, scale: number) {
        if (treeTrunkIndex >= 800 || treeCanopyIndex >= 1598) return;
        matrix.compose(new THREE.Vector3(x, y + 1 * scale, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedTreeTrunks.setMatrixAt(treeTrunkIndex++, matrix);

        matrix.compose(new THREE.Vector3(x, y + 2.5 * scale, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale, scale, scale));
        instancedTreeCanopies.setMatrixAt(treeCanopyIndex++, matrix);
        if (Math.random() > 0.5) {
          matrix.compose(new THREE.Vector3(x + (Math.random() - 0.5) * scale, y + 3.5 * scale, z + (Math.random() - 0.5) * scale), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale * 0.8, scale * 0.8, scale * 0.8));
          instancedTreeCanopies.setMatrixAt(treeCanopyIndex++, matrix);
        }
      }

      function addInstancedCactus(x: number, y: number, z: number, scale: number) {
        if (cactusIndex >= 200) return;
        matrix.compose(new THREE.Vector3(x, y + scale * 0.5, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedCacti.setMatrixAt(cactusIndex, matrix);
        instancedCacti.setColorAt(cactusIndex, new THREE.Color(0x2d5a27).offsetHSL(0.02, 0, (Math.random() - 0.5) * 0.1));
        cactusIndex++;
      }


      const groundGeo = new THREE.PlaneGeometry(600, 600, 150, 150); groundGeo.rotateX(-Math.PI / 2);
      const groundColors: number[] = []; const groundPos = groundGeo.attributes.position;
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i);
        const dist = Math.sqrt(gx * gx + gz * gz);
        const yOffset = Math.sin(gx * 0.05) * Math.cos(gz * 0.05) * 1.2 + Math.sin(gx * 0.02) * 0.5;
        const finalY = dist < 30 ? 0 : yOffset * Math.min(1, (dist - 30) / 40);
        groundPos.setY(i, finalY);

        const n = Math.sin(gx * 2.3) * Math.cos(gz * 1.9);
        if (n > 0.2) groundColors.push(0.28, 0.54, 0.22); else if (n > -0.2) groundColors.push(0.32, 0.60, 0.26); else groundColors.push(0.26, 0.50, 0.20);
      }
      groundGeo.attributes.position.needsUpdate = true;
      groundGeo.computeVertexNormals();
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
      const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      ground.receiveShadow = true; scene.add(ground);
      for (let gx = -30; gx < 30; gx++) vox(gx + 0.5, -0.3, -32, 0x8B6914, 1, 0.4, 1);


      function buildTorii(x: number, z: number) {
        const red = 0xcc3300, darkRed = 0x992200;
        for (let py = 0; py < 5; py++) { vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); }
        vox(x, 5.3, z, darkRed, 6, 0.45, 0.5, true, false, true);
        vox(x, 4.6, z, red, 5, 0.35, 0.45, true);
        vox(x - 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35);
        vox(x + 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35);
      }
      buildTorii(0, -7); buildTorii(0, -18);
      const lanternMats: ThreeNS.MeshLambertMaterial[] = [];
      function buildStoneLantern(x: number, z: number) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);

        const stone = 0x888880;

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), new THREE.MeshLambertMaterial({ color: stone }));
        base.position.y = 0.2;
        g.add(base);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.45), new THREE.MeshLambertMaterial({ color: stone }));
        body.position.y = 0.65;
        g.add(body);

        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), new THREE.MeshLambertMaterial({ color: stone }));
        neck.position.y = 1.1;
        g.add(neck);

        const lMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffcc66), emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.0 });
        const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), lMat);
        lMesh.position.set(0, 1.75, 0); lMesh.castShadow = true; g.add(lMesh);
        lanternMats.push(lMat);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.95), new THREE.MeshLambertMaterial({ color: stone }));
        cap.position.y = 2.15;
        g.add(cap);

        const light = new THREE.PointLight(0xffaa22, 1.4, 8);
        light.position.y = 1.8;
        g.add(light);

        worldDecor.add(g);
        g.updateMatrixWorld(true);
        colliders.push({ box: new THREE.Box3().setFromObject(base), mesh: base });
      }
      buildStoneLantern(-2, -7);
      buildStoneLantern(2, -7);
      buildStoneLantern(-2, 0);
      buildStoneLantern(2, 0);

      function buildCherryTree(x: number, z: number, h: number) {
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true, false, ty < 2);
        for (let bx = -3; bx <= 3; bx++) for (let by = -1; by <= 2; by++) for (let bz = -3; bz <= 3; bz++) {
          const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz);
          if (dist < 3.2 && Math.random() > dist * 0.15) vox(x + bx * 0.88, h + by * 0.88, z + bz * 0.88, blossoms[Math.floor(Math.random() * 4)], 0.85, 0.85, 0.85, true);
        }

        // Flower patches
        for (let i = 0; i < 4; i++) {
          const px = x + (Math.random() - 0.5) * 5;
          const pz = z + (Math.random() - 0.5) * 5;
          const patch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8),
            new THREE.MeshLambertMaterial({ color: 0xFFB7C5 })
          );
          patch.position.set(px, 0.02, pz);
          scene.add(patch);
        }

        // Fallen petals
        for (let i = 0; i < 8; i++) {
          const px = x + (Math.random() - 0.5) * 6;
          const pz = z + (Math.random() - 0.5) * 6;
          const petal = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 0.2),
            new THREE.MeshLambertMaterial({ color: 0xFFCDD9, side: THREE.DoubleSide })
          );
          petal.position.set(px, 0.01 + Math.random() * 0.02, pz);
          petal.rotation.x = -Math.PI / 2;
          petal.rotation.z = Math.random() * Math.PI;
          scene.add(petal);
        }
      }
      buildCherryTree(-11, -5, 6); buildCherryTree(-17, -13, 5); buildCherryTree(14, -8, 4); buildCherryTree(-9, 8, 4);

      const POND_X = 9, POND_Z = -4;
      const pondGeo = new THREE.CylinderGeometry(4, 4, 0.1, 16);
      const pondMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
      pondMesh = new THREE.Mesh(pondGeo, pondMat);
      pondMesh.position.set(POND_X, 0.05, POND_Z);
      worldDecor.add(pondMesh);

      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 3.8 + Math.random() * 0.4;
        const rx = POND_X + Math.cos(angle) * radius;
        const rz = POND_Z + Math.sin(angle) * radius;
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5), new THREE.MeshLambertMaterial({ color: 0x7BAF5A }));
        reed.position.set(rx, 0.75, rz);
        worldDecor.add(reed);
        swayables.push({ mesh: reed, speed: 1.5, offset: Math.random() });
      }

      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        const g = new THREE.Group(); scene.add(g);
        for (let s = 0; s < 3; s++) for (let sx = -(3 - s); sx <= (3 - s); sx++) for (let sz = -(2 - s); sz <= (2 - s); sz++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 1), new THREE.MeshLambertMaterial({ color: stone }));
          m.position.set(x + sx, s * 0.45, z + sz + 3); g.add(m);
        }
        for (let wx = -3; wx <= 3; wx++) for (let wy = 0; wy < 4; wy++) for (let wz = -2; wz <= 2; wz++) {
          const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0;
          if (!isWall) continue;
          if (wx === 0 && wz === -2 && wy < 2) continue;
          const isWindow = Math.abs(wx) === 2 && wz === -2 && wy === 1;
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial(isWindow
              ? { color: 0xffcc66, emissive: 0xffaa22, emissiveIntensity: 1.2 }
              : { color: wood })
          );
          m.position.set(x + wx, 1.4 + wy, z + wz); g.add(m);
          m.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(m), mesh: m });
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry;
          for (let rx = -(3 + ext); rx <= (3 + ext); rx++) for (let rz = -(2 + ext); rz <= (2 + ext); rz++) {
            const isEdge = Math.abs(rx) === 3 + ext || Math.abs(rz) === 2 + ext;
            if (!isEdge && ry > 0) continue;
            const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), new THREE.MeshLambertMaterial({ color: ry === 0 ? 0x3a2f1e : roof }));
            m.position.set(x + rx, 5.4 + ry * 0.5, z + rz); g.add(m);
          }
        }
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x886600 }));
        trim.position.set(x, 5.2, z - 2.5); g.add(trim);
        return g;
      }
      buildShrine(0, -22);

      // ─── SACRED REFLECTION POND (far west, off path) ─────────────────────────
      const SACRED_X = -14, SACRED_Z = -18;
      const sacredPondGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.12, 20);
      const sacredPondMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.86 });
      const sacredPond = new THREE.Mesh(sacredPondGeo, sacredPondMat);
      sacredPond.position.set(SACRED_X, 0.06, SACRED_Z);
      worldDecor.add(sacredPond);

      // Lily pads on sacred pond
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 1.5 + Math.random() * 2.2;
        createLilyPad(SACRED_X + Math.cos(a) * r, SACRED_Z + Math.sin(a) * r, i * 77);
      }

      // Stone rim around sacred pond
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.65), new THREE.MeshLambertMaterial({ color: 0x888880 }));
        rim.position.set(SACRED_X + Math.cos(a) * 4.8, 0.1, SACRED_Z + Math.sin(a) * 4.8);
        rim.rotation.y = a;
        worldDecor.add(rim);
      }

      // Wooden bridge across the sacred pond (north-south)
      const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
      for (let bi = 0; bi < 10; bi++) {
        const bz = SACRED_Z - 4.5 + bi * 1.0;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.85), bridgeMat);
        plank.position.set(SACRED_X, 0.2, bz);
        worldDecor.add(plank);
      }
      // Bridge railings
      [{ x: SACRED_X - 1.2, z: SACRED_Z - 4.5 }, { x: SACRED_X + 1.2, z: SACRED_Z - 4.5 },
      { x: SACRED_X - 1.2, z: SACRED_Z + 4.0 }, { x: SACRED_X + 1.2, z: SACRED_Z + 4.0 }].forEach(({ x, z }) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), bridgeMat);
        post.position.set(x, 0.5, z);
        worldDecor.add(post);
      });
      for (const side of [-1.2, 1.2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 8.6), bridgeMat);
        rail.position.set(SACRED_X + side, 0.82, SACRED_Z - 0.25); worldDecor.add(rail);
      }

      // Reed grasses around sacred pond
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 4.7 + Math.random() * 0.6;
        const rx2 = SACRED_X + Math.cos(angle) * radius;
        const rz2 = SACRED_Z + Math.sin(angle) * radius;
        const reed2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2 + Math.random() * 0.8), new THREE.MeshLambertMaterial({ color: 0x7BAF5A }));
        reed2.position.set(rx2, 0.75, rz2);
        worldDecor.add(reed2);
        swayables.push({ mesh: reed2, speed: 1.3, offset: Math.random() * Math.PI * 2 });
      }
      // Cherry trees flanking the pond
      buildCherryTree(SACRED_X - 6, SACRED_Z - 2, 5);
      buildCherryTree(SACRED_X + 4, SACRED_Z + 2, 4);

      // ─── CHERRY BLOSSOM AVENUE along shrine path, generously spaced ──────────
      buildCherryTree(-8, -10, 5);
      buildCherryTree(8, -10, 4);
      buildCherryTree(-9, -18, 6);
      buildCherryTree(9, -18, 5);
      buildCherryTree(-7, -26, 4);
      buildCherryTree(8, -26, 5);
      buildCherryTree(-16, -12, 5);
      buildCherryTree(15, -9, 4);

      // ─── EXTRA FALLING PETALS across the whole shrine corridor ───────────────
      const petalGeoExtra = new THREE.PlaneGeometry(0.2, 0.2);
      const petalMatExtra = new THREE.MeshStandardMaterial({ color: 0xFFB7C5, side: THREE.DoubleSide });
      for (let i = 0; i < 70; i++) {
        const pMesh2 = new THREE.Mesh(petalGeoExtra, petalMatExtra);
        pMesh2.position.set(
          (Math.random() - 0.5) * 32,
          3 + Math.random() * 8,
          -5 + (Math.random() - 0.5) * 28
        );
        pMesh2.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        worldDecor.add(pMesh2);
        fallingPetals.push({ mesh: pMesh2, offset: Math.random() * Math.PI * 2 });
      }

      // ─── STONE LANTERNS: one pair between each torii, generously spaced ──────
      buildStoneLantern(-3.5, -12.5);
      buildStoneLantern(3.5, -12.5);

      // ─── STEPPING STONES winding toward sacred pond ───────────────────────────
      const stepColors = [0x7a807a, 0x8a8a80, 0x6a7068];
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const sx = -1.5 - t * 10;
        const sz = -13 - t * 4;
        const ss = new THREE.Mesh(new THREE.CylinderGeometry(0.28 + Math.random() * 0.12, 0.28 + Math.random() * 0.12, 0.09 + Math.random() * 0.05, 7),
          new THREE.MeshLambertMaterial({ color: stepColors[i % 3] }));
        ss.position.set(sx + (Math.random() - 0.5) * 0.8, 0.05, sz + (Math.random() - 0.5) * 0.5);
        ss.rotation.y = Math.random() * Math.PI;
        worldDecor.add(ss);
      }

      // ─── STONE MONUMENT PILLARS flanking shrine entrance, wide ───────────────
      [{ x: -8, z: -20 }, { x: 8, z: -20 }].forEach(({ x, z }) => {
        const mBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), new THREE.MeshLambertMaterial({ color: 0x888878 }));
        mBase.position.set(x, 0.15, z); worldDecor.add(mBase);
        const mPillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), new THREE.MeshLambertMaterial({ color: 0x9a9a8a }));
        mPillar.position.set(x, 1.25, z); worldDecor.add(mPillar);
        mPillar.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(mPillar), mesh: mPillar });
        const mCap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), new THREE.MeshLambertMaterial({ color: 0x6a6a5a }));
        mCap.position.set(x, 2.4, z); worldDecor.add(mCap);
      });

      // ─── MOSS-COVERED WELL: far east near the shrine ──────────────────────────
      const WELL_X = 8, WELL_Z = -18;
      const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.6, 10), new THREE.MeshLambertMaterial({ color: 0x888870 }));
      wellBase.position.set(WELL_X, 0.3, WELL_Z); worldDecor.add(wellBase);
      wellBase.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(wellBase), mesh: wellBase });
      const wellRim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.1, 8, 16), new THREE.MeshLambertMaterial({ color: 0x6a6a58 }));
      wellRim.position.set(WELL_X, 0.65, WELL_Z); wellRim.rotation.x = Math.PI / 2; worldDecor.add(wellRim);
      const wellP1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
      wellP1.position.set(WELL_X - 0.7, 1.2, WELL_Z); worldDecor.add(wellP1);
      const wellP2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
      wellP2.position.set(WELL_X + 0.7, 1.2, WELL_Z); worldDecor.add(wellP2);
      const wellCross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
      wellCross.position.set(WELL_X, 1.85, WELL_Z); worldDecor.add(wellCross);
      const wellLight = new THREE.PointLight(0xffcc66, 0.9, 6);
      wellLight.position.set(WELL_X, 1.5, WELL_Z); scene.add(wellLight);

      // ─── PRAYER ROPE (shimenawa) at torii entrance ────────────────────────────
      [{ x: -2.5, z: -6.5 }, { x: 2.5, z: -6.5 }].forEach(({ x, z }) => {
        const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8), new THREE.MeshLambertMaterial({ color: 0x9a8a7a }));
        pp.position.set(x, 1.25, z); worldDecor.add(pp);
      });
      const shimeRope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.2, 6), new THREE.MeshLambertMaterial({ color: 0xd4b86a }));
      shimeRope.position.set(0, 2.1, -6.5); shimeRope.rotation.z = Math.PI / 2; worldDecor.add(shimeRope);
      for (let i = -2; i <= 2; i++) {
        const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.5), new THREE.MeshLambertMaterial({ color: 0xfaf5e4, side: THREE.DoubleSide }));
        shide.position.set(i * 1.0, 1.72, -6.5);
        worldDecor.add(shide);
        swayables.push({ mesh: shide, speed: 0.8, offset: i * 0.6 });
      }

      // ─── MEDITATION PLATFORM (far south of shrine, open area) ────────────────
      const MED_X = 12, MED_Z = -22;
      for (let mx = -2; mx <= 2; mx++) for (let mz = -2; mz <= 2; mz++) {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1), new THREE.MeshLambertMaterial({ color: (mx + mz) % 2 === 0 ? 0xd8c8a8 : 0xc8b898 }));
        tile.position.set(MED_X + mx, 0.04, MED_Z + mz); worldDecor.add(tile);
      }
      // Cushion in center
      const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.15, 10), new THREE.MeshLambertMaterial({ color: 0x8B3A62 }));
      cushion.position.set(MED_X, 0.15, MED_Z); worldDecor.add(cushion);
      // Incense holder
      const incenseBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), new THREE.MeshLambertMaterial({ color: 0x7a6a4a }));
      incenseBase.position.set(MED_X + 0.8, 0.1, MED_Z); worldDecor.add(incenseBase);
      const incenseStick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0x8B5A2B }));
      incenseStick.position.set(MED_X + 0.8, 0.43, MED_Z); worldDecor.add(incenseStick);
      const incenseLight = new THREE.PointLight(0xff8822, 0.4, 3);
      incenseLight.position.set(MED_X + 0.8, 0.9, MED_Z); scene.add(incenseLight);
      // Stone lanterns flanking the platform
      buildStoneLantern(MED_X - 3, MED_Z - 2);
      buildStoneLantern(MED_X - 3, MED_Z + 2);
      buildCherryTree(MED_X + 3, MED_Z - 3, 5);

      // ─── FORTUNE BOARD (west side near path) ─────────────────────────────────
      const FB_X = -5, FB_Z = -10;
      const fbPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.15), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
      fbPost.position.set(FB_X, 1.25, FB_Z); worldDecor.add(fbPost);
      fbPost.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(fbPost), mesh: fbPost });
      const fbBoard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.1), new THREE.MeshLambertMaterial({ color: 0x8B6914 }));
      fbBoard.position.set(FB_X, 2.2, FB_Z - 0.1); worldDecor.add(fbBoard);
      const fbFace = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), new THREE.MeshLambertMaterial({ color: 0xf5e8c0, emissive: new THREE.Color(0xffaa22), emissiveIntensity: 0.08 }));
      fbFace.position.set(FB_X, 2.2, FB_Z - 0.16); worldDecor.add(fbFace);

      function seededRandom(seed: number) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      }

      // ─── DECORATIVE FACTORY FUNCTIONS ───
      function createMushroom(x: number, z: number, seed: number) {
        const h = 0.4 + seededRandom(seed) * 0.3;
        vox(x, h / 2, z, 0xdcdcdc, 0.2, h, 0.2, false, false, false);
        const top = vox(x, h + 0.1, z, 0xcc3333, 0.6, 0.2, 0.6, true, false, false);
        swayables.push({ mesh: top, speed: 1.2, offset: seed });
      }

      function createLilyPad(x: number, z: number, seed: number) {
        const s = 0.5 + seededRandom(seed) * 0.5;
        const pad = vox(x, 0.12, z, 0x3d7a4d, s, 0.05, s, false, true, false);
        swayables.push({ mesh: pad, speed: 0.5, offset: seed });
      }

      function createForestZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 90; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedTree(rx, gy, rz, 0.8 + Math.random() * 0.5);
        }
        for (let i = 0; i < 150; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedBush(rx, gy, rz, 0.5 + Math.random() * 1.0);
        }
        for (let i = 0; i < 80; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedRock(rx, gy, rz, 0.3 + Math.random() * 0.5);
        }
        for (let i = 0; i < 20; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          createMushroom(rx, rz, i);
        }
      }

      function createHayBale(x: number, z: number, stacked = false) {
        const base = getGroundHeight(x, z);
        const mat = new THREE.MeshStandardMaterial({ color: 0xD4A853 })
        const bale = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), mat)
        bale.position.set(x, base + 0.4, z)
        if (stacked) {
          const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), mat)
          top.position.set(x, base + 1.2, z)
          worldDecor.add(top)
          top.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(top), mesh: top })
        }
        worldDecor.add(bale)
        bale.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(bale), mesh: bale })
      }

      function createFenceSection(x: number, z: number, angle = 0) {
        const g = new THREE.Group()
        const base = getGroundHeight(x, z);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C })
        const railMat = new THREE.MeshStandardMaterial({ color: 0xA0724A })
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat)
        p1.position.set(-1, 0.5, 0)
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat)
        p2.position.set(1, 0.5, 0)
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), railMat)
        r1.position.set(0, 0.7, 0)
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), railMat)
        r2.position.set(0, 0.35, 0)
        g.add(p1, p2, r1, r2)
        g.position.set(x, base, z)
        g.rotation.y = angle
        worldDecor.add(g)
        g.updateMatrixWorld(true);
        colliders.push({ box: new THREE.Box3().setFromObject(p1), mesh: p1 });
        colliders.push({ box: new THREE.Box3().setFromObject(p2), mesh: p2 });
      }

      function createSunflower(x: number, z: number) {
        const g = new THREE.Group()
        const base = getGroundHeight(x, z);
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x7BAF5A }))
        stem.position.y = 0.7
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xFFD580 }))
        head.position.y = 1.5
        const petalGeo = new THREE.BoxGeometry(0.15, 0.08, 0.4)
        const petalMat = new THREE.MeshStandardMaterial({ color: 0xEF9F27 })
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(petalGeo, petalMat)
          p.rotation.y = (i / 4) * Math.PI * 2
          p.position.set(Math.sin(p.rotation.y) * 0.3, 1.5, Math.cos(p.rotation.y) * 0.3)
          g.add(p)
        }
        g.add(stem, head)
        g.position.set(x, base, z)
        worldDecor.add(g)
      }

      function createDesertZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 6; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80; const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          const dirt = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 1.8), new THREE.MeshLambertMaterial({ color: 0xC4A882 }));
          dirt.position.set(rx, gy + 0.01, rz);
          worldDecor.add(dirt);
        }

        const fenceAngle = Math.random() * Math.PI;
        for (let i = 0; i < 5; i++) {
          const rx = offsetX + 20 + (i - 2) * 2 * Math.cos(fenceAngle);
          const rz = offsetZ + 20 + (i - 2) * 2 * Math.sin(fenceAngle);
          createFenceSection(rx, rz, -fenceAngle);
        }

        for (let i = 0; i < 6; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 60; const rz = offsetZ + (Math.random() - 0.5) * 60;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          createHayBale(rx, rz, i < 2);
        }

        for (let i = 0; i < 7; i++) {
          const rx = offsetX + 20 + (Math.random() - 0.5) * 20; const rz = offsetZ + 20 + (Math.random() - 0.5) * 20;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          createSunflower(rx, rz);
        }
        for (let i = 0; i < 60; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedRock(rx, gy, rz, 0.2 + Math.random() * 0.4);
          if (Math.random() > 0.7) addInstancedCactus(rx + 2, gy, rz + 1, 0.8 + Math.random() * 1.5);
        }
      }

      function createPineTree(x: number, z: number) {
        const group = new THREE.Group()
        const base = getGroundHeight(x, z);
        const brown = 0x8B5E3C
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: brown }))
        trunk.position.y = 0.4
        const t1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x3B6D11 }))
        t1.position.y = 1.1
        const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x4A8A1A }))
        t2.position.y = 1.6
        const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x5AA020 }))
        t3.position.y = 2.05
        group.add(trunk, t1, t2, t3)
        group.position.set(x, base, z)
        group.updateMatrixWorld(true);
        colliders.push({ box: new THREE.Box3().setFromObject(trunk), mesh: trunk })
        return group
      }

      function createMountainZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 15; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 130;
          const rz = offsetZ + (Math.random() - 0.5) * 130;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;

          const base = getGroundHeight(rx, rz);
          const h = (8 + Math.random() * 12) * 0.45, w = (6 + Math.random() * 6) * 0.45;
          for (let my = 0; my < h; my += 1.5 * 0.45) {
            const r = (h - my) * (w / h);
            const m = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 1.5 * 0.45, r * 2), new THREE.MeshLambertMaterial({ color: 0xF0EEF8, emissive: 0xE8E4F0, emissiveIntensity: 0.04 }));
            m.position.set(rx, base + my + 0.75 * 0.45, rz);
            if (my < 3 * 0.45) { m.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(m), mesh: m }); }
            worldDecor.add(m);
          }
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
          cap.position.set(rx, base + h, rz);
          worldDecor.add(cap);
        }

        for (let i = 0; i < 12; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120;
          const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;

          const tree = createPineTree(rx, rz);
          worldDecor.add(tree);
        }

        for (let i = 0; i < 100; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedRock(rx, gy, rz, 1.0 + Math.random() * 1.5);
        }
      }

      function createPlainsZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 400; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedGrass(rx, gy, rz, 0.8 + Math.random() * 1.2);
        }
        for (let i = 0; i < 30; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedBush(rx, gy, rz, 0.3 + Math.random() * 0.4);
        }
        for (let i = 0; i < 5; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedTree(rx, gy, rz, 0.8 + Math.random() * 0.5);
        }
      }

      createForestZone(-150, 0);
      createDesertZone(150, 0);
      createMountainZone(0, -150);
      createPlainsZone(0, 150);

      // ─── CAMPFIRES (Plains zone south) ───────────────────────────────────────
      function buildCampfire(x: number, z: number) {
        const base = getGroundHeight(x, z);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const stone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x7a7a6a }));
          stone.position.set(x + Math.cos(a) * 0.55, base + 0.1, z + Math.sin(a) * 0.55);
          worldDecor.add(stone);
        }
        for (let i = 0; i < 3; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
          log.rotation.z = Math.PI / 2; log.rotation.y = (i / 3) * Math.PI;
          log.position.set(x, base + 0.1, z); worldDecor.add(log);
        }
        const fireMat = new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: new THREE.Color(0xff3300), emissiveIntensity: 1.5 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), fireMat);
        flame.position.set(x, base + 0.45, z); worldDecor.add(flame);
        swayables.push({ mesh: flame, speed: 3.5, offset: Math.random() * Math.PI * 2 });
        const fireLight = new THREE.PointLight(0xff6600, 2.5, 10);
        fireLight.position.set(x, base + 0.8, z); scene.add(fireLight);
      }
      buildCampfire(18, 45); buildCampfire(-22, 55); buildCampfire(35, 70);

      // ─── ANCIENT RUINS with treasure chests (Forest zone west) ───────────────
      function buildAncientRuin(x: number, z: number) {
        const base = getGroundHeight(x, z);
        const stoneMat = new THREE.MeshLambertMaterial({ color: 0xa0978a });
        for (let i = 0; i < 4; i++) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7 + Math.random() * 1.2, 0.9), stoneMat);
          block.position.set(x + (i % 2) * 2.5, base + 0.5 + Math.random() * 0.4, z + Math.floor(i / 2) * 2.8);
          block.rotation.y = Math.random() * 0.4;
          worldDecor.add(block);
          block.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(block), mesh: block });
        }
        const arch = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a8070 }));
        arch.position.set(x + 1.25, base + 2.8, z); worldDecor.add(arch);
        const chestBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), new THREE.MeshLambertMaterial({ color: 0x8B5A2B }));
        chestBody.position.set(x + 1, base + 0.2, z + 1.5); worldDecor.add(chestBody);
        chestBody.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(chestBody), mesh: chestBody });
        const chestLid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.45), new THREE.MeshLambertMaterial({ color: 0x7a4a1a }));
        chestLid.position.set(x + 1, base + 0.49, z + 1.5); worldDecor.add(chestLid);
        const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.47), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: new THREE.Color(0xffaa00), emissiveIntensity: 0.4 }));
        goldTrim.position.set(x + 1, base + 0.38, z + 1.5); worldDecor.add(goldTrim);
        const glowLight = new THREE.PointLight(0xffdd44, 0.8, 5);
        glowLight.position.set(x + 1, base + 1.2, z + 1.5); scene.add(glowLight);
      }
      buildAncientRuin(-55, -20); buildAncientRuin(-70, 18); buildAncientRuin(-42, 35);

      // ─── GIANT MUSHROOMS (Forest zone) ───────────────────────────────────────
      function buildGiantMushroom(x: number, z: number, scale = 1.0) {
        const base = getGroundHeight(x, z);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, 1.8 * scale, 8), new THREE.MeshLambertMaterial({ color: 0xddd0c0 }));
        stem.position.set(x, base + 0.9 * scale, z); worldDecor.add(stem);
        stem.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(stem), mesh: stem });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85 * scale, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xcc3344, emissive: new THREE.Color(0x881122), emissiveIntensity: 0.15 }));
        cap.position.set(x, base + 1.8 * scale, z); worldDecor.add(cap);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const spot = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 6, 6), new THREE.MeshLambertMaterial({ color: 0xfaf5f0 }));
          spot.position.set(x + Math.cos(a) * 0.45 * scale, base + 2.0 * scale + 0.1, z + Math.sin(a) * 0.45 * scale);
          worldDecor.add(spot);
        }
        const glow = new THREE.PointLight(0xff2244, 0.3 * scale, 4 * scale);
        glow.position.set(x, base + 2.2 * scale, z); scene.add(glow);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        buildGiantMushroom(-80 + Math.cos(a) * 8, 10 + Math.sin(a) * 8, 0.7 + (i % 3) * 0.25);
      }
      buildGiantMushroom(-65, -5, 1.4); buildGiantMushroom(-90, 22, 1.1);

      // ─── CRYSTAL CLUSTERS (Mountain zone north) ───────────────────────────────
      function buildCrystalCluster(x: number, z: number, count = 5) {
        const base = getGroundHeight(x, z);
        const colors = [0x88ccff, 0xaaffee, 0xccaaff, 0xffaacc];
        for (let i = 0; i < count; i++) {
          const h = 0.8 + Math.random() * 1.8;
          const crystalMat = new THREE.MeshStandardMaterial({ color: colors[i % 4], emissive: new THREE.Color(colors[i % 4]), emissiveIntensity: 0.3, transparent: true, opacity: 0.85 });
          const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.15 + Math.random() * 0.12, h, 5), crystalMat);
          const ox = (Math.random() - 0.5) * 2.5, oz = (Math.random() - 0.5) * 2.5;
          crystal.position.set(x + ox, base + h / 2, z + oz);
          crystal.rotation.z = (Math.random() - 0.5) * 0.5;
          worldDecor.add(crystal);
          crystal.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(crystal), mesh: crystal });
        }
        const glow = new THREE.PointLight(0x88ccff, 1.2, 8);
        glow.position.set(x, base + 2, z); scene.add(glow);
      }
      buildCrystalCluster(8, -65, 7); buildCrystalCluster(-15, -72, 5);
      buildCrystalCluster(20, -80, 6); buildCrystalCluster(-5, -55, 4);

      // ─── STANDING STONE CIRCLES (Plains zone south) ───────────────────────────
      function buildStoneCircle(cx: number, cz: number, r: number, count: number) {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          const base = getGroundHeight(x, z);
          const h = 1.5 + Math.random() * 1.2, w = 0.4 + Math.random() * 0.25;
          const stone = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), new THREE.MeshLambertMaterial({ color: 0x8a8070 }));
          stone.position.set(x, base + h / 2, z);
          stone.rotation.y = Math.random() * 0.4;
          worldDecor.add(stone);
          stone.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(stone), mesh: stone });
        }
      }
      buildStoneCircle(40, 70, 8, 8); buildStoneCircle(-30, 80, 6, 7); buildStoneCircle(60, 45, 5, 6);

      // ─── TOTEM POLES (Desert zone east) ───────────────────────────────────────
      function buildTotemPole(x: number, z: number) {
        const base = getGroundHeight(x, z);
        const segColors = [0x8B4513, 0x6b3a1e, 0xa05020, 0x7a4015];
        const faceColors = [0xff8822, 0x22aaff, 0xee3344, 0x22cc44];
        let y = base;
        for (let seg = 0; seg < 4; seg++) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), new THREE.MeshLambertMaterial({ color: segColors[seg] }));
          body.position.set(x, y + 0.4, z); worldDecor.add(body);
          body.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(body), mesh: body });
          const face = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.36, 0.1), new THREE.MeshLambertMaterial({ color: faceColors[seg], emissive: new THREE.Color(faceColors[seg]), emissiveIntensity: 0.3 }));
          face.position.set(x, y + 0.4, z - 0.35); worldDecor.add(face);
          if (seg % 2 === 0) {
            for (const sx of [-0.6, 0.6]) {
              const wing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.35), new THREE.MeshLambertMaterial({ color: segColors[(seg + 2) % 4] }));
              wing.position.set(x + sx, y + 0.5, z); worldDecor.add(wing);
            }
          }
          y += 0.85;
        }
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0xff4422, emissive: new THREE.Color(0xff2200), emissiveIntensity: 0.25 }));
        top.position.set(x, y + 0.3, z); worldDecor.add(top);
      }
      buildTotemPole(75, -15); buildTotemPole(82, 5); buildTotemPole(68, 28);

      // ─── WATERFALLS (Mountain zone north) ────────────────────────────────────
      function buildWaterfall(x: number, z: number) {
        const base = getGroundHeight(x, z);
        const cliffMat = new THREE.MeshLambertMaterial({ color: 0x6a6a6a });
        const waterMat = new THREE.MeshLambertMaterial({ color: 0x4488cc, transparent: true, opacity: 0.78 });
        for (let cy = 0; cy < 5; cy++) {
          for (let cx2 = -2; cx2 <= 2; cx2++) {
            if (cx2 === 0 && cy < 3) continue;
            const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.6), cliffMat);
            block.position.set(x + cx2, base + cy + 0.5, z); worldDecor.add(block);
            if (cy < 2) { block.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(block), mesh: block }); }
          }
        }
        for (let wy = 0; wy < 3; wy++) {
          const water = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1, 0.15), waterMat);
          water.position.set(x, base + wy + 0.5, z - 0.2); worldDecor.add(water);
          swayables.push({ mesh: water, speed: 2.0, offset: wy * 0.4 });
        }
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x3399cc, transparent: true, opacity: 0.85 }));
        pool.position.set(x, base + 0.05, z - 2.5); worldDecor.add(pool);
        const mist = new THREE.PointLight(0x88ccff, 1.0, 8);
        mist.position.set(x, base + 1.5, z - 1.5); scene.add(mist);
        for (let i = 0; i < 4; i++) createLilyPad(x + (Math.random() - 0.5) * 3.5, z - 2 + (Math.random() - 0.5) * 3, i + 99);
      }
      buildWaterfall(-10, -60); buildWaterfall(18, -70);

      // ─── NOTICE BOARDS across the world ───────────────────────────────────────
      function buildNoticeBoard(x: number, z: number) {
        const base = getGroundHeight(x, z);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
        post.position.set(x, base + 1.1, z); worldDecor.add(post);
        post.updateMatrixWorld(true); colliders.push({ box: new THREE.Box3().setFromObject(post), mesh: post });
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.08), new THREE.MeshLambertMaterial({ color: 0x8B6914 }));
        board.position.set(x, base + 2.0, z - 0.05); worldDecor.add(board);
        const face = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.95, 0.06), new THREE.MeshLambertMaterial({ color: 0xf5e8c0, emissive: new THREE.Color(0xffaa22), emissiveIntensity: 0.06 }));
        face.position.set(x, base + 2.0, z - 0.10); worldDecor.add(face);
        return { x, z };
      }
      buildNoticeBoard(25, 30);
      buildNoticeBoard(-40, -10);
      buildNoticeBoard(55, -20);
      buildNoticeBoard(5, -40);


      function createBoundaries() {
        for (let i = 0; i < 200; i++) {
          const angle = (i / 200) * Math.PI * 2;
          const dist = 260 + Math.random() * 30;
          const x = Math.cos(angle) * dist;
          const z = Math.sin(angle) * dist;
          const y = getGroundHeight(x, z);
          if (Math.random() > 0.5) {
            addInstancedTree(x, y, z, 1.5 + Math.random());
          } else {
            addInstancedRock(x, y, z, 2 + Math.random() * 3);
          }
        }
      }
      createBoundaries();

      // ─── WORLD-WIDE TREE FILL ─────────────────────────────────────────────────
      // Sparse grid scatter across the full world, avoiding center path & key spots
      const TREE_EXCLUSIONS: [number, number, number][] = [
        // [cx, cz, radius] — keep these areas clear
        [0, 0, 18],        // Central hub
        [0, -22, 10],      // Shrine area
        [0, -7, 5],        // First Torii
        [0, -18, 5],       // Second Torii
        [-14, -18, 7],     // Sacred pond
        [POND_X, POND_Z, 6], // Original pond
        [18, 45, 6], [-22, 55, 6], [35, 70, 6], // Campfires
        [40, 70, 12], [-30, 80, 10], [60, 45, 8], // Stone circles
        [75, -15, 6], [82, 5, 6], [68, 28, 6],   // Totems
        [-10, -60, 8], [18, -70, 8],              // Waterfalls
        [12, -22, 6],                             // Meditation platform
      ];

      function isClearZone(x: number, z: number): boolean {
        // Keep main cardinal paths clear (±4 units wide)
        if (Math.abs(x) < 4 && z > -35 && z < 35) return true;  // N-S path
        if (Math.abs(z) < 4 && x > -35 && x < 35) return true;  // E-W path
        return TREE_EXCLUSIONS.some(([cx, cz, r]) => {
          const dx = x - cx, dz = z - cz;
          return dx * dx + dz * dz < r * r;
        });
      }

      // Fill mid-range (35–130 units) with sparse trees — one attempt per grid cell
      const GRID_STEP = 12; // spacing between tree attempts
      for (let gx = -130; gx <= 130; gx += GRID_STEP) {
        for (let gz = -130; gz <= 130; gz += GRID_STEP) {
          // Add jitter so it doesn't look like a grid
          const jx = gx + (Math.random() - 0.5) * GRID_STEP * 0.9;
          const jz = gz + (Math.random() - 0.5) * GRID_STEP * 0.9;
          const dist = Math.sqrt(jx * jx + jz * jz);
          // Skip center, skip exclusion zones, 70% chance of placing
          if (dist < 35 || dist > 125) continue;
          if (isClearZone(jx, jz)) continue;
          if (Math.random() > 0.7) continue;
          const gy = getGroundHeight(jx, jz);
          const scale = 0.7 + Math.random() * 0.6;
          addInstancedTree(jx, gy, jz, scale);
          // Occasionally pair with a bush for variety
          if (Math.random() > 0.6) {
            addInstancedBush(jx + (Math.random() - 0.5) * 3, gy, jz + (Math.random() - 0.5) * 3, 0.3 + Math.random() * 0.4);
          }
        }
      }

      // Outer ring fill (130–220) — denser forest boundary
      for (let gx = -220; gx <= 220; gx += 10) {
        for (let gz = -220; gz <= 220; gz += 10) {
          const jx = gx + (Math.random() - 0.5) * 8;
          const jz = gz + (Math.random() - 0.5) * 8;
          const dist = Math.sqrt(jx * jx + jz * jz);
          if (dist < 128 || dist > 220) continue;
          if (Math.random() > 0.55) continue;
          const gy = getGroundHeight(jx, jz);
          addInstancedTree(jx, gy, jz, 0.8 + Math.random() * 0.7);
        }
      }

      // Commit needsUpdate so all new instances render
      instancedTreeTrunks.instanceMatrix.needsUpdate = true;
      instancedTreeCanopies.instanceMatrix.needsUpdate = true;
      instancedBushes.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < 8; i++) {
        createLilyPad(POND_X + (Math.random() - 0.5) * 5, POND_Z + (Math.random() - 0.5) * 4, i);
      }

      const ambientParticles: { mesh: ThreeNS.Object3D; offset: number }[] = [];
      const snowParticles: { mesh: ThreeNS.Object3D }[] = [];
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xA8D8EA, transparent: true, opacity: 0.6 }));
        const ox = (Math.random() - 0.5) * 30;
        const oy = 0.4 + Math.random() * 2.1;
        const oz = (Math.random() - 0.5) * 30;
        m.position.set(ox, oy, oz);
        worldDecor.add(m);
        ambientParticles.push({ mesh: m, offset: i });
      }

      for (let i = 0; i < 35; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
        const ox = (-100 + (Math.random() - 0.5) * 80) * 1.7;
        const oy = Math.random() * 20;
        const oz = ((Math.random() - 0.5) * 80) * 1.7;
        m.position.set(ox, oy, oz);
        worldDecor.add(m);
        snowParticles.push({ mesh: m });
      }

      // Identify local species
      let localSpecies = selectedPet.type;
      try {
        const res = await fetch("/api/species");
        if (res.ok) { const data = await res.json(); if (data.species) localSpecies = data.species; }
      } catch { }

      // Local Player & Pet Billboards
      const playerBB = createPetBillboard(petState.gitData.username, localSpecies, petState);
      scene.add(playerBB.group); playerRef.current = playerBB.group;

      const saveGhostPosition = () => {
        if (!playerRef.current) return;
        const { x, z } = playerRef.current.position;
        fetch("/api/ghosts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, z, mood: petState.mood }),
          keepalive: true,
        }).catch(() => { });
      };

      try {
        const ghostsRes = await fetch("/api/ghosts");
        if (ghostsRes.ok) {
          const { ghosts } = await ghostsRes.json() as { ghosts: { username: string; species: string; x: number; z: number; mood: string }[] };
          for (const ghost of ghosts) {
            if (ghost.username === petState.gitData.username) continue;
            spawnGhost(ghost.username, ghost.species, { x: ghost.x, z: ghost.z }, ghost.mood);
          }
        }
      } catch { /* ignore */ }

      const p = playerStateRef.current; const pet = petStateRef.current;
      // Removed following pet logic completely

      // Interaction
      const wFortunes = ['Your pet grows stronger with each commit.', "Great pull requests await in tomorrow's dawn.", 'The one who merges wisely, flourishes greatly.', 'Your repository holds secrets yet undiscovered.', 'Push often. Pull wisely. Review with kindness.', 'A watched branch never deploys.', 'Many forks, one true path.'];
      const interactables = [
        { pos: new THREE.Vector3(-7, 0, 3), radius: 3, label: '[ E ] Copy Pet Card', onInteract: () => { navigator.clipboard.writeText(`![Pet](https://git-pet.vercel.app/api/card/${petState.gitData.username})`); setNarrativeText('📋 Pet card URL copied!'); setTimeout(() => setNarrativeText(null), 2500); } },
        { pos: new THREE.Vector3(0, 0, -22), radius: 5, label: '[ E ] ⛩ Pray at Shrine', onInteract: () => { setNarrativeText('🙏 You kneel and offer a silent prayer...'); setTimeout(() => setNarrativeText(null), 3500); shakeRef.current = 0.05; } },
        { pos: new THREE.Vector3(8, 0, -18), radius: 3.5, label: '[ E ] 🪣 Look into Well', onInteract: () => { setNarrativeText('🪣 You peer into the mossy well... the water reflects your pet\'s face.'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(-14, 0, -18), radius: 5, label: '[ E ] 🌸 Sit by the Pond', onInteract: () => { setNarrativeText('🌸 Cherry blossoms drift across the still water...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(12, 0, -22), radius: 4, label: '[ E ] 🧘 Meditate', onInteract: () => { setNarrativeText('🧘 You settle onto the cushion. The world grows quiet...'); setTimeout(() => setNarrativeText(null), 4000); } },
        { pos: new THREE.Vector3(-5, 0, -10), radius: 3, label: '[ E ] 📜 Read Fortune Board', onInteract: () => { const fortunes = ['Your pet grows stronger with each commit. 🌟', 'Great pull requests await in tomorrow\'s dawn. 🌅', 'The one who merges wisely, flourishes greatly. 🌸', 'Your repository holds secrets yet undiscovered. 🔮', 'Push often. Pull wisely. Review with kindness. 💫']; setNarrativeText(`📜 ${fortunes[Math.floor(Math.random() * fortunes.length)]}`); setTimeout(() => setNarrativeText(null), 4500); } },
        { pos: new THREE.Vector3(0, 0, -22), radius: 5, label: '[ E ] Settings', onInteract: () => window.location.href = "/settings" },
        { pos: new THREE.Vector3(18, 0, 45), radius: 4, label: '[ E ] Warm Up', onInteract: () => { setNarrativeText('You sit by the crackling fire. The warmth soothes your pet...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(-22, 0, 55), radius: 4, label: '[ E ] Warm Up', onInteract: () => { setNarrativeText('Sparks float upward into the night sky as your pet watches...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(35, 0, 70), radius: 4, label: '[ E ] Warm Up', onInteract: () => { setNarrativeText('The campfire crackles. Someone was here recently...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(-55, 0, -20), radius: 5, label: '[ E ] Open Chest', onInteract: () => { const loot = ['a rusty key', 'an old scroll', '3 gold coins', 'a glowing gem', 'a strange feather']; setNarrativeText('You open the ancient chest and find ' + loot[Math.floor(Math.random() * loot.length)] + '!'); setTimeout(() => setNarrativeText(null), 4000); shakeRef.current = 0.06; } },
        { pos: new THREE.Vector3(-70, 0, 18), radius: 5, label: '[ E ] Open Chest', onInteract: () => { const loot = ['a crumbled map', 'ancient bones', 'a shiny coin', 'a jade amulet', 'dust and cobwebs']; setNarrativeText('You open the ruins chest and find ' + loot[Math.floor(Math.random() * loot.length)] + '!'); setTimeout(() => setNarrativeText(null), 4000); shakeRef.current = 0.06; } },
        { pos: new THREE.Vector3(-42, 0, 35), radius: 5, label: '[ E ] Open Chest', onInteract: () => { const loot = ['a forgotten letter', 'forest herbs', 'a smooth stone', 'glowing mushroom spores', 'an old compass']; setNarrativeText('You open the chest and find ' + loot[Math.floor(Math.random() * loot.length)] + '!'); setTimeout(() => setNarrativeText(null), 4000); shakeRef.current = 0.06; } },
        { pos: new THREE.Vector3(8, 0, -65), radius: 6, label: '[ E ] Touch Crystals', onInteract: () => { setNarrativeText('The crystals hum with a faint resonance. Your pet glows briefly...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(-15, 0, -72), radius: 5, label: '[ E ] Touch Crystals', onInteract: () => { setNarrativeText('Ice-blue light pulses through the crystal formation...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(40, 0, 70), radius: 10, label: '[ E ] Ancient Circle', onInteract: () => { setNarrativeText('Standing inside the stone circle, you feel a strange stillness...'); setTimeout(() => setNarrativeText(null), 4000); } },
        { pos: new THREE.Vector3(-30, 0, 80), radius: 8, label: '[ E ] Ancient Circle', onInteract: () => { setNarrativeText('These stones have stood for centuries. Your pet sniffs one curiously.'); setTimeout(() => setNarrativeText(null), 4000); } },
        { pos: new THREE.Vector3(75, 0, -15), radius: 4, label: '[ E ] Inspect Totem', onInteract: () => { setNarrativeText('The totem pole depicts beasts of legend. Your pet poses next to it.'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(82, 0, 5), radius: 4, label: '[ E ] Inspect Totem', onInteract: () => { setNarrativeText('Vivid painted faces stare down from the carved wood...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(68, 0, 28), radius: 4, label: '[ E ] Inspect Totem', onInteract: () => { setNarrativeText('The desert winds carry whispers around this ancient totem...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(-10, 0, -60), radius: 6, label: '[ E ] Listen to Falls', onInteract: () => { setNarrativeText("The waterfall roars softly. Mist settles on your pet's fur..."); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(18, 0, -70), radius: 6, label: '[ E ] Listen to Falls', onInteract: () => { setNarrativeText('Clear mountain water cascades into the crystal pool below...'); setTimeout(() => setNarrativeText(null), 3500); } },
        { pos: new THREE.Vector3(25, 0, 30), radius: 3.5, label: '[ E ] Notice Board', onInteract: () => { setNarrativeText('Notice: ' + wFortunes[Math.floor(Math.random() * wFortunes.length)]); setTimeout(() => setNarrativeText(null), 4500); } },
        { pos: new THREE.Vector3(-40, 0, -10), radius: 3.5, label: '[ E ] Notice Board', onInteract: () => { setNarrativeText('Deep in the forest, ancient ruins hold forgotten treasure. Explore carefully.'); setTimeout(() => setNarrativeText(null), 4500); } },
        { pos: new THREE.Vector3(55, 0, -20), radius: 3.5, label: '[ E ] Notice Board', onInteract: () => { setNarrativeText('The desert totems mark the territory of the wind spirits. Show respect.'); setTimeout(() => setNarrativeText(null), 4500); } },
        { pos: new THREE.Vector3(5, 0, -40), radius: 3.5, label: '[ E ] Notice Board', onInteract: () => { setNarrativeText('Crystal caves glow brighter under the full moon. The magic runs deep.'); setTimeout(() => setNarrativeText(null), 4500); } },
      ];

      const openInteractionMenu = (player: InteractionTarget) => {
        interactionTargetRef.current = player;
        setInteractionTarget(player);
        movementBlocked.current = true;
        interactionOpen.current = true;
        // Freeze velocity and clear all keys immediately
        keysRef.current = {};
        playerStateRef.current.vel.x = 0;
        playerStateRef.current.vel.z = 0;
        playerStateRef.current.isMoving = false;
      };

      async function fetchSpeciesForUser(username: string) {
        if (speciesCache.current.has(username)) return speciesCache.current.get(username);
        try {
          const res = await fetch(`/api/species?username=${username}`);
          if (res.ok) { const data = await res.json(); speciesCache.current.set(username, data.species); return data.species; }
        } catch { }
        return "cat";
      }

      const bellGroup = new THREE.Group();
      bellGroup.position.set(3, 0, -2);
      const postMat = new THREE.MeshLambertMaterial({ color: 0x8B5E3C });
      const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), postMat);
      post1.position.set(-0.8, 1.25, 0);
      const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), postMat);
      post2.position.set(0.8, 1.25, 0);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 0.2), postMat);
      crossbar.position.set(0, 2.4, 0);
      bellGroup.add(post1, post2, crossbar);

      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), new THREE.MeshLambertMaterial({ color: 0x8B5E3C }));
      rope.position.set(0, 1.8, 0);
      bellGroup.add(rope);

      shrineBellMesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0xB8860B }));
      shrineBellMesh.position.set(0, 1.2, 0);
      shrineBellMesh.rotation.x = Math.PI / 2;
      bellGroup.add(shrineBellMesh);

      worldDecor.add(bellGroup);
      bellGroup.updateMatrixWorld(true);
      shrineBellHitbox = bellGroup;
      colliders.push({ box: new THREE.Box3().setFromObject(post1), mesh: post1 });
      colliders.push({ box: new THREE.Box3().setFromObject(post2), mesh: post2 });

      const petalGeo = new THREE.PlaneGeometry(0.18, 0.18);
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xFFB7C5, side: THREE.DoubleSide });
      for (let i = 0; i < 60; i++) {
        const pMesh = new THREE.Mesh(petalGeo, petalMat);
        pMesh.position.set(
          (Math.random() - 0.5) * 30,
          4 + Math.random() * 6,
          (Math.random() - 0.5) * 30
        );
        pMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        worldDecor.add(pMesh);
        fallingPetals.push({ mesh: pMesh, offset: Math.random() * Math.PI * 2 });
      }

      const fireflyCount = 60;
      const fireflyGeo = new THREE.BufferGeometry();
      const fireflyPos = new Float32Array(fireflyCount * 3);
      const fireflyData: { x: number; y: number; z: number; offset: number }[] = [];

      for (let i = 0; i < fireflyCount; i++) {
        const fx = (Math.random() - 0.5) * 80;
        const fy = 0.5 + Math.random() * 2.5;
        const fz = (Math.random() - 0.5) * 80;
        fireflyPos[i * 3] = fx;
        fireflyPos[i * 3 + 1] = fy;
        fireflyPos[i * 3 + 2] = fz;
        fireflyData.push({ x: fx, y: fy, z: fz, offset: Math.random() * 100 });
      }
      fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));

      const circleCanvas = document.createElement('canvas');
      circleCanvas.width = 32; circleCanvas.height = 32;
      const cCtx = circleCanvas.getContext('2d')!;
      cCtx.beginPath();
      cCtx.arc(16, 16, 14, 0, Math.PI * 2);
      cCtx.fillStyle = '#FFF8E7';
      cCtx.fill();
      const circleTex = new THREE.CanvasTexture(circleCanvas);

      const fireflyMat = new THREE.PointsMaterial({
        size: 2.0,
        map: circleTex,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        alphaTest: 0.1
      });
      const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
      scene.add(fireflies);



      let lastTime = performance.now(); let elapsed = 0; let lastFootstep = 0;
      let frameCount = 0;
      let prevPromptLabel: string | null = null;
      let cinematicSignaled = false;
      let dayNightT = 0.15;
      const DAY_DURATION = 75;

      const tick = () => {
        if (!mounted.current) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now(); const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now; elapsed += delta; frameCount++;

        if (p.controlEnabled && !movementBlocked.current) {
          const spd = p.speed * (delta * 60); const damping = Math.pow(0.72, delta * 60);
          let moved = false;
          if (keysRef.current["KeyW"] || keysRef.current["ArrowUp"]) { p.vel.x -= Math.sin(p.rot) * spd; p.vel.z -= Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyS"] || keysRef.current["ArrowDown"]) { p.vel.x += Math.sin(p.rot) * spd; p.vel.z += Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyA"] || keysRef.current["ArrowLeft"]) p.rot += 0.045 * (delta * 60);
          if (keysRef.current["KeyD"] || keysRef.current["ArrowRight"]) p.rot -= 0.045 * (delta * 60);
          p.isMoving = moved; p.vel.x *= damping; p.vel.z *= damping;

          // Smooth sliding collision
          // Try X movement first
          const nextX = new THREE.Vector3(p.pos.x + p.vel.x, 0.5, p.pos.z);
          const pBoxX = new THREE.Box3().setFromCenterAndSize(nextX, new THREE.Vector3(1, 2, 1));
          let hitX = false;
          for (const c of colliders) {
            if (pBoxX.intersectsBox(c.box)) {
              hitX = true;
              break;
            }
          }
          if (!hitX) {
            p.pos.x += p.vel.x;
          }

          // Try Z movement second
          const nextZ = new THREE.Vector3(p.pos.x, 0.5, p.pos.z + p.vel.z);
          const pBoxZ = new THREE.Box3().setFromCenterAndSize(nextZ, new THREE.Vector3(1, 2, 1));
          let hitZ = false;
          for (const c of colliders) {
            if (pBoxZ.intersectsBox(c.box)) {
              hitZ = true;
              break;
            }
          }
          if (!hitZ) {
            p.pos.z += p.vel.z;
          }
          if (moved && now - lastFootstep > 320) { lastFootstep = now; playFootstep(); }
        } else if (!movementBlocked.current) {
          p.pos.z += 0.07 * (delta * 60); p.isMoving = true;
          // `cinematicDone` state would be a stale `false` inside this closure,
          // so it used to call setCinematicDone(true) on every frame of the
          // rest of the intro walk. A loop-local flag fires it exactly once.
          if (p.pos.z > -14 && !cinematicSignaled) { cinematicSignaled = true; setCinematicDone(true); }
          if (p.pos.z > -6) p.controlEnabled = true;
        }

        const targetPetPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(new THREE.Vector3(2, 0, 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot));
        const petV3 = new THREE.Vector3(pet.pos.x, pet.pos.y, pet.pos.z).lerp(targetPetPos, 0.08);
        pet.pos.x = petV3.x; pet.pos.y = petV3.y; pet.pos.z = petV3.z;

        // billboard updates
        updateBillboard(playerBB, frameCount, "front");
        playerBB.group.position.set(p.pos.x, 0.5 + Math.sin(frameCount * 0.1) * 0.05, p.pos.z);

        // Update remote players & Proximity
        let closestRemote: InteractionTarget | null = null;
        let minRemoteDist = 4;

        for (const id in remotePlayersRef.current) {
          const remote = remotePlayersRef.current[id];
          remote.bb.group.position.lerp(remote.targetPos, 0.1);
          // Position/movement stays smooth every frame (above); only the
          // sprite's own idle-animation redraw is throttled.
          if ((frameCount + remote.bb.redrawOffset) % BILLBOARD_REDRAW_INTERVAL === 0) {
            updateBillboard(remote.bb, frameCount, "front");
          }

          if (playerRef.current) {
            const d = playerRef.current.position.distanceTo(remote.bb.group.position);
            if (d < minRemoteDist) {
              minRemoteDist = d;
              closestRemote = { id, mesh: remote.bb.group };
            }

            // ─── Ambient Proximity Timers ─────────────────────────────────────
            const PROX_THRESHOLD = 4;
            if (d < PROX_THRESHOLD) {
              // Increment proximity timer (in seconds)
              const prev = proximityTimers.current.get(id) ?? 0;
              const next = prev + delta;
              proximityTimers.current.set(id, next);

              // Skip ambient behavior if a real interaction is open for this pair
              const realInteractionActive = interactionOpen.current && interactionTargetRef.current?.id === id;

              if (!realInteractionActive) {
                // 3s threshold: head-tilt sway burst (only once per proximity window)
                if (prev < 3 && next >= 3 && !ambientTiltActive.current.has(id)) {
                  ambientTiltActive.current.add(id);
                  const tiltMesh = remote.bb.group;
                  const localMesh = playerRef.current;
                  const tiltStart = Date.now();
                  const TILT_DURATION = 2000;
                  animationsRef.current.push(() => {
                    const el = Date.now() - tiltStart;
                    if (el < TILT_DURATION) {
                      const sway = Math.sin(frameCount * 0.04) * 0.06 + Math.sin(el * 0.01) * 0.18;
                      if (tiltMesh) tiltMesh.rotation.y = sway;
                      if (localMesh) localMesh.rotation.y = sway;
                      return true;
                    }
                    // Restore normal rotation
                    if (tiltMesh) tiltMesh.rotation.y = Math.sin(frameCount * 0.04) * 0.06;
                    if (localMesh) localMesh.rotation.y = 0;
                    ambientTiltActive.current.delete(id);
                    return false;
                  });
                }

                // 6s threshold: occasional ambient emoji (1 in 600 frames chance)
                if (next >= 6 && Math.random() < 1 / 600) {
                  const ambientEmojis = ['👋', '😊', '✨', '🌸'];
                  const emoji = ambientEmojis[Math.floor(Math.random() * ambientEmojis.length)];
                  const spawnMesh = Math.random() < 0.5 ? playerRef.current : remote.bb.group;
                  if (spawnMesh && sceneRef.current) {
                    const eDiv = document.createElement('div');
                    eDiv.innerText = emoji;
                    eDiv.style.fontSize = '24px';
                    eDiv.style.pointerEvents = 'none';
                    const eObj = new THREE.CSS2DObject(eDiv);
                    eObj.position.set(
                      spawnMesh.position.x + (Math.random() - 0.5) * 0.5,
                      spawnMesh.position.y + 2.5,
                      spawnMesh.position.z
                    );
                    sceneRef.current.add(eObj);
                    const et = Date.now();
                    animationsRef.current.push(() => {
                      const el = (Date.now() - et) / 1200;
                      eObj.position.y += 0.015;
                      eDiv.style.opacity = String(Math.max(0, 1 - el));
                      if (el >= 1) { sceneRef.current?.remove(eObj); return false; }
                      return true;
                    });
                  }
                }
              }
            } else {
              // Out of range — reset timer and tilt state
              proximityTimers.current.set(id, 0);
              ambientTiltActive.current.delete(id);
            }
          }
        }

        // Clean up timers for players who left
        proximityTimers.current.forEach((_, id) => {
          if (!remotePlayersRef.current[id]) {
            proximityTimers.current.delete(id);
            ambientTiltActive.current.delete(id);
          }
        });

        nearbyPlayer.current = closestRemote;
        const currentId = nearbyPlayer.current?.id || null;
        if (currentId !== prevNearbyId.current) {
          setShowInteractHint(!!nearbyPlayer.current);
          prevNearbyId.current = currentId;
        }

        // Interactable proximity prompt ("[ E ] Pray at Shrine" etc.). This
        // used to call setPromptLabel() unconditionally every frame (60
        // React re-renders/sec) and was removed entirely at some point,
        // which left every interactable with no visible prompt. Restored,
        // but only touching React state when the nearest label changes.
        let nearestLabel: string | null = null;
        let nearestDistSq = Infinity;
        for (const obj of interactables) {
          const dx = p.pos.x - obj.pos.x;
          const dz = p.pos.z - obj.pos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < obj.radius * obj.radius && dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestLabel = obj.label;
          }
        }
        if (nearestLabel !== prevPromptLabel) {
          prevPromptLabel = nearestLabel;
          setPromptLabel(nearestLabel);
        }

        // ─── Ghost idle sway ─────────────────────────────────────────────────
        ghostsRef.current.forEach(({ group, mood }) => {
          if (mood === "coma") {
            // No idle sway for coma
            group.rotation.y = 0;
          } else if (mood === "tired" || mood === "sad") {
            // Slower, smaller sway
            group.rotation.y = Math.sin(frameCount * 0.02) * 0.03;
          } else {
            // Normal sway
            group.rotation.y = Math.sin(frameCount * 0.04) * 0.06;
          }
        });

        // ─── Day / Night Cycle ───────────────────────────────────────────────
        dayNightT = (dayNightT + delta / DAY_DURATION) % 1;
        const dnAngle = dayNightT * Math.PI * 2;
        const sunHeight = Math.sin(dnAngle - Math.PI / 2);          // -1=night  1=noon
        const dayBright = Math.max(0, Math.min(1, (sunHeight + 0.3) / 1.3));
        sunLink.intensity = 0.35 + dayBright * 2.1;
        sunLink.color.setHSL(0.10, dayBright > 0.4 ? 0.45 : 0.1, 0.5 + dayBright * 0.5);
        sunLink.position.set(Math.cos(dnAngle) * 30, Math.sin(dnAngle) * 40, 10);
        ambientLight.intensity = 0.1 + dayBright * 0.45;
        hemiLight.intensity = 0.1 + dayBright * 0.35;
        const skyL = 0.18 + dayBright * 0.62;
        skyColor.setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.32, skyL);
        sceneFog.color.setHSL(dayBright > 0.15 ? 0.60 : 0.67, 0.22, skyL);
        const nightBoost = 1.0 - dayBright * 0.55;
        lanternMats.forEach((mat, i) => {
          mat.emissiveIntensity = (0.65 + Math.sin(elapsed * 1.8 + i * 1.3) * 0.45) * (0.75 + nightBoost * 1.3);
        });

        if (pondMesh) {
          pondMesh.material.color.setHSL(0.55, 0.5, 0.35 + Math.sin(elapsed * 0.9) * 0.025);
        }

        const positions = fireflies.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < fireflyCount; i++) {
          const data = fireflyData[i];
          positions[i * 3 + 1] = data.y + Math.sin(elapsed * 0.3 + data.offset) * 0.5;
          positions[i * 3] = data.x + Math.sin(elapsed * 0.1 + data.offset) * 0.2;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;

        fallingPetals.forEach(({ mesh, offset }) => {
          mesh.position.y -= 0.008;
          mesh.position.x += Math.sin(elapsed * 0.5 + offset) * 0.004;
          mesh.rotation.z += 0.008;
          if (mesh.position.y < 0) {
            mesh.position.y = 7 + Math.random() * 3;
          }
        });

        if (pondMesh) {
          pondMesh.scale.x = 1 + Math.sin(elapsed * 0.5) * 0.02;
          pondMesh.scale.z = 1 + Math.sin(elapsed * 0.5) * 0.02;
        }

        if (shrineBellHitbox) {
          if (new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(shrineBellHitbox.position) < 3) {
            shrineBellMesh.rotation.y = Math.sin(elapsed * 3) * 0.2;
          } else {
            shrineBellMesh.rotation.y = 0;
          }
        }

        ambientParticles.forEach((a, i) => {
          a.mesh.position.y += Math.sin(elapsed * 0.4 + i) * 0.002;
        });

        snowParticles.forEach((s) => {
          s.mesh.position.y -= 0.01;
          s.mesh.position.x += Math.sin(elapsed * 0.2) * 0.002;
          if (s.mesh.position.y < 0) {
            s.mesh.position.y = 20;
          }
        });

        swayables.forEach(s => {
          s.mesh.rotation.z = Math.sin(elapsed * s.speed + s.offset) * 0.1;
        });

        if (minimapRef.current) { const mc = minimapRef.current.getContext('2d')!; mc.fillStyle = '#020617'; mc.fillRect(0, 0, 120, 120); const mx = (p.pos.x + 30) / 60 * 112 + 4, mz = (p.pos.z + 30) / 60 * 112 + 4; mc.fillStyle = '#f0ebe0'; mc.beginPath(); mc.arc(mx, mz, 3, 0, Math.PI * 2); mc.fill(); }

        // Camera Follow (Exact Landing Page Logic)
        const playerPos = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z);
        const offset = new THREE.Vector3(0, 7, 14);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
        camPos.lerp(playerPos.clone().add(offset), 0.065);
        camLook.lerp(playerPos.clone().add(new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot).multiplyScalar(3)), 0.1);
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        // Screen Shake
        if (shakeRef.current > 0) {
          camera.position.x += (Math.random() - 0.5) * shakeRef.current;
          camera.position.y += (Math.random() - 0.5) * shakeRef.current;
          shakeRef.current = Math.max(0, shakeRef.current - 0.015);
        }

        // Process Animations
        animationsRef.current = animationsRef.current.filter(anim => anim());

        renderer.render(scene, camera);
        if (labelRendererRef.current) labelRendererRef.current.render(scene, camera);
      };
      tick();

      const onKD = (e: KeyboardEvent) => {
        initAudio();

        // When interaction is open, ONLY allow interaction keys, block everything else
        if (interactionOpen.current) {
          e.preventDefault();

          const target = interactionTargetRef.current;

          if (e.code === 'Escape') {
            closeInteractionMenu();
            return;
          }

          // ── Z : FIGHT ──
          if (e.code === 'KeyZ' && target) {
            const now = Date.now();
            if (now - lastFightTime.current < 700) return;
            lastFightTime.current = now;

            const defenderStats = remotePlayersRef.current[target.id]?.bb?.pState?.stats ?? petState.stats;
            const damage = computeFightDamage(petState.stats, defenderStats);

            const currentHP = remotePlayerHealth.current.get(target.id) ?? 100;
            const newHP = Math.max(0, currentHP - damage);
            remotePlayerHealth.current.set(target.id, newHP);
            setTargetHP(newHP);
            setIsFighting(true);

            // WS broadcast
            if (socketRef.current) {
              socketRef.current.send(JSON.stringify({
                type: 'fight',
                fromId: petState.gitData.username,
                toId: target.id,
                damage
              }));
            }

            // Update in-world HP bar
            const hpData = healthBarsRef.current.get(target.id);
            if (hpData) {
              const pct = newHP / 100;
              hpData.bar.style.width = `${pct * 100}%`;
              hpData.bar.style.background = pct > 0.6 ? '#4CAF50' : pct > 0.3 ? '#FF9800' : '#F44336';
            }

            if (newHP === 0) {
              showToast("You won! 🏆");
              persistFightWin();
              setTimeout(() => {
                remotePlayerHealth.current.set(target.id, 100);
                setTargetHP(100);
                if (hpData) {
                  hpData.bar.style.width = '100%';
                  hpData.bar.style.background = '#4CAF50';
                }
              }, 3000);
            }

            // Screen shake
            shakeRef.current = 0.25;

            // Knockback
            if (target.mesh && playerRef.current) {
              const dir = target.mesh.position.clone()
                .sub(playerRef.current.position).normalize();
              target.mesh.position.add(dir.multiplyScalar(0.4));
            }

            // Minecraft-style hit flash — white overlay sprite above target
            if (target.mesh && sceneRef.current) {
              const flashDiv = document.createElement('div');
              flashDiv.style.width = '48px';
              flashDiv.style.height = '48px';
              flashDiv.style.background = 'rgba(255,255,255,0.85)';
              flashDiv.style.borderRadius = '4px';
              flashDiv.style.pointerEvents = 'none';
              flashDiv.style.mixBlendMode = 'screen';
              const flashObj = new THREE.CSS2DObject(flashDiv);
              flashObj.position.copy(target.mesh.position);
              flashObj.position.y += 1.2;
              sceneRef.current.add(flashObj);
              const ft = Date.now();
              animationsRef.current.push(() => {
                const el = (Date.now() - ft) / 180;
                flashDiv.style.opacity = String(Math.max(0, 1 - el));
                if (el >= 1) { sceneRef.current?.remove(flashObj); return false; }
                return true;
              });
            }

            // Floating damage number
            if (target.mesh && sceneRef.current) {
              const dmgDiv = document.createElement('div');
              dmgDiv.innerText = `-${damage}`;
              dmgDiv.style.color = '#FF3333';
              dmgDiv.style.fontWeight = 'bold';
              dmgDiv.style.fontSize = '26px';
              dmgDiv.style.textShadow = '0 0 8px rgba(255,0,0,0.9)';
              dmgDiv.style.pointerEvents = 'none';
              dmgDiv.style.userSelect = 'none';
              const dmgObj = new THREE.CSS2DObject(dmgDiv);
              dmgObj.position.copy(target.mesh.position);
              dmgObj.position.y += 3;
              sceneRef.current.add(dmgObj);
              const dt = Date.now();
              animationsRef.current.push(() => {
                const el = (Date.now() - dt) / 900;
                dmgObj.position.y += 0.025;
                dmgDiv.style.opacity = String(Math.max(0, 1 - el));
                if (el >= 1) { sceneRef.current?.remove(dmgObj); return false; }
                return true;
              });
            }

            // Target squish scale reaction
            if (target.mesh) {
              const ox = target.mesh.scale.x;
              const oy = target.mesh.scale.y;
              const oz = target.mesh.scale.z;
              const st = Date.now();
              animationsRef.current.push(() => {
                const el = Date.now() - st;
                if (el < 80) {
                  target.mesh.scale.set(ox * 1.4, oy * 0.6, oz * 1.4);
                } else if (el < 200) {
                  target.mesh.scale.set(ox, oy, oz);
                } else {
                  target.mesh.scale.set(ox, oy, oz);
                  return false;
                }
                return true;
              });
            }

            return;
          }

          // ── F : BEFRIEND (reciprocal) ──
          if (e.code === 'KeyF' && target) {
            if (friendsRef.current.has(target.id)) {
              showToast("Already friends! ❤️");
              closeInteractionMenu();
              return;
            }

            // Check if the target has already sent us a befriend_request (accept it)
            const pending = pendingBefriendRef.current.get(target.id);
            if (pending) {
              // Accept the pending request
              clearTimeout(pending.timerId);
              pendingBefriendRef.current.delete(target.id);
              // Update local state immediately
              friendsRef.current.add(target.id);
              setFriendCount(c => c + 1);
              showToast("You are now friends! 🎉");
              // Broadcast confirmation
              if (socketRef.current) {
                socketRef.current.send(JSON.stringify({
                  type: 'befriend_confirmed',
                  fromId: petState.gitData.username,
                  toId: target.id
                }));
              }
              // Enhanced midpoint heart animation
              const remotePeer = remotePlayersRef.current[target.id];
              triggerMidpointHeartAnim(playerRef.current, remotePeer?.bb?.group ?? null);
              closeInteractionMenu();
              return;
            }

            // No pending — send a new befriend_request
            showToast("Friend request sent! Waiting... ⏳");
            if (socketRef.current) {
              socketRef.current.send(JSON.stringify({
                type: 'befriend_request',
                fromId: petState.gitData.username,
                toId: target.id
              }));
            }
            closeInteractionMenu();
            return;
          }

          // ── X : EMOJI PICKER ──
          if (e.code === 'KeyX') {
            setIsPickingEmoji(true);
            return;
          }

          // ── 1-6 : SEND EMOJI (when picker is open) ──
          const emojiMap: Record<string, string> = {
            Digit1: "😂", Digit2: "❤️", Digit3: "👊",
            Digit4: "🔥", Digit5: "👋", Digit6: "😤"
          };
          if (emojiMap[e.code] && target) {
            const emoji = emojiMap[e.code];

            if (socketRef.current) {
              socketRef.current.send(JSON.stringify({
                type: 'emoji',
                fromId: petState.gitData.username,
                toId: target.id,
                emoji
              }));
            }

            // Arc emoji animation from local player to target
            if (playerRef.current && target.mesh && sceneRef.current) {
              const eDiv = document.createElement('div');
              eDiv.innerText = emoji;
              eDiv.style.fontSize = '28px';
              eDiv.style.pointerEvents = 'none';
              const eObj = new THREE.CSS2DObject(eDiv);
              const startPos = playerRef.current.position.clone().add(new THREE.Vector3(0, 2, 0));
              eObj.position.copy(startPos);
              sceneRef.current.add(eObj);
              const et = Date.now();
              const duration = 1500;
              animationsRef.current.push(() => {
                const elapsed = Date.now() - et;
                const t = Math.min(elapsed / duration, 1);
                const targetPos = target.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
                const pos = startPos.clone().lerp(targetPos, t);
                pos.y += Math.sin(t * Math.PI) * 2;
                eObj.position.copy(pos);
                if (t > 0.66) eDiv.style.opacity = String(1 - (t - 0.66) * 3);
                if (t >= 1) { sceneRef.current?.remove(eObj); return false; }
                return true;
              });
            }

            setIsPickingEmoji(false);
            closeInteractionMenu();
            return;
          }

          return; // block all other keys
        }

        keysRef.current[e.code] = true;

        if (e.code === 'Escape' && interactionOpen.current) closeInteractionMenu();
        if (e.code === 'KeyE') {
          const near = interactables.find(obj =>
            new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos) < obj.radius
          );
          if (near) { playInteract(); near.onInteract(); return; }
          if (nearbyPlayer.current && !interactionOpen.current) {
            openInteractionMenu(nearbyPlayer.current);
          }
        }
      };
      const onKU = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
      window.addEventListener("keydown", onKD); window.addEventListener("keyup", onKU);

      const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
      window.addEventListener("resize", onResize);
      cleanupFns.current.push(() => {
        window.removeEventListener("keydown", onKD);
        window.removeEventListener("keyup", onKU);
        window.removeEventListener("resize", onResize);
      });

      window.addEventListener("beforeunload", saveGhostPosition);
      cleanupFns.current.push(() => window.removeEventListener("beforeunload", saveGhostPosition));

      const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
      if (host) {
        const socket = new PartySocket({ host, room: "world" }); socketRef.current = socket;
        socket.addEventListener("open", () => {
          saveGhostPosition();
          socket.send(JSON.stringify({ type: "join", pet: { username: petState.gitData.username, x: p.pos.x, y: p.pos.z, species: localSpecies, petState } }));
        });
        socket.addEventListener("close", saveGhostPosition);
        socket.addEventListener("message", async (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "snapshot") {
            (Object.entries(msg.pets) as [string, RemotePresence][]).forEach(async ([username, pData]) => {
              if (username === petState.gitData.username) return;
              removeGhost(username);

              const sp = (pData.species || pData.petType || await fetchSpeciesForUser(username) || "cat").toLowerCase();

              const existing = remotePlayersRef.current[username];
              if (existing) {
                if (existing.species !== sp) {
                  scene.remove(existing.bb.group);
                  disposeGroup(existing.bb.group);
                  const bb = createPetBillboard(username, sp, pData.petState || petState);
                  scene.add(bb.group);
                  remotePlayersRef.current[username] = { bb, targetPos: new THREE.Vector3(pData.x, 0.5, pData.y), targetRot: pData.rot || 0, species: sp };
                }
              } else {
                const bb = createPetBillboard(username, sp, pData.petState || petState);
                scene.add(bb.group);
                remotePlayersRef.current[username] = { bb, targetPos: new THREE.Vector3(pData.x, 0.5, pData.y), targetRot: pData.rot || 0, species: sp };
              }
            });

            // A snapshot is the server's authoritative "who's really here"
            // list. Anyone we're still tracking locally but who isn't in it
            // actually left (most often: they disconnected while we were
            // reconnecting and we missed their pet_left message) — without
            // this they'd stay in the world forever as a stuck phantom.
            const stillHere = new Set(Object.keys(msg.pets));
            for (const uid of Object.keys(remotePlayersRef.current)) {
              if (!stillHere.has(uid)) removeRemotePlayer(uid);
            }
          } else if (msg.type === "move" || msg.type === "pet_update") {
            const data = msg.pet || msg; const uid = data.username || msg.id;
            if (uid === petState.gitData.username) return;
            removeGhost(uid);

            const sp = (data.species || data.petType || "cat").toLowerCase();
            const peer = remotePlayersRef.current[uid];

            if (peer) {
              if (peer.species !== sp && (data.species || data.petType)) {
                scene.remove(peer.bb.group);
                disposeGroup(peer.bb.group);
                const bb = createPetBillboard(uid, sp, data.petState || petState);
                scene.add(bb.group);
                peer.bb = bb;
                peer.species = sp;
              }
              peer.targetPos.set(data.x, 0.5, data.y);
              peer.targetRot = data.rot;
            } else {
              // Create if move received before snapshot (rare but possible)
              const bb = createPetBillboard(uid, sp, data.petState || petState);
              scene.add(bb.group);
              remotePlayersRef.current[uid] = { bb, targetPos: new THREE.Vector3(data.x, 0.5, data.y), targetRot: data.rot || 0, species: sp };
            }
          } else if (msg.type === "befriend_received") {
            // Legacy handler kept for compatibility with old server broadcasts
            const peer = remotePlayersRef.current[msg.fromId];
            if (peer) {
              showToast(`${msg.fromId}'s pet wants to be friends! ❤️`);
              triggerHeartAnim(peer.bb.group);
            }
          } else if (msg.type === "befriend_request") {
            // Incoming friend request — store in pending and notify local player
            const sender = msg.fromId as string;
            if (friendsRef.current.has(sender)) return;
            // Clear any existing pending timer for this sender
            const existingPending = pendingBefriendRef.current.get(sender);
            if (existingPending) clearTimeout(existingPending.timerId);
            const timerId = setTimeout(() => {
              // 5 second window expired
              pendingBefriendRef.current.delete(sender);
              showToast(`Friend request from ${sender} expired 💨`);
              // Send expiry notification so the requester also sees fizzle
              if (socketRef.current) {
                socketRef.current.send(JSON.stringify({
                  type: 'befriend_expired',
                  fromId: petState.gitData.username,
                  toId: sender
                }));
              }
              // Fizzle on local player
              triggerFizzleAnim(playerRef.current);
            }, 5000);
            pendingBefriendRef.current.set(sender, { timestamp: Date.now(), timerId });
            showToast(`${sender} wants to be friends! Press F to accept ❤️`);
          } else if (msg.type === "befriend_confirmed") {
            // Both sides confirmed — update state and play enhanced animation
            const confirmerOrAccepter = msg.fromId as string;
            // Clear any pending request from this user
            const existingPending2 = pendingBefriendRef.current.get(confirmerOrAccepter);
            if (existingPending2) { clearTimeout(existingPending2.timerId); pendingBefriendRef.current.delete(confirmerOrAccepter); }
            if (!friendsRef.current.has(confirmerOrAccepter)) {
              friendsRef.current.add(confirmerOrAccepter);
              setFriendCount(c => c + 1);
            }
            showToast("You are now friends! 🎉");
            const confirmedPeer = remotePlayersRef.current[confirmerOrAccepter];
            triggerMidpointHeartAnim(playerRef.current, confirmedPeer?.bb?.group ?? null);
          } else if (msg.type === "befriend_expired") {
            // The other side's timer expired — show fizzle
            const expiredSender = msg.fromId as string;
            const existingPending3 = pendingBefriendRef.current.get(expiredSender);
            if (existingPending3) { clearTimeout(existingPending3.timerId); pendingBefriendRef.current.delete(expiredSender); }
            showToast(`Friend request expired 💨`);
            triggerFizzleAnim(playerRef.current);
          } else if (msg.type === "fight_received") {
            setLocalHP(hp => Math.max(0, hp - msg.damage));
            shakeRef.current = 0.4;
            triggerDamageAnim(playerRef.current, msg.damage);
            showToast(`You were attacked by ${msg.fromId}! ⚔️`);
          } else if (msg.type === "emoji_received") {
            const peer = remotePlayersRef.current[msg.fromId];
            if (peer) {
              const div = document.createElement('div');
              div.innerText = msg.emoji;
              div.style.fontSize = "28px";
              const obj = new THREE.CSS2DObject(div);
              const startPos = peer.bb.group.position.clone().add(new THREE.Vector3(0, 2, 0));
              obj.position.copy(startPos);
              scene.add(obj);

              const startTime = Date.now();
              const duration = 1500;
              animationsRef.current.push(() => {
                const now = Date.now();
                const elapsed = now - startTime;
                const t = Math.min(elapsed / duration, 1);

                const player = playerRef.current;
                if (!player) { scene.remove(obj); return false; }
                const targetPos = player.position.clone().add(new THREE.Vector3(0, 2, 0));
                const pos = startPos.clone().lerp(targetPos, t);
                pos.y += Math.sin(t * Math.PI) * 2;
                obj.position.copy(pos);

                if (t > 0.66) {
                  div.style.opacity = (1 - (t - 0.66) * 3).toString();
                }

                if (t >= 1) { scene.remove(obj); return false; }
                return true;
              });
            }
          } else if (msg.type === "pet_left") {
            const uid = msg.username || msg.id;
            removeRemotePlayer(uid);
          }
          setOnlineCount(Object.keys(remotePlayersRef.current).length + 1);
        });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && p.isMoving) socket.send(JSON.stringify({ type: "move", x: p.pos.x, y: p.pos.z, rot: p.rot, petType: localSpecies })); }, 100);
        cleanupFns.current.push(() => clearInterval(broadcast));
        // A pending befriend request's 5-second expiry timer otherwise
        // outlives the page: its closure still references sceneRef/
        // playerRef/socketRef, none of which are nulled on unmount, so it
        // fires after the world has already been torn down and tries to
        // animate a scene that no longer exists / send on a closed socket.
        cleanupFns.current.push(() => {
          pendingBefriendRef.current.forEach(({ timerId }) => clearTimeout(timerId));
          pendingBefriendRef.current.clear();
        });
      }
    };
    init();
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
      if (playerRef.current) {
        const { x, z } = playerRef.current.position;
        fetch("/api/ghosts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, z, mood: petState.mood }),
          keepalive: true,
        }).catch(() => { });
      }
      cleanups.forEach(f => f());
      // Emptied after running — otherwise every earlier run's cleanups
      // would stay registered and fire again on each later teardown.
      cleanups.length = 0;
      if (socketRef.current) socketRef.current.close();
      if (labelRendererRef.current && labelRendererRef.current.domElement.parentNode) {
        labelRendererRef.current.domElement.parentNode.removeChild(labelRendererRef.current.domElement);
      }
    };
  }, [petState, selectedPet, initialSpecies, persistFightWin]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', background: '#0d0f18', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', position: 'relative', zIndex: 1 }} />
      {(!cinematicDone || !isHydrated || !selectedPet) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 91, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          <div style={{ fontSize: 13, color: '#ffd4a0', letterSpacing: 4, textTransform: 'uppercase' }}>Entering the Garden...</div>
        </div>
      )}
      {cinematicDone && isHydrated && selectedPet && (
        <>
          <div style={{ position: 'fixed', top: 24, left: 24, background: 'rgba(10,8,4,0.8)', padding: '12px 20px', borderRadius: 4, color: '#ffd4a0', zIndex: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>@{petState.gitData.username.toUpperCase()}</div>
            <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${localHP}%`, height: '100%', background: localHP > 60 ? '#4CAF50' : localHP > 30 ? '#FF9800' : '#F44336', transition: 'width 300ms, background 300ms' }} />
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{onlineCount} PETS ONLINE</div>
          </div>
          <div style={{ position: 'fixed', top: 24, right: 24, background: 'rgba(74,175,80,0.8)', padding: '12px 20px', borderRadius: 4, color: '#fff', zIndex: 10, fontSize: 11, letterSpacing: 2 }}>
            FRIENDS: {friendCount}
          </div>
          <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 3, zIndex: 10 }}>WASD · MOVE · E · INTERACT</div>
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 20, border: '1px solid rgba(240,200,140,0.2)' }}><canvas ref={minimapRef} width={120} height={120} style={{ display: 'block', opacity: 0.8 }} /></div>
          {promptLabel && (<div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,14,8,0.9)', border: '1px solid #ffd4a0', padding: '10px 24px', zIndex: 20, fontSize: 10, color: '#ffd4a0' }}>{promptLabel}</div>)}
          {/* Narrative text from interactables (shrine, well, campfires, chests...).
              ~27 interactables set this, but the element rendering it had been
              removed, so pressing E on any of them showed nothing. */}
          {narrativeText && (
            <div style={{ position: 'fixed', bottom: 150, left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(560px, calc(100vw - 32px))', textAlign: 'center', background: 'rgba(10,8,4,0.8)', padding: '10px 20px', borderRadius: 4, color: '#f0ebe0', fontSize: 12, letterSpacing: 1, zIndex: 20, pointerEvents: 'none' }}>
              {narrativeText}
            </div>
          )}
          <div style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '999px',
            fontSize: '14px',
            transition: 'opacity 150ms',
            opacity: showInteractHint ? 1 : 0,
            zIndex: 100,
            pointerEvents: 'none',
          }}>
            Press E to interact
          </div>

          {toast && (
            <div style={{ position: 'fixed', top: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px 24px', borderRadius: 8, fontSize: 14, zIndex: 2000, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {toast}
            </div>
          )}

          <div ref={cssContainerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }} />

          {/* ── GAME-STYLE INTERACTION HUD ── */}
          {interactionTarget && !isPickingEmoji && (
            <div style={{
              position: 'fixed',
              bottom: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'none',
            }}>
              {/* Target name plate */}
              <div style={{
                fontSize: 11,
                letterSpacing: 3,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                {interactionTarget.id}
              </div>

              {/* Fight HP bar — only visible when isFighting */}
              {isFighting && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 4,
                }}>
                  <span style={{ fontSize: 10, color: '#FF4444', letterSpacing: 2 }}>ENEMY HP</span>
                  <div style={{
                    width: 160,
                    height: 8,
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,68,68,0.3)',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${targetHP}%`,
                      background: targetHP > 60 ? '#4CAF50' : targetHP > 30 ? '#FF9800' : '#FF3333',
                      transition: 'width 200ms ease-out, background 200ms',
                      borderRadius: 4,
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 28 }}>
                    {targetHP}
                  </span>
                </div>
              )}

              {/* Command pills */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {[
                  { key: 'Z', label: 'Hold Z · Fight', color: '#FF4444' },
                  { key: 'F', label: 'Friend', color: '#4CAF50' },
                  { key: 'X', label: 'Emoji', color: '#FF9800' },
                  { key: 'ESC', label: 'Leave', color: 'rgba(255,255,255,0.3)' },
                ].map(cmd => (
                  <div key={cmd.key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    background: 'rgba(10,8,4,0.75)',
                    border: `1px solid ${cmd.color}44`,
                    borderRadius: 8,
                    padding: '8px 14px',
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: cmd.color,
                      background: `${cmd.color}22`,
                      border: `1px solid ${cmd.color}55`,
                      borderRadius: 4,
                      padding: '2px 7px',
                      letterSpacing: 1,
                      fontFamily: 'monospace',
                    }}>
                      {cmd.key}
                    </span>
                    <span style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.6)',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                    }}>
                      {cmd.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── EMOJI PICKER HUD ── */}
          {interactionTarget && isPickingEmoji && (
            <div style={{
              position: 'fixed',
              bottom: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                Press 1–6 to send
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {["\ud83d\ude02", "\u2764\ufe0f", "\ud83d\udc4a", "\ud83d\udd25", "\ud83d\udc4b", "\ud83d\ude24"].map((emoji, i) => (
                  <div key={emoji} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(10,8,4,0.75)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    padding: '10px 14px',
                  }}>
                    <span style={{ fontSize: 24 }}>{emoji}</span>
                    <span style={{ fontSize: 10, color: '#FF9800', fontFamily: 'monospace', fontWeight: 700 }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 }}>ESC · BACK</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
