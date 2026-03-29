"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

// Inline drawing functions for pets
function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(8, 16, 24, 18, color); // Body
  p(10, 4, 20, 16, color); // Head
  p(10, 0, 6, 8, color); p(24, 0, 6, 8, color); // Ears
  p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4");
  p(14, 14, 12, 8, "#cbd5e1"); // Snout
  p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b"); // Eyes
  p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff");
  p(18, 17, 4, 3, "#1e293b"); // Nose
  p(9, 30, 6, 10, color); p(17, 30, 6, 10, color); p(25, 30, 6, 10, color); // Legs
  const tailWag = Math.sin(frame * 0.15) * 4;
  p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color); // Tail
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(6, 18, 28, 20, color); // Body
  p(8, 4, 24, 18, color); // Head
  p(8, 0, 5, 7, color); p(27, 0, 5, 7, color); // Ears
  p(9, 1, 3, 4, "#fde68a");
  p(14, 20, 4, 8, "#fff"); p(22, 20, 4, 8, "#fff"); // Saberteeth
  p(11, 9, 5, 5, "#0ea5e9"); p(24, 9, 5, 5, "#0ea5e9"); // Eyes
  p(12, 10, 2, 2, "#fff"); p(25, 10, 2, 2, "#fff");
  p(17, 16, 6, 4, "#1e293b"); // Nose
  p(10, 22, 4, 4, "#e2e8f0"); p(22, 26, 4, 4, "#e2e8f0"); // Spots
  p(7, 34, 7, 8, color); p(16, 34, 7, 8, color); p(26, 34, 7, 8, color); // Legs
}

function drawCapybara(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.06) * 1.5;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(4, 20, 32, 18, color); // Body
  p(2, 24, 36, 10, color);
  p(6, 6, 24, 18, color); // Head
  p(6, 4, 7, 6, color); p(27, 4, 7, 6, color); // Ears
  p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b"); // Eyes
  p(12, 13, 2, 2, "#fff"); p(26, 13, 2, 2, "#fff");
  p(13, 19, 14, 5, "#92400e"); // Nose
  p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24"); // Flower
  p(17, 1, 6, 6, "#fde68a");
  p(6, 34, 8, 8, color); p(16, 34, 8, 8, color); p(26, 34, 8, 8, color); // Legs
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2;
  const wingFlap = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(-8, 8 + wingFlap, 12, 18, "#6d28d9"); p(36, 8 + wingFlap, 12, 18, "#6d28d9"); // Wings
  p(-12, 6 + wingFlap, 8, 10, "#7c3aed"); p(44, 6 + wingFlap, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color); // Body
  p(10, 4, 20, 18, color); // Head
  p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa"); // Horns
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a"); // Eyes
  p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
  p(13, 17, 14, 7, "#6d28d9"); // Snout
  const fireGlow = frame % 20 < 10 ? "#f97316" : "#fbbf24";
  p(14, 19, 3, 3, fireGlow); p(23, 19, 3, 3, fireGlow);
  p(14, 14, 3, 5, "#a78bfa"); p(20, 12, 3, 5, "#a78bfa"); p(26, 14, 3, 5, "#a78bfa"); // Spines
  p(28, 26, 10, 6, color); p(34, 22, 6, 6, color); p(38, 18, 5, 5, "#a78bfa"); // Tail
  p(9, 34, 7, 8, color); p(17, 34, 7, 8, color); p(26, 34, 7, 8, color); // Legs
}

function drawAxolotl(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.09) * 2;
  const gillWave = Math.sin(frame * 0.13) * 3;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(2, 4 + gillWave, 5, 14, "#f9a8d4"); p(0, 2 + gillWave, 4, 8, "#fda4af"); // Gills
  p(33, 4 + gillWave, 5, 14, "#f9a8d4"); p(36, 2 + gillWave, 4, 8, "#fda4af");
  p(5, 1 + gillWave, 4, 10, "#f9a8d4"); p(31, 1 + gillWave, 4, 10, "#f9a8d4");
  p(4, 22, 32, 14, color); p(2, 26, 36, 8, color); // Body
  p(6, 8, 28, 18, color); // Head
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b"); // Eyes
  p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b"); // Smile
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6"); // Spots
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color); // Legs
  p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4"); // Tail
}

export default function AboutPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let frame = 0;
    let panOffset = 0;
    
    // Mountains generated once
    const mountains: { x: number, yOffset: number }[] = [];
    for (let i = 0; i < 300; i++) {
      const yOff = Math.abs(Math.sin(i * 0.3) * 80 + Math.sin(i * 0.7) * 40 + Math.sin(i * 0.13) * 20);
      mountains.push({ x: i * 20, yOffset: yOff });
    }

    // Stars
    const stars: {x: number, y: number, phase: number, speed: number}[] = [];
    for(let i=0; i<60; i++) {
       stars.push({
         x: Math.random() * 3000,
         y: Math.random() * window.innerHeight * 0.55,
         phase: Math.random() * Math.PI * 2,
         speed: 0.02 + Math.random() * 0.03
       });
    }

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * scale;
      canvas.height = window.innerHeight * scale;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(scale, scale);
    };
    
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    };
    window.addEventListener("resize", onResize);
    resize();

    const loop = () => {
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const panoramaWidth = cw * 2.5;
      
      panOffset += 0.3;
      if (panOffset >= panoramaWidth / 2) panOffset -= panoramaWidth / 2;
      
      frame++;

      ctx.clearRect(0, 0, cw, ch);

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.6);
      skyGrad.addColorStop(0, "#1a0533");
      skyGrad.addColorStop(0.5, "#0f172a");
      skyGrad.addColorStop(1, "#1e3a5f");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cw, ch * 0.6);

      // Auroras
      const auroras = [
        { c: "#a78bfa", phase: 0 },
        { c: "#818cf8", phase: 2 },
        { c: "#34d399", phase: 4 }
      ];
      auroras.forEach((a, i) => {
         ctx.beginPath();
         const baseY = ch * 0.2 + i * 30;
         for (let px = 0; px <= cw; px += 20) {
            const y = baseY + 20 * Math.sin(px * 0.003 + frame * 0.004 + a.phase);
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
         }
         ctx.lineTo(cw, ch * 0.6);
         ctx.lineTo(0, ch * 0.6);
         ctx.fillStyle = a.c;
         ctx.globalAlpha = 0.08;
         ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Stars
      ctx.fillStyle = "#ffffff";
      stars.forEach(s => {
        const renderX = (s.x - panOffset + panoramaWidth * 5) % panoramaWidth;
        if (renderX < cw && s.y < ch * 0.55) {
           ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(frame * s.speed + s.phase));
           ctx.fillRect(renderX, s.y, 2, 2);
        }
      });
      ctx.globalAlpha = 1.0;

      // Mountains
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.moveTo(0, ch * 0.68);
      for (let i = 0; i < mountains.length; i++) {
        const m = mountains[i];
        const mX = (m.x - panOffset + panoramaWidth * 5) % panoramaWidth;
        if (mX < cw + 50) {
           ctx.lineTo(mX, ch * 0.68 - m.yOffset);
        }
      }
      ctx.lineTo(cw, ch * 0.68);
      ctx.fill();

      // Trees
      const treeBaseY = ch * 0.72 - 20;
      for (let tx = 0; tx < panoramaWidth; tx += 28) {
        const renderX = (tx - panOffset + panoramaWidth * 5) % panoramaWidth;
        if (renderX > -30 && renderX < cw) {
           // Trunk
           ctx.fillStyle = "#78350f";
           ctx.fillRect(renderX + 6, treeBaseY + 8, 4, 12);
           // Canopy
           ctx.fillStyle = "#166534";
           ctx.fillRect(renderX, treeBaseY - 12, 16, 20);
           // Canopy Highlight
           ctx.fillStyle = "#15803d";
           ctx.fillRect(renderX, treeBaseY - 12, 16, 2);
           // Canopy Shadow
           ctx.fillStyle = "#14532d";
           ctx.fillRect(renderX + 14, treeBaseY - 12, 2, 20);
        }
      }

      // Ground
      const groundY = ch * 0.70;
      // Grass blocks
      for(let gx = 0; gx < panoramaWidth; gx += 18) {
         const renderX = (gx - panOffset + panoramaWidth * 5) % panoramaWidth;
         if (renderX > -20 && renderX < cw) {
            ctx.fillStyle = "#166534";
            ctx.fillRect(renderX, groundY, 18, 18);
            ctx.fillRect(renderX, groundY + 18, 18, 18);
            ctx.fillStyle = "#22c55e";
            ctx.fillRect(renderX, groundY, 18, 4);
            ctx.fillRect(renderX, groundY + 18, 18, 4);
            ctx.fillStyle = "#14532d";
            ctx.fillRect(renderX + 17, groundY, 1, 18);
            ctx.fillRect(renderX, groundY + 17, 18, 1);
            ctx.fillRect(renderX + 17, groundY + 18, 1, 18);
            ctx.fillRect(renderX, groundY + 35, 18, 1);
         }
      }
      
      // Dirt
      ctx.fillStyle = "#92400e";
      ctx.fillRect(0, groundY + 36, cw, ch - (groundY + 36));
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      for(let y = groundY + 36; y < ch; y += 18) {
         ctx.fillRect(0, y, cw, 1);
      }
      for(let tx = 0; tx < panoramaWidth; tx += 18) {
         const renderX = (tx - panOffset + panoramaWidth * 5) % panoramaWidth;
         if (renderX > -20 && renderX < cw) {
            ctx.fillRect(renderX, groundY + 36, 1, ch);
            // random dark spot length pseudo-random
            if ((tx * 13) % 7 === 0) {
               ctx.fillStyle = "#78350f";
               ctx.fillRect(renderX + 4, groundY + 40 + (tx%30), 4, 4);
               ctx.fillStyle = "rgba(0,0,0,0.13)";
            }
         }
      }

      // Pets
      const pets = [
        { draw: drawWolf, color: "#94a3b8", xStart: 200, speedDir: 1 },
        { draw: drawSabertooth, color: "#f8fafc", xStart: 600, speedDir: -1 },
        { draw: drawCapybara, color: "#a16207", xStart: 1000, speedDir: 1 },
        { draw: drawDragon, color: "#7c3aed", xStart: 1400, speedDir: -1 },
        { draw: drawAxolotl, color: "#db2777", xStart: 1800, speedDir: 1 },
      ];

      pets.forEach((pet, i) => {
         const move = (frame * 0.4 * pet.speedDir);
         let rawX = (pet.xStart + move);
         // Bounce within panorama Width
         if (rawX < 0 || rawX > panoramaWidth) pet.speedDir *= -1;
         
         const renderX = (rawX - panOffset + panoramaWidth * 5) % panoramaWidth;
         if (renderX > -100 && renderX < cw + 100) {
            ctx.save();
            ctx.translate(renderX, groundY - 48);
            ctx.scale(1.4, 1.4);
            if (pet.speedDir < 0) {
               // flip vertically for walking left
               ctx.translate(40, 0);
               ctx.scale(-1, 1);
            }
            pet.draw(ctx, 0, 0, frame, pet.color);
            ctx.restore();
         }
      });

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;
        
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.frequency.value = 55;
        osc2.frequency.value = 110;
        osc1.type = "sine";
        osc2.type = "sine";
        
        gain.gain.value = 0.012;
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
      }
    }
  };

  const playClick = (type: "hover" | "click") => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "square";
    osc.frequency.value = type === "hover" ? 440 : 330;
    
    gain.gain.setValueAtTime(type === "hover" ? 0.08 : 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === "hover" ? 0.04 : 0.06));
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  useEffect(() => {
    const onInteract = () => initAudio();
    window.addEventListener("click", onInteract, { once: true });
    return () => {
      window.removeEventListener("click", onInteract);
      if (audioCtxRef.current?.state === "running") {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const btnStyle = {
    width: "clamp(280px, 40vw, 400px)",
    height: "40px",
    background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px), #8b8b8b",
    borderTop: "3px solid #c6c6c6",
    borderLeft: "3px solid #c6c6c6",
    borderBottom: "3px solid #373737",
    borderRight: "3px solid #373737",
    fontFamily: "'Courier New', monospace",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#e0e0e0",
    letterSpacing: "2px",
    textShadow: "2px 2px #373737",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  };

  const handleHover = (e: React.MouseEvent<HTMLElement>) => {
    playClick("hover");
    e.currentTarget.style.background = "#a0a0ff";
    e.currentTarget.style.borderTop = "3px solid #c8c8ff";
    e.currentTarget.style.borderLeft = "3px solid #c8c8ff";
    e.currentTarget.style.borderBottom = "3px solid #3737b8";
    e.currentTarget.style.borderRight = "3px solid #3737b8";
    e.currentTarget.style.color = "#ffffa0";
    e.currentTarget.style.textShadow = "2px 2px #1a1a5e";
  };

  const handleHoverEnd = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = "repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 3px), #8b8b8b";
    e.currentTarget.style.borderTop = "3px solid #c6c6c6";
    e.currentTarget.style.borderLeft = "3px solid #c6c6c6";
    e.currentTarget.style.borderBottom = "3px solid #373737";
    e.currentTarget.style.borderRight = "3px solid #373737";
    e.currentTarget.style.color = "#e0e0e0";
    e.currentTarget.style.textShadow = "2px 2px #373737";
    e.currentTarget.style.transform = "none";
  };

  const handleActive = (e: React.MouseEvent<HTMLElement>) => {
    playClick("click");
    e.currentTarget.style.transform = "translateY(2px)";
    e.currentTarget.style.borderTop = "3px solid #373737";
    e.currentTarget.style.borderLeft = "3px solid #373737";
    e.currentTarget.style.borderBottom = "3px solid #c6c6c6";
    e.currentTarget.style.borderRight = "3px solid #c6c6c6";
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#000" }}>
      <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, zIndex: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
      
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        
        <div style={{ 
          backdropFilter: "blur(4px)", 
          background: "rgba(2,6,23,0.88)", 
          maxWidth: "600px", 
          width: "100%",
          padding: "40px", 
          border: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "monospace",
          maxHeight: "90vh",
          overflowY: "auto"
        }}>
          
          <h1 style={{ color: "#e2e8f0", fontSize: "2rem", fontWeight: 900, textAlign: "center", marginBottom: "30px", letterSpacing: "2px" }}>
            GIT-PET
          </h1>

          <div style={{ color: "#e2e8f0", marginBottom: "12px", fontWeight: "bold" }}>WHAT IS GIT PET?</div>
          <p style={{ color: "#475569", lineHeight: "1.6", marginBottom: "24px" }}>
            A Tamagotchi for developers. Your GitHub commits determine your pet's health, mood, and evolution. Code more, your pet thrives. Miss a day, it gets sad. Miss a week, it gets angry.
          </p>

          <div style={{ color: "#e2e8f0", marginBottom: "12px", fontWeight: "bold" }}>HOW IT WORKS</div>
          <p style={{ color: "#475569", lineHeight: "1.6", marginBottom: "24px" }}>
            Connect GitHub → get a pet → commit code → watch it evolve.
            Egg → Hatchling → Adult → Legend.
          </p>

          <div style={{ color: "#e2e8f0", marginBottom: "12px", fontWeight: "bold" }}>SPECIES</div>
          <ul style={{ color: "#475569", lineHeight: "1.6", marginBottom: "24px", paddingLeft: "20px" }}>
            <li>Wolf (Rust, C++)</li>
            <li>White Sabertooth (Go, C)</li>
            <li>Capybara (Python, Ruby)</li>
            <li>Dragon (TypeScript, JavaScript)</li>
            <li>Axolotl (Everything else)</li>
          </ul>

          <div style={{ color: "#e2e8f0", marginBottom: "12px", fontWeight: "bold" }}>FEATURES</div>
          <p style={{ color: "#475569", lineHeight: "1.6", marginBottom: "24px" }}>
            Multiplayer World, 360° Views, VS Code Extension, Leaderboard (soon)
          </p>

          <div style={{ color: "#e2e8f0", marginBottom: "12px", fontWeight: "bold" }}>OPEN SOURCE</div>
          <p style={{ color: "#475569", lineHeight: "1.6", marginBottom: "40px" }}>
            <a href="https://github.com/SaadArqam/git-pet" target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
              github.com/SaadArqam/git-pet
            </a>
          </p>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <Link 
              href="/"
              style={btnStyle}
              onMouseEnter={handleHover}
              onMouseLeave={handleHoverEnd}
              onMouseDown={handleActive}
              onMouseUp={(e) => { 
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.borderTop = "3px solid #c8c8ff";
                e.currentTarget.style.borderLeft = "3px solid #c8c8ff";
                e.currentTarget.style.borderBottom = "3px solid #3737b8";
                e.currentTarget.style.borderRight = "3px solid #3737b8";
              }}
            >
              BACK TO MAIN
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
