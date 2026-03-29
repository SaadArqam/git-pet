"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

const SPLASHES = [
  "Your commits, your creature!",
  "Now with 100% more pixels!",
  "git commit -m 'fed my pet'",
  "Streak or it didn't happen!",
  "Tamagotchi for developers!",
  "Your pet misses you already!",
  "console.log('woof')",
  "100% open source!",
  "Powered by GitHub guilt!",
  "Miss a day, pet gets sad!",
  "It's not a bug, it's a feature!",
  "Now with multiplayer pets!",
  "Your pet judges your PRs!",
];

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splashText, setSplashText] = useState("Your commits, your creature!");

  useEffect(() => {
    setSplashText(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  useEffect(() => {
    let unmounted = false;
    let renderer: any, scene: any, camera: any;
    let rafId: number;

    let mouseNormX = 0, mouseNormY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseNormX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseNormY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    const initThree = async () => {
      try {
        await new Promise<void>((resolve) => {
          let s1 = document.querySelector('script[src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"]') as HTMLScriptElement;
          if (!s1) {
            s1 = document.createElement("script");
            s1.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
            document.head.appendChild(s1);
          }
          const check1 = () => {
            if ((window as any).THREE) {
              let s2 = document.querySelector('script[src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js"]') as HTMLScriptElement;
              if (!s2) {
                s2 = document.createElement("script");
                s2.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js";
                document.head.appendChild(s2);
              }
              const check2 = () => {
                if ((window as any).THREE.BufferGeometryUtils) resolve();
                else setTimeout(check2, 50);
              };
              check2();
            } else {
              setTimeout(check1, 50);
            }
          };
          check1();
        });
      } catch (e) {
        console.error(e);
        return;
      }
      if (unmounted || !containerRef.current) return;

      const THREE = (window as any).THREE;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xb8d4e8, 0.022);

      const skyGeo = new THREE.SphereGeometry(90, 16, 8);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0x7db8d4, side: THREE.BackSide, vertexColors: true });
      const skyColors = [];
      const skyPos = skyGeo.attributes.position;
      for (let i = 0; i < skyPos.count; i++) {
        const y = skyPos.getY(i);
        const t = (y + 90) / 180;
        skyColors.push(0.22 + t * 0.07, 0.42 + t * 0.14, 0.64 + t * 0.19);
      }
      skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
      scene.add(new THREE.Mesh(skyGeo, skyMat));

      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 80);
      camera.position.set(0, 6, 22);
      camera.lookAt(0, 2, -5);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x87b8d4);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      containerRef.current.appendChild(renderer.domElement);

      const onResize = () => {
        if (camera && renderer) {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
      };
      window.addEventListener("resize", onResize);

      const sun = new THREE.DirectionalLight(0xffd4a0, 2.2);
      sun.position.set(25, 35, -10);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 120;
      sun.shadow.camera.left = -40;
      sun.shadow.camera.right = 40;
      sun.shadow.camera.top = 40;
      sun.shadow.camera.bottom = -40;
      sun.shadow.bias = -0.001;
      scene.add(sun);

      const fill = new THREE.DirectionalLight(0x9bb8d4, 0.6);
      fill.position.set(-15, 10, 20);
      scene.add(fill);

      const ambient = new THREE.AmbientLight(0xffe8c0, 0.5);
      scene.add(ambient);

      const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a6741, 0.4);
      scene.add(hemi);

      const voxel = (x: number, y: number, z: number, colorHex: number) => {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshLambertMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      };

      const GROUND_SIZE = 60, GROUND_SEGS = 30;
      const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);
      groundGeo.rotateX(-Math.PI / 2);
      const colors = [];
      const pos = groundGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const noise = Math.sin(x * 2.1) * Math.cos(z * 1.8) * 0.5 + 0.5;
        if (noise > 0.5) colors.push(0.28, 0.52, 0.22);
        else colors.push(0.32, 0.60, 0.25);
      }
      groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.receiveShadow = true;
      scene.add(ground);

      for (let x = -28; x < 28; x += 1) {
        const dirt = voxel(x + 0.5, -0.25, -25, 0x8B6914);
        dirt.scale.set(1, 0.5, 1);
        scene.add(dirt);
      }

      const pathPoints = [
        { x: 0, z: 18 }, { x: -1, z: 14 }, { x: 0, z: 10 }, { x: 1, z: 6 },
        { x: 0, z: 2 }, { x: -1, z: -2 }, { x: 0, z: -6 },
      ];
      const stoneColors = [0x9a9a9a, 0x8a8a8a, 0xaaaaaa, 0x888888];
      pathPoints.forEach(pt => {
        for (let w = -1; w <= 1; w++) {
          const col = stoneColors[Math.floor(Math.random() * stoneColors.length)];
          const stone = voxel(pt.x + w, 0.05, pt.z, col);
          stone.scale.set(1, 0.12, 1);
          stone.receiveShadow = true;
          scene.add(stone);
        }
      });

      function createCherryTree(x: number, z: number, height = 5) {
        const group = new THREE.Group();
        for (let y = 0; y < height; y++) {
          const w = y < 2 ? 0.9 : 0.7;
          const trunk = voxel(0, y + 0.5, 0, y === 0 ? 0x5c3317 : 0x6b3f1e);
          trunk.scale.set(w, 1, w);
          group.add(trunk);
        }
        const blossomColors = [0xffb7c5, 0xff9eb5, 0xffc8d5, 0xff85a1, 0xffd4e0];
        for (let bx = -3; bx <= 3; bx++) {
          for (let by = -1; by <= 2; by++) {
            for (let bz = -3; bz <= 3; bz++) {
              const dist = Math.sqrt(bx*bx + by*by*2 + bz*bz);
              if (dist < 3 && Math.random() > dist * 0.18) {
                const col = blossomColors[Math.floor(Math.random() * blossomColors.length)];
                const b = voxel(bx * 0.9, height + by * 0.9, bz * 0.9, col);
                b.scale.setScalar(0.85);
                b.castShadow = true;
                group.add(b);
              }
            }
          }
        }
        group.position.set(x, 0, z);
        scene.add(group);
        return group;
      }
      createCherryTree(-10, -5, 6);
      createCherryTree(-14, -12, 5);
      createCherryTree(12, -8, 4);

      const petalGeo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
      const petalMat = new THREE.MeshLambertMaterial({ color: 0xffb7c5 });
      const petals: any[] = [];
      for (let i = 0; i < 120; i++) {
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.castShadow = false;
        petal.position.set((Math.random() - 0.5) * 35, Math.random() * 14 + 2, (Math.random() - 0.5) * 35);
        petal.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        petal.userData = {
          vy: -(0.008 + Math.random() * 0.012),
          vx: (Math.random() - 0.5) * 0.004,
          vz: (Math.random() - 0.5) * 0.004,
          spin: (Math.random() - 0.5) * 0.02,
        };
        scene.add(petal);
        petals.push(petal);
      }

      const pondX = 8, pondZ = -4, pondW = 8, pondD = 6;
      for (let x = -pondW/2; x <= pondW/2; x++) {
        for (let z = -pondD/2; z <= pondD/2; z++) {
          const edge = Math.abs(x) > pondW/2 - 1 || Math.abs(z) > pondD/2 - 1;
          if (edge) {
            const stone = voxel(pondX + x, 0.1, pondZ + z, 0x7a7a7a);
            stone.scale.set(1, 0.25, 1);
            scene.add(stone);
          }
        }
      }
      const waterGeo = new THREE.PlaneGeometry(pondW - 1, pondD - 1, 4, 4);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x3d8fa8, transparent: true, opacity: 0.82 });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.set(pondX, 0.08, pondZ);
      water.receiveShadow = true;
      scene.add(water);

      const lilyPositions = [[pondX-2, pondZ+1], [pondX+1, pondZ-1], [pondX+2, pondZ+2], [pondX-1, pondZ-2], [pondX+3, pondZ+0]];
      lilyPositions.forEach(([lx, lz]) => {
        const lily = voxel(lx, 0.12, lz, 0x3a8a3a);
        lily.scale.set(0.7, 0.06, 0.7);
        scene.add(lily);
      });

      const koiColors = [0xff6633, 0xff4400, 0xffaa44, 0xffffff];
      const koi: any[] = [];
      for (let i = 0; i < 5; i++) {
        const k = voxel(0, 0, 0, koiColors[i % koiColors.length]);
        k.scale.set(0.5, 0.15, 0.9);
        k.userData.angle = (i / 5) * Math.PI * 2;
        k.userData.radius = 1.5 + Math.random() * 1.5;
        k.userData.speed = 0.003 + Math.random() * 0.002;
        scene.add(k);
        koi.push(k);
      }

      function buildTorii(x: number, z: number) {
        const red = 0xcc3300, darkRed = 0x992200;
        for (let y = 0; y < 5; y++) {
          scene.add(voxel(x - 1.5, y + 0.5, z, red));
          scene.add(voxel(x + 1.5, y + 0.5, z, red));
        }
        for (let bx = -2.5; bx <= 2.5; bx += 1) {
          const beam = voxel(x + bx, 5.3, z, darkRed);
          beam.scale.set(1, 0.4, 0.5);
          scene.add(beam);
        }
        for (let bx = -2; bx <= 2; bx += 1) {
          const beam2 = voxel(x + bx, 4.6, z, red);
          beam2.scale.set(1, 0.35, 0.5);
          scene.add(beam2);
        }
      }
      buildTorii(0, -8);
      buildTorii(0, -18);

      function buildLantern(x: number, z: number) {
        const stone = 0x888880, glow = 0xffcc66;
        const base = voxel(x, 0.2, z, stone); base.scale.set(0.8, 0.4, 0.8); scene.add(base);
        for (let y = 0; y < 2; y++) {
          const p = voxel(x, 0.6 + y * 0.5, z, stone); p.scale.set(0.5, 0.5, 0.5); scene.add(p);
        }
        const light = voxel(x, 1.7, z, glow);
        light.scale.set(0.7, 0.6, 0.7);
        const lightMat = new THREE.MeshLambertMaterial({ color: glow, emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.2 });
        light.material = lightMat;
        scene.add(light);
        const cap = voxel(x, 2.1, z, stone); cap.scale.set(0.9, 0.2, 0.9); scene.add(cap);
        const pl = new THREE.PointLight(0xffaa22, 1.2, 6);
        pl.position.set(x, 1.8, z);
        scene.add(pl);
        return lightMat;
      }
      const lanternMats = [buildLantern(-2, 4), buildLantern(2, 0), buildLantern(-2, -4), buildLantern(2, -8)];

      function buildShrine(x: number, z: number) {
        const wood = 0x6b4423, stone = 0x9a8a7a, roof = 0x2a1f14;
        for (let s = 0; s < 3; s++) {
          for (let sx = -(3-s); sx <= (3-s); sx++) {
            for (let sz = -(2-s); sz <= (2-s); sz++) {
              const step = voxel(x+sx, s*0.4, z+sz+3, stone);
              step.scale.set(1, 0.4, 1);
              scene.add(step);
            }
          }
        }
        for (let wx = -3; wx <= 3; wx++) {
          for (let wy = 0; wy < 4; wy++) {
            for (let wz = -2; wz <= 2; wz++) {
              const isWall = Math.abs(wx) === 3 || Math.abs(wz) === 2 || wy === 0;
              const isWindow = wy === 1 && Math.abs(wx) === 2 && wz === -2;
              if (!isWall) continue;
              const col = isWindow ? 0xffcc66 : (wx === 0 && wz === -2 ? 0x4a2e18 : wood);
              const wall = voxel(x+wx, 1.2+wy, z+wz, col);
              if (isWindow) {
                wall.material = new THREE.MeshLambertMaterial({
                  color: 0xffcc66, emissive: new THREE.Color(0xffaa22), emissiveIntensity: 1.5
                });
              }
              wall.castShadow = true;
              scene.add(wall);
            }
          }
        }
        for (let ry = 0; ry < 3; ry++) {
          const ext = ry;
          for (let rx = -(3+ext); rx <= (3+ext); rx++) {
            for (let rz = -(2+ext); rz <= (2+ext); rz++) {
              const isEdge = Math.abs(rx) === 3+ext || Math.abs(rz) === 2+ext;
              if (!isEdge && ry > 0) continue;
              const roofVox = voxel(x+rx, 5.2+ry*0.5, z+rz, ry === 0 ? 0x3a2f1e : roof);
              roofVox.scale.set(1, 0.4, 1);
              roofVox.castShadow = true;
              scene.add(roofVox);
            }
          }
        }
      }
      buildShrine(0, -22);

      function buildMountain(x: number, z: number, height: number, width: number) {
        const colors = [0x4a5a3a, 0x3a4a2a, 0x5a6a4a];
        for (let my = 0; my < height; my++) {
          const radius = Math.floor((height - my) * (width / height));
          for (let mx = -radius; mx <= radius; mx++) {
            for (let mz = -Math.floor(radius * 0.6); mz <= Math.floor(radius * 0.6); mz++) {
              if (Math.abs(mx) === radius || Math.abs(mz) === Math.floor(radius * 0.6)) {
                const col = colors[Math.floor(Math.random() * colors.length)];
                scene.add(voxel(x + mx, my + 0.5, z + mz, col));
              }
            }
          }
        }
      }
      buildMountain(-35, -45, 14, 10);
      buildMountain(30, -50, 18, 12);
      buildMountain(-20, -55, 10, 7);

      function addSnow(x: number, z: number, height: number) {
        for (let s = 0; s < 3; s++) {
          const snow = voxel(x, height - s, z, s === 0 ? 0xffffff : 0xeeeeee);
          snow.scale.set(3-s, 1, 3-s);
          scene.add(snow);
        }
      }
      addSnow(-35, -45, 14);
      addSnow(30, -50, 18);

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        const elapsed = performance.now(); // user wants MS

        const autoOrbitSpeed = 0.00008;
        const radius = 22;
        camera.position.x = Math.sin(elapsed * autoOrbitSpeed) * radius * 0.15;
        camera.position.z = 22 + Math.sin(elapsed * autoOrbitSpeed * 0.5) * 1.5;
        
        // Offset on top of auto-orbit
        camera.position.x += mouseNormX * 2.5;
        camera.position.y = 6 + mouseNormY * -1.2;
        camera.lookAt(0, 2, -5);

        petals.forEach(p => {
          p.position.y += p.userData.vy;
          p.position.x += p.userData.vx + Math.sin(elapsed * 0.0003 + p.position.z) * 0.002;
          p.position.z += p.userData.vz;
          p.rotation.z += p.userData.spin;
          if (p.position.y < -0.5) {
            p.position.y = 14 + Math.random() * 4;
            p.position.x = (Math.random() - 0.5) * 35;
            p.position.z = (Math.random() - 0.5) * 35;
          }
        });

        waterMat.color.setHSL(0.55, 0.5, 0.35 + Math.sin(elapsed * 0.0008) * 0.03);

        koi.forEach(k => {
          k.userData.angle += k.userData.speed;
          k.position.set(
            pondX + Math.cos(k.userData.angle) * k.userData.radius,
            0.1,
            pondZ + Math.sin(k.userData.angle) * k.userData.radius * 0.6
          );
          k.rotation.y = -k.userData.angle + Math.PI / 2;
        });

        lanternMats.forEach((mat, i) => {
          mat.emissiveIntensity = 0.8 + Math.sin(elapsed * 0.0015 + i * 1.2) * 0.4;
        });

        renderer.render(scene, camera);
      };
      
      rafId = requestAnimationFrame(animate);
    };

    initThree();

    return () => {
      unmounted = true;
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
      if (renderer) renderer.dispose();
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300&family=Press+Start+2P&family=Syne:wght@700&display=swap');

        #three-canvas {
          filter: saturate(1.15) contrast(1.05);
        }

        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(10, 8, 5, 0.55) 100%);
          pointer-events: none;
          z-index: 2;
        }

        .grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          animation: grain-shift 0.4s steps(1) infinite;
        }

        @keyframes grain-shift {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-2px, 1px); }
          50% { transform: translate(2px, -1px); }
          75% { transform: translate(-1px, 2px); }
        }

        .ui-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          width: 360px;
        }

        .site-logo {
          font-family: 'Press Start 2P', monospace;
          font-size: 28px;
          color: #f0ebe0;
          text-shadow: 0 0 40px rgba(255, 180, 80, 0.8), 0 0 80px rgba(255, 140, 40, 0.4), 2px 2px 0px rgba(0,0,0,0.8);
          margin-bottom: 8px;
          letter-spacing: 4px;
        }

        .site-tagline {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          font-weight: 300;
          color: rgba(240, 235, 224, 0.6);
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 40px;
        }

        .menu-btn {
          width: 100%;
          padding: 16px 32px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #f0ebe0;
          background: rgba(26, 20, 14, 0.55);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(240, 200, 140, 0.2);
          border-bottom: none;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
          text-align: center;
        }

        .menu-btn:last-child {
          border-bottom: 1px solid rgba(240, 200, 140, 0.2);
        }

        .menu-btn:hover {
          background: rgba(181, 71, 10, 0.5);
          border-color: rgba(240, 180, 80, 0.5);
          color: #ffffff;
        }

        .menu-btn.primary {
          background: rgba(181, 71, 10, 0.35);
          border-color: rgba(255, 180, 80, 0.4);
          color: #ffd4a0;
        }

        .menu-btn.primary:hover {
          background: rgba(181, 71, 10, 0.7);
          border-color: rgba(255, 200, 100, 0.7);
          color: #ffffff;
        }
      `}} />
      <main style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#7db8d4" }}>
        <div id="three-canvas" ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />
        <div className="vignette" />
        <div className="grain" />
        <div className="ui-overlay">
          <div className="site-logo">GIT-PET</div>
          <div className="site-tagline">{splashText}</div>
          <Link href="/about" className="menu-btn">ABOUT GIT-PET</Link>
          <Link href="/world" className="menu-btn">EXPLORE WORLD</Link>
          <Link href="/api/auth/signin" className="menu-btn primary">SIGN IN WITH GITHUB</Link>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.4)", fontFamily: "'DM Mono', monospace", textShadow: "1px 1px rgba(0,0,0,0.8)" }}>
            © 2025 Git-Pet — made with too many commits
          </span>
          <span style={{ fontSize: "9px", color: "rgba(240,235,224,0.4)", fontFamily: "'DM Mono', monospace", textShadow: "1px 1px rgba(0,0,0,0.8)" }}>
            v0.1.0-beta
          </span>
        </div>
      </main>
    </>
  );
}