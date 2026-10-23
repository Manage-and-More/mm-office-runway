# MM Office Runway

Manage and More is a student-led organization. We crowdfunded our office and now have to keep it. This page shows **how much runway the office has left**, in a way people actually notice.

**Live:** https://manage-and-more.github.io/mm-office-runway/

- A **planted garden shaped like the Manage and More signet** sits in the middle: low stone-edged beds, shrubs, grasses, and flowers.
- **40 Mii-style characters** share a white tiled lobby, taking short strolls, idling, eating, waving, and cheering. Available consented avatars appear alongside fictional demo characters. Standard is the current crowd state; named group emotes are available in the debug panel; automatic panic behavior is planned.

## Quick start

The [Mii Motion Lab](tools/motion-lab/) (`/tools/motion-lab/`, not linked from the page) previews eight original procedural animations on a generic Mii-style test character, with a live gallery, orbit controls, playback speed, and timeline scrubbing. See [the animation lab notes](tools/motion-lab/README.md) for the pose contract and future rig integration.

```bash
npm run dev
```

Then open http://localhost:8080/?debug to fake the funds with the Simulate panel (it only appears with `?debug`). Node is only needed for the dev scripts; the site itself has no build step.

## Contributing

We build this in four parallel workstreams (core, logo, crowd, avatars), each in its own folder. Read these first:

- [AGENTS.md](AGENTS.md): ownership, contracts, conventions, privacy and git workflow. (`CLAUDE.md` imports it.)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together and why.
- Workstream briefs: [logo](src/logo/README.md) · [crowd](src/crowd/README.md) · [avatars](tools/avatar-maker/README.md)

## Data source

The numbers come from Supabase (`config.js` → `supabase`). MM members sign in on the page itself (top right)
to add payments and Miis; admins keep costs, balances and corrections on [`/admin/`](admin/). The page reads
only the derived totals from a public view.
See [docs/DATABASE.md](docs/DATABASE.md) for the tables and the funds rule, and [docs/AUTH.md](docs/AUTH.md)
for who may edit.

Fallbacks, in order: a Google Sheet published as CSV (`sheetCsvUrl` in [`config.js`](config.js), columns
`funds` and `monthly_cost`), then [`data.json`](data.json). A failing source logs a warning and the next one
is used, so the page never goes blank.

## Deploy

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). CI (`.github/workflows/ci.yml`) validates avatars, syntax-checks the JS and blocks photo files.
