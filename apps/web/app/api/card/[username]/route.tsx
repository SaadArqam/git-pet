import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { getSpeciesRects, CANON_COLORS } from "@git-pet/renderer";
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

function renderSprite(species: string, frame: number): any {
  const baseColor = CANON_COLORS[species] ?? "#94a3b8";
  const rects = getSpeciesRects(species, frame, baseColor, "front");

  if (!rects || rects.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "42px",
        }}
      >
        🐾
      </div>
    );
  }

  let maxX = 0;
  let maxY = 0;
  for (const [x, y, w, h] of rects) {
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  const SIZE = 80;
  const scale = Math.min(SIZE / Math.max(maxX, 1), SIZE / Math.max(maxY, 1));

  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        position: "relative",
        display: "flex",
        flexShrink: 0,
      }}
    >
      {rects.map(([x, y, w, h, color]: any, i: number) => (
        <div
          key={String(i)}
          style={{
            position: "absolute",
            left: Math.round(x * scale),
            top: Math.round(y * scale),
            width: Math.max(1, Math.round(w * scale)),
            height: Math.max(1, Math.round(h * scale)),
            background: color,
          }}
        />
      ))}
    </div>
  );
}

const QR_PATTERN = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
];

const BAR_WIDTHS = [2,1,3,1,2,1,3,2,1,2,3,1,2,1,3,2,1,1,3,2,1,2,1,3];

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
      ghToken
        ? new GitHubClient(ghToken).fetchUserStats(username).catch(() => null)
        : Promise.resolve(null),
    ]);
    speciesRaw = storedSpecies;
    gitData = stats;
    if (gitData) {
      petState = derivePetState(gitData);
    }
  } catch (err) {
    console.error("[card] Error fetching data:", err);
  }

  // NULL GUARD — no pet found
  if (!speciesRaw) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 660,
            height: 280,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#f5f0e8",
            borderRadius: 16,
            overflow: "hidden",
            fontFamily: "monospace",
          }}
        >
          <div style={{ fontSize: 12, color: "#1a1a1a", letterSpacing: 3, display: "flex" }}>
            NO PET FOUND
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "#1a1a1a",
              marginTop: 8,
              display: "flex",
            }}
          >
            @{username}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "#999",
              marginTop: 12,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            git-pet-beta.vercel.app
          </div>
        </div>
      ),
      {
        width: 660,
        height: 280,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }

  // Derive fields
  const petType = (speciesRaw ?? "capybara").toLowerCase();
  const role = ROLE_MAP[petType] ?? ROLE_MAP["default"]!;
  const streak: number = gitData?.streak ?? 0;
  const longestStreak: number = gitData?.longestStreak ?? 0;
  const totalCommits: number = gitData?.totalCommits ?? 0;
  const hp: number = Math.max(0, Math.min(100, petState?.stats?.health ?? 100));
  const activity: number = Math.max(0, Math.min(100, petState?.stats?.energy ?? 100));
  const level: number = petState?.level ?? 1;

  const displayStreak = streak > 0 ? streak : longestStreak;
  const streakUnit = streak > 0 ? "DAYS" : "BEST";
  const commitsDisplay =
    totalCommits >= 1000
      ? (totalCommits / 1000).toFixed(1) + "k"
      : String(totalCommits);

  const year = new Date().getFullYear();
  const barcodeText = `GP${level}${year}${username.toUpperCase()}`;

  const frame = 8;
  const spriteJSX = renderSprite(petType, frame);

  const card = (
    <div
      style={{
        width: 660,
        height: 280,
        display: "flex",
        flexDirection: "column",
        background: "#f5f0e8",
        borderRadius: 16,
        overflow: "hidden",
        fontFamily: "monospace",
      }}
    >
      {/* LAYER 1 — Top strip */}
      <div
        style={{
          height: 24,
          background: "#1a1a1a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 20px",
        }}
      >
        <div
          style={{
            fontSize: 8,
            color: "#f0a84e",
            letterSpacing: 4,
            fontFamily: "monospace",
            display: "flex",
          }}
        >
          GIT — PET
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: "#4ade80",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 7,
              color: "#555",
              letterSpacing: 2,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            ACTIVE · 2025
          </div>
        </div>
        <div
          style={{
            fontSize: 8,
            color: "#444",
            letterSpacing: 2,
            fontFamily: "monospace",
            display: "flex",
          }}
        >
          DEV-ID
        </div>
      </div>

      {/* LAYER 2 — Middle row */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row" }}>
        {/* LEFT PANEL */}
        <div
          style={{
            width: 170,
            flexShrink: 0,
            background: "#1a1a1a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 14px",
            gap: 10,
          }}
        >
          {/* Sprite container */}
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: 6,
              background: "#111",
              border: "2px solid #f0a84e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {spriteJSX}
          </div>

          {/* Species pill */}
          <div
            style={{
              background: "#f0a84e",
              borderRadius: 3,
              padding: "4px 12px",
              fontSize: 9,
              color: "#1a1a1a",
              letterSpacing: 3,
              fontWeight: 700,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            {petType.toUpperCase()}
          </div>

          {/* Active dot + class label */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "#4ade80",
                display: "flex",
              }}
            />
            <div
              style={{
                fontSize: 7,
                color: "#666",
                letterSpacing: 1,
                fontFamily: "monospace",
                display: "flex",
              }}
            >
              {role} CLASS
            </div>
          </div>

          {/* Thin divider */}
          <div
            style={{
              width: "100%",
              height: 1,
              background: "#2a2a2a",
              display: "flex",
            }}
          />

          {/* ID number */}
          <div
            style={{
              fontSize: 7,
              color: "#333",
              letterSpacing: 1,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            ID: GP-{level}-2025
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div
          style={{
            flex: 1,
            background: "#f5f0e8",
            padding: "18px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 12,
            }}
          >
            {/* Left side */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 7,
                  color: "#bbb",
                  letterSpacing: 4,
                  marginBottom: 4,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                DEVELOPER PASS
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#1a1a1a",
                  letterSpacing: -1,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                @{username}
              </div>
            </div>

            {/* Faded stamp circle */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                border: "2px solid #1a1a1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.12,
              }}
            >
              <div
                style={{
                  fontSize: 6,
                  color: "#1a1a1a",
                  textAlign: "center",
                  lineHeight: 1.4,
                  fontFamily: "monospace",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex" }}>GIT</div>
                <div style={{ display: "flex" }}>PET</div>
                <div style={{ display: "flex" }}>2025</div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div
            style={{
              borderTop: "1.5px solid #1a1a1a",
              borderBottom: "1.5px solid #1a1a1a",
              padding: "10px 0",
              marginBottom: 12,
              display: "flex",
            }}
          >
            {/* STREAK */}
            <div
              style={{
                flex: 1,
                borderRight: "1px solid #ddd",
                paddingRight: 14,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 7,
                  color: "#999",
                  letterSpacing: 2,
                  marginBottom: 2,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                STREAK
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: "#1a1a1a",
                  letterSpacing: -1,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {displayStreak}
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: "#aaa",
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                {streakUnit}
              </div>
            </div>

            {/* COMMITS */}
            <div
              style={{
                flex: 1,
                borderRight: "1px solid #ddd",
                padding: "0 14px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 7,
                  color: "#999",
                  letterSpacing: 2,
                  marginBottom: 2,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                COMMITS
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: "#1a1a1a",
                  letterSpacing: -1,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                {commitsDisplay}
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: "#aaa",
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                TOTAL
              </div>
            </div>

            {/* HEALTH */}
            <div
              style={{
                flex: 1,
                paddingLeft: 14,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 7,
                  color: "#999",
                  letterSpacing: 2,
                  marginBottom: 2,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                HEALTH
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    color: "#1a1a1a",
                    letterSpacing: -1,
                    lineHeight: 1,
                    display: "flex",
                  }}
                >
                  {hp}
                </div>
                <div style={{ fontSize: 14, color: "#aaa", display: "flex" }}>
                  %
                </div>
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: "#aaa",
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                HP
              </div>
            </div>
          </div>

          {/* Activity bar */}
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontSize: 7,
                  color: "#999",
                  letterSpacing: 2,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                ACTIVITY SCORE
              </div>
              <div
                style={{
                  fontSize: 7,
                  color: "#1a1a1a",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                {activity} / 100
              </div>
            </div>
            <div
              style={{
                height: 5,
                background: "#ddd",
                borderRadius: 0,
                display: "flex",
              }}
            >
              <div
                style={{
                  width: `${activity}%`,
                  height: "100%",
                  background: "#1a1a1a",
                  borderRadius: 0,
                  display: "flex",
                }}
              />
            </div>
          </div>

          {/* Footer row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "auto",
            }}
          >
            {/* Issued by */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 7,
                  color: "#bbb",
                  letterSpacing: 2,
                  marginBottom: 2,
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                ISSUED BY
              </div>
              <div
                style={{
                  fontSize: 7,
                  color: "#999",
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                git-pet-beta.vercel.app
              </div>
            </div>

            {/* Mini QR decoration */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, opacity: 0.18 }}>
              {QR_PATTERN.map((row, ri) => (
                <div key={String(ri)} style={{ display: "flex", gap: 1 }}>
                  {row.map((cell, ci) => (
                    <div
                      key={String(ci)}
                      style={{
                        width: 5,
                        height: 5,
                        background: cell === 1 ? "#1a1a1a" : "#f5f0e8",
                        display: "flex",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* LAYER 3 — Bottom barcode strip */}
      <div
        style={{
          height: 28,
          background: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
        }}
      >
        {/* Barcode bars */}
        <div style={{ display: "flex", gap: 1, alignItems: "center" }}>
          {BAR_WIDTHS.map((w, i) => (
            <div
              key={String(i)}
              style={{
                width: w,
                height: 14,
                background: "#f5f0e8",
                borderRadius: 0,
                display: "flex",
              }}
            />
          ))}
        </div>

        {/* Encoded text */}
        <div
          style={{
            fontSize: 7,
            color: "#444",
            letterSpacing: 1,
            fontFamily: "monospace",
            display: "flex",
          }}
        >
          {barcodeText}
        </div>

        {/* Right side valid badge */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 20,
              height: 13,
              background: "#f0a84e",
              borderRadius: 2,
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 7,
              color: "#444",
              letterSpacing: 2,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            VALID
          </div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(card, {
    width: 660,
    height: 280,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
