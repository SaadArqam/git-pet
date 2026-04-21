import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { getSpeciesRects } from "@git-pet/renderer";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "edge";

const ROLE_MAP: Record<string, string> = {
  wolf: "AGGRO",
  sabertooth: "TANK",
  capybara: "SUPPORT",
  dragon: "LEGEND",
  axolotl: "REGEN",
  default: "PET",
};

function renderSpriteJSX(species: string, frame: number): any {
  const CANON_COLORS: Record<string, string> = {
    wolf:       '#94a3b8',
    sabertooth: '#f8fafc',
    capybara:   '#a16207',
    dragon:     '#7c3aed',
    axolotl:    '#db2777',
  }
  const baseColor = CANON_COLORS[species] ?? '#94a3b8'
  const rects = getSpeciesRects(species, frame, baseColor, 'front')
  
  if (!rects || rects.length === 0) {
    // fallback: colored circle if species not found
    return (
      <div style={{
        width: 64, height: 64,
        borderRadius: 32,
        background: baseColor,
      }} />
    )
  }

  // getSpeciesRects uses pixel coordinates ~0–40 range
  // Find bounding box to normalize
  const xs = rects.map(r => r[0] + r[2])
  const ys = rects.map(r => r[1] + r[3])
  const maxX = Math.max(...xs, 1)
  const maxY = Math.max(...ys, 1)

  // Scale to fit inside 80x80 container
  const SPRITE_SIZE = 80
  const scaleX = SPRITE_SIZE / maxX
  const scaleY = SPRITE_SIZE / maxY
  const scale = Math.min(scaleX, scaleY)

  return (
    <div style={{
      width: SPRITE_SIZE,
      height: SPRITE_SIZE,
      position: 'relative',
      display: 'flex',
    }}>
      {rects.map(([x, y, w, h, color], i) => (
        <div
          key={String(i)}
          style={{
            position: 'absolute',
            left: Math.round(x * scale),
            top: Math.round(y * scale),
            width: Math.max(1, Math.round(w * scale)),
            height: Math.max(1, Math.round(h * scale)),
            background: color,
          }}
        />
      ))}
    </div>
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const ghToken = process.env.GITHUB_CARD_TOKEN ?? process.env.GITHUB_TOKEN;
  
  let gitData: any = null;
  let petState: any = null;
  let speciesRaw: string | null = null;

  try {
    const [storedSpecies, stats] = await Promise.all([
      redis.get<string>(`species:${username}`),
      ghToken ? new GitHubClient(ghToken).fetchUserStats(username).catch(() => null) : Promise.resolve(null)
    ]);
    speciesRaw = storedSpecies;
    gitData = stats;
    if (gitData) {
      petState = derivePetState(gitData);
    }
  } catch (err) {
    console.error('[card] Error fetching data:', err);
  }

  const rawData = {
    streak: gitData?.streak,
    totalCommits: gitData?.totalCommits ?? gitData?.commits,
    stars: gitData?.stars ?? gitData?.totalStars,
    hp: petState?.stats?.health,
    activity: petState?.stats?.energy,
    level: petState?.level,
    petType: speciesRaw ?? petState?.primaryColor
  };

  console.error('[card] raw data:', JSON.stringify(rawData));

  if (!speciesRaw) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 640,
            height: 300,
            background: "#0d1117",
            border: "1.5px solid #30363d",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            color: "#e6edf3",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 640,
              height: 3,
              background: "linear-gradient(to right, #f0a84e, #c77c2a, transparent)",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "system-ui", display: "flex", marginBottom: 12 }}>
            No pet found for @{username}
          </div>
          <div style={{ fontSize: 16, color: "#6e7681", fontFamily: "monospace", display: "flex" }}>
            git-pet-beta.vercel.app
          </div>
        </div>
      ),
      {
        width: 640,
        height: 300,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }

  const data = rawData;
  const petTypeString = data?.petType ?? speciesRaw ?? 'capybara';
  const petType = typeof petTypeString === 'string' ? petTypeString.toLowerCase() : 'capybara';
  const role = ROLE_MAP[petType] || ROLE_MAP["default"]!;
  
  const streak = gitData?.streak ?? 0;
  const totalCommits = data?.totalCommits ?? 0;
  const stars = data?.stars ?? 0;
  
  const hpRawNum = data?.hp ?? 100;
  const activityRawNum = data?.activity ?? 100;
  const hp = Math.max(0, Math.min(100, hpRawNum));
  const activity = Math.max(0, Math.min(100, activityRawNum));
  const level = data?.level ?? 1;

  const formattedCommits = totalCommits.toLocaleString("en-US");
  const formattedStars = stars.toLocaleString("en-US");
  
  const trackFillHp = `${Math.round((hp / 100) * 100)}%`;
  const trackFillActivity = `${Math.round((activity / 100) * 100)}%`;

  const frame = 12; // static frame for card — no animation needed
  const spriteJSX = renderSpriteJSX(petType, frame);

  return new ImageResponse(
    (
      <div
        style={{
          width: 640,
          height: 300,
          background: "#0d1117",
          border: "1.5px solid #30363d",
          borderRadius: 12,
          display: "flex",
          flexDirection: "row",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 640,
            height: 3,
            background: "linear-gradient(to right, #f0a84e, #c77c2a, transparent)",
            display: "flex",
          }}
        />

        <div
          style={{
            width: 160,
            flexShrink: 0,
            background: "#0a0e13",
            borderRight: "1px solid #30363d",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              background: "#1a2030",
              border: "1.5px solid #30363d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {spriteJSX}
          </div>
          <div
            style={{
              background: "#1e2940",
              border: "1px solid #f0a84e44",
              borderRadius: 10,
              padding: "4px 12px",
              fontSize: 9,
              fontFamily: "monospace",
              color: "#f0a84e",
              letterSpacing: 2,
              display: "flex",
            }}
          >
            {petType.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 9,
              fontFamily: "monospace",
              color: "#6e7681",
              letterSpacing: 1,
              display: "flex",
            }}
          >
            LVL {level} · {role}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#f0a84e", letterSpacing: 3, display: "flex" }}>
              GIT PET
            </div>
            <div style={{ fontSize: 9, color: "#30363d", display: "flex" }}>·</div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, display: "flex" }}>
              DEVELOPER CARD
            </div>
          </div>

          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#e6edf3",
              fontFamily: "system-ui",
              marginBottom: 12,
              display: "flex",
            }}
          >
            @{username}
          </div>

          <div style={{ height: 1, background: "#21262d", marginBottom: 12, display: "flex" }} />

          <div style={{ display: "flex", flexDirection: "row", gap: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, marginBottom: 4, display: "flex" }}>
                STREAK
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <div style={{ fontFamily: "system-ui", fontSize: 20, fontWeight: 700, color: "#e6edf3", display: "flex" }}>
                  {streak}
                </div>
                <div style={{ fontFamily: "system-ui", fontSize: 12, color: "#6e7681", display: "flex", paddingBottom: 2 }}>
                  days
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, marginBottom: 4, display: "flex" }}>
                COMMITS
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
                <div style={{ fontFamily: "system-ui", fontSize: 20, fontWeight: 700, color: "#e6edf3", display: "flex" }}>
                  {formattedCommits}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, marginBottom: 4, display: "flex" }}>
                STARS
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <div style={{ fontFamily: "system-ui", fontSize: 20, fontWeight: 700, color: "#e6edf3", display: "flex" }}>
                  {formattedStars}
                </div>
                <div style={{ fontFamily: "system-ui", fontSize: 12, color: "#6e7681", display: "flex", paddingBottom: 3 }}>
                  ★
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: "#21262d", marginTop: 12, marginBottom: 12, display: "flex" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, flex: 1, display: "flex" }}>
              HEALTH
            </div>
            <div style={{ flex: 1, height: 6, background: "#21262d", borderRadius: 3, display: "flex" }}>
              <div style={{ height: 6, width: trackFillHp, background: "#4ade80", borderRadius: 3, display: "flex" }} />
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4ade80", display: "flex" }}>
              {hp}/100
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#6e7681", letterSpacing: 2, flex: 1, display: "flex" }}>
              ACTIVITY
            </div>
            <div style={{ flex: 1, height: 6, background: "#21262d", borderRadius: 3, display: "flex" }}>
              <div style={{ height: 6, width: trackFillActivity, background: "#818cf8", borderRadius: 3, display: "flex" }} />
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#818cf8", display: "flex" }}>
              {activity}/100
            </div>
          </div>

          <div style={{ height: 1, background: "#21262d", marginTop: 12, marginBottom: 12, display: "flex" }} />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "monospace", fontSize: 8, color: "#30363d", letterSpacing: 2, display: "flex" }}>
              GIT-PET-BETA.VERCEL.APP
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 8, color: "#30363d", display: "flex" }}>
              2025
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 640,
      height: 300,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
