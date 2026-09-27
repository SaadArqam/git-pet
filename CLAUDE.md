# CLAUDE.md — git-pet Project Context

This file is the primary context source for AI sessions on this project. It is written from the actual source code (last synced 2026-09-27). Do not guess from it; if something changed, re-read the code.

---

## Section 1: Project Overview

git-pet is a multiplayer 3D world where your GitHub activity drives the appearance and stats of a pixel creature (your "pet"). It is not a dashboard or a stats viewer. The core loop is: sign in with GitHub → GitHub data is fetched via GraphQL → PetState is derived → your pet appears in a shared Three.js world alongside other developers' pets → you walk around and interact with them in real time.

Live URL: https://git-pet-beta.vercel.app
GitHub: https://github.com/SaadArqam/git-pet
Author: Saad Arqam (@SaadArqam)

The world is the product, not the dashboard. The dashboard, pet card and public pet page are secondary surfaces.

---

## Section 2: Tech Stack

Exact versions as found in package.json files:

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.1 |
| UI library | React | 19.2.4 |
| 3D rendering | Three.js | r128 (loaded from CDN at runtime, not npm) |
| Three.js types | @types/three | 0.128.x (types only, devDependency) |
| CSS2D labels | CSS2DRenderer | r128 (loaded from jsDelivr CDN) |
| Realtime | PartyKit (partysocket client) | 1.1.16 |
| PartyKit server SDK | partykit | 0.0.115 (devDependency) |
| Auth | next-auth | 4.24.13 |
| Database | @upstash/redis | 1.37.0 |
| OG image generation | @vercel/og (ImageResponse) | 0.11.1 |
| Tests | vitest | 4.x (in `packages/core`) |
| Monorepo tool | Turborepo | latest (in root devDependencies) |
| TypeScript | typescript | 5.4.x (root), 5.x (web), 5.5.x (web-party) |
| React Compiler | babel-plugin-react-compiler | 1.0.0 (devDependency, enabled via next.config.ts) |
| Deployment | Vercel Hobby (Next.js app) + PartyKit cloud (WebSocket server) |
| Node requirement | 18+ |
| Package manager | npm 10.8.2 (enforced via packageManager field) |

Root scripts: `npm run dev`, `build`, `lint`, `type-check`, `test` (all via Turborepo).

Three.js is NOT installed as an npm runtime package. It is loaded at runtime via CDN, then accessed through `getThree()` from `apps/web/lib/three-global.ts`, which returns `window.THREE` typed as `ThreeGlobal` (the `@types/three` namespace plus `CSS2DObject`/`CSS2DRenderer`). `@types/three` is types-only — `import type` is erased, nothing is bundled. Do not npm-install `three` itself.

`apps/web/AGENTS.md` warns that this Next.js version has breaking changes vs. training data — read `node_modules/next/dist/docs/` before writing Next.js-specific code.

---

## Section 3: Monorepo Structure

```
git-pet/
├── package.json                   Root workspace config, Turborepo scripts (dev/build/lint/type-check/test)
├── turbo.json                     Turborepo pipeline config
├── .env.example                   Template for required environment variables
├── ISSUES.md                      QA/optimisation audit (24 items, all fixed; notes on #13 and #20)
├── README.md / CONTRIBUTING.md
├── CLAUDE.md                      This file — AI context
├── apps/
│   └── web/                       Next.js 16 app (App Router)
│       ├── app/
│       │   ├── page.tsx           Root route — renders LandingPage
│       │   ├── LandingPage.tsx    Landing page with its own Three.js scene + Hall of Legends overlay
│       │   ├── layout.tsx / providers.tsx   Root layout, client SessionProvider
│       │   ├── dashboard/page.tsx New users → SpeciesSelect; returning → PetCard; error state on Redis failure
│       │   ├── world/page.tsx     Fetches GitHub data server-side, renders WorldClient
│       │   ├── pet/[username]/page.tsx  Public pet lookup page (no auth) — PetCard in "public" mode + fight wins
│       │   ├── settings/          Species switching (SpeciesSwitch)
│       │   ├── about/             About page
│       │   ├── signin/            Empty directory (no route file)
│       │   └── api/
│       │       ├── auth/[...nextauth]/  NextAuth GitHub OAuth handler
│       │       ├── card/[username]/route.tsx  OG image PNG, edge runtime
│       │       ├── species/route.ts     GET ?username= (public) or own species (session); POST own species
│       │       ├── friends/route.ts     GET ?userId= (public) or own (session); POST internal-secret only
│       │       ├── fights/route.ts      GET ?userId= wins; POST increments wins (session-as-winner or secret)
│       │       ├── ghosts/route.ts      GET offline ghosts (session); POST own last position (session)
│       │       ├── leaderboard/route.ts GET top streak/commits/friends, HTTP-cached 1h
│       │       └── pet/[username]/route.ts  Public PetState JSON, HTTP-cached 1h
│       ├── components/
│       │   ├── world/WorldClient.tsx  The entire 3D world (~2800 lines, single file, fully typed)
│       │   ├── PetCanvas.tsx      Canvas pet renderer (dashboard/card)
│       │   ├── PetCard.tsx        Pet card; `mode` = "owner" | "public", optional `wins`
│       │   ├── SpeciesSelect.tsx / SpeciesSwitch.tsx / StatBar.tsx
│       ├── lib/
│       │   ├── redis.ts           Upstash client, key helpers, species/friends/wins helpers
│       │   ├── auth.ts            NextAuth config + getSessionUsername() + isAuthorizedAs()
│       │   ├── three-global.ts    ThreeGlobal type + getThree()
│       │   └── types.ts           NextAuth Session augmentation (accessToken, login)
│       ├── party/world.ts         DEAD old stub — not deployed; the real server is web-party/
│       ├── web-party/             Active standalone PartyKit server (deployed separately)
│       │   ├── partykit.json      name: "web-party", main: src/server.ts
│       │   └── src/server.ts      The real WebSocket server (~260 lines)
│       └── next.config.ts         Enables React Compiler
├── packages/
│   ├── core/                      PetState types + derivation (deriveStats/Mood/Stage/PrimaryColor/PetState)
│   │   └── src/stats.test.ts      Vitest suite (10 tests) — `npm test`
│   ├── renderer/                  2D canvas renderer: drawPet(), getSpeciesRects(), CANON_COLORS, sprites
│   └── github/                    GitHubClient.fetchUserStats() via GraphQL → transformToGitData()
└── tooling/                       Shared ESLint + tsconfig bases
```

---

## Section 4: Critical Architecture Facts

These are load-bearing patterns. Changing them carelessly will break the project.

### 4.1 Three.js loaded from CDN, typed via getThree()

`init()` in WorldClient.tsx (and the equivalent in LandingPage.tsx) calls `loadScript()` for Three.js r128 (cdnjs) and CSS2DRenderer (jsDelivr), then does `const loadedThree = getThree()` and re-binds it as a local `const THREE = loadedThree` after a null check (hoisted inner functions lose TypeScript narrowing otherwise). SSR would fail on a module-level import because Three.js needs `window`.

New Three.js code goes inside `init()` and uses the local `THREE`. Use `ThreeNS.*` types (from `@/lib/three-global`) for annotations — do not reintroduce `any`.

### 4.2 The RAF loop structure and movement block pattern

The main render loop (`tick()`) runs via `requestAnimationFrame`:

```
if (p.controlEnabled && !movementBlocked.current) {
  // normal WASD movement
} else if (!movementBlocked.current) {
  // cinematic walk-in (player auto-moves forward until control is enabled)
}
```

The `else if` branch is the cinematic intro walk — do not touch it. `movementBlocked.current = true` (set when the interaction menu opens) freezes both branches. `closeInteractionMenu()` clears it and hard-clears keys and velocity; if movement is re-enabled without clearing velocity, the player lurches. A `cinematicSignaled` flag makes `setCinematicDone(true)` fire once, not every frame.

### 4.3 interactionTargetRef and interactionTarget state sync

- `interactionTargetRef` — `useRef`, read inside the RAF loop and key handlers (always current)
- `interactionTarget` — `useState`, drives HUD rendering

Both must be set together when opening the menu and cleared together in `closeInteractionMenu()`.

### 4.4 All interaction logic inlined inside onKD

`onKD` is defined inside `init()` and closes over `THREE`, `scene`, `remotePlayersRef`, etc. Interaction logic (fight Z, befriend F, emoji X then 1–6) must stay inside it. Things that don't need the closure and must be stable for the effect deps (e.g. `persistFightWin`) are `useCallback`s in component scope and listed in the main effect's dependency array.

### 4.5 Effect lifecycle and cleanup

- Each run of the main effect captures `const cleanups = cleanupFns.current`, `init()` pushes into it, and the effect cleanup runs and empties exactly that array. Do not push cleanups from outside a run.
- Three.js objects removed from the scene must go through `disposeGroup()` (geometries, materials, textures) — use `removeRemotePlayer(uid)` / `removeGhost(username)` rather than bare `scene.remove`.
- On `snapshot`, remote players not present in the snapshot are removed (stale-player diff).
- Pending befriend timers are cleared on unmount.
- `selectedPet` is derived once from the server-fetched `initialSpecies` prop and never re-read from localStorage (that re-read used to cause a double init for returning users).

### 4.6 Multiplayer player tracking: two separate collections

- `remotePlayersRef.current` — `Record<string, RemotePlayer>` (`{ bb: Billboard, targetPos, targetRot, species }`), live players only.
- `ghostsRef.current` — `Map<string, { group }>`, offline ghosts.

The RAF proximity check only iterates `remotePlayersRef.current`, so ghosts are never interaction targets. Anything that iterates players for interaction, animation or proximity must use `remotePlayersRef.current`.

### 4.7 Two pet rendering paths

- **Live players (local and remote)** are 2D billboards: a canvas redrawn with `drawPet()` (renderer package) as a texture on a camera-facing `PlaneGeometry`. `drawPet()` applies `STAGE_SCALE` (egg smallest → legend 1.15×) and a glow for legends, so stage is visible here.
- **Ghosts** are 3D voxel pets from `buildVoxelPet()`, which turns each `getSpeciesRects()` rect into a `BoxGeometry` mesh. Voxel pets currently ignore stage.

Remote billboards are redrawn every `BILLBOARD_REDRAW_INTERVAL` (3) frames, staggered by each billboard's random `redrawOffset` so they don't all redraw on the same frame.

`drawPet()` itself has two codepaths: known species → `getSpeciesRects()` rects; unknown species → `getSpriteView()` pixel sprites.

### 4.8 Billboard camera-facing behavior

```js
plane.onBeforeRender = (renderer, scene, camera) => {
  plane.quaternion.copy(camera.quaternion);
};
```

This is the r128-compatible approach. Do not replace it with `THREE.Sprite` or later-version APIs.

### 4.9 PartyKit server (web-party/src/server.ts)

`apps/web/party/world.ts` is a dead stub. The active server is `apps/web/web-party/src/server.ts`, deployed with `cd apps/web/web-party && npx partykit deploy` — **it is not deployed by Vercel; every server change needs a manual PartyKit deploy.** The client connects to room `"world"` on `NEXT_PUBLIC_PARTYKIT_HOST`.

Server behavior:
- **Identity is server-side.** `join` binds `connection.id → username` (`connToUser`, `userToConns`). All interaction messages use that `senderUsername` as `fromId` and ignore any client-supplied `fromId`; messages from a connection that hasn't joined are dropped.
- **Hardening:** `onMessage` is wrapped in try/catch, bad JSON is dropped, per-connection rate limit of 20 messages/second, `move` x/y/rot and `fight` damage must be finite numbers.
- **Messages handled:** `join`, `move`, `befriend_request`, `befriend_confirmed`, `befriend_expired`, `fight`, `emoji`. Legacy `befriend`/`presence_update`/`interaction` handlers were removed.
- **Sent:** `snapshot` (on connect), `pet_update`, `pet_left`, `befriend_request`, `befriend_confirmed`, `befriend_expired`, `fight_received`, `emoji_received`.
- `onClose` and `onError` both run the same cleanup (remove connection; drop the pet only when the user has no connections left; broadcast `pet_left`).
- `onRequest` `GET /parties/web-party/world` with header `x-internal: INTERNAL_SECRET` returns `{ online: string[] }` — used by the ghosts API.
- On `befriend_confirmed`, `persistFriendship()` POSTs to `${NEXT_PUBLIC_APP_URL}/api/friends` with the shared secret, 5s timeout, one retry after 500ms, then logs on failure. The client is not told if both attempts fail (ISSUES.md #13, partial).

WorldClient still has a harmless client-side `befriend_received` branch from the legacy flow; the server never sends it.

### 4.10 Species stored in Redis, not derived from GitHub data

`species:{username}` holds the chosen species. `autoAssignSpecies()` only produces the suggestion on the first-time selection screen. The dashboard uses `getUserSpeciesOrThrow()` for its new-user check so a Redis outage shows an error state instead of bouncing an existing user back to onboarding; everywhere else uses best-effort `getUserSpecies()`.

Redis keys (always build them with the helpers in `lib/redis.ts`):
- `species:{username}` — string (`speciesKey`)
- `friends:{username}` — Set, bi-directional (`friendKey`)
- `last_seen:{username}` — JSON `{ timestamp, x, z, mood? }` (`lastSeenKey`)
- `wins:{username}` — integer fight-win counter (`winsKey`, `incrementWins`, `getWins`)

### 4.11 Ghost system: offline user persistence

Position is POSTed to `/api/ghosts` on beforeunload, socket close and React cleanup. `GET /api/ghosts` scans `species:*`, excludes the caller and anyone currently online (PartyKit roster), and fetches each candidate's `last_seen` + species concurrently (`Promise.all`), keeping entries younger than 7 days. Ghosts are translucent (opacity 0.4) voxel pets with a slate-gray (#64748b) CSS2D label, sway with `sin(frame * 0.04) * 0.06`, and are removed when the real user shows up in a snapshot or move.

### 4.12 Reciprocal befriend flow (two-sided, 5-second window)

Pressing F sends `befriend_request`. The receiver gets a toast and has 5 seconds (`pendingBefriendRef`) to press F on that sender while they are the interaction target → `befriend_confirmed` is sent, both clients update `friendsRef` and play the midpoint heart animation, and the server persists the friendship. If the window expires, `befriend_expired` is sent and both sides see the fizzle animation. Friend state is only updated on confirmation.

### 4.13 Fights

- Damage comes from `computeFightDamage(attackerStats, defenderStats)`: attack scales with the attacker's (health + energy), defense with the defender's health, clamped to 5–35 on a 100-HP scale. So a healthy commit streak hits harder and takes less.
- HP is per-session, in `remotePlayerHealth` (resets on reconnect). Knocking a target to 0 shows "You won! 🏆", calls `persistFightWin()` (`POST /api/fights`, session-authenticated as the winner), and resets the target's HP after 3s.
- Wins are shown on the public pet page via `PetCard`'s `wins` prop.
- Cooldowns: 700ms on the Z key path.

### 4.14 Ambient proximity interaction

- `proximityTimers` (Map<string, number>) — seconds each remote player has been within 4 units.
- `ambientTiltActive` (Set<string>) — players with an active head-tilt.

At 3 continuous seconds a 2-second head-tilt fires (once per proximity window). At 6 seconds there's a 1-in-600-frame chance of an ambient emoji (👋 😊 ✨ 🌸). Suppressed while a real interaction is open. Ghosts are excluded automatically.

### 4.15 Auth

`lib/auth.ts`:
- GitHub provider with scope `read:user repo` and **`issuer: "https://github.com/login/oauth"`** — required. GitHub sends `iss` on the OAuth callback and openid-client rejects it if the provider has no matching issuer; without this line every sign-in fails with `error=OAuthCallback`.
- The `jwt` callback fetches `https://api.github.com/user` once at sign-in to store the real `login`; `session.login` is the username used everywhere.
- `getSessionUsername()` — the one way routes read the current user.
- `isAuthorizedAs(username, secret)` — true if `INTERNAL_SECRET` is set **and** matches, or the session user equals `username`. An unset secret never matches.

---

## Section 5: Feature Inventory

### Interaction system (world)
- **E to interact**: proximity (within 4 units) shows a prompt; interactables (shrines, pond, well, campfires, etc.) take priority over players and show narrative text overlays.
- **Fight (Z)**: stat-driven damage, HP bars, screen shake, knockback, floating damage numbers, persisted wins.
- **Befriend (F)**: reciprocal 5-second flow, persisted to Redis by the PartyKit server.
- **Emoji (X then 1–6)**: arced emoji animation on both clients.
- **ESC** closes the menu, re-enables movement, clears velocity and keys.

### Multiplayer
- `join` on connect, `move` every 100ms while moving, `snapshot` on connect, `pet_update` / `pet_left` broadcasts.
- Species changes arrive on `move` (`petType`) and update the remote billboard.
- Online count = remote players + 1.

### Ghost NPCs, ambient proximity — see 4.11 and 4.14.

### Pet rendering
- Five species: wolf, sabertooth, capybara, dragon, axolotl. Front/side/back views with bob and animation offsets driven by frame count.
- Stages (from `deriveStage`): egg (<10 commits), hatchling (≥10), adult (≥100 commits and ≥2 languages), legend (≥1000 commits and ≥4 languages). 2D renderer scales by stage and glows for legends; the voxel renderer does not yet.

### Pet card (shareable PNG)
- `GET /api/card/[username]`, edge runtime, div-based sprite from `getSpeciesRects()`.
- Level is derived from stage; footer shows the current year; colors from renderer's `CANON_COLORS`.
- Embeddable as `![Pet](https://git-pet-beta.vercel.app/api/card/username)`.

### Public pet page and API
- `/pet/[username]` — anyone can look up any GitHub user's pet (PetCard in public mode, with fight wins).
- `GET /api/pet/[username]` — public PetState JSON + species, cached 1h (shares the card/leaderboard GitHub token quota).

### Dashboard
- Server-side GitHub fetch + PetState; species color overrides the language-derived `primaryColor`.
- New users → `SpeciesSelect`; returning → `PetCard`; Redis failure → explicit error state.

### Landing page
- Its own Three.js scene (typed via `getThree()`), marketing content, sign-in CTA.
- **Hall of Legends**: walk to the leaderboard stone at Z:-24.5 and press E. Fetches `/api/leaderboard` once per open; tabs 🔥 Streak / ⚡ Commits / ❤️ Friends.

### World environment
- Hand-built scene: terrain, cherry trees, shrine, ponds, torii gates, lanterns, campfires, crystals, waterfalls, ruins, stone circles, totems, desert/forest/mountain/plains zones.
- `Box3` sliding collision; 75-second day/night cycle; fireflies, petals, swaying reeds/shide, flames; 120×120 minimap.

---

## Section 6: Known Bugs Fixed (don't reintroduce)

- **Velocity drift on menu close** — `closeInteractionMenu()` clears `keysRef` and velocity.
- **Cinematic walk continuing under the menu** — single `movementBlocked` gate on both RAF branches.
- **Species color mismatch** — dashboard overrides `primaryColor` with the species canon color.
- **Stale interaction target** — ref + state pair (4.3).
- **Spoofed identities over WebSocket** — server now uses `connToUser`, never client `fromId`.
- **One-sided friendships via direct API calls** — `POST /api/friends` accepts only the internal secret.
- **Unset secret matching unset secret** — `isAuthorizedAs()` requires `INTERNAL_SECRET` to be set.
- **One bad message crashing a connection** and leaking its pet into room state — try/catch + `onError` cleanup.
- **Three.js memory leaks** on player leave / ghost removal — `disposeGroup()`.
- **Double world init for returning users** — no localStorage re-read of the selected pet.
- **Cleanups accumulating across effect runs** — per-run captured cleanup array.
- **`/api/species?username=` returning the caller's species** — public lookup branch fixed.
- **Every card showing level 1** — level derived from stage.
- **Emoji animation crash when the player is null** — guarded.
- **Sign-in failing with `error=OAuthCallback`** — GitHub provider `issuer` (4.15).

---

## Section 7: Current State and Gaps

### Fully working
GitHub sign-in, PetState derivation, species selection, dashboard, public pet page and API, shareable PNG card, 3D world (collision, camera, day/night), multiplayer presence, fights with persisted wins, emoji, reciprocal befriend with server routing and Redis persistence, ghosts, ambient proximity, Hall of Legends leaderboard.

### Quality baseline
- `tsc` clean across the web app; ESLint down to 4 deferred warnings in LandingPage.tsx (left by the owner's choice, documented in ISSUES.md #20).
- `npm test` runs 10 Vitest tests for `packages/core`.
- Scale target is tens of concurrent users in one room.

### Partially wired
- **Friend-save failure feedback** (ISSUES.md #13): the server retries once and logs, but clients are not told if the save ultimately fails.
- **Fight HP** is session-only by design; only wins persist.
- **Stage in the 3D voxel pets**: ghosts don't reflect stage.
- `/world` has not been exercised by automated tests (needs a real login); verify multiplayer manually with two accounts.

### Missing entirely
- Visible pet evolution moments (stage-up celebration, voxel scaling) — roadmap
- Sound beyond minimal footstep/interact effects
- Mobile touch controls
- AI-driven pet behavior
- `apps/web/party/world.ts` is a dead stub; `app/signin/` is an empty directory

---

## Section 8: Environment Variables

All in `apps/web` unless noted. Vercel needs the app vars; PartyKit needs its own (`npx partykit env add <NAME>` from `apps/web/web-party`).

| Variable | Where used | Purpose |
|---|---|---|
| `GITHUB_CLIENT_ID` | `lib/auth.ts` | GitHub OAuth App client ID (production and local use different OAuth apps) |
| `GITHUB_CLIENT_SECRET` | `lib/auth.ts` | GitHub OAuth App client secret |
| `NEXTAUTH_SECRET` | NextAuth | Session encryption secret |
| `NEXTAUTH_URL` | NextAuth | App base URL (e.g. http://localhost:3000) |
| `GITHUB_CARD_TOKEN` | card, pet, leaderboard routes | Server-side GitHub PAT (read:user). Falls back to `GITHUB_TOKEN` |
| `GITHUB_TOKEN` | same | Fallback PAT |
| `NEXT_PUBLIC_PARTYKIT_HOST` | `WorldClient.tsx`, `api/ghosts` | PartyKit host (web-party deployment). Exposed to the browser |
| `UPSTASH_REDIS_REST_URL` | `lib/redis.ts` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/redis.ts` | Upstash REST token |
| `INTERNAL_SECRET` | `lib/auth.ts`, `api/friends`, `api/ghosts`, **and PartyKit** | Shared secret between PartyKit and the Next.js API. Must be identical in Vercel and PartyKit, or friendships silently won't save and ghosts can't see who's online |
| `NEXT_PUBLIC_APP_URL` | **PartyKit** (`server.ts`) | App base URL the PartyKit server calls back to. Defaults to http://localhost:3000 |

---

## Section 9: Conventions and Patterns

### API route structure
1. Read the user with `getSessionUsername()` (or `isAuthorizedAs()` for routes the PartyKit server also calls). Don't call `getServerSession` directly in routes.
2. Use helpers from `@/lib/redis` — no inline key strings, no business logic in routes.
3. Return `NextResponse.json()`.
4. Public read-only data (species, friends, wins, pet) may be looked up by `?username=`/`?userId=` without auth; writes are always session- or secret-authenticated.
5. Endpoints that hit the GitHub API with the shared PAT must send `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`.

### Redis
Best-effort reads go through `safeRedis()` (log + fallback). Use a throwing variant only where "missing" and "unavailable" must be distinguished (see `getUserSpeciesOrThrow`).

### Colors
`CANON_COLORS` is exported from the renderer package — import it; don't redefine species color maps.

### WorldClient.tsx is a single large file
Three.js scene objects, event handlers and the RAF loop share one closure, so new world features go in this file. Keep it typed (interfaces at the top: `Billboard`, `RemotePlayer`, `InteractionTarget`, `AnimationStep`, `RemotePresence`).

### Adding a new WebSocket message type
1. Add it to `ClientMessage` (and the outgoing shape to `ServerMessage`) in `web-party/src/server.ts`.
2. Handle it in `handleMessage()`: require `senderUsername`, validate every field (use `isFiniteNumber` for numbers), route via `userToConns.get(toId)`, and send `fromId: senderUsername`.
3. Handle the incoming message in the `socket.addEventListener("message", ...)` block in WorldClient.tsx.
4. Redeploy PartyKit.

### New interaction types
- Inline inside `onKD` within `init()`.
- Guard with `if (interactionOpen.current)`.
- Call `closeInteractionMenu()` at the end if the menu should close.

### Leaderboard data-fetch pattern (read-heavy, no writes)
1. Discover users via `redis.keys("species:*")`.
2. Cap by recency (`last_seen:`) above 50 users.
3. Fan out GitHub + Redis calls in batches of 8 with `Promise.allSettled()`, logging failures.
4. Sort and slice in memory; return with the 1h cache header; never write to Redis.

### Tests
Pure logic in `packages/*` gets Vitest tests next to the source (`*.test.ts`, excluded from `tsconfig` builds). Run `npm test` from the root.

### Commits and deploys
The repo-local git email must be `179401569+SaadArqam@users.noreply.github.com`, or Vercel Hobby blocks the deploy.

---

## Section 10: Files to Read First for Future Work

1. `apps/web/components/world/WorldClient.tsx` — the world, interactions, RAF loop, PartyKit client.
2. `apps/web/web-party/src/server.ts` — message types, identity, rate limiting, friend persistence.
3. `apps/web/lib/redis.ts` and `apps/web/lib/auth.ts` — persistence and auth helpers.
4. `packages/core/src/types.ts` and `stats.ts` (+ `stats.test.ts`) — PetState model and derivation.
5. `packages/renderer/src/draw.ts` and `speciesRects.ts` — 2D rendering, stage scaling, sprite rects.
6. `apps/web/app/api/leaderboard/route.ts` — canonical cached multi-user aggregation.
7. `apps/web/app/api/ghosts/route.ts` — session auth + internal PartyKit roster query.
8. `apps/web/app/api/card/[username]/route.tsx` — OG card.
9. `apps/web/app/LandingPage.tsx` — landing scene and Hall of Legends.
10. `ISSUES.md` — what was audited and fixed, and the two items with caveats.
