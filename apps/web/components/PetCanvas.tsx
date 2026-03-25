"use client";

import { useEffect, useRef, useState } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";
import type { SpriteView } from "@git-pet/renderer";
import type { Species } from "@/lib/redis";

type ViewStep = "front" | "side" | "back";
const VIEWS: ViewStep[] = ["front", "side", "back"];
// Cycle order: front -> side -> back -> side -> front
const CYCLE: ViewStep[] = ["front", "side", "back", "side"];

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

      drawPet(
        ctx,
        petState,
        frameRef.current,
        canvas.width,
        canvas.height,
        viewRef.current,
        species
      );

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