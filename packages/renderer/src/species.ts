import type { Mood, Stage } from "@git-pet/core";
import type { Pixel, SpriteView } from "./sprites";
import { darken, lighten } from "./colors";

export type Species = "default" | "wolf" | "sabertooth" | "capybara" | "dragon" | "axolotl";

// ─── ART PARSER ──────────────────────────────────────────────────────────────
// Each art string is a 13-wide row. Chars map to color tokens which are
// substituted at render time with real CSS colors.
//
// Token chars:
//   C  = primaryColor        D  = darken(primary)    L  = lighten(primary)
//   e  = eye color           w  = white pupil (#fff)
//   y  = gold (#eab308)      o  = orange (#f97316)
//   p  = pink (#db2777)      s  = light pink (#f472b6)
//   b  = ice blue (#0ea5e9)  (space) = transparent/skip

type DrawFn = (
  C: string, dark: string, light: string,
  eye: string, mood: Mood, blink: boolean, frame: number
) => Pixel[];

function parseSolid(art: string[], bobFactor: number): DrawFn {
  // Pre-parse: store [x, y, tokenChar] for every non-space cell
  const coords: [number, number, string][] = [];
  for (let row = 0; row < art.length; row++) {
    const line = art[row]!;
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]!;
      if (ch !== " ") coords.push([col, row, ch]);
    }
  }

  return function(C, dark, light, eye, mood, blink, frame): Pixel[] {
    const px: Pixel[] = [];
    const bob = Math.floor(Math.sin(frame * bobFactor) * 1);

    for (const [x, y, ch] of coords) {
      // Skip eyes on blink frames
      if (blink && (ch === "e" || ch === "w")) continue;

      // Resolve token → CSS color
      let color: string;
      switch (ch) {
        case "C": color = C;          break;
        case "D": color = dark;       break;
        case "L": color = light;      break;
        case "e": color = eye;        break;
        case "w": color = "#fff";     break;
        case "y": color = "#eab308";  break;
        case "o": color = "#f97316";  break;
        case "p": color = "#db2777";  break;
        case "s": color = "#f472b6";  break;
        case "b": color = "#0ea5e9";  break;
        default:  continue; // unknown char — skip
      }

      // Mood: pupils look down when sad/coma
      const finalY = (ch === "w" && (mood === "sad" || mood === "coma"))
        ? y + bob + 1
        : y + bob;

      // Clamp to 13x11 grid
      const cx = Math.max(0, Math.min(12, x));
      const cy = Math.max(0, Math.min(10, finalY));
      px.push([cx, cy, color]);
    }

    return px;
  };
}

// ─── WOLF ─────────────────────────────────────────────────────────────────────

const wolfAdultFront = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCwCCC    ",
  "  CCeCeCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "   DDDDD     ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.07);

const wolfAdultSide = parseSolid([
  "      D      ",
  "     LCL     ",
  "     CCCw    ",
  "     CCeC    ",
  "    CCCCC    ",
  "    CDDDC    ",
  " DD DDDDD    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.07);

const wolfAdultBack = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D     D    ",
], 0.07);

const wolfHatchFront = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCewCCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "  D     D    ",
], 0.08);

const wolfHatchSide = parseSolid([
  "      D      ",
  "     LCL     ",
  "     CewC    ",
  "    CCCCC    ",
  " DD CDDDC    ",
  "  D     D    ",
], 0.08);

const wolfHatchBack = parseSolid([
  "   D   D     ",
  "  LCL LCL    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "  D     D    ",
], 0.08);

const wolfEgg = parseSolid([
  "    CCC      ",
  "   LCCCD     ",
  "  LLCCCDD    ",
  "  LCCCCDD    ",
  "  LCCCCDD    ",
  "   CCCDD     ",
  "    CCC      ",
], 0.05);

// ─── SABERTOOTH ───────────────────────────────────────────────────────────────
// Uses 'b' (ice blue #0ea5e9) for eyes so they show on white primary

const saberAdultFront = parseSolid([
  "   D   D     ",
  "  CDC CDC    ",
  "  CCCwCCC    ",
  "  CCbCbCC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "   ww ww     ",
  "  CCCCCCC    ",
  "  D  D  D    ",
], 0.07);

const saberAdultSide = parseSolid([
  "      D      ",
  "     CDC     ",
  "     CCCw    ",
  "     CCbC    ",
  "    CCCCC    ",
  "    CDDDC    ",
  "DD  Dwww     ",
  " CCCCCCCC    ",
  " D   D  D    ",
], 0.07);

const saberAdultBack = parseSolid([
  "   D   D     ",
  "  CDC CDC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D  D  D    ",
], 0.07);

const saberHatchFront = parseSolid([
  "   D   D     ",
  "  CDC CDC    ",
  "  CCbwCCC    ",
  "   CDDDC     ",
  "   ww ww     ",
  "  D     D    ",
], 0.08);

const saberHatchSide = parseSolid([
  "      D      ",
  "     CDC     ",
  "     CbwC    ",
  "    CDDDC    ",
  "DD  Dwww     ",
  " D      D    ",
], 0.08);

const saberHatchBack = parseSolid([
  "   D   D     ",
  "  CDC CDC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "   CCCCC     ",
  "  D     D    ",
], 0.08);

const saberEgg = parseSolid([
  "    CCC      ",
  "   LCCCD     ",
  "  LDDDDDD    ",
  "  LCCCCDD    ",
  "  LDDDDDD    ",
  "   CCCDD     ",
  "    CCC      ",
], 0.05);

// ─── CAPYBARA ─────────────────────────────────────────────────────────────────

const capyAdultFront = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CeCCCeC    ",
  "  CCCCCCC    ",
  "   CDDDC     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.06);

const capyAdultSide = parseSolid([
  "             ",
  "      D      ",
  "     CCCC    ",
  "     CCCe    ",
  "    CCCCC    ",
  "    CDDDC    ",
  " CCCCCCCC    ",
  " CCCCCCCC    ",
  " D   D  D    ",
], 0.06);

const capyAdultBack = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "   CCCCC     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.06);

const capyHatchFront = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CeCCCeC    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.08);

const capyHatchSide = parseSolid([
  "             ",
  "      D      ",
  "     CCCC    ",
  "     CCCe    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.08);

const capyHatchBack = parseSolid([
  "             ",
  "   D   D     ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  CCCCCCC    ",
  "  D     D    ",
], 0.08);

const capyEgg = parseSolid([
  "     s       ",
  "    CCC      ",
  "   LCCCD     ",
  "  LLCCCDD    ",
  "  LCCCCDD    ",
  "   CCCDD     ",
  "    CCC      ",
], 0.05);

// ─── DRAGON ───────────────────────────────────────────────────────────────────

const dragAdultFront = parseSolid([
  "   D   D     ",
  "   C   C     ",
  "  DCCwCCD    ",
  "  oCeCeCo    ",
  "  CCCCCCC    ",
  " p CDDDC p   ",
  "p CCCCCCC p  ",
  " pCCCCCCCp   ",
  "  D  D  D    ",
], 0.1);

const dragAdultSide = parseSolid([
  "      D      ",
  "      C      ",
  "     CCwD    ",
  "     CeCo    ",
  "    CCCCC    ",
  "  p CDDDC    ",
  " DDCCCCCC p  ",
  "  pCCCCCCp   ",
  " D  D   D    ",
], 0.1);

const dragAdultBack = parseSolid([
  "   D   D     ",
  "   C   C     ",
  "  DCCCCCD    ",
  "  CCCCCCC    ",
  "DpCCCCCCCpD  ",
  " p CCCCC p   ",
  "p CCCCCCC p  ",
  " pCCCCCCCp   ",
  "  D  D  D    ",
], 0.1);

const dragHatchFront = parseSolid([
  "   D   D     ",
  "  DCCwCCD    ",
  "  oCeCeCo    ",
  "  CCCCCCC    ",
  " p CDDDC p   ",
  "  D     D    ",
], 0.1);

const dragHatchSide = parseSolid([
  "      D      ",
  "     CCwD    ",
  "     CeCo    ",
  "    CCCCC    ",
  " DD CDDDC p  ",
  "  D     D    ",
], 0.1);

const dragHatchBack = parseSolid([
  "   D   D     ",
  "  DCCCCCD    ",
  "  CCCCCCC    ",
  " p CCCCC p   ",
  "  D     D    ",
], 0.1);

const dragEgg = parseSolid([
  "    CCC      ",
  "   DCCCD     ",
  "  oDCCCDD    ",
  "  DCCCCDD    ",
  "  ooCCCDD    ",
  "   CCoDD     ",
  "    CCC      ",
], 0.05);

// ─── AXOLOTL ──────────────────────────────────────────────────────────────────

const axoAdultFront = parseSolid([
  " s     s     ",
  "  CCCCC      ",
  "sCwCCCwCs    ",
  " CeeCeCC     ",
  "sCCCCCCCs    ",
  "  CDDDC      ",
  "  CCCCC      ",
  "  CCCCC      ",
  "  D   D      ",
], 0.09);

const axoAdultSide = parseSolid([
  "       s     ",
  "     CCCCCs  ",
  "    CCwCCCs  ",
  "    eeCeCC   ",
  "   CCCCCCCs  ",
  "    CDDDC    ",
  "s  CCCCCC    ",
  "   CCCCC     ",
  " D  D   D    ",
], 0.09);

const axoAdultBack = parseSolid([
  " s     s     ",
  "  CCCCC      ",
  "sCCCCCCCs    ",
  " CCCCCCC     ",
  "sCCCCCCCs    ",
  "  CCCCC      ",
  "  CCCCC      ",
  "s CCCCC s    ",
  "  D   D      ",
], 0.09);

const axoHatchFront = parseSolid([
  " s     s     ",
  "sCwCCCwCs    ",
  " CeeCeCC     ",
  "s CDDDC s    ",
  "  CCCCC      ",
  "  D   D      ",
], 0.09);

const axoHatchSide = parseSolid([
  "       s     ",
  "    CCwCCCs  ",
  "    eeCeCC   ",
  "   CDDDC  s  ",
  " s CCCCC     ",
  " D D   D     ",
], 0.09);

const axoHatchBack = parseSolid([
  " s     s     ",
  "sCCCCCCCs    ",
  " CCCCCCC     ",
  "s CCCCC s    ",
  "  CCCCC      ",
  "  D   D      ",
], 0.09);

const axoEgg = parseSolid([
  "    CCC      ",
  "   sCCCD     ",
  "  LLCCCDD    ",
  "  LsCCCDD    ",
  "  LCCCCDD    ",
  "   sCCDD     ",
  "    CCC      ",
], 0.05);

// ─── LOOKUP TABLE ─────────────────────────────────────────────────────────────

const SPECIES_SPRITE_FNS = {
  wolf: {
    adultFront: wolfAdultFront, adultSide: wolfAdultSide, adultBack: wolfAdultBack,
    hatchFront: wolfHatchFront, hatchSide: wolfHatchSide, hatchBack: wolfHatchBack,
    egg: wolfEgg,
  },
  sabertooth: {
    adultFront: saberAdultFront, adultSide: saberAdultSide, adultBack: saberAdultBack,
    hatchFront: saberHatchFront, hatchSide: saberHatchSide, hatchBack: saberHatchBack,
    egg: saberEgg,
  },
  capybara: {
    adultFront: capyAdultFront, adultSide: capyAdultSide, adultBack: capyAdultBack,
    hatchFront: capyHatchFront, hatchSide: capyHatchSide, hatchBack: capyHatchBack,
    egg: capyEgg,
  },
  dragon: {
    adultFront: dragAdultFront, adultSide: dragAdultSide, adultBack: dragAdultBack,
    hatchFront: dragHatchFront, hatchSide: dragHatchSide, hatchBack: dragHatchBack,
    egg: dragEgg,
  },
  axolotl: {
    adultFront: axoAdultFront, adultSide: axoAdultSide, adultBack: axoAdultBack,
    hatchFront: axoHatchFront, hatchSide: axoHatchSide, hatchBack: axoHatchBack,
    egg: axoEgg,
  },
} as const;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function getSpeciesSpriteView(
  speciesKey: string,
  stage: Stage,
  mood: Mood,
  primaryColor: string,
  frame: number,
  view: SpriteView,
): Pixel[] | null {
  const fns = SPECIES_SPRITE_FNS[speciesKey as keyof typeof SPECIES_SPRITE_FNS];
  if (!fns) return null;

  const dark  = darken(primaryColor, 40);
  const light = lighten(primaryColor, 40);
  const eye   = mood === "coma" ? "#334155" : mood === "sad" ? "#64748b" : "#1e293b";
  const blink = frame % 40 === 0;

  let px: Pixel[];

  if (stage === "egg") {
    px = fns.egg(primaryColor, dark, light, eye, mood, blink, frame);
  } else if (stage === "hatchling") {
    if (view === "front")     px = fns.hatchFront(primaryColor, dark, light, eye, mood, blink, frame);
    else if (view === "side") px = fns.hatchSide(primaryColor,  dark, light, eye, mood, blink, frame);
    else                      px = fns.hatchBack(primaryColor,  dark, light, eye, mood, blink, frame);
  } else {
    // adult + legend both use adult art; legend gets crown overlay below
    if (view === "front")     px = fns.adultFront(primaryColor, dark, light, eye, mood, blink, frame);
    else if (view === "side") px = fns.adultSide(primaryColor,  dark, light, eye, mood, blink, frame);
    else                      px = fns.adultBack(primaryColor,  dark, light, eye, mood, blink, frame);
  }

  // Legend crown + aura overlay
  if (stage === "legend") {
    const bob = Math.floor(Math.sin(frame * 0.07) * 1);
    if (view !== "side") {
      [[3,0],[5,0],[7,0]].forEach(([x,y]) => px.push([x, y!+bob, "#EAB308"]));
      [[3,1],[4,1],[5,1],[6,1],[7,1]].forEach(([x,y]) => px.push([x, y!+bob, "#EAB308"]));
    } else {
      [[4,0],[5,0],[6,0]].forEach(([x,y]) => px.push([x, y!+bob, "#EAB308"]));
      [[3,1],[4,1],[5,1],[6,1]].forEach(([x,y]) => px.push([x, y!+bob, "#EAB308"]));
    }
    const auraFrame = Math.floor(frame * 0.15) % 4;
    const auras: [number,number][][] = [
      [[0,4],[12,4],[6,-1]],
      [[0,6],[12,6],[1,1],[11,1]],
      [[0,5],[12,5],[6,10]],
      [[1,3],[11,3],[1,8],[11,8]],
    ];
    auras[auraFrame]!.forEach(([x,y]) => px.push([x, y!+bob, "#FDE047"]));
  }

  return px;
}