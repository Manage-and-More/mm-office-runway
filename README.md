# MM Office Runway

Manage and More is a student-led organization. We crowdfunded our office and now have to keep it. This page shows **how much runway the office has left**, in a way people actually notice.

**Live:** https://manage-and-more.github.io/mm-office-runway/

- A **planted garden shaped like the Manage and More signet** sits in the middle: low stone-edged beds, shrubs, grasses, and flowers.
- **40 Mii-style characters** share a white tiled lobby, taking short strolls, idling, eating, waving, and cheering. Available consented avatars appear alongside fictional demo characters. Standard is the current crowd state; named group emotes are available in the debug panel; automatic panic behavior is planned.

## Quick start

The **[Mii Motion Lab](tools/motion-lab/)** previews eight original procedural animations on a generic Mii-style test character, with a live gallery, orbit controls, playback speed, and timeline scrubbing. See [the animation lab notes](tools/motion-lab/README.md) for the pose contract and future rig integration.

```bash
npm run dev
```

Then open http://localhost:8080/?debug to fake the funds with the debug panel. Node is only needed for the dev scripts; the site itself has no build step.

## Contributing

We build this in four parallel workstreams (core, logo, crowd, avatars), each in its own folder. Read these first:

- [AGENTS.md](AGENTS.md): ownership, contracts, conventions, privacy and git workflow. (`CLAUDE.md` imports it.)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together and why.
- Workstream briefs: [logo](src/logo/README.md) · [crowd](src/crowd/README.md) · [avatars](tools/avatar-maker/README.md)

## Data source

A Google Sheet published as CSV (File → Share → Publish to web → CSV), with its URL set as `sheetCsvUrl` in [`config.js`](config.js):

| A | B |
|---|---|
| funds | monthly_cost |
| 6000 | 1000 |

Without a sheet, the page reads [`data.json`](data.json). Changes show up within about 5 minutes, because Google caches published CSVs. Anyone with the link can read a published sheet, so keep only these two numbers in it.

Excel Online links can't be read by a web page, because Microsoft doesn't allow other websites to fetch them (no CORS headers). Keep the numbers in the Google Sheet, or add a scheduled GitHub Action that copies them from Excel into `data.json`.

## Deploy

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). CI (`.github/workflows/ci.yml`) validates avatars, syntax-checks the JS and blocks photo files.
