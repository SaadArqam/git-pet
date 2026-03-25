"use client";

import type { PetState } from "@git-pet/core";
import { PetCanvas } from "./PetCanvas";
import { StatBar } from "./StatBar";
import { useState } from "react";
import Link from "next/link";
import type { Species } from "@/lib/redis";

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

interface Props {
  petState: PetState;
  species: Species;
}

export function PetCard({ petState, species }: Props) {
  const { stats, mood, stage, gitData } = petState;
  const moodColor = MOOD_COLOR[mood] ?? "#94a3b8";

  const [copied, setCopied] = useState(false);

  // 🔄 NEW: Turntable controls
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.01);

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `![My Git Pet](https://git-pet-beta.vercel.app/api/card/${gitData.username})`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: "#0f172a", border: "2px solid #1e293b", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380, fontFamily: "monospace" }}>

      <div style={{ background: "#020617", borderRadius: 8, border: "2px solid #1e293b", overflow: "hidden", marginBottom: 16 }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>
          <span style={{ fontSize: 10, color: "#475569" }}>@{gitData.username}</span>
          <span style={{ fontSize: 10, color: moodColor }}>{mood.toUpperCase()}</span>
          <span style={{ fontSize: 10, color: "#334155" }}>{STAGE_LABEL[stage]}</span>
        </div>

        {/* 🔥 Pass rotation props */}
        <PetCanvas 
          petState={petState}
          species={species}
          autoRotate={autoRotate}
          rotationSpeed={rotationSpeed}
        />

        {/* 🔄 Turntable Controls UI */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: "#475569" }}>ROTATE</span>
            <button
              onClick={() => setAutoRotate(prev => !prev)}
              style={{
                fontSize: 9,
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #1e293b",
                background: autoRotate ? "#22c55e22" : "transparent",
                color: autoRotate ? "#22c55e" : "#475569",
                cursor: "pointer"
              }}
            >
              {autoRotate ? "ON" : "OFF"}
            </button>
          </div>

          {/* Speed Slider */}
          <input
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            value={rotationSpeed}
            onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderTop: "1px solid #1e293b" }}>
          <span style={{ fontSize: 9, color: "#334155" }}>STREAK: {gitData.streak}d</span>
          <span style={{ fontSize: 9, color: petState.primaryColor }}>{gitData.languages[0]?.toUpperCase()}</span>
          <span style={{ fontSize: 9, color: "#334155" }}>{gitData.totalCommits} commits</span>
        </div>

      </div>

      <div style={{ background: "#0a1628", borderRadius: 8, padding: "14px 16px", border: "1px solid #1e293b", marginBottom: 12 }}>
        <StatBar label="HP"  value={stats.health}       color="#22c55e" />
        <StatBar label="NRG" value={stats.energy}       color="#f59e0b" />
        <StatBar label="INT" value={stats.intelligence} color="#3b82f6" />
        <StatBar label="JOY" value={stats.happiness}    color="#ec4899" />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${copied ? "#22c55e44" : "#1e293b"}`,
            color: copied ? "#22c55e" : "#475569",
            fontFamily: "monospace",
            fontSize: 9,
            padding: "10px 0",
            borderRadius: 6,
            cursor: "pointer",
            letterSpacing: 1,
            transition: "all 0.2s"
          }}
        >
          {copied ? "COPIED!" : "COPY README EMBED"}
        </button>

        <Link
          href="/world"
          style={{
            background: "transparent",
            border: "1px solid #3b82f644",
            color: "#3b82f6",
            fontFamily: "monospace",
            fontSize: 9,
            padding: "10px 14px",
            borderRadius: 6,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            letterSpacing: 1
          }}
        >
          WORLD
        </Link>

        <Link
          href="/api/auth/signout"
          style={{
            background: "transparent",
            border: "1px solid #1e293b",
            color: "#334155",
            fontFamily: "monospace",
            fontSize: 9,
            padding: "10px 14px",
            borderRadius: 6,
            textDecoration: "none",
            display: "flex",
            alignItems: "center"
          }}
        >
          OUT
        </Link>
      </div>

    </div>
  );
}