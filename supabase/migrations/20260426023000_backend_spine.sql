create extension if not exists pgcrypto;

create table if not exists public.extension_installs (
  install_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  version text,
  source text,
  referrer text,
  user_agent text
);

create table if not exists public.extension_events (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.extension_installs(install_id) on delete cascade,
  event_type text not null check (
    event_type in ('install', 'decode', 'author_score', 'follow_author', 'email_opt_in')
  ),
  source text check (source in ('linkedin', 'twitter')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists extension_events_install_created_idx
  on public.extension_events (install_id, created_at desc);

create index if not exists extension_events_type_created_idx
  on public.extension_events (event_type, created_at desc);

create index if not exists extension_events_created_at_idx
  on public.extension_events (created_at desc);

create table if not exists public.author_scores (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('linkedin', 'twitter')),
  author_key text not null,
  author_name text not null,
  author_handle text,
  total_ai_score integer not null default 0 check (total_ai_score >= 0),
  post_count integer not null default 0 check (post_count >= 0),
  dominant_archetype text check (
    dominant_archetype in (
      'failure-laundering',
      'engagement-farming',
      'status-packaging',
      'ai-sludge',
      'consensus-wisdom'
    )
  ),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, author_key)
);

create index if not exists author_scores_source_avg_idx
  on public.author_scores (source, post_count desc, updated_at desc);

create table if not exists public.followed_authors (
  install_id uuid not null references public.extension_installs(install_id) on delete cascade,
  source text not null check (source in ('linkedin', 'twitter')),
  author_key text not null,
  author_name text not null,
  author_handle text,
  followed_at timestamptz not null default now(),
  primary key (install_id, source, author_key)
);

create table if not exists public.email_opt_ins (
  install_id uuid primary key references public.extension_installs(install_id) on delete cascade,
  email text not null,
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  constraint email_opt_ins_email_check check (position('@' in email) > 1)
);

alter table public.extension_installs enable row level security;
alter table public.extension_events enable row level security;
alter table public.author_scores enable row level security;
alter table public.followed_authors enable row level security;
alter table public.email_opt_ins enable row level security;

revoke all on public.extension_installs from anon, authenticated;
revoke all on public.extension_events from anon, authenticated;
revoke all on public.author_scores from anon, authenticated;
revoke all on public.followed_authors from anon, authenticated;
revoke all on public.email_opt_ins from anon, authenticated;

create or replace function public.safe_trim(value text, max_len integer)
returns text
language sql
immutable
as $$
  select nullif(left(trim(coalesce(value, '')), max_len), '');
$$;

create or replace function public.safe_int(value text, fallback integer)
returns integer
language sql
immutable
as $$
  select case
    when value ~ '^-?[0-9]+$' then value::integer
    else fallback
  end;
$$;

create or replace function public.ingest_extension_event(
  p_install_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_source text;
  v_author_name text;
  v_author_handle text;
  v_author_key text;
  v_ai_score integer;
  v_post_count integer;
  v_total_ai_score integer;
  v_archetype text;
  v_email text;
  v_event_payload jsonb;
begin
  if p_install_id is null then
    raise exception 'install_id_required';
  end if;

  if p_event_type not in ('install', 'decode', 'author_score', 'follow_author', 'email_opt_in') then
    raise exception 'unsupported_event_type';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  if length(v_payload::text) > 12000 then
    raise exception 'payload_too_large';
  end if;

  v_source := public.safe_trim(v_payload->>'source', 32);
  if v_source is not null and v_source not in ('linkedin', 'twitter') then
    raise exception 'unsupported_source';
  end if;

  if (
    select count(*)
    from public.extension_events
    where install_id = p_install_id
      and created_at > now() - interval '1 minute'
  ) > 120 then
    raise exception 'rate_limit_exceeded';
  end if;

  insert into public.extension_installs (
    install_id,
    version,
    source,
    referrer,
    user_agent
  )
  values (
    p_install_id,
    public.safe_trim(v_payload->>'version', 32),
    v_source,
    public.safe_trim(v_payload->>'referrer', 500),
    public.safe_trim(v_payload->>'userAgent', 300)
  )
  on conflict (install_id) do update
  set
    last_seen_at = now(),
    version = coalesce(excluded.version, public.extension_installs.version),
    source = coalesce(excluded.source, public.extension_installs.source),
    referrer = coalesce(excluded.referrer, public.extension_installs.referrer),
    user_agent = coalesce(excluded.user_agent, public.extension_installs.user_agent);

  -- Keep append-only events useful without turning them into a PII sink.
  v_event_payload := v_payload - 'email' - 'author' - 'authorHandle';

  insert into public.extension_events (install_id, event_type, source, payload)
  values (p_install_id, p_event_type, v_source, v_event_payload);

  if p_event_type = 'author_score' then
    v_author_name := public.safe_trim(v_payload->>'author', 160);
    v_author_handle := public.safe_trim(v_payload->>'authorHandle', 160);
    v_author_key := lower(coalesce(v_author_handle, v_author_name));
    v_ai_score := least(100, greatest(0, public.safe_int(v_payload->>'aiScore', 0)));
    v_post_count := greatest(0, public.safe_int(v_payload->>'postCount', 1));
    v_total_ai_score := greatest(0, public.safe_int(v_payload->>'totalAIScore', v_ai_score));
    v_archetype := public.safe_trim(v_payload->>'dominantArchetype', 64);

    if v_source is null or v_author_name is null or v_author_key is null then
      raise exception 'author_score_payload_incomplete';
    end if;

    if v_archetype is not null and v_archetype not in (
      'failure-laundering',
      'engagement-farming',
      'status-packaging',
      'ai-sludge',
      'consensus-wisdom'
    ) then
      v_archetype := null;
    end if;

    insert into public.author_scores (
      source,
      author_key,
      author_name,
      author_handle,
      total_ai_score,
      post_count,
      dominant_archetype,
      last_seen_at,
      updated_at
    )
    values (
      v_source,
      v_author_key,
      v_author_name,
      v_author_handle,
      v_total_ai_score,
      v_post_count,
      v_archetype,
      now(),
      now()
    )
    on conflict (source, author_key) do update
    set
      author_name = excluded.author_name,
      author_handle = coalesce(excluded.author_handle, public.author_scores.author_handle),
      total_ai_score = excluded.total_ai_score,
      post_count = excluded.post_count,
      dominant_archetype = coalesce(excluded.dominant_archetype, public.author_scores.dominant_archetype),
      last_seen_at = now(),
      updated_at = now();
  end if;

  if p_event_type = 'follow_author' then
    v_author_name := public.safe_trim(v_payload->>'author', 160);
    v_author_handle := public.safe_trim(v_payload->>'authorHandle', 160);
    v_author_key := lower(coalesce(v_author_handle, v_author_name));

    if v_source is null or v_author_name is null or v_author_key is null then
      raise exception 'follow_author_payload_incomplete';
    end if;

    insert into public.followed_authors (
      install_id,
      source,
      author_key,
      author_name,
      author_handle,
      followed_at
    )
    values (
      p_install_id,
      v_source,
      v_author_key,
      v_author_name,
      v_author_handle,
      now()
    )
    on conflict (install_id, source, author_key) do update
    set
      author_name = excluded.author_name,
      author_handle = coalesce(excluded.author_handle, public.followed_authors.author_handle),
      followed_at = now();
  end if;

  if p_event_type = 'email_opt_in' then
    v_email := lower(public.safe_trim(v_payload->>'email', 254));

    if v_email is null or position('@' in v_email) <= 1 then
      raise exception 'email_payload_incomplete';
    end if;

    insert into public.email_opt_ins (install_id, email, consented_at, unsubscribed_at)
    values (p_install_id, v_email, now(), null)
    on conflict (install_id) do update
    set
      email = excluded.email,
      consented_at = now(),
      unsubscribed_at = null;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ingest_extension_event(uuid, text, jsonb) from public;
grant execute on function public.ingest_extension_event(uuid, text, jsonb) to anon, authenticated;
