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
      scene.fog = new THREE.Fog(0xf5e6d3, 50, 200);
      scene.background = new THREE.Color(0xf5e6d3);

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
      const swayables: any[] = [];
      const worldDecor = new THREE.Group();
      scene.add(worldDecor);

      const fallingPetals: any[] = [];
      let pondMesh: any = null;
      let shrineBellHitbox: any = null;
      let shrineBellMesh: any = null;
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
        for (let i = 0; i < count; i++) {
          const t = i / count;
          const x = startX + (endX - startX) * t;
          const z = startZ + (endZ - startZ) * t;
          const y = getGroundHeight(x, z);
          const pathPiece = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 0.06, 0.7),
            new THREE.MeshLambertMaterial({ color: 0xFFF5E4 })
          );
          pathPiece.position.set(x + (Math.random()-0.5)*0.5, y + 0.03, z + (Math.random()-0.5)*0.5);
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

      const instancedTreeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 5), new THREE.MeshLambertMaterial({ color: 0x5a3a1a }), 400);
      let treeTrunkIndex = 0;

      const instancedTreeCanopies = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2, 0), new THREE.MeshLambertMaterial({ color: 0x3a5a28 }), 800);
      let treeCanopyIndex = 0;

      const instancedCacti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1, 0.3), new THREE.MeshLambertMaterial({ color: 0x2d5a27 }), 200);
      let cactusIndex = 0;

      worldDecor.add(instancedRocks, instancedBushes, instancedGrass, instancedTreeTrunks, instancedTreeCanopies, instancedCacti);

      const matrix = new THREE.Matrix4();
      
      function addInstancedRock(x: number, y: number, z: number, scale: number) {
        if (rockIndex >= 600) return;
        matrix.compose(new THREE.Vector3(x, y + scale*0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale, scale, scale));
        instancedRocks.setMatrixAt(rockIndex, matrix);
        instancedRocks.setColorAt(rockIndex, new THREE.Color(0x888888).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
        rockIndex++;
      }

      function addInstancedBush(x: number, y: number, z: number, scale: number) {
        if (bushIndex >= 600) return;
        matrix.compose(new THREE.Vector3(x, y + scale*0.5, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedBushes.setMatrixAt(bushIndex, matrix);
        instancedBushes.setColorAt(bushIndex, new THREE.Color(0x4B7B31).offsetHSL((Math.random() - 0.5) * 0.05, 0, 0));
        bushIndex++;
      }

      function addInstancedGrass(x: number, y: number, z: number, scale: number) {
        if (grassIndex >= 1200) return;
        matrix.compose(new THREE.Vector3(x, y + scale*0.3, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedGrass.setMatrixAt(grassIndex, matrix);
        instancedGrass.setColorAt(grassIndex, new THREE.Color(0x7BAF5A).offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05));
        grassIndex++;
      }

      function addInstancedTree(x: number, y: number, z: number, scale: number) {
        if (treeTrunkIndex >= 400 || treeCanopyIndex >= 798) return;
        matrix.compose(new THREE.Vector3(x, y + 1 * scale, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
        instancedTreeTrunks.setMatrixAt(treeTrunkIndex++, matrix);
        
        matrix.compose(new THREE.Vector3(x, y + 2.5 * scale, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale, scale, scale));
        instancedTreeCanopies.setMatrixAt(treeCanopyIndex++, matrix);
        if (Math.random() > 0.5) {
          matrix.compose(new THREE.Vector3(x + (Math.random()-0.5)*scale, y + 3.5 * scale, z + (Math.random()-0.5)*scale), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(scale*0.8, scale*0.8, scale*0.8));
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
        const red = 0xcc3300;
        for (let py = 0; py < 5; py++) { vox(x - 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); vox(x + 1.8, py + 0.5, z, red, 1, 1, 0.35, true, false, true); }
        vox(x, 5.3, z, 0x992200, 6, 0.45, 0.5, true, false, true); vox(x, 4.6, z, red, 5, 0.35, 0.45, true);
      }
      buildTorii(0, -7); buildTorii(0, -18);

      function buildStoneLantern(x: number, z: number) {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshLambertMaterial({ color: 0x808080 }));
        base.position.y = 0.15;
        g.add(base);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), new THREE.MeshLambertMaterial({ color: 0xFFF5E4 }));
        body.position.y = 0.55;
        g.add(body);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), new THREE.MeshLambertMaterial({ color: 0x404040 }));
        cap.position.y = 0.875;
        g.add(cap);

        const light = new THREE.PointLight(0xFFD580, 0.4, 4);
        light.position.y = 0.55;
        g.add(light);
        
        worldDecor.add(g);
        colliders.push({ box: new THREE.Box3().setFromObject(g), mesh: g });
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
      buildCherryTree(-11, -5, 6); buildCherryTree(-15, -13, 5); buildCherryTree(12, -8, 4); buildCherryTree(-9, 8, 4);

      const POND_X = 9, POND_Z = -4;
      const pondGeo = new THREE.CylinderGeometry(4, 4, 0.1, 16);
      const pondMat = new THREE.MeshLambertMaterial({ color: 0xA8D8EA, transparent: true, opacity: 0.9 });
      pondMesh = new THREE.Mesh(pondGeo, pondMat);
      pondMesh.position.set(POND_X, 0.05, POND_Z);
      worldDecor.add(pondMesh);

      for (let i=0; i<6; i++) {
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

      function seededRandom(seed: number) {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      }

      // ─── DECORATIVE FACTORY FUNCTIONS ───
      function createMushroom(x: number, z: number, seed: number) {
        const h = 0.4 + seededRandom(seed)*0.3;
        vox(x, h/2, z, 0xdcdcdc, 0.2, h, 0.2, false, false, false);
        const top = vox(x, h+0.1, z, 0xcc3333, 0.6, 0.2, 0.6, true, false, false);
        swayables.push({ mesh: top, speed: 1.2, offset: seed });
      }

      function createLilyPad(x: number, z: number, seed: number) {
        const s = 0.5 + seededRandom(seed)*0.5;
        const pad = vox(x, 0.12, z, 0x3d7a4d, s, 0.05, s, false, true, false);
        swayables.push({ mesh: pad, speed: 0.5, offset: seed });
      }

      function createIceSpire(x: number, z: number, seed: number) {
        const h = 2 + seededRandom(seed)*4;
        const mat = new THREE.MeshStandardMaterial({ color: 0xaeeeee, emissive: 0x2244aa, emissiveIntensity: 0.2, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(h/3, h, 4), mat);
        mesh.position.set(x, h/2, z);
        scene.add(mesh);
        colliders.push({ box: new THREE.Box3().setFromObject(mesh), mesh });
      }

      function createRuins(x: number, z: number, seed: number) {
        const height = 1 + seededRandom(seed)*2;
        vox(x, height/2, z, 0xd2b48c, 1.5, height, 0.5, true, true, true);
        vox(x+1, height/4, z, 0xd2b48c, 0.5, height/2, 0.5, true, true, true);
      }

      function createForestZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 90; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedTree(rx, gy, rz, 0.8 + Math.random()*0.5);
        }
        for (let i = 0; i < 150; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedBush(rx, gy, rz, 0.5 + Math.random()*1.0);
        }
        for (let i = 0; i < 80; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedRock(rx, gy, rz, 0.3 + Math.random()*0.5);
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
          colliders.push({ box: new THREE.Box3().setFromObject(top), mesh: top })
        }
        worldDecor.add(bale)
        colliders.push({ box: new THREE.Box3().setFromObject(bale), mesh: bale })
      }

      function createFenceSection(x: number, z: number, angle = 0) {
        const g = new THREE.Group()
        const base = getGroundHeight(x, z);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C })
        const railMat = new THREE.MeshStandardMaterial({ color: 0xA0724A })
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.15,1.0,0.15), postMat)
        p1.position.set(-1, 0.5, 0)
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.15,1.0,0.15), postMat)
        p2.position.set(1, 0.5, 0)
        const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.1,0.1), railMat)
        r1.position.set(0, 0.7, 0)
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.1,0.1), railMat)
        r2.position.set(0, 0.35, 0)
        g.add(p1,p2,r1,r2)
        g.position.set(x, base, z)
        g.rotation.y = angle
        worldDecor.add(g)
        colliders.push({ box: new THREE.Box3().setFromObject(p1), mesh: p1 });
        colliders.push({ box: new THREE.Box3().setFromObject(p2), mesh: p2 });
      }

      function createSunflower(x: number, z: number) {
        const g = new THREE.Group()
        const base = getGroundHeight(x, z);
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.1,1.4,0.1), new THREE.MeshStandardMaterial({color:0x7BAF5A}))
        stem.position.y = 0.7
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.1,0.5), new THREE.MeshStandardMaterial({color:0xFFD580}))
        head.position.y = 1.5
        const petalGeo = new THREE.BoxGeometry(0.15,0.08,0.4)
        const petalMat = new THREE.MeshStandardMaterial({color:0xEF9F27})
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(petalGeo, petalMat)
          p.rotation.y = (i / 4) * Math.PI * 2
          p.position.set(Math.sin(p.rotation.y)*0.3, 1.5, Math.cos(p.rotation.y)*0.3)
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

        let fenceAngle = Math.random() * Math.PI;
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
          addInstancedRock(rx, gy, rz, 0.2 + Math.random()*0.4);
          if (Math.random() > 0.7) addInstancedCactus(rx + 2, gy, rz + 1, 0.8 + Math.random() * 1.5);
        }
      }

      function createPineTree(x: number, z: number) {
        const group = new THREE.Group()
        const base = getGroundHeight(x, z);
        const brown = 0x8B5E3C
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.8,0.2), new THREE.MeshStandardMaterial({color:brown}))
        trunk.position.y = 0.4
        const t1 = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.5,1.2), new THREE.MeshStandardMaterial({color:0x3B6D11}))
        t1.position.y = 1.1
        const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.5,0.9), new THREE.MeshStandardMaterial({color:0x4A8A1A}))
        t2.position.y = 1.6
        const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.4,0.5), new THREE.MeshStandardMaterial({color:0x5AA020}))
        t3.position.y = 2.05
        group.add(trunk, t1, t2, t3)
        group.position.set(x, base, z)
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
            const m = new THREE.Mesh(new THREE.BoxGeometry(r*2, 1.5*0.45, r*2), new THREE.MeshLambertMaterial({ color: 0xF0EEF8, emissive: 0xE8E4F0, emissiveIntensity: 0.04 }));
            m.position.set(rx, base + my + 0.75*0.45, rz);
            if (my < 3 * 0.45) colliders.push({ box: new THREE.Box3().setFromObject(m), mesh: m });
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
          addInstancedRock(rx, gy, rz, 1.0 + Math.random()*1.5);
        }
      }

      function createPlainsZone(offsetX: number, offsetZ: number) {
        for (let i = 0; i < 400; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedGrass(rx, gy, rz, 0.8 + Math.random()*1.2);
        }
        for (let i = 0; i < 30; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedBush(rx, gy, rz, 0.3 + Math.random()*0.4);
        }
        for (let i = 0; i < 5; i++) {
          const rx = offsetX + (Math.random() - 0.5) * 120; const rz = offsetZ + (Math.random() - 0.5) * 120;
          if (new THREE.Vector3(rx, 0, rz).length() < 35) continue;
          const gy = getGroundHeight(rx, rz);
          addInstancedTree(rx, gy, rz, 0.8 + Math.random()*0.5);
        }
      }

      createForestZone(-150, 0); 
      createDesertZone(150, 0); 
      createMountainZone(0, -150);
      createPlainsZone(0, 150);

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

      for(let i=0; i<8; i++) {
        createLilyPad(POND_X + (Math.random()-0.5)*5, POND_Z + (Math.random()-0.5)*4, i);
      }

      const ambientParticles: any[] = [];
      const snowParticles: any[] = [];
      for(let i=0; i<40; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xA8D8EA, transparent: true, opacity: 0.6 }));
        const ox = (Math.random()-0.5)*30;
        const oy = 0.4 + Math.random()*2.1;
        const oz = (Math.random()-0.5)*30;
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
      const fireflyData: any[] = [];

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

        const timeCycle = Math.sin(elapsed * 0.05); // Slow cycle
        const skyDay = new THREE.Color(0xf5e6d3);
        const skyNight = new THREE.Color(0x0a1128);
        scene.background.copy(skyDay).lerp(skyNight, (timeCycle + 1) / 2);
        sunLink.intensity = 2.4 - ((timeCycle + 1) / 2) * 2.0;

        const positions = fireflies.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < fireflyCount; i++) {
          const data = fireflyData[i];
          positions[i * 3 + 1] = data.y + Math.sin(elapsed * 0.3 + data.offset) * 0.5;
          positions[i * 3] = data.x + Math.sin(elapsed * 0.1 + data.offset) * 0.2;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;

        fallingPetals.forEach(({ mesh, offset }, i) => {
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

        const pBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.pos.x, 1, p.pos.z), new THREE.Vector3(2, 2, 2));
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
          } else if (msg.type === "pet_left") {
            const uid = msg.username || msg.id;
            const peer = remotePlayersRef.current[uid]; 
            if (peer) { 
              scene.remove(peer.bb.group); 
              delete remotePlayersRef.current[uid]; 
            }
          }
          setOnlineCount(Object.keys(remotePlayersRef.current).length + 1);
        });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && p.isMoving) socket.send(JSON.stringify({ type: "move", x: p.pos.x, y: p.pos.z, rot: p.rot, petType: localSpecies })); }, 100);
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
