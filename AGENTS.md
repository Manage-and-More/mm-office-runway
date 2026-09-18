# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, …) and for humans. `CLAUDE.md` imports this file, so this is the one place these rules live.

## What this is

A static 3D page showing how long Manage & More (a student-led org) can keep its crowdfunded office. The M&M logo stands in the middle and Mii-style donor avatars walk around it. When funds drop, the logo breaks and the Miis panic. When money comes in, the logo repairs itself and the Miis calm down.

Live at https://manage-and-more.github.io/mm-office-runway/ and deployed from `main` by GitHub Actions. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before making any structural change.

## Commands

```bash
npm run dev        # build the avatar index + serve on http://localhost:8080
npm run avatars    # rebuild data/avatar-index.json after changing data/avatars/
npm run check      # what CI runs: schema-validate avatars + syntax-check all JS
```

Useful URLs while developing:
- `/?debug` opens a panel to fake funds (lose €1,000, donate, crash) and shows each module's own knobs.
- `/?only=logo` or `/?only=crowd` renders one module alone, so a broken neighbour can't get in your way.
- `/tools/avatar-maker/` opens the photo → avatar tool.

## Workstreams: who works where

Four people work in parallel. Each workstream mostly edits its own paths, which is what keeps merges from colliding. This is a convention for staying productive, not a gate.

| Workstream | Owns | Delivers |
|---|---|---|
| **Core / integration** (@mousamax) | `src/core/`, `src/contracts/`, `src/modules.js`, `index.html`, `style.css`, `config.js`, `data.json`, `scripts/`, `.github/`, docs | Stage, data → `RunwayState`, HUD, debug panel, deploy |
| **Logo** | `src/logo/`, `assets/logo/` | 3D M&M logo that breaks and repairs with funds. Brief: [src/logo/README.md](src/logo/README.md) |
| **Crowd (Miis)** | `src/crowd/`, `assets/crowd/` | `buildMii(spec)` plus walking and mood animation. Brief: [src/crowd/README.md](src/crowd/README.md) |
| **Avatars** | `tools/avatar-maker/`, `data/avatars/` | Photo → `AvatarSpec` JSON, one file per donor. Brief: [tools/avatar-maker/README.md](tools/avatar-maker/README.md) |

If a task needs a change in someone else's paths, give them a quick heads-up, or keep it small and mention it in the PR. Agents should point out when a change reaches outside the current workstream.

## Contracts: the only coupling between workstreams

- `src/contracts/module.js` defines `CreateModule`, `ModuleContext`, `Frame` and `RunwayState`, plus the world-layout constants. Logo and crowd both implement this.
- `src/contracts/avatar.schema.json` (mirrored as JSDoc in `avatar.js`) is the `AvatarSpec` the avatar maker produces and the crowd renders.
- `src/crowd/mii.js` → `buildMii(spec)` is the crowd's public API. The avatar maker imports it for previews, so its signature is part of the contract.

Rules:
1. **Code against the contract, not against another module's internals.** Never import from another workstream's folder, except `buildMii`.
2. **Tell the others when a contract changes.** Keep it in its own small PR where possible. Additive changes (a new optional field, a new enum value) are easy. For renames or removals, agree with whoever uses them first.
3. **Renderers must tolerate unknown values.** An `AvatarSpec` enum value the crowd doesn't know yet falls back to a default and never throws. That lets the avatar side add values first.
4. **Modules own only their `ctx.root` group.** Don't touch the camera, renderer, lights, fog or anything outside `root`. If you need a scene-wide effect, ask core.

## Conventions

- **No build step.** Plain ES modules served as-is. Dependencies come from the import map in `index.html` (jsDelivr, pinned versions). Adding or upgrading a dependency is a core change.
- Import Three.js as `import * as THREE from "three"` and addons as `"three/addons/..."`.
- Type with JSDoc against the contracts (`/** @type {import("../contracts/module.js").CreateModule} */`). No TypeScript toolchain.
- Assets load via `new URL("file.glb", ctx.assetBase)` so paths work both locally and on GitHub Pages under `/mm-office-runway/`. Never use absolute `/…` paths.
- Respect `ctx.reducedMotion`: slow everything down, and drop shaking and flashing.
- Keep assets small. Aim for under 2 MB per workstream: compress GLBs (Draco/meshopt) and textures (KTX2/WebP).
- Performance budget: 60 fps on a mid-range laptop with about 150 Miis. Share geometries and materials, and don't allocate inside `update()`.

## Privacy: non-negotiable

- **Donor photos never enter git**, not even briefly on a branch. Keep them in `tools/avatar-maker/photos/` (git-ignored) or outside the repo. CI fails on any image file outside `assets/`.
- An avatar only exists with explicit consent: `consent.public: true` plus the date, which the schema enforces. `displayName` is optional; leave it out for donors who want to be anonymous.
- Avatars are parametric (face shape, colors, styles). Never store textures derived from a photo.
- If a donor withdraws consent, delete their file in a PR the same day.

## Git workflow

- Branch from `main` as `<workstream>/<short-topic>`, e.g. `logo/shatter-anim`, `crowd/walk-cycle`, `avatars/batch-1`, `core/sheet-columns`.
- Keep PRs small. One PR stays within one workstream's paths, or it's a contract PR.
- `npm run check` must pass, and CI runs it on every PR.
- Include a screenshot or short clip for visual changes, ideally using `?debug` at high and low funds.
- Squash-merge into `main`. Every merge to `main` deploys.

## Definition of done for a module PR

- Works alone (`?only=<module>`) and together with the others (`/`).
- Handles every mood (`thriving`, `calm`, `worried`, `panic`) and both event directions (loss and donation). Check with the debug panel.
- No console errors, holds 60 fps, respects `reducedMotion`.
- Doesn't touch files outside the workstream's paths.
