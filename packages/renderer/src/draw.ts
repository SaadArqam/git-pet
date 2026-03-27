import type { PetState } from "@git-pet/core";
import { getSpriteView } from "./sprites";
import type { SpriteView } from "./sprites";
import { getSpeciesRects } from "./speciesRects";

const PIXEL_SIZE = 6;

export function drawPet(
  ctx: CanvasRenderingContext2D,
  state: PetState,
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
  view: SpriteView = "front",
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

  const rects = (species && species !== "default") 
    ? getSpeciesRects(species, frame, state.primaryColor) 
    : null;

  let ox = 0, oy = 0;

  if (rects && rects.length > 0) {
    // dynamically scale based on canvasWidth (base width of 80 looks good with scale 1)
    const scale = Math.min(canvasWidth / 80, canvasHeight / 80) * 1.5; 
    const spriteW = 40 * scale;
    const spriteH = 40 * scale;
    
    // adjust centering for rects
    ox = Math.floor((canvasWidth - spriteW) / 2) + 8 * scale;
    oy = Math.floor((canvasHeight - spriteH) / 2) + 2 * scale;

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(canvasWidth / 2, oy + 32 * scale, 14 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rects
    rects.forEach(([rx, ry, rw, rh, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + rx * scale, oy + ry * scale, rw * scale, rh * scale);
    });

  } else {
    const pixels = getSpriteView(state.stage, state.mood, state.primaryColor, frame, view, species);
    const spriteW = 13 * PIXEL_SIZE;
    const spriteH = 11 * PIXEL_SIZE;
    ox = Math.floor((canvasWidth - spriteW) / 2) - PIXEL_SIZE;
    oy = Math.floor((canvasHeight - spriteH) / 2);

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
  }

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