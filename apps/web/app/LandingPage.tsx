"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(8, 16, 24, 18, color); p(10, 4, 20, 16, color); p(10, 0, 6, 8, color); p(24, 0, 6, 8, color);
  p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4"); p(14, 14, 12, 8, "#cbd5e1");
  p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b"); p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff");
  p(18, 17, 4, 3, "#1e293b"); p(9, 30, 6, 10, color); p(17, 30, 6, 10, color); p(25, 30, 6, 10, color);
  const tailWag = Math.sin(frame * 0.15) * 4; p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color);
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(6, 18, 28, 20, color); p(8, 4, 24, 18, color); p(8, 0, 5, 7, color); p(27, 0, 5, 7, color);
  p(9, 1, 3, 4, "#fde68a"); p(14, 20, 4, 8, "#fff"); p(22, 20, 4, 8, "#fff"); p(11, 9, 5, 5, "#0ea5e9");
  p(24, 9, 5, 5, "#0ea5e9"); p(12, 10, 2, 2, "#fff"); p(25, 10, 2, 2, "#fff"); p(17, 16, 6, 4, "#1e293b");
  p(10, 22, 4, 4, "#e2e8f0"); p(22, 26, 4, 4, "#e2e8f0"); p(7, 34, 7, 8, color); p(16, 34, 7, 8, color);
  p(26, 34, 7, 8, color);
}

function drawCapybara(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.06) * 1.5;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(4, 20, 32, 18, color); p(2, 24, 36, 10, color); p(6, 6, 24, 18, color); p(6, 4, 7, 6, color);
  p(27, 4, 7, 6, color); p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b"); p(12, 13, 2, 2, "#fff");
  p(26, 13, 2, 2, "#fff"); p(13, 19, 14, 5, "#92400e"); p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24"); p(17, 1, 6, 6, "#fde68a"); p(6, 34, 8, 8, color);
  p(16, 34, 8, 8, color); p(26, 34, 8, 8, color);
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2;
  const wingFlap = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(-8, 8 + wingFlap, 12, 18, "#6d28d9"); p(36, 8 + wingFlap, 12, 18, "#6d28d9");
  p(-12, 6 + wingFlap, 8, 10, "#7c3aed"); p(44, 6 + wingFlap, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color); p(10, 4, 20, 18, color); p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa");
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a"); p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
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
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(2, 4 + gillWave, 5, 14, "#f9a8d4"); p(0, 2 + gillWave, 4, 8, "#fda4af");
  p(33, 4 + gillWave, 5, 14, "#f9a8d4"); p(36, 2 + gillWave, 4, 8, "#fda4af");
  p(5, 1 + gillWave, 4, 10, "#f9a8d4"); p(31, 1 + gillWave, 4, 10, "#f9a8d4");
  p(4, 22, 32, 14, color); p(2, 26, 36, 8, color); p(6, 8, 28, 18, color);
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b");
  p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b");
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6");
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color); p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4");
}

function adjustColorHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

const LOGO_LETTERS: Record<string, string[]> = {
  G: ["01110", "10000", "10111", "10001", "01110"],
  I: ["11111", "00100", "00100", "00100", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100"],
  "-": ["00000", "00000", "11111", "00000", "00000"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  E: ["11111", "10000", "11110", "10000", "11111"],
};

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

// Minecraft button base styles
const MC_BTN: React.CSSProperties = {
  width: "clamp(280px, 40vw, 400px)",
  height: "44px",
  background: "#8b8b8b",
  borderTop: "3px solid #c6c6c6",
  borderLeft: "3px solid #c6c6c6",
  borderBottom: "3px solid #373737",
  borderRight: "3px solid #373737",
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "14px",
  fontWeight: "bold",
  color: "#e0e0e0",
  letterSpacing: "2px",
  textShadow: "2px 2px #373737",
  textTransform: "uppercase",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  userSelect: "none",
  transition: "none",
};

export default function LandingPage() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackingCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoContainerRef = useRef<HTMLDivElement>(null);
  const splashTextRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioStartedRef = useRef(false);

  const [splashText] = useState(
    () => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]
  );

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const logoCanvas = logoCanvasRef.current;
    const trackingCanvas = trackingCanvasRef.current;
    if (!bgCanvas || !logoCanvas || !trackingCanvas) return;

    const bgCtx = bgCanvas.getContext("2d");
    const logoCtx = logoCanvas.getContext("2d");
    const trackCtx = trackingCanvas.getContext("2d");
    if (!bgCtx || !logoCtx || !trackCtx) return;

    // ---------- DIMENSIONS (no compounding scale) ----------
    let cw = window.innerWidth;
    let ch = window.innerHeight;
    const PR = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = () => {
      cw = window.innerWidth;
      ch = window.innerHeight;

      // Reset transform before resizing to avoid compounding
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCanvas.width = cw * PR;
      bgCanvas.height = ch * PR;
      bgCanvas.style.width = cw + "px";
      bgCanvas.style.height = ch + "px";
      bgCtx.scale(PR, PR);

      const lw = cw < 640 ? 240 : 520;
      logoCtx.setTransform(1, 0, 0, 1, 0, 0);
      logoCanvas.width = lw * PR;
      logoCanvas.height = 90 * PR;
      logoCanvas.style.width = lw + "px";
      logoCanvas.style.height = "90px";
      logoCtx.scale(PR, PR);
      drawLogo(logoCtx, lw);

      trackCtx.setTransform(1, 0, 0, 1, 0, 0);
      trackingCanvas.width = 120 * PR;
      trackingCanvas.height = 160 * PR;
      trackingCanvas.style.width = "120px";
      trackingCanvas.style.height = "160px";
      trackCtx.scale(PR, PR);
    };

    // ---------- LOGO ----------
    const drawLogo = (ctx: CanvasRenderingContext2D, canvasW: number) => {
      ctx.clearRect(0, 0, canvasW, 90);
      const word = "GIT-PET";
      const bs = canvasW < 300 ? 5 : 8; // block size
      const gap = 4;
      let totalW = word.length * 5 * bs + (word.length - 1) * gap;
      let cx = (canvasW - totalW) / 2;

      for (const ch of word) {
        const grid = LOGO_LETTERS[ch] ?? LOGO_LETTERS["T"]!;
        const isGIT = "GIT".includes(ch);
        const topColor = isGIT ? "#22c55e" : ch === "-" ? "#475569" : "#a78bfa";
        const shadowColor = isGIT ? "#14532d" : ch === "-" ? "#1e293b" : "#4c1d95";

        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (grid[r]?.[c] === "1") {
              const bx = cx + c * bs;
              const by = r * bs + 14;
              ctx.fillStyle = topColor;
              ctx.fillRect(bx, by, bs, bs);
              // top highlight
              ctx.fillStyle = adjustColorHex(topColor, 25);
              ctx.fillRect(bx, by, bs, 1);
              ctx.fillRect(bx, by, 1, bs);
              // bottom-right shadow
              ctx.fillStyle = shadowColor;
              ctx.fillRect(bx + bs - 2, by, 2, bs);
              ctx.fillRect(bx, by + bs - 2, bs, 2);
            }
          }
        }
        cx += 5 * bs + gap;
      }
    };

    // ---------- STATIC DATA ----------
    const PANORAMA_W = 3000;
    const mountains: { x: number; h: number }[] = [];
    for (let i = 0; i < 150; i++) {
      mountains.push({
        x: i * 20,
        h: Math.abs(Math.sin(i * 0.3) * 80 + Math.sin(i * 0.7) * 40 + Math.sin(i * 0.13) * 20),
      });
    }

    const stars: { x: number; y: number; phase: number; speed: number }[] = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * PANORAMA_W,
        y: Math.random() * 0.5, // fraction of ch
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03,
      });
    }

    type PetDef = {
      draw: (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) => void;
      color: string;
      x: number;
      dir: number;
    };
    const pets: PetDef[] = [
      { draw: drawWolf,       color: "#94a3b8", x: 300,  dir: 1  },
      { draw: drawSabertooth, color: "#f8fafc", x: 800,  dir: -1 },
      { draw: drawCapybara,   color: "#a16207", x: 1300, dir: 1  },
      { draw: drawDragon,     color: "#7c3aed", x: 1800, dir: -1 },
      { draw: drawAxolotl,    color: "#db2777", x: 2300, dir: 1  },
    ];

    // ---------- RAF ----------
    let rafId = 0;
    let frame = 0;
    let panOffset = 0;

    const loop = () => {
      frame++;
      panOffset += 0.3;
      if (panOffset >= PANORAMA_W) panOffset -= PANORAMA_W;

      // helpers
      const wrap = (x: number) => ((x - panOffset) % PANORAMA_W + PANORAMA_W) % PANORAMA_W;

      // ── SKY ──
      const skyGrad = bgCtx.createLinearGradient(0, 0, 0, ch * 0.65);
      skyGrad.addColorStop(0, "#1a0533");
      skyGrad.addColorStop(0.5, "#0f172a");
      skyGrad.addColorStop(1, "#1e3a5f");
      bgCtx.fillStyle = skyGrad;
      bgCtx.fillRect(0, 0, cw, ch);

      // ── AURORAS ──
      const auroraColors = ["#a78bfa", "#818cf8", "#34d399"];
      auroraColors.forEach((color, i) => {
        const baseY = ch * (0.15 + i * 0.07);
        bgCtx.beginPath();
        for (let px = 0; px <= cw; px += 8) {
          const y = baseY + 22 * Math.sin(px * 0.004 + frame * 0.005 + i * 2.1);
          if (px === 0) bgCtx.moveTo(px, y);
          else bgCtx.lineTo(px, y);
        }
        bgCtx.lineTo(cw, ch * 0.6);
        bgCtx.lineTo(0, ch * 0.6);
        bgCtx.closePath();
        bgCtx.fillStyle = color;
        bgCtx.globalAlpha = 0.07;
        bgCtx.fill();
        bgCtx.globalAlpha = 1;
      });

      // ── STARS ──
      stars.forEach((s) => {
        const sx = wrap(s.x);
        const sy = s.y * ch;
        if (sx < cw) {
          bgCtx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(frame * s.speed + s.phase));
          bgCtx.fillStyle = "#ffffff";
          bgCtx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
        }
      });
      bgCtx.globalAlpha = 1;

      // ── MOUNTAINS ──
      bgCtx.fillStyle = "#0d1117";
      bgCtx.beginPath();
      bgCtx.moveTo(0, ch * 0.70);
      // Build sorted visible points
      const visible = mountains
        .map((m) => ({ screenX: wrap(m.x), screenY: ch * 0.70 - m.h }))
        .filter((p) => p.screenX >= -40 && p.screenX <= cw + 40)
        .sort((a, b) => a.screenX - b.screenX);

      if (visible.length > 0) {
        bgCtx.moveTo(visible[0].screenX, ch * 0.70);
        visible.forEach((p) => bgCtx.lineTo(p.screenX, p.screenY));
        bgCtx.lineTo(visible[visible.length - 1].screenX, ch * 0.70);
      }
      bgCtx.closePath();
      bgCtx.fill();

      // ── TREES ──
      const treeBaseY = ch * 0.70 - 20;
      for (let tx = 0; tx < PANORAMA_W; tx += 30) {
        const rx = wrap(tx);
        if (rx > -30 && rx < cw + 20) {
          bgCtx.fillStyle = "#78350f";
          bgCtx.fillRect(rx + 6, treeBaseY + 8, 4, 14);
          bgCtx.fillStyle = "#166534";
          bgCtx.fillRect(rx, treeBaseY - 14, 18, 22);
          bgCtx.fillStyle = "#15803d";
          bgCtx.fillRect(rx, treeBaseY - 14, 18, 2);
          bgCtx.fillStyle = "#14532d";
          bgCtx.fillRect(rx + 16, treeBaseY - 14, 2, 22);
        }
      }

      // ── GRASS BLOCKS ──
      const groundY = ch * 0.70;
      for (let gx = 0; gx < PANORAMA_W; gx += 18) {
        const rx = wrap(gx);
        if (rx > -20 && rx < cw + 20) {
          bgCtx.fillStyle = "#166534";
          bgCtx.fillRect(rx, groundY, 18, 18);
          bgCtx.fillRect(rx, groundY + 18, 18, 18);
          bgCtx.fillStyle = "#22c55e";
          bgCtx.fillRect(rx, groundY, 18, 4);
          bgCtx.fillRect(rx, groundY + 18, 18, 4);
          bgCtx.fillStyle = "#14532d";
          bgCtx.fillRect(rx + 17, groundY, 1, 36);
          bgCtx.fillRect(rx, groundY + 17, 18, 1);
          bgCtx.fillRect(rx, groundY + 35, 18, 1);
        }
      }

      // ── DIRT ──
      const dirtY = groundY + 36;
      bgCtx.fillStyle = "#92400e";
      bgCtx.fillRect(0, dirtY, cw, ch - dirtY);
      bgCtx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = dirtY; y < ch; y += 18) bgCtx.fillRect(0, y, cw, 1);
      for (let x = 0; x < PANORAMA_W; x += 18) {
        const rx = wrap(x);
        if (rx > -2 && rx < cw) bgCtx.fillRect(rx, dirtY, 1, ch - dirtY);
      }

      // ── DEPTH FOG ──
      const fog = bgCtx.createLinearGradient(0, ch * 0.55, 0, groundY);
      fog.addColorStop(0, "rgba(2,6,23,0)");
      fog.addColorStop(1, "rgba(2,6,23,0.35)");
      bgCtx.fillStyle = fog;
      bgCtx.fillRect(0, ch * 0.55, cw, groundY - ch * 0.55);

      // ── PETS ──
      pets.forEach((pet) => {
        pet.x += 0.4 * pet.dir;
        if (pet.x < 0) { pet.x = 0; pet.dir = 1; }
        if (pet.x > PANORAMA_W) { pet.x = PANORAMA_W; pet.dir = -1; }
        const rx = wrap(pet.x);
        if (rx > -100 && rx < cw + 100) {
          bgCtx.save();
          bgCtx.translate(rx, groundY - 48);
          bgCtx.scale(1.4 * pet.dir, 1.4);
          if (pet.dir < 0) bgCtx.translate(-40, 0);
          pet.draw(bgCtx, 0, 0, frame, pet.color);
          bgCtx.restore();
        }
      });

      // ── TRACKING PET (dragon, right side) ──
      if (cw >= 640) {
        trackCtx.clearRect(0, 0, 120, 160);
        trackCtx.save();
        trackCtx.scale(2.5, 2.5);
        drawDragon(trackCtx, 2, 10, frame, "#7c3aed");
        trackCtx.restore();

        if (trackingCanvasRef.current) {
          const rect = trackingCanvasRef.current.getBoundingClientRect();
          const cx2 = rect.left + rect.width / 2;
          const cy2 = rect.top + rect.height / 2;
          const angle = Math.atan2(mouseRef.current.y - cy2, mouseRef.current.x - cx2) * (180 / Math.PI);
          trackingCanvasRef.current.style.transform = `rotate(${Math.max(-10, Math.min(10, angle * 0.12))}deg)`;
        }
      }

      // ── LOGO BOB ──
      if (logoContainerRef.current) {
        const bobY = 4 * Math.sin(frame * 0.022);
        logoContainerRef.current.style.transform = `translate(-50%, ${bobY}px)`;
      }

      // ── SPLASH PULSE ──
      if (splashTextRef.current) {
        const s = 1 + Math.sin(frame * 0.045) * 0.05;
        splashTextRef.current.style.transform = `rotate(-18deg) scale(${s})`;
      }

      rafId = requestAnimationFrame(loop);
    };

    applySize();
    rafId = requestAnimationFrame(loop);

    const onMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouseMove);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applySize, 150); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  // ---------- AUDIO ----------
  const initAudio = () => {
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    try {
      const Ctx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.frequency.value = 55; o2.frequency.value = 110;
      g.gain.value = 0.01;
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
    } catch { /* silently fail */ }
  };

  const playClick = (freq: number, dur: number) => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* silently fail */ }
  };

  useEffect(() => {
    const handler = () => initAudio();
    window.addEventListener("click", handler, { once: true });
    return () => {
      window.removeEventListener("click", handler);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ---------- BUTTON HANDLERS ----------
  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    playClick(440, 0.04);
    const el = e.currentTarget;
    el.style.background = "#a0a0ff";
    el.style.borderTop = "3px solid #c8c8ff";
    el.style.borderLeft = "3px solid #c8c8ff";
    el.style.borderBottom = "3px solid #3737b8";
    el.style.borderRight = "3px solid #3737b8";
    el.style.color = "#ffffa0";
    el.style.textShadow = "2px 2px #1a1a5e";
  };

  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    el.style.background = "#8b8b8b";
    el.style.borderTop = "3px solid #c6c6c6";
    el.style.borderLeft = "3px solid #c6c6c6";
    el.style.borderBottom = "3px solid #373737";
    el.style.borderRight = "3px solid #373737";
    el.style.color = "#e0e0e0";
    el.style.textShadow = "2px 2px #373737";
    el.style.transform = "none";
  };

  const onDown = (e: React.MouseEvent<HTMLAnchorElement>) => {
    playClick(330, 0.06);
    const el = e.currentTarget;
    el.style.transform = "translateY(2px)";
    el.style.borderTop = "3px solid #373737";
    el.style.borderLeft = "3px solid #373737";
    el.style.borderBottom = "3px solid #c6c6c6";
    el.style.borderRight = "3px solid #c6c6c6";
  };

  const onUp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    el.style.transform = "none";
    el.style.borderTop = "3px solid #c8c8ff";
    el.style.borderLeft = "3px solid #c8c8ff";
    el.style.borderBottom = "3px solid #3737b8";
    el.style.borderRight = "3px solid #3737b8";
  };

  return (
    <main
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#1a0533" }}
      onClick={initAudio}
    >
      {/* PANORAMA */}
      <canvas
        ref={bgCanvasRef}
        style={{ position: "fixed", top: 0, left: 0, zIndex: 0, pointerEvents: "none", imageRendering: "pixelated" }}
      />

      {/* LOGO + SPLASH */}
      <div
        ref={logoContainerRef}
        style={{
          position: "absolute",
          top: "13%",
          left: "50%",
          transform: "translate(-50%, 0)",
          zIndex: 2,
          willChange: "transform",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <canvas ref={logoCanvasRef} style={{ imageRendering: "pixelated", display: "block" }} />
        <div
          ref={splashTextRef}
          style={{
            marginTop: "6px",
            fontFamily: "monospace",
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: "clamp(11px, 1.6vw, 16px)",
            color: "#eab308",
            textShadow: "2px 2px #78350f",
            whiteSpace: "nowrap",
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          {splashText}
        </div>
      </div>

      {/* BUTTONS */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          zIndex: 2,
        }}
      >
        <Link href="/about" style={MC_BTN} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={onDown} onMouseUp={onUp}>
          About Git-Pet
        </Link>
        <Link href="/world" style={MC_BTN} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={onDown} onMouseUp={onUp}>
          Explore World
        </Link>
        <Link href="/api/auth/signin" style={MC_BTN} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={onDown} onMouseUp={onUp}>
          Sign In With GitHub
        </Link>
      </div>

      {/* CURSOR-TRACKING DRAGON (desktop only) */}
      {typeof window !== "undefined" && (
        <div
          style={{
            position: "fixed",
            right: "7vw",
            top: "52%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 2,
          }}
          className="hidden sm:flex"
        >
          <canvas
            ref={trackingCanvasRef}
            style={{ imageRendering: "pixelated", pointerEvents: "none", willChange: "transform" }}
          />
          <span style={{ color: "#7c3aed", fontFamily: "monospace", fontSize: "9px", letterSpacing: "3px", marginTop: "6px", textShadow: "1px 1px #000" }}>
            DRAGON
          </span>
        </div>
      )}

      {/* BOTTOM BAR */}
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
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", textShadow: "1px 1px #000" }}>
          © 2025 Git-Pet — made with too many commits
        </span>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", textShadow: "1px 1px #000" }}>
          v0.1.0-beta
        </span>
      </div>
    </main>
  );
}