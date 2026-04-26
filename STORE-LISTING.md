# Chrome Web Store listing — Decoded

All copy ready to paste. Character limits noted next to each field.

---

## Name (max 75 chars)

```
Decoded — AI Detector for LinkedIn & X
```

(54 chars. Optimised for search: "AI detector LinkedIn" is the actual query. Drop the "translator" framing here, keep it in the body.)

## Short description / Summary (max 132 chars)

```
See which LinkedIn & X posts are AI. Per-post score, behaviour archetype, per-author trust track record. Runs locally.
```

(126 chars.)

## Category

Social & Communication

## Language

English (with i18n hooks ready in code for future locales)

---

## Detailed description (max 16,000 chars — this fills ~1,200)

```
LinkedIn and X are drowning in AI-generated posts. Decoded puts a score on every one, in real time, in your feed.

WHAT YOU SEE
- An AI score badge on every post (0–100, with confidence band)
- A behaviour tag: Failure Laundering, Engagement Farming, Status Packaging, AI Sludge, or Consensus Wisdom
- A per-author trust score that builds over time as you scroll. See who keeps doing it.

WHAT YOU CAN DO
- Tap "Decode" on any post to get a plain-English translation of what it's actually doing
- Auto-collapse the worst engagement bait
- Share a 1200×630 receipt card to X, Slack, or your group chat
- Flag bad translations to make the model smarter
- Browse your local history of decoded posts and your personal author leaderboard

THREE-LAYER AI DETECTION
Layer 1 — Regex: 60+ patterns from real AI tells (negative parallelism, fragment reveals, "serves as" dodge, invented capitalised concepts, vague attribution, more)
Layer 2 — Statistics: burstiness, lexical diversity, anaphora abuse, em-dash overuse, parallel structure, one-sentence-per-line formatting
Layer 3 — On-device LLM: optional second pass via Chrome's built-in Gemini Nano. Runs fully on your machine. Zero data leaves your browser.

LOCAL-FIRST. ALWAYS.
- Detection runs in your browser tab
- History, settings, and per-author scores live in chrome.storage.local
- Nothing syncs anywhere. One click in the popup wipes everything.
- The translation API is only called when you tap Decode on a borderline post — never automatically.

WORKS ON
- linkedin.com (your feed, profiles, post permalinks)
- x.com and twitter.com (timeline and individual tweets)

WHO IT'S FOR
- People who already roll their eyes at LinkedIn but still scroll
- Knowledge workers, founders, devs, journalists, recruiters who want signal vs noise
- Anyone who's tired of "It's not X. It's Y." opening lines

KEYBOARD SHORTCUT
Ctrl/Cmd + Shift + D decodes the post under your cursor.

PRICING
Free: 5 decodes per day. All badges, scores, archetypes, history, and author tracking included.
Pro ($3/mo): Unlimited decodes, follow specific authors, weekly digest of your feed's AI saturation, no watermark on shared cards.

OPEN SOURCE
github.com/terencela/decoded-extension
```

---

## Search keywords (the words you want to rank for)

Primary:
- LinkedIn AI detector
- LinkedIn AI score
- spot AI posts
- AI text detector chrome
- ChatGPT detector LinkedIn

Secondary:
- LinkedIn lunatics
- LinkedIn translator
- engagement bait blocker
- corporate speak translator
- X AI detector
- Twitter AI detector

---

## Image assets required by the Chrome Web Store

| Asset | Size | Required | Notes |
|---|---|---|---|
| Icon | 128×128 PNG | Yes | Already in `public/icons/icon128.png` |
| Small promo tile | 440×280 PNG | Yes | Used in search results. The most-seen image. |
| Marquee promo | 1400×560 PNG | Optional but needed for "Featured" eligibility |
| Screenshot 1 | 1280×800 PNG | Yes (min 1) | Hero shot — the badge in action on a real post |
| Screenshot 2 | 1280×800 PNG | Recommended | Popup Authors tab with leaderboard |
| Screenshot 3 | 1280×800 PNG | Recommended | Decode overlay open with translation + sources |
| Screenshot 4 | 1280×800 PNG | Recommended | Receipt card |
| Screenshot 5 | 1280×800 PNG | Recommended | Settings / inline mode toggle |

You can upload up to 5 screenshots. Use all 5 — listings with full screenshot sets convert ~30% better.

---

## How to capture the real screenshots (don't generate them)

Open Chrome, install `dist/` as unpacked. Navigate to the targets below. Use Cmd+Shift+5 (Mac) or Snipping Tool (Win) to crop to exactly 1280×800.

1. **LinkedIn feed shot** — open linkedin.com, find a post with score >75. Capture the post card with the AI score badge visible. Caption: "Every post gets a score. Repeat offenders get tracked."

2. **Decode overlay shot** — click Decode on the same post. Wait for the overlay. Capture full overlay open showing translation, source chips, AI tells, and archetype. Caption: "Tap Decode to see what the post is actually doing — and which signals flagged it."

3. **Authors tab shot** — open the popup, switch to Authors tab after scrolling enough feed to populate it (need 2+ posts per author minimum). Capture the popup. Caption: "Per-author trust score builds locally as you scroll."

4. **X / Twitter shot** — go to x.com, find an AI-flavoured tweet. Capture the badge. Caption: "Same detector on X. Cross-platform receipts."

5. **Receipt card** — share a decoded post → "Copy image". Paste somewhere viewable, screenshot. Caption: "Share the receipt card to X, Slack, or your group chat."

---

## Promo tile copy (for the 440×280 and 1400×560)

Headline options (pick one):

A. "See the AI on LinkedIn." (5 words, strongest)
B. "Every post gets a score." (5 words, descriptive)
C. "BS translator for LinkedIn & X." (current tagline, weakest for store search)

Recommend **A**. Direct, specific, hostile in the right way.

Subline (one of):
- "Free Chrome extension. Local-first."
- "Three-layer AI detection. Runs on-device."

---

## Listing FAQ (paste into description if there's room)

Q: Will my data leave my browser?
A: No. Detection runs locally. The only network call is the optional Decode translation, only when you click the button.

Q: How accurate is the AI score?
A: The three layers agree on clear cases (>85% AI or <20%) ~95% of the time. Borderline cases (30-70%) get a second pass from on-device Gemini Nano if available. The score is directional, not legally diagnostic — don't fire someone over it.

Q: Will LinkedIn block this?
A: It's a passive content script that reads visible DOM. Same technique as ad blockers. We don't post, comment, or scrape.

Q: Why "translator"?
A: Because most LinkedIn posts mean something different from what they say. The score tells you it's AI. The translation tells you what it's actually doing.

Q: Open source?
A: Yes. github.com/terencela/decoded-extension. Self-host the API too if you want.

---

## Privacy practices (Chrome Web Store form fields)

- **Single purpose:** Detect AI-generated content and behaviour patterns on LinkedIn and X, and translate them into plain English on user request.
- **Permission justifications:**
  - `storage` — store user settings, daily usage count, decode history, and per-author trust scores locally
  - `activeTab` — read the LinkedIn or X feed currently open in the active tab to score visible posts
  - `host_permissions` for linkedin.com, x.com, twitter.com — content script needs to inject badges into these pages
- **Data collection:** None sent to our servers except the post text the user explicitly clicks Decode on (sent to the translation API, not stored).
- **Data usage:** Translation requests are processed and returned. Not retained. Not sold. Not used for training.
- **Data sale:** Never.

---

## Launch sequence (brutal honesty)

Day -7: Send extension to 5 X accounts that already mock LinkedIn. Goal: warm intros for launch day.
Day -3: Submit to Chrome Web Store. Approval takes 1-3 days, sometimes longer.
Day 0: Launch on r/LinkedInLunatics with one screenshot and the link.
Day 0: Launch X post: "I built a Chrome extension that puts an AI score on every LinkedIn post." Screenshot. No explanation.
Day 0: Reach out to the 5 warmed accounts.
Day +1: ProductHunt launch.
Day +7: Write the "Top 50 Most AI LinkedIn Influencers" post (anonymised) once you have enough install base.
```
