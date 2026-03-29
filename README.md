<div align="center">

![My Git Pet](https://git-pet-beta.vercel.app/api/card/SaadArqam)

```
 ██████╗ ██╗████████╗    ██████╗ ███████╗████████╗
██╔════╝ ██║╚══██╔══╝    ██╔══██╗██╔════╝╚══██╔══╝
██║  ███╗██║   ██║       ██████╔╝█████╗     ██║   
██║   ██║██║   ██║       ██╔═══╝ ██╔══╝     ██║   
╚██████╔╝██║   ██║       ██║     ███████╗   ██║   
 ╚═════╝ ╚═╝   ╚═╝       ╚═╝     ╚══════╝   ╚═╝   
```

**Your GitHub activity, alive.**

A Tamagotchi-style virtual pet that lives and dies by your commit history.

[![MIT License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3b82f6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-white?style=flat-square&logo=next.js&logoColor=black)](https://nextjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-ef4444?style=flat-square&logo=turborepo&logoColor=white)](https://turbo.build/)

---

### embed your pet in any README

```md
![My Git Pet](https://gitpet.app/api/card/YOUR_USERNAME)
```

![Git Pet Card](https://gitpet.app/api/card/SaadArqam)

</div>

---

## what is this

Git Pet turns your GitHub contribution graph into a living pixel art creature. Commit every day and it thrives — go quiet for a week and it gets sad. Stop coding for a month and it falls into a coma.

The pet's appearance is entirely derived from your real GitHub data:

| data point | affects |
|---|---|
| Days since last commit | Health decay |
| Commits this week | Energy bar |
| Repo count + languages | Intelligence |
| Stars + PR merges + streak | Happiness |
| Total commits + language count | Evolution stage |
| Top language | Pet color |

---

## evolution stages

```
0–9 commits        🥚  EGG        — just hatching
10–99 commits      🐣  HATCHLING  — finding its feet  
100–999 commits    🐱  ADULT      — a proper developer
1000+ commits      👑  LEGEND     — crowned, aura active
```

Each stage has a distinct pixel art sprite. The Legend stage gets a crown and floating aura particles.

---

## moods

```
commit today          → HAPPY    (green particles float upward)
3–6 days idle         → NEUTRAL
7–13 days idle        → TIRED    (zzz floats above head)
14–29 days idle       → SAD      (drooping eyes, frown)
30+ days idle         → COMA     (dark, barely moving)
```

---

## stack

```
git-pet/
├── apps/
│   └── web/              Next.js 15 · App Router · Tailwind
├── packages/
│   ├── core/             Types · stat engine · evolution logic
│   ├── renderer/         Canvas pixel art engine (zero deps)
│   └── github/           GraphQL API client · OAuth
└── tooling/
    └── tsconfig/         Shared TypeScript config
```

- **Monorepo**: Turborepo + npm workspaces
- **Auth**: NextAuth v4 with GitHub OAuth
- **Data**: GitHub GraphQL API (`contributionsCollection`)
- **Renderer**: Pure Canvas API — no framework, runs anywhere
- **Card**: `@vercel/og` edge function → PNG

---

## run locally

### 1. clone and install

```bash
git clone https://github.com/SaadArqam/git-pet.git
cd git-pet
npm install
```

### 2. create a GitHub OAuth app

Go to [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → New OAuth App

```
Homepage URL:     http://localhost:3000
Callback URL:     http://localhost:3000/api/auth/callback/github
```

### 3. create a GitHub Personal Access Token

Go to [github.com/settings/tokens](https://github.com/settings/tokens) → Generate new token (classic)

Scopes needed: `read:user`, `repo`

### 4. set up environment

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
# apps/web/.env.local
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
NEXTAUTH_SECRET=any_random_string
NEXTAUTH_URL=http://localhost:3000
GITHUB_CARD_TOKEN=your_personal_access_token
```

### 5. run

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000), sign in with GitHub, meet your pet.

---

## shareable card

Every pet has a public card endpoint that renders as a PNG:

```
https://gitpet.app/api/card/:username
```

Use it as a GitHub README embed, Twitter card, or anywhere that renders images from URLs.

```markdown
![My Git Pet](https://gitpet.app/api/card/SaadArqam)
```

---

## roadmap

- [x] Pixel art pet with 4 evolution stages
- [x] Real GitHub data via GraphQL API
- [x] OAuth sign-in
- [x] Shareable PNG card
- [ ] Deploy to Vercel
- [ ] Multiplayer world — explore a city of pets
- [ ] VS Code extension — pet lives in your status bar
- [ ] Language-based neighborhoods in the world map
- [ ] Leaderboard

---

## contributing

PRs welcome. The renderer package is intentionally dependency-free — keep it that way.

```bash
# build all packages
npm run build

# type check
npm run type-check
```

---

<div align="center">

built with ☕ and too many commits

**[gitpet.app](https://gitpet.app)** · made by [@SaadArqam](https://github.com/SaadArqam)

</div>
