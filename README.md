# Decoded — LinkedIn Translator

Chrome Extension (Manifest V3) that translates corporate-speak and AI-generated content on LinkedIn in real time.

Pangram tells you *if* text is AI. Decoded tells you *what a LinkedIn post is actually doing.* Different jobs.

## What it does

- **5 behavior archetypes** — Failure Laundering, Engagement Farming, Status Packaging, AI Sludge, Consensus Wisdom
- **AI saturation score (0-100)** — heuristic detector of AI-generated posts
- **Plain-English translation** — one tap, get the post's real meaning with highlighted phrases
- **Auto-collapse engagement bait** — hide hard farming posts behind a banner
- **AI comment detection** — flag AI-generated comments inline
- **Shareable 1200×630 receipt cards** — ready for X, Stories, Slack
- **Always-on inline mode** — show badges and decode button without hover
- **Keyboard shortcut** — `Ctrl/⌘ + Shift + D` decodes the post under the cursor
- **Local-first storage** — flagged translations and decode history live in `chrome.storage.local`

## Pricing

Free: 5 decodes/day · Pro: $3/mo · Power: $5/mo

## Decoded vs Pangram

| Capability | Decoded | Pangram |
|---|---|---|
| Lives in your LinkedIn feed | Yes | No (paste into textbox) |
| Behavior archetypes (5 types) | Yes | No (only human/AI) |
| Plain-English translation | Yes | No (just a score) |
| Auto-collapses engagement bait | Yes | No |
| Shareable receipt cards | Yes | No |
| AI text detection accuracy | Heuristic | 99.98% ML-trained |
| Pricing | Free · $3/mo Pro | Subscription / enterprise |

## Develop

```bash
corepack enable pnpm
pnpm install
pnpm build       # production build → dist/
pnpm dev         # watch mode
```

Load `dist/` as an unpacked extension at `chrome://extensions`.

## Tech

- Manifest V3 · TypeScript strict · React 18 popup · Vite + `vite-plugin-web-extension`
- Regex-based classifier with optional API confirmation for borderline AI scores
- 24h LRU cache of decoded translations to keep API calls cheap

## Privacy

Post text is only sent to the API when the user clicks **Decode**. Settings, usage counters, and flagged translations are stored locally in `chrome.storage.local`.
