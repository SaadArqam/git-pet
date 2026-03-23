import type { Mood, Stage } from "@git-pet/core";
import { darken, lighten } from "./colors";

export type Pixel = [number, number, string]; // [x, y, color]

export function getSprite(
  stage: Stage,
  mood: Mood,
  primaryColor: string,
  frame: number
): Pixel[] {
  const dark  = darken(primaryColor, 40);
  const light = lighten(primaryColor, 40);
  const blink = frame % 40 === 0;
  const eye   = mood === "coma" ? "#334155"
              : mood === "sad"  ? "#64748b"
              : "#1e293b";

  switch (stage) {
    case "egg":      return eggSprite(primaryColor, dark, light, frame);
    case "hatchling": return hatchlingSprite(primaryColor, dark, light, eye, mood, blink, frame);
    case "adult":    return adultSprite(primaryColor, dark, light, eye, mood, blink, frame);
    case "legend":   return legendSprite(primaryColor, dark, light, eye, mood, blink, frame);
  }
}

function eggSprite(C: string, dark: string, light: string, frame: number): Pixel[] {
  const wobble = Math.sin(frame * 0.05) > 0.8 ? 1 : 0;
  const px: Pixel[] = [];
  const shell: [number,number][] = [
    [3,1],[4,1],[5,1],[6,1],
    [2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
    [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
    [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
    [2,5],[3,5],[4,5],[5,5],[6,5],[7,5],
    [3,6],[4,6],[5,6],[6,6],
    [3,7],[4,7],[5,7],[6,7],
  ];
  shell.forEach(([x, y]) => px.push([x + wobble, y, C]));
  [[4,2],[5,2],[4,3]].forEach(([x,y]) => px.push([x + wobble, y, light]));
  [[6,3],[7,3],[7,4],[6,5]].forEach(([x,y]) => px.push([x + wobble, y, dark]));
  if (frame > 60) {
    [[5,5],[5,6]].forEach(([x,y]) => px.push([x + wobble, y, dark]));
  }
  return px;
}

function hatchlingSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
): Pixel[] {
  const px: Pixel[] = [];
  const bob = Math.floor(Math.sin(frame * 0.08) * 1);

  const body: [number,number][] = [
    [3,2],[4,2],[5,2],[6,2],
    [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
    [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
    [3,5],[4,5],[5,5],[6,5],
    [3,6],[4,6],[5,6],[6,6],
    [3,7],[4,7],[5,7],[6,7],
  ];
  body.forEach(([x, y]) => px.push([x, y + bob, C]));
  [[3,2],[4,2]].forEach(([x,y]) => px.push([x, y + bob, light]));

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

  const body: [number,number][] = [
    [3,5],[4,5],[5,5],[6,5],[7,5],
    [2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],
    [2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[8,7],
    [3,8],[4,8],[5,8],[6,8],[7,8],
  ];
  const head: [number,number][] = [
    [3,2],[4,2],[5,2],[6,2],[7,2],
    [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],
    [2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
  ];
  body.forEach(([x,y]) => px.push([x, y + bob, C]));
  head.forEach(([x,y]) => px.push([x, y + bob, C]));

  // Ears + tail
  px.push([3, 1 + bob, dark]); px.push([7, 1 + bob, dark]);
  [[9,6],[10,5],[10,4]].forEach(([x,y]) => px.push([x, y + bob, dark]));
  [[3,2],[4,2]].forEach(([x,y]) => px.push([x, y + bob, light]));

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

  [[3,9],[5,9],[7,9]].forEach(([x,y]) => px.push([x, y + bob, dark]));
  return px;
}

function legendSprite(
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
): Pixel[] {
  const px = adultSprite(C, dark, light, eye, mood, blink, frame);
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);

  // Crown
  [[3,0],[5,0],[7,0]].forEach(([x,y]) => px.push([x, y + bob, "#EAB308"]));
  [[3,1],[4,1],[5,1],[6,1],[7,1]].forEach(([x,y]) => px.push([x, y + bob, "#EAB308"]));

  // Floating aura particles
  const auraFrame = Math.floor(frame * 0.15) % 4;
  const auras: [number,number][][] = [
    [[0,4],[12,4],[6,-1]],
    [[0,6],[12,6],[1,1],[11,1]],
    [[0,5],[12,5],[6,10]],
    [[1,3],[11,3],[1,8],[11,8]],
  ];
  auras[auraFrame]!.forEach(([x,y]) => px.push([x, y + bob, "#FDE047"]));
  return px;
}