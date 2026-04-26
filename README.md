# Decoded — LinkedIn & X Translator

Chrome Extension (Manifest V3) that translates corporate-speak and AI-generated content on LinkedIn and X (Twitter) in real time.

Pangram tells you *if* text is AI. Decoded tells you *what a post is actually doing*, *who keeps doing it*, and *which patterns repeat.* Different jobs.

## What it does

- **Works on LinkedIn AND X (Twitter)** — same detector, same UI, both feeds
- **5 behavior archetypes** — Failure Laundering, Engagement Farming, Status Packaging, AI Sludge, Consensus Wisdom
- **Three-layer AI detection** — score 0-100 with confidence band (Almost certainly AI / Likely AI / Mixed signals / Probably human)
  - **Layer 1 (regex):** 60+ patterns covering vocabulary, structural tells, and tropes.fyi formulas (negative parallelism, triple negation, fragment reveals, invented concept labels, "serves as" dodge, vague attribution, etc.)
  - **Layer 2 (statistics):** burstiness, lexical diversity, anaphora abuse, proper-noun density, em-dash overuse, parallel structure, one-sentence-per-line formatting
  - **Layer 3 (on-device LLM):** opt-in second pass via Chrome built-in Gemini Nano. Runs fully on-device — no data leaves your machine. Auto-detected, gracefully off if unavailable.
- **Per-author trust score** — local rolling average AI score per author across both feeds. Repeat-offender badge appears once we've seen 3+ posts from the same person.
- **Decode history** — last 50 decoded posts in the popup, with archetype, score, source platform, and the translation. All local.
- **Plain-English translation** — one tap, get the post's real meaning with highlighted phrases
- **Auto-collapse engagement bait** — hide hard farming posts behind a banner
- **AI comment detection** — flag AI-generated comments inline
- **Shareable 1200×630 receipt cards** — ready for X, Stories, Slack
- **Always-on inline mode** — show badges and decode button without hover
- **Keyboard shortcut** — `Ctrl/⌘ + Shift + D` decodes the post under the cursor
- **Local-first storage** — flagged translations, decode history, and author trust scores live in `chrome.storage.local`. Nothing syncs anywhere.

## Pricing

Free: 5 decodes/day · Pro: $3/mo · Power: $5/mo

## Decoded vs Pangram

| Capability | Decoded | Pangram |
|---|---|---|
| Lives in your feed | Yes (LinkedIn + X) | No (paste into textbox) |
| Behavior archetypes (5 types) | Yes | No (only human/AI) |
| Plain-English translation | Yes | No (just a score) |
| Per-author trust score (local) | Yes | No |
| Decode history (local) | Yes | No |
| Auto-collapses engagement bait | Yes | No |
| Shareable receipt cards | Yes | No |
| AI detection layers | regex + statistics + on-device LLM | proprietary ML |
| AI detection runs locally | Yes (regex/stats always; Gemini Nano in Chrome 138+) | No (server) |
| Detection sources shown to user | Yes (per-tag attribution) | No |
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
- Three-layer detector: regex → statistics → on-device Gemini Nano (Chrome 138+ Prompt API)
- 24h LRU cache of decoded translations to keep API calls cheap
- Optional Supabase backend spine for anonymous install/decode/author/follow/email opt-in events. See `BACKEND.md`.

## Privacy

- Layers 1 (regex) and 2 (statistics) run entirely in your browser tab — no network calls.
- Layer 3 (on-device LLM) uses Chrome's built-in Gemini Nano. The model lives on your device. Nothing leaves your machine.
- The remote translation API is only called when you click **Decode** on a borderline post.
- Settings, usage counters, decode history, and per-author trust scores are stored locally in `chrome.storage.local`. They never sync, never leave your browser, and you can wipe them from the popup with one click.
- Anonymous backend sync is opt-in from Advanced settings. When enabled, it sends aggregate events to your configured Supabase project for follows, weekly digests, and future leaderboard data.

## Enable on-device AI (optional)

The local LLM layer activates automatically in Chrome 138+ once the user has downloaded Gemini Nano. To force-enable:

1. `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
2. `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
3. Relaunch Chrome and wait for the model download (~22 GB free space, 4 GB+ VRAM recommended)
4. Visit `chrome://on-device-internals` to confirm

If unavailable, Decoded silently falls back to the regex + statistics layers (still ~85% of detection signal).
