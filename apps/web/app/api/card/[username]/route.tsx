import { ImageResponse } from "@vercel/og";
import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import type { PetState } from "@git-pet/core";
import { NextRequest } from "next/server";
import { getSpriteView, getSpeciesRects } from "@git-pet/renderer";
import { getUserSpecies } from "@/lib/redis";

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

function shiftColor(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Uses renderer to generate sprites

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const token = process.env.GITHUB_CARD_TOKEN;

  if (!token) {
    return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });
  }

  let petState: PetState;
  try {
    const client = new GitHubClient(token);
    const gitData = await client.fetchUserStats(username);
    petState = derivePetState(gitData);
  } catch (err: any) {
    return new Response(`Failed: ${err.message}`, { status: 500 });
  }

  const { stats, mood, stage, gitData, primaryColor } = petState;
  const moodColor = MOOD_COLOR[mood] ?? "#94a3b8";
  const species = await getUserSpecies(username) ?? "default";
  const rects = (species && species !== "default") ? getSpeciesRects(species, 0, primaryColor) : null;
  const pixels = rects ? [] : getSpriteView(stage as any, mood as any, primaryColor, 0, "front", species);
  const PIXEL = 7;

  return new ImageResponse(
    (
      <div style={{ display: "flex", background: "#020617", width: 400, height: 220, borderRadius: 16, padding: 20, gap: 20, fontFamily: "monospace" }}>

        {/* Left: pet screen */}
        <div style={{ display: "flex", flexDirection: "column", background: "#0f172a", borderRadius: 10, border: "2px solid #1e293b", width: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: 8, color: "#475569" }}>@{gitData.username}</span>
            <span style={{ fontSize: 8, color: moodColor }}>{mood.toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", position: "relative", minHeight: 90 }}>
            {rects ? rects.map(([rx, ry, rw, rh, color]: [number, number, number, number, string], i: number) => (
              <div key={i} style={{ position: "absolute", left: rx * 1.4 + 42, top: ry * 1.4 + 14, width: rw * 1.4, height: rh * 1.4, background: color }} />
            )) : pixels.map(([x, y, color]: [number, number, string], i: number) => (
              <div key={i} style={{ position: "absolute", left: x * PIXEL + 20, top: y * PIXEL + 5, width: PIXEL, height: PIXEL, background: color }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderTop: "1px solid #1e293b" }}>
            <span style={{ fontSize: 7, color: "#334155" }}>{gitData.streak}d streak</span>
            <span style={{ fontSize: 7, color: primaryColor }}>{gitData.languages[0]?.toUpperCase()}</span>
          </div>
        </div>

        {/* Right: info */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 16, color: "#e2e8f0", letterSpacing: 3 }}>GIT PET</span>
              <span style={{ fontSize: 9, color: moodColor, padding: "2px 8px", borderRadius: 4 }}>{STAGE_LABEL[stage]}</span>
            </div>
            <span style={{ fontSize: 10, color: "#475569" }}>@{gitData.username}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { label: "HP",  value: stats.health,       color: "#22c55e" },
              { label: "NRG", value: stats.energy,       color: "#f59e0b" },
              { label: "INT", value: stats.intelligence, color: "#3b82f6" },
              { label: "JOY", value: stats.happiness,    color: "#ec4899" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#64748b", width: 28 }}>{label}</span>
                <div style={{ flex: 1, height: 5, background: "#1e293b", borderRadius: 3, display: "flex" }}>
                  <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, color: "#e2e8f0", width: 22, textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "#334155" }}>{gitData.totalCommits} commits</span>
            <span style={{ fontSize: 9, color: "#334155" }}>{gitData.repoCount} repos</span>
            <span style={{ fontSize: 9, color: "#334155" }}>gitpet.app</span>
          </div>
        </div>

      </div>
    ),
    { width: 400, height: 220 }
  );
}