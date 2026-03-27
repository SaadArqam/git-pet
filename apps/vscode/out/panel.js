"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PetPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
class PetPanelProvider {
    static createOrShow(extensionUri, data) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        if (PetPanelProvider.currentPanel) {
            PetPanelProvider.currentPanel.panel.reveal(column);
            PetPanelProvider.currentPanel.updateContent(data.getCached());
            return;
        }
        const panel = vscode.window.createWebviewPanel("gitPet", "Git Pet", column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        PetPanelProvider.currentPanel = new PetPanelProvider(panel, extensionUri, data);
    }
    static refresh(data) {
        PetPanelProvider.currentPanel?.updateContent(data.getCached());
    }
    constructor(panel, extensionUri, data) {
        this.extensionUri = extensionUri;
        this.data = data;
        this.disposables = [];
        this.panel = panel;
        this.updateContent(data.getCached());
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "refresh") {
                await data.refresh();
                this.updateContent(data.getCached());
            }
            if (message.command === "setUsername") {
                vscode.commands.executeCommand("gitPet.setUsername");
            }
            if (message.command === "openSettings") {
                vscode.commands.executeCommand("workbench.action.openSettings", "gitPet");
            }
        }, null, this.disposables);
    }
    updateContent(pet) {
        this.panel.webview.html = this.buildHtml(pet);
    }
    buildHtml(pet) {
        if (!pet) {
            return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { background: #020617; color: #475569; font-family: monospace;
         display: flex; flex-direction: column; align-items: center;
         justify-content: center; height: 100vh; gap: 16px; margin: 0; }
  button { background: transparent; border: 1px solid rgba(34,197,94,0.3);
           color: #22c55e; font-family: monospace; font-size: 11px;
           padding: 10px 20px; border-radius: 6px; cursor: pointer;
           letter-spacing: 2px; }
  button:hover { background: rgba(34,197,94,0.08); }
</style>
</head>
<body>
  <p style="font-size:24px; letter-spacing:4px; color:#e2e8f0">GIT PET</p>
  <p style="font-size:12px">connect your github to meet your pet</p>
  <button onclick="vscode.postMessage({command:'setUsername'})">SET GITHUB USERNAME</button>
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
        }
        const MOOD_COLOR = {
            happy: "#22c55e", neutral: "#94a3b8",
            tired: "#f59e0b", sad: "#ef4444", coma: "#6366f1",
        };
        const moodColor = MOOD_COLOR[pet.mood] ?? "#94a3b8";
        const STAGE_LABEL = {
            egg: "EGG", hatchling: "HATCHLING", adult: "ADULT", legend: "LEGEND ★",
        };
        const SPECIES_PRIMARY = {
            wolf: "#94a3b8", sabertooth: "#f8fafc", capybara: "#a16207",
            dragon: "#7c3aed", axolotl: "#db2777",
        };
        const speciesColor = SPECIES_PRIMARY[pet.species] ?? pet.primaryColor;
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #020617;
    font-family: monospace;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 32px 16px;
    min-height: 100vh;
    color: #e2e8f0;
  }
  .card {
    background: #0f172a;
    border: 2px solid #1e293b;
    border-radius: 16px;
    padding: 20px;
    width: 100%;
    max-width: 380px;
  }
  .screen {
    background: #020617;
    border-radius: 8px;
    border: 2px solid #1e293b;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .screen-header, .screen-footer {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #1e293b;
  }
  .screen-footer { border-bottom: none; border-top: 1px solid #1e293b; }
  .screen-header span, .screen-footer span { font-size: 10px; }
  canvas { display: block; width: 100%; image-rendering: pixelated; }
  .stats { background: #0a1628; border-radius: 8px; padding: 14px 16px;
           border: 1px solid #1e293b; margin-bottom: 12px; }
  .stat-row { margin-bottom: 10px; }
  .stat-row:last-child { margin-bottom: 0; }
  .stat-label-row { display: flex; justify-content: space-between;
                    font-size: 10px; margin-bottom: 4px; color: #475569; }
  .bar-bg { background: #1e293b; border-radius: 2px; height: 4px; }
  .bar-fill { height: 4px; border-radius: 2px; transition: width 0.3s; }
  .local-box {
    background: #0f172a; border: 1px solid #1e293b; border-radius: 8px;
    padding: 12px 16px; margin-bottom: 12px; font-size: 10px; color: #475569;
    display: flex; justify-content: space-between; align-items: center;
  }
  .local-box span { color: #22c55e; }
  .actions { display: flex; gap: 8px; }
  .btn {
    flex: 1; background: transparent; border: 1px solid #1e293b;
    color: #475569; font-family: monospace; font-size: 9px;
    padding: 10px 0; border-radius: 6px; cursor: pointer;
    letter-spacing: 1px; transition: all 0.2s;
  }
  .btn:hover { border-color: #334155; color: #94a3b8; }
  .view-dots { display: flex; gap: 16px; justify-content: center;
               margin-top: 8px; padding-bottom: 2px; }
  .view-dot {
    font-size: 10px; letter-spacing: 2px; cursor: pointer;
    color: #334155; border-bottom: 1px solid transparent;
    padding-bottom: 2px; transition: color 0.2s;
    background: none; border-top: none; border-left: none; border-right: none;
    font-family: monospace;
  }
  .view-dot.active { border-bottom-color: var(--species-color); }
</style>
</head>
<body>
<div class="card">
  <div class="screen">
    <div class="screen-header">
      <span style="color:#475569">@${pet.username}</span>
      <span style="color:${moodColor}">${pet.mood.toUpperCase()}</span>
      <span style="color:#334155">${STAGE_LABEL[pet.stage] ?? pet.stage.toUpperCase()}</span>
    </div>

    <canvas id="petCanvas" width="240" height="180"></canvas>

    <div style="padding: 6px 0 2px;">
      <div class="view-dots">
        <button class="view-dot active" data-view="front" onclick="setView('front',this)">F</button>
        <button class="view-dot" data-view="side" onclick="setView('side',this)">S</button>
        <button class="view-dot" data-view="back" onclick="setView('back',this)">B</button>
      </div>
    </div>

    <div class="screen-footer">
      <span style="color:#334155">STREAK: ${pet.streak}d</span>
      <span style="color:${speciesColor}">${pet.topLanguage.toUpperCase()}</span>
      <span style="color:#334155">${pet.totalCommits} commits</span>
    </div>
  </div>

  <div class="stats">
    ${[
            { label: "HP", value: pet.stats.health, color: "#22c55e" },
            { label: "NRG", value: pet.stats.energy, color: "#f59e0b" },
            { label: "INT", value: pet.stats.intelligence, color: "#3b82f6" },
            { label: "JOY", value: pet.stats.happiness, color: "#ec4899" },
        ].map(s => `
      <div class="stat-row">
        <div class="stat-label-row"><span>${s.label}</span><span>${s.value}</span></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${s.value}%;background:${s.color}"></div></div>
      </div>
    `).join("")}
  </div>

  ${pet.localCommitsToday > 0 ? `
  <div class="local-box">
    <span style="color:#475569">local commits today</span>
    <span>+${pet.localCommitsToday} 🔥</span>
  </div>` : ""}

  <div class="actions">
    <button class="btn" onclick="vscode.postMessage({command:'refresh'})">↻ REFRESH</button>
    <button class="btn" onclick="vscode.postMessage({command:'setUsername'})">@ USERNAME</button>
    <button class="btn" onclick="vscode.postMessage({command:'openSettings'})">⚙ SETTINGS</button>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ── Pet data injected from extension ─────────────────────────────────────
const PET = ${JSON.stringify({
            stage: pet.stage,
            mood: pet.mood,
            primaryColor: speciesColor,
            species: pet.species,
        })};

// ── Pixel art renderer (self-contained, no imports needed) ────────────────
const PIXEL = 6;

function darken(hex, amt) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
  return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function lighten(hex, amt) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.min(255,r+amt); g = Math.min(255,g+amt); b = Math.min(255,b+amt);
  return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// parseSolid: same engine as packages/renderer/src/species.ts
function parseSolid(art, bobFactor) {
  const coords = [];
  for (let row = 0; row < art.length; row++) {
    const line = art[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch !== ' ') coords.push([col, row, ch]);
    }
  }
  return function(C, dark, light, eye, mood, blink, frame) {
    const px = [];
    const bob = Math.floor(Math.sin(frame * bobFactor) * 1);
    for (const [x, y, ch] of coords) {
      if (blink && (ch === 'e' || ch === 'w')) continue;
      let color;
      switch(ch) {
        case 'C': color = C;         break;
        case 'D': color = dark;      break;
        case 'L': color = light;     break;
        case 'e': color = eye;       break;
        case 'w': color = '#fff';    break;
        case 'y': color = '#eab308'; break;
        case 'o': color = '#f97316'; break;
        case 'p': color = '#db2777'; break;
        case 's': color = '#f472b6'; break;
        case 'b': color = '#0ea5e9'; break;
        default: continue;
      }
      const finalY = (ch === 'w' && (mood === 'sad' || mood === 'coma')) ? y + bob + 1 : y + bob;
      px.push([Math.max(0,Math.min(12,x)), Math.max(0,Math.min(10,finalY)), color]);
    }
    return px;
  };
}

// Species sprites (front/side/back for adult — hatchling/egg omitted for brevity,
// falls back to default cat below)
const SPECIES_SPRITES = {
  wolf: {
    front: parseSolid(["   D   D     ","  LCL LCL    ","  CCCwCCC    ","  CCeCeCC    ","  CCCCCCC    ","   CDDDC     ","   DDDDD     ","  CCCCCCC    ","  D     D    "], 0.07),
    side:  parseSolid(["      D      ","     LCL     ","     CCCw    ","     CCeC    ","    CCCCC    ","    CDDDC    "," DD DDDDD    ","  CCCCCCC    ","  D     D    "], 0.07),
    back:  parseSolid(["   D   D     ","  LCL LCL    ","  CCCCCCC    ","  CCCCCCC    ","  CCCCCCC    ","   CCCCC     ","   CCCCC     ","  D     D    "], 0.07),
  },
  sabertooth: {
    front: parseSolid(["   D   D     ","  CDC CDC    ","  CCCwCCC    ","  CCbCbCC    ","  CCCCCCC    ","   CDDDC     ","   ww ww     ","  CCCCCCC    ","  D  D  D    "], 0.07),
    side:  parseSolid(["      D      ","     CDC     ","     CCCw    ","     CCbC    ","    CCCCC    ","    CDDDC    ","DD  Dwww     "," CCCCCCCC    "," D   D  D    "], 0.07),
    back:  parseSolid(["   D   D     ","  CDC CDC    ","  CCCCCCC    ","  CCCCCCC    ","  CCCCCCC    ","   CCCCC     ","   CCCCC     ","  D  D  D    "], 0.07),
  },
  capybara: {
    front: parseSolid(["             ","   D   D     ","  CCCCCCC    ","  CeCCCeC    ","  CCCCCCC    ","   CDDDC     ","  CCCCCCC    ","  CCCCCCC    ","  D     D    "], 0.06),
    side:  parseSolid(["             ","      D      ","     CCCC    ","     CCCe    ","    CCCCC    ","    CDDDC    "," CCCCCCCC    "," CCCCCCCC    "," D   D  D    "], 0.06),
    back:  parseSolid(["             ","   D   D     ","  CCCCCCC    ","  CCCCCCC    ","  CCCCCCC    ","   CCCCC     ","  CCCCCCC    ","  CCCCCCC    ","  D     D    "], 0.06),
  },
  dragon: {
    front: parseSolid(["   D   D     ","   C   C     ","  DCCwCCD    ","  oCeCeCo    ","  CCCCCCC    "," p CDDDC p   ","p CCCCCCC p  "," pCCCCCCCp   ","  D  D  D    "], 0.1),
    side:  parseSolid(["      D      ","      C      ","     CCwD    ","     CeCo    ","    CCCCC    ","  p CDDDC    "," DDCCCCCC p  ","  pCCCCCCp   "," D  D   D    "], 0.1),
    back:  parseSolid(["   D   D     ","   C   C     ","  DCCCCCD    ","  CCCCCCC    ","DpCCCCCCCpD  "," p CCCCC p   ","p CCCCCCC p  "," pCCCCCCCp   ","  D  D  D    "], 0.1),
  },
  axolotl: {
    front: parseSolid([" s     s     ","  CCCCC      ","sCwCCCwCs    "," CeeCeCC     ","sCCCCCCCs    ","  CDDDC      ","  CCCCC      ","  CCCCC      ","  D   D      "], 0.09),
    side:  parseSolid(["       s     ","     CCCCCs  ","    CCwCCCs  ","    eeCeCC   ","   CCCCCCCs  ","    CDDDC    ","s  CCCCCC    ","   CCCCC     "," D  D   D    "], 0.09),
    back:  parseSolid([" s     s     ","  CCCCC      ","sCCCCCCCs    "," CCCCCCC     ","sCCCCCCCs    ","  CCCCC      ","  CCCCC      ","s CCCCC s    ","  D   D      "], 0.09),
  },
};

// Default cat (fallback)
function defaultAdultFront(C, dark, light, eye, mood, blink, frame) {
  const px = [];
  const bob = Math.floor(Math.sin(frame * 0.07) * 1);
  const body = [[3,5],[4,5],[5,5],[6,5],[7,5],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[2,7],[3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[3,8],[4,8],[5,8],[6,8],[7,8]];
  const head = [[3,2],[4,2],[5,2],[6,2],[7,2],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4]];
  body.forEach(([x,y]) => px.push([x,y+bob,C]));
  head.forEach(([x,y]) => px.push([x,y+bob,C]));
  px.push([3,1+bob,dark]); px.push([7,1+bob,dark]);
  [[3,2],[4,2]].forEach(([x,y]) => px.push([x,y+bob,light]));
  if (!blink) {
    px.push([3,3+bob,eye]); px.push([4,3+bob,eye]); px.push([6,3+bob,eye]); px.push([7,3+bob,eye]);
  }
  [[3,9],[5,9],[7,9]].forEach(([x,y]) => px.push([x,y+bob,dark]));
  return px;
}

function getPixels(species, stage, mood, C, frame, view) {
  const dark  = darken(C, 40);
  const light = lighten(C, 40);
  const eye   = mood === 'coma' ? '#334155' : mood === 'sad' ? '#64748b' : '#1e293b';
  const blink = frame % 40 === 0;

  const sp = SPECIES_SPRITES[species];
  if (sp && (stage === 'adult' || stage === 'legend')) {
    const fn = view === 'back' ? sp.back : view === 'side' ? sp.side : sp.front;
    let px = fn(C, dark, light, eye, mood, blink, frame);
    if (stage === 'legend') {
      const bob = Math.floor(Math.sin(frame * 0.07) * 1);
      [[3,0],[5,0],[7,0],[3,1],[4,1],[5,1],[6,1],[7,1]].forEach(([x,y]) => px.push([x,y+bob,'#EAB308']));
    }
    return px;
  }
  // Fallback
  return defaultAdultFront(C, dark, light, eye, mood, blink, frame);
}

// ── Render loop ───────────────────────────────────────────────────────────
const canvas = document.getElementById('petCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let frame   = 0;
let curView = 'front';

// Set CSS variable for species color
document.documentElement.style.setProperty('--species-color', PET.primaryColor);

// Auto-cycle views
const CYCLE = ['front','side','back','side'];
let cycleIdx = 0;
let autoRotate = true;
setInterval(() => {
  if (!autoRotate) return;
  cycleIdx = (cycleIdx + 1) % CYCLE.length;
  curView = CYCLE[cycleIdx];
  updateDots();
}, 2000);

function setView(v, el) {
  curView = v;
  autoRotate = false;
  setTimeout(() => { autoRotate = true; }, 4000);
  updateDots();
}

function updateDots() {
  document.querySelectorAll('.view-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.view === curView);
  });
}

function render() {
  frame++;
  ctx.clearRect(0, 0, 240, 180);

  // Background
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, 240, 180);

  // Checkerboard
  for (let x = 0; x < 240; x += PIXEL) {
    for (let y = 0; y < 180; y += PIXEL) {
      if ((x/PIXEL + y/PIXEL) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x, y, PIXEL, PIXEL);
      }
    }
  }

  // Scanlines
  for (let y = 0; y < 180; y += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 240, 1);
  }

  const pixels = getPixels(PET.species, PET.stage, PET.mood, PET.primaryColor, frame, curView);
  const spriteW = 13 * PIXEL;
  const spriteH = 11 * PIXEL;
  const ox = Math.floor((240 - spriteW) / 2) - PIXEL;
  const oy = Math.floor((180 - spriteH) / 2);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(120, oy + spriteH + 8, 28, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  pixels.forEach(([x, y, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x * PIXEL, oy + y * PIXEL, PIXEL, PIXEL);
  });

  // Happy particles
  if (PET.mood === 'happy' && frame % 20 < 10) {
    const pf = (frame % 60) / 60;
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(ox + 2*PIXEL, Math.round(oy - pf*30), 4, 4);
    ctx.fillStyle = '#86efac';
    ctx.fillRect(ox + 10*PIXEL, Math.round(oy - ((pf+0.3)%1)*30), 4, 4);
  }

  // Z particles
  if (PET.mood === 'tired' || PET.mood === 'coma') {
    const zf = (frame % 80) / 80;
    ctx.font = (8 + zf*4) + 'px monospace';
    ctx.fillStyle = 'rgba(148,163,184,' + (0.8 - zf*0.6) + ')';
    ctx.fillText('z', ox + 10*PIXEL + zf*10, oy + 2*PIXEL - zf*20);
  }

  if (curView !== 'front') {
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(71,85,105,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(curView.toUpperCase(), 120, 174);
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
</script>
</body>
</html>`;
    }
    dispose() {
        PetPanelProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}
exports.PetPanelProvider = PetPanelProvider;
//# sourceMappingURL=panel.js.map