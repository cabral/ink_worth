# Reservation backend (Supabase)

The INK worth site is a static GitHub Pages site. Reservation *state* lives
outside the repository, in a [Supabase](https://supabase.com) project:

```
GitHub Pages (static)  ──POST──▶  Edge Function (reserve)  ──▶  Postgres
   seat counts ◀── event_availability view (public, aggregate only)
```

Capacity is enforced by Postgres, not by the browser. Two people reserving the
last seats at the same instant serialise on a row lock, so the event can never
be overbooked.

One-time setup takes about ten minutes.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a new project
   (the free tier is plenty for a local RPG community).
2. Note the **Project URL** and the **anon / publishable key** from
   *Project Settings → API*. The anon key is safe to publish — it only allows
   what row-level security permits.

## 2. Create the schema

Open *SQL Editor → New query*, paste the contents of
[`schema.sql`](./schema.sql), and run it. This creates the `events`,
`reservations`, and `waiting_list` tables, the public `event_availability`
view, row-level security, and the atomic `reserve_seats` /
`join_waiting_list` functions.

## 3. Deploy the edge function

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy reserve --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for
deployed functions, so no extra secrets are needed. The service-role key stays
on Supabase and is never shipped to the browser.

## 4. Point the website at Supabase

In [`_config.yml`](../_config.yml), replace the placeholders:

```yaml
supabase:
  url: "https://YOUR-PROJECT.supabase.co"
  anon_key: "YOUR-SUPABASE-ANON-KEY"
```

Commit and push — GitHub Pages rebuilds and the reservation widgets go live.
Until you do this, the widgets show a friendly "reservations aren't set up yet"
notice instead of erroring.

## 5. Add each event to the database

Every file in `_events/` needs a matching row in the `events` table, keyed by
the file's `event_id`. The bottom of `schema.sql` has a ready-to-edit
`insert ... on conflict` block — keep it as your seed list and re-run it
whenever you add or change an event. The `capacity` in that row is what the
backend enforces; keep it equal to the `capacity` in the event's front matter
so the displayed number matches reality.

## Managing reservations and the waiting list

Use the Supabase *Table Editor* to view reservations and the waiting list.
When someone cancels, delete their `reservations` row — seats free up
immediately — then contact the next person on that event's `waiting_list`
(ordered by `created_at`). Automatic promotion can be added later; for now it
is a deliberate manual step so a human confirms each hand-off.

## What's exposed, and what isn't

| Role | Can do |
| --- | --- |
| Anonymous visitor (browser) | Read aggregate seat counts via `event_availability`. Submit a reservation/waitlist request through the edge function. |
| Anonymous visitor | **Cannot** read anyone's name, email, or notes, and cannot write to any table directly. |
| Edge function (`service_role`) | Calls the locking SQL functions to insert reservations. |
| You (dashboard) | Full access to every table. |
