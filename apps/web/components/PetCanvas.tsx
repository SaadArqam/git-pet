"use client";

import { useEffect, useRef } from "react";
import type { PetState } from "@git-pet/core";
import { drawPet } from "@git-pet/renderer";

interface Props {
  petState: PetState;
}

export function PetCanvas({ petState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const loop = () => {
      frameRef.current++;
      drawPet(ctx, petState, frameRef.current, canvas.width, canvas.height);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [petState]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={180}
      style={{ width: "100%", imageRendering: "pixelated" }}
    />
  );
}