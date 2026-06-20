# CLAUDE.md — git-pet Project Context

This file is the primary context source for AI sessions on this project. It is generated from reading the actual source code. Do not guess from it; if something changed, re-read the code.

---

## Section 1: Project Overview

git-pet is a multiplayer 3D world where your GitHub activity drives the appearance and stats of a pixel creature (your "pet"). It is not a dashboard or a stats viewer. The core loop is: sign in with GitHub → GitHub data is fetched via GraphQL → PetState is derived → your pet appears in a shared Three.js world alongside other developers' pets → you walk around and interact with them in real time.

Live URL: https://git-pet-beta.vercel.app  
GitHub: https://github.com/SaadArqam/git-pet  
Author: Saad Arqam (@SaadArqam)

The world is the product, not the dashboard. The dashboard and pet card are secondary surfaces.

---

## Section 2: Tech Stack

Exact versions as found in package.json files:

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.2.1 |
| UI library | React | 19.2.4 |
| 3D rendering | Three.js | r128 (loaded from CDN at runtime, not npm) |
| CSS2D labels | CSS2DRenderer | r128 (loaded from jsDelivr CDN) |
| Realtime | PartyKit (partysocket client) | 1.1.16 |
| PartyKit server SDK | partykit | 0.0.115 (devDependency) |
| Auth | next-auth | 4.24.13 |
| Database | @upstash/redis | 1.37.0 |
| OG image generation | @vercel/og (ImageResponse) | 0.11.1 |
| Monorepo tool | Turborepo | latest (in root devDependencies) |
| TypeScript | typescript | 5.4.x (root), 5.x (web), 5.5.x (web-party) |
| React Compiler | babel-plugin-react-compiler | 1.0.0 (devDependency, enabled via next.config.ts) |
| Deployment | Vercel (Next.js app) + PartyKit cloud (WebSocket server) |
| Node requirement | 18+ |
| Package manager | npm 10.8.2 (enforced via packageManager field) |

Three.js is NOT installed as an npm package. It is loaded at runtime via CDN in WorldClient.tsx using a dynamic script loader, then accessed as `(window as any).THREE`. This is intentional and load-bearing — do not attempt to npm-install three.js.

---

## Section 3: Monorepo Structure

```
git-pet/
├── package.json                   Root workspace config, Turborepo scripts
├── turbo.json                     Turborepo pipeline config
├── .env.example                   Template for required environment variables
├── README.md                      Public-facing project docs
├── CONTRIBUTING.md                Contributor guidelines
├── CLAUDE.md                      This file — AI context
├── apps/
│   └── web/                       Next.js 16 app (App Router)
│       ├── app/
│       │   ├── page.tsx           Root route — renders LandingPage
│       │   ├── LandingPage.tsx    Full landing page with animated pet preview
│       │   ├── layout.tsx         Root layout, SessionProvider wrapper
│       │   ├── providers.tsx      Client-side SessionProvider
│       │   ├── globals.css        Minimal global CSS
│       │   ├── dashboard/
│       │   │   └── page.tsx       Dashboard: shows PetCard, handles species selection for new users
│       │   ├── world/
│       │   │   └── page.tsx       World entry: fetches GitHub data server-side, renders WorldClient
│       │   ├── settings/          Species switching UI (SpeciesSwitch component)
│       │   ├── signin/            Sign-in redirect page
│       │   ├── about/             About page
│       │   └── api/
│       │       ├── auth/[...nextauth]/  NextAuth GitHub OAuth handler
│       │       ├── card/[username]/
│       │       │   └── route.tsx  OG image API, edge runtime, renders pet card as PNG
│       │       ├── species/
│       │       │   └── route.ts   GET/POST species preference for current user
│       │       ├── friends/
│       │       │   └── route.ts   GET friends list, POST to add a friend (used by PartyKit too)
│       │       ├── ghosts/
│       │       │   └── route.ts   GET offline ghost positions, POST to save last position
│       │       ├── leaderboard/
│       │       │   └── route.ts   GET real leaderboard data (top streak/commits/friends), live GitHub fetch, HTTP-cached 1h
│       │       ├── pet/           Pet data endpoint (partially wired)
│       │       ├── user/          User data endpoint
│       │       └── online-users/  Online user count endpoint
│       ├── components/
│       │   ├── world/
│       │   │   └── WorldClient.tsx  The entire 3D world (2700+ lines, single file)
│       │   ├── PetCanvas.tsx      Canvas-based pet renderer component (for dashboard/card)
│       │   ├── PetCard.tsx        Dashboard pet card with stats and links
│       │   ├── SpeciesSelect.tsx  First-time species selection screen
│       │   ├── SpeciesSwitch.tsx  Species re-selection screen (settings)
│       │   └── StatBar.tsx        Reusable stat bar UI
│       ├── lib/
│       │   ├── redis.ts           Upstash Redis client + key helpers + LANGUAGE_TO_SPECIES map
│       │   └── auth.ts            NextAuth config (GitHub provider)
│       ├── party/
│       │   └── world.ts           Old/stub PartyKit server (not the active one — see web-party)
│       ├── web-party/             Active standalone PartyKit server project
│       │   ├── partykit.json      PartyKit config — name: "web-party", main: src/server.ts
│       │   ├── src/
│       │   │   ├── server.ts      The real PartyKit WebSocket server (169 lines)
│       │   │   └── client.ts      Minimal PartyKit browser client stub
│       │   └── package.json       Separate package for partykit deploy
│       └── next.config.ts         Enables React Compiler (reactCompiler: true)
├── packages/
│   ├── core/                      Shared TypeScript types and pet derivation logic
│   │   └── src/
│   │       ├── types.ts           PetState, PetStats, GitData, Mood, Stage interfaces
│   │       ├── stats.ts           deriveStats, deriveMood, deriveStage, derivePrimaryColor, derivePetState
│   │       └── index.ts           Re-exports
│   ├── renderer/                  Canvas pet renderer (used in 2D contexts: dashboard, landing, card)
│   │   └── src/
│   │       ├── speciesRects.ts    getSpeciesRects() — returns [x,y,w,h,color][] for 5 species × 3 views
│   │       ├── draw.ts            drawPet() — draws to a 2D canvas context
│   │       ├── sprites.ts         Fallback pixel sprite data (used when species is unknown)
│   │       ├── species.ts         Additional species data
│   │       ├── colors.ts          Color utilities
│   │       └── index.ts           Re-exports drawPet, getSpeciesRects
│   └── github/                    GitHub data fetching package
│       └── src/
│           ├── client.ts          GitHubClient class — fetchUserStats() via GraphQL
│           ├── query.ts           USER_STATS_QUERY GraphQL query
│           ├── transform.ts       transformToGitData() — converts raw GraphQL → GitData
│           └── types.ts           GitHubGraphQLResponse type
└── tooling/                       Shared tooling configs (ESLint, TypeScript base configs)
```

---

## Section 4: Critical Architecture Facts

These are load-bearing patterns. Changing them carelessly will break the project.

### 4.1 Three.js loaded from CDN, not npm

Three.js r128 and CSS2DRenderer are loaded at runtime inside the `init()` async function in WorldClient.tsx using a `loadScript()` helper. After loading, the library is accessed as `(window as any).THREE`. This pattern exists because Next.js SSR would fail if Three.js were imported at module level (it requires `window`). The CDN approach also avoids bundling a large library. Every Three.js call inside `init()` uses the local `const THREE = (window as any).THREE` variable, never a module import.

If you add new Three.js features, they must go inside `init()` and use the local `THREE` variable. Do not npm-install three.

### 4.2 The RAF loop structure and movement block pattern

The main render loop (`tick()`) runs via `requestAnimationFrame`. It has a strict structure:

```
if (p.controlEnabled && !movementBlocked.current) {
  // normal WASD movement
} else if (!movementBlocked.current) {
  // cinematic walk-in (player auto-moves forward until control is enabled)
}
```

The `else if (!movementBlocked.current)` branch is the cinematic intro walk. It must not be touched. When the interaction menu opens, `movementBlocked.current = true` freezes both branches simultaneously. This prevents drift or lurch when opening the menu mid-walk.

`movementBlocked.current` is set to `true` in `openInteractionMenu()` and cleared in `closeInteractionMenu()`. These two refs must stay in sync. If movement is re-enabled without clearing velocity, the player lurches.

### 4.3 interactionTargetRef and interactionTarget state sync

There are two parallel references to the current interaction target:
- `interactionTargetRef` — a `useRef` used inside the RAF loop and event handlers (synchronous, always current)
- `interactionTarget` state — a `useState` used by React to conditionally render the HUD

Both must be set together in `openInteractionMenu()` and cleared together in `closeInteractionMenu()`. The ref is necessary because closures inside the RAF loop and `onKD` handler capture the ref but not the stale state. The state is necessary for React to render the HUD. If you update only one without the other, the HUD shows when no target exists, or interaction keys fire with no target.

### 4.4 All interaction logic inlined inside onKD

The keyboard handler `onKD` is defined inside the `init()` async function and closed over the Three.js `THREE` variable and scene-level objects. Moving any interaction logic (fight, befriend, emoji) outside of this closure would break access to `THREE`, `scene`, `remotePlayersRef`, etc. This is a known constraint documented in both CONTRIBUTING.md and code comments.

### 4.5 Multiplayer player tracking: two separate Maps

Remote players are tracked in `remotePlayersRef.current` (a `Record<string, { bb, targetPos, targetRot, species }>`), which holds active live players. Ghost pets (offline users at their last position) are tracked separately in `ghostsRef.current` (a `Map<string, { group }>`).

This split is load-bearing for proximity detection and interaction: the RAF loop's proximity check only iterates `remotePlayersRef.current`, automatically excluding ghosts. Ghost meshes never appear as interaction targets. Any code that iterates over remote players for interaction, animation, or proximity must use `remotePlayersRef.current`, not `ghostsRef.current`.

### 4.6 Pet rendering via getSpeciesRects — two paths in draw.ts

`drawPet()` in the renderer package has two codepaths:
1. If `species` is a known species and `getSpeciesRects()` returns non-null, it draws rectangles directly. This path is used for known species (wolf, sabertooth, capybara, dragon, axolotl).
2. If `getSpeciesRects()` returns null, it falls back to `getSpriteView()` which returns pixel-by-pixel sprite data.

In WorldClient.tsx, the 3D voxel pets in the world are built with `buildVoxelPet()`, which calls `getSpeciesRects()` directly and creates `THREE.BoxGeometry` meshes for each rect. The billboard sprites (floating 2D canvases above players) use `drawPet()` in the RAF loop via `updateBillboard()`. These are two completely different rendering paths for the same visual.

### 4.7 Billboard camera-facing behavior

Remote player sprites are rendered as `THREE.Mesh` with `PlaneGeometry` on a canvas texture. The plane faces the camera via:
```js
plane.onBeforeRender = (renderer, scene, camera) => {
  plane.quaternion.copy(camera.quaternion);
};
```
This is the Three.js r128 compatible billboard approach. Do not replace it with `THREE.Sprite` or later-version billboard APIs; r128 does not support them the same way.

### 4.8 PartyKit server mismatch: two server files

There are two PartyKit server files:
- `apps/web/party/world.ts` — an old stub with a minimal interface (position, join, leave messages). This is NOT the active server.
- `apps/web/web-party/src/server.ts` — the active PartyKit server deployed separately via `partykit.json` with name `"web-party"`. This handles snapshot, pet_update, pet_left, befriend, fight, emoji, presence_update messages.

The `NEXT_PUBLIC_PARTYKIT_HOST` env var must point to the web-party deployment. The client connects to room `"world"` in that host. The `onRequest` handler in the server exposes `GET /parties/web-party/world` (with `x-internal` auth) to return the list of currently online usernames, used by the ghosts API.

### 4.9 Species stored in Redis, not derived from GitHub data

Each user's chosen species is stored as `species:{username}` in Upstash Redis. It is NOT automatically derived from their GitHub languages at login time. The auto-assignment (`autoAssignSpecies()`) only runs as a suggestion on the first-time species selection screen. After the user picks a species, it is saved via `POST /api/species` and read on every subsequent page load.

The Redis key structure is:
- `species:{username}` — string, the chosen species
- `friends:{username}` — Redis Set, list of friend usernames (bi-directional)
- `last_seen:{username}` — JSON object `{ timestamp, x, z }` for ghost positioning

### 4.10 Ghost system: offline user persistence

When a user disconnects (beforeunload event, socket close, or React cleanup), their position is POSTed to `POST /api/ghosts`. On world load, `GET /api/ghosts` returns all users who have a `last_seen:` entry, are not currently in the PartyKit room (queried via `onRequest`), and whose entry is less than 7 days old. These are rendered as translucent (opacity 0.4) voxel pets with a slate-gray (#64748b) CSS2D label. Ghosts sway with the same `sin(frame * 0.04) * 0.06` rotation as live pets but do not move. They are removed when the real user connects (snapshot or move message arrives for their username).

### 4.11 Reciprocal befriend flow (two-sided, 5-second window)

Befriending is NOT instant. Pressing F on a target sends a `befriend_request` WS message. The receiver gets a toast and has 5 seconds (tracked in `pendingBefriendRef`) to press F on the same sender while that sender is their interaction target. If they do, `befriend_confirmed` is broadcast and both clients update `friendsRef` and play an enhanced midpoint heart animation. If the window expires, `befriend_expired` is broadcast and both sides see a fizzle animation (broken heart particles, 600ms fade). Friends state is only updated on `befriend_confirmed`, never on the initial request.

The PartyKit server (`web-party/src/server.ts`) still has the old `befriend` → `befriend_received` handler but does NOT yet have `befriend_request`, `befriend_confirmed`, or `befriend_expired` handlers. The client sends these new message types and the server needs to be updated to route them. Currently these messages only work if the server broadcasts them generically or if the recipient happens to receive the broadcast. This is a current gap (see Section 7).

### 4.12 Ambient proximity interaction system

Two new refs track proximity state:
- `proximityTimers` (Map<string, number>) — seconds each remote player has been continuously within 4 units
- `ambientTiltActive` (Set<string>) — which players currently have an active head-tilt animation

Each RAF frame, for each remote player within 4 units: the timer increments by `delta`. At 3 continuous seconds, a 2-second head-tilt animation fires (increased sway amplitude, fires once per proximity window). At 6 continuous seconds, there is a 1-in-600 frame chance of spawning an ambient emoji (👋 😊 ✨ 🌸) above one of the two pets. Real interactions (interactionOpen is true for that pair) suppress ambient checks. Ghosts are excluded automatically.

---

## Section 5: Feature Inventory

### Interaction system
- **Press E to interact**: proximity detection in RAF loop (within 4 units of a remote player) shows hint; E opens the interaction menu. Interactables (shrines, pond, well, campfires, etc.) take priority over player interaction.
- **Fight (Z key)**: sends `fight` WS message with 20 damage, updates remote HP bar, triggers screen shake and knockback, plays floating damage number. Has 800ms (key handler) and 700ms (HUD button) cooldowns.
- **Befriend (F key)**: two-sided reciprocal flow. Sends `befriend_request`, receiver has 5 seconds to press F. On confirmation, `befriend_confirmed` is sent, friends state updated, midpoint heart animation plays.
- **Emoji picker (X key, then 1-6)**: opens emoji picker HUD, digit key sends emoji via WS, arced emoji animation plays.
- **Fight HP tracking**: `remotePlayerHealth` ref tracks per-player HP (in-memory only, resets on reconnect). In-world CSS2D HP bars shown above remote players. Fight state persists to Redis only when befriend is confirmed (via friends POST).
- **Interaction menu escape**: ESC or physical menu close clears interaction state, re-enables movement, hard-clears velocity and keys.

### Multiplayer
- **PartyKit WebSocket**: client connects to room "world" on mount. Sends `join` with species and position, `move` every 100ms when moving, `befriend/fight/emoji` messages for interactions.
- **Snapshot on connect**: server sends current room state as `snapshot` on connection. Client renders all existing players.
- **pet_update on join/move**: new and moving players broadcast `pet_update` to other clients.
- **pet_left on disconnect**: server detects close and broadcasts `pet_left`; client removes the player from scene and refs.
- **Species syncing**: species is sent in join and move messages, remote clients update the billboard if species changes.
- **Online count**: updated every time a WS message arrives by counting `Object.keys(remotePlayersRef.current).length + 1`.

### Ghost NPCs
- Offline users appear as translucent (opacity 0.4) voxel pets at their last position.
- Slate-gray #64748b CSS2D label, no HP bar.
- Idle sway: `sin(frameCount * 0.04) * 0.06` rotation Y each frame.
- Ghost appears on world load, disappears when the real user connects.
- Position is saved on beforeunload, socket close, and React cleanup.

### Ambient proximity
- 3-second proximity threshold: head-tilt animation (increased sway amplitude for 2 seconds).
- 6-second proximity threshold: 1/600 frame chance of ambient emoji float.
- Suppressed when real interaction is in progress.

### Pet rendering (world)
- 3D voxel pets built from `getSpeciesRects()` rects, each rect becomes a `BoxGeometry` mesh.
- 2D billboard sprites (canvas textures on PlaneGeometry) for local and remote players, updated every frame via `drawPet()`.
- Five species: wolf, sabertooth, capybara, dragon, axolotl. Each has front/side/back views with bob and animation offsets driven by frame count.

### Pet card (shareable)
- `GET /api/card/[username]` returns a PNG image response (edge runtime, Next.js ImageResponse).
- Uses `getSpeciesRects()` to render the sprite as div-based boxes (no canvas, compatible with edge runtime).
- Fetches live GitHub data if `GITHUB_CARD_TOKEN` is set; renders minimal fallback if no species found in Redis.
- Shows: species name, role class (AGGRO/TANK/SUPPORT/LEGEND/REGEN), streak, total commits, health %, activity score.
- Embeddable as `![Pet](https://git-pet-beta.vercel.app/api/card/username)` in GitHub README.

### Dashboard
- Server-side: fetches GitHub data, derives PetState, reads saved species from Redis.
- New users: shows `SpeciesSelect` with auto-suggested species based on top GitHub language.
- Returning users: shows `PetCard` with stats, links to world and settings.

### Landing page
- Large animated pet preview using `PetCanvas` component with `drawPet()`.
- Static marketing content, sign-in CTA.

### Species selection / settings
- First-time: `SpeciesSelect` component (shown from dashboard if no species in Redis).
- Returning: `SpeciesSwitch` at `/settings`.
- Both POST to `/api/species` which writes to Redis.

### World environment
- Hand-built Three.js scene with: ground plane (vertex color terrain), cherry trees, shrine, ponds, torii gates, stone lanterns, campfires, crystal clusters, waterfalls, ancient ruins, stone circles, totem poles, desert zone, forest zone, mountain zone, plains zone.
- Collision system: `Box3` colliders for walls, trees, structures. Sliding collision (X and Z tested independently).
- Day/night cycle: 75-second full cycle, adjusts sun light, ambient light, sky color, fog, lantern glow.
- Fireflies, falling petals, sway animation for reeds, shide, waterfalls, campfire flames.
- Minimap: 120×120 canvas in corner showing player position.

### Hall of Legends (leaderboard)
- Accessible in the landing page world by walking near the leaderboard stone at Z:-24.5 and pressing E.
- `GET /api/leaderboard` discovers all onboarded users from `species:*` Redis keys, fetches live GitHub stats via `GitHubClient.fetchUserStats()` + `derivePetState()` (same pattern as the card route), reads friend counts via `redis.scard()` on `friends:*` keys.
- Returns three ranked lists: `topStreak` (current commit streak, days), `topCommits` (total lifetime commits), `topFriends` (friend count from Redis Set), each descending, top 10 entries.
- Scale cap: if known username count exceeds 50, only the 50 most recently active users (by `last_seen:` timestamp) are processed. A `console.warn` fires so the cap can be revisited.
- Response cached with `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`. No new Redis writes — purely computed on read.
- Client-side in `LandingPage.tsx`: fetched once when the overlay opens (`lbData` state, guarded to prevent re-fetch). Three tabs — 🔥 Streak / ⚡ Commits / ❤️ Friends — switched instantly. Shows loading and empty states. No fake data.

---

## Section 6: Known Bugs Fixed

### Velocity drift on interaction menu open
The `closeInteractionMenu()` function hard-clears `keysRef.current = {}` and sets `vel.x = vel.z = 0`. This was added to fix a bug where the player would lurch or drift after closing the interaction menu, because key-down events during the menu were buffered in `keysRef` and velocity was not zeroed.

### Freeze both RAF branches with movementBlocked
Using a single `movementBlocked.current` ref that gates both the `if (controlEnabled)` and the cinematic `else if` branch prevents the cinematic walk from continuing when the menu is open. Before this pattern, opening the menu during the cinematic intro would freeze movement incorrectly or allow the intro walk to continue.

### Species color mismatch between GitHub-derived color and species appearance
In the dashboard page, `primaryColor` is overridden with `SPECIES_PRIMARY_COLOR[savedSpecies]` after derivation. The GitHub-derived primary color (based on top language) would otherwise produce the wrong palette for the species sprite. The comment in dashboard/page.tsx explains this explicitly.

### Interaction target ref/state desync
The dual ref+state pattern for `interactionTarget` exists because an earlier version used only state, which caused stale closure bugs where the key handler would fire on a target that React had already cleared. The ref is always current and used in event handlers; the state drives rendering only.

---

## Section 7: Current State and Gaps

### Fully working
- GitHub OAuth sign-in
- PetState derivation from GitHub data (commits, streak, language, stars, repos, PRs)
- Species selection and Redis persistence
- Dashboard with pet card
- Shareable PNG pet card (edge API)
- Three.js 3D world with collision, camera, day/night cycle
- Local player movement and control (WASD, cinematic intro)
- Remote player rendering via PartyKit WebSockets (snapshot, join, move, leave)
- Fight system (damage, HP bars, screen shake, knockback, floating numbers)
- Emoji send/receive with arc animation
- Ghost NPC system (offline users, position saved, fetched on load, removed on reconnect)
- Ambient proximity interaction (head-tilt sway at 3s, ambient emoji at 6s)
- Reciprocal befriend client-side flow (request, confirm, expire, animations)
- Real leaderboard (Hall of Legends) — live GitHub stats, tab-based ranking, HTTP-cached

### Partially wired
- **Reciprocal befriend on the server**: the PartyKit server (`web-party/src/server.ts`) does not have handlers for `befriend_request`, `befriend_confirmed`, or `befriend_expired` message types. The server only handles the legacy `befriend` type. The client sends the new types, but the server will not route them to the intended recipient. For the new befriend flow to work in production, the server needs to add routing for these three message types, similar to how it routes `fight` and `emoji`.
- **Friend persistence**: the PartyKit server calls `POST /api/friends` on old-style `befriend` messages to persist to Redis. This path is not called for the new `befriend_confirmed` messages yet. Friends are tracked in-memory per session only unless the server is updated.
- **Fight health persistence**: HP is tracked in-memory per session via `remotePlayerHealth` ref. It resets when either player reconnects. No database persistence exists.

### Missing entirely
- Pet evolution based on commit streaks (roadmap item)
- Sound and ambient audio (audioCtx is initialized but only footstep/interact sounds exist, both minimal)
- Mobile touch controls (no implementation exists)
- AI-driven pet behavior (roadmap item)
- The `OnboardingScreen` component referenced in the prompt does not exist in the codebase
- `apps/web/party/world.ts` is a dead stub; the active server is in `web-party/`

---

## Section 8: Environment Variables

All variables used in `apps/web` unless noted.

| Variable | Where used | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | `lib/auth.ts` | GitHub OAuth App client ID for NextAuth |
| `GITHUB_CLIENT_SECRET` | `lib/auth.ts` | GitHub OAuth App client secret for NextAuth |
| `NEXTAUTH_SECRET` | `lib/auth.ts` | Random secret for NextAuth session encryption |
| `NEXTAUTH_URL` | `lib/auth.ts` | Base URL of the Next.js app (e.g. http://localhost:3000) |
| `GITHUB_CARD_TOKEN` | `app/api/card/[username]/route.tsx` | GitHub PAT for fetching live data in card endpoint (needs read:user). Falls back to `GITHUB_TOKEN` if not set. |
| `GITHUB_TOKEN` | `app/api/card/[username]/route.tsx` | Fallback PAT if GITHUB_CARD_TOKEN is absent |
| `NEXT_PUBLIC_PARTYKIT_HOST` | `WorldClient.tsx` | PartyKit host URL for WebSocket connection (e.g. web-party.username.partykit.dev). Public prefix means it is exposed to the browser. |
| `UPSTASH_REDIS_REST_URL` | `lib/redis.ts` | Upstash Redis REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/redis.ts` | Upstash Redis REST token |
| `INTERNAL_SECRET` | `app/api/friends/route.ts`, `app/api/ghosts/route.ts`, `web-party/src/server.ts` | Shared secret between the PartyKit server and the Next.js API routes. Used by PartyKit to call `/api/friends` for persistence and to authenticate `/api/ghosts` roster requests. Must be the same value in both environments. |
| `NEXT_PUBLIC_APP_URL` | `web-party/src/server.ts` | The Next.js app base URL, used by the PartyKit server to call back to `/api/friends`. Defaults to `http://localhost:3000` if not set. Not defined in `.env.example` — must be added manually for production. |

---

## Section 9: Conventions and Patterns

### API route structure
Every API route in `apps/web/app/api/` follows the same pattern:
1. Import `getServerSession` from `next-auth` and `authOptions` from `@/lib/auth`
2. Authenticate via session (or shared secret for internal calls)
3. Import helper functions from `@/lib/redis`
4. Return `NextResponse.json()`

Avoid putting business logic in routes. Helper functions go in `lib/redis.ts`.

### Redis key naming
All Redis keys use the format `{type}:{username}`:
- `species:{username}` — string
- `friends:{username}` — Redis Set
- `last_seen:{username}` — JSON object

Helper functions `speciesKey()`, `friendKey()`, `lastSeenKey()` in `lib/redis.ts` generate these. Always use these helpers rather than constructing key strings inline.

### WorldClient.tsx is a single large file
Everything in the 3D world lives in one component file (~2700 lines). This is intentional: Three.js scene objects, event handlers, and the RAF loop all need access to the same closure. New world features, interaction types, or visual effects go in this file, not in separate components.

### Adding a new WebSocket message type
1. Add the client message type to the union in `web-party/src/server.ts`
2. Add a handler in `onMessage()` in the server that routes to the target connection
3. Add the server message type to the server's union
4. Handle the incoming message in the `socket.addEventListener("message", ...)` block in WorldClient.tsx

For interaction messages (fight, befriend, emoji), the pattern is: client sends `{ type, fromId, toId, ...payload }` → server looks up `userToConns.get(toId)` and sends to those connections → client receives `{ type: "*_received", fromId, ...payload }`.

### New interaction types
All new interaction logic must be:
- Inlined inside the `onKD` key handler within `init()` (not in outer component scope)
- Guarded by `if (interactionOpen.current)` so they only fire when the menu is open
- Paired with `closeInteractionMenu()` at the end if they should close the menu

### Species and color system
`getSpeciesRects()` accepts a `baseColor` parameter but uses `CANON_COLORS[species]` internally, ignoring `baseColor` for known species. When building voxel pets in WorldClient.tsx, use `SPECIES_PRIMARY` map to look up the canonical color to pass in. The GitHub-derived `primaryColor` from PetState is used only in the 2D renderer (`drawPet`) when the species is not recognized.

### Leaderboard data-fetch pattern (read-heavy, no writes)
The leaderboard route (`app/api/leaderboard/route.ts`) is the canonical example of a read-heavy endpoint that fetches live external data:
1. Discover users from Redis key scan (`redis.keys("species:*")`)
2. Cap the set by recency using `last_seen:` keys if the count exceeds the limit
3. Fan out `Promise.allSettled()` calls to GitHub + Redis per user
4. Sort and slice the results in memory
5. Return with `Cache-Control: public, max-age=3600` to amortize external API cost
6. Never write to Redis

Follow this pattern for any future endpoint that ranks or aggregates across all users.

---

## Section 10: Files to Read First for Future Work

In priority order:

1. `apps/web/components/world/WorldClient.tsx` — the entire 3D world, interaction system, RAF loop, PartyKit client. If you are changing anything about the world experience, this is the file.

2. `apps/web/web-party/src/server.ts` — the active PartyKit WebSocket server. Read this to understand what message types exist, how player presence is tracked, and how to add new message routing.

3. `apps/web/lib/redis.ts` — all Redis key definitions, type definitions, and helper functions. Read before adding any new persistence.

4. `packages/core/src/types.ts` and `packages/core/src/stats.ts` — the PetState data model and the derivation functions. Read before changing how GitHub data maps to pet properties.

5. `packages/renderer/src/speciesRects.ts` — the species sprite rect data. Read before adding new species or changing visual appearance.

6. `apps/web/app/api/leaderboard/route.ts` — canonical example of a read-heavy, cached, multi-user aggregation endpoint that fans out GitHub API calls without writing to Redis.

7. `apps/web/app/api/ghosts/route.ts` — example of a session-authenticated route using the internal PartyKit roster query pattern.

8. `apps/web/app/api/card/[username]/route.tsx` — the OG image generation route. Read before modifying the shareable card.

9. `apps/web/app/LandingPage.tsx` — the landing page world (Three.js scene, overlays, Hall of Legends). Read before changing the landing experience or adding new interactable objects.
