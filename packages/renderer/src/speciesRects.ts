export type Rect = [number, number, number, number, string]; // [x, y, w, h, color]

export function getSpeciesRects(species: string, frame: number, color: string): Rect[] | null {
  const rects: Rect[] = [];
  const p = (dx: number, dy: number, w: number, h: number, c: string) => {
    rects.push([dx, dy, w, h, c]);
  };

  if (species === "wolf") {
    const bob = Math.sin(frame * 0.08) * 2;
    p(8, 16 + bob, 24, 18, color);
    p(10, 4 + bob, 20, 16, color);
    p(10, 0 + bob, 6, 8, color); p(24, 0 + bob, 6, 8, color);
    p(12, 1 + bob, 3, 5, "#f9a8d4"); p(25, 1 + bob, 3, 5, "#f9a8d4");
    p(14, 14 + bob, 12, 8, "#cbd5e1");
    p(13, 8 + bob, 4, 4, "#1e293b"); p(23, 8 + bob, 4, 4, "#1e293b");
    p(14, 9 + bob, 2, 2, "#fff"); p(24, 9 + bob, 2, 2, "#fff");
    p(18, 17 + bob, 4, 3, "#1e293b");
    p(9, 30 + bob, 6, 10, color); p(17, 30 + bob, 6, 10, color);
    p(25, 30 + bob, 6, 10, color);
    const tailWag = Math.sin(frame * 0.15) * 4;
    p(30, 18 + tailWag, 8, 5, color); p(34, 14 + tailWag, 6, 5, color);
    return rects;
  }

  if (species === "sabertooth") {
    const bob = Math.sin(frame * 0.07) * 2;
    p(6, 18 + bob, 28, 20, color);
    p(8, 4 + bob, 24, 18, color);
    p(8, 0 + bob, 5, 7, color); p(27, 0 + bob, 5, 7, color);
    p(9, 1 + bob, 3, 4, "#fde68a");
    p(14, 20 + bob, 4, 8, "#fff"); p(22, 20 + bob, 4, 8, "#fff");
    p(11, 9 + bob, 5, 5, "#0ea5e9"); p(24, 9 + bob, 5, 5, "#0ea5e9");
    p(12, 10 + bob, 2, 2, "#fff"); p(25, 10 + bob, 2, 2, "#fff");
    p(17, 16 + bob, 6, 4, "#1e293b");
    p(10, 22 + bob, 4, 4, "#e2e8f0"); p(22, 26 + bob, 4, 4, "#e2e8f0");
    p(7, 34 + bob, 7, 8, color); p(16, 34 + bob, 7, 8, color); p(26, 34 + bob, 7, 8, color);
    return rects;
  }

  if (species === "capybara") {
    const bob = Math.sin(frame * 0.06) * 1.5;
    p(4, 20 + bob, 32, 18, color);
    p(2, 24 + bob, 36, 10, color);
    p(6, 6 + bob, 24, 18, color);
    p(6, 4 + bob, 7, 6, color); p(27, 4 + bob, 7, 6, color);
    p(11, 12 + bob, 4, 4, "#1e293b"); p(25, 12 + bob, 4, 4, "#1e293b");
    p(12, 13 + bob, 2, 2, "#fff"); p(26, 13 + bob, 2, 2, "#fff");
    p(13, 19 + bob, 14, 5, "#92400e");
    p(14, 20 + bob, 5, 3, "#1e293b"); p(21, 20 + bob, 5, 3, "#1e293b");
    p(16, 2 + bob, 4, 4, "#fbbf24"); p(18, 0 + bob, 4, 4, "#fbbf24");
    p(17, 1 + bob, 6, 6, "#fde68a");
    p(6, 34 + bob, 8, 8, color); p(16, 34 + bob, 8, 8, color); p(26, 34 + bob, 8, 8, color);
    return rects;
  }

  if (species === "dragon") {
    const bob = Math.sin(frame * 0.1) * 2;
    const wingFlap = Math.sin(frame * 0.12) * 6;
    p(-8, 8 + wingFlap, 12, 18, "#6d28d9");
    p(36, 8 + wingFlap, 12, 18, "#6d28d9");
    p(-12, 6 + wingFlap, 8, 10, "#7c3aed");
    p(44, 6 + wingFlap, 8, 10, "#7c3aed");
    p(8, 18 + bob, 24, 20, color);
    p(10, 4 + bob, 20, 18, color);
    p(10, 0 + bob, 4, 8, "#a78bfa"); p(26, 0 + bob, 4, 8, "#a78bfa");
    p(12, 9 + bob, 5, 5, "#fde68a"); p(23, 9 + bob, 5, 5, "#fde68a");
    p(13, 10 + bob, 2, 2, "#1e293b"); p(24, 10 + bob, 2, 2, "#1e293b");
    p(13, 17 + bob, 14, 7, "#6d28d9");
    const fireGlow = frame % 20 < 10 ? "#f97316" : "#fbbf24";
    p(14, 19 + bob, 3, 3, fireGlow); p(23, 19 + bob, 3, 3, fireGlow);
    p(14, 14 + bob, 3, 5, "#a78bfa"); p(20, 12 + bob, 3, 5, "#a78bfa"); p(26, 14 + bob, 3, 5, "#a78bfa");
    p(28, 26 + bob, 10, 6, color); p(34, 22 + bob, 6, 6, color); p(38, 18 + bob, 5, 5, "#a78bfa");
    p(9, 34 + bob, 7, 8, color); p(17, 34 + bob, 7, 8, color); p(26, 34 + bob, 7, 8, color);
    return rects;
  }

  if (species === "axolotl") {
    const bob = Math.sin(frame * 0.09) * 2;
    const gillWave = Math.sin(frame * 0.13) * 3;
    p(2, 4 + gillWave, 5, 14, "#f9a8d4");
    p(0, 2 + gillWave, 4, 8, "#fda4af");
    p(33, 4 + gillWave, 5, 14, "#f9a8d4");
    p(36, 2 + gillWave, 4, 8, "#fda4af");
    p(5, 1 + gillWave, 4, 10, "#f9a8d4");
    p(31, 1 + gillWave, 4, 10, "#f9a8d4");
    p(4, 22 + bob, 32, 14, color);
    p(2, 26 + bob, 36, 8, color);
    p(6, 8 + bob, 28, 18, color);
    p(8, 12 + bob, 7, 7, "#1e293b"); p(25, 12 + bob, 7, 7, "#1e293b");
    p(9, 13 + bob, 4, 4, "#fff"); p(26, 13 + bob, 4, 4, "#fff");
    p(10, 14 + bob, 2, 2, "#1e293b"); p(27, 14 + bob, 2, 2, "#1e293b");
    p(14, 22 + bob, 3, 2, "#1e293b"); p(17, 23 + bob, 6, 2, "#1e293b"); p(23, 22 + bob, 3, 2, "#1e293b");
    p(10, 26 + bob, 4, 4, "#f472b6"); p(20, 28 + bob, 4, 4, "#f472b6"); p(30, 25 + bob, 4, 4, "#f472b6");
    p(6, 32 + bob, 8, 10, color); p(26, 32 + bob, 8, 10, color);
    p(32, 28 + bob, 10, 6, color); p(36, 24 + bob, 8, 6, "#f9a8d4");
    return rects;
  }

  return null;
}
