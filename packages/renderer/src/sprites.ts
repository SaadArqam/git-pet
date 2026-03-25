import type { Mood, Stage } from "@git-pet/core";
import { darken, lighten } from "./colors";

export type Pixel = [number, number, string]; // [x, y, color]
export type SpriteView = "front" | "side" | "back";

import { getSpeciesSpriteView } from "./species";

export type PetView = "front" | "left" | "right" | "back";

export function getSprite(
  stage: Stage,
  mood: Mood,
  primaryColor: string,
  frame: number,
  view: PetView = "front",
  species?: string
): Pixel[] {
  let spriteView: SpriteView = "front";
  if (view === "back") spriteView = "back";
  if (view === "left" || view === "right") spriteView = "side";

  const pixels = getSpriteView(stage, mood, primaryColor, frame, spriteView, species);

  if (view === "left") {
    return pixels.map(([x, y, color]) => [12 - x, y, color]);
  }

  return pixels;
}

export function getSpriteView(
  stage: Stage,
  mood: Mood,
  primaryColor: string,
  frame: number,
  view: SpriteView,
  species?: string
): Pixel[] {
  let pixels: Pixel[] = [];

  if (species && species !== "default") {
    const custom = getSpeciesSpriteView(species, stage, mood, primaryColor, frame, view);
    if (custom) pixels = custom;
  }

  if (pixels.length === 0) {
    const dark = darken(primaryColor, 40);
    const light = lighten(primaryColor, 40);
    const blink = frame % 40 === 0;
    const eye = mood === "coma" ? "#334155" : mood === "sad" ? "#64748b" : "#1e293b";

    if (view === "front") {
      switch (stage) {
        case "egg": pixels = eggSprite(primaryColor, dark, light, frame); break;
        case "hatchling": pixels = hatchlingSprite(primaryColor, dark, light, eye, mood, blink, frame); break;
        case "adult": pixels = adultSprite(primaryColor, dark, light, eye, mood, blink, frame); break;
        case "legend": pixels = legendSprite(primaryColor, dark, light, eye, mood, blink, frame); break;
      }
    } else if (view === "side") {
      switch (stage) {
        case "egg": pixels = eggSideSprite(primaryColor, dark, light, frame); break;
        case "hatchling": pixels = hatchlingSideSprite(primaryColor, dark, light, eye, mood, frame); break;
        case "adult": pixels = adultSideSprite(primaryColor, dark, light, eye, mood, frame); break;
        case "legend": pixels = legendSideSprite(primaryColor, dark, light, eye, mood, frame); break;
      }
    } else if (view === "back") {
      switch (stage) {
        case "egg": pixels = eggBackSprite(primaryColor, dark, light, frame); break;
        case "hatchling": pixels = hatchlingBackSprite(primaryColor, dark, light, frame); break;
        case "adult": pixels = adultBackSprite(primaryColor, dark, light, frame); break;
        case "legend": pixels = legendBackSprite(primaryColor, dark, light, frame); break;
      }
    }
  }

  if (pixels.length === 0) {
    pixels = getSprite(stage, mood, primaryColor, frame);
  }

  // 🛡️ Clamp coordinates to prevent them from rendering out of the 13x11 bounding box
  return pixels.map(([x, y, color]) => [
    Math.max(0, Math.min(12, x)),
    Math.max(0, Math.min(10, y)),
    color
  ]);
}



// ─── FRONT SPRITES (unchanged) ───────────────────────────────────────────────

function eggSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const wobble = Math.sin(frame * 0.05) > 0.8 ? 1 : 0;
  const px: Pixel[] = [];
  const shell: [number, number][] = [
    [3, 1], [4, 1], [5, 1], [6, 1],
    [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5],
    [3, 6], [4, 6], [5, 6], [6, 6],
    [3, 7], [4, 7], [5, 7], [6, 7],
  ];
  shell.forEach(([x, y]) => px.push([x + wobble, y, C]));
  [[4, 2], [5, 2], [4, 3]].forEach(([x, y]) => px.push([x + wobble, y, light]));
  [[6, 3], [7, 3], [7, 4], [6, 5]].forEach(([x, y]) => px.push([x + wobble, y, dark]));
  if (frame > 60) {
    [[5, 5], [5, 6]].forEach(([x, y]) => px.push([x + wobble, y, dark]));
  }
  return px;
}

function hatchlingSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.08) * 1);
  const body: [number, number][] = [
    [3, 2], [4, 2], [5, 2], [6, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [3, 5], [4, 5], [5, 5], [6, 5],
    [3, 6], [4, 6], [5, 6], [6, 6],
    [3, 7], [4, 7], [5, 7], [6, 7],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  [[3, 2], [4, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  if (!blink) {
    px.push([3, 3 + bob, eye]);
    px.push([6, 3 + bob, eye]);
  }
  if (mood === "happy") {
    px.push([4, 4 + bob, eye]); px.push([5, 4 + bob, eye]);
  } else if (mood === "sad" || mood === "coma") {
    px.push([4, 5 + bob, eye]); px.push([5, 5 + bob, eye]);
  } else {
    px.push([4, 4 + bob, eye]); px.push([5, 4 + bob, eye]);
  }
  px.push([3, 8 + bob, dark]);
  px.push([6, 8 + bob, dark]);
  return px;
}

function adultSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  const body: [number, number][] = [
    [3, 5], [4, 5], [5, 5], [6, 5], [7, 5],
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
    [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
    [3, 8], [4, 8], [5, 8], [6, 8], [7, 8],
  ];
  const head: [number, number][] = [
    [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  head.forEach(([x, y]) => px.push([x, y + bob, C]));
  px.push([3, 1 + bob, dark]); px.push([7, 1 + bob, dark]);
  [[9, 6], [10, 5], [10, 4]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  [[3, 2], [4, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  if (!blink) {
    px.push([3, 3 + bob, eye]); px.push([4, 3 + bob, eye]);
    px.push([6, 3 + bob, eye]); px.push([7, 3 + bob, eye]);
    const pupilY = mood === "happy" ? 3 + bob : 4 + bob;
    px.push([3, pupilY, "#fff"]); px.push([6, pupilY, "#fff"]);
  }
  if (mood === "happy") {
    px.push([4, 5 + bob, dark]); px.push([5, 5 + bob, dark]); px.push([6, 5 + bob, dark]);
  } else if (mood === "sad" || mood === "coma") {
    px.push([4, 5 + bob, dark]); px.push([5, 4 + bob, dark]); px.push([6, 5 + bob, dark]);
  } else {
    px.push([4, 5 + bob, dark]); px.push([5, 5 + bob, dark]); px.push([6, 5 + bob, dark]);
  }
  [[3, 9], [5, 9], [7, 9]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  return px;
}

function legendSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
): Pixel[] {
  const px = adultSprite(C, dark, light, eye, mood, blink, frame);
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  [[3, 0], [5, 0], [7, 0]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  const auraFrame = Math.floor(frame * 0.15) % 4;
  const auras: [number, number][][] = [
    [[0, 4], [12, 4], [6, -1]],
    [[0, 6], [12, 6], [1, 1], [11, 1]],
    [[0, 5], [12, 5], [6, 10]],
    [[1, 3], [11, 3], [1, 8], [11, 8]],
  ];
  auras[auraFrame]!.forEach(([x, y]) => px.push([x, y + bob, "#FDE047"]));
  return px;
}

// ─── SIDE SPRITES ────────────────────────────────────────────────────────────

function eggSideSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const wobble = Math.sin(frame * 0.05) > 0.8 ? 1 : 0;
  const px: Pixel[] = [];
  const shell: [number, number][] = [
    [3, 1], [4, 1], [5, 1],
    [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
    [3, 6], [4, 6], [5, 6],
    [3, 7], [4, 7], [5, 7],
  ];
  shell.forEach(([x, y]) => px.push([x + wobble, y, C]));
  [[3, 2], [4, 2]].forEach(([x, y]) => px.push([x + wobble, y, light]));
  [[6, 3], [6, 4], [5, 5]].forEach(([x, y]) => px.push([x + wobble, y, dark]));
  return px;
}

function hatchlingSideSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, frame: number
): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.08) * 1);
  // Side profile — narrower body
  const body: [number, number][] = [
    [3, 2], [4, 2], [5, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
    [3, 5], [4, 5], [5, 5],
    [3, 6], [4, 6], [5, 6],
    [4, 7], [5, 7],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  [[3, 2], [4, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  // Single side eye
  px.push([5, 3 + bob, eye]);
  // Tail stub
  px.push([2, 5 + bob, dark]); px.push([1, 4 + bob, dark]);
  // Legs
  px.push([3, 8 + bob, dark]); px.push([5, 8 + bob, dark]);
  return px;
}

function adultSideSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, frame: number
): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  // Body side view
  const body: [number, number][] = [
    [3, 5], [4, 5], [5, 5], [6, 5],
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6],
    [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7],
    [3, 8], [4, 8], [5, 8], [6, 8],
  ];
  // Head side view
  const head: [number, number][] = [
    [3, 2], [4, 2], [5, 2], [6, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  head.forEach(([x, y]) => px.push([x, y + bob, C]));
  // Single ear
  px.push([6, 1 + bob, dark]);
  // Tail going back
  [[8, 6], [9, 5], [9, 4], [8, 4]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  // Light patch
  [[3, 2], [4, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  // Single side eye
  px.push([6, 3 + bob, eye]); px.push([7, 3 + bob, eye]);
  px.push([6, 3 + bob, "#fff"]);
  // Nose
  px.push([7, 4 + bob, dark]);
  // Legs — alternating walk
  const walk = Math.floor(frame * 0.1) % 2;
  if (walk === 0) {
    px.push([3, 9 + bob, dark]); px.push([6, 9 + bob, dark]);
  } else {
    px.push([4, 9 + bob, dark]); px.push([5, 9 + bob, dark]);
  }
  return px;
}

function legendSideSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, frame: number
): Pixel[] {
  const px = adultSideSprite(C, dark, light, eye, mood, frame);
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  // Crown side view
  [[4, 0], [5, 0], [6, 0]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  [[3, 1], [4, 1], [5, 1], [6, 1]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  // Aura
  const auraFrame = Math.floor(frame * 0.15) % 4;
  const auras: [number, number][][] = [
    [[0, 4], [10, 4]],
    [[0, 6], [10, 6]],
    [[0, 5], [10, 5]],
    [[1, 3], [1, 8]],
  ];
  auras[auraFrame]!.forEach(([x, y]) => px.push([x, y + bob, "#FDE047"]));
  return px;
}

// ─── BACK SPRITES ────────────────────────────────────────────────────────────

function eggBackSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  // Egg looks almost same from back, slightly different shading
  const wobble = Math.sin(frame * 0.05) > 0.8 ? 1 : 0;
  const px: Pixel[] = [];
  const shell: [number, number][] = [
    [3, 1], [4, 1], [5, 1], [6, 1],
    [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5],
    [3, 6], [4, 6], [5, 6], [6, 6],
    [3, 7], [4, 7], [5, 7], [6, 7],
  ];
  shell.forEach(([x, y]) => px.push([x + wobble, y, C]));
  // Shading reversed — dark on left, light on right
  [[2, 3], [2, 4], [3, 5]].forEach(([x, y]) => px.push([x + wobble, y, dark]));
  [[6, 2], [7, 2], [7, 3]].forEach(([x, y]) => px.push([x + wobble, y, light]));
  return px;
}

function hatchlingBackSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.08) * 1);
  const body: [number, number][] = [
    [3, 2], [4, 2], [5, 2], [6, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [3, 5], [4, 5], [5, 5], [6, 5],
    [3, 6], [4, 6], [5, 6], [6, 6],
    [3, 7], [4, 7], [5, 7], [6, 7],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  // Back — no eyes, show back of head with dark shading
  [[5, 2], [6, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  [[2, 4], [2, 5], [7, 4], [7, 5]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  // Tail nub at bottom
  px.push([4, 8 + bob, dark]); px.push([5, 8 + bob, dark]);
  px.push([3, 8 + bob, dark]); px.push([6, 8 + bob, dark]);
  return px;
}

function adultBackSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  const body: [number, number][] = [
    [3, 5], [4, 5], [5, 5], [6, 5], [7, 5],
    [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
    [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
    [3, 8], [4, 8], [5, 8], [6, 8], [7, 8],
  ];
  const head: [number, number][] = [
    [3, 2], [4, 2], [5, 2], [6, 2], [7, 2],
    [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3],
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  head.forEach(([x, y]) => px.push([x, y + bob, C]));
  // Back ears
  px.push([3, 1 + bob, dark]); px.push([7, 1 + bob, dark]);
  // Tail prominent from back
  [[9, 6], [10, 5], [10, 4], [9, 4]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  // Back shading — darker sides, lighter center back
  [[5, 2], [6, 2]].forEach(([x, y]) => px.push([x, y + bob, light]));
  [[2, 3], [2, 4], [8, 3], [8, 4]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  [[2, 6], [2, 7], [8, 6], [8, 7]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  // Legs from back
  [[3, 9], [5, 9], [7, 9]].forEach(([x, y]) => px.push([x, y + bob, dark]));
  return px;
}

function legendBackSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const px = adultBackSprite(C, dark, light, frame);
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  [[3, 0], [5, 0], [7, 0]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
  const auraFrame = Math.floor(frame * 0.15) % 4;
  const auras: [number, number][][] = [
    [[0, 4], [12, 4], [6, -1]],
    [[0, 6], [12, 6], [1, 1], [11, 1]],
    [[0, 5], [12, 5], [6, 10]],
    [[1, 3], [11, 3], [1, 8], [11, 8]],
  ];
  auras[auraFrame]!.forEach(([x, y]) => px.push([x, y + bob, "#FDE047"]));
  return px;
}