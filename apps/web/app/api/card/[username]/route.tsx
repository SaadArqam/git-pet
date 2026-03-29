import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import type { PetState } from "@git-pet/core";
import { NextRequest } from "next/server";
import { getSpriteView } from "@git-pet/renderer";

export const runtime = "edge";

const MOOD_COLOR: Record<string, string> = {
  happy:   "#22c55e",
  neutral: "#94a3b8",
  tired:   "#f59e0b",
  sad:     "#ef4444",
  coma:    "#6366f1",
};

const STAGE_LABEL: Record<string, string> = {
  egg: "EGG", hatchling: "HATCHLING", adult: "ADULT", legend: "LEGEND",
};

const SPECIES_PRIMARY: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#e2e8f0",
  capybara:   "#a16207",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};

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
    return data.result ?? null;
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

  // Get sprite pixels
  const pixels = getSpriteView(
    stage as Parameters<typeof getSpriteView>[0],
    mood  as Parameters<typeof getSpriteView>[1],
    finalColor, 0, "front"
  );

  // Sprite bounding box: pixels are on a 13×11 grid
  const PS = 7; // pixel size
  const SPRITE_W = 13 * PS; // 91px
  const SPRITE_H = 11 * PS; // 77px

  // Screen area: x=18, y=36, w=152, h=118
  // Center sprite in screen
  const SCREEN_X = 18;
  const SCREEN_Y = 36;
  const SCREEN_W = 152;
  const SCREEN_H = 118;
  const spriteOffX = SCREEN_X + Math.floor((SCREEN_W - SPRITE_W) / 2);
  const spriteOffY = SCREEN_Y + Math.floor((SCREEN_H - SPRITE_H) / 2) - 4;

  const pixelRects = pixels
    .map(([x, y, color]) =>
      `<rect x="${spriteOffX + x * PS}" y="${spriteOffY + y * PS}" width="${PS}" height="${PS}" fill="${color}"/>`
    )
    .join("");

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
  const pCx = spriteOffX + SPRITE_W / 2;
  const pCy = spriteOffY;

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
  const shadowY = spriteOffY + SPRITE_H + 4;
  const shadowCx = spriteOffX + SPRITE_W / 2;

  // Aura — small soft circle, low opacity
  const auraCx = shadowCx;
  const auraCy = spriteOffY + SPRITE_H / 2;

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
    <clipPath id="screen"><rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN_W}" height="${SCREEN_H}" rx="2"/></clipPath>
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
    <rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN_W}" height="${SCREEN_H}" fill="#020617"/>
    <rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN_W}" height="${SCREEN_H}" fill="url(#dots)" clip-path="url(#screen)"/>

    <!-- Screen header -->
    <line x1="8" y1="34" x2="180" y2="34" stroke="#1e293b" stroke-width="1"/>
    <text x="18" y="26" font-family="'Courier New',monospace" font-size="9" fill="#475569">@${gitData.username}</text>
    <text x="94" y="26" font-family="'Courier New',monospace" font-size="9" fill="${moodColor}" text-anchor="middle">${mood.toUpperCase()}</text>
    <text x="172" y="26" font-family="'Courier New',monospace" font-size="9" fill="#334155" text-anchor="end">${stageLabel}</text>

    <!-- Aura behind pet -->
    <ellipse cx="${auraCx}" cy="${auraCy}" rx="28" ry="24" fill="${finalColor}" class="aura"/>

    <!-- Pet shadow -->
    <ellipse cx="${shadowCx}" cy="${shadowY}" rx="18" ry="4" fill="black" opacity="0.3"/>

    <!-- Particles / Z -->
    ${particleSvg}${zSvg}

    <!-- Pet sprite (bobbing via CSS — works in browsers; static in GitHub which is fine) -->
    <g class="pet">${pixelRects}</g>

    <!-- Screen footer -->
    <line x1="8" y1="156" x2="180" y2="156" stroke="#1e293b" stroke-width="1"/>
    <text x="18" y="175" font-family="'Courier New',monospace" font-size="8" fill="#334155">${gitData.streak}d streak</text>
    <text x="172" y="175" font-family="'Courier New',monospace" font-size="8" fill="${finalColor}" text-anchor="end">${(gitData.languages[0] ?? "").toUpperCase()}</text>

    <!-- Divider -->
    <line x1="192" y1="8" x2="192" y2="192" stroke="#1e293b" stroke-width="1"/>

    <!-- Title -->
    <text x="204" y="36" font-family="'Courier New',monospace" font-size="20" font-weight="bold" fill="#e2e8f0" letter-spacing="4">GIT PET</text>
    <text x="204" y="52" font-family="'Courier New',monospace" font-size="10" fill="#475569">@${gitData.username}</text>

    <!-- Stage badge -->
    <rect x="396" y="16" width="${stageLabel.length * 8 + 16}" height="18" rx="4" fill="none" stroke="${moodColor}" stroke-width="1" opacity="0.6"/>
    <text x="${404 + (stageLabel.length * 4)}" y="29" font-family="'Courier New',monospace" font-size="9" fill="${moodColor}" text-anchor="middle">${stageLabel}</text>

    <!-- Stat bars -->
    ${barSvg}

    <!-- Footer line -->
    <line x1="192" y1="158" x2="472" y2="158" stroke="#1e293b" stroke-width="1"/>
    <text x="204" y="176" font-family="'Courier New',monospace" font-size="9" fill="#334155">${gitData.totalCommits} commits</text>
    <text x="310" y="176" font-family="'Courier New',monospace" font-size="9" fill="#334155">${gitData.repoCount} repos</text>
    <text x="472" y="176" font-family="'Courier New',monospace" font-size="9" fill="#1e3a5f" text-anchor="end">git-pet-beta.vercel.app</text>

    <!-- Card border -->
    <rect width="480" height="200" rx="14" fill="none" stroke="#1e293b" stroke-width="1.5"/>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type":  "image/svg+xml",
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
    },
  });
}