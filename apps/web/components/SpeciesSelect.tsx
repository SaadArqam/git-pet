"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Species } from "@/lib/redis";

interface Props {
  username: string;
  suggestedSpecies: Species;
  topLanguage: string | null;
}

const SPECIES_META: Record<Species, {
  label: string;
  description: string;
  color: string;
  accentColor: string;
  languages: string[];
}> = {
  wolf: {
    label: "Wolf",
    description: "Fast, fierce, low-level",
    color: "#94a3b8",
    accentColor: "#e2e8f0",
    languages: ["Rust", "C++"],
  },
  sabertooth: {
    label: "White Sabertooth",
    description: "Powerful, ancient, systems thinker",
    color: "#f8fafc",
    accentColor: "#cbd5e1",
    languages: ["Go", "C"],
  },
  capybara: {
    label: "Capybara",
    description: "Chill, friendly, gets along with everyone",
    color: "#a16207",
    accentColor: "#fbbf24",
    languages: ["Python", "Ruby"],
  },
  dragon: {
    label: "Dragon",
    description: "Versatile, modern, full-stack fire",
    color: "#7c3aed",
    accentColor: "#a78bfa",
    languages: ["TypeScript", "JavaScript"],
  },
  axolotl: {
    label: "Axolotl",
    description: "Rare, curious, polyglot explorer",
    color: "#db2777",
    accentColor: "#f472b6",
    languages: ["Everything else"],
  },
};

// Pixel art sprite painters — each returns a draw function
function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.08) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  // Body
  p(8, 16, 24, 18, color);
  // Head
  p(10, 4, 20, 16, color);
  // Ears
  p(10, 0, 6, 8, color); p(24, 0, 6, 8, color);
  p(12, 1, 3, 5, "#f9a8d4"); p(25, 1, 3, 5, "#f9a8d4");
  // Snout
  p(14, 14, 12, 8, "#cbd5e1");
  // Eyes
  p(13, 8, 4, 4, "#1e293b"); p(23, 8, 4, 4, "#1e293b");
  p(14, 9, 2, 2, "#fff"); p(24, 9, 2, 2, "#fff");
  // Nose
  p(18, 17, 4, 3, "#1e293b");
  // Legs
  p(9, 30, 6, 10, color); p(17, 30, 6, 10, color);
  p(25, 30, 6, 10, color);
  // Tail
  const tailWag = Math.sin(frame * 0.15) * 4;
  p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color);
}

function drawSabertooth(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.07) * 2;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  // Body — bigger, stockier
  p(6, 18, 28, 20, color);
  // Head
  p(8, 4, 24, 18, color);
  // Ears — pointed
  p(8, 0, 5, 7, color); p(27, 0, 5, 7, color);
  p(9, 1, 3, 4, "#fde68a");
  // Saberteeth
  p(14, 20, 4, 8, "#fff"); p(22, 20, 4, 8, "#fff");
  // Eyes — icy blue
  p(11, 9, 5, 5, "#0ea5e9"); p(24, 9, 5, 5, "#0ea5e9");
  p(12, 10, 2, 2, "#fff"); p(25, 10, 2, 2, "#fff");
  // Nose
  p(17, 16, 6, 4, "#1e293b");
  // Spots
  p(10, 22, 4, 4, "#e2e8f0"); p(22, 26, 4, 4, "#e2e8f0");
  // Legs
  p(7, 34, 7, 8, color); p(16, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawCapybara(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.06) * 1.5;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  // Chunky rounded body
  p(4, 20, 32, 18, color);
  p(2, 24, 36, 10, color); // wider middle
  // Head — big square
  p(6, 6, 24, 18, color);
  // Ears — small round
  p(6, 4, 7, 6, color); p(27, 4, 7, 6, color);
  // Eyes — small, gentle
  p(11, 12, 4, 4, "#1e293b"); p(25, 12, 4, 4, "#1e293b");
  p(12, 13, 2, 2, "#fff"); p(26, 13, 2, 2, "#fff");
  // Nose — wide flat
  p(13, 19, 14, 5, "#92400e");
  p(14, 20, 5, 3, "#1e293b"); p(21, 20, 5, 3, "#1e293b");
  // Little flower on head
  p(16, 2, 4, 4, "#fbbf24"); p(18, 0, 4, 4, "#fbbf24");
  p(17, 1, 6, 6, "#fde68a");
  // Legs — stumpy
  p(6, 34, 8, 8, color); p(16, 34, 8, 8, color); p(26, 34, 8, 8, color);
}

function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.1) * 2;
  const wingFlap = Math.sin(frame * 0.12) * 6;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  // Wings
  p(-8, 8 + wingFlap, 12, 18, "#6d28d9");
  p(36, 8 + wingFlap, 12, 18, "#6d28d9");
  p(-12, 6 + wingFlap, 8, 10, "#7c3aed");
  p(44, 6 + wingFlap, 8, 10, "#7c3aed");
  // Body
  p(8, 18, 24, 20, color);
  // Head
  p(10, 4, 20, 18, color);
  // Horns
  p(10, 0, 4, 8, "#a78bfa"); p(26, 0, 4, 8, "#a78bfa");
  // Eyes — glowing
  p(12, 9, 5, 5, "#fde68a"); p(23, 9, 5, 5, "#fde68a");
  p(13, 10, 2, 2, "#1e293b"); p(24, 10, 2, 2, "#1e293b");
  // Snout
  p(13, 17, 14, 7, "#6d28d9");
  // Nostrils with fire glow
  const fireGlow = frame % 20 < 10 ? "#f97316" : "#fbbf24";
  p(14, 19, 3, 3, fireGlow); p(23, 19, 3, 3, fireGlow);
  // Spines
  p(14, 14, 3, 5, "#a78bfa"); p(20, 12, 3, 5, "#a78bfa"); p(26, 14, 3, 5, "#a78bfa");
  // Tail
  p(28, 26, 10, 6, color); p(34, 22, 6, 6, color); p(38, 18, 5, 5, "#a78bfa");
  // Legs
  p(9, 34, 7, 8, color); p(17, 34, 7, 8, color); p(26, 34, 7, 8, color);
}

function drawAxolotl(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) {
  const bob = Math.sin(frame * 0.09) * 2;
  const gillWave = Math.sin(frame * 0.13) * 3;
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy + bob, w, h);
  };
  // Gills — feathery
  p(2, 4 + gillWave, 5, 14, "#f9a8d4");
  p(0, 2 + gillWave, 4, 8, "#fda4af");
  p(33, 4 + gillWave, 5, 14, "#f9a8d4");
  p(36, 2 + gillWave, 4, 8, "#fda4af");
  p(5, 1 + gillWave, 4, 10, "#f9a8d4");
  p(31, 1 + gillWave, 4, 10, "#f9a8d4");
  // Body — wide, flat
  p(4, 22, 32, 14, color);
  p(2, 26, 36, 8, color);
  // Head — round
  p(6, 8, 28, 18, color);
  // Eyes — big, cute
  p(8, 12, 7, 7, "#1e293b"); p(25, 12, 7, 7, "#1e293b");
  p(9, 13, 4, 4, "#fff"); p(26, 13, 4, 4, "#fff");
  p(10, 14, 2, 2, "#1e293b"); p(27, 14, 2, 2, "#1e293b");
  // Smile
  p(14, 22, 3, 2, "#1e293b"); p(17, 23, 6, 2, "#1e293b"); p(23, 22, 3, 2, "#1e293b");
  // Spots
  p(10, 26, 4, 4, "#f472b6"); p(20, 28, 4, 4, "#f472b6"); p(30, 25, 4, 4, "#f472b6");
  // Stubby legs
  p(6, 32, 8, 10, color); p(26, 32, 8, 10, color);
  // Tail fin
  p(32, 28, 10, 6, color); p(36, 24, 8, 6, "#f9a8d4");
}

const SPECIES_DRAWERS: Record<Species, (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color: string) => void> = {
  wolf: drawWolf,
  sabertooth: drawSabertooth,
  capybara: drawCapybara,
  dragon: drawDragon,
  axolotl: drawAxolotl,
};

function SpeciesCanvas({ species, isSelected, isHovered }: {
  species: Species;
  isSelected: boolean;
  isHovered: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const meta = SPECIES_META[species];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const loop = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, 80, 80);

      // Glow background when selected/hovered
      if (isSelected || isHovered) {
        const gradient = ctx.createRadialGradient(40, 44, 4, 40, 44, 36);
        gradient.addColorStop(0, `${meta.accentColor}33`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 80, 80);
      }

      SPECIES_DRAWERS[species](ctx, 16, 10, frameRef.current, meta.color);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [species, isSelected, isHovered, meta]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={80}
      style={{ imageRendering: "pixelated", display: "block" }}
    />
  );
}

export function SpeciesSelect({ username, suggestedSpecies, topLanguage }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Species | null>(null);
  const [hovered, setHovered] = useState<Species | null>(null);
  const [mode, setMode] = useState<"choose" | "auto">("choose");
  const [saving, setSaving] = useState(false);

  const effectiveSpecies = mode === "auto" ? suggestedSpecies : selected;

  const handleConfirm = async () => {
    if (!effectiveSpecies) return;
    setSaving(true);
    await fetch("/api/species", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ species: effectiveSpecies }),
    });
    router.push("/");
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#020617",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "monospace",
      padding: "24px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <p style={{ color: "#475569", fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
          WELCOME, @{username}
        </p>
        <h1 style={{ color: "#e2e8f0", fontSize: 22, letterSpacing: 2, margin: 0 }}>
          CHOOSE YOUR PET
        </h1>
        <p style={{ color: "#334155", fontSize: 11, marginTop: 8 }}>
          your github activity shapes its mood, health, and evolution
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{
        display: "flex",
        gap: 0,
        marginBottom: 32,
        border: "1px solid #1e293b",
        borderRadius: 8,
        overflow: "hidden",
      }}>
        {(["choose", "auto"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "8px 20px",
              fontSize: 10,
              letterSpacing: 2,
              cursor: "pointer",
              border: "none",
              background: mode === m ? "#1e293b" : "transparent",
              color: mode === m ? "#e2e8f0" : "#475569",
              transition: "all 0.15s",
            }}
          >
            {m === "choose" ? "FREE CHOICE" : "AUTO-ASSIGN"}
          </button>
        ))}
      </div>

      {mode === "auto" && (
        <div style={{
          marginBottom: 24,
          padding: "12px 20px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 8,
          textAlign: "center",
        }}>
          <p style={{ color: "#475569", fontSize: 10, marginBottom: 4 }}>
            based on your top language
          </p>
          <p style={{ color: "#e2e8f0", fontSize: 13 }}>
            <span style={{ color: "#a78bfa" }}>{topLanguage ?? "unknown"}</span>
            {" → "}
            <span style={{ color: SPECIES_META[suggestedSpecies].accentColor }}>
              {SPECIES_META[suggestedSpecies].label}
            </span>
          </p>
        </div>
      )}

      {/* Species grid */}
      <div style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        justifyContent: "center",
        marginBottom: 36,
        maxWidth: 600,
      }}>
        {(Object.keys(SPECIES_META) as Species[]).map((species) => {
          const meta = SPECIES_META[species];
          const isSelected = mode === "auto"
            ? species === suggestedSpecies
            : species === selected;
          const isHovered = hovered === species;
          const isSuggested = species === suggestedSpecies;

          return (
            <div
              key={species}
              onClick={() => { if (mode === "choose") setSelected(species); }}
              onMouseEnter={() => setHovered(species)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: 108,
                background: isSelected ? "#0f172a" : "#080f1f",
                border: `2px solid ${isSelected ? meta.accentColor : isHovered ? "#1e293b" : "#0f172a"}`,
                borderRadius: 12,
                padding: "12px 8px 10px",
                cursor: mode === "choose" ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s",
                position: "relative",
              }}
            >
              {isSuggested && mode === "auto" && (
                <div style={{
                  position: "absolute",
                  top: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: meta.accentColor,
                  color: "#020617",
                  fontSize: 8,
                  letterSpacing: 1,
                  padding: "2px 8px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                }}>
                  YOUR MATCH
                </div>
              )}

              <SpeciesCanvas species={species} isSelected={isSelected} isHovered={isHovered} />

              <div style={{ textAlign: "center" }}>
                <p style={{
                  color: isSelected ? meta.accentColor : "#94a3b8",
                  fontSize: 11,
                  letterSpacing: 1,
                  margin: 0,
                  marginBottom: 3,
                }}>
                  {meta.label.toUpperCase()}
                </p>
                <p style={{ color: "#334155", fontSize: 9, margin: 0, lineHeight: 1.4 }}>
                  {meta.description}
                </p>
                <p style={{ color: "#1e3a5f", fontSize: 8, margin: "4px 0 0", letterSpacing: 0.5 }}>
                  {meta.languages.join(" · ")}
                </p>
              </div>

              {isSelected && (
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: meta.accentColor,
                  boxShadow: `0 0 8px ${meta.accentColor}`,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={!effectiveSpecies || saving}
        style={{
          padding: "12px 40px",
          fontSize: 12,
          letterSpacing: 3,
          cursor: effectiveSpecies && !saving ? "pointer" : "not-allowed",
          border: `1px solid ${effectiveSpecies ? SPECIES_META[effectiveSpecies].accentColor : "#1e293b"}`,
          background: effectiveSpecies ? `${SPECIES_META[effectiveSpecies].accentColor}18` : "transparent",
          color: effectiveSpecies ? SPECIES_META[effectiveSpecies].accentColor : "#334155",
          borderRadius: 8,
          transition: "all 0.2s",
        }}
      >
        {saving ? "SAVING..." : effectiveSpecies ? `CHOOSE ${SPECIES_META[effectiveSpecies].label.toUpperCase()}` : "SELECT A PET"}
      </button>
    </main>
  );
}