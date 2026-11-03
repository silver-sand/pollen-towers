# Pollen Towers

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

A 3D skyscraper where every floor is a company run by AI agents. Built for Quest #17999.

## Live App
https://pollen-towers.vercel.app

## Repository
https://github.com/silver-sand/pollen-towers

## How It Works

### The Tower
- **12 floors** rendered in Three.js — drag to rotate, click floors to inspect
- Occupied floors glow green with animated window lights
- Empty floors are dark; fill them by renting offices

### Each Floor = A Company
Every company has:
- **Name & brief** describing what it does
- **AI agents** (e.g., `ResearchBot`, `DevAgent`) that run autonomously
- **Pending jobs** that appear over time — you approve or decline them
- **Active/idle status** — agents run when you click "Run today with Pollen"

### Pollinations BYOP (Bring Your Own Pollen) — OAuth PKCE
**Sign in with Pollinations** to use your Pollen for:
- **Generate real agents** via Pollinations API when renting a new office
- **Run your company's daily work** by spending Pollen on AI completions

Without signing in: You can browse the tower and directory, but cannot rent offices or run companies.
With sign-in: Your Pollen (via short-lived tab-scoped token) powers agent generation and daily runs.

The app uses **OAuth Authorization Code flow with PKCE**:
1. Click "Connect Pollen" → redirects to Pollinations with PKCE challenge
2. Sign in on Pollinations → redirects back with authorization code
3. App exchanges code for short-lived access token (stored in sessionStorage)
4. Token used for `gen.pollinations.ai` chat completions

## Features
- **3D tower** with Three.js + OrbitControls
- **Floor navigation** — arrows, dots, click on buildings, keyboard (↑↓)
- **Auto-rotate** mode (R key)
- **Company directory** — search + sort by name/floor/status
- **Office detail modal** — view agents, jobs, approve/decline
- **Rent new offices** — creates company on next empty floor (requires sign-in)
- **Run companies** — "Run today with Pollen" button spends Pollen for AI work
- **Job approval** — approve/decline pending jobs from modal
- **OAuth PKCE sign-in** — secure, no API keys in code, tab-scoped session
- **localStorage persistence** — companies survive refresh
- **Responsive** — works on mobile

## Tech Stack
- Vanilla JS (ES modules)
- Three.js 0.160 (via importmap CDN)
- Pollinations OAuth (enter.pollinations.ai) + Gen API (gen.pollinations.ai)
- GitHub Pages / Vercel deployable (static only)

## Running Locally
```bash
npm install
npm run start
# Open http://localhost:8000
```

## Tests
```bash
npm test
```

## Configuration for Production
1. Create a Pollinations App Key at https://enter.pollinations.ai
2. Set the **callback URL** to your deployment URL (e.g., `https://yourname.github.io/pollen-towers/`)
3. Add the App Key to `public/index.html`:
   ```html
   <meta name="pollinations-client-id" content="pk_your_app_key_here">
   ```
4. Deploy to GitHub Pages / Vercel

## Quest
Built for Pollinations Community Quest #17999: "Build your own tower of AI-run companies"