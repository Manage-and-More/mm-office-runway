# Workstream: Avatars (photo → Mii spec)

**Owns:** `tools/avatar-maker/`, `data/avatars/`. **Contract:** [`src/contracts/avatar.schema.json`](../../src/contracts/avatar.schema.json).

## Goal

Turn each donor's picture into an `AvatarSpec`: a small JSON file of Mii parameters (face shape, skin tone, hair style and color, eyes, glasses, …). It's committed as `data/avatars/<id>.json`, one file per donor.

## Privacy rules (hard requirements)

- **The photo never leaves the browser and never enters git.** The tool opens it as a local object URL. Keep originals in `tools/avatar-maker/photos/` (git-ignored) or outside the repo.
- Only donors who agreed get a file, with `consent: { public: true, givenOn: "YYYY-MM-DD" }`. Keep a record of each consent (email or form) outside the repo.
- No photo-derived textures: parameters only.
- `displayName` is optional. Leave it out for anonymous donors.

## Getting started

- Open `/tools/avatar-maker/` (with `npm run dev` running). The placeholder shows photo | JSON | live 3D preview and downloads the JSON.
- The preview uses the crowd's real `buildMii`, so the result looks like what will walk on the page. It will improve as the crowd workstream improves `mii.js`.
- Ideas for the real tool: a proper picker UI generated from the schema's enums, and assistance from on-device face landmarks (e.g. MediaPipe Face Landmarker running in the browser) to pre-fill face shape, skin tone and hair color from the photo.
- Adding a new enum value (a new hairstyle, say) is a contract change: open a PR on `src/contracts/` and agree it with the crowd owner.

## Workflow per donor batch

1. Create the specs in the tool and save them to `data/avatars/<firstname-lastinitial>.json`.
2. Run `npm run check` to validate against the schema and confirm `id` equals the file name.
3. Open a PR `avatars/batch-N`. It only touches `data/avatars/`.
4. Delete the `sample-*` files once real donors land.
