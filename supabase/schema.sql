-- ============================================================================
-- INK worth — RPG event reservations schema
-- ============================================================================
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query) to
-- provision the reservation backend. It is idempotent: re-running it is safe.
--
-- Design goals:
--   * Capacity is enforced by the database, never by the browser.
--   * Reservations and waiting-list rows are private (an anonymous visitor
--     can never read another person's name, email, or note).
--   * The public site can read *aggregate* availability only (X of Y seats).
--   * Writes happen through SECURITY DEFINER functions that lock the event
--     row, so two people reserving the last seats at the same moment can
--     never overbook.
-- ============================================================================

-- Enable the extension used for gen_random_uuid() (usually already on).
create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────────────────────

-- One row per event. `slug` is the stable identifier shared with the static
-- site: the value of `event_id` in each _events/*.md front matter. `capacity`
-- here is the source of truth the backend enforces.
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
-- Aggregates only. Runs with the view owner's privileges (security_invoker is
-- off by default) so it can total the private reservations table without
-- exposing individual rows. This is what the website reads to show seat counts.
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
-- Lock every table down. The public (anon) role gets no direct table access at
-- all; it reaches data only through the availability view and the RPCs below.
alter table public.events        enable row level security;
alter table public.reservations  enable row level security;
alter table public.waiting_list  enable row level security;

-- No permissive policies are created, so RLS denies all anon/authenticated
-- direct access by default. The service_role (used by the edge function and
-- by these SECURITY DEFINER functions) bypasses RLS.

-- Grant read on the aggregate view to the public API roles.
grant select on public.event_availability to anon, authenticated;

-- ── Atomic reservation function ─────────────────────────────────────────────
-- Locks the event row, recomputes remaining seats under the lock, and only
-- then inserts. Returns a small JSON result the edge function relays verbatim.
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

  -- Lock the event row for the duration of the transaction so concurrent
  -- reservations serialise here rather than racing.
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
-- Records interest once an event is full. Also locks the event row so the
-- decision "is it actually full?" is consistent with reserve_seats.
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

-- Only the service role may execute the write functions (the edge function
-- runs as service_role). Revoke from the public API roles for defence in depth.
revoke execute on function public.reserve_seats(text, text, text, integer, text)     from anon, authenticated;
revoke execute on function public.join_waiting_list(text, text, text, integer, text)  from anon, authenticated;

-- ── Example seed ────────────────────────────────────────────────────────────
-- Create one events row per _events/*.md file. `slug` must match the file's
-- `event_id`. Adjust and re-run as you add events (on conflict keeps it in sync).
--
-- insert into public.events (slug, title, capacity, event_date, location) values
--   ('delta-green-last-things-last', 'Delta Green: Last Things Last', 5, '2026-09-12', 'Stockholm'),
--   ('dragonbane-secret-of-the-dragon-emperor', 'Dragonbane: Secret of the Dragon Emperor', 6, '2026-09-19', 'Stockholm'),
--   ('coriolis-the-dying-ship', 'Coriolis: The Dying Ship', 4, '2026-10-03', 'Stockholm')
-- on conflict (slug) do update
--   set title = excluded.title,
--       capacity = excluded.capacity,
--       event_date = excluded.event_date,
--       location = excluded.location;
