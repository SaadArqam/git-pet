import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

export const runtime = "edge";

// ── Species config ──────────────────────────────────────────────────────────

const SPECIES_EMOJI: Record<string, string> = {
  wolf:       "🐺",
  sabertooth: "🐯",
  capybara:   "🐹",
  dragon:     "🐉",
  axolotl:    "🦎",
};

const SPECIES_COLOR: Record<string, string> = {
  wolf:       "#94a3b8",
  sabertooth: "#cbd5e1",
  capybara:   "#d97706",
  dragon:     "#7c3aed",
  axolotl:    "#db2777",
};

// ── Redis / species helper ───────────────────────────────────────────────────

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
    if (typeof val === "string") val = val.replace(/['"]/g, "").toLowerCase();
    return val || null;
  } catch {
    return null;
  }
}

// ── Health → color helper ────────────────────────────────────────────────────

function healthColor(v: number): string {
  if (v >= 60) return "#22c55e";
  if (v >= 30) return "#f59e0b";
  return "#ef4444";
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const ghToken = process.env.GITHUB_CARD_TOKEN;
    if (!ghToken) return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });

    const [species, gitData] = await Promise.all([
      getSpeciesEdge(username),
      new GitHubClient(ghToken).fetchUserStats(username),
    ]);

    const petState       = derivePetState(gitData);
    const { health, energy } = petState.stats;
    const activity       = Math.min(100, Math.round(energy));

    const speciesKey  = species && SPECIES_EMOJI[species] ? species : "dragon";
    const emoji       = SPECIES_EMOJI[speciesKey]!;
    const glow        = SPECIES_COLOR[speciesKey] ?? "#7c3aed";
    const speciesName = speciesKey.charAt(0).toUpperCase() + speciesKey.slice(1);

    const hColor = healthColor(health);
    const aColor = "#818cf8";

    const W = 500;
    const H = 280;

    return new ImageResponse(
      (
        <div
          style={{
            width:           `${W}px`,
            height:          `${H}px`,
            display:         "flex",
            backgroundColor: "#0d1a35",
            color:           "white",
            position:        "relative",
          }}
        >
          {/* ── TOP accent stripe ── */}
          <div style={{
            position:        "absolute",
            top:             0,
            left:            0,
            right:           0,
            height:          "3px",
            backgroundColor: glow,
            opacity:         0.8,
            display:         "flex",
          }} />

          {/* ── LEFT: pet panel ── */}
          <div style={{
            width:           "180px",
            height:          "100%",
            display:         "flex",
            flexDirection:   "column",
            alignItems:      "center",
            justifyContent:  "center",
            flexShrink:      0,
            backgroundColor: "#0a0f1e",
            position:        "relative",
          }}>
            {/* glow circle — no filter, just opacity */}
            <div style={{
              position:        "absolute",
              width:           "110px",
              height:          "110px",
              borderRadius:    "55px",
              backgroundColor: glow,
              opacity:         0.15,
              display:         "flex",
            }} />

            {/* emoji */}
            <div style={{
              fontSize:    "68px",
              lineHeight:  "1",
              display:     "flex",
              position:    "relative",
            }}>
              {emoji}
            </div>

            {/* species badge */}
            <div style={{
              marginTop:       "14px",
              paddingTop:      "4px",
              paddingBottom:   "4px",
              paddingLeft:     "12px",
              paddingRight:    "12px",
              borderRadius:    "99px",
              backgroundColor: "#1e2d4a",
              fontSize:        "10px",
              fontWeight:      700,
              color:           glow,
              letterSpacing:   "1px",
              display:         "flex",
            }}>
              {speciesName.toUpperCase()}
            </div>
          </div>

          {/* ── RIGHT: info panel ── */}
          <div style={{
            flex:            1,
            display:         "flex",
            flexDirection:   "column",
            justifyContent:  "center",
            paddingTop:      "28px",
            paddingBottom:   "28px",
            paddingLeft:     "24px",
            paddingRight:    "28px",
          }}>
            {/* label */}
            <div style={{
              fontSize:      "11px",
              color:         "#475569",
              letterSpacing: "1.5px",
              marginBottom:  "4px",
              display:       "flex",
            }}>
              GITHUB DEVELOPER
            </div>

            {/* username */}
            <div style={{
              fontSize:      "24px",
              fontWeight:    800,
              color:         "#f1f5f9",
              marginBottom:  "20px",
              display:       "flex",
            }}>
              @{username}
            </div>

            {/* ── Health bar ── */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "14px" }}>
              <div style={{
                display:         "flex",
                justifyContent:  "space-between",
                alignItems:      "center",
                marginBottom:    "6px",
              }}>
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, display: "flex" }}>
                  HEALTH
                </div>
                <div style={{ fontSize: "11px", color: hColor, fontWeight: 700, display: "flex" }}>
                  {health} / 100
                </div>
              </div>
              <div style={{
                width:           "100%",
                height:          "7px",
                backgroundColor: "#1e2d4a",
                borderRadius:    "4px",
                display:         "flex",
                overflow:        "hidden",
              }}>
                <div style={{
                  width:           `${health}%`,
                  height:          "100%",
                  backgroundColor: hColor,
                  borderRadius:    "4px",
                  display:         "flex",
                }} />
              </div>
            </div>

            {/* ── Activity bar ── */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "20px" }}>
              <div style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "center",
                marginBottom:   "6px",
              }}>
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, display: "flex" }}>
                  ACTIVITY
                </div>
                <div style={{ fontSize: "11px", color: aColor, fontWeight: 700, display: "flex" }}>
                  {activity} / 100
                </div>
              </div>
              <div style={{
                width:           "100%",
                height:          "7px",
                backgroundColor: "#1e2d4a",
                borderRadius:    "4px",
                display:         "flex",
                overflow:        "hidden",
              }}>
                <div style={{
                  width:           `${activity}%`,
                  height:          "100%",
                  backgroundColor: aColor,
                  borderRadius:    "4px",
                  display:         "flex",
                }} />
              </div>
            </div>

            {/* ── Stats row ── */}
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* streak */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: "20px" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#e2e8f0", display: "flex" }}>
                  {gitData.streak}d
                </div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "0.5px", display: "flex" }}>
                  STREAK
                </div>
              </div>

              {/* divider */}
              <div style={{ width: "1px", height: "28px", backgroundColor: "#1e2d4a", marginRight: "20px", display: "flex" }} />

              {/* commits */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: "20px" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#e2e8f0", display: "flex" }}>
                  {gitData.totalCommits}
                </div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "0.5px", display: "flex" }}>
                  COMMITS
                </div>
              </div>

              {/* divider */}
              <div style={{ width: "1px", height: "28px", backgroundColor: "#1e2d4a", marginRight: "20px", display: "flex" }} />

              {/* stars */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#e2e8f0", display: "flex" }}>
                  {gitData.stars}
                </div>
                <div style={{ fontSize: "9px", color: "#475569", letterSpacing: "0.5px", display: "flex" }}>
                  STARS
                </div>
              </div>
            </div>
          </div>

          {/* ── bottom watermark ── */}
          <div style={{
            position:      "absolute",
            bottom:        "10px",
            right:         "14px",
            fontSize:      "10px",
            color:         "#1e2d4a",
            letterSpacing: "0.5px",
            display:       "flex",
          }}>
            git-pet-beta.vercel.app
          </div>
        </div>
      ),
      {
        width:   W,
        height:  H,
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("Error generating card:", err);
    return new Response("Error generating card", { status: 500 });
  }
}