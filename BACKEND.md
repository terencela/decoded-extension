# Decoded Backend

This is the smallest useful backend spine for Decoded.

It does **not** replace the local-first extension. The extension still works with no account, no backend, and no sync. Backend sync is opt-in from the popup.

## What It Stores

- `extension_installs` — anonymous install IDs, version, referrer, user agent
- `extension_events` — append-only install/decode/author/follow/email opt-in events
- `author_scores` — latest aggregate AI score per author and platform
- `followed_authors` — per-install follow list for future notifications and digests
- `email_opt_ins` — weekly digest email opt-ins

## Security Shape

The extension does **not** write tables directly.

Anonymous clients can only call:

```sql
public.ingest_extension_event(p_install_id uuid, p_event_type text, p_payload jsonb)
```

Every table has RLS enabled and direct table grants revoked from `anon` and `authenticated`.

Why this matters: a browser extension must assume the anon key is public. The RPC validates event type, payload shape, payload size, source, score bounds, email shape, and author fields before writing.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run:

```sql
-- paste the contents of:
-- supabase/migrations/20260426023000_backend_spine.sql
```

4. Copy:
   - Project URL: `https://YOUR_PROJECT.supabase.co`
   - Project API anon key
5. Reload the extension.
6. Open popup → Advanced settings:
   - Enable **Anonymous backend sync**
   - Paste Project URL
   - Paste anon key
   - Save

After saving, the extension sends an `install` event. From then on it sends:

- `author_score` when posts are scored
- `decode` when a user clicks Decode
- `follow_author` when a user follows an author
- `email_opt_in` when the user enters a digest email

## Quick Verification Queries

Run these in Supabase SQL Editor after using the extension for a few minutes:

```sql
select count(*) from public.extension_installs;
select event_type, count(*) from public.extension_events group by event_type order by count(*) desc;
select source, author_name, post_count, total_ai_score
from public.author_scores
order by post_count desc, updated_at desc
limit 20;
```

## Useful Views To Add Next

These are intentionally not in the first migration because we need real data first.

```sql
create or replace view public.author_ai_leaderboard as
select
  source,
  author_key,
  author_name,
  author_handle,
  post_count,
  round(total_ai_score::numeric / greatest(post_count, 1), 1) as avg_ai_score,
  dominant_archetype,
  last_seen_at
from public.author_scores
where post_count >= 5
order by avg_ai_score desc, post_count desc;
```

Do not expose this publicly until there is moderation, minimum sample-size gating, and an appeal/removal story. Naming real people as "AI" is press-worthy, but also legally sensitive.

## Backend Roadmap

Build in this order:

1. **Landing page + install tracking** — already supported by `install` events.
2. **Follow authors** — local follow list exists now and syncs when backend sync is enabled.
3. **Weekly digest** — use `email_opt_ins`, `followed_authors`, and `author_scores`.
4. **Public leaderboard** — only after minimum sample size and abuse controls.
5. **Public author profile pages** — use leaderboard data, add disclaimers, do not show low-N claims.

## Privacy Copy

Use this in the landing page and store listing:

> Decoded is local-first. Scores, history, and author trust data stay on your device by default. Anonymous sync is optional and only sends aggregate events needed for follows, digests, and future leaderboards. You can turn it off any time.

## Abuse Notes

This spine is intentionally conservative:

- no public select policies
- no direct browser writes to tables
- payload max size is 12 KB
- only whitelisted event types
- only LinkedIn/X sources
- score clamped to 0-100

Before public leaderboard launch, add:

- rate limiting (Edge Function or API gateway)
- IP/user-agent abuse monitoring
- sample-size threshold (minimum 5-10 unique installs per author)
- manual removal workflow
- public disclaimer: score is directional, not legal proof
