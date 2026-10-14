# INK worth

Source for the [INK worth](https://cabral.github.io/ink_worth/) site, a personal
project about doing some things by hand, offline, on paper: morning writing, live
RPG sessions, and solo journaling games.

The site is built with Jekyll using GitHub Pages' native build and the Minima theme.

## Pages

- `index.md`: the home page's front matter. The copy itself lives in
  `_layouts/home.html`, which lays it out on the margin-note grid.
- `morning-pages.md`: the Morning Pages guide, served at `/morning-pages/`.
- `solo_ionheart.md`: the ION Heart solo journal blog, served at `/solo_ionheart/`.
- `_posts/`: blog entries for the ION Heart journal. Each post sets
  `categories: ion-heart` (so it shows on the blog index) and
  `permalink: /solo_ionheart/:title/` (so its URL nests under the blog).
- `events.md`: the events index, served at `/events/`.
- `_events/`: one file per RPG event. Each becomes a page at
  `/events/<name>/` with a reservation form.
- `assets/css/site.css`: every style on the site, including the dark-mode
  palette. Colours are tokens at the top of the file.

## RPG event reservations

The site can take seat reservations for tabletop RPG events. The website stays
a static GitHub Pages site; reservation state lives in a
[Supabase](https://supabase.com) project, and capacity is enforced by the
backend so an event can't be overbooked by two people reserving at once.

Adding an event is the usual Git workflow:

1. Create a file in `_events/`, for example `_events/my-one-shot.md`:

   ```yaml
   ---
   title: "Delta Green: Last Things Last"
   event_id: delta-green-last-things-last   # stable id, matches Supabase
   system: Delta Green
   date: 2026-09-12
   time: "18:00"
   location: Stockholm
   capacity: 5
   status: open        # open | closed
   summary: "One-line teaser shown on the events index."
   ---

   Longer description in Markdown, shown on the event page.
   ```

2. Add a matching row to the Supabase `events` table (see
   `supabase/README.md`), keyed by the same `event_id`.
3. Commit and push. GitHub Pages rebuilds and the event appears with a live
   seat count and a reservation form.

Note: events are naturally future-dated, so `_config.yml` sets `future: true`
(Jekyll hides future-dated documents otherwise).

Once an event's date has passed it moves to "Past sessions" on the events
index and its page stops taking reservations. That split happens at build
time, and because Pages only rebuilds on push, `assets/js/reservations.js`
checks the date again in the browser. The next three upcoming events also
show on the home page under section 02.

The backend (SQL schema, atomic reservation function, edge function, and full
setup steps) lives under `supabase/`. See `supabase/README.md`. Until you fill
in the `supabase:` block in `_config.yml`, the reservation widgets degrade
gracefully to a "not set up yet" notice.

## Running it locally

You need Ruby 3.4 (pinned in `mise.toml`) and Bundler. Ruby 4.0 won't work:
the `commonmarker` version that `github-pages` depends on declares `ruby < 4.0`,
so Bundler falls back to an ancient `github-pages` that won't compile. From the
repository root:

```
bundle install
bundle exec jekyll serve
```

The site is then at `http://127.0.0.1:4000/ink_worth/`. The `/ink_worth/` path
comes from the `baseurl` in `_config.yml`, which matches the project-repo URL on
GitHub Pages.

## Writing

`WRITING_STYLE.md` holds the style rules for any prose added to the site. The hard
rule for this project: no em dashes anywhere. Read it before writing copy.

## Deploying

Pushing to the branch configured in the repository's Pages settings triggers the
GitHub Pages build. There is no separate deploy step.
