-- Enable the extension used for gen_random_uuid() (usually already on).
create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  capacity    integer not null check (capacity >= 0),
  event_date  date,
  location    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  email       text,
  seats       integer not null check (seats >= 1),
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.waiting_list (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  email       text,
  seats       integer not null check (seats >= 1),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists reservations_event_id_idx on public.reservations (event_id);
create index if not exists waiting_list_event_id_idx  on public.waiting_list  (event_id);

-- ── Availability view ───────────────────────────────────────────────────────

create or replace view public.event_availability as
select
  e.slug,
  e.title,
  e.capacity,
  e.event_date,
  e.location,
  coalesce(r.reserved, 0)                             as reserved,
  greatest(e.capacity - coalesce(r.reserved, 0), 0)   as remaining,
  (coalesce(r.reserved, 0) >= e.capacity)             as is_full,
  coalesce(w.waiting, 0)                              as waiting
from public.events e
left join (
  select event_id, sum(seats)::int as reserved
  from public.reservations
  group by event_id
) r on r.event_id = e.id
left join (
  select event_id, sum(seats)::int as waiting
  from public.waiting_list
  group by event_id
) w on w.event_id = e.id;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.events        enable row level security;
alter table public.reservations  enable row level security;
alter table public.waiting_list  enable row level security;

-- Grant read on the aggregate view to the public API roles.
grant select on public.event_availability to anon, authenticated;

-- ── Atomic reservation function ─────────────────────────────────────────────

create or replace function public.reserve_seats(
  p_slug   text,
  p_name   text,
  p_email  text,
  p_seats  integer,
  p_notes  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event      public.events%rowtype;
  v_reserved   integer;
  v_remaining  integer;
begin
  if p_seats is null or p_seats < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_seats');
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  select * into v_event
  from public.events
  where slug = p_slug
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  select coalesce(sum(seats), 0) into v_reserved
  from public.reservations
  where event_id = v_event.id;

  v_remaining := v_event.capacity - v_reserved;

  if p_seats > v_remaining then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_enough_seats',
      'remaining', greatest(v_remaining, 0)
    );
  end if;

  insert into public.reservations (event_id, name, email, seats, notes)
  values (v_event.id, btrim(p_name), nullif(btrim(p_email), ''), p_seats, nullif(btrim(p_notes), ''));

  return jsonb_build_object(
    'ok', true,
    'reserved_seats', p_seats,
    'remaining', v_remaining - p_seats
  );
end;
$$;

-- ── Waiting-list function ───────────────────────────────────────────────────

create or replace function public.join_waiting_list(
  p_slug   text,
  p_name   text,
  p_email  text,
  p_seats  integer,
  p_notes  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event      public.events%rowtype;
  v_reserved   integer;
  v_remaining  integer;
begin
  if p_seats is null or p_seats < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_seats');
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  select * into v_event
  from public.events
  where slug = p_slug
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  select coalesce(sum(seats), 0) into v_reserved
  from public.reservations
  where event_id = v_event.id;

  v_remaining := v_event.capacity - v_reserved;

  insert into public.waiting_list (event_id, name, email, seats, notes)
  values (v_event.id, btrim(p_name), nullif(btrim(p_email), ''), p_seats, nullif(btrim(p_notes), ''));

  return jsonb_build_object('ok', true, 'waitlisted_seats', p_seats, 'remaining', greatest(v_remaining, 0));
end;
$$;

-- Revoke direct execution from public API roles; only the edge function (service_role) may call these.
revoke execute on function public.reserve_seats(text, text, text, integer, text)     from anon, authenticated;
revoke execute on function public.join_waiting_list(text, text, text, integer, text)  from anon, authenticated;
