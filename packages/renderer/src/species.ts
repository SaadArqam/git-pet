import type { Mood, Stage } from "@git-pet/core";
import type { Pixel, SpriteView } from "./sprites";
import { darken, lighten } from "./colors";

export type Species = "default" | "wolf" | "sabertooth" | "capybara" | "dragon" | "axolotl";

type CharMap = Record<string, string>;

function parseSolid(art: string[], colorMap: CharMap, bobFactor: number) {
  const coords: [number, number, string][] = [];
  for (let y = 0; y < art.length; y++) {
    for (let x = 0; x < art[y].length; x++) {
      const char = art[y][x];
      if (char && char !== ' ' && colorMap[char]) {
        coords.push([x, y, colorMap[char]]);
      }
    }
  }
  return function(C: string, dark: string, light: string, eye: string, mood: Mood, blink: boolean, frame: number) {
    const px: Pixel[] = [];
    const bob = Math.floor(Math.sin(frame * bobFactor) * 1);
    
    // We handle logic for eyes missing on blink, or mood shifting for pupil
    coords.forEach(([x, y, colorId]) => {
      if (blink && (colorId === "EYE" || colorId === "PUPIL")) return;
      
      let finalColor = colorId;
      if (colorId === "C") finalColor = C;
      else if (colorId === "D") finalColor = dark;
      else if (colorId === "L") finalColor = light;
      else if (colorId === "EYE") finalColor = eye;
      else if (colorId === "PUPIL") finalColor = "#fff";
      
      // Basic mood logic for pupils going down if sad
      let finalY = y + bob;
      if (colorId === "PUPIL" && (mood === "sad" || mood === "coma")) {
        finalY += 1; // Look down
      }
      
      px.push([x, finalY, finalColor]);
    });
    return px;
  };
}

const map = { C: "C", D: "D", L: "L", e: "EYE", w: "PUPIL", y: "#eab308", r: "#ef4444", o: "#f97316", g: "#22c55e", p: "#db2777", s: "#f472b6" };

// ---------- WOLF ----------
const wolfAdultFront = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCwCCC    ",
  "  CCeCeCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "   DDDDD     ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.07);

const wolfAdultSide = parseSolid([
  "      D      ",
  "     LCL     ",
  "     CCCw    ",
  "     CCeC    ",
  "    CCCCC    ",
  "    CDDDC    ",
  " DD DDDDD    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.07);

const wolfAdultBack = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D     D    "
], map, 0.07);

const wolfHatchlingFront = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCewCCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "  D     D    "
], map, 0.08);

const wolfHatchlingSide = parseSolid([
  "      D      ",
  "     LCL     ",
  "     CewC    ",
  "    CCCCC    ",
  " DD CDDDC    ",
  "  D     D    "
], map, 0.08);

const wolfHatchlingBack = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "  D     D    "
], map, 0.08);

const wolfEgg = parseSolid([
  "    CCC      ",
  "   LCCCD     ",
  "  LLCCCDD    ",
  "  LCCCCDD    ",
  "  LCCCCDD    ",
  "   CCCDD     ",
  "    CCC      "
], map, 0.05);

// ---------- SABERTOOTH ----------
const saberAdultFront = parseSolid([
  "   D   D     ",
  "  CCC CCC    ",
  "  CCCwCCC    ",
  "  CCeCeCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "   ww ww     ",
  "  CCCCCCC    ",
  "  D  D  D    "
], map, 0.07);

const saberAdultSide = parseSolid([
  "      D      ",
  "     CCC     ",
  "     CCCw    ",
  "     CCeC    ",
  "    CCCCC    ",
  "    CDDDC    ",
  "DD  Dwww     ",
  " CCCCCCCC    ",
  " D   D  D    "
], map, 0.07);

const saberAdultBack = parseSolid([
  "   D   D     ",
  "  CCC CCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D  D  D    "
], map, 0.07);

const saberHatchlingFront = parseSolid([
  "   D   D     ",
  "  CCC CCC    ",
  "  CCewCCC    ",
  "   CDDDC     ",
  "   ww ww     ",
  "  D     D    "
], map, 0.08);

const saberHatchlingSide = parseSolid([
  "      D      ",
  "     CCC     ",
  "     CewC    ",
  "    CDDDC    ",
  "DD  Dwww     ",
  " D      D    "
], map, 0.08);

const saberHatchlingBack = parseSolid([
  "   D   D     ",
  "  CCC CCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D     D    "
], map, 0.08);

const saberEgg = parseSolid([
  "    CCC      ",
  "   LCCCD     ",
  "  LDDDDDD    ",
  "  LCCCCDD    ",
  "  LDDDDDD    ",
  "   CCCDD     ",
  "    CCC      "
], map, 0.05);


// ---------- CAPYBARA ----------
const capyAdultFront = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CeCCCeC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.06);

const capyAdultSide = parseSolid([
  "             ",
  "      D      ",
  "     CCCC    ",
  "     CCCe    ",
  "    CCCCC    ",
  "    CDDDC    ",
  " CCCCCCCC    ",
  " CCCCCCCC    ",
  " D   D  D    "
], map, 0.06);

const capyAdultBack = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.06);

const capyHatchlingFront = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CeCCCeC    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.08);

const capyHatchlingSide = parseSolid([
  "             ",
  "      D      ",
  "     CCCC    ",
  "     CCCe    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.08);

const capyHatchlingBack = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    "
], map, 0.08);

const capyEgg = parseSolid([
  "     g       ",
  "    CCC      ",
  "   LCCCD     ",
  "  LLCCCDD    ",
  "  LCCCCDD    ",
  "   CCCDD     ",
  "    CCC      "
], map, 0.05);

// ---------- DRAGON ----------
const dragAdultFront = parseSolid([
  "   D   D     ",
  "   C   C     ",
  "  DCCwCCD    ",
  "  oCeCeCo    ",
  "  CCCCCCC    ",
  " p CDDDC p   ",
  "p CCCCCCC p  ",
  " pCCCCCCCp   ",
  "  D  D  D    "
], map, 0.1);

const dragAdultSide = parseSolid([
  "      D      ",
  "      C      ",
  "     CCwD    ",
  "     CeCo    ",
  "    CCCCC    ",
  "  p CDDDC    ",
  " DDCCCCCC p  ",
  "  pCCCCCCp   ",
  " D  D   D    "
], map, 0.1);

const dragAdultBack = parseSolid([
  "   D   D     ",
  "   C   C     ",
  "  DCCCCCD    ",
  "  CCCCCCC    ",
  "DpCCCCCCCpD  ",
  " p CCCCC p   ",
  "p CCCCCCC p  ",
  " pCCCCCCCp   ",
  "  D  D  D    "
], map, 0.1);

const dragHatchlingFront = parseSolid([
  "   D   D     ",
  "  DCCwCCD    ",
  "  oCeCeCo    ",
  "  CCCCCCC    ",
  " p CDDDC p   ",
  "  D     D    "
], map, 0.1);

const dragHatchlingSide = parseSolid([
  "      D      ",
  "     CCwD    ",
  "     CeCo    ",
  "    CCCCC    ",
  " DD CDDDC p  ",
  "  D     D    "
], map, 0.1);

const dragHatchlingBack = parseSolid([
  "   D   D     ",
  "  DCCCCCD    ",
  "  CCCCCCC    ",
  " p CCCCC p   ",
  "  D     D    "
], map, 0.1);

const dragEgg = parseSolid([
  "    CCC      ",
  "   DCCCD     ",
  "  oDCCCDD    ",
  "  DCCCCDD    ",
  "  ooCCCDD    ",
  "   CCoDD     ",
  "    CCC      "
], map, 0.05);

// ---------- AXOLOTL ----------
const axoAdultFront = parseSolid([
  " s     s     ",
  "  CCCCC      ",
  "pCwCCCwC    p",
  " CeeCeC    s ",
  "pCCCCCCC    p",
  "  CDDDC      ",
  "  CCCCC      ",
  "  CCCCC      ",
  "  D   D      "
], map, 0.09);

const axoAdultSide = parseSolid([
  "       s     ",
  "     CCCCC   ",
  "    CCwCCCp  ",
  "    eeCeC s  ",
  "   CCCCCCCp  ",
  "    CDDDC    ",
  "p  CCCCCC    ",
  " p  CCCCC    ",
  " D  D   D    "
], map, 0.09);

const axoAdultBack = parseSolid([
  " s     s     ",
  "  CCCCC      ",
  "pCCCCCCC    p",
  " CCCCCCC   s ",
  "pCCCCCCC    p",
  "  CCCCC      ",
  "  CCCCC      ",
  "p CCCCC p    ",
  "  D   D      "
], map, 0.09);

const axoHatchlingFront = parseSolid([
  " s     s     ",
  "pCwCCCwC    p",
  " CeeCeC      ",
  "p CDDDC     p",
  "  CCCCC      ",
  "  D   D      "
], map, 0.09);

const axoHatchlingSide = parseSolid([
  "       s     ",
  "    CCwCCCp  ",
  "    eeCeC    ",
  "   CDDDC  p  ",
  " p CCCCC     ",
  " D D   D     "
], map, 0.09);

const axoHatchlingBack = parseSolid([
  " s     s     ",
  "pCCCCCCC    p",
  " CCCCCCC     ",
  "p CCCCC     p",
  "  CCCCC      ",
  "  D   D      "
], map, 0.09);

const axoEgg = parseSolid([
  "    CCC      ",
  "   pCCCD     ",
  "  LLCCCDD    ",
  "  LpCCCDD    ",
  "  LCCCCDD    ",
  "   pCCDD     ",
  "    CCC      "
], map, 0.05);

// We define a lookup table
const SPECIES_SPRITE_FNS = {
  wolf: {
    adultFront: wolfAdultFront, adultSide: wolfAdultSide, adultBack: wolfAdultBack,
    hatchFront: wolfHatchlingFront, hatchSide: wolfHatchlingSide, hatchBack: wolfHatchlingBack,
    egg: wolfEgg
  },
  sabertooth: {
    adultFront: saberAdultFront, adultSide: saberAdultSide, adultBack: saberAdultBack,
    hatchFront: saberHatchlingFront, hatchSide: saberHatchlingSide, hatchBack: saberHatchlingBack,
    egg: saberEgg
  },
  capybara: {
    adultFront: capyAdultFront, adultSide: capyAdultSide, adultBack: capyAdultBack,
    hatchFront: capyHatchlingFront, hatchSide: capyHatchlingSide, hatchBack: capyHatchlingBack,
    egg: capyEgg
  },
  dragon: {
    adultFront: dragAdultFront, adultSide: dragAdultSide, adultBack: dragAdultBack,
    hatchFront: dragHatchlingFront, hatchSide: dragHatchlingSide, hatchBack: dragHatchlingBack,
    egg: dragEgg
  },
  axolotl: {
    adultFront: axoAdultFront, adultSide: axoAdultSide, adultBack: axoAdultBack,
    hatchFront: axoHatchlingFront, hatchSide: axoHatchlingSide, hatchBack: axoHatchlingBack,
    egg: axoEgg
  }
} as const;

export function getSpeciesSpriteView(
  speciesKey: string,
  stage: Stage,
  mood: Mood,
  primaryColor: string,
  frame: number,
  view: SpriteView
): Pixel[] | null {
  const fns = SPECIES_SPRITE_FNS[speciesKey as keyof typeof SPECIES_SPRITE_FNS];
  if (!fns) return null; // Fallback

  const dark = darken(primaryColor, 40);
  const light = lighten(primaryColor, 40);
  const eye = mood === "coma" ? "#334155" : mood === "sad" ? "#64748b" : "#1e293b";
  const blink = frame % 40 === 0;

  // Render the base body
  let px: Pixel[] = [];
  
  if (stage === "egg") {
    // eggs look mostly similar from all sides, just reuse
    px = fns.egg(primaryColor, dark, light, eye, mood, blink, frame);
  } else if (stage === "hatchling") {
    if (view === "front") px = fns.hatchFront(primaryColor, dark, light, eye, mood, blink, frame);
    else if (view === "side") px = fns.hatchSide(primaryColor, dark, light, eye, mood, blink, frame);
    else px = fns.hatchBack(primaryColor, dark, light, eye, mood, blink, frame);
  } else {
    // adult or legend
    if (view === "front") px = fns.adultFront(primaryColor, dark, light, eye, mood, blink, frame);
    else if (view === "side") px = fns.adultSide(primaryColor, dark, light, eye, mood, blink, frame);
    else px = fns.adultBack(primaryColor, dark, light, eye, mood, blink, frame);
  }

  // If legend, add golden aura on top
  if (stage === "legend") {
    const bob = Math.floor(Math.sin(frame * 0.07) * 1);
    
    if (view === "front" || view === "back") {
      [[3, 0], [5, 0], [7, 0]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
      [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
    } else { // side
      [[4, 0], [5, 0], [6, 0]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
      [[3, 1], [4, 1], [5, 1], [6, 1]].forEach(([x, y]) => px.push([x, y + bob, "#EAB308"]));
    }

    const auraFrame = Math.floor(frame * 0.15) % 4;
    const auras: [number, number][][] = [
      [[0, 4], [12, 4], [6, -1]],
      [[0, 6], [12, 6], [1, 1], [11, 1]],
      [[0, 5], [12, 5], [6, 10]],
      [[1, 3], [11, 3], [1, 8], [11, 8]],
    ];
    auras[auraFrame]!.forEach(([x, y]) => px.push([x, y + bob, "#FDE047"]));
  }

  return px;
}
