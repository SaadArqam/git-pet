import { ImageResponse } from "@vercel/og";
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

// Species primary colors — edge-safe, no Redis needed
const SPECIES_PRIMARY: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#f8fafc",
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

  if (!token) {
    return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });
  }

  // Fetch species from Redis via internal API — edge-safe (HTTP fetch, not SDK)
  const baseUrl = req.nextUrl.origin;
  let speciesColor = "";
  try {
    const speciesRes = await fetch(`${baseUrl}/api/species?username=${username}`, {
      headers: { "x-internal": "card" },
    });
    if (speciesRes.ok) {
      const data = await speciesRes.json() as { species?: string };
      speciesColor = SPECIES_PRIMARY[data.species ?? ""] ?? "";
    }
  } catch {
    // silently fall back to petState.primaryColor
  }

  let petState: PetState;
  try {
    const client = new GitHubClient(token);
    const gitData = await client.fetchUserStats(username);
    petState = derivePetState(gitData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`Failed: ${msg}`, { status: 500 });
  }

  const { stats, mood, stage, gitData, primaryColor } = petState;
  const moodColor   = MOOD_COLOR[mood]   ?? "#94a3b8";
  const stageLabel  = STAGE_LABEL[stage] ?? stage.toUpperCase();
  const petColor    = speciesColor || primaryColor;
  const PIXEL       = 7;

  // getSpriteView is pure — no Node APIs, safe on edge
  const pixels = getSpriteView(stage as Parameters<typeof getSpriteView>[0], mood as Parameters<typeof getSpriteView>[1], petColor, 0, "front");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          background: "#020617",
          width: 400,
          height: 220,
          borderRadius: 16,
          padding: 20,
          gap: 20,
          fontFamily: "monospace",
        }}
      >
        {/* LEFT — pet screen */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "#0f172a",
            borderRadius: 10,
            border: "2px solid #1e293b",
            width: 140,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <span style={{ fontSize: 8, color: "#475569" }}>@{gitData.username}</span>
            <span style={{ fontSize: 8, color: moodColor }}>{mood.toUpperCase()}</span>
          </div>

          {/* sprite area */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#020617",
              position: "relative",
              minHeight: 90,
            }}
          >
            {pixels.map(([x, y, color], i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x * PIXEL + 20,
                  top:  y * PIXEL + 5,
                  width: PIXEL,
                  height: PIXEL,
                  background: color,
                }}
              />
            ))}
          </div>

          {/* footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 8px",
              borderTop: "1px solid #1e293b",
            }}
          >
            <span style={{ fontSize: 7, color: "#334155" }}>{gitData.streak}d streak</span>
            <span style={{ fontSize: 7, color: petColor }}>
              {gitData.languages[0]?.toUpperCase() ?? ""}
            </span>
          </div>
        </div>

        {/* RIGHT — stats */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* title row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 16, color: "#e2e8f0", letterSpacing: 3 }}>
                GIT PET
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: moodColor,
                  padding: "2px 8px",
                  border: `1px solid ${moodColor}44`,
                  borderRadius: 4,
                }}
              >
                {stageLabel}
              </span>
            </div>
            <span style={{ fontSize: 10, color: "#475569" }}>@{gitData.username}</span>
          </div>

          {/* stat bars */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              { label: "HP",  value: stats.health,       color: "#22c55e" },
              { label: "NRG", value: stats.energy,       color: "#f59e0b" },
              { label: "INT", value: stats.intelligence, color: "#3b82f6" },
              { label: "JOY", value: stats.happiness,    color: "#ec4899" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 10, color: "#64748b", width: 28 }}>
                  {label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    background: "#1e293b",
                    borderRadius: 3,
                    display: "flex",
                  }}
                >
                  <div
                    style={{
                      width: `${value}%`,
                      height: "100%",
                      background: color,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: "#e2e8f0",
                    width: 22,
                    textAlign: "right",
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* footer row */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "#334155" }}>
              {gitData.totalCommits} commits
            </span>
            <span style={{ fontSize: 9, color: "#334155" }}>
              {gitData.repoCount} repos
            </span>
            <span style={{ fontSize: 9, color: "#334155" }}>
              git-pet-beta.vercel.app
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 400, height: 220 }
  );
}