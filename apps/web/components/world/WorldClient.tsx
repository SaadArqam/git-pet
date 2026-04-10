"use client";

import { useEffect, useRef, useState } from "react";
import type { PetState } from "@git-pet/core";
import PartySocket from "partysocket";
import { drawPet } from "@git-pet/renderer";

interface Props {
  petState: PetState;
  species: string;
}

const SPECIES_PRIMARY: Record<string, string> = {
  wolf: "#94a3b8",
  sabertooth: "#f8fafc",
  capybara: "#a16207",
  dragon: "#7c3aed",
  axolotl: "#db2777",
};

export function WorldClient({ petState, species: initialSpecies }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mounted = useRef(true);
  const rendererRef = useRef<any>(null);
  const cleanupFns = useRef<(() => void)[]>([]);
  const socketRef = useRef<PartySocket | null>(null);

  // Movement & State
  const keysRef = useRef<Record<string, boolean>>({});
  const playerStateRef = useRef({
    pos: { x: 0, y: 0.5, z: 35 },
    rot: 0,
    vel: { x: 0, y: 0, z: 0 },
    isMoving: false,
    controlEnabled: false,
    speed: 0.09,
  });

  const petStateRef = useRef({
    pos: { x: 0, y: 0.5, z: 38 },
    rot: 0,
    mesh: null as any,
    bb: null as any
  });

  const playerRef = useRef<any>(null); // Billboard group ref
  const remotePlayersRef = useRef<Record<string, { bb: any, targetPos: any, targetRot: number, species: string }>>({});
  const [cinematicDone, setCinematicDone] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [promptLabel, setPromptLabel] = useState<string | null>(null);
  const [timeDisplay, setTimeDisplay] = useState('☀️ Morning');
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [selectedPet, setSelectedPet] = useState<any>({ type: initialSpecies, id: 'prop-fallback' });
  const [isHydrated, setIsHydrated] = useState(false);

  // billboard species cache
  const speciesCache = useRef<Map<string, string>>(new Map());

  // Sync Hydration & LocalStorage
  useEffect(() => {
    setIsHydrated(true);
    try {
      const stored = localStorage.getItem("selectedPet");
      if (stored) {
        const parsed = JSON.parse(stored);
        setSelectedPet(parsed);
      }
    } catch (e) {
      console.error("Failed to load pet from localStorage", e);
    }
    return () => { mounted.current = false; };
  }, [initialSpecies]);

  // Main Three.js logic
  useEffect(() => {
    if (typeof window === "undefined" || !canvasRef.current) return;
    if (!selectedPet) return;

    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src; s.onload = () => resolve(); s.onerror = reject;
        document.head.appendChild(s);
      });

    const init = async () => {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js");
      if (!mounted.current || !canvasRef.current) return;

      const THREE = (window as any).THREE;
      if (!THREE) return;

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
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xb8cce0, 0.018);
      scene.background = new THREE.Color(0x87b4d0);

      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 140);
      const camPos = new THREE.Vector3(0, 14, 40);
      const camLook = new THREE.Vector3(0, 2, 0);

      // --- Lighting ---
      const sunLink = new THREE.DirectionalLight(0xffd4a0, 2.4);
      sunLink.position.set(20, 40, 10); sunLink.castShadow = true;
      sunLink.shadow.mapSize.width = 2048; sunLink.shadow.mapSize.height = 2048;
      scene.add(sunLink);
      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55); scene.add(ambientLight);
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.45); scene.add(hemiLight);

      // billboard sprite helper
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
        plane.onBeforeRender = (renderer: any, scene: any, camera: any) => {
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
        lctx.fillText(`@${username.toUpperCase()}`, 128, 40);

        const lTex = new THREE.CanvasTexture(labelCanvas);
        const lMat = new THREE.SpriteMaterial({ map: lTex, transparent: true });
        const labelSprite = new THREE.Sprite(lMat);
        labelSprite.scale.set(4, 1, 1);
        labelSprite.position.set(0, 2.8, 0);
        group.add(labelSprite);

        return { group, canvas, ctx, texture, species, pState, labelSprite };
      }

      function updateBillboard(bb: any, frame: number, view: any) {
        const { ctx, canvas, texture, species, pState } = bb;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPet(ctx, pState, frame, canvas.width, canvas.height, view, species, { transparent: true });
        texture.needsUpdate = true;
      }

      // --- Helpers ---
      const colliders: { box: any, mesh: any }[] = [];
      function vox(x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, castShadow = false, receiveShadow = false, isSolid = false): any {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
        mesh.position.set(x, y, z); mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        scene.add(mesh);
        if (isSolid) colliders.push({ box: new THREE.Box3().setFromObject(mesh), mesh });
        return mesh;
      }

      // ─── AUDIO SYSTEM ───
      let audioInit = false; let audioCtx: any = null; let audioListener: any = null;
      function initAudio() {
        if (audioInit) return; audioInit = true;
        try {
          audioListener = new THREE.AudioListener(); camera.add(audioListener);
          audioCtx = audioListener.context;
        } catch (e) { console.warn("Audio init failed", e); }
      }

      function playFootstep() {
        if (!audioInit || !audioCtx) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(120, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.015, audioCtx.currentTime); osc.connect(gain); gain.connect(audioListener.getInput());
        osc.start(); osc.stop(audioCtx.currentTime + 0.05);
      }

      function playInteract() {
        if (!audioInit || !audioCtx) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime); osc.connect(gain); gain.connect(audioListener.getInput());
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
      }

      // ─── WORLD BUILDING ───
      const groundGeo = new THREE.PlaneGeometry(300, 300, 100, 100); groundGeo.rotateX(-Math.PI / 2);
      const groundColors: number[] = []; const groundPos = groundGeo.attributes.position;
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i);
        const n = Math.sin(gx * 2.3) * Math.cos(gz * 1.9);
        if (n > 0.2) groundColors.push(0.28, 0.54, 0.22); else if (n > -0.2) groundColors.push(0.32, 0.60, 0.26); else groundColors.push(0.26, 0.50, 0.20);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
      const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      ground.receiveShadow = true; scene.add(ground);
      for (let gx = -30; gx < 30; gx++) vox(gx + 0.5, -0.3, -32, 0x8B6914, 1, 0.4, 1);

      const pathPoints = [[0, 20], [0.5, 16], [0, 12], [-0.5, 8], [0, 4], [0.5, 0], [0, -4], [-0.5, -8], [0, -12], [0.5, -16], [0, -20]];
      pathPoints.forEach(([px, pz]) => { for (let w = -1; w <= 1; w++) vox(px + w, 0.06, pz, 0x9a9a9a, 1, 0.12, 1, false, true); });

      function buildTorii(x: number, z: number) {
        const red = 0xcc3300;
        for (let py = 0; py < 5; py++) { vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); }
        vox(x, 5.3, z, 0x992200, 6, 0.45, 0.5, true, false, true); vox(x, 4.6, z, red, 5, 0.35, 0.45, true);
      }
      buildTorii(0, -7); buildTorii(0, -18);

      const lanternMats: any[] = [];
      function buildLantern(x: number, z: number) {
        vox(x, 0.2, z, 0x888880, 0.85, 0.45, 0.85, false, false, true); vox(x, 1.1, z, 0x888880, 0.45, 0.55, 0.45, false, false, true);
        const lMat = new THREE.MeshLambertMaterial({ color: 0xffcc66, emissive: 0xffaa22, emissiveIntensity: 1.0 });
        const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), lMat);
        lMesh.position.set(x, 1.75, z); lMesh.castShadow = true; scene.add(lMesh); colliders.push({ box: new THREE.Box3().setFromObject(lMesh), mesh: lMesh });
        lanternMats.push(lMat);
        scene.add(new THREE.PointLight(0xffaa22, 1.4, 8).clone().translateY(1.8).translateX(x).translateZ(z));
      }
      buildLantern(-2, 4); buildLantern(2, 0); buildLantern(-2, -4); buildLantern(2, -12);

      function buildCherryTree(x: number, z: number, h: number) {
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true, false, ty < 2);
        for (let bx = -3; bx <= 3; bx++) for (let by = -1; by <= 2; by++) for (let bz = -3; bz <= 3; bz++) {
          const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz);
          if (dist < 3.2 && Math.random() > dist * 0.15) vox(x + bx * 0.88, h + by * 0.88, z + bz * 0.88, blossoms[Math.floor(Math.random() * 4)], 0.85, 0.85, 0.85, true);
        }
      }
      buildCherryTree(-11, -5, 6); buildCherryTree(-15, -13, 5); buildCherryTree(12, -8, 4); buildCherryTree(-9, 8, 4);

      const POND_X = 9, POND_Z = -4;
      for (let bx = -4; bx <= 4; bx++) for (let bz = -3; bz <= 3; bz++) if (Math.abs(bx) === 4 || Math.abs(bz) === 3) vox(POND_X + bx, 0.08, POND_Z + bz, 0x7a7a7a, 1, 0.2, 1);
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), waterMat);
      water.rotateX(-Math.PI / 2); water.position.set(POND_X, 0.1, POND_Z); water.receiveShadow = true; scene.add(water);

      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        const g = new THREE.Group(); scene.add(g);
        for (let s = 0; s < 3; s++) for (let sx = -(3 - s); sx <= (3 - s); sx++) for (let sz = -(2 - s); sz <= (2 - s); sz++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 1), new THREE.MeshLambertMaterial({ color: stone }));
          m.position.set(x + sx, s * 0.45, z + sz + 3); g.add(m);
        }
        for (let wx = -3; wx <= 3; wx++) for (let wy = 0; wy < 4; wy++) for (let wz = -2; wz <= 2; wz++) {
          if (Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0) {
            if (wx === 0 && wz === -2 && wy < 2) continue;
            const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: wood }));
            m.position.set(x + wx, 1.4 + wy, z + wz); g.add(m);
            colliders.push({ box: new THREE.Box3().setFromObject(m), mesh: m });
          }
        }
        return g;
      }
      const shrineGroup = buildShrine(0, -22);

      function buildForestTree(x: number, z: number, h: number) {
        const lc = [0x2d4a1e, 0x1e3014, 0x3a5a28, 0x4a6a38];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x5a3a1a, 0.65, 1, 0.65, true, false, ty < 2);
        for (let fx = -2; fx <= 2; fx++) for (let fy = -1; fy <= 2; fy++) for (let fz = -2; fz <= 2; fz++) {
          const d = Math.sqrt(fx * fx + fy * fy * 1.2 + fz * fz); if (d < 2.4 && Math.random() > d * 0.18) vox(x + fx * 0.9, h + fy * 0.85, z + fz * 0.9, lc[Math.floor(Math.random() * 4)], 0.9, 0.9, 0.9);
        }
      }

      function createForestZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 40; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80; const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const h = 4 + Math.random() * 4; buildForestTree(rx, rz, h);
        }
      }

      function createDesertZone(offsetX: number, offsetZ: number) {
        const cactusColor = 0x2d5a27, rockColor = 0x8b7355;
        for (let i = 0; i < 30; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80; const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          if (Math.random() > 0.4) {
            const h = 2 + Math.random() * 2.5; vox(rx, h / 2, rz, cactusColor, 0.5, h, 0.5, true, false, true);
          } else {
            const s = 1 + Math.random() * 3; vox(rx, s / 2, rz, rockColor, s, s * 0.6, s * 0.8, true, false, true);
          }
        }
      }

      function createMountainZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 12; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80; const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const h = 8 + Math.random() * 12, w = 6 + Math.random() * 6;
          for (let my = 0; my < h; my += 1.5) {
            const r = (h - my) * (w / h); vox(rx, my + 0.75, rz, 0x5a5a5a, r, 1.5, r, true, false, my < 3);
          }
        }
      }

      createForestZone(0, -100); createDesertZone(100, 0); createMountainZone(-100, 0);

      // Identify local species
      let localSpecies = selectedPet.type;
      try {
        const res = await fetch("/api/species");
        if (res.ok) { const data = await res.json(); if (data.species) localSpecies = data.species; }
      } catch (e) { }

      // Local Player & Pet Billboards
      const playerBB = createPetBillboard(petState.gitData.username, localSpecies, petState);
      scene.add(playerBB.group); playerRef.current = playerBB.group;

      const followingPetBB = createPetBillboard(`${petState.gitData.username}-pet`, localSpecies, petState);
      scene.add(followingPetBB.group);
      const p = playerStateRef.current; const pet = petStateRef.current;
      pet.bb = followingPetBB;

      // Interaction
      const interactables = [
        { pos: new THREE.Vector3(-7, 0, 3), radius: 3, label: '[ E ] Readme', onInteract: () => navigator.clipboard.writeText(`![Pet](https://git-pet.vercel.app/api/card/${petState.gitData.username})`) },
        { pos: new THREE.Vector3(0, 0, -22), radius: 5, label: '[ E ] Settings', onInteract: () => window.location.href = "/settings" }
      ];

      const peerMeshes = new Map<string, { bb: any, targetPos: any, targetRot: number, species: string }>();

      async function fetchSpeciesForUser(username: string) {
        if (speciesCache.current.has(username)) return speciesCache.current.get(username);
        try {
          const res = await fetch(`/api/species?username=${username}`);
          if (res.ok) { const data = await res.json(); speciesCache.current.set(username, data.species); return data.species; }
        } catch (e) { }
        return "cat";
      }

      const petalMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), new THREE.MeshLambertMaterial({ color: 0xffb7c5 }), 100);
      scene.add(petalMesh);
      const petalData = Array.from({ length: 100 }, () => ({ x: (Math.random() - 0.5) * 40, y: Math.random() * 14 + 2, z: (Math.random() - 0.5) * 40, vy: -(0.007 + Math.random() * 0.01) }));
      const dummy = new THREE.Object3D();

      let lastTime = performance.now(); let elapsed = 0; let lastFootstep = 0;
      let frameCount = 0;

      const tick = () => {
        if (!mounted.current) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now(); const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now; elapsed += delta; frameCount++;

        if (p.controlEnabled) {
          const spd = p.speed * (delta * 60); const damping = Math.pow(0.72, delta * 60);
          let moved = false;
          if (keysRef.current["KeyW"] || keysRef.current["ArrowUp"]) { p.vel.x -= Math.sin(p.rot) * spd; p.vel.z -= Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyS"] || keysRef.current["ArrowDown"]) { p.vel.x += Math.sin(p.rot) * spd; p.vel.z += Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyA"] || keysRef.current["ArrowLeft"]) p.rot += 0.045 * (delta * 60);
          if (keysRef.current["KeyD"] || keysRef.current["ArrowRight"]) p.rot -= 0.045 * (delta * 60);
          p.isMoving = moved; p.vel.x *= damping; p.vel.z *= damping;

          // Smooth sliding collision
          const moveX = new THREE.Vector3(p.vel.x, 0, 0);
          const moveZ = new THREE.Vector3(0, 0, p.vel.z);
          
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
        } else {
          p.pos.z -= 0.14 * (delta * 60); p.isMoving = true;
          if (p.pos.z < 15 && !cinematicDone) setCinematicDone(true);
          if (p.pos.z < -8) p.controlEnabled = true;
        }

        const targetPetPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(new THREE.Vector3(2, 0, 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot));
        const petV3 = new THREE.Vector3(pet.pos.x, pet.pos.y, pet.pos.z).lerp(targetPetPos, 0.08);
        pet.pos.x = petV3.x; pet.pos.y = petV3.y; pet.pos.z = petV3.z;

        // billboard updates
        updateBillboard(playerBB, frameCount, "front");
        playerBB.group.position.set(p.pos.x, 0.5 + Math.sin(frameCount * 0.1) * 0.05, p.pos.z);

        updateBillboard(pet.bb, frameCount, "front");
        pet.bb.group.position.set(pet.pos.x, 0.5 + Math.abs(Math.sin(frameCount * 0.15)) * 0.15, pet.pos.z);

        // Update remote players
        for (const id in remotePlayersRef.current) {
          const remote = remotePlayersRef.current[id];
          remote.bb.group.position.lerp(remote.targetPos, 0.1);
          updateBillboard(remote.bb, frameCount, "front");
        }

        petalData.forEach((p, i) => { p.y += p.vy; if (p.y < -0.5) p.y = 14; dummy.position.set(p.x, p.y, p.z); dummy.updateMatrix(); petalMesh.setMatrixAt(i, dummy.matrix); }); petalMesh.instanceMatrix.needsUpdate = true;
        waterMat.color.setHSL(0.55, 0.55, 0.36 + Math.sin(elapsed * 1.3) * 0.04);

        if (minimapRef.current) { const mc = minimapRef.current.getContext('2d')!; mc.fillStyle = '#020617'; mc.fillRect(0, 0, 120, 120); const mx = (p.pos.x + 30) / 60 * 112 + 4, mz = (p.pos.z + 30) / 60 * 112 + 4; mc.fillStyle = '#f0ebe0'; mc.beginPath(); mc.arc(mx, mz, 3, 0, Math.PI * 2); mc.fill(); }

        // Camera Follow (Exact Landing Page Logic)
        const playerPos = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z);
        const offset = new THREE.Vector3(0, 7, 14);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
        camPos.lerp(playerPos.clone().add(offset), 0.065);
        camLook.lerp(playerPos.clone().add(new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot).multiplyScalar(3)), 0.1);
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        renderer.render(scene, camera);
      };
      tick();

      const onKD = (e: any) => {
        initAudio();
        keysRef.current[e.code] = true;
        if (e.code === "KeyE") {
          const near = interactables.find(obj => new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos) < obj.radius);
          if (near) { playInteract(); near.onInteract(); }
        }
      };
      const onKU = (e: any) => keysRef.current[e.code] = false;
      window.addEventListener("keydown", onKD); window.addEventListener("keyup", onKU);

      const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
      window.addEventListener("resize", onResize);
      cleanupFns.current.push(() => {
        window.removeEventListener("keydown", onKD);
        window.removeEventListener("keyup", onKU);
        window.removeEventListener("resize", onResize);
      });

      const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
      if (host) {
        const socket = new PartySocket({ host, room: "world" }); socketRef.current = socket;
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", pet: { username: petState.gitData.username, x: p.pos.x, y: p.pos.z, species: localSpecies, petState } })));
        socket.addEventListener("message", async (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "snapshot") {
            Object.entries(msg.pets).forEach(async ([username, pData]: [string, any]) => {
              if (username === petState.gitData.username) return;
              
              const sp = (pData.species || pData.petType || await fetchSpeciesForUser(username) || "cat").toLowerCase();
              console.log("Incoming player:", username, sp);

              const existing = remotePlayersRef.current[username];
              if (existing) {
                if (existing.species !== sp) {
                  scene.remove(existing.bb.group);
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
          } else if (msg.type === "move" || msg.type === "pet_update") {
            const data = msg.pet || msg; const uid = data.username || msg.id;
            if (uid === petState.gitData.username) return;
            
            const sp = (data.species || data.petType || "cat").toLowerCase();
            let peer = remotePlayersRef.current[uid];
            
            if (peer) {
              if (peer.species !== sp && (data.species || data.petType)) {
                scene.remove(peer.bb.group);
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
          } else if (msg.type === "leave") {
            const peer = remotePlayersRef.current[msg.id]; 
            if (peer) { 
              scene.remove(peer.bb.group); 
              delete remotePlayersRef.current[msg.id]; 
            }
          }
          setOnlineCount(Object.keys(remotePlayersRef.current).length + 1);
        });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && p.isMoving) socket.send(JSON.stringify({ type: "move", x: p.pos.x, y: p.pos.z, rot: p.rot })); }, 100);
        cleanupFns.current.push(() => clearInterval(broadcast));
      }
    };
    init();
    return () => { cancelAnimationFrame(rafRef.current); if (rendererRef.current) rendererRef.current.dispose(); cleanupFns.current.forEach(f => f()); if (socketRef.current) socketRef.current.close(); };
  }, [petState, selectedPet, initialSpecies]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', background: '#0d0f18', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {(!cinematicDone || !isHydrated || !selectedPet) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 91, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          <div style={{ fontSize: 13, color: '#ffd4a0', letterSpacing: 4, textTransform: 'uppercase' }}>Entering the Garden...</div>
        </div>
      )}
      {cinematicDone && isHydrated && selectedPet && (
        <>
          <div style={{ position: 'fixed', top: 24, left: 24, background: 'rgba(10,8,4,0.8)', padding: '12px 20px', borderRadius: 4, color: '#ffd4a0', zIndex: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 2 }}>@{petState.gitData.username.toUpperCase()}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{onlineCount} PETS ONLINE</div>
          </div>
          <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 3, zIndex: 10 }}>WASD · MOVE · E · INTERACT</div>
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 20, border: '1px solid rgba(240,200,140,0.2)' }}><canvas ref={minimapRef} width={120} height={120} style={{ display: 'block', opacity: 0.8 }} /></div>
          {promptLabel && (<div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,14,8,0.9)', border: '1px solid #ffd4a0', padding: '10px 24px', zIndex: 20, fontSize: 10, color: '#ffd4a0' }}>{promptLabel}</div>)}
        </>
      )}
    </div>
  );
}
