"use client";

import { useEffect, useRef, useState } from "react";
import type { PetState } from "@git-pet/core";
import PartySocket from "partysocket";

interface Props {
  petState: PetState;
  species: string;
}

export function WorldClient({ petState, species }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mounted = useRef(true);
  const rendererRef = useRef<any>(null);
  const cleanupFns = useRef<(() => void)[]>([]);
  const socketRef = useRef<PartySocket | null>(null);

  // Movement & State
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef({
    pos: { x: 0, y: 0.5, z: 28 }, // Spawn behind torii
    rot: 0,
    vel: { x: 0, y: 0, z: 0 },
    isMoving: false,
    controlEnabled: false,
    speed: 0.09,
  });

  const petRef = useRef({
    pos: { x: 0, y: 0.5, z: 31 },
    rot: 0,
    mesh: null as any,
    legs: {} as any,
  });

  const [cinematicDone, setCinematicDone] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [promptLabel, setPromptLabel] = useState<string | null>(null);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  // Main Three.js logic
  useEffect(() => {
    if (typeof window === "undefined" || !canvasRef.current) return;

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
      renderer.toneMappingExposure = 1.2;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xb8cce0, 0.018);
      scene.background = new THREE.Color(0x87b4d0);

      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
      const camPos = new THREE.Vector3(0, 14, 40);
      const camLook = new THREE.Vector3(0, 2, 0);
      camera.position.set(0, 14, 40);

      // --- Lighting (EXACT LANDING MATCH) ---
      const sun = new THREE.DirectionalLight(0xffd4a0, 2.4);
      sun.position.set(20, 40, 10); sun.castShadow = true;
      sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
      sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
      sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
      sun.shadow.bias = -0.001; scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9bb8d4, 0.7);
      fill.position.set(-20, 15, -10); scene.add(fill);
      const ambientLight = new THREE.AmbientLight(0xffe8c0, 0.55); scene.add(ambientLight);
      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.45); scene.add(hemiLight);

      // --- Helpers ---
      function vox(x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, castShadow = false, receiveShadow = false): any {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
        mesh.position.set(x, y, z); mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        scene.add(mesh); return mesh;
      }

      function buildSpeciesMesh(sp: string, color: string) {
        const g = new THREE.Group();
        const dark = new THREE.Color(color).multiplyScalar(0.6).getHex();
        const b = (x: number, y: number, z: number, w: number, h: number, d: number, c: any) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
          m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
        };
        const legs = { FL: null as any, FR: null as any, BL: null as any, BR: null as any };
        // Body
        b(0, 0.5, 0, 0.8, 0.6, 0.8, color);
        b(0, 1.1, -0.1, 0.6, 0.5, 0.6, color);
        b(-0.15, 1.2, -0.4, 0.1, 0.1, 0.05, 0x000000);
        b(0.15, 1.2, -0.4, 0.1, 0.1, 0.05, 0x000000);
        // Features
        if (sp === 'axolotl') {
           [1, -1].forEach(s => { b(0.4*s, 1.2, 0, 0.2, 0.3, 0.1, 0xec4899); b(0.45*s, 1.1, 0, 0.1, 0.2, 0.1, 0xec4899); });
        } else if (sp === 'dragon') {
           b(0, 1.5, 0.1, 0.1, 0.4, 0.1, dark); b(-0.3, 0.8, 0.3, 0.4, 0.1, 0.4, dark); b(0.3, 0.8, 0.3, 0.4, 0.1, 0.4, dark);
        } else if (sp === 'wolf') {
           b(-0.25, 1.5, 0.1, 0.15, 0.3, 0.1, dark); b(0.25, 1.5, 0.1, 0.15, 0.3, 0.1, dark);
        } else if (sp === 'sabertooth') {
           b(-0.15, 0.8, -0.42, 0.08, 0.4, 0.08, 0xffffff); b(0.15, 0.8, -0.42, 0.08, 0.4, 0.08, 0xffffff);
        }
        legs.FL = b(-0.25, 0.15, -0.25, 0.2, 0.3, 0.2, dark); legs.FR = b(0.25, 0.15, -0.25, 0.2, 0.3, 0.2, dark);
        legs.BL = b(-0.25, 0.15, 0.25, 0.2, 0.3, 0.2, dark); legs.BR = b(0.25, 0.15, 0.25, 0.2, 0.3, 0.2, dark);
        scene.add(g); return { group: g, legs };
      }

      // ─── WORLD BUILDING ───
      // Ground
      const groundGeo = new THREE.PlaneGeometry(80, 80, 40, 40); groundGeo.rotateX(-Math.PI / 2);
      const groundColors: number[] = []; const groundPos = groundGeo.attributes.position;
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i);
        const n = Math.sin(gx*2.3)*Math.cos(gz*1.9);
        if (n > 0.2) groundColors.push(0.28, 0.54, 0.22);
        else if (n > -0.2) groundColors.push(0.32, 0.60, 0.26);
        else groundColors.push(0.26, 0.50, 0.20);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
      const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      ground.receiveShadow = true; scene.add(ground);
      for (let gx = -30; gx < 30; gx++) vox(gx + 0.5, -0.3, -32, 0x8B6914, 1, 0.4, 1);

      // Path
      const pathPoints = [[0, 20], [0.5, 16], [0, 12], [-0.5, 8], [0, 4], [0.5, 0], [0, -4], [-0.5, -8], [0, -12], [0.5, -16], [0, -20]];
      const stoneColors = [0x9a9a9a, 0x8a8a8a, 0xaaaaaa, 0x888888];
      pathPoints.forEach(([px, pz]) => { for (let w = -1; w <= 1; w++) vox(px + w, 0.06, pz, stoneColors[Math.floor(Math.random()*4)], 1, 0.12, 1, false, true); });

      // Torii
      const toriiBars: any[] = [];
      function buildTorii(x: number, z: number) {
        const red = 0xcc3300, darkRed = 0x992200;
        for (let py = 0; py < 5; py++) { vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true); vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true); }
        toriiBars.push(vox(x, 5.3, z, darkRed, 6, 0.45, 0.5, true)); toriiBars.push(vox(x, 4.6, z, red, 5, 0.35, 0.45, true));
        vox(x - 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35); vox(x + 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35);
      }
      buildTorii(0, -7); buildTorii(0, -18);

      // Lanterns
      const lanternMats: any[] = [];
      function buildLantern(x: number, z: number) {
        const stone = 0x888880;
        vox(x, 0.2, z, stone, 0.85, 0.45, 0.85); vox(x, 0.65, z, stone, 0.45, 0.6, 0.45); vox(x, 1.1, z, stone, 0.45, 0.55, 0.45);
        const lMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffcc66), emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.0 });
        const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.6,0.7), lMat); lMesh.position.set(x,1.75,z); lMesh.castShadow = true; scene.add(lMesh);
        lanternMats.push(lMat); vox(x, 2.15, z, stone, 0.95, 0.2, 0.95);
        const pl = new THREE.PointLight(0xffaa22, 1.4, 8); pl.position.set(x,1.8,z); scene.add(pl);
      }
      buildLantern(-2, 4); buildLantern(2, 0); buildLantern(-2, -4); buildLantern(2, -12);

      // Cherry trees
      function buildCherryTree(x: number, z: number, h: number) {
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true);
        for (let bx = -3; bx <= 3; bx++) for (let by = -1; by <= 2; by++) for (let bz = -3; bz <= 3; bz++) {
          const dist = Math.sqrt(bx*bx + by*by*1.5 + bz*bz);
          if (dist < 3.2 && Math.random() > dist * 0.15) vox(x + bx*0.88, h + by*0.88, z + bz*0.88, blossoms[Math.floor(Math.random()*4)], 0.85, 0.85, 0.85, true);
        }
      }
      buildCherryTree(-11, -5, 6); buildCherryTree(-15, -13, 5); buildCherryTree(12, -8, 4); buildCherryTree(-9, 8, 4);

      // Pond
      const POND_X = 9, POND_Z = -4;
      for (let bx = -4; bx <= 4; bx++) for (let bz = -3; bz <= 3; bz++) if (Math.abs(bx) === 4 || Math.abs(bz) === 3) vox(POND_X + bx, 0.08, POND_Z + bz, 0x7a7a7a, 1, 0.2, 1);
      const waterGeo = new THREE.PlaneGeometry(7,5); waterGeo.rotateX(-Math.PI/2);
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat); waterMesh.position.set(POND_X, 0.1, POND_Z); waterMesh.receiveShadow = true; scene.add(waterMesh);
      [[POND_X - 2, POND_Z + 1], [POND_X + 1, POND_Z - 1], [POND_X + 2, POND_Z + 2]].forEach(([lx, lz]) => vox(lx, 0.13, lz, 0x3a8a3a, 0.7, 0.06, 0.7));
      const koiData = Array.from({ length: 5 }, (_, i) => ({
        mesh: vox(POND_X, 0.12, POND_Z, [0xff6633, 0xff4400, 0xffaa44, 0xffffff, 0xff8800][i], 0.5, 0.15, 0.9),
        angle: (i / 5) * Math.PI * 2, radius: 1.5 + Math.random() * 1.5, speed: 0.004 + Math.random() * 0.003,
      }));

      // Shrine
      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        for (let s = 0; s < 3; s++) for (let sx = -(3-s); sx <= (3-s); sx++) for (let sz = -(2-s); sz <= (2-s); sz++) vox(x + sx, s * 0.45, z + sz + 3, stone, 1, 0.45, 1, false, true);
        for (let wx = -3; wx <= 3; wx++) for (let wy = 0; wy < 4; wy++) for (let wz = -2; wz <= 2; wz++) {
          const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0; if (!isWall) continue;
          if (wx === 0 && wz === -2 && wy < 2) continue;
          const isWindow = Math.abs(wx) === 2 && wz === -2 && wy === 1;
          const m = vox(x + wx, 1.4 + wy, z + wz, isWindow ? 0xffcc66 : wood, 1, 1, 1, true);
          if (isWindow) { (m.material as any).emissive = new THREE.Color(0xffaa22); (m.material as any).emissiveIntensity = 1.2; }
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry; for (let rx = -(3+ext); rx <= (3+ext); rx++) for (let rz = -(2+ext); rz <= (2+ext); rz++) {
            const isEdge = Math.abs(rx) === 3 + ext || Math.abs(rz) === 2 + ext; if (!isEdge && ry > 0) continue;
            vox(x + rx, 5.4 + ry * 0.5, z + rz, ry === 0 ? 0x3a2f1e : roof, 1, 0.4, 1, true);
          }
        }
        vox(x, 5.2, z - 2.5, 0x886600, 0.4, 0.6, 0.4);
      }
      buildShrine(0, -22);

      // Forest
      function buildForestTree(x: number, z: number, h: number) {
        const lc = [0x2d4a1e, 0x1e3014, 0x3a5a28, 0x4a6a38];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x5a3a1a, 0.65, 1, 0.65, true);
        for (let fx = -2; fx <= 2; fx++) for (let fy = -1; fy <= 2; fy++) for (let fz = -2; fz <= 2; fz++) {
          const d = Math.sqrt(fx*fx + fy*fy*1.2 + fz*fz); if (d < 2.4 && Math.random() > d * 0.18) vox(x + fx*0.9, h+fy*0.85, z+fz*0.9, lc[Math.floor(Math.random()*4)], 0.9, 0.9, 0.9);
        }
      }
      [[22, -2], [24, -9], [27, -5], [29, -14], [23, -17], [31, -9], [26, -20], [20, -12]].forEach(([x, z]) => buildForestTree(x, z, 4 + Math.floor(Math.random()*3)));
      const forestAltarMat = new THREE.MeshLambertMaterial({ color: 0xff9944, emissive: new THREE.Color(0xff7722), emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
      const forestAltarFlame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), forestAltarMat); forestAltarFlame.position.set(26, 1.15, -24); scene.add(forestAltarFlame);
      const forestAltarLight = new THREE.PointLight(0xff9944, 0.7, 7); forestAltarLight.position.set(26, 1.5, -24); scene.add(forestAltarLight);

      // Stream
      const streamGeo = new THREE.PlaneGeometry(1.8, 13); streamGeo.rotateX(-Math.PI/2);
      const streamMat = new THREE.MeshLambertMaterial({ color: 0x4a9ab8, transparent: true, opacity: 0.72 });
      const streamMesh = new THREE.Mesh(streamGeo, streamMat); streamMesh.position.set(-13.4, 0.02, 18); scene.add(streamMesh);
      [-14.2, -13.5, -12.8].forEach(bx => vox(bx, 0.28, 18, 0x8B6914, 1, 0.2, 4, true));
      [[-15.5, 14], [-12, 15.5], [-15.5, 22], [-12, 20.5]].forEach(([bx, bz]) => { vox(bx, 0.5, bz, 0x2a5820, 0.25, 1.1, 0.25); vox(bx, 1.2, bz, 0x3a6830, 0.75, 0.35, 0.75); });

      // Spirit Area
      const WISP_COUNT = 8; const wispGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const wispMat = new THREE.MeshLambertMaterial({ color: 0xaadeff, emissive: new THREE.Color(0x88bbff), emissiveIntensity: 2.0, transparent: true, opacity: 0.8 });
      const wispMesh = new THREE.InstancedMesh(wispGeo, wispMat, WISP_COUNT); scene.add(wispMesh);
      const wispData = Array.from({ length: WISP_COUNT }, (_, i) => ({ angle: (i / WISP_COUNT) * Math.PI * 2, radius: 2.5 + (i % 3) * 1.2, baseY: 1.6 + (i % 4) * 0.35, speed: 0.006 + (i % 3) * 0.003 }));
      const spiritAreaLight = new THREE.PointLight(0x88bbff, 0.5, 10); spiritAreaLight.position.set(-18, 2, -32); scene.add(spiritAreaLight);

      // Mountains
      function buildMountain(x: number, z: number, h: number, w: number) {
        const cols = [0x4a5a3a, 0x3a4a2a, 0x5a6a4a];
        for (let my = 0; my < h; my++) {
          const r = Math.floor((h - my) * (w / h));
          for (let mx = -r; mx <= r; mx++) for (let mz = -Math.floor(r * 0.5); mz <= Math.floor(r * 0.5); mz++) if (Math.abs(mx) === r) vox(x + mx, my + 0.5, z + mz, cols[Math.floor(Math.random()*3)]);
        }
        for (let s = 0; s < 3; s++) vox(x, h - s, z, s === 0 ? 0xffffff : 0xdddddd, (3 - s) * 2, 1, (3 - s) * 2);
      }
      buildMountain(-38,-50,16,10); buildMountain(35,-55,20,13); buildMountain(-22,-58,12,8);

      // Boards & Fences
      vox(-7, 0.8, 3, 0x6b4423, 0.2, 1.6, 0.2, true); vox(-7, 1.8, 3, 0x8B6914, 1.4, 1.0, 0.15, true); vox(-7, 1.8, 3.08, 0xf0ddb0, 1.2, 0.85, 0.05);
      vox(9, 0.5, -1, 0x6b4423, 0.2, 1.0, 0.2, true); vox(9, 1.3, -1, 0x7a5c2a, 2.0, 1.3, 0.15, true);
      const leaderStoneMesh = vox(0, 0, -24.5, 0x6a6a6a, 3.2, 0.01, 0.35, true);

      // Petals
      const PETAL_COUNT = 100;
      const petalMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), new THREE.MeshLambertMaterial({ color: 0xffb7c5 }), PETAL_COUNT);
      scene.add(petalMesh);
      const petalData = Array.from({ length: PETAL_COUNT }, () => ({
        x: (Math.random() - 0.5) * 40, y: Math.random() * 14 + 2, z: (Math.random() - 0.5) * 40,
        vy: -(0.007 + Math.random() * 0.01), vx: (Math.random() - 0.5) * 0.004, vz: (Math.random() - 0.5) * 0.004,
        rx: Math.random() * Math.PI, ry: Math.random() * Math.PI, rz: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.025,
      }));
      const dummy = new THREE.Object3D();

      // Rain
      const RAIN_COUNT = 60; const rainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.55, 0.04), new THREE.MeshLambertMaterial({ color: 0xaaccee, transparent: true, opacity: 0.3 }), RAIN_COUNT);
      rainMesh.visible = false; scene.add(rainMesh);
      const rainData = Array.from({ length: RAIN_COUNT }, () => ({ x: (Math.random() - 0.5) * 60, y: Math.random() * 20 + 4, z: (Math.random() - 0.5) * 60, vy: -(0.22 + Math.random() * 0.12), vx: (Math.random() - 0.5) * 0.015 }));
      const rainDummy = new THREE.Object3D();
      let rainActive = false; let rainPhaseTimer = 0;

      // NPCs
      function buildNPC(x: number, z: number, col: string): any {
        const g = new THREE.Group();
        const nb = (px: number, py: number, pz: number, w: number, h: number, d: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(col) })); m.position.set(px, py, pz); m.castShadow = true; g.add(m); };
        nb(0, 0.28, 0, 0.55, 0.42, 0.55); nb(0, 0.65, 0, 0.40, 0.38, 0.40); nb(-0.12, 0.63, -0.22, 0.08, 0.08, 0.02); nb(0.12, 0.63, -0.22, 0.08, 0.08, 0.02);
        g.position.set(x, 0.28, z); scene.add(g); return g;
      }
      const npcStateData = [
        { mesh: buildNPC(17, -7, '#c4a8a0'), homeX: 17, homeZ: -7, angle: 0, radius: 3.5, speed: 0.007, state: 'wander', timer: 0, walkPhase: 0 },
        { mesh: buildNPC(-11, 21, '#a0c4a8'), homeX: -11, homeZ: 21, angle: 1.5, radius: 2.8, speed: 0.005, state: 'idle', timer: 2.5, walkPhase: 0 },
      ];

      // --- Interaction System (DASHBOARD LOGIC) ---
      const interactables: any[] = [
        { pos: new THREE.Vector3(-7, 0, 3), radius: 3, label: '[ E ]  Readme Link', onInteract: () => navigator.clipboard.writeText(`![My Pet](https://git-pet.vercel.app/api/card/${petState.gitData.username})`) },
        { pos: new THREE.Vector3(0, 0, -22), radius: 5, label: '[ E ]  Settings', onInteract: () => window.location.href = "/settings" },
        { pos: new THREE.Vector3(9, 0, -4), radius: 3.5, label: '[ E ]  Feed the koi', onInteract: () => { koiData.forEach(k => k.speed = 0.018); setTimeout(() => koiData.forEach(k => k.speed = 0.005), 3000); } },
        { pos: new THREE.Vector3(0, 0, 24), radius: 4, label: '[ E ]  Dashboard', onInteract: () => window.location.href = "/dashboard" },
      ];

      // ─── PLAYER & PET ───
      const playerMesh = buildSpeciesMesh(species, petState.primaryColor);
      const petMeshObj = buildSpeciesMesh(species, petState.primaryColor);
      const p = playerRef.current; const pet = petRef.current;
      pet.mesh = petMeshObj.group; pet.legs = petMeshObj.legs;

      let lastTime = performance.now();
      let elapsed = 0; let dayNightT = 0.15;

      const tick = () => {
        if (!mounted.current) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now; elapsed += delta;

        // Entry Cinematic
        if (!p.controlEnabled) {
          p.pos.z -= 0.15; p.isMoving = true;
          if (p.pos.z < 18) { p.controlEnabled = true; if (mounted.current) setCinematicDone(true); }
        } else {
          // Movement 1:1 Dashboard Parity
          const spd = p.speed * (delta * 60);
          const damping = Math.pow(0.72, delta * 60);
          let moved = false;
          if (keysRef.current["KeyW"] || keysRef.current["ArrowUp"]) { p.vel.x -= Math.sin(p.rot) * spd; p.vel.z -= Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyS"] || keysRef.current["ArrowDown"]) { p.vel.x += Math.sin(p.rot) * spd; p.vel.z += Math.cos(p.rot) * spd; moved = true; }
          if (keysRef.current["KeyA"] || keysRef.current["ArrowLeft"]) p.rot += 0.045 * (delta * 60);
          if (keysRef.current["KeyD"] || keysRef.current["ArrowRight"]) p.rot -= 0.045 * (delta * 60);
          p.isMoving = moved; p.vel.x *= damping; p.vel.z *= damping;
          p.pos.x += p.vel.x; p.pos.z += p.vel.z;
        }

        // Pet Follow
        const targetPetPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(new THREE.Vector3(2,0,2).applyAxisAngle(new THREE.Vector3(0,1,0), p.rot));
        const petV3 = new THREE.Vector3(pet.pos.x, pet.pos.y, pet.pos.z);
        petV3.lerp(targetPetPos, 0.08);
        pet.pos.x = petV3.x; pet.pos.y = petV3.y; pet.pos.z = petV3.z;
        pet.mesh.position.set(pet.pos.x, 0.5 + Math.abs(Math.sin(elapsed*4))*0.15, pet.pos.z);
        pet.mesh.lookAt(p.pos.x, 0.5, p.pos.z);

        // Update Meshes
        playerMesh.group.position.set(p.pos.x, 0.5 + Math.sin(elapsed*2.2)*0.035, p.pos.z);
        playerMesh.group.rotation.y = p.rot;
        const swing = p.isMoving ? Math.sin(elapsed * 9) * 0.35 : 0;
        playerMesh.legs.FL.rotation.x = swing; playerMesh.legs.BR.rotation.x = swing;
        playerMesh.legs.FR.rotation.x = -swing; playerMesh.legs.BL.rotation.x = -swing;

        // Interaction Proximity
        let nearest: any = null; let minD = Infinity;
        interactables.forEach(obj => {
          const d = new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos);
          if (d < obj.radius && d < minD) { minD = d; nearest = obj; }
        });
        if (mounted.current) setPromptLabel(nearest ? nearest.label : null);

        // Environment Animations
        petalData.forEach((p, i) => { p.y += p.vy; p.x += p.vx + Math.sin(elapsed*0.4+p.z)*0.002; p.z += p.vz; p.rx += p.spin; if (p.y < -0.5) { p.y = 14; p.x = (Math.random()-0.5)*40; p.z = (Math.random()-0.5)*40; } dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.updateMatrix(); petalMesh.setMatrixAt(i, dummy.matrix); }); petalMesh.instanceMatrix.needsUpdate = true;
        koiData.forEach(k => { k.angle += k.speed; k.mesh.position.set(POND_X + Math.cos(k.angle)*k.radius, 0.12, POND_Z + Math.sin(k.angle)*k.radius*0.6); k.mesh.rotation.y = -k.angle + Math.PI/2; });
        wispData.forEach((w, i) => { w.angle += w.speed; rainDummy.position.set(-18 + Math.cos(w.angle)*w.radius, w.baseY + Math.sin(elapsed*0.8 + i)*0.35, -32 + Math.sin(w.angle)*w.radius*0.75); rainDummy.rotation.set(elapsed*0.4+i, elapsed*0.25+i, 0); rainDummy.updateMatrix(); wispMesh.setMatrixAt(i, rainDummy.matrix); }); wispMesh.instanceMatrix.needsUpdate = true;
        streamMat.color.setHSL(0.55, 0.55, 0.36 + Math.sin(elapsed*1.3)*0.04);
        forestAltarMat.emissiveIntensity = 1.2 + Math.sin(elapsed*3.8)*0.45; forestAltarFlame.position.y = 1.15 + Math.sin(elapsed*4.2)*0.03;

        // Day/Night Cycle
        dayNightT = (dayNightT + delta / 75) % 1; const sunH = Math.sin(dayNightT*Math.PI*2 - Math.PI/2); const dayB = Math.max(0, Math.min(1, (sunH+0.3)/1.3));
        sun.intensity = 0.35 + dayB * 2.1; sun.position.set(Math.cos(dayNightT*Math.PI*2)*30, Math.sin(dayNightT*Math.PI*2)*40, 10);
        ambientLight.intensity = 0.1 + dayB * 0.45; hemiLight.intensity = 0.1 + dayB * 0.35;
        const skyL = 0.18 + dayB * 0.62; (scene.background as any).setHSL(0.6, 0.32, skyL); (scene.fog as any).color.setHSL(0.6, 0.22, skyL);

        // Camera Follow (Precision Alignment with Landing Page)
        const rotAxis = new THREE.Vector3(0, 1, 0);
        const camOffset = new THREE.Vector3(0, 7, 14).applyAxisAngle(rotAxis, p.rot);
        const lookOffset = new THREE.Vector3(0, 2, -4).applyAxisAngle(rotAxis, p.rot); // Look slightly ahead of player
        
        const targetCamPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(camOffset);
        const targetLookAt = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(lookOffset);

        camPos.lerp(targetCamPos, 0.065);
        camLook.lerp(targetLookAt, 0.1);
        
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        // Minimap
        if (minimapRef.current) { const mc = minimapRef.current.getContext('2d')!; mc.fillStyle = '#020617'; mc.fillRect(0,0,120,120); const mx = (p.pos.x+30)/60*112+4, mz = (p.pos.z+30)/60*112+4; mc.fillStyle = '#f0ebe0'; mc.beginPath(); mc.arc(mx, mz, 3, 0, Math.PI*2); mc.fill(); }

        renderer.render(scene, camera);
      };
      tick();

      // --- Multiplayer & Input ---
      const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
      if (host) {
        const socket = new PartySocket({ host, room: "world" }); socketRef.current = socket;
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", pet: { username: petState.gitData.username, x: p.pos.x, y: p.pos.z, species, petState } })));
        socket.addEventListener("message", (e) => { const msg = JSON.parse(e.data); if (msg.type === "snapshot") setOnlineCount(Object.keys(msg.pets).length); });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && p.isMoving) socket.send(JSON.stringify({ type: "move", x: p.pos.x, y: p.pos.z })); }, 100);
        cleanupFns.current.push(() => clearInterval(broadcast));
      }

      const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; if (e.code === "KeyE") { const near = interactables.find(obj => new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos) < obj.radius); if (near) near.onInteract(); } };
      const onKeyUp = (e: KeyboardEvent) => keysRef.current[e.code] = false;
      const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
      window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("resize", onResize);
      cleanupFns.current.push(() => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("resize", onResize); });
    };

    init();
    return () => { cancelAnimationFrame(rafRef.current); if (rendererRef.current) rendererRef.current.dispose(); cleanupFns.current.forEach(f => f()); if (socketRef.current) socketRef.current.close(); };
  }, [petState, species]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', background: '#0d0f18', overflow: 'hidden', fontFamily: 'monospace' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 40%, rgba(8,6,4,0.7) 100%)' }} />
      
      {!cinematicDone && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 91, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none', background: '#000', transition: 'opacity 2s ease' }}>
          <div style={{ fontSize: 13, color: '#ffd4a0', letterSpacing: 4, textTransform: 'uppercase' }}>Entering the Garden...</div>
        </div>
      )}

      {cinematicDone && (
        <>
          <div style={{ position: 'fixed', top: 24, left: 24, background: 'rgba(10,8,4,0.8)', padding: '12px 20px', borderRadius: 4, color: '#ffd4a0', border: '1px solid rgba(240,200,140,0.2)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: 2 }}>@{petState.gitData.username.toUpperCase()}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{onlineCount} PETS ONLINE</div>
          </div>

          <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', pointerEvents: 'none', zIndex: 10 }}>
            WASD · MOVE &nbsp;·&nbsp; A/D · TURN &nbsp;·&nbsp; E · INTERACT
          </div>

          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 20, border: '1px solid rgba(240,200,140,0.2)', borderRadius: 2 }}>
            <canvas ref={minimapRef} width={120} height={120} style={{ display: 'block', opacity: 0.8 }} />
          </div>

          {promptLabel && (
            <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,14,8,0.9)', border: '1px solid #ffd4a0', padding: '10px 24px', zIndex: 20, fontSize: 10, color: '#ffd4a0', letterSpacing: 2, textTransform: 'uppercase' }}>
              {promptLabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
