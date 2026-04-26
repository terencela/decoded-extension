# Decoded — Design System

Single source of truth for every visual asset (extension UI, store assets, ads, social cards, landing page).

If a designer or AI tool asks "what should this look like?", the answer is in this file.

---

## Brand position

**One sentence:** Decoded is the receipt printer for LinkedIn and X.

**Tone:** Direct. Slightly hostile. Editorial, not corporate. Closer to a forensic lab tool than a productivity app. The product confirms what users already suspect.

**Personality keywords:** sharp, evidence-based, irreverent, calm-but-cutting, anti-fluff.

**What it is NOT:** friendly, playful, pastel, "fun and easy", consumer-cute, gamified.

---

## Color palette

| Token | Hex | Use |
|---|---|---|
| `bg-primary` | `#0d0d18` | Main dark background everywhere |
| `bg-card` | `#14141f` | Card / surface background |
| `bg-elevated` | `#1e1e28` | Tooltips, popups, raised surfaces |
| `border-subtle` | `#1e1e2e` | Dividers, faint borders |
| `border-default` | `#2a2a35` | Default border color |
| `border-strong` | `#333` | Stronger borders, inputs |
| `text-primary` | `#f0f0f5` | Headlines, primary copy |
| `text-secondary` | `#cfd6e3` | Body |
| `text-muted` | `#888` | Labels, captions |
| `text-dim` | `#555` | Disabled, hint text |
| `accent-blue` | `#4f6ef7` | Brand primary, CTAs, links |
| `accent-blue-light` | `#7b9dff` | Hover, active links |
| `signal-red` | `#ef4444` | Alarming AI scores (>70) |
| `signal-orange` | `#f97316` | Warning scores (35-70) |
| `signal-green` | `#22c55e` | Safe / human scores (<35) |
| `signal-yellow` | `#eab308` | Mixed signals |
| `archetype-failure` | `#ef4444` | Failure Laundering (red) |
| `archetype-engagement` | `#f97316` | Engagement Farming (orange) |
| `archetype-status` | `#a855f7` | Status Packaging (purple) |
| `archetype-ai` | `#3b82f6` | AI Sludge (blue) |
| `archetype-consensus` | `#6b7280` | Consensus Wisdom (gray) |

**Rule:** No gradients except a single soft glow under the brand wordmark (electric blue) and behind the AI score badge (red). Never use multi-stop gradients on backgrounds, buttons, or cards.

---

## Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Wordmark | Sans-serif (system or Inter) | 700 | 48-72pt |
| H1 / Hero headline | Inter, system | 700 | 32-48pt |
| H2 | Inter, system | 700 | 22-28pt |
| Body | Inter, system | 400-500 | 14-16pt |
| Label / caption | Inter, system | 600 | 11-12pt, uppercase, +0.08em tracking |
| Code / mono | ui-monospace, SFMono-Regular, Menlo | 400-600 | 11-12pt |

**Stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif`

**Rule:** No serif fonts anywhere. No script. No display fonts other than the wordmark.

---

## Iconography

- **Brand mark:** magnifying glass `🔍` (and a vector version for production)
- **Archetype emojis:** 🪣 Failure Laundering, 🎣 Engagement Farming, 📦 Status Packaging, 🤖 AI Sludge, 🧘 Consensus Wisdom
- **Source chips:** `regex`, `stats`, `local AI`, `cloud AI` rendered as low-contrast pill chips
- Use Lucide or Phosphor for any other UI icons

---

## Spacing scale

4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32 / 48 / 64 px. Powers of 2 + 6/10/12 for tight UI.

---

## Component standards

**Pill / chip:** `border-radius: 10-12px`, `padding: 2-4px 8-12px`, `font-size: 10-12px`, `font-weight: 600`, often using `${color}18` background + `${color}50` border + `${color}` text triple (18 = ~10% opacity, 50 = ~30%).

**Card:** `bg-card`, `border: 1px solid border-default`, `border-radius: 8px`, `padding: 12-16px`, optional soft shadow `0 8px 24px rgba(0, 0, 0, 0.4)`.

**Button (primary):** `accent-blue` bg, white text, `border-radius: 6px`, `padding: 6-10px 12-16px`, font-weight 600.

**Button (secondary):** transparent bg, `border-strong` border, `text-secondary` text.

**Tooltip:** `bg-elevated`, `border-default` border, `border-radius: 8px`, soft shadow.

---

## Imagery / illustration rules

- **Backgrounds:** dark navy (`bg-primary`) with subtle film grain (~3-5% noise). Never pure black.
- **Mockups:** show real-feeling LinkedIn/X post cards using the card token system, slightly tilted (3-7°) for energy.
- **Photography:** none. This brand uses 0 stock photos, 0 humans, 0 abstract shapes. Only product mockups, type, and signal badges.
- **AI-style imagery:** allowed only for ad creative concept boards, never for product UI. Always real screenshots in the product.
- **Glow:** electric blue glow `0 0 40px ${accent-blue}40` allowed under brand mark. Red glow `0 0 30px ${signal-red}50` allowed behind AI score badge. Nowhere else.

---

## Voice in copy (matches MY-VOICE.md)

- Lead with the point. No throat-clearing.
- Short sentences. Specific nouns and numbers.
- Ban list: leverage, seamless, transformative, robust, game-changer, unlock, dive into, powerful solution, cutting-edge, revolutionize, "in today's world".
- Use hyphens, never em-dashes.
- First person active. European directness. Slight edge.

**Headline patterns that work:**
- "See the AI on LinkedIn." (declarative, plain)
- "Every post gets a score." (descriptive promise)
- "Brad scored 87%. Brad has 14 posts at 78% average." (specific receipts)
- "Stop guessing. Start scoring." (parallel command, the "good kind" of parallel)

**Headline patterns that don't:**
- "Unlock your LinkedIn potential" (banned word)
- "The future of social" (vague)
- "AI-powered productivity" (everything is)

---

## Aspect ratio cheat sheet

| Surface | Size | Notes |
|---|---|---|
| Chrome Web Store icon | 128×128 | Already in repo |
| Chrome Web Store small promo | 440×280 | `store-assets/decoded-promo-tile-440x280.png` |
| Chrome Web Store marquee | 1400×560 | `store-assets/decoded-marquee-1400x560.png` |
| Chrome Web Store screenshot | 1280×800 | Capture from running extension |
| Meta feed (square) | 1080×1080 | Instagram + Facebook feed |
| Meta feed (portrait) | 1080×1350 | Best ROAS on Meta in 2026 |
| Meta link ad | 1200×628 | Auto-cropped, design for safe zone |
| Stories / Reels (vertical) | 1080×1920 | Top + bottom 14% kept clear of UI |
| LinkedIn single image | 1200×627 | Same as Meta link |
| X / Twitter ad | 1200×628 (link) or 1080×1080 (image) | Both work |
| TikTok organic | 1080×1920 | Vertical 9:16 |
| Receipt / share card (in-product) | 1200×630 | Already implemented |

---

## Don't list

- No purple gradients
- No "AI swirl" backgrounds
- No bento grids (too 2024)
- No glass-morphism on the wordmark
- No emoji in headlines (only inside the badge mockup or archetype pills)
- No screenshots faked with AI (use real product captures)
- No people / avatars in marketing imagery (use the abstract avatar circle)

---

## Reference assets in repo

- `store-assets/decoded-marquee-1400x560.png` — canonical brand mark execution
- `store-assets/decoded-promo-tile-440x280.png` — minimal brand mark execution
- `src/content/styles.css` — production component styles
- `src/popup/App.tsx` — production popup styles (search for `styles` const)
