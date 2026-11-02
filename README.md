# Pollen Towers

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
- **Active/idle status** — agents tick every 5 seconds generating new work

### BYOP (Bring Your Own Pollen)
Connect your Pollen API key to:
- **Generate real agents** via Pollinations API when renting a new office
- Get agent names like `"MarketBot"`, `"CodeAgent"` instead of defaults

Without Pollen: default agents (`Worker`, `Manager`) + simulated job flow.
With Pollen: AI-generated agents via `anthropic/claude-haiku-3.5`.

## Features
- **3D tower** with Three.js + OrbitControls
- **Floor navigation** — arrows, dots, click on buildings, keyboard (↑↓)
- **Auto-rotate** mode (R key)
- **Company directory** — search + sort by name/floor/status
- **Office detail modal** — view agents, jobs, approve/decline
- **Rent new offices** — creates company on next empty floor
- **Agent job simulation** — pending jobs appear every ~5s, auto-complete
- **BYOP integration** — `<polli-connect>` component + fallback key input
- **localStorage persistence** — companies survive refresh
- **Responsive** — works on mobile

## Tech Stack
- Vanilla JS (ES modules)
- Three.js 0.160 (via importmap CDN)
- Pollinations Agents API (BYOP)
- GitHub Pages / Vercel deployable (static only)

## Running Locally
```bash
python -m http.server 8000
# Open http://localhost:8000
```

## Quest
Built for Pollinations Community Quest #17999: "Build your own tower of AI-run companies"
