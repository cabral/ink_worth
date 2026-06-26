# INK worth

Source for the [INK worth](https://cabral.github.io/ink_worth/) site, a personal
project about doing some things by hand, offline, on paper: morning writing, live
RPG sessions, and solo journaling games.

The site is built with Jekyll using GitHub Pages' native build and the Minima theme.

## Pages

- `index.md`: the home page.
- `morning-pages.md`: the Morning Pages guide, served at `/morning-pages/`.

## Running it locally

You need Ruby and Bundler. From the repository root:

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
