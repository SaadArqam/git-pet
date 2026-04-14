import { GitHubClient } from "@git-pet/github";
import { derivePetState } from "@git-pet/core";
import { NextRequest } from "next/server";
import { ImageResponse } from 'next/og';

export const runtime = "edge";

const STAGE_LABEL: Record<string, string> = {
  egg: "EGG", hatchling: "HATCHLING", adult: "ADULT", legend: "LEGEND",
};

const MOOD_COLOR: Record<string, string> = {
  happy: "#22c55e", content: "#3b82f6", tired: "#f59e0b",
  coma: "#ef4444", sad: "#64748b",
};

const SPECIES_PRIMARY: Record<string, string> = {
  wolf: "#94a3b8",
  sabertooth: "#f8fafc",
  capybara: "#a16207",
  dragon: "#7c3aed",
  axolotl: "#db2777",
};

async function getSpeciesEdge(username: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
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
  { params }: { params: { username: string } }
) {
  try {
    const { username } = params;
    const token = process.env.GITHUB_CARD_TOKEN;
    if (!token) return new Response("GITHUB_CARD_TOKEN not set", { status: 500 });

    const species = await getSpeciesEdge(username);
    const petColor = (species && SPECIES_PRIMARY[species]) ? SPECIES_PRIMARY[species]! : "";

    const client = new GitHubClient(token);
    const gitData = await client.fetchUserStats(username);
    const petState = derivePetState(gitData);

    const { mood, stage, primaryColor } = petState;
    const finalColor = petColor || primaryColor;
    const moodColor = MOOD_COLOR[mood] ?? "#94a3b8";
    const stageLabel = STAGE_LABEL[stage] ?? stage.toUpperCase();

    const { totalCommits, streak } = gitData;
    const friends = (gitData as any).friendCount || 0;

    return new ImageResponse(
      (
        <div style={{
          height: '280px',
          width: '500px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a1628',
          padding: '32px',
          position: 'relative',
          color: 'white',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '4px', color: '#e2e8f0', marginBottom: '4px' }}>
                GIT PET
              </div>
              <div style={{ fontSize: '14px', color: '#475569' }}>
                @{username}
              </div>
            </div>
            <div style={{
              display: 'flex',
              padding: '6px 14px',
              border: `1px solid ${moodColor}66`,
              borderRadius: '6px',
              color: moodColor,
              fontSize: '11px',
              fontWeight: 'bold',
              height: '28px',
              alignItems: 'center'
            }}>
              {stageLabel}
            </div>
          </div>

          {/* Main Content */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
            {/* Pet Sprite Placeholder (Card design uses a container for the pet) */}
            <div style={{
              width: '160px',
              height: '140px',
              backgroundColor: '#0f172a',
              borderRadius: '12px',
              border: '2px solid #1e293b',
              marginRight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                backgroundColor: finalColor, 
                borderRadius: '50%', 
                opacity: 0.15,
                position: 'absolute'
              }} />
              <div style={{ fontSize: '48px' }}>
                {species === 'dragon' ? '🐉' : species === 'axolotl' ? '🦎' : species === 'capybara' ? '🐹' : '🐱'}
              </div>
            </div>

            {/* Stats Column */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: '16px', color: '#64748b', marginBottom: '8px' }}>
                <span style={{ width: '80px' }}>Commits</span>
                <span style={{ color: 'white' }}>{totalCommits}</span>
              </div>
              <div style={{ display: 'flex', fontSize: '16px', color: '#64748b', marginBottom: '8px' }}>
                <span style={{ width: '80px' }}>Streak</span>
                <span style={{ color: 'white' }}>{streak}d</span>
              </div>
              <div style={{ display: 'flex', fontSize: '16px', color: '#64748b' }}>
                <span style={{ width: '80px' }}>Friends</span>
                <span style={{ color: 'white' }}>{friends}</span>
              </div>
            </div>
          </div>

          {/* Footer Footer */}
          <div style={{ 
            position: 'absolute', 
            bottom: '24px', 
            left: '32px', 
            right: '32px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <div style={{ fontSize: '11px', color: '#334155', letterSpacing: '1px' }}>
              git-pet-beta.vercel.app
            </div>
            <div style={{ color: '#ffd4a0', fontSize: '18px' }}>✦</div>
          </div>
        </div>
      ),
      {
        width: 500,
        height: 280,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error("Error generating card:", err);
    return new Response("Error generating card", { status: 500 });
  }
}