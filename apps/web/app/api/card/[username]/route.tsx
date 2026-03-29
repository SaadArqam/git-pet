import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import type { PetState } from "@git-pet/core";
import { NextRequest } from "next/server";
import { getSpriteView } from "@git-pet/renderer";

export const runtime = "edge";

const STAGE_LABEL: Record<string, string> = {
  egg: "EGG", hatchling: "HATCHLING", adult: "ADULT", legend: "LEGEND",
};

const MOOD_COLOR: Record<string, string> = {
  happy: "#22c55e", content: "#3b82f6", tired: "#f59e0b",
  coma: "#ef4444", sad: "#64748b",
};

const SPECIES_PRIMARY: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#f8fafc",
  capybara:   "#a16207",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};

// -- INLINE SPECIES DRAW FUNCTIONS --
type PixelFn = (x0: number, y0: number, color: string) => string[];

function wolfSVG(x0: number, y0: number, color: string): string[] {
  const rects: string[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push(`<rect x="${x0 + dx * 1.4}" y="${y0 + dy * 1.4}" width="${w * 1.4}" height="${h * 1.4}" fill="${c}"/>`);
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
  p(30, 18, 8, 5, color); p(34, 14, 6, 5, color);
  return rects;
}

function sabertoothSVG(x0: number, y0: number, color: string): string[] {
  const rects: string[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push(`<rect x="${x0 + dx * 1.4}" y="${y0 + dy * 1.4}" width="${w * 1.4}" height="${h * 1.4}" fill="${c}"/>`);
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
  return rects;
}

function capybaraSVG(x0: number, y0: number, color: string): string[] {
  const rects: string[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push(`<rect x="${x0 + dx * 1.4}" y="${y0 + dy * 1.4}" width="${w * 1.4}" height="${h * 1.4}" fill="${c}"/>`);
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
  return rects;
}

function dragonSVG(x0: number, y0: number, color: string): string[] {
  const rects: string[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push(`<rect x="${x0 + dx * 1.4}" y="${y0 + dy * 1.4}" width="${w * 1.4}" height="${h * 1.4}" fill="${c}"/>`);
  };
  p(-8, 8, 12, 18, "#6d28d9");
  p(36, 8, 12, 18, "#6d28d9");
  p(-12, 6, 8, 10, "#7c3aed");
  p(44, 6, 8, 10, "#7c3aed");
  p(8, 18, 24, 20, color);
  p(10, 4, 20, 18, color);
  p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa");
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a");
  p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
  p(13, 17, 14, 7, "#6d28d9");
  p(14, 19, 3, 3, "#f97316"); p(23, 19, 3, 3, "#f97316");
  p(14, 14, 3, 5, "#a78bfa"); p(20, 12, 3, 5, "#a78bfa"); p(26, 14, 3, 5, "#a78bfa");
  p(28, 26, 10, 6, color); p(34, 22, 6, 6, color); p(38, 18, 5, 5, "#a78bfa");
  p(9, 34, 7, 8, color); p(17, 34, 7, 8, color); p(26, 34, 7, 8, color);
  return rects;
}

function axolotlSVG(x0: number, y0: number, color: string): string[] {
  const rects: string[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push(`<rect x="${x0 + dx * 1.4}" y="${y0 + dy * 1.4}" width="${w * 1.4}" height="${h * 1.4}" fill="${c}"/>`);
  };
  p(2, 4, 5, 14, "#f9a8d4");
  p(0, 2, 4, 8, "#fda4af");
  p(33, 4, 5, 14, "#f9a8d4");
  p(36, 2, 4, 8, "#fda4af");
  p(5, 1, 4, 10, "#f9a8d4");
  p(31, 1, 4, 10, "#f9a8d4");
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
  return rects;
}

const SPECIES_SVG: Record<string, PixelFn> = {
  wolf:       wolfSVG,
  sabertooth: sabertoothSVG,
  capybara:   capybaraSVG,
  dragon:     dragonSVG,
  axolotl:    axolotlSVG,
};

function fallbackDefaultRects(color: string, stage: string, mood: string): string[] {
  const pixels = getSpriteView(stage as any, mood as any, color, 0, "front");
  const PS = 7;
  const SPRITE_W = 13 * PS;
  const SPRITE_H = 11 * PS;
  const spriteOffX = 18 + Math.floor((152 - SPRITE_W) / 2);
  const spriteOffY = 36 + Math.floor((118 - SPRITE_H) / 2) - 2;
  return pixels.map(([px, py, c]) => 
    `<rect x="${spriteOffX + px * PS}" y="${spriteOffY + py * PS}" width="${PS}" height="${PS}" fill="${c}"/>`
  );
}

// Read species directly from Upstash Redis REST API — fully edge-safe
async function getSpeciesEdge(username: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/species:${username}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { result: string | null };
    let val = data.result;
    if (typeof val === "string") {
      val = val.replace(/['"]/g, "").toLowerCase();
    }
    return val || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const token = process.env.GITHUB_CARD_TOKEN;
  if (!token) return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });

  // Get species directly from Redis (edge-safe)
  const species      = await getSpeciesEdge(username);
  const petColor     = (species && SPECIES_PRIMARY[species]) ? SPECIES_PRIMARY[species]! : "";

  let petState: PetState;
  try {
    const client  = new GitHubClient(token);
    const gitData = await client.fetchUserStats(username);
    petState      = derivePetState(gitData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(`Failed: ${msg}`, { status: 500 });
  }

  const { stats, mood, stage, gitData, primaryColor } = petState;
  const finalColor = petColor || primaryColor;
  const moodColor  = MOOD_COLOR[mood]   ?? "#94a3b8";
  const stageLabel = STAGE_LABEL[stage] ?? stage.toUpperCase();

  const x0 = 18 + 20;
  const y0 = 36 + 12;

  const drawFn = SPECIES_SVG[species ?? ""] ?? null;
  const pixelRects = drawFn
    ? drawFn(x0, y0, finalColor).join("")
    : fallbackDefaultRects(finalColor, stage, mood).join("");

  // Stat bars
  const BAR_W = 150;
  const bars = [
    { label: "HP",  value: stats.health,       color: "#22c55e" },
    { label: "NRG", value: stats.energy,       color: "#f59e0b" },
    { label: "INT", value: stats.intelligence, color: "#3b82f6" },
    { label: "JOY", value: stats.happiness,    color: "#ec4899" },
  ];

  const barSvg = bars.map(({ label, value, color }, i) => {
    const by     = 64 + i * 26;
    const filledW = Math.round((value / 100) * BAR_W);
    const delay   = (i * 0.12).toFixed(2);
    return `
      <text x="200" y="${by + 12}" font-family="'Courier New',monospace" font-size="11" fill="#64748b">${label}</text>
      <rect x="236" y="${by + 4}" width="${BAR_W}" height="7" rx="3" fill="#1e293b"/>
      <rect x="236" y="${by + 4}" width="0" height="7" rx="3" fill="${color}">
        <animate attributeName="width" from="0" to="${filledW}" dur="1s" begin="${delay}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
      </rect>
      <text x="${236 + BAR_W + 6}" y="${by + 12}" font-family="'Courier New',monospace" font-size="11" fill="#e2e8f0" text-anchor="start">${value}</text>`;
  }).join("");

  // Mood particles
  const showParticles = mood === "happy";
  const showZs        = mood === "tired" || mood === "coma";
  const pCx = x0 + 20; // approximation of center
  const pCy = y0 - 10;

  const particleSvg = showParticles ? `
    <circle cx="${pCx - 14}" cy="${pCy}" r="3" fill="#22c55e" opacity="0">
      <animate attributeName="cy" values="${pCy};${pCy - 24};${pCy - 24}" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${pCx + 14}" cy="${pCy}" r="3" fill="#86efac" opacity="0">
      <animate attributeName="cy" values="${pCy};${pCy - 20};${pCy - 20}" dur="1.8s" begin="0.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="0.5s" repeatCount="indefinite"/>
    </circle>` : "";

  const zSvg = showZs ? `
    <text x="${pCx + 10}" y="${pCy}" font-family="monospace" font-size="9" fill="#94a3b8" opacity="0">z
      <animate attributeName="y" values="${pCy};${pCy - 18}" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.8;0" dur="2s" repeatCount="indefinite"/>
    </text>` : "";

  // Pet shadow ellipse — small, under sprite
  const shadowY = y0 + 64;
  const shadowCx = x0 + 18;

  // Aura — small soft circle, low opacity
  const auraCx = shadowCx;
  const auraCy = y0 + 30;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200" viewBox="0 0 480 200">
  <defs>
    <style>
      @keyframes bob {
        0%,100% { transform: translateY(0); }
        50%      { transform: translateY(-4px); }
      }
      @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes aura {
        0%,100% { opacity: 0.10; }
        50%      { opacity: 0.20; }
      }
      .pet { animation: bob 1.8s ease-in-out infinite; }
      .card { animation: fadeIn 0.4s ease forwards; }
      .aura { animation: aura 2.5s ease-in-out infinite; }
    </style>
    <clipPath id="card"><rect width="480" height="200" rx="14"/></clipPath>
    <clipPath id="screen"><rect x="18" y="36" width="152" height="118" rx="2"/></clipPath>
    <pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="4" height="4" fill="white" opacity="0.018"/>
      <rect x="4" y="4" width="4" height="4" fill="white" opacity="0.018"/>
    </pattern>
  </defs>

  <g clip-path="url(#card)" class="card">
    <!-- Card bg -->
    <rect width="480" height="200" fill="#0a1628"/>

    <!-- Left panel bg -->
    <rect x="8" y="8" width="172" height="184" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>

    <!-- Screen bg + texture -->
    <rect x="18" y="36" width="152" height="118" fill="#020617"/>
    <rect x="18" y="36" width="152" height="118" fill="url(#dots)" clip-path="url(#screen)"/>

    <!-- Screen header -->
    <line x1="8" y1="34" x2="180" y2="34" stroke="#1e293b" stroke-width="1"/>
    <text x="18" y="26" font-family="'Courier New',monospace" font-size="9" fill="#475569">@\${gitData.username}</text>
    <text x="94" y="26" font-family="'Courier New',monospace" font-size="9" fill="\${moodColor}" text-anchor="middle">\${mood.toUpperCase()}</text>
    <text x="172" y="26" font-family="'Courier New',monospace" font-size="9" fill="#334155" text-anchor="end">\${stageLabel}</text>

    <!-- Aura behind pet -->
    <ellipse cx="\${auraCx}" cy="\${auraCy}" rx="24" ry="20" fill="\${finalColor}" opacity="0.12" class="aura"/>

    <!-- Pet shadow -->
    <ellipse cx="\${shadowCx}" cy="\${shadowY}" rx="18" ry="4" fill="black" opacity="0.3"/>

    <!-- Particles / Z -->
    \${particleSvg}\${zSvg}

    <!-- Pet sprite (bobbing via CSS — works in browsers; static in GitHub which is fine) -->
    <g class="pet">\${pixelRects}</g>

    <!-- Screen footer -->
    <line x1="8" y1="156" x2="180" y2="156" stroke="#1e293b" stroke-width="1"/>
    <text x="18" y="175" font-family="'Courier New',monospace" font-size="8" fill="#334155">\${gitData.streak}d streak</text>
    <text x="172" y="175" font-family="'Courier New',monospace" font-size="8" fill="\${finalColor}" text-anchor="end">\${(gitData.languages[0] ?? "").toUpperCase()}</text>

    <!-- Divider -->
    <line x1="192" y1="8" x2="192" y2="192" stroke="#1e293b" stroke-width="1"/>

    <!-- Title -->
    <text x="204" y="36" font-family="'Courier New',monospace" font-size="20" font-weight="bold" fill="#e2e8f0" letter-spacing="4">GIT PET</text>
    <text x="204" y="52" font-family="'Courier New',monospace" font-size="10" fill="#475569">@\${gitData.username}</text>

    <!-- Stage badge -->
    <rect x="396" y="16" width="\${stageLabel.length * 8 + 16}" height="18" rx="4" fill="none" stroke="\${moodColor}" stroke-width="1" opacity="0.6"/>
    <text x="\${404 + (stageLabel.length * 4)}" y="29" font-family="'Courier New',monospace" font-size="9" fill="\${moodColor}" text-anchor="middle">\${stageLabel}</text>

    <!-- Stat bars -->
    \${barSvg}

    <!-- Footer line -->
    <line x1="192" y1="158" x2="472" y2="158" stroke="#1e293b" stroke-width="1"/>
    <text x="204" y="176" font-family="'Courier New',monospace" font-size="9" fill="#334155">\${gitData.totalCommits} commits</text>
    <text x="310" y="176" font-family="'Courier New',monospace" font-size="9" fill="#334155">\${gitData.repoCount} repos</text>
    <text x="472" y="176" font-family="'Courier New',monospace" font-size="9" fill="#1e3a5f" text-anchor="end">git-pet-beta.vercel.app</text>

    <!-- Card border -->
    <rect width="480" height="200" rx="14" fill="none" stroke="#1e293b" stroke-width="1.5"/>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type":  "image/svg+xml",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma":        "no-cache",
      "Expires":       "0"
    },
  });
}