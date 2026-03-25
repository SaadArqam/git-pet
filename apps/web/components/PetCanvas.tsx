"use client";

import { useEffect, useRef, useState } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";
import type { PetView } from "@git-pet/renderer";
import type { Species } from "@/lib/redis";

interface Props {
  petState: PetState;
  species: Species;
  autoRotate?: boolean;
  rotationSpeed?: number;
}
export function PetCanvas({
  petState,
  species,
  autoRotate = true,
  rotationSpeed = 0.01,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  // 👁️ View state (auto-cycles every 2s)
  const [view, setView] = useState<PetView>("front");
  const cycleIndexRef = useRef(0);
  
  // We mirror the view state in a ref so the requestAnimationFrame loop
  // doesn't need to be re-bound on every view change (prevents re-mounting listeners/loop frame drops)
  const viewRef = useRef<PetView>("front");
  viewRef.current = view;

  // 🔄 Rotation state
  const rotationRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Auto-cycle view every 2 seconds
  useEffect(() => {
    if (!autoRotate) return;

    const cycle: PetView[] = ["front", "right", "back", "left"];

    const interval = setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % cycle.length;
      setView(cycle[cycleIndexRef.current]);
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRotate]);

  const handleViewClick = (target: PetView) => {
    setView(target);
    if (target === "front") cycleIndexRef.current = 0;
    else if (target === "right") cycleIndexRef.current = 1;
    else if (target === "back") cycleIndexRef.current = 2;
    else if (target === "left") cycleIndexRef.current = 3;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    // 🖱️ Mouse Events
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - lastXRef.current;
      rotationRef.current += delta * 0.01;
      lastXRef.current = e.clientX;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);

    const loop = () => {
      frameRef.current++;

      // 🔄 Auto rotation
      if (autoRotate && !isDraggingRef.current) {
        rotationRef.current += rotationSpeed;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 🎯 Apply rotation (centered)
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotationRef.current);

      drawPet(
        ctx,
        petState,
        frameRef.current,
        canvas.width,
        canvas.height,
        viewRef.current,
        species
      );

      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [petState, autoRotate, rotationSpeed]);

  const getDotStyle = (target: PetView) => ({
    cursor: "pointer",
    color: view === target ? petState.primaryColor : "#475569",
    fontWeight: view === target ? "bold" : "normal",
    transition: "color 0.2s ease-in-out",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={240}
        height={180}
        style={{
          width: "100%",
          imageRendering: "pixelated",
          cursor: "grab",
        }}
      />
      
      {/* 🔄 View Indicator F · R · B · L */}
      <div
        style={{
          marginTop: "12px",
          display: "flex",
          gap: "12px",
          fontFamily: "monospace",
          fontSize: "12px",
          userSelect: "none",
        }}
      >
        <span style={getDotStyle("front")} onClick={() => handleViewClick("front")}>F</span>
        <span style={{ color: "#334155" }}>·</span>
        <span style={getDotStyle("right")} onClick={() => handleViewClick("right")}>R</span>
        <span style={{ color: "#334155" }}>·</span>
        <span style={getDotStyle("back")} onClick={() => handleViewClick("back")}>B</span>
        <span style={{ color: "#334155" }}>·</span>
        <span style={getDotStyle("left")} onClick={() => handleViewClick("left")}>L</span>
      </div>
    </div>
  );
}