import type { PetState } from "@git-pet/core";
import { getSprite, getSpriteView } from "./sprites";
import type { PetView } from "./sprites";

const PIXEL_SIZE = 6;

/**
 * Cycles through the four cardinal views at a given cadence.
 *
 * @param frame    Current animation frame counter.
 * @param fps      Frames per second used by the render loop (default 30).
 * @param holdSecs How many seconds to hold each view before rotating (default 1.5).
 * @returns The current PetView for this frame.
 */
export function turntableView(
  frame: number,
  fps = 30,
  holdSecs = 1.5
): PetView {
  const views: PetView[] = ["front", "right", "back", "left"];
  const holdFrames = Math.round(fps * holdSecs);
  const index = Math.floor(frame / holdFrames) % views.length;
  return views[index];
}

export function drawPet(
  ctx: CanvasRenderingContext2D,
  state: PetState,
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
  view: PetView = "front",
  species?: string
): void {
  // Background
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Checkerboard grid (retro LCD feel)
  for (let x = 0; x < canvasWidth; x += PIXEL_SIZE) {
    for (let y = 0; y < canvasHeight; y += PIXEL_SIZE) {
      if ((x / PIXEL_SIZE + y / PIXEL_SIZE) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.015)";
        ctx.fillRect(x, y, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }

  // Scanlines
  for (let y = 0; y < canvasHeight; y += 2) {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, y, canvasWidth, 1);
  }

  const pixels = getSprite(state.stage, state.mood, state.primaryColor, frame, view, species);
  const spriteW = 13 * PIXEL_SIZE;
  const spriteH = 11 * PIXEL_SIZE;
  const ox = Math.floor((canvasWidth - spriteW) / 2) - PIXEL_SIZE;
  const oy = Math.floor((canvasHeight - spriteH) / 2);

  // Drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(canvasWidth / 2, oy + spriteH + 8, 28, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pixels
  pixels.forEach(([x, y, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x * PIXEL_SIZE, oy + y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
  });

  // Mood particles
  if (state.mood === "happy" && frame % 20 < 10) {
    const pf = (frame % 60) / 60;
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(ox + 2 * PIXEL_SIZE, Math.round(oy - pf * 30), 4, 4);
    ctx.fillStyle = "#86efac";
    ctx.fillRect(ox + 10 * PIXEL_SIZE, Math.round(oy - ((pf + 0.3) % 1) * 30), 4, 4);
  }

  if (state.mood === "tired" || state.mood === "coma") {
    const zf = (frame % 80) / 80;
    ctx.font = `${Math.round(8 + zf * 4)}px monospace`;
    ctx.fillStyle = `rgba(148,163,184,${0.8 - zf * 0.6})`;
    ctx.fillText("z", ox + 10 * PIXEL_SIZE + zf * 10, oy + 2 * PIXEL_SIZE - zf * 20);
  }

  // View label (subtle, bottom center)
  if (view !== "front") {
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(71,85,105,0.8)";
    ctx.textAlign = "center";
    ctx.fillText(view.toUpperCase(), canvasWidth / 2, canvasHeight - 6);
    ctx.textAlign = "left";
  }
}