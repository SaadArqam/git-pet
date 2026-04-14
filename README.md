<div align="center">

```
 ██████╗ ██╗████████╗    ██████╗ ███████╗████████╗
██╔════╝ ██║╚══██╔══╝    ██╔══██╗██╔════╝╚══██╔══╝
██║  ███╗██║   ██║       ██████╔╝█████╗     ██║   
██║   ██║██║   ██║       ██╔═══╝ ██╔══╝     ██║   
╚██████╔╝██║   ██║       ██║     ███████╗   ██║   
 ╚═════╝ ╚═╝   ╚═╝       ╚═╝     ╚══════╝   ╚═╝   
```

**Your GitHub activity, alive — inside a multiplayer 3D world.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-049ef4?logo=three.js)](https://threejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Live Demo](https://img.shields.io/badge/demo-live-orange)](https://git-pet-beta.vercel.app/)

[**Live Demo →**](https://git-pet-beta.vercel.app/) · [Report Bug](https://github.com/SaadArqam/git-pet/issues) · [Request Feature](https://github.com/SaadArqam/git-pet/issues)

</div>

---

## What is Git-Pet?

Git-Pet turns your GitHub commit history into a **living pixel creature** inside a shared 3D world. Walk through the world, meet other developers represented as their pets, fight them, befriend them, and send emojis — all in real-time.

> commit → identity → interaction → world

---

## Features

- 🌐 **Real-time multiplayer** — see other developers live via WebSockets
- 🐾 **Pet identity system** — your pet species, name, and stats tied to your GitHub profile
- ⚔️ **Interaction system** — fight, befriend, and send emojis to nearby players
- 🌍 **Zoned world** — forest, desert, mountains, plains with collision and camera system
- 🎮 **No game engine** — custom Three.js RAF loop, lightweight and deterministic
- 🔐 **GitHub OAuth** — sign in with GitHub, your activity feeds your pet

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React, Three.js |
| Realtime | PartyKit (WebSockets) |
| Auth | NextAuth.js (GitHub OAuth) |
| Database | Upstash (Redis) |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub OAuth App ([create one here](https://github.com/settings/developers))
- An Upstash Redis database ([free tier](https://upstash.com/))
- A PartyKit account ([free tier](https://partykit.io/))

### 1. Clone & Install

```bash
git clone https://github.com/SaadArqam/git-pet.git
cd git-pet
npm install
```

### 2. Environment Variables

Create `apps/web/.env.local`:

```env
# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_here

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Upstash
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# PartyKit
NEXT_PUBLIC_PARTYKIT_HOST=your_partykit_host
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
git-pet/
├── apps/
│   └── web/                  # Next.js app
│       ├── app/
│       │   ├── api/          # API routes (card, friends, species)
│       │   ├── world/        # Multiplayer world page
│       │   └── dashboard/    # Pet dashboard
│       └── components/
├── packages/
│   ├── core/                 # Shared types (PetState, etc.)
│   ├── renderer/             # drawPet() canvas renderer
│   └── github/               # GitHub data fetching
```

---

## Roadmap

- [x] Multiplayer 3D world
- [x] Pet identity system
- [x] Interaction system (fight, befriend, emoji)
- [x] Zone-based world with collision
- [x] Shareable pet card (GitHub README embed)
- [ ] Fight animations + health persistence
- [ ] Friend system with DB persistence
- [ ] Pet evolution based on commit streaks
- [ ] Sound + ambient effects
- [ ] Mobile touch controls
- [ ] AI-driven pet behavior

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

**Good first issues:**

- Improve movement feel (acceleration/deceleration tuning)
- Add interaction animations (hearts, hit effects)
- Add new world zones or environment assets
- Improve mobile experience
- Fix open issues tagged [`good first issue`](https://github.com/SaadArqam/git-pet/issues?q=label%3A%22good+first+issue%22)

```bash
# Fork → clone → create branch
git checkout -b feat/your-feature

# Make changes → commit
git commit -m "feat: your feature description"

# Push → open PR
git push origin feat/your-feature
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Author

**Saad Arqam** — [@SaadArqam](https://github.com/SaadArqam) · [LinkedIn](https://www.linkedin.com/in/avgchillguy/)

---

<div align="center">
Built with Three.js, too many late nights, and genuine curiosity about what developer tools could feel like.
</div>