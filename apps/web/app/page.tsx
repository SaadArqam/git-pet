import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { PetCard } from "@/components/PetCard";
import { SpeciesSelect } from "@/components/SpeciesSelect";
import { getUserSpecies, autoAssignSpecies } from "@/lib/redis";
import Link from "next/link";
import React, { useRef, useEffect, useState } from "react";
import type { PetState } from "@git-pet/core";

// The canonical primary color for each species
const SPECIES_PRIMARY_COLOR: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#f8fafc",
  capybara:   "#a16207",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};

const centerStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  minHeight: "100vh",
  background: "#020617",
};

async function getPetState(token: string, username: string): Promise<PetState> {
  const client = new GitHubClient(token);
  const gitData = await client.fetchUserStats(username);
  return derivePetState(gitData);
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  const username = (session as { login?: string } | null)?.login;

  if (!token || !username) {
    return <LandingPage />;
  }

  const petState = await getPetState(token, username).catch(() => null);

  if (!petState) {
    return (
      <main style={centerStyle}>
        <div style={{textAlign: "center"}}>
          <p style={{ fontFamily: "monospace", color: "#ef4444", fontSize: 12, marginBottom:16 }}>
            failed to load pet — check your token
          </p>
          <Link href="/api/auth/signout" style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", textDecoration: "none" }}>
            sign out and try again
          </Link>
        </div>
      </main>
    );
  }

  // Check if user has chosen a species yet
  const savedSpecies = await getUserSpecies(username);
  const isNewUser = savedSpecies === null;

  if (isNewUser) {
    return (
      <SpeciesSelect
        username={username}
        suggestedSpecies={autoAssignSpecies(petState.gitData.languages)}
        topLanguage={petState.gitData.languages[0] ?? null}
      />
    );
  }

  // Override primaryColor with the species' canonical color so the
  // renderer draws the right sprite palette, not the GitHub-derived color
  const speciesColor = SPECIES_PRIMARY_COLOR[savedSpecies];
  const petStateWithSpeciesColor: PetState = speciesColor
    ? { ...petState, primaryColor: speciesColor }
    : petState;

  return (
    <main style={centerStyle}>
      <PetCard petState={petStateWithSpeciesColor} species={savedSpecies} />
    </main>
  );
}

"use client";

function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(8, 16, 24, 18, color); p(10, 4, 20, 16, color);
  p(10, 0, 6, 8, color); p(24, 0, 6, 8, color);
  p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4");
  p(14, 14, 12, 8, "#cbd5e1");
  p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b");
  p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff");
  p(18, 17, 4, 3, "#1e293b");
  p(9, 30, 6, 10, color); p(17, 30, 6, 10, color); p(25, 30, 6, 10, color);
  const tailWag = Math.sin(frame * 0.15) * 4;
  p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color);
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(6, 18, 28, 20, color); p(8, 4, 24, 18, color);
  p(8, 0, 5, 7, color); p(27, 0, 5, 7, color); p(9, 1, 3, 4, "#fde68a");
  p(14, 20, 4, 8, "#fff"); p(22, 20, 4, 8, "#fff");
  p(11, 9, 5, 5, "#0ea5e9"); p(24, 9, 5, 5, "#0ea5e9");
  p(12, 10, 2, 2, "#fff"); p(25, 10, 2, 2, "#fff");
  p(17, 16, 6, 4, "#1e293b");
  p(10, 22, 4, 4, "#e2e8f0"); p(22, 26, 4, 4, "#e2e8f0");
  p(7, 34, 7, 8, color); p(16, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawCapybara(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.06) * 1.5;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(4, 20, 32, 18, color); p(2, 24, 36, 10, color);
  p(6, 6, 24, 18, color);
  p(6, 4, 7, 6, color); p(27, 4, 7, 6, color);
  p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b");
  p(12, 13, 2, 2, "#fff"); p(26, 13, 2, 2, "#fff");
  p(13, 19, 14, 5, "#92400e");
  p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24"); p(17, 1, 6, 6, "#fde68a");
  p(6, 34, 8, 8, color); p(16, 34, 8, 8, color); p(26, 34, 8, 8, color);
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2;
  const wingFlap = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(-8, 8 + wingFlap, 12, 18, "#6d28d9"); p(36, 8 + wingFlap, 12, 18, "#6d28d9");
  p(-12, 6 + wingFlap, 8, 10, "#7c3aed"); p(44, 6 + wingFlap, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color); p(10, 4, 20, 18, color);
  p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa");
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a");
  p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
  p(13, 17, 14, 7, "#6d28d9");
  const fireGlow = frame % 20 < 10 ? "#f97316" : "#fbbf24";
  p(14, 19, 3, 3, fireGlow); p(23, 19, 3, 3, fireGlow);
  p(14, 14, 3, 5, "#a78bfa"); p(20, 12, 3, 5, "#a78bfa"); p(26, 14, 3, 5, "#a78bfa");
  p(28, 26, 10, 6, color); p(34, 22, 6, 6, color); p(38, 18, 5, 5, "#a78bfa");
  p(9, 34, 7, 8, color); p(17, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawAxolotl(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.09) * 2;
  const gillWave = Math.sin(frame * 0.13) * 3;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(2, 4 + gillWave, 5, 14, "#f9a8d4"); p(0, 2 + gillWave, 4, 8, "#fda4af");
  p(33, 4 + gillWave, 5, 14, "#f9a8d4"); p(36, 2 + gillWave, 4, 8, "#fda4af");
  p(5, 1 + gillWave, 4, 10, "#f9a8d4"); p(31, 1 + gillWave, 4, 10, "#f9a8d4");
  p(4, 22, 32, 14, color); p(2, 26, 36, 8, color); p(6, 8, 28, 18, color);
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b");
  p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b");
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6");
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color);
  p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4");
}

const PET_DRAWERS = [drawWolf, drawSabertooth, drawCapybara, drawDragon, drawAxolotl];
const PET_COLORS = ["#94a3b8", "#f8fafc", "#a16207", "#7c3aed", "#db2777"];

function ShowcaseCanvas({ species, index, hoverFreq }: { species: any, index: number, hoverFreq: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf: number;
    const loop = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, 80, 80);
      const grad = ctx.createRadialGradient(40, 40, 0, 40, 40, 40);
      grad.addColorStop(0, `${species.a}26`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 80, 80);
      
      PET_DRAWERS[index](ctx, 20, 10, frameRef.current, species.color);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [species, index]);
  
  return <canvas ref={canvasRef} width={80} height={80} style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto' }} />;
}

function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [hasStartedAudio, setHasStartedAudio] = useState(false);
  const icon1Ref = useRef<HTMLCanvasElement>(null);
  const icon2Ref = useRef<HTMLCanvasElement>(null);
  const icon3Ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const startAudio = () => {
      if (hasStartedAudio) return;
      setHasStartedAudio(true);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 55;
      const gain = ctx.createGain();
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
    };
    document.addEventListener("click", startAudio, { once: true });
    return () => {
      document.removeEventListener("click", startAudio);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [hasStartedAudio]);

  const playBlip = (freq: number, type: OscillatorType, dur: number, g: number) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(g, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  };

  useEffect(() => {
    const ob = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal-step").forEach(el => ob.observe(el));
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    // Stat icons
    const idx1 = icon1Ref.current?.getContext('2d');
    if (idx1) {
      idx1.fillStyle = "#e2e8f0";
      const cat = ["01000010","01100110","01111110","10111101","11111111","11011011","01111110","00111100"];
      cat.forEach((r, ri) => r.split('').forEach((p, ci) => { if (p === '1') idx1.fillRect(ci * 6, ri * 6, 6, 6); }));
    }
    const idx2 = icon2Ref.current?.getContext('2d');
    if (idx2) {
      idx2.fillStyle = "#22c55e"; idx2.fillRect(22, 4, 4, 40);
      idx2.fillStyle = "#eab308";
      idx2.fillRect(16, 8, 16, 8); idx2.fillRect(16, 20, 16, 8); idx2.fillRect(16, 32, 16, 8);
    }
    const idx3 = icon3Ref.current?.getContext('2d');
    if (idx3) {
      idx3.fillStyle = "#38bdf8";
      const a = ["0001000","0011100","0111110","1101011","0001000","0001000"];
      a.forEach((r, ri) => r.split('').forEach((p, ci) => { if (p === '1') idx3.fillRect(ci * 6 + 3, ri * 6 + 8, 6, 6); }));
      idx3.fillStyle = "#fff"; idx3.fillRect(4, 4, 4, 4); idx3.fillRect(36, 12, 4, 4);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w; canvas.height = h;

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w; canvas.height = h;
    };
    window.addEventListener("resize", onResize);

    const stars = Array(60).fill(0).map(() => ({ x: Math.random() * w, y: Math.random() * (h * 0.65), offset: Math.floor(Math.random() * 30) }));
    const clouds = Array(3).fill(0).map((_, i) => ({ x: (w / 3) * i, y: 40 + Math.random() * 100 }));
    const floatingBlocks = Array(8).fill(0).map(() => ({ x: Math.random() * w, y: 50 + Math.random() * (h * 0.4), offset: Math.random() * 100, type: Math.floor(Math.random() * 4) as 0|1|2|3 }));
    const pets = PET_COLORS.map((_, i) => ({ x: i * (w / 5) + Math.random() * 50, dir: i % 2 === 0 ? 1 : -1 }));

    let frame = 0;
    let raf: number;

    const loop = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      const groundY = h * 0.65;
      
      const cycleProgress = Math.sin(((frame % 1800) / 1800) * Math.PI);
      const sr = Math.round(10 + cycleProgress * 5); const sg = Math.round(14 + cycleProgress * 9); const sb = Math.round(26 + cycleProgress * 16);
      ctx.fillStyle = `rgb(${sr},${sg},${sb})`; ctx.fillRect(0, 0, w, groundY);

      ctx.fillStyle = "#fff";
      stars.forEach(s => { if (Math.floor(frame / (30 + s.offset)) % 2 === 0) ctx.fillRect(s.x, s.y, 2, 2); });

      ctx.fillStyle = "#e2e8f044"; ctx.fillRect(w - 120, 60, 32, 32); 
      ctx.fillStyle = "#e2e8f0";
      const moonMask = [" 1111 ", "111111", "111111", "111111", "111111", " 1111 "];
      moonMask.forEach((row, ri) => row.split("").forEach((c, ci) => { if (c === "1") ctx.fillRect(w - 116 + ci * 4, 64 + ri * 4, 4, 4); }));

      ctx.fillStyle = "#1e293b";
      clouds.forEach(c => {
        c.x += 0.15; if (c.x > w + 40) c.x = -40;
        ctx.fillRect(c.x, c.y, 32, 12); ctx.fillRect(c.x + 8, c.y - 8, 16, 8); ctx.fillRect(c.x + 4, c.y + 12, 20, 4);
      });

      const cols = Math.ceil(w / 16); const rows = Math.ceil((h - groundY) / 16);
      for (let r = 0; r < rows; r++) {
        const by = groundY + r * 16;
        for (let c = 0; c < cols; c++) {
          const bx = c * 16;
          if (r < 2) {
            ctx.fillStyle = "#15803d"; ctx.fillRect(bx, by, 16, 16); ctx.fillStyle = "#22c55e"; ctx.fillRect(bx, by, 16, 4);
            ctx.fillStyle = "#14532d"; ctx.fillRect(bx + 15, by, 1, 16); ctx.fillRect(bx, by + 15, 16, 1);
          } else {
            ctx.fillStyle = "#92400e"; ctx.fillRect(bx, by, 16, 16);
            const s1 = (r * 13 + c * 37) % 7; const s2 = (r * 23 + c * 41) % 7; const s3 = (r * 7 + c * 59) % 7;
            ctx.fillStyle = "#7c3408"; ctx.fillRect(bx + s1, by + s2, 2, 2); ctx.fillRect(bx + s2, by + s3, 2, 2); ctx.fillRect(bx + s3, by + s1, 2, 2);
          }
          ctx.fillStyle = "#00000033"; ctx.fillRect(bx + 16, by, 1, 16); ctx.fillRect(bx, by + 16, 16, 1);
        }
      }

      floatingBlocks.forEach(fb => {
        ctx.save();
        const fbY = fb.y + Math.sin(frame * 0.05 + fb.offset) * 10;
        ctx.translate(fb.x + 12, fbY + 12); ctx.rotate(Math.floor(frame / 120) % 4 * (Math.PI / 2)); ctx.translate(-12, -12);
        ctx.fillStyle = fb.type === 0 ? "#15803d" : "#64748b"; ctx.fillRect(0, 0, 24, 24);
        ctx.fillStyle = fb.type === 0 ? "#22c55e" : "#94a3b8"; ctx.fillRect(0, 0, 24, 6);
        ctx.fillStyle = fb.type === 0 ? "#14532d" : "#475569"; ctx.fillRect(21, 0, 3, 24); ctx.fillRect(0, 21, 24, 3);
        if (fb.type === 2 || fb.type === 3) {
          ctx.fillStyle = fb.type === 2 ? "#eab308" : "#38bdf8";
          ctx.fillRect(4, 8, 4, 4); ctx.fillRect(16, 12, 4, 4); ctx.fillRect(8, 16, 4, 4);
        }
        ctx.restore();
      });

      pets.forEach((p, i) => {
        p.x += p.dir * 0.4; if (p.x > w - 40 || p.x < 40) p.dir *= -1;
        ctx.save();
        ctx.translate(p.x, groundY - 45); ctx.scale(p.dir * 1.2, 1.2);
        PET_DRAWERS[i](ctx, -20, 0, frame, PET_COLORS[i]);
        ctx.restore();
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes hueCycle {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        .reveal-step {
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.3s steps(6);
        }
        .reveal-step.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .mc-btn:active {
          border-top-color: #0f172a !important;
          border-left-color: #0f172a !important;
          border-bottom-color: #475569 !important;
          border-right-color: #475569 !important;
        }
        .dirt-title {
          background: repeating-conic-gradient(rgba(0,0,0,0.08) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px, #22c55e;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: hueCycle 6s linear infinite;
          filter: drop-shadow(4px 4px 0px #14532d);
        }
        .dirt-footer {
          background: repeating-conic-gradient(#92400e 0 25%, #7c3408 0 50%) 0 0 / 8px 8px;
        }
        .mc-card {
          border: 3px solid;
          border-color: #1e293b #020617 #020617 #1e293b;
        }
        .species-card {
          border: 3px solid;
          border-color: #0f172a #020617 #020617 #0f172a;
        }
        .species-card:hover { border-top-color: var(--accent); border-left-color: var(--accent); }
      `}} />

      <canvas 
        ref={canvasRef} 
        style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none', imageRendering: 'pixelated' }} 
      />

      <div style={{ position: 'relative', zIndex: 1, cursor: 'crosshair', fontFamily: 'monospace' }}>
        
        {/* SECTION 1 - HERO */}
        <section className="reveal-step" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 className="dirt-title" style={{ fontSize: 'clamp(56px, 10vw, 120px)', fontWeight: 900, letterSpacing: '0.05em', margin: 0 }}>GIT PET</h1>
            <p style={{ fontSize: 'clamp(12px, 2vw, 16px)', letterSpacing: '6px', color: '#475569', textTransform: 'uppercase', marginTop: '8px' }}>
              your commits. your creature.
            </p>
            <div style={{ marginTop: '16px', fontStyle: 'italic', color: '#eab308', fontSize: '11px', transform: 'rotate(-2deg)', background: '#0f172a', border: '2px solid #eab308', padding: '4px 12px', display: 'inline-block' }}>
              BETA v0.1 · git-pet-beta.vercel.app
            </div>
          </div>

          <Link href="/api/auth/signin" className="mc-btn"
            style={{
              marginTop: '40px', minWidth: '280px', padding: '16px 32px', display: 'block', textAlign: 'center', textDecoration: 'none',
              fontSize: '14px', letterSpacing: '3px', fontWeight: 'bold', background: '#1e293b', color: '#e2e8f0',
              borderTop: '3px solid #475569', borderLeft: '3px solid #475569', borderBottom: '3px solid #0f172a', borderRight: '3px solid #0f172a',
              borderRadius: 0, cursor: 'crosshair', transition: 'background 0.1s'
            }}
            onMouseEnter={() => playBlip(440, 'square', 0.05, 0.1)}
          >
            ▶  PLAY WITH GITHUB
          </Link>

          <Link href="/world" className="mc-btn"
            style={{
              marginTop: '12px', padding: '10px 24px', display: 'block', textAlign: 'center', textDecoration: 'none',
              fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold', background: '#1e293b', color: '#475569',
              borderTop: '3px solid #1e293b', borderLeft: '3px solid #1e293b', borderBottom: '3px solid #020617', borderRight: '3px solid #020617',
              borderRadius: 0, cursor: 'crosshair', transition: 'background 0.1s'
            }}
          >
            ◈ EXPLORE THE WORLD  →
          </Link>
        </section>

        {/* SECTION 2 - HOW IT WORKS */}
        <section className="reveal-step" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.85)', padding: '64px 24px' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', color: '#e2e8f0', textShadow: '4px 4px 0px #020617', marginBottom: '48px', fontWeight: 900 }}>HOW IT WORKS</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center' }}>
            <div className="mc-card" style={{ background: '#0f172a', padding: '24px', width: 'clamp(200px, 28vw, 300px)' }}>
              <canvas ref={icon1Ref} width={48} height={48} style={{ imageRendering: 'pixelated', display: 'block' }} />
              <h3 style={{ color: '#eab308', fontSize: '16px', letterSpacing: '2px', margin: '12px 0 8px' }}>CONNECT</h3>
              <p style={{ color: '#475569', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>Sign in with GitHub. Your account becomes your pet's soul.</p>
            </div>
            <div className="mc-card" style={{ background: '#0f172a', padding: '24px', width: 'clamp(200px, 28vw, 300px)' }}>
              <canvas ref={icon2Ref} width={48} height={48} style={{ imageRendering: 'pixelated', display: 'block' }} />
              <h3 style={{ color: '#eab308', fontSize: '16px', letterSpacing: '2px', margin: '12px 0 8px' }}>COMMIT</h3>
              <p style={{ color: '#475569', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>Every commit feeds your pet. Every streak makes it stronger. Miss a day and it gets sad.</p>
            </div>
            <div className="mc-card" style={{ background: '#0f172a', padding: '24px', width: 'clamp(200px, 28vw, 300px)' }}>
              <canvas ref={icon3Ref} width={48} height={48} style={{ imageRendering: 'pixelated', display: 'block' }} />
              <h3 style={{ color: '#eab308', fontSize: '16px', letterSpacing: '2px', margin: '12px 0 8px' }}>EVOLVE</h3>
              <p style={{ color: '#475569', fontSize: '12px', lineHeight: 1.8, margin: 0 }}>Egg → Hatchling → Adult → Legend. Your coding history writes the story.</p>
            </div>
          </div>
        </section>

        {/* SECTION 3 - SPECIES SHOWCASE */}
        <section className="reveal-step" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.85)', padding: '64px 24px' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', color: '#e2e8f0', textShadow: '4px 4px 0px #020617', marginBottom: '48px', fontWeight: 900 }}>CHOOSE YOUR SPECIES</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
            {[
              { n: 'wolf', color: '#94a3b8', a: '#e2e8f0', desc: 'Fast, fierce, low-level', tags: 'Rust · C++', freq: 220 },
              { n: 'sabertooth', color: '#f8fafc', a: '#cbd5e1', desc: 'Powerful, ancient, systems', tags: 'Go · C', freq: 196 },
              { n: 'capybara', color: '#a16207', a: '#fbbf24', desc: 'Chill, friendly, polyglot', tags: 'Python · Ruby', freq: 261 },
              { n: 'dragon', color: '#7c3aed', a: '#a78bfa', desc: 'Versatile, modern, full-stack', tags: 'TypeScript · JS', freq: 392 },
              { n: 'axolotl', color: '#db2777', a: '#f472b6', desc: 'Rare, curious, explorer', tags: 'Everything', freq: 329 }
            ].map((s, idx) => (
              <div key={s.n} className="species-card" style={{ background: '#080f1f', padding: '20px 16px', width: '130px', '--accent': s.a } as any} onMouseEnter={() => playBlip(s.freq, 'triangle', 0.08, 0.08)}>
                <ShowcaseCanvas species={s} index={idx} hoverFreq={s.freq} />
                <h4 style={{ color: s.a, fontSize: '13px', letterSpacing: '2px', margin: '16px 0 8px', textTransform: 'uppercase' }}>{s.n}</h4>
                <p style={{ color: '#334155', fontSize: '10px', margin: 0, minHeight: '30px' }}>{s.desc}</p>
                <p style={{ color: '#1e3a5f', fontSize: '9px', margin: '4px 0 0' }}>{s.tags}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4 - FEATURES & FOOTER */}
        <section className="reveal-step" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'rgba(2,6,23,0.85)', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', color: '#e2e8f0', textShadow: '4px 4px 0px #020617', marginBottom: '48px', fontWeight: 900 }}>WHAT AWAITS YOU</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', width: '100%', maxWidth: '800px' }}>
              {[
                { i: '⚔️', t: 'MULTIPLAYER WORLD', d: 'Walk around, meet other pets, fight or befriend them' },
                { i: '🌍', t: 'LIVE WORLD MAP', d: 'See every active player on a minimap in real time' },
                { i: '🔄', t: '360° PET VIEWS', d: 'Front, side, and back — your pet fully rendered' },
                { i: '🧬', t: '4 EVOLUTION STAGES', d: 'Egg → Hatchling → Adult → Legend' },
                { i: '🎮', t: 'VS CODE EXTENSION', d: 'Your pet lives in your status bar while you code' },
                { i: '🏆', t: 'STREAK LEADERBOARD', d: 'Coming soon — compete with coders worldwide' }
              ].map(f => (
                <div key={f.t} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '24px', height: '24px', background: '#0f172a', border: '2px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                    {f.i}
                  </div>
                  <div>
                    <h4 style={{ color: '#e2e8f0', fontSize: '13px', margin: '0 0 4px', letterSpacing: '1px' }}>{f.t}</h4>
                    <p style={{ color: '#475569', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <footer className="dirt-footer" style={{ borderTop: '4px solid #22c55e', padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ color: '#0f172a', background: '#22c55e', padding: '2px 6px', fontSize: '12px', marginRight: '8px' }}>GIT PET</strong>
              <span style={{ color: '#475569', fontSize: '10px', letterSpacing: '1px' }}>A virtual pet powered by your GitHub activity</span>
            </div>
            <div style={{ color: '#475569', fontSize: '10px', letterSpacing: '1px' }}>
              github.com/SaadArqam/git-pet · git-pet-beta.vercel.app · WORLD · SETTINGS
            </div>
          </footer>
        </section>

      </div>
    </>
  );
}