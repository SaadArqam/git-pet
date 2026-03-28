"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StarDot { x: number; y: number; size: 1 | 2; opacity: number; twinkleSpeed: number; twinklePhase: number }

// ─── Draw functions (pixel-art pets) ─────────────────────────────────────────

function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(8, 16, 24, 18, color); p(10, 4, 20, 16, color);
  p(10, 0, 6, 8, color); p(24, 0, 6, 8, color); p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4");
  p(14, 14, 12, 8, "#cbd5e1"); p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b");
  p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff"); p(18, 17, 4, 3, "#1e293b");
  p(9, 30, 6, 10, color); p(17, 30, 6, 10, color); p(25, 30, 6, 10, color);
  const tw = Math.sin(frame * 0.15) * 4; p(30, 18 + tw, 8, 5, color); p(34, 14 + tw, 6, 5, color);
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(6, 18, 28, 20, color); p(8, 4, 24, 18, color);
  p(8, 0, 5, 7, color); p(27, 0, 5, 7, color); p(9, 1, 3, 4, "#fde68a");
  p(14, 20, 4, 8, "#fff"); p(22, 20, 4, 8, "#fff");
  p(11, 9, 5, 5, "#0ea5e9"); p(24, 9, 5, 5, "#0ea5e9"); p(12, 10, 2, 2, "#fff"); p(25, 10, 2, 2, "#fff");
  p(17, 16, 6, 4, "#1e293b"); p(10, 22, 4, 4, "#e2e8f0"); p(22, 26, 4, 4, "#e2e8f0");
  p(7, 34, 7, 8, color); p(16, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawCapybara(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.06) * 1.5;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(4, 20, 32, 18, color); p(2, 24, 36, 10, color); p(6, 6, 24, 18, color);
  p(6, 4, 7, 6, color); p(27, 4, 7, 6, color);
  p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b"); p(12, 13, 2, 2, "#fff"); p(26, 13, 2, 2, "#fff");
  p(13, 19, 14, 5, "#92400e"); p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24"); p(17, 1, 6, 6, "#fde68a");
  p(6, 34, 8, 8, color); p(16, 34, 8, 8, color); p(26, 34, 8, 8, color);
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2; const wf = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(-8, 8 + wf, 12, 18, "#6d28d9"); p(36, 8 + wf, 12, 18, "#6d28d9");
  p(-12, 6 + wf, 8, 10, "#7c3aed"); p(44, 6 + wf, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color); p(10, 4, 20, 18, color);
  p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa");
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a"); p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
  p(13, 17, 14, 7, "#6d28d9"); const fg = frame % 20 < 10 ? "#f97316" : "#fbbf24"; p(14, 19, 3, 3, fg); p(23, 19, 3, 3, fg);
  p(14, 14, 3, 5, "#a78bfa"); p(20, 12, 3, 5, "#a78bfa"); p(26, 14, 3, 5, "#a78bfa");
  p(28, 26, 10, 6, color); p(34, 22, 6, 6, color); p(38, 18, 5, 5, "#a78bfa");
  p(9, 34, 7, 8, color); p(17, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawAxolotl(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.09) * 2; const gw = Math.sin(frame * 0.13) * 3;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h); };
  p(2, 4 + gw, 5, 14, "#f9a8d4"); p(0, 2 + gw, 4, 8, "#fda4af"); p(33, 4 + gw, 5, 14, "#f9a8d4"); p(36, 2 + gw, 4, 8, "#fda4af");
  p(5, 1 + gw, 4, 10, "#f9a8d4"); p(31, 1 + gw, 4, 10, "#f9a8d4");
  p(4, 22, 32, 14, color); p(2, 26, 36, 8, color); p(6, 8, 28, 18, color);
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b"); p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b");
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6");
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color); p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4");
}

// ─── Species data ─────────────────────────────────────────────────────────────

type DrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) => void;

interface Species {
  key: string;
  color: string;
  label: string;
  flavor: string;
  speech: string;
  freq: number;
  waveType: OscillatorType;
  dur: number;
  gain: number;
  draw: DrawFn;
}

const SPECIES: Species[] = [
  { key: "dragon",     color: "#7c3aed", label: "DRAGON",     flavor: "Versatile, modern, full-stack fire",   speech: "🔥",   freq: 392, waveType: "sawtooth", dur: 0.06, gain: 0.06, draw: drawDragon },
  { key: "axolotl",   color: "#db2777", label: "AXOLOTL",    flavor: "Rare, curious, polyglot explorer",     speech: "uwu",  freq: 329, waveType: "sine",     dur: 0.10, gain: 0.05, draw: drawAxolotl },
  { key: "wolf",      color: "#94a3b8", label: "WOLF",        flavor: "Fast, fierce, low-level",              speech: "WRUF", freq: 220, waveType: "triangle", dur: 0.08, gain: 0.06, draw: drawWolf },
  { key: "capybara",  color: "#a16207", label: "CAPYBARA",   flavor: "Chill, friendly, gets along with all", speech: "...", freq: 261, waveType: "sine",     dur: 0.10, gain: 0.05, draw: drawCapybara },
  { key: "sabertooth",color: "#f8fafc", label: "SABERTOOTH", flavor: "Powerful, ancient, systems thinker",   speech: "RAWRR",freq: 196, waveType: "triangle", dur: 0.08, gain: 0.06, draw: drawSabertooth },
];

// ─── Audio helper ─────────────────────────────────────────────────────────────

function playTone(actx: AudioContext, freq: number, type: OscillatorType, dur: number, gain: number) {
  try {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    osc.connect(g); g.connect(actx.destination);
    osc.start(); osc.stop(actx.currentTime + dur);
  } catch { /* ignore */ }
}

// ─── hex → rgb helper ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// ─── Main LandingPage ─────────────────────────────────────────────────────────

export function LandingPage() {
  const bgCanvasRef  = useRef<HTMLCanvasElement>(null);
  const petCanvasRef = useRef<HTMLCanvasElement>(null);
  const petCanvasEl  = useRef<HTMLCanvasElement | null>(null);
  const rafRef       = useRef<number>(0);
  const actxRef      = useRef<AudioContext | null>(null);
  const mouseRef     = useRef({ x: 0, y: 0 });
  const mouseMoved   = useRef(false);
  const mouseMovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Species cycling
  const speciesIdxRef  = useRef(0);
  const nextIdxRef     = useRef(1);
  const fadeRef        = useRef(0);      // 0→1 during cross-fade
  const fadingRef      = useRef(false);
  const speciesTimerRef = useRef(0);     // frames since last switch
  const soundCooldown  = useRef(0);

  // React state — only for DOM UI elements
  const [speciesIdx, setSpeciesIdx] = useState(0);
  const [fadingSpecies, setFadingSpecies] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleReady, setBubbleReady] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const isMobile = useRef(false);

  // ── Audio context (lazy) ────────────────────────────────────────────────────

  const ensureCtx = useCallback(() => {
    if (!actxRef.current) {
      actxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    if (actxRef.current.state === "suspended") actxRef.current.resume();
    return actxRef.current;
  }, []);

  // ── Mouse tracking ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (!mouseMoved.current) {
        mouseMoved.current = true;
        ensureCtx();
      }
      // After 4 seconds of mouse movement, hide the hint permanently
      if (mouseMovedTimer.current === null) {
        mouseMovedTimer.current = setTimeout(() => setHintVisible(false), 4000);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (mouseMovedTimer.current !== null) clearTimeout(mouseMovedTimer.current);
    };
  }, [ensureCtx]);

  // Touch: treat as mouse
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) mouseRef.current = { x: t.clientX, y: t.clientY };
    };
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => window.removeEventListener("touchmove", onTouch);
  }, []);

  // ── Main RAF loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    const bgCanvas  = bgCanvasRef.current;
    const petCanvas = petCanvasRef.current;
    if (!bgCanvas || !petCanvas) return;
    petCanvasEl.current = petCanvas;

    const bgCtx  = bgCanvas.getContext("2d");
    const petCtx = petCanvas.getContext("2d");
    if (!bgCtx || !petCtx) return;
    bgCtx.imageSmoothingEnabled  = false;
    petCtx.imageSmoothingEnabled = false;

    let W = window.innerWidth, H = window.innerHeight;
    isMobile.current = W < 640;

    // Cached pet canvas center (updated on resize, not every frame)
    const petCenter = { x: 0, y: 0 };

    const setPetCanvasSize = () => {
      const sz = isMobile.current ? 260 : 400;
      petCanvas.width  = sz;
      petCanvas.height = sz;
      petCtx.imageSmoothingEnabled = false;
    };

    const updatePetCenter = () => {
      const r = petCanvas.getBoundingClientRect();
      petCenter.x = r.left + r.width / 2;
      petCenter.y = r.top  + r.height / 2;
    };

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      isMobile.current = W < 640;
      const dpr = window.devicePixelRatio || 1;
      bgCanvas.width  = W * dpr; bgCanvas.height = H * dpr;
      bgCanvas.style.width  = W + "px"; bgCanvas.style.height = H + "px";
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bgCtx.imageSmoothingEnabled = false;
      setPetCanvasSize();
      buildStars();
      // Defer center calc until after browser lays out the new size
      requestAnimationFrame(updatePetCenter);
    };

    // Build star field
    let stars: StarDot[] = [];
    const buildStars = () => {
      stars = Array(120).fill(0).map(() => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        size: Math.random() < 0.8 ? 1 : 2,
        opacity: 0,
        twinkleSpeed: 0.005 + Math.random() * 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
      } as StarDot));
    };

    resize();
    // Initial center after first layout
    requestAnimationFrame(updatePetCenter);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); };
    window.addEventListener("resize", onResize);

    let frame = 0;
    let FADE_DUR = 48; // frames for cross-fade (~0.8s at 60fps)
    let HOLD_DUR = 240; // frames per species (~4s)

    // Species sound cooldown per species
    const speciesSoundCooldowns: number[] = SPECIES.map(() => 0);

    const loop = () => {
      frame++;

      const mobile = isMobile.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // ── Background canvas ──────────────────────────────────────────────────

      bgCtx.clearRect(0, 0, W, H);

      // Pulsing radial gradient — deep space
      const diagLen = Math.sqrt(W * W + H * H);
      const pulseT = (Math.sin(frame * (2 * Math.PI / (12 * 60))) + 1) / 2; // 0→1 over 12s
      const centerR = diagLen * (0.30 + pulseT * 0.20);
      const spaceBg = bgCtx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, centerR);
      spaceBg.addColorStop(0, "#0a0f1e");
      spaceBg.addColorStop(1, "#020617");
      bgCtx.fillStyle = spaceBg;
      bgCtx.fillRect(0, 0, W, H);

      // Stars
      stars.forEach(s => {
        s.opacity = 0.2 + 0.8 * Math.abs(Math.sin(frame * s.twinkleSpeed + s.twinklePhase));
        bgCtx.fillStyle = "#fff";
        bgCtx.globalAlpha = s.opacity;
        bgCtx.fillRect(s.x, s.y, s.size, s.size);
      });
      bgCtx.globalAlpha = 1;

      // Depth fog — bottom 40%
      const fog = bgCtx.createLinearGradient(0, H * 0.6, 0, H);
      fog.addColorStop(0, "rgba(2,6,23,0)");
      fog.addColorStop(1, "rgba(2,6,23,0.95)");
      bgCtx.fillStyle = fog;
      bgCtx.fillRect(0, H * 0.6, W, H * 0.4);

      // Custom crosshair cursor (only on desktop)
      if (!mobile) {
        bgCtx.fillStyle = "#22c55e";
        bgCtx.fillRect(mx - 4, my, 8, 1);       // horizontal
        bgCtx.fillRect(mx, my - 4, 1, 8);       // vertical
        bgCtx.fillRect(mx - 1, my - 1, 2, 2);  // center 2x2
      }

      // ── Species cycling ────────────────────────────────────────────────────

      speciesTimerRef.current++;

      if (!fadingRef.current && speciesTimerRef.current >= HOLD_DUR) {
        fadingRef.current = true;
        fadeRef.current = 0;
        nextIdxRef.current = (speciesIdxRef.current + 1) % SPECIES.length;
        setFadingSpecies(true);
      }

      if (fadingRef.current) {
        fadeRef.current += 1 / FADE_DUR;
        if (fadeRef.current >= 1) {
          fadeRef.current = 1;
          fadingRef.current = false;
          speciesIdxRef.current = nextIdxRef.current;
          speciesTimerRef.current = 0;
          setSpeciesIdx(speciesIdxRef.current);
          setFadingSpecies(false);
        }
      }

      const curSp  = SPECIES[speciesIdxRef.current];
      const nextSp = SPECIES[nextIdxRef.current];
      const fp     = fadeRef.current;

      // ── Pet canvas ─────────────────────────────────────────────────────────

      const pSz = petCanvas.width;
      petCtx.clearRect(0, 0, pSz, pSz);

      // Glow — cross-fades between species colors
      const glowColor = fadingRef.current ? lerpColor(curSp.color, nextSp.color, fp) : curSp.color;
      const [gr, gg, gb] = hexToRgb(glowColor);

      // Distance from pet center to mouse — use cached position, no layout thrash
      const dist = Math.sqrt((mx - petCenter.x) ** 2 + (my - petCenter.y) ** 2);
      const proximity = Math.max(0, (200 - dist) / 200);

      // Stronger glow so pets pop against dark bg
      const glowBaseOpacity = 0.35 + proximity * 0.25;
      const glowRadius = pSz * 0.48;
      const glowGrad = petCtx.createRadialGradient(pSz / 2, pSz / 2, 0, pSz / 2, pSz / 2, glowRadius);
      glowGrad.addColorStop(0, `rgba(${gr},${gg},${gb},${glowBaseOpacity})`);
      glowGrad.addColorStop(0.5, `rgba(${gr},${gg},${gb},${glowBaseOpacity * 0.4})`);
      glowGrad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
      petCtx.fillStyle = glowGrad;
      petCtx.fillRect(0, 0, pSz, pSz);

      // Scale: fit the ~50-art-unit pet into canvas, with room for wings
      // Draw at offset (5, 2) in art units so dragon wings (-12 left) don't clip
      const scale = (pSz - 4) / 55; // slightly conservative to keep dragon in-bounds
      const drawX = 8;  // art-unit offset — centers body and gives wings room
      const drawY = 2;

      // Animated frame — speed boost when cursor is near
      const animFrame = dist < 200 ? frame * 1.5 : frame;

      // Draw current species (use setTransform for clean per-frame matrix)
      if (!fadingRef.current || fp < 1) {
        petCtx.save();
        petCtx.globalAlpha = fadingRef.current ? 1 - fp : 1;
        petCtx.setTransform(scale, 0, 0, scale, 0, 0);
        curSp.draw(petCtx, drawX, drawY, animFrame, curSp.color);
        petCtx.restore();
      }

      // Draw next species during cross-fade
      if (fadingRef.current && fp > 0) {
        petCtx.save();
        petCtx.globalAlpha = fp;
        petCtx.setTransform(scale, 0, 0, scale, 0, 0);
        nextSp.draw(petCtx, drawX, drawY, animFrame, nextSp.color);
        petCtx.restore();
      }
      petCtx.globalAlpha = 1;

      // ── CSS parallax on pet canvas element ────────────────────────────────

      if (!mobile && petCanvasEl.current) {
        const tx = (mx - W / 2) * 0.02;
        const ty = (my - H / 2) * 0.015;
        petCanvasEl.current.style.transform = `translate(calc(-50% + ${tx}px), calc(-60% + ${ty}px))`;
      }

      // ── Mouse proximity — speech bubble + sound ────────────────────────────

      const showBub = dist < 80;
      setShowBubble(showBub);
      if (showBub) {
        setTimeout(() => setBubbleReady(true), 10);
      } else {
        setBubbleReady(false);
      }

      if (dist < 80 && actxRef.current) {
        const si = speciesIdxRef.current;
        if (speciesSoundCooldowns[si] <= 0) {
          const sp = SPECIES[si];
          playTone(actxRef.current, sp.freq, sp.waveType, sp.dur, sp.gain);
          speciesSoundCooldowns[si] = 120; // 2s at 60fps
        }
      }
      for (let i = 0; i < speciesSoundCooldowns.length; i++) {
        if (speciesSoundCooldowns[i] > 0) speciesSoundCooldowns[i]--;
      }

      if (soundCooldown.current > 0) soundCooldown.current--;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup audio
  useEffect(() => () => {
    actxRef.current?.close().catch(() => {});
  }, []);

  const currentSp = SPECIES[speciesIdx];
  const displaySp = SPECIES[speciesIdx];

  // Blink hint
  const [hintOpacity, setHintOpacity] = useState(0.3);
  useEffect(() => {
    const iv = setInterval(() => {
      setHintOpacity(o => {
        const next = o + 0.02;
        return next > 1 ? 0.3 : next;
      });
    }, 50);
    return () => clearInterval(iv);
  }, []);

  const bubbleText = currentSp.speech;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#020617", position: "relative", cursor: "none" }}>

      {/* Layer 0 — Background canvas */}
      <canvas
        ref={bgCanvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      {/* Layer 1 — Pet hero canvas */}
      <canvas
        ref={petCanvasRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          zIndex: 1,
          imageRendering: "pixelated",
        }}
      />

      {/* Speech bubble — appears when cursor very close */}
      {showBubble && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, calc(-60% - ${(typeof window !== "undefined" && window.innerWidth < 640) ? 150 : 230}px)) scale(${bubbleReady ? 1 : 0})`,
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            background: "rgba(2,6,23,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "8px 16px",
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 10,
            letterSpacing: 2,
            color: "#e2e8f0",
            zIndex: 3,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {bubbleText}
        </div>
      )}

      {/* Layer 2 — UI Overlay */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>

        {/* Top left — identity */}
        <div style={{
          position: "absolute", top: 32, left: 32,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 11, fontWeight: "bold", letterSpacing: 6, color: "#334155",
        }}>
          GIT PET
        </div>

        {/* Top right — status */}
        <div style={{
          position: "absolute", top: 32, right: 32,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 9, letterSpacing: 3, color: "#1e293b",
        }}>
          BETA · git-pet-beta.vercel.app
        </div>

        {/* Center bottom — CTA */}
        <div style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          fontFamily: "'Courier New', Courier, monospace",
          pointerEvents: "none",
        }}>
          {/* Species name — fades with pet */}
          <div style={{
            fontSize: 10, letterSpacing: 4,
            color: displaySp.color,
            opacity: fadingSpecies ? 0.3 : 0.7,
            transition: "opacity 0.4s, color 0.4s",
            marginBottom: 12,
          }}>
            {displaySp.label}
          </div>

          {/* Main headline */}
          <div style={{
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#e2e8f0",
            lineHeight: 1.1,
            marginBottom: 32,
          }}>
            your commits.<br />your creature.
          </div>

          {/* CTA button */}
          <div style={{ pointerEvents: "auto" }}>
            <Link
              href="/api/auth/signin"
              style={{
                display: "inline-block",
                padding: "14px 36px",
                fontSize: 11,
                letterSpacing: 4,
                fontFamily: "'Courier New', Courier, monospace",
                fontWeight: "bold",
                color: "#020617",
                background: "#22c55e",
                border: "none",
                cursor: "pointer",
                textDecoration: "none",
                borderRadius: 0,
                transition: "background 0.15s, transform 0.1s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "#16a34a";
                (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.02)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "#22c55e";
                (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1)";
              }}
              onMouseDown={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "scale(0.98)"; }}
              onMouseUp={e => { (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.02)"; }}
            >
              CONNECT GITHUB
            </Link>
          </div>

          {/* Secondary link */}
          <div style={{ marginTop: 16, pointerEvents: "auto" }}>
            <Link
              href="/world"
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "#334155",
                textDecoration: "none",
                fontFamily: "'Courier New', Courier, monospace",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#475569"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#334155"; }}
            >
              or &nbsp; ◈ explore the world →
            </Link>
          </div>
        </div>

        {/* Bottom left — species flavor */}
        <div style={{
          position: "absolute", bottom: 24, left: 32,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 9, letterSpacing: 2, color: "#1e293b",
          opacity: fadingSpecies ? 0 : 1,
          transition: "opacity 0.4s",
        }}>
          {displaySp.flavor}
        </div>

        {/* Bottom right — interaction hint */}
        {hintVisible && (
          <div style={{
            position: "absolute", bottom: 24, right: 32,
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 9, letterSpacing: 2, color: "#1e293b",
            opacity: hintOpacity,
          }}>
            · move mouse to interact ·
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `* { box-sizing: border-box; }` }} />
    </div>
  );
}
