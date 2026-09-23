-- Resolve the Supabase security advisor error "Security Definer View"
-- (lint 0010) on public.event_availability.
--
-- The view used to run with its owner's privileges so it could total the
-- private reservations and waiting_list tables. That is what the advisor
-- flags: a view that bypasses row level security without saying so, where
-- one careless column added later (a name, an email) would be public.
--
-- The totals now come from an explicit SECURITY DEFINER function that lives
-- in a schema the API does not expose, and the view runs as the caller
-- (security_invoker). The view keeps the same columns, so the website and
-- its REST query need no changes.
--
-- Turning on security_invoker by itself is not enough: row level security
-- denies anon every row of the underlying tables, so the view would return
-- nothing and every event would show "Availability unavailable".
--
-- Safe to re-run.

create schema if not exists private;

create or replace function private.event_availability()
returns table (
  slug        text,
  title       text,
  capacity    integer,
  event_date  date,
  location    text,
  reserved    integer,
  remaining   integer,
  is_full     boolean,
  waiting     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.slug,
    e.title,
    e.capacity,
    e.event_date,
    e.location,
    coalesce(r.reserved, 0),
    greatest(e.capacity - coalesce(r.reserved, 0), 0),
    coalesce(r.reserved, 0) >= e.capacity,
    coalesce(w.waiting, 0)
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
$$;

-- Only the API roles may call it, and only through the view: the private
-- schema is not in the API's exposed schemas, so there is no /rpc route.
revoke all on function private.event_availability() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.event_availability() to anon, authenticated;

create or replace view public.event_availability
  with (security_invoker = true)
as
select * from private.event_availability();

grant select on public.event_availability to anon, authenticated;
