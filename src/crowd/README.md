# Workstream: Crowd (Miis)

**Owns:** `src/crowd/`, `assets/crowd/`. **Contracts:** `CreateModule` in [`../contracts/module.js`](../contracts/module.js) and `AvatarSpec` in [`../contracts/avatar.schema.json`](../contracts/avatar.schema.json).

## Goal

Every donor appears as a Mii-style character walking around the logo. Their behaviour follows the funds:

| `state.mood` | Crowd |
|---|---|
| `thriving` | Happy and chill: strolling, waving, sitting, smiling |
| `calm` | Normal walking |
| `worried` | Faster, glancing around, worried faces |
| `panic` | Running in different directions, arms flailing, panicked faces |

One-off reactions to `fundschange`: for example, everyone jumps when money comes in, or flinches when it's lost.

## Two deliverables

1. **`mii.js` → `buildMii(spec)`** is your **public API**. The avatar maker uses it for its live preview. Keep the signature: it takes an `AvatarSpec` and returns a `THREE.Group` with the feet at y = 0, facing +z, about 1 unit tall × `spec.height`. Expose expression hooks (happy, worried, panic) on the returned group, e.g. `group.userData.setMood(mood)`.
2. **`index.js`** is the crowd module: placement, walking, avoidance and mood animation.

## Getting started

- Work in `/?only=crowd&debug`. The three `sample-*` avatars in `data/avatars/` are your test donors. Add more samples locally if you need a crowd, but coordinate with the avatar owner before committing them.
- Any enum value you don't recognise must fall back to a default and never throw. The avatar side may add values before you support them.

## Constraints

- Walk only within the ring from `CROWD_INNER_RADIUS` to `CROWD_OUTER_RADIUS`.
- Must hold 60 fps with about 150 Miis: share geometries and materials, and consider `InstancedMesh` or a skinned GLB with shared animations.
- `reducedMotion`: slow walking only, no running.
