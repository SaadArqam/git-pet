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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const token = process.env.GITHUB_CARD_TOKEN;
  if (!token) return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });

  // Fetch species via internal HTTP (edge-safe, no Redis SDK)
  let speciesColor = "";
  let speciesKey = "";
  try {
    const speciesRes = await fetch(
      `${req.nextUrl.origin}/api/species?username=${encodeURIComponent(username)}`,
      { headers: { "x-internal": "card" } }
    );
    if (speciesRes.ok) {
      const data = await speciesRes.json() as { species?: string };
      speciesKey   = data.species ?? "";
      speciesColor = SPECIES_PRIMARY[speciesKey] ?? "";
    }
  } catch { /* fall back to primaryColor */ }

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
  const petColor   = speciesColor || primaryColor;
  const moodColor  = MOOD_COLOR[mood]   ?? "#94a3b8";
  const stageLabel = STAGE_LABEL[stage] ?? stage.toUpperCase();

  // Get sprite pixels — pure function, edge-safe
  const pixels = getSpriteView(
    stage as Parameters<typeof getSpriteView>[0],
    mood  as Parameters<typeof getSpriteView>[1],
    petColor, 0, "front"
  );

  const PS = 6; // pixel size in SVG units

  // Build pixel rects as SVG — grouped for bob animation
  const pixelRects = pixels
    .map(([x, y, color]) =>
      `<rect x="${x * PS}" y="${y * PS}" width="${PS}" height="${PS}" fill="${color}"/>`
    )
    .join("");

  // Mood particle color
  const particleColor = mood === "happy" ? "#22c55e"
    : mood === "tired" || mood === "coma" ? "#94a3b8"
    : "none";

  // Stat bar data
  const bars = [
    { label: "HP",  value: stats.health,       color: "#22c55e", y: 0   },
    { label: "NRG", value: stats.energy,       color: "#f59e0b", y: 22  },
    { label: "INT", value: stats.intelligence, color: "#3b82f6", y: 44  },
    { label: "JOY", value: stats.happiness,    color: "#ec4899", y: 66  },
  ];

  const BAR_MAX = 160; // max bar width in px
  const barSvg = bars.map(({ label, value, color, y }) => {
    const barW = Math.round((value / 100) * BAR_MAX);
    const animDelay = bars.indexOf(bars.find(b => b.label === label)!) * 0.15;
    return `
      <text x="0" y="${y + 12}" font-family="monospace" font-size="11" fill="#64748b">${label}</text>
      <rect x="32" y="${y + 4}" width="${BAR_MAX}" height="6" rx="3" fill="#1e293b"/>
      <rect x="32" y="${y + 4}" width="0" height="6" rx="3" fill="${color}">
        <animate attributeName="width" from="0" to="${barW}" dur="1.2s" begin="${animDelay}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
      </rect>
      <text x="${32 + BAR_MAX + 8}" y="${y + 12}" font-family="monospace" font-size="11" fill="#e2e8f0" text-anchor="end" dx="10">${value}</text>`;
  }).join("");

  // Happy particles (2 floating dots for happy mood)
  const particleSvg = particleColor !== "none" ? `
    <circle cx="10" cy="0" r="3" fill="${particleColor}" opacity="0">
      <animate attributeName="cy" values="0;-28;-28" dur="2s" repeatCount="indefinite" begin="0s"/>
      <animate attributeName="opacity" values="0;0.9;0" dur="2s" repeatCount="indefinite" begin="0s"/>
    </circle>
    <circle cx="72" cy="0" r="3" fill="${particleColor}" opacity="0">
      <animate attributeName="cy" values="0;-22;-22" dur="2s" repeatCount="indefinite" begin="0.6s"/>
      <animate attributeName="opacity" values="0;0.9;0" dur="2s" repeatCount="indefinite" begin="0.6s"/>
    </circle>` : "";

  // Z particles for tired/coma
  const zSvg = (mood === "tired" || mood === "coma") ? `
    <text font-family="monospace" font-size="10" fill="#94a3b8" x="72" y="0" opacity="0">z
      <animate attributeName="y" values="0;-20;-20" dur="2.5s" repeatCount="indefinite" begin="0s"/>
      <animate attributeName="opacity" values="0;0.8;0" dur="2.5s" repeatCount="indefinite" begin="0s"/>
      <animate attributeName="font-size" values="8;14;14" dur="2.5s" repeatCount="indefinite" begin="0s"/>
    </text>` : "";

  // Aura glow behind pet (species color)
  const auraColor = petColor;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200" viewBox="0 0 480 200">
  <defs>
    <style>
      .card-bg { animation: fadeIn 0.5s ease forwards; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes bob {
        0%, 100% { transform: translateY(0px); }
        50%       { transform: translateY(-4px); }
      }
      @keyframes scanline {
        0%   { transform: translateY(0); opacity: 0.06; }
        100% { transform: translateY(200px); opacity: 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.15; }
        50%       { opacity: 0.28; }
      }
      .pet-sprite { animation: bob 1.8s ease-in-out infinite; transform-origin: 39px 33px; transform-box: fill-box; }
      .aura       { animation: pulse 2.5s ease-in-out infinite; }
    </style>

    <!-- Scanline pattern -->
    <pattern id="scan" x="0" y="0" width="1" height="4" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="1" fill="white" opacity="0.04"/>
    </pattern>

    <!-- Checkerboard for screen area -->
    <pattern id="checker" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="4" height="4" fill="white" opacity="0.018"/>
      <rect x="4" y="4" width="4" height="4" fill="white" opacity="0.018"/>
    </pattern>

    <!-- Clip for screen area -->
    <clipPath id="screenClip">
      <rect x="18" y="36" width="152" height="118" rx="2"/>
    </clipPath>

    <!-- Card rounded clip -->
    <clipPath id="cardClip">
      <rect x="0" y="0" width="480" height="200" rx="14"/>
    </clipPath>
  </defs>

  <g clip-path="url(#cardClip)" class="card-bg">

    <!-- Card background -->
    <rect width="480" height="200" rx="14" fill="#0a1628"/>
    <rect width="480" height="200" rx="14" fill="url(#scan)"/>

    <!-- Left panel -->
    <rect x="8" y="8" width="172" height="184" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>

    <!-- Screen area -->
    <rect x="18" y="36" width="152" height="118" rx="2" fill="#020617"/>
    <rect x="18" y="36" width="152" height="118" fill="url(#checker)" clip-path="url(#screenClip)"/>

    <!-- Screen header -->
    <rect x="8" y="8" width="172" height="26" rx="10" fill="#0f172a"/>
    <rect x="8" y="24" width="172" height="10" fill="#0f172a"/>
    <line x1="8" y1="34" x2="180" y2="34" stroke="#1e293b" stroke-width="1"/>
    <text x="18" y="26" font-family="monospace" font-size="9" fill="#475569">@${gitData.username}</text>
    <text x="94" y="26" font-family="monospace" font-size="9" fill="${moodColor}" text-anchor="middle">${mood.toUpperCase()}</text>
    <text x="172" y="26" font-family="monospace" font-size="9" fill="#334155" text-anchor="end">${stageLabel}</text>

    <!-- Pet aura glow -->
    <ellipse cx="94" cy="93" rx="38" ry="32" fill="${auraColor}" opacity="0.0" class="aura"/>

    <!-- Pet shadow -->
    <ellipse cx="94" cy="154" rx="22" ry="5" fill="black" opacity="0.25"/>

    <!-- Particle effects (above sprite, rendered before so sprite is on top) -->
    <g transform="translate(55, 155)">${particleSvg}${zSvg}</g>

    <!-- Pet sprite (bobbing) -->
    <g class="pet-sprite" transform="translate(55, 83)">${pixelRects}</g>

    <!-- Screen footer -->
    <line x1="8" y1="156" x2="180" y2="156" stroke="#1e293b" stroke-width="1"/>
    <rect x="8" y="156" width="172" height="36" rx="10" fill="#0f172a"/>
    <rect x="8" y="156" width="172" height="10" fill="#0f172a"/>
    <text x="18" y="175" font-family="monospace" font-size="8" fill="#334155">${gitData.streak}d streak</text>
    <text x="172" y="175" font-family="monospace" font-size="8" fill="${petColor}" text-anchor="end">${(gitData.languages[0] ?? "").toUpperCase()}</text>

    <!-- Right panel: info -->

    <!-- GIT PET title -->
    <text x="204" y="34" font-family="monospace" font-size="20" font-weight="bold" fill="#e2e8f0" letter-spacing="4">GIT PET</text>
    <text x="204" y="50" font-family="monospace" font-size="10" fill="#475569">@${gitData.username}</text>

    <!-- Stage badge -->
    <rect x="390" y="16" width="${stageLabel.length * 8 + 16}" height="18" rx="4" fill="none" stroke="${moodColor}" stroke-width="1" opacity="0.5"/>
    <text x="${398 + (stageLabel.length * 8) / 2}" y="29" font-family="monospace" font-size="9" fill="${moodColor}" text-anchor="middle">${stageLabel}</text>

    <!-- Stat bars -->
    <g transform="translate(204, 64)">${barSvg}</g>

    <!-- Divider -->
    <line x1="204" y1="156" x2="468" y2="156" stroke="#1e293b" stroke-width="1"/>

    <!-- Footer stats -->
    <text x="204" y="174" font-family="monospace" font-size="9" fill="#334155">${gitData.totalCommits} commits</text>
    <text x="300" y="174" font-family="monospace" font-size="9" fill="#334155">${gitData.repoCount} repos</text>
    <text x="400" y="174" font-family="monospace" font-size="9" fill="#1e3a5f">git-pet-beta.vercel.app</text>

    <!-- Subtle border on full card -->
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