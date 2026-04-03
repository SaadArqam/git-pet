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
  const rafRef = useRef<number>(0);
  const mounted = useRef(true);
  const rendererRef = useRef<any>(null);
  const cleanupFns = useRef<(() => void)[]>([]);
  const socketRef = useRef<PartySocket | null>(null);

  // Movement & State Refs (Using plain objects initially since THREE is loaded via CDN)
  const keysRef = useRef<Record<string, boolean>>({});
  const playerRef = useRef({
    pos: { x: 0, y: 0.5, z: 35 },
    rot: 0,
    vel: { x: 0, y: 0, z: 0 },
    isMoving: false,
    controlEnabled: false,
  });

  const petRef = useRef({
    pos: { x: 0, y: 0.5, z: 38 },
    rot: 0,
    mesh: null as any,
    legs: {} as any,
  });

  const [cinematicDone, setCinematicDone] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  // Main Three.js + Socket Logic
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
      if (!mounted.current) return;

      const THREE = (window as any).THREE;
      if (!THREE) return;

      // Wrap vectors in real THREE classes
      const p = {
        pos: new THREE.Vector3(0, 0.5, 35),
        vel: new THREE.Vector3(0, 0, 0),
        rot: 0,
        isMoving: false,
        controlEnabled: false
      };
      // Keep ref updated
      const syncRef = () => {
        playerRef.current.pos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
        playerRef.current.vel = { x: p.vel.x, y: p.vel.y, z: p.vel.z };
        playerRef.current.rot = p.rot;
        playerRef.current.isMoving = p.isMoving;
        playerRef.current.controlEnabled = p.controlEnabled;
      };

      const pet = {
        pos: new THREE.Vector3(0, 0.5, 38),
        mesh: null as any,
        legs: {} as any
      };

      // --- Setup ---
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current, antialias: true, alpha: false,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617);
      scene.fog = new THREE.FogExp2(0x020617, 0.02);

      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
      const camPos = new THREE.Vector3(0, 15, 60);
      const camLook = new THREE.Vector3(0, 0, 0);

      // --- Lighting ---
      const sun = new THREE.DirectionalLight(0xffffff, 2.0);
      sun.position.set(20, 50, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      scene.add(sun);

      const ambient = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambient);

      // --- Helpers ---
      const vox = (x: number, y: number, z: number, color: number | string, w = 1, h = 1, d = 1, cast = true) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
        );
        mesh.position.set(x, y, z);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        scene.add(mesh);
        return mesh;
      };

      const buildSpeciesMesh = (sp: string, color: string) => {
        const g = new THREE.Group();
        const dark = new THREE.Color(color).multiplyScalar(0.6).getHex();
        const b = (x: number, y: number, z: number, w: number, h: number, d: number, c: any) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
          m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
        };
        const legs: any = {};
        // Body
        b(0, 0.5, 0, 0.8, 0.6, 0.8, color);
        b(0, 1.1, -0.1, 0.6, 0.5, 0.6, color);
        b(-0.15, 1.2, -0.4, 0.1, 0.1, 0.05, 0x000000);
        b(0.15, 1.2, -0.4, 0.1, 0.1, 0.05, 0x000000);
        
        // Features
        if (sp === 'axolotl') {
           [1, -1].forEach(s => {
             b(0.4*s, 1.2, 0, 0.2, 0.3, 0.1, 0xec4899);
             b(0.45*s, 1.1, 0, 0.1, 0.2, 0.1, 0xec4899);
           });
        } else if (sp === 'dragon') {
           b(0, 1.5, 0.1, 0.1, 0.4, 0.1, dark);
           b(-0.3, 0.8, 0.3, 0.4, 0.1, 0.4, dark);
           b(0.3, 0.8, 0.3, 0.4, 0.1, 0.4, dark);
        } else if (sp === 'wolf') {
           b(-0.25, 1.5, 0.1, 0.15, 0.3, 0.1, dark);
           b(0.25, 1.5, 0.1, 0.15, 0.3, 0.1, dark);
        } else if (sp === 'sabertooth') {
           b(-0.15, 0.8, -0.42, 0.08, 0.4, 0.08, 0xffffff);
           b(0.15, 0.8, -0.42, 0.08, 0.4, 0.08, 0xffffff);
        } else if (sp === 'capybara') {
           b(0, 0.4, 0.6, 0.2, 0.2, 0.2, dark);
        }

        legs.FL = b(-0.25, 0.15, -0.25, 0.2, 0.3, 0.2, dark);
        legs.FR = b(0.25, 0.15, -0.25, 0.2, 0.3, 0.2, dark);
        legs.BL = b(-0.25, 0.15, 0.25, 0.2, 0.3, 0.2, dark);
        legs.BR = b(0.25, 0.15, 0.25, 0.2, 0.3, 0.2, dark);
        scene.add(g);
        return { group: g, legs };
      };

      const createLabel = (text: string) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 256; canvas.height = 64;
        ctx.fillStyle = 'rgba(20, 14, 8, 0.9)';
        ctx.beginPath();
        ctx.roundRect(0, 0, 256, 64, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 200, 140, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffd4a0';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 40);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        sprite.scale.set(3, 0.75, 1);
        sprite.visible = false;
        scene.add(sprite);
        return sprite;
      };

      // --- Interaction System ---
      const interactables: any[] = [];
      const addInteractable = (x: number, z: number, color: number, label: string, onInteract: () => void) => {
        const group = new THREE.Group();
        const base = vox(0, 0.4, 0, color, 1.2, 0.8, 1.2);
        group.add(base);
        group.add(vox(0, 1.0, 0, 0xffffff, 0.5, 0.5, 0.5));
        group.position.set(x, 0, z);
        scene.add(group);
        const sprite = createLabel(label);
        const pos = new THREE.Vector3(x, 0, z);
        interactables.push({ mesh: group, label, radius: 4, onInteract, sprite, pos });
      };

      // --- Content ---
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(300,300), new THREE.MeshLambertMaterial({ color: 0x010409 })).rotateX(-Math.PI/2));
      const buildTorii = (x: number, z: number) => {
        const red = 0xcc3300;
        vox(x-2.5, 3, z, red, 0.8, 6, 0.8); vox(x+2.5, 3, z, red, 0.8, 6, 0.8);
        vox(x, 6, z, red, 8, 0.6, 1); vox(x, 5, z, red, 7, 0.4, 0.8);
      };
      buildTorii(0, 35);
      addInteractable(-10, 0, 0x3b82f6, "[ E ] README LINK", () => {
        navigator.clipboard.writeText(`![My Pet](https://git-pet.vercel.app/api/card/${petState.gitData.username})`);
        alert("Copied!");
      });
      addInteractable(10, 0, 0x8b5cf6, "[ E ] SETTINGS", () => window.location.href = "/settings");
      addInteractable(0, -20, 0xef4444, "[ E ] EXIT WORLD", () => window.location.href = "/dashboard");

      const playerMesh = buildSpeciesMesh(species, petState.primaryColor);
      const petMeshObj = buildSpeciesMesh(species, petState.primaryColor);
      pet.mesh = petMeshObj.group; pet.legs = petMeshObj.legs;

      let lastTime = performance.now();
      let entryTime = 0;
      const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

      const animate = () => {
        if (!mounted.current) return;
        rafRef.current = requestAnimationFrame(animate);
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        const elapsed = now / 1000;
        entryTime += delta;

        // Cinematic Entry
        if (!p.controlEnabled) {
          const t = Math.min(entryTime / 3, 1);
          p.pos.z = 35 - easeOutCubic(t) * 40;
          p.isMoving = t < 1;
          if (t >= 1) { p.controlEnabled = true; if (mounted.current) setCinematicDone(true); }
        } else {
          // Movement 1:1 Dashboard Parity
          const accel = 0.09 * (delta * 60);
          const damping = Math.pow(0.72, delta * 60);
          let moved = false;
          if (keysRef.current["KeyW"] || keysRef.current["ArrowUp"]) { 
            const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
            p.vel.add(forward.multiplyScalar(accel)); moved = true; 
          }
          if (keysRef.current["KeyS"] || keysRef.current["ArrowDown"]) { 
            const backward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
            p.vel.add(backward.multiplyScalar(accel)); moved = true; 
          }
          if (keysRef.current["KeyA"] || keysRef.current["ArrowLeft"]) { p.rot += 0.045 * (delta * 60); moved = true; }
          if (keysRef.current["KeyD"] || keysRef.current["ArrowRight"]) { p.rot -= 0.045 * (delta * 60); moved = true; }
          p.isMoving = moved;
          p.vel.multiplyScalar(damping);
          if (p.vel.length() > 0.5) p.vel.setLength(0.5);
          p.pos.add(p.vel);
        }

        // Pet Follow
        const targetPetPos = p.pos.clone().add(new THREE.Vector3(2.5, 0, 2.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot));
        pet.pos.lerp(targetPetPos, 0.08);
        pet.mesh.position.copy(pet.pos);
        const joyFactor = (petState.stats.happiness / 100);
        pet.mesh.position.y = 0.5 + Math.abs(Math.sin(elapsed * 4)) * (0.1 + joyFactor * 0.2);
        pet.mesh.lookAt(p.pos.x, 0.5, p.pos.z);

        // Update Meshes
        playerMesh.group.position.copy(p.pos);
        playerMesh.group.rotation.y = p.rot;
        const energyFactor = (petState.stats.energy / 100);
        const animSpeed = 4 + energyFactor * 8;
        const swing = p.isMoving ? Math.sin(elapsed * animSpeed) * 0.45 : 0;
        playerMesh.legs.FL.rotation.x = swing; playerMesh.legs.BR.rotation.x = swing;
        playerMesh.legs.FR.rotation.x = -swing; playerMesh.legs.BL.rotation.x = -swing;
        const petSwing = pet.pos.distanceTo(targetPetPos) > 0.2 ? Math.sin(elapsed * (animSpeed + 2)) * 0.45 : 0;
        pet.legs.FL.rotation.x = petSwing; pet.legs.BR.rotation.x = petSwing;
        pet.legs.FR.rotation.x = -petSwing; pet.legs.BL.rotation.x = -petSwing;

        // Interacts
        interactables.forEach(obj => {
          const isNear = p.pos.distanceTo(obj.pos) < obj.radius;
          obj.mesh.scale.lerp(new THREE.Vector3(isNear ? 1.1 : 1.0, isNear ? 1.1 : 1.0, isNear ? 1.1 : 1.0), 0.1);
          obj.sprite.visible = isNear;
          obj.sprite.position.set(obj.pos.x, 3.5 + Math.sin(elapsed * 4) * 0.1, obj.pos.z);
        });

        // Camera
        const cameraOffset = new THREE.Vector3(0, 7, 14).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
        camPos.lerp(p.pos.clone().add(cameraOffset), 0.06);
        camLook.lerp(p.pos.clone().add(new THREE.Vector3(0, 1, -3).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot)), 0.1);
        camera.position.copy(camPos); camera.lookAt(camLook);
        
        syncRef();
        renderer.render(scene, camera);
      };
      animate();

      const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
      if (host) {
        const socket = new PartySocket({ host, room: "world" });
        socketRef.current = socket;
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", pet: { username: petState.gitData.username, x: p.pos.x, y: p.pos.z, species, petState } })));
        socket.addEventListener("message", (e) => { const msg = JSON.parse(e.data); if (msg.type === "snapshot") setOnlineCount(Object.keys(msg.pets).length); });
        const broadcast = setInterval(() => { if (socket.readyState === 1 && playerRef.current.isMoving) socket.send(JSON.stringify({ type: "move", x: playerRef.current.pos.x, y: playerRef.current.pos.z })); }, 100);
        cleanupFns.current.push(() => clearInterval(broadcast));
      }

      const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; if (e.code === "KeyE") { const near = interactables.find(o => p.pos.distanceTo(o.pos) < o.radius); if (near) near.onInteract(); } };
      const onKeyUp = (e: KeyboardEvent) => keysRef.current[e.code] = false;
      const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
      window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("resize", onResize);
      cleanupFns.current.push(() => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("resize", onResize); });
    };

    init();
    return () => { cancelAnimationFrame(rafRef.current); if (rendererRef.current) rendererRef.current.dispose(); cleanupFns.current.forEach(f => f()); if (socketRef.current) socketRef.current.close(); };
  }, [petState, species]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', background: '#020617', overflow: 'hidden', fontFamily: 'monospace' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {!cinematicDone && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#ffd4a0', zIndex: 100, fontSize: 13, letterSpacing: 6 }}>FETCHING PET DATA...</div>}
      {cinematicDone && <>
        <div style={{ position: 'fixed', top: 24, left: 24, background: 'rgba(2,6,23,0.85)', padding: '12px 20px', borderRadius: 4, color: '#fff', border: '1px solid rgba(240,200,140,0.2)', backdropFilter: 'blur(10px)', zIndex:10 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#ffd4a0', marginBottom: 4 }}>@{petState.gitData.username.toUpperCase()}</div>
          <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{onlineCount} PETS IN REALM</div>
        </div>
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', color: 'rgba(240,235,224,0.3)', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', pointerEvents: 'none', zIndex:10 }}>WASD · MOVE &nbsp;·&nbsp; A/D · TURN &nbsp;·&nbsp; E · INTERACT</div>
      </>}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 40%, rgba(8,6,4,0.7) 100%)' }} />
    </div>
  );
}
