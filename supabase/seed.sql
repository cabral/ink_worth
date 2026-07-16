-- Seed events to match _events/*.md front matter.
-- Safe to re-run: on conflict updates metadata without touching reservations.
insert into public.events (slug, title, capacity, event_date, location) values
  ('delta-green-last-things-last',             'Delta Green: Last Things Last',             5, '2026-09-12', 'Stockholm'),
  ('dragonbane-secret-of-the-dragon-emperor',  'Dragonbane: Secret of the Dragon Emperor',  6, '2026-09-19', 'Stockholm'),
  ('coriolis-the-dying-ship',                  'Coriolis: The Dying Ship',                  4, '2026-10-03', 'Stockholm')
on conflict (slug) do update
  set title      = excluded.title,
      capacity   = excluded.capacity,
      event_date = excluded.event_date,
      location   = excluded.location;
