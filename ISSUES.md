# git-pet — QA & Optimization Audit

**Scope:** full read-through of the app for bugs, performance/memory issues (target: tens of
concurrent users staying online without lag), and code quality, per request.

**Status:** items are being fixed in order and checked off as they land (each is its own commit,
type-checked and smoke-tested before being marked done). **✅ FIXED** means it's done, verified,
committed, and pushed. Unmarked items are still open.

**How to read this:** each item has what's actually wrong, what a real user would notice, where
it lives (`file:line`), and a plain-English fix. Ordered by severity. A "confidence" note is added
where something needs a quick live check before fixing, rather than being 100% certain from
reading the code alone.

---

## 🔴 Critical — security holes (small, safe fixes, no user-facing behavior change)

### 1. ✅ FIXED — The "internal secret" check on `/api/friends` and `/api/fights` fails *open* when the secret isn't set
- **Where:** `apps/web/app/api/friends/route.ts:29`, `apps/web/app/api/fights/route.ts:20`
- **What's wrong:** Both routes do `if (secret !== process.env.INTERNAL_SECRET) { ...require login... }`. If `INTERNAL_SECRET` is ever unset (a staging env missing the var, a misconfigured deploy), `process.env.INTERNAL_SECRET` is `undefined`. Anyone who calls the API with **no** `secret` field at all gets `undefined !== undefined` → `false` → the entire login check is skipped.
- **What a user notices:** Nothing, until someone finds it. A stranger with zero login could call `POST /api/friends` with `{"fromId":"anyone","toId":"anyone"}` and force a friendship, or `POST /api/fights` with `{"winnerId":"anyone"}` and inflate that person's win count / leaderboard rank, with no account at all.
- **Fix:** Only accept the "internal caller" path when `INTERNAL_SECRET` is actually set *and* non-empty *and* matches — never treat "both sides are blank" as a match.

### 2. ✅ FIXED — `/api/species`'s "internal" check is a hardcoded word, not a secret
- **Where:** `apps/web/app/api/species/route.ts:10` — `const isInternal = req.headers.get("x-internal") === "card";`
- **What's wrong:** The "secret" is the literal string `"card"`, sitting in this public source file. Anyone can send that header and read any user's chosen species with zero login.
- **What a user notices:** Low real-world harm (species isn't sensitive), but it's a real access-control hole and inconsistent with how every other internal route does this correctly.
- **Fix:** Use the same `INTERNAL_SECRET` env-var pattern as friends/fights/ghosts instead of a hardcoded header value.
- **What actually shipped:** on closer look, the browser itself needed to look up *other* players' species (`fetchSpeciesForUser` in `WorldClient.tsx`) and can never safely hold a server secret — so the real fix made `?username=` lookups public (no auth needed), same treatment `/api/friends`' `?userId=` already gets, since species isn't sensitive data. This also fixed a bug the hardcoded check was hiding: the old fallback path was silently returning the *caller's own* species instead of the one actually requested.

### 3. ✅ FIXED — The multiplayer server trusts whatever username a client claims to be — identity spoofing
- **Where:** `apps/web/web-party/src/server.ts:89-175` (fight, emoji, and all befriend handlers use `data.fromId`/`data.toId` straight from the message body)
- **What's wrong:** The server never checks that `fromId` actually matches the username the sender joined as (`connToUser.get(sender.id)`). Any connected client can send `{"type":"fight","fromId":"someoneElse","toId":"victim","damage":999999}` and attack (or send a friend request, or an emoji) as if they were a completely different player.
- **What a user notices:** A player could be "attacked by" or "friended by" someone who isn't actually there / isn't who the game says they are.
- **Fix:** Server should derive `fromId` itself from the sender's own connection record, never trust the client's claim.

### 4. ✅ FIXED — Friending someone doesn't require their consent, and can't be undone by them
- **Where:** `apps/web/app/api/friends/route.ts:24-37`, `apps/web/lib/redis.ts` (`addFriend`)
- **What's wrong:** Any logged-in user can `POST /api/friends` with `toId` set to any stranger's username with no validation, and it's always written both ways. So you can force yourself onto someone else's friends list — which also inflates *their* public "friend count" on the leaderboard without them knowing.
- **Fix:** Require the target to actually accept (the reciprocal-befriend flow you already built for the live game does this correctly — this HTTP route just isn't held to the same rule).

---

## 🟠 High — the actual "many users online, no lag" problems

### 5. ✅ FIXED — Every player's pet is fully redrawn and re-uploaded to the GPU, every single frame
- **Where:** `apps/web/components/world/WorldClient.tsx` — `updateBillboard()` (~625-642), called once for you and once **per other player in the room**, every frame (60×/second)
- **What's wrong:** Each call clears a canvas, redraws the pixel art, and pushes a fresh texture to the GPU — even when nothing about that pet (mood, animation frame) actually changed since last frame.
- **What a user notices:** This is the one that scales directly with player count — frame rate drops and the game feels laggy specifically *because* more people are online, which is exactly the problem you asked about.
- **Fix:** Only redraw a billboard when its mood/animation actually changed, or redraw remote players less often (e.g. every 3-6 frames instead of every frame).

### 6. ✅ FIXED — Nothing is ever cleaned up when a player leaves, changes species, or a ghost despawns — memory grows all session
- **Where:** every place a pet is removed from the 3D scene: `pet_left` handler (~2579-2585), species-change in "snapshot"/"move" handlers (~2454-2481), `removeGhost()` (~676-681)
- **What's wrong:** The 3D shapes/materials/images backing each pet (`.geometry`, `.material`, `.map`) are removed from view but never `.dispose()`d — the memory they used is never given back.
- **What a user notices:** Nothing at first. Over a long session with people joining/leaving, changing species, or ghosts respawning, the browser tab's memory use climbs and never comes back down — eventually a slow-down or crash on a long play session.
- **Fix:** Before removing any pet from the scene, call `.dispose()` on its geometry/material/texture.

### 7. ✅ FIXED — Health-bar and battle-HP tracking never gets cleaned up when a player leaves
- **Where:** `pet_left` handler, `apps/web/components/world/WorldClient.tsx` ~2579-2585 — only removes the pet's 3D model, never touches `healthBarsRef`, `remotePlayerHealth`
- **What a user notices:** Same slow memory creep as #6, specifically from leftover DOM elements (HP bar divs) and numbers that pile up as different people cycle through the room over a session.
- **Fix:** When a player leaves, also delete their entry from these two trackers.

### 8. ✅ FIXED — If your connection briefly drops and reconnects, other players can get stuck in the world forever as "phantoms"
- **Where:** the "snapshot" handler (received on reconnect), `apps/web/components/world/WorldClient.tsx` ~2444-2465
- **What's wrong:** On reconnect the server sends you the current true room state, but the client only ever *adds/updates* players from it — it never removes a player who's in your local view but is missing from the fresh snapshot (meaning they actually left while you were reconnecting).
- **What a user notices:** A player who left is still visible, standing still, forever — a permanent "ghost" of someone no longer in the game.
- **Fix:** When a snapshot arrives, remove any locally-tracked player who isn't present in it.

### 9. ✅ FIXED — CONFIRMED — The world was silently rebuilding itself right after every returning user entered it
- **Where:** `apps/web/components/world/WorldClient.tsx` — two near-duplicate "read my saved pet from localStorage" effects (~143-167 and ~476-488), both feeding into the giant Three.js setup effect's dependency list (~2612)
- **What's wrong:** Reading from localStorage always produces a brand-new object, which can make the giant "build the whole world" effect think its inputs changed and re-run itself moments after you arrive — rebuilding the entire world, reopening your connection to other players (sending a second "I've joined" message), and doubling up keyboard listeners and the render loop.
- **Confirmed on investigation:** this wasn't an edge case — `selectedPet` is only ever written to localStorage once, at species-selection time, so it's present for essentially every returning user. Worse, `world/page.tsx` already does a fresh Redis lookup for the correct species on every server render and passes it in as `initialSpecies` — so the localStorage re-read wasn't just redundant, it was reintroducing a value the server had already fetched more recently, from two separate effects, every single time.
- **Fix:** removed the localStorage re-read entirely (not just deduplicated) — `selectedPet` is now derived once from the already-authoritative `initialSpecies` prop and never reassigned, so it can no longer force the world-build effect to tear down and restart after mount.

### 10. ✅ FIXED — A single bad or malformed multiplayer message can silently and permanently disconnect a player, with no cleanup
- **Where:** `apps/web/web-party/src/server.ts` — the entire `onMessage` function (63-192) has no error handling and no validation of message contents before using them
- **What's wrong:** If any message is malformed (corrupt JSON, a missing field), the server crashes while handling *that one message*. The player who sent it gets disconnected with zero explanation, and — because the crash happens before the server's own cleanup code runs — their name and pet stay stuck in the shared room state forever, visible to everyone else, using up a slot with no way to clear it except restarting the server.
- **Fix:** Wrap message handling in error handling so a bad message just gets ignored (logged, not crashed), and validate fields before trusting them.

### 11. ✅ FIXED — There's no limit on how fast one player can spam actions — one bad client can lag the whole shared room
- **Where:** `apps/web/web-party/src/server.ts` (whole file — no rate limiting exists); the only "cooldowns" that exist today are in the browser code (`WorldClient.tsx`), which a misbehaving client can simply ignore by talking to the server directly
- **What a user notices:** One buggy or bad-actor client spamming fight/move/emoji messages can make the game feel laggy for *everyone* in the room, not just themselves, since the server broadcasts every message to every connected player.
- **Fix:** Add a basic per-player rate limit on the server side (e.g., "no more than N messages per second"), independent of whatever the browser client does.

### 12. ✅ FIXED — Loading the world page runs 100-200 database calls in a row, one at a time, and it gets slower as more people sign up
- **Where:** `apps/web/app/api/ghosts/route.ts:43-63` — loops through every onboarded user with `await` inside a plain loop instead of doing them all at once
- **What a user notices:** Every time anyone opens the World page, this endpoint runs — and with even 50-100 onboarded users, that's 100-200 sequential round-trips to the database before the page can finish loading, adding real, avoidable wait time that gets worse the more people join the project.
- **Fix:** Run these database calls in parallel instead of one-by-one (the leaderboard route already does this correctly elsewhere — same fix, applied here).

---

## 🟡 Medium — reliability bugs (things quietly go wrong, no crash)

### 13. ✅ FIXED (partially) — Friend/fight results can silently fail to save — the game says "you're friends" but a refresh undoes it
- **Where:** `apps/web/web-party/src/server.ts:100-108, 133-141` — the save-to-database call is "fire and forget" with no timeout and no retry
- **What's wrong:** The game tells both players "you're now friends!" immediately, before actually confirming the save worked. If the save fails or times out (server hiccup, database blip), nobody is told — the two players believe it happened, but a page refresh reverts it because it was never actually saved.
- **Fix:** Add a timeout to the save call, and if it fails, either retry or tell the client so the UI can reflect what's actually true.
- **What actually shipped:** a 5-second timeout plus one retry (500ms backoff) on the friend-persistence call, covering the common case (a transient blip). Still not fixed: if both attempts fail, neither client is told — they'll still see "you're friends!" in the moment and find out on a later refresh that it didn't save. Telling the client requires a new WS message round-trip and isn't done yet.

### 14. ✅ FIXED — A temporary database outage looks exactly like "you're a new user" or "you have no friends" — not like an error
- **Where:** `apps/web/lib/redis.ts` (`safeRedis` helper) — used by species/friends/wins lookups
- **What's wrong:** Any database error is caught and silently replaced with the same "empty" answer used for a genuinely new/empty user. A brief database hiccup while an existing user opens their dashboard can bounce them back into the "pick your species" onboarding screen, because "database is down" and "you haven't picked a species yet" look identical to the app.
- **Fix:** Have these lookups distinguish "confirmed nothing there" from "the call actually failed," at least for the dashboard's new-user check.
- **What actually shipped:** added `getUserSpeciesOrThrow()`, which lets a real failure propagate instead of swallowing it; the dashboard now catches it specifically and shows a "couldn't reach the database, try again" screen instead of silently treating an existing user as brand new. `getUserSpecies()` (the swallow-and-default-to-null version) is left as-is for every other caller that just wants a best-effort value — this was scoped to the one place the ambiguity actually causes a bad outcome, per the issue's own fix note.

### 15. ✅ FIXED — The leaderboard can fire up to 50 simultaneous requests to GitHub at once, and silently shows wrong numbers if any fail
- **Where:** `apps/web/app/api/leaderboard/route.ts:80-112`
- **What's wrong:** All 50 users' GitHub data is fetched at the exact same time, which risks GitHub's own anti-abuse throttling for bursts of requests. If any of those fail, the code has no logging at all — it just quietly shows `0 commits` / `0 day streak` for that person, which looks like a real (and unflattering) stat rather than a failed request.
- **Fix:** Fetch in smaller batches instead of all 50 at once, and log failures so a rate-limit issue is visible instead of masquerading as real user data.

### 16. ✅ FIXED — `/api/pet/[username]` has no caching, unlike every similar endpoint, and shares a token with the card image + leaderboard
- **Where:** `apps/web/app/api/pet/[username]/route.ts`
- **What's wrong:** This is a public endpoint meant for outside tools (bots, badges, extensions) to poll, but unlike `/api/card` and `/api/leaderboard` it sets no cache headers, and it uses the same shared GitHub token as those two. If anything polls it more than a couple times a minute across a modest number of users, it can burn through that token's hourly GitHub quota — which would then start breaking the shareable card images and the leaderboard too, not just itself.
- **Fix:** Add the same hour-long cache header the other two routes already use.

### 17. ✅ FIXED — A pending friend-request timer can fire after you've already left the world page
- **Where:** `apps/web/components/world/WorldClient.tsx` — timers created around line 2504, never explicitly cancelled on unmount
- **What's wrong:** If you leave the world page while someone's 5-second friend-request window is still open, the timer still fires afterward and tries to animate/send a message using parts of the page that no longer exist.
- **Fix:** Cancel any pending friend-request timers when leaving the page, same as other cleanup already does for event listeners.

---

## 🟢 Code quality — duplication, dead code, and general cleanup

### 18. ✅ FIXED — There are two entire copies of the fight/befriend/emoji logic in the same file — one of them is 100% dead and already broken
- **Where:** `apps/web/components/world/WorldClient.tsx` — `fightPlayer()`, `befriendPlayer()`, `sendEmoji()` and their wrapper functions (~115-140, ~314, ~392-441) are a full second implementation, completely separate from the one actually wired to your keyboard (inside `onKD`, ~2181+)
- **What's wrong:** The dead copy is unreachable — nothing calls it (verified: no button in the UI is wired to it). It has also quietly drifted from the real logic: its cooldown check would make it silently do nothing if it were ever turned on, and its screen-shake/knockback numbers don't match the real version either.
- **Why this matters for you specifically:** the fight-damage-scaling work from earlier this session was applied to *both* copies to keep them consistent — meaning some of that effort went into code that can never actually run. Worth deleting the dead copy so there's only one implementation to maintain going forward.
- **Fix:** Delete the dead functions, or if they're meant to back a future clickable HUD, wire them up and remove the duplicate logic in `onKD` instead.

### 19. ✅ FIXED — The 5-species → color map is hand-copied in at least 11 different files
- **Where:** `apps/web/app/dashboard/page.tsx`, `apps/web/app/about/page.tsx`, `apps/web/app/pet/[username]/page.tsx`, `apps/web/app/api/card/[username]/route.tsx`, `apps/web/components/StatBar.tsx`, `apps/web/components/SpeciesSwitch.tsx`, `apps/web/components/PetCanvas.tsx`, `apps/web/components/SpeciesSelect.tsx`, `apps/web/components/PetCard.tsx`, `apps/web/components/world/WorldClient.tsx`, `packages/renderer/src/speciesRects.ts`
- **What's wrong:** The exact same five hex colors are typed out independently in all of these. A future palette tweak has to be made correctly in 11 places by hand, or the card image, the dashboard, and the in-world pet will all show different colors for the same species.
- **Fix:** Export the map once from `packages/renderer` (it already has this exact data internally) and import it everywhere else instead of retyping it.
- **Correction found while fixing:** `StatBar.tsx` and `PetCard.tsx` were false positives — their `#94a3b8` is an unrelated generic gray/mood color, not the species map, so they were left alone. The other 8 (plus `packages/renderer` itself, the new source of truth) now import the same `CANON_COLORS` export instead of retyping it — 2 were exact duplicate map objects, 3 (`about/page.tsx`'s inline pet array, `SpeciesSelect.tsx`/`SpeciesSwitch.tsx`'s per-species metadata) had the same 5 values spelled out as individual literals and now reference `CANON_COLORS.<species>` instead.

### 20. ✅ FIXED — ~142 ESLint problems across the app — mostly `any` types hiding real bugs, plus genuinely dead code
- **Where:** whole `apps/web/app` + `components` + `lib` tree (run `npx eslint` to see the live list)
- **Breakdown:** the large majority are `@typescript-eslint/no-explicit-any` (a type that turns off TypeScript's safety net) and `no-unused-vars` (variables computed and then never used — often a sign a piece of logic was half-finished, e.g. an unused `pBox` collision box computed every single frame for nothing, or two unused world-decoration functions).
- **Fix:** Not urgent individually, but worth cleaning up in the same pass as everything else — each `any` is a place a real bug could be hiding undetected.
- **What actually shipped:** 142 → 85. Every file except the two Three.js files (`WorldClient.tsx`, `LandingPage.tsx`) is now lint-clean. The "half-finished logic" hunch was right — cleaning this up surfaced four real bugs:
  - **World interactables were silently broken.** ~27 interactables (shrine, well, campfires, chests, totems) set narrative text that was never rendered, and the "[ E ] Pray at Shrine"-style proximity prompt was never set. Both had been removed in earlier commits (the prompt probably because it called `setState` 60×/sec). Restored, with the prompt only updating React state when the nearest interactable changes.
  - **Every pet card showed level 1.** The card read `petState.level` through an `any`; `PetState` has no `level`. Level is now derived from life stage (egg 1 → legend 4). The card ID's hardcoded "2025" now uses the current year.
  - **`setCinematicDone(true)` fired every frame** for the last stretch of the intro walk (stale closure value). Now fires once.
  - **Effect cleanups accumulated.** Both Three.js effects pushed cleanup functions into a ref that was never emptied, so a re-run would fire old cleanups again. Now emptied after running.
  - Also: removed per-frame dead allocations in the render loop (`moveX`/`moveZ`/`pBox` `Vector3`/`Box3` created every frame and never used), three never-called world builders, three never-used `useState`s, and replaced every `session as any` cast with a proper `login` field on the NextAuth `Session` type.
- **Three.js typing (second pass):** the remaining 81 `any`s came from Three.js being loaded from a CDN with no types. Added `@types/three@0.128.x` as a dev-only dependency (an exact match for the r128 build the CDN serves; types only, erased at compile time, so CDN loading is unchanged) plus a small `lib/three-global.ts` for the `window.THREE` global, then typed both scenes properly. The existing code matched r128's real API with no changes needed, and the typing surfaced one more crash path: an incoming emoji's animation read the local player's position every frame without checking it existed. It's guarded now. Verified in headless Chrome: the landing page's 3D scene loads and renders fully (Three.js r128, intro, quest UI) with zero console errors. `/world` needs a real GitHub login so it couldn't be loaded headlessly, but it type-checks against r128 and compiles cleanly.
- **Result:** 142 → 4. The only remaining lint findings are deliberately deferred (below).
- **Deliberately deferred:** 3 `react-hooks/set-state-in-effect` warnings and 1 `no-page-custom-font` warning in `LandingPage.tsx`. They're advisory rules on code that works correctly. Fixing them means moving that logic into `openOverlay`, which the landing page's whole 3D scene re-initializes on, or changing how fonts load site-wide. Too much risk of breaking the landing page for a mostly stylistic gain.

### 21. ✅ FIXED — There are zero working automated tests in the entire project
- **Where:** `packages/core/src/stats.test.ts` exists, but there's no test runner (no Jest/Vitest) installed or configured anywhere, and no `"test"` script in any `package.json` — this file cannot currently be run by anything.
- **Why this matters given the "don't break anything" goal:** right now, the only way to verify a change didn't break something is manual testing and type-checking. A handful of fast tests around the core pet-stat math (`packages/core/src/stats.ts`) would catch a real class of regressions automatically.
- **Fix:** Add a minimal test runner (Vitest is lightweight and fast) and wire up the existing test file for real, as a foundation — doesn't need to be comprehensive on day one.
- **What actually shipped:** Vitest added to `@git-pet/core`, `npm test` at the repo root now runs it through Turborepo. The old `console.assert` file is now 10 real tests covering every threshold branch of `deriveStats`/`deriveMood`/`deriveStage`/`derivePrimaryColor`/`derivePetState`. Checked that they actually catch regressions: temporarily changing the health formula made 3 tests fail. Test files are now excluded from the `tsc` build so they no longer ship in `dist/`.

### 22. ✅ FIXED — A few leftover debug logs are running on real user actions
- **Where:** `WorldClient.tsx` line ~411 (re-serializes a whole list of health bars on every single fight hit — in the dead code path from #18, so currently harmless but would run for real if that path is ever revived), `WorldClient.tsx` line ~2450 (prints every remote player's name + species to the console on every reconnect), `apps/web/app/api/card/[username]/route.tsx:122` (logs debug info as `console.error` — meaning it looks like a real error in any monitoring tool that watches error logs, on literally every single card image request, e.g. every GitHub README view)
- **Fix:** Remove these, or gate them behind a debug flag that's off in production.

### 23. ✅ FIXED — Dead multiplayer message types are still sitting in the server
- **Where:** `apps/web/web-party/src/server.ts` — the old `befriend` handler (89-109), `presence_update` (177-187), and `interaction` (189-191) are never sent by the actual client anymore (verified against what `WorldClient.tsx` really sends)
- **Fix:** Remove them, or confirm nothing else still needs them first — keeping dead handlers around risks someone "fixing" the wrong copy later.
- **What actually shipped:** re-verified directly (not just trusting the earlier audit) with a grep for each message type's literal string in `WorldClient.tsx` — confirmed zero matches for any of the three. Removed all three handlers, their type-union entries, and the now-unused `friendCount`/`buffs`/`lastInteraction` fields on `PetPresence` that only existed to serve `presence_update`.

### 24. ✅ FIXED — Small repeated boilerplate across API routes
- **Where:** the "get the logged-in username from the session, or return 401" 3-line pattern is copy-pasted in at least 5-6 route files; the internal-secret check from issue #1 is copy-pasted in two files instead of one
- **Fix:** Pull both into one small shared helper function so a future fix (like #1) only needs to happen in one place.
- **What actually shipped:** the internal-secret duplication was already fixed as part of #1 (`isAuthorizedAs()`). Added `getSessionUsername()` alongside it in `lib/auth.ts` and used it in `ghosts/route.ts` (GET+POST), `species/route.ts` (GET+POST), and `friends/route.ts` (GET) — `isAuthorizedAs()` itself was also updated to call it instead of duplicating the same 2 lines a second time. Left the page-level (not API-route) session checks in `dashboard/page.tsx`/`world/page.tsx` alone — they redirect rather than return a JSON 401, a genuinely different pattern, not just a copy of this one.

---

## If you want a suggested order to tackle these

Given the goal ("tens of concurrent users, no lag, don't break anything"), roughly in order of
impact-for-effort:

1. **The four security items (#1-4)** — small, isolated, low-risk changes that close real holes.
2. **The memory-leak items (#6, #7)** — compounds over every session; fixing it is mechanical (add missing cleanup calls) and low-risk.
3. **Billboard redraw throttling (#5)** — the single biggest lever for "the game feels slow with more people online," which is the exact problem you described.
4. **Delete the dead fight/befriend code (#18)** — removes a whole class of future confusion (and explains a doubled-up part of last session's work), very low risk since it's provably unreachable.
5. **The `/api/ghosts` sequential-loop fix (#12)** and **leaderboard batching (#15)** — straightforward, bounded changes.
6. Everything else is safe, incremental cleanup that can be folded in alongside whichever of the above you pick first.

Nothing above has been changed yet — this is the full list for you to review and tell me what to
tackle first.
