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
    pos: { x: 0, y: 0.5, z: 35 }, // Spawn behind outer gate
    rot: 0,
    vel: { x: 0, y: 0, z: 0 },
    isMoving: false,
    controlEnabled: false,
    speed: 0.09,
  });

  const petRef = useRef({
    pos: { x: 0, y: 0.5, z: 38 },
    rot: 0,
    mesh: null as any,
    legs: {} as any,
  });

  const [cinematicDone, setCinematicDone] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [promptLabel, setPromptLabel] = useState<string | null>(null);
  const [timeDisplay, setTimeDisplay] = useState('☀️ Morning');
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [hasEntered, setHasEntered] = useState(false);

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
      const colliders: { box: any, mesh: any }[] = [];
      function vox(x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, castShadow = false, receiveShadow = false, isSolid = false): any {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
        mesh.position.set(x, y, z); mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        scene.add(mesh);
        if (isSolid) {
          const box = new THREE.Box3().setFromObject(mesh);
          colliders.push({ box, mesh });
        }
        return mesh;
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
          [1, -1].forEach(s => { b(0.4 * s, 1.2, 0, 0.2, 0.3, 0.1, 0xec4899); b(0.45 * s, 1.1, 0, 0.1, 0.2, 0.1, 0xec4899); });
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

      // ─── AUDIO SYSTEM ───
      let audioInit = false;
      let audioCtx: any = null;
      let audioListener: any = null;
      let streamSound: any = null;

      function initAudio() {
        if (audioInit) return;
        audioInit = true;
        try {
          audioListener = new THREE.AudioListener();
          camera.add(audioListener);
          audioCtx = audioListener.context;

          // Stream Positional Audio (Pink Noise)
          streamSound = new THREE.PositionalAudio(audioListener);
          const bufSize = audioCtx.sampleRate * 2;
          const streamBuffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
          const sData = streamBuffer.getChannelData(0);
          let lastOut = 0;
          for (let i = 0; i < bufSize; i++) {
            const white = Math.random() * 2 - 1;
            sData[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = sData[i];
          }
          streamSound.setBuffer(streamBuffer);
          streamSound.setRefDistance(3);
          streamSound.setLoop(true);
          streamSound.setVolume(0.15); // soft
          streamSound.play();

          const soundTarget = new THREE.Object3D();
          soundTarget.position.set(9, 0, -4); // Koi pond coordinates
          scene.add(soundTarget);
          soundTarget.add(streamSound);
        } catch (e) { console.warn("Audio init failed", e); }
      }

      function playFootstep() {
        if (!audioInit || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.015, audioCtx.currentTime); // subtle
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioListener.getInput());
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
      }

      function playInteract() {
        if (!audioInit || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(900, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioListener.getInput());
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      }

      // ─── WORLD BUILDING ───
      // Ground
      const groundGeo = new THREE.PlaneGeometry(300, 300, 100, 100); groundGeo.rotateX(-Math.PI / 2);
      const groundColors: number[] = []; const groundPos = groundGeo.attributes.position;
      for (let i = 0; i < groundPos.count; i++) {
        const gx = groundPos.getX(i), gz = groundPos.getZ(i);
        const n = Math.sin(gx * 2.3) * Math.cos(gz * 1.9);
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
      pathPoints.forEach(([px, pz]) => { for (let w = -1; w <= 1; w++) vox(px + w, 0.06, pz, stoneColors[Math.floor(Math.random() * 4)], 1, 0.12, 1, false, true); });

      // Torii
      const toriiBars: any[] = [];
      function buildTorii(x: number, z: number) {
        const red = 0xcc3300, darkRed = 0x992200;
        for (let py = 0; py < 5; py++) { vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); }
        toriiBars.push(vox(x, 5.3, z, darkRed, 6, 0.45, 0.5, true, false, true)); toriiBars.push(vox(x, 4.6, z, red, 5, 0.35, 0.45, true));
        vox(x - 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35); vox(x + 1.8, 4.6, z, darkRed, 0.25, 0.8, 0.35);
      }
      buildTorii(0, -7); buildTorii(0, -18);

      // Lanterns
      const lanternMats: any[] = [];
      function buildLantern(x: number, z: number) {
        const stone = 0x888880;
        vox(x, 0.2, z, stone, 0.85, 0.45, 0.85, false, false, true); vox(x, 0.65, z, stone, 0.45, 0.6, 0.45, false, false, true); vox(x, 1.1, z, stone, 0.45, 0.55, 0.45, false, false, true);
        const lMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffcc66), emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.0 });
        const lMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), lMat); lMesh.position.set(x, 1.75, z); lMesh.castShadow = true; scene.add(lMesh);
        colliders.push({ box: new THREE.Box3().setFromObject(lMesh), mesh: lMesh });
        lanternMats.push(lMat); vox(x, 2.15, z, stone, 0.95, 0.2, 0.95);
        const pl = new THREE.PointLight(0xffaa22, 1.4, 8); pl.position.set(x, 1.8, z); scene.add(pl);
      }
      buildLantern(-2, 4); buildLantern(2, 0); buildLantern(-2, -4); buildLantern(2, -12);

      // Cherry trees
      function buildCherryTree(x: number, z: number, h: number) {
        const blossoms = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x6b3f1e, 0.7, 1, 0.7, true, false, ty < 2);
        for (let bx = -3; bx <= 3; bx++) for (let by = -1; by <= 2; by++) for (let bz = -3; bz <= 3; bz++) {
          const dist = Math.sqrt(bx * bx + by * by * 1.5 + bz * bz);
          if (dist < 3.2 && Math.random() > dist * 0.15) vox(x + bx * 0.88, h + by * 0.88, z + bz * 0.88, blossoms[Math.floor(Math.random() * 4)], 0.85, 0.85, 0.85, true);
        }
      }
      buildCherryTree(-11, -5, 6); buildCherryTree(-15, -13, 5); buildCherryTree(12, -8, 4); buildCherryTree(-9, 8, 4);

      // Pond
      const POND_X = 9, POND_Z = -4;
      for (let bx = -4; bx <= 4; bx++) for (let bz = -3; bz <= 3; bz++) if (Math.abs(bx) === 4 || Math.abs(bz) === 3) vox(POND_X + bx, 0.08, POND_Z + bz, 0x7a7a7a, 1, 0.2, 1);
      const waterGeo = new THREE.PlaneGeometry(7, 5); waterGeo.rotateX(-Math.PI / 2);
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
        const g = new THREE.Group(); scene.add(g);
        const gvox = (vx: number, vy: number, vz: number, color: number | string, w = 1, h = 1, d = 1, cs = false, rs = false) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
          m.position.set(vx, vy, vz); m.castShadow = cs; m.receiveShadow = rs; g.add(m); return m;
        };
        for (let s = 0; s < 3; s++) for (let sx = -(3 - s); sx <= (3 - s); sx++) for (let sz = -(2 - s); sz <= (2 - s); sz++) gvox(x + sx, s * 0.45, z + sz + 3, stone, 1, 0.45, 1, false, true);
        for (let wx = -3; wx <= 3; wx++) for (let wy = 0; wy < 4; wy++) for (let wz = -2; wz <= 2; wz++) {
          const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0; if (!isWall) continue;
          if (wx === 0 && wz === -2 && wy < 2) continue;
          const isWindow = Math.abs(wx) === 2 && wz === -2 && wy === 1;
          const m = gvox(x + wx, 1.4 + wy, z + wz, isWindow ? 0xffcc66 : wood, 1, 1, 1, true, false);
          if (isWindow) { (m.material as any).emissive = new THREE.Color(0xffaa22); (m.material as any).emissiveIntensity = 1.2; }
          else { colliders.push({ box: new THREE.Box3().setFromObject(m), mesh: m }); }
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry; for (let rx = -(3 + ext); rx <= (3 + ext); rx++) for (let rz = -(2 + ext); rz <= (2 + ext); rz++) {
            const isEdge = Math.abs(rx) === 3 + ext || Math.abs(rz) === 2 + ext; if (!isEdge && ry > 0) continue;
            gvox(x + rx, 5.4 + ry * 0.5, z + rz, ry === 0 ? 0x3a2f1e : roof, 1, 0.4, 1, true);
          }
        }
        gvox(x, 5.2, z - 2.5, 0x886600, 0.4, 0.6, 0.4);
        return g;
      }
      const shrineGroup = buildShrine(0, -22);

      // Forest
      function buildForestTree(x: number, z: number, h: number) {
        const lc = [0x2d4a1e, 0x1e3014, 0x3a5a28, 0x4a6a38];
        for (let ty = 0; ty < h; ty++) vox(x, ty + 0.5, z, 0x5a3a1a, 0.65, 1, 0.65, true, false, ty < 2);
        for (let fx = -2; fx <= 2; fx++) for (let fy = -1; fy <= 2; fy++) for (let fz = -2; fz <= 2; fz++) {
          const d = Math.sqrt(fx * fx + fy * fy * 1.2 + fz * fz); if (d < 2.4 && Math.random() > d * 0.18) vox(x + fx * 0.9, h + fy * 0.85, z + fz * 0.9, lc[Math.floor(Math.random() * 4)], 0.9, 0.9, 0.9);
        }
      }
      [[22, -2], [24, -9], [27, -5], [29, -14], [23, -17], [31, -9], [26, -20], [20, -12]].forEach(([x, z]) => buildForestTree(x, z, 4 + Math.floor(Math.random() * 3)));
      const forestAltarMat = new THREE.MeshLambertMaterial({ color: 0xff9944, emissive: new THREE.Color(0xff7722), emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
      const forestAltarFlame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), forestAltarMat); forestAltarFlame.position.set(26, 1.15, -24); scene.add(forestAltarFlame);
      const forestAltarLight = new THREE.PointLight(0xff9944, 0.7, 7); forestAltarLight.position.set(26, 1.5, -24); scene.add(forestAltarLight);

      // Stream
      const streamGeo = new THREE.PlaneGeometry(1.8, 13); streamGeo.rotateX(-Math.PI / 2);
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
          for (let mx = -r; mx <= r; mx++) for (let mz = -Math.floor(r * 0.5); mz <= Math.floor(r * 0.5); mz++) if (Math.abs(mx) === r) vox(x + mx, my + 0.5, z + mz, cols[Math.floor(Math.random() * 3)]);
        }
        for (let s = 0; s < 3; s++) vox(x, h - s, z, s === 0 ? 0xffffff : 0xdddddd, (3 - s) * 2, 1, (3 - s) * 2);
      }
      buildMountain(-38, -50, 16, 10); buildMountain(35, -55, 20, 13); buildMountain(-22, -58, 12, 8);

      // Boards & Fences
      vox(-7, 0.8, 3, 0x6b4423, 0.2, 1.6, 0.2, true, false, true); vox(-7, 1.8, 3, 0x8B6914, 1.4, 1.0, 0.15, true, false, true); vox(-7, 1.8, 3.08, 0xf0ddb0, 1.2, 0.85, 0.05);
      vox(9, 0.5, -1, 0x6b4423, 0.2, 1.0, 0.2, true, false, true); vox(9, 1.3, -1, 0x7a5c2a, 2.0, 1.3, 0.15, true, false, true);
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
        { pos: new THREE.Vector3(-7, 0, 3), radius: 3, label: '[ E ]  Readme Link', hint: 'a wooden board holds your legend', onInteract: () => navigator.clipboard.writeText(`![My Pet](https://git-pet.vercel.app/api/card/${petState.gitData.username})`) },
        { pos: new THREE.Vector3(0, 0, -22), radius: 5, label: '[ E ]  Settings', hint: 'this is where your work takes form', onInteract: () => { if (mounted.current) setNarrativeText('entering...'); setTimeout(() => { window.location.href = "/settings"; }, 600); } },
        { pos: new THREE.Vector3(9, 0, -4), radius: 3.5, label: '[ E ]  Feed the koi', hint: 'step closer, something recognizes you', onInteract: () => { koiData.forEach(k => k.speed = 0.018); setTimeout(() => koiData.forEach(k => k.speed = 0.005), 3000); } },
        { pos: new THREE.Vector3(0, 0, 24), radius: 4, label: '[ E ]  Dashboard', hint: 'the path leads back to your garden', onInteract: () => window.location.href = "/dashboard" }
      ];

      // ─── WORLD EXPANSION ZONES ───
      function createForestZone(offsetX: number, offsetZ: number) {
        const leafColors = [0x1a330a, 0x244214, 0x2d4a1e, 0x3a5a28];
        const woodColor = 0x5a3a1a;
        for (let i = 0; i < 40; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80;
          const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue; // Safety gap for center
          const h = 4 + Math.random() * 4;
          vox(rx, h/2, rz, woodColor, 0.7, h, 0.7, true, false, true);
          const fSize = 2.5 + Math.random() * 2;
          vox(rx, h + fSize/2, rz, leafColors[Math.floor(Math.random()*4)], fSize, fSize, fSize, true);
        }
      }

      function createDesertZone(offsetX: number, offsetZ: number) {
        const cactusColor = 0x2d5a27, rockColor = 0x8b7355;
        for (let i = 0; i < 30; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80;
          const rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          if (Math.random() > 0.4) {
             const h = 2 + Math.random() * 2.5;
             vox(rx, h/2, rz, cactusColor, 0.5, h, 0.5, true, false, true);
             if (h > 3) { vox(rx + 0.4, h*0.7, rz, cactusColor, 0.3, 0.8, 0.3); vox(rx - 0.4, h*0.5, rz, cactusColor, 0.3, 0.6, 0.3); }
          } else {
             const s = 1 + Math.random() * 3;
             vox(rx, s/2, rz, rockColor, s, s*0.6, s*0.8, true, false, true);
          }
        }
      }

      function createWaterZone(offsetX: number, offsetZ: number) {
        const pondColor = 0x2a7a9a, reedColor = 0x3a6a38;
        for (let p = 0; p < 4; p++) {
          const px = offsetX + (Math.random() - 0.5) * 60, pz = offsetZ + (Math.random() - 0.5) * 60;
          if (new THREE.Vector3(px, 0, pz).length() < 35) continue;
          const pw = 8 + Math.random() * 8, pd = 8 + Math.random() * 8;
          const pg = new THREE.PlaneGeometry(pw, pd); pg.rotateX(-Math.PI/2);
          const pm = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: pondColor, transparent: true, opacity: 0.6 }));
          pm.position.set(px, 0.05, pz); scene.add(pm);
          for (let r = 0; r < 8; r++) {
            const ra = Math.random() * Math.PI*2;
            vox(px + Math.cos(ra)*(pw/2 + 0.3), 0.8, pz + Math.sin(ra)*(pd/2 + 0.3), reedColor, 0.1, 1.6, 0.1);
          }
        }
      }

      function createMountainZone(offsetX: number, offsetZ: number) {
        const stoneCols = [0x5a5a5a, 0x6a6a6a, 0x4a4a4a];
        for (let i = 0; i < 12; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 80, rz = offsetZ + (Math.random() - 0.5) * 80;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const h = 8 + Math.random() * 12, w = 6 + Math.random() * 6;
          for (let my = 0; my < h; my += 1.5) {
            const r = (h - my) * (w / h);
            vox(rx, my + 0.75, rz, stoneCols[Math.floor(Math.random()*3)], r, 1.5, r, true, false, my < 3);
          }
          vox(rx, h + 0.3, rz, 0xffffff, w*0.4, 0.6, w*0.4);
        }
      }

      createForestZone(0, -100);   // NORTH
      createWaterZone(0, 100);    // SOUTH
      createDesertZone(100, 0);   // EAST
      createMountainZone(-100, 0); // WEST

      const playerMesh = buildSpeciesMesh(species, petState.primaryColor);
      const petMeshObj = buildSpeciesMesh(species, petState.primaryColor);
      const p = playerRef.current; const pet = petRef.current;
      pet.mesh = petMeshObj.group; pet.legs = petMeshObj.legs;

      // --- SUN / MOON / STARS ---
      const sunGeo = new THREE.SphereGeometry(4, 8, 8);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffde0 });
      const sunMesh = new THREE.Mesh(sunGeo, sunMat); scene.add(sunMesh);

      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 128; glowCanvas.height = 128;
      const gctx = glowCanvas.getContext('2d')!;
      const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,250,200,0.9)'); grad.addColorStop(0.3, 'rgba(255,220,100,0.4)'); grad.addColorStop(1, 'rgba(255,180,50,0)');
      gctx.fillStyle = grad; gctx.fillRect(0, 0, 128, 128);
      const sunGlowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
      const sunGlow = new THREE.Sprite(sunGlowMat); sunGlow.scale.set(30, 30, 1); scene.add(sunGlow);

      const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd0d8f0 })); scene.add(moonMesh);

      const STAR_COUNT = 200;
      const starGeo = new THREE.SphereGeometry(0.3, 4, 4);
      const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const starMesh = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT); scene.add(starMesh);
      const starDummy = new THREE.Object3D();
      for (let i = 0; i < STAR_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2, phi = Math.random() * Math.PI * 0.5, r = 90;
        starDummy.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        starDummy.updateMatrix(); starMesh.setMatrixAt(i, starDummy.matrix);
      }
      starMesh.instanceMatrix.needsUpdate = true;
      cleanupFns.current.push(() => {
        scene.remove(sunMesh); sunGeo.dispose(); sunMat.dispose();
        scene.remove(sunGlow); sunGlowMat.map?.dispose(); sunGlowMat.dispose();
        scene.remove(moonMesh); (moonMesh.geometry as any).dispose(); (moonMesh.material as any).dispose();
        scene.remove(starMesh); starGeo.dispose(); starMat.dispose();
      });

      // --- NEW UPDATE FUNCTIONS ---
      function updateDayNight(delta: number, elapsed: number) {
        worldTime = (worldTime + delta) % DAY_DURATION;
        const phase = getTimePhase(), angle = getSunAngle();
        const sunX = Math.cos(angle) * 80, sunY = Math.sin(angle) * 60, sunZ = -30;
        sunMesh.position.set(sunX, sunY, sunZ); sunGlow.position.set(sunX, sunY, sunZ);
        moonMesh.position.set(-sunX, -sunY * 0.8, sunZ);
        const aboveHorizon = sunY > -5; sunMesh.visible = sunGlow.visible = aboveHorizon;
        moonMesh.visible = !aboveHorizon || sunY < 10;
        sun.position.set(sunX * 0.5, Math.max(sunY * 0.5, 1), sunZ * 0.3);
        sun.intensity = Math.max(0, Math.sin(angle)) * 2.0;

        const cfg = SKY_CONFIGS[phase as keyof typeof SKY_CONFIGS];
        if (scene.background instanceof THREE.Color) scene.background.lerp(new THREE.Color(cfg.bg), 0.008);
        if (scene.fog instanceof THREE.FogExp2) scene.fog.color.lerp(new THREE.Color(cfg.fog), 0.008);

        const dayFactor = Math.max(0, Math.sin(angle));
        ambientLight.intensity = 0.15 + dayFactor * 0.45;
        hemiLight.color.setHex((phase === 'night' || phase === 'evening' || phase === 'dawn') ? 0x0a1428 : 0x87CEEB);

        const starOpacity = phase === 'night' ? 1.0 : (phase === 'dawn' || phase === 'evening' ? 0.4 : 0.0);
        starMat.opacity = THREE.MathUtils.lerp(starMat.opacity, starOpacity, 0.02);
        starMesh.visible = starMat.opacity > 0.05;

        const lanternStrength = (phase === 'night' || phase === 'evening' || phase === 'dawn') ? 1.8 : 0.9;
        lanternMats.forEach((mat: any, i: number) => { mat.emissiveIntensity = lanternStrength + Math.sin(elapsed * 1.6 + i * 1.2) * 0.3; });

        const horizonBoost = 1.0 - Math.abs(Math.sin(angle)) * 0.6;
        sunGlow.scale.setScalar(25 + horizonBoost * 20); sunGlowMat.opacity = 0.5 + horizonBoost * 0.4;
        sunMat.color.setHex(dayFactor > 0.7 ? 0xfffde0 : 0xff8830);
      }

      function triggerBattleAnimation(winnerId: string, loserId: string) {
        const isLocalWinner = winnerId === 'local';
        const winnerMesh = isLocalWinner ? playerMesh : peerMeshes.get(winnerId);
        const loserMesh = isLocalWinner ? peerMeshes.get(loserId) : playerMesh;
        if (!winnerMesh || !loserMesh) return;

        const winnerStart = winnerMesh.group.position.clone();
        const loserStart = loserMesh.group.position.clone();
        const clashPoint = winnerStart.clone().lerp(loserStart, 0.5);
        battleAnim = {
          phase: 'approach', timer: 0, winnerId, loserId, winnerMesh, loserMesh,
          winnerStartPos: winnerStart, loserStartPos: loserStart,
          winnerTargetPos: winnerStart.clone().lerp(clashPoint, 0.6),
          loserTargetPos: loserStart.clone().lerp(clashPoint, 0.6),
          flashTimer: 0
        };
        battlePlaying = true;
        setTimeout(() => { battlePlaying = false; }, 3500);
      }

      function updateBattleAnim(delta: number, elapsed: number) {
        if (!battleAnim) return;
        battleAnim.timer += delta;
        const { winnerMesh, loserMesh, phase } = battleAnim;

        if (phase === 'approach') {
          const t = Math.min(battleAnim.timer / 0.8, 1);
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          winnerMesh.group.position.lerp(battleAnim.winnerTargetPos, ease * 0.15);
          loserMesh.group.position.lerp(battleAnim.loserTargetPos, ease * 0.15);
          const w2l = loserMesh.group.position.clone().sub(winnerMesh.group.position);
          winnerMesh.group.rotation.y = Math.atan2(w2l.x, w2l.z);
          loserMesh.group.rotation.y = winnerMesh.group.rotation.y + Math.PI;
          const sw = Math.sin(elapsed * 10) * 0.35;
          winnerMesh.legs.FL.rotation.x = sw; winnerMesh.legs.BR.rotation.x = sw;
          winnerMesh.legs.FR.rotation.x = -sw; winnerMesh.legs.BL.rotation.x = -sw;
          loserMesh.legs.FL.rotation.x = sw; loserMesh.legs.BR.rotation.x = sw;
          loserMesh.legs.FR.rotation.x = -sw; loserMesh.legs.BL.rotation.x = -sw;
          if (battleAnim.timer >= 0.8) { battleAnim.phase = 'clash'; battleAnim.timer = 0; }
        } else if (phase === 'clash') {
          const shake = Math.sin(elapsed * 40) * 0.12 * Math.max(0, 1 - battleAnim.timer);
          winnerMesh.group.position.x = battleAnim.winnerTargetPos.x + shake;
          loserMesh.group.position.x = battleAnim.loserTargetPos.x - shake;
          camPos.x += (Math.random() - 0.5) * 0.08; camPos.y += (Math.random() - 0.5) * 0.04;
          if (battleAnim.timer < 0.15 && battleAnim.flashTimer === 0) {
            battleAnim.flashTimer = 1; screenFlash = 1;
            if (mounted.current) setFlashColor('rgba(255,255,255,0.6)');
          }
          if (screenFlash > 0) {
            screenFlash -= delta * 4;
            if (screenFlash <= 0) { screenFlash = 0; if (mounted.current) setFlashColor(null); }
          }
          if (battleAnim.timer >= 1.2) { battleAnim.phase = 'result'; battleAnim.timer = 0; }
        } else if (phase === 'result') {
          const jumpT = Math.min(battleAnim.timer / 0.5, 1);
          winnerMesh.group.position.y = 0.5 + Math.sin(jumpT * Math.PI) * 1.2;
          if (battleAnim.timer < 0.5) winnerMesh.group.rotation.y += delta * 6;
          if (battleAnim.timer > 0.5 && battleAnim.timer < 0.65) winnerMesh.group.position.y = 0.5 - 0.15;
          if (battleAnim.timer > 0.65) winnerMesh.group.position.y = THREE.MathUtils.lerp(winnerMesh.group.position.y, 0.5, 0.2);
          const slumpT = Math.min(battleAnim.timer / 0.8, 1);
          loserMesh.group.rotation.z = slumpT * 0.6; loserMesh.group.position.y = 0.5 - slumpT * 0.2;
          if (battleAnim.timer < 0.3) loserMesh.group.traverse((c: any) => { if (c.material?.color) c.material.color.lerp(new THREE.Color(0xff3333), 0.1); });
          if (battleAnim.timer > 1.5) {
            loserMesh.group.rotation.z = THREE.MathUtils.lerp(loserMesh.group.rotation.z, 0, 0.1);
            loserMesh.group.traverse((c: any) => { if (c.material?.color) c.material.color.lerp(new THREE.Color(0xffffff), 0.05); });
          }
          if (battleAnim.timer >= 2.0) battleAnim.phase = 'done';
        } else if (phase === 'done') {
          winnerMesh.group.position.lerp(battleAnim.winnerStartPos, 0.08);
          loserMesh.group.position.lerp(battleAnim.loserStartPos, 0.08);
          winnerMesh.group.rotation.z = THREE.MathUtils.lerp(winnerMesh.group.rotation.z, 0, 0.1);
          loserMesh.group.rotation.z = THREE.MathUtils.lerp(loserMesh.group.rotation.z, 0, 0.1);
          loserMesh.group.traverse((c: any) => { if (c.material?.color) c.material.color.set(0xffffff); });
          if (winnerMesh.group.position.distanceTo(battleAnim.winnerStartPos) < 0.05 && loserMesh.group.position.distanceTo(battleAnim.loserStartPos) < 0.05) battleAnim = null;
        }
      }

      function updateIdleAnimations(delta: number, elapsed: number) {
        if (p.isMoving) { lastMoveTime = elapsed; idleAnim = 'none'; idleAnimTimer = 0; return; }
        const timeSinceMove = elapsed - lastMoveTime;
        idleTimer -= delta;
        if (idleTimer <= 0 && idleAnim === 'none' && timeSinceMove > 1.5) {
          idleAnim = (['tailwag', 'headtilt', 'sneeze', 'sit'] as any)[Math.floor(Math.random() * 4)];
          idleAnimTimer = 0; idleTimer = (IDLE_FREQUENCY[species] || 6) + Math.random() * 4;
        }
        if (idleAnim === 'none') return;
        idleAnimTimer += delta;
        if (idleAnim === 'tailwag') {
          playerMesh.group.rotation.z = (0.4 * Math.sin(idleAnimTimer * (8 + Math.sin(idleAnimTimer * 2) * 4))) * 0.08;
          if (idleAnimTimer > 3.0) { playerMesh.group.rotation.z = THREE.MathUtils.lerp(playerMesh.group.rotation.z, 0, 0.1); if (idleAnimTimer > 3.5) idleAnim = 'none'; }
        } else if (idleAnim === 'headtilt') {
          const head = playerMesh.group.children[1];
          if (head) head.rotation.z = Math.sin(idleAnimTimer * 2.5) * 0.22;
          if (idleAnimTimer > 3.0) { if (head) head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, 0, 0.1); if (idleAnimTimer > 3.5) idleAnim = 'none'; }
        } else if (idleAnim === 'sneeze') {
          const head = playerMesh.group.children[1];
          if (idleAnimTimer < 0.8) { if (head) head.rotation.x = Math.sin(idleAnimTimer * 3) * 0.15; }
          else if (idleAnimTimer < 1.0) {
            const snapT = (idleAnimTimer - 0.8) / 0.2;
            playerMesh.group.position.z = p.pos.z - Math.sin(snapT * Math.PI) * 0.3;
            playerMesh.group.rotation.x = Math.sin(snapT * Math.PI) * 0.25;
            if (head) head.rotation.x = 0;
          } else {
            playerMesh.group.rotation.x = THREE.MathUtils.lerp(playerMesh.group.rotation.x, 0, 0.15);
            if (idleAnimTimer > 1.8) idleAnim = 'none';
          }
        } else if (idleAnim === 'sit') {
          const sitT = Math.min(idleAnimTimer / 0.5, 1);
          playerMesh.group.position.y = THREE.MathUtils.lerp(0.5, 0.3, sitT * sitT * (3 - 2 * sitT));
          playerMesh.legs.BL.rotation.x = playerMesh.legs.BR.rotation.x = sitT * 0.6;
          playerMesh.legs.FL.rotation.x = playerMesh.legs.FR.rotation.x = sitT * -0.3;
          if (idleAnimTimer > 3.5) {
            const standT = Math.min((idleAnimTimer - 3.5) / 0.5, 1);
            playerMesh.group.position.y = THREE.MathUtils.lerp(0.3, 0.5, standT * standT * (3 - 2 * standT));
            playerMesh.legs.BL.rotation.x = playerMesh.legs.BR.rotation.x = THREE.MathUtils.lerp(0.6, 0, standT);
            playerMesh.legs.FL.rotation.x = playerMesh.legs.FR.rotation.x = THREE.MathUtils.lerp(-0.3, 0, standT);
            if (idleAnimTimer > 4.5) idleAnim = 'none';
          }
        }
      }

      let lastTime = performance.now();
      let elapsed = 0;
      let lastFootstep = 0;
      let idleTime = 0;

      // --- DAY/NIGHT SYSTEM ---
      const DAY_DURATION = 600; // 10 minutes
      let worldTime = 200; // start mid-morning
      function getSunAngle() { return (worldTime / DAY_DURATION) * Math.PI * 2; }
      function getTimePhase() {
        const t = worldTime;
        if (t < 100 || t > 560) return 'night';
        if (t < 150) return 'dawn';
        if (t < 220) return 'morning';
        if (t < 340) return 'noon';
        if (t < 420) return 'afternoon';
        if (t < 470) return 'dusk';
        return 'evening';
      }
      const SKY_CONFIGS = {
        night: { bg: 0x020510, fog: 0x030714, fogD: 0.018 },
        dawn: { bg: 0x1a0a2a, fog: 0x2a1020, fogD: 0.014 },
        morning: { bg: 0xf4a460, fog: 0xe8905a, fogD: 0.008 },
        noon: { bg: 0x87CEEB, fog: 0x87CEEB, fogD: 0.006 },
        afternoon: { bg: 0x6ab0d8, fog: 0x7ab8d8, fogD: 0.007 },
        dusk: { bg: 0xff6030, fog: 0xd04020, fogD: 0.012 },
        evening: { bg: 0x1a0820, fog: 0x120618, fogD: 0.016 },
      };

      // --- BATTLE ANIMATION STATE ---
      interface BattleAnim {
        phase: 'approach' | 'clash' | 'result' | 'done';
        timer: number;
        winnerId: string; loserId: string;
        winnerMesh: { group: any, legs: any };
        loserMesh: { group: any, legs: any };
        winnerStartPos: any; loserStartPos: any;
        winnerTargetPos: any; loserTargetPos: any;
        flashTimer: number;
      }
      let battleAnim: BattleAnim | null = null;
      let battlePlaying = false;
      let screenFlash = 0;

      // --- IDLE ANIMATIONS ---
      let idleTimer = 0;
      let idleAnim: 'none' | 'tailwag' | 'headtilt' | 'sneeze' | 'sit' = 'none';
      let idleAnimTimer = 0;
      let lastMoveTime = 0;
      const IDLE_FREQUENCY: Record<string, number> = { wolf: 5, dragon: 8, sabertooth: 6, capybara: 12, axolotl: 4 };

      const peerMeshes = new Map<string, {
        group: any,
        legs: any,
        targetPos: any,
        targetRot: number
      }>();

      const tick = () => {
        if (!mounted.current) return;
        rafRef.current = requestAnimationFrame(tick);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now; elapsed += delta;

        // Day/Night Cycle
        updateDayNight(delta, elapsed);
        if (Math.floor(elapsed * 2) % 10 === 0) {
          const phase = getTimePhase();
          const icons: Record<string, string> = { night: '🌙 Night', dawn: '🌅 Dawn', morning: '☀️ Morning', noon: '☀️ Noon', afternoon: '🌤 Afternoon', dusk: '🌇 Dusk', evening: '🌆 Evening' };
          if (mounted.current) setTimeDisplay(icons[phase] || '☀️');
        }

        if (battlePlaying) { p.vel.x *= 0.5; p.vel.z *= 0.5; }
        else {
          if (!p.controlEnabled) {
            // Entry Cinematic — two-phase:
            // Phase 1 (z=35→15): black screen, player walks invisibly toward world
            // Phase 2 (z=15→-8): world visible, player walks through first torii (z=-7)
            p.pos.z -= 0.14; p.isMoving = true;
            if (p.pos.z < 15 && !cinematicDone && mounted.current) {
              setCinematicDone(true); // fade black screen — world becomes visible
            }
            if (p.pos.z < -8) { // player has crossed through the first torii
              p.controlEnabled = true;
              if (mounted.current) { setHasEntered(true); setNarrativeText('you\'re not alone here'); setTimeout(() => { setNarrativeText(null); }, 2500); }
            }
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

            // Collision Check (Strictly following Rule 4 & 5)
            const nextX = p.pos.x + p.vel.x;
            const nextZ = p.pos.z + p.vel.z;
            const nextPosition = new THREE.Vector3(nextX, 0.5, nextZ);
            const playerBox = new THREE.Box3().setFromCenterAndSize(
              nextPosition,
              new THREE.Vector3(1, 2, 1)
            );

            let blocked = false;
            for (let i = 0; i < colliders.length; i++) {
              if (playerBox.intersectsBox(colliders[i].box)) {
                blocked = true;
                break;
              }
            }

            if (!blocked) {
              p.pos.x = nextX;
              p.pos.z = nextZ;
            } else {
              p.vel.x = 0;
              p.vel.z = 0;
            }

            if (moved && elapsed - lastFootstep > 0.32) {
              lastFootstep = elapsed;
              playFootstep();
            }
            // Track idle time
            if (p.isMoving) { idleTime = 0; } else { idleTime += delta; }
          }
        }

        updateBattleAnim(delta, elapsed);
        updateIdleAnimations(delta, elapsed);

        // --- RESTORED CORE LOGIC ---
        // Pet Follow
        const targetPetPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(new THREE.Vector3(2, 0, 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot));
        const petV3 = new THREE.Vector3(pet.pos.x, pet.pos.y, pet.pos.z);
        petV3.lerp(targetPetPos, 0.08);
        pet.pos.x = petV3.x; pet.pos.y = petV3.y; pet.pos.z = petV3.z;
        pet.mesh.position.set(pet.pos.x, 0.5 + Math.abs(Math.sin(elapsed * 4)) * 0.15, pet.pos.z);
        pet.mesh.lookAt(p.pos.x, 0.5, p.pos.z);

        // Update Meshes
        playerMesh.group.position.set(p.pos.x, 0.5 + Math.sin(elapsed * 2.2) * 0.035, p.pos.z);
        playerMesh.group.rotation.y = p.rot;
        if (!battleAnim) {
          const swing = p.isMoving ? Math.sin(elapsed * 9) * 0.35 : 0;
          playerMesh.legs.FL.rotation.x = swing; playerMesh.legs.BR.rotation.x = swing;
          playerMesh.legs.FR.rotation.x = -swing; playerMesh.legs.BL.rotation.x = -swing;
        }

        // Interaction Proximity
        let nearest: any = null; let minD = Infinity;
        interactables.forEach(obj => {
          const d = new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos);
          if (d < obj.radius && d < minD) { minD = d; nearest = obj; }
        });
        peerMeshes.forEach((peer, id) => {
          const d = Math.sqrt(Math.pow(p.pos.x - peer.group.position.x, 2) + Math.pow(p.pos.z - peer.group.position.z, 2));
          if (d < 4 && d < minD) {
            minD = d;
            nearest = {
              label: `[ E ]  Interact with @${id}`,
              onInteract: () => {
                playInteract();
                const isWin = Math.random() > 0.5;
                triggerBattleAnimation(isWin ? 'local' : id, isWin ? id : 'local');
              }
            };
          }
        });
        if (mounted.current) setPromptLabel(nearest ? nearest.label : null);

        // Narrative hint
        let closestHint = null;
        let closestDist = Infinity;
        for (const obj of interactables) {
          const dist = new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos);
          if (dist < obj.radius && dist < closestDist) {
            closestDist = dist;
            closestHint = obj.hint ?? null;
          }
        }
        // Shrine close-range secondary text
        const shrineInteractable = interactables.find(i => i.label === '[ E ]  Settings');
        if (shrineInteractable) {
          const shrineDist = new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(shrineInteractable.pos);
          if (shrineDist < shrineInteractable.radius * 0.5) {
            closestHint = 'step forward when ready';
          }
        }
        if (mounted.current) setNarrativeText(closestHint);

        // Shrine scale pulse
        if (shrineGroup && shrineInteractable) {
          const shrineDist = new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(shrineInteractable.pos);
          if (shrineDist < shrineInteractable.radius) {
            const pulse = 1 + Math.sin(elapsed * 2) * 0.03;
            shrineGroup.scale.set(pulse, pulse, pulse);
          } else {
            shrineGroup.scale.set(1, 1, 1);
          }
        }

        // Nearby peer presence text
        if (hasEntered) {
          let nearbyPet = false;
          peerMeshes.forEach((peer) => {
            const d = Math.sqrt(Math.pow(p.pos.x - peer.group.position.x, 2) + Math.pow(p.pos.z - peer.group.position.z, 2));
            if (d < 4) nearbyPet = true;
          });
          if (!narrativeText && nearbyPet) {
            setNarrativeText('others are here too');
            setTimeout(() => { setNarrativeText(null); }, 2000);
          }
        }

        // Idle presence text
        if (hasEntered && !narrativeText && idleTime > 3) {
          idleTime = 0;
          setNarrativeText('take your time');
          setTimeout(() => { setNarrativeText(null); }, 2000);
        }

        // Edge return hint
        const distFromCenter = Math.sqrt(p.pos.x * p.pos.x + p.pos.z * p.pos.z);
        if (hasEntered && !narrativeText && distFromCenter > 20) {
          setNarrativeText('you can always go back');
          setTimeout(() => { setNarrativeText(null); }, 2000);
        }

        // Environment Animations
        petalData.forEach((p, i) => { p.y += p.vy; p.x += p.vx + Math.sin(elapsed * 0.4 + p.z) * 0.002; p.z += p.vz; p.rx += p.spin; if (p.y < -0.5) { p.y = 14; p.x = (Math.random() - 0.5) * 40; p.z = (Math.random() - 0.5) * 40; } dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rz); dummy.updateMatrix(); petalMesh.setMatrixAt(i, dummy.matrix); }); petalMesh.instanceMatrix.needsUpdate = true;
        koiData.forEach(k => { k.angle += k.speed; k.mesh.position.set(POND_X + Math.cos(k.angle) * k.radius, 0.12, POND_Z + Math.sin(k.angle) * k.radius * 0.6); k.mesh.rotation.y = -k.angle + Math.PI / 2; });
        wispData.forEach((w, i) => { w.angle += w.speed; rainDummy.position.set(-18 + Math.cos(w.angle) * w.radius, w.baseY + Math.sin(elapsed * 0.8 + i) * 0.35, -32 + Math.sin(w.angle) * w.radius * 0.75); rainDummy.rotation.set(elapsed * 0.4 + i, elapsed * 0.25 + i, 0); rainDummy.updateMatrix(); wispMesh.setMatrixAt(i, rainDummy.matrix); }); wispMesh.instanceMatrix.needsUpdate = true;
        streamMat.color.setHSL(0.55, 0.55, 0.36 + Math.sin(elapsed * 1.3) * 0.04);
        forestAltarMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 3.8) * 0.45; forestAltarFlame.position.y = 1.15 + Math.sin(elapsed * 4.2) * 0.03;

        // NPCs with Idle
        npcStateData.forEach((npc, i) => {
          if (npc.state === 'wander') { npc.angle += npc.speed; npc.mesh.position.set(npc.homeX + Math.cos(npc.angle) * npc.radius, 0.28, npc.homeZ + Math.sin(npc.angle) * npc.radius); npc.mesh.lookAt(npc.homeX + Math.cos(npc.angle + 0.1) * npc.radius, 0.28, npc.homeZ + Math.sin(npc.angle + 0.1) * npc.radius); }
          else {
            if (npc.timer > 2.5 && npc.timer < 3.0) npc.mesh.rotation.z = Math.sin(elapsed * 2 + i * 1.4) * 0.06;
            else npc.mesh.rotation.z = THREE.MathUtils.lerp(npc.mesh.rotation.z, 0, 0.1);
          }
        });

        // --- PEER INTERPOLATION ---
        peerMeshes.forEach((peer) => {
          // Smooth position interpolation (Strictly following Rule 3)
          peer.group.position.lerp(peer.targetPos, 0.12);

          // Smooth rotation interpolation
          const rotDiff = peer.targetRot - peer.group.rotation.y;
          let adjustedRotDiff = rotDiff;
          if (rotDiff > Math.PI) adjustedRotDiff = rotDiff - (Math.PI * 2);
          else if (rotDiff < -Math.PI) adjustedRotDiff = rotDiff + (Math.PI * 2);

          peer.group.rotation.y += adjustedRotDiff * 0.12;

          // Simple walk animation for peers if moving
          const isMoving = peer.group.position.distanceTo(peer.targetPos) > 0.01;
          const swing = isMoving ? Math.sin(elapsed * 9) * 0.35 : 0;
          peer.legs.FL.rotation.x = swing; peer.legs.BR.rotation.x = swing;
          peer.legs.FR.rotation.x = -swing; peer.legs.BL.rotation.x = -swing;
        });

        // Camera Follow (Precision Alignment with Landing Page)
        const rotAxis = new THREE.Vector3(0, 1, 0);
        if (!p.controlEnabled) {
          // Cinematic: lock camera tight and low directly behind player
          const entryCamOffset = new THREE.Vector3(0, 2.5, 6);
          const entryCamPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(entryCamOffset);
          camPos.copy(entryCamPos);
          camLook.set(p.pos.x, 1.2, p.pos.z - 4);
        } else {
          const camOffset = new THREE.Vector3(0, 7, 14).applyAxisAngle(rotAxis, p.rot);
          const lookOffset = new THREE.Vector3(0, 2, -4).applyAxisAngle(rotAxis, p.rot);
          const targetCamPos = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(camOffset);
          const targetLookAt = new THREE.Vector3(p.pos.x, 0.5, p.pos.z).add(lookOffset);
          camPos.lerp(targetCamPos, 0.065);
          camLook.lerp(targetLookAt, 0.1);
        }
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        // Minimap
        if (minimapRef.current) { const mc = minimapRef.current.getContext('2d')!; mc.fillStyle = '#020617'; mc.fillRect(0, 0, 120, 120); const mx = (p.pos.x + 30) / 60 * 112 + 4, mz = (p.pos.z + 30) / 60 * 112 + 4; mc.fillStyle = '#f0ebe0'; mc.beginPath(); mc.arc(mx, mz, 3, 0, Math.PI * 2); mc.fill(); }

        renderer.render(scene, camera);
      };
      tick();

      // --- Multiplayer & Input ---
      const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
      if (host) {
        const socket = new PartySocket({ host, room: "world" }); socketRef.current = socket;
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", pet: { username: petState.gitData.username, x: p.pos.x, y: p.pos.z, species, petState } })));
        socket.addEventListener("message", (e) => {
          const msg = JSON.parse(e.data);

          if (msg.type === "snapshot") {
            setOnlineCount(Object.keys(msg.pets).length);
            Object.entries(msg.pets).forEach(([username, petData]: [string, any]) => {
              if (username === petState.gitData.username) return;
              if (!peerMeshes.has(username)) {
                const mesh = buildSpeciesMesh(petData.species, petData.petState?.primaryColor || '#ffffff');
                const targetPos = new THREE.Vector3(petData.x ?? 0, 0.5, petData.y ?? 0);
                mesh.group.position.copy(targetPos);
                peerMeshes.set(username, { ...mesh, targetPos, targetRot: 0 });
              }
            });
          } else if (msg.type === "pet_update" || msg.type === "move") {
            const petData = msg.pet || msg;
            const username = petData.username || msg.id;
            if (username === petState.gitData.username) return;

            let peer = peerMeshes.get(username);
            if (!peer && petData.species) {
              const mesh = buildSpeciesMesh(petData.species, petData.petState?.primaryColor || '#ffffff');
              const targetPos = new THREE.Vector3(petData.x ?? 0, 0.5, petData.y ?? 0);
              mesh.group.position.copy(targetPos);
              peer = { ...mesh, targetPos, targetRot: 0 };
              peerMeshes.set(username, peer);
            }

            if (peer) {
              if (petData.x !== undefined && petData.y !== undefined) {
                peer.targetPos.set(petData.x, 0.5, petData.y);
              }
              if (petData.rot !== undefined) {
                peer.targetRot = petData.rot;
              }
            }
            setOnlineCount(peerMeshes.size + 1);
          } else if (msg.type === "pet_left" || msg.type === "leave") {
            const username = msg.username || msg.id;
            const peer = peerMeshes.get(username);
            if (peer) {
              scene.remove(peer.group);
              peer.group.traverse((c: any) => {
                if (c.geometry) c.geometry.dispose();
                if (c.material) {
                  if (Array.isArray(c.material)) c.material.forEach((m: any) => m.dispose());
                  else c.material.dispose();
                }
              });
              peerMeshes.delete(username);
            }
            setOnlineCount(peerMeshes.size + 1);
          }
        });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && p.isMoving) socket.send(JSON.stringify({ type: "move", x: p.pos.x, y: p.pos.z, rot: p.rot })); }, 100);
        cleanupFns.current.push(() => clearInterval(broadcast));
      }

      const onKeyDown = (e: KeyboardEvent) => {
        initAudio();
        keysRef.current[e.code] = true;
        if (e.code === "KeyE") {
          const near = interactables.find(obj => new THREE.Vector3(p.pos.x, 0, p.pos.z).distanceTo(obj.pos) < obj.radius);
          if (near) { playInteract(); near.onInteract(); }
        }
      };
      const onKeyUp = (e: KeyboardEvent) => keysRef.current[e.code] = false;
      const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
      window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("resize", onResize);
      cleanupFns.current.push(() => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("resize", onResize); });
    };

    init();
    return () => {
      cancelAnimationFrame(rafRef.current); if (rendererRef.current) rendererRef.current.dispose(); cleanupFns.current.forEach(f => f()); if (socketRef.current) socketRef.current.close();
    };
  }, [petState, species]);

  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', background: '#0d0f18', overflow: 'hidden', fontFamily: 'monospace' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 40%, rgba(8,6,4,0.7) 100%)' }} />

      {(!cinematicDone || !isHydrated) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 91, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none', background: '#000', transition: 'opacity 2s ease' }}>
          <div style={{ fontSize: 13, color: '#ffd4a0', letterSpacing: 4, textTransform: 'uppercase' }}>Entering the Garden...</div>
        </div>
      )}

      {cinematicDone && (
        <>
          {/* Screen flash for battle clash */}
          {flashColor && (
            <div style={{
              position: 'fixed', inset: 0, background: flashColor, pointerEvents: 'none', zIndex: 45, transition: 'opacity 0.1s',
            }} />
          )}

          <div style={{ position: 'fixed', top: 24, left: 24, background: 'rgba(10,8,4,0.8)', padding: '12px 20px', borderRadius: 4, color: '#ffd4a0', border: '1px solid rgba(240,200,140,0.2)', backdropFilter: 'blur(10px)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: 2 }}>@{petState.gitData.username.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{onlineCount} PETS ONLINE</div>
              <div style={{ fontSize: 9, color: 'rgba(240,235,224,0.45)', letterSpacing: 1 }}>{timeDisplay}</div>
            </div>
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

          {narrativeText && (
            <div
              style={{
                position: 'fixed',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: '#f0ebe0',
                fontSize: '12px',
                letterSpacing: '1px',
                opacity: 0.8,
                pointerEvents: 'none',
                transition: 'opacity 0.3s ease',
              }}
            >
              {narrativeText}
            </div>
          )}
        </>
      )}
    </div>
  );
}
