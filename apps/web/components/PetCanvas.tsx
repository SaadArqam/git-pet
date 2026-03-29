"use client";

import { useEffect, useRef, useState } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";
import type { Species } from "@/lib/redis";

type ViewStep = "front" | "side" | "back";
const VIEWS: ViewStep[] = ["front", "side", "back"];
// Cycle order: front -> side -> back -> side -> front
const CYCLE: ViewStep[] = ["front", "side", "back", "side"];

// -------------------------------------------------------------
// INLINE SPECIES DRAWERS (from SpeciesSelect.tsx)
// -------------------------------------------------------------
function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(8, 16, 24, 18, color);
  p(10, 4, 20, 16, color);
  p(10, 0, 6, 8, color); p(24, 0, 6, 8, color);
  p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4");
  p(14, 14, 12, 8, "#cbd5e1");
  p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b");
  p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff");
  p(18, 17, 4, 3, "#1e293b");
  p(9, 30, 6, 10, color); p(17, 30, 6, 10, color);
  p(25, 30, 6, 10, color);
  const tailWag = Math.sin(frame * 0.15) * 4;
  p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color);
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(6, 18, 28, 20, color);
  p(8, 4, 24, 18, color);
  p(8, 0, 5, 7, color); p(27, 0, 5, 7, color);
  p(9, 1, 3, 4, "#fde68a");
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
  p(4, 20, 32, 18, color);
  p(2, 24, 36, 10, color);
  p(6, 6, 24, 18, color);
  p(6, 4, 7, 6, color); p(27, 4, 7, 6, color);
  p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b");
  p(12, 13, 2, 2, "#fff"); p(26, 13, 2, 2, "#fff");
  p(13, 19, 14, 5, "#92400e");
  p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24");
  p(17, 1, 6, 6, "#fde68a");
  p(6, 34, 8, 8, color); p(16, 34, 8, 8, color); p(26, 34, 8, 8, color);
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2;
  const wingFlap = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  p(-8, 8 + wingFlap, 12, 18, "#6d28d9");
  p(36, 8 + wingFlap, 12, 18, "#6d28d9");
  p(-12, 6 + wingFlap, 8, 10, "#7c3aed");
  p(44, 6 + wingFlap, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color);
  p(10, 4, 20, 18, color);
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
  p(2, 4 + gillWave, 5, 14, "#f9a8d4");
  p(0, 2 + gillWave, 4, 8, "#fda4af");
  p(33, 4 + gillWave, 5, 14, "#f9a8d4");
  p(36, 2 + gillWave, 4, 8, "#fda4af");
  p(5, 1 + gillWave, 4, 10, "#f9a8d4");
  p(31, 1 + gillWave, 4, 10, "#f9a8d4");
  p(4, 22, 32, 14, color);
  p(2, 26, 36, 8, color);
  p(6, 8, 28, 18, color);
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b");
  p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b");
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6");
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color);
  p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4");
}

const SPECIES_DRAWERS: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) => void> = {
  wolf: drawWolf,
  sabertooth: drawSabertooth,
  capybara: drawCapybara,
  dragon: drawDragon,
  axolotl: drawAxolotl,
};

const SPECIES_PRIMARY: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#f8fafc",
  capybara:   "#a16207",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};
// -------------------------------------------------------------

interface Props {
  petState: PetState;
  species: Species;
}
export function PetCanvas({
  petState,
  species,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  // 👁️ View state (auto-cycles every 2s)
  const [view, setView] = useState<ViewStep>("front");
  const cycleIndexRef = useRef(0);
  
  // We mirror the view state in a ref so the requestAnimationFrame loop
  // doesn't need to be re-bound on every view change
  const viewRef = useRef<ViewStep>("front");
  viewRef.current = view;

  const autoRotateRef = useRef(true);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetAutoRotate = () => {
    autoRotateRef.current = false;
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      autoRotateRef.current = true;
    }, 4000);
  };

  // Auto-cycle view every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!autoRotateRef.current) return;
      cycleIndexRef.current = (cycleIndexRef.current + 1) % CYCLE.length;
      setView(CYCLE[cycleIndexRef.current]!);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const loop = () => {
      frameRef.current++;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Clean species string since it might be '"dragon"' from caching wrapper
      const cleanSpecies = (species ?? "").replace(/['"]/g, "").toLowerCase();
      const drawFn = SPECIES_DRAWERS[cleanSpecies];
      
      if (drawFn) {
        // Draw the custom inline pixel art
        const finalColor = SPECIES_PRIMARY[cleanSpecies] || petState.primaryColor;
        ctx.save();
        
        // The inline functions draw in a ~40x40 bounding box. 
        // We scale it up to fit the 240x180 canvas nicely.
        const scale = 2.5; 
        ctx.scale(scale, scale);
        
        // Center the 40x44 sprite in the scaled context
        const cx = (canvas.width / scale - 40) / 2;
        const cy = (canvas.height / scale - 44) / 2;
        
        drawFn(ctx, cx, cy, frameRef.current, finalColor);
        ctx.restore();
      } else {
        // Fallback to renderer logic (draws Default Cat)
        drawPet(
          ctx,
          petState,
          frameRef.current,
          canvas.width,
          canvas.height,
          viewRef.current,
          species
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [petState, species]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={240}
        height={180}
        style={{
          width: "100%",
          imageRendering: "pixelated",
        }}
      />
      
      {/* 🔄 View Indicator F · S · B */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
        {VIEWS.map(v => (
          <span
            key={v}
            onClick={() => { setView(v); resetAutoRotate(); }}
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: 2,
              cursor: "pointer",
              color: view === v ? petState.primaryColor : "#334155",
              borderBottom: view === v ? `1px solid ${petState.primaryColor}` : "1px solid transparent",
              paddingBottom: 2,
              transition: "color 0.2s",
            }}
          >
            {v === "front" ? "F" : v === "side" ? "S" : "B"}
          </span>
        ))}
      </div>
    </div>
  );
}