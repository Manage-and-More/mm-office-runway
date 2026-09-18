# Workstream: Logo

**Owns:** `src/logo/`, `assets/logo/`. **Contract:** `CreateModule` in [`../contracts/module.js`](../contracts/module.js).

## Goal

The Manage & More logo, built in 3D in the middle of the scene. Its condition mirrors the office's finances:

| Funds | Logo |
|---|---|
| `health` 1 (thriving) | Whole, polished, maybe gently glowing or rotating |
| `health` falling | Cracks appear and pieces loosen |
| `health` near 0 (panic) | Broken apart, with pieces scattered or fallen |
| `fundschange` with `delta < 0` | A one-off **break** moment: pieces snap off with a shake or shatter |
| `fundschange` with `delta > 0` | A one-off **repair** moment: pieces fly back and click into place |

## Getting started

- Work in `/?only=logo&debug` and use the lose/donate/crash buttons.
- The current `index.js` is a placeholder made of cubes. Replace it entirely, keeping the default-export signature.
- Suggested pipeline: logo SVG → Three.js `SVGLoader` + `ExtrudeGeometry` in code, or model it in Blender → pre-fracture it (Cell Fracture addon) → export as **GLB** to `assets/logo/` → load with `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`.
- Put your own tuning sliders in `debugUI(gui)`.

## Constraints

- Stay within `LOGO_RADIUS` around `(0, LOGO_CENTER_Y, 0)`. The crowd walks just outside it.
- Add objects only to `ctx.root`. Keep assets under 2 MB.
- `reducedMotion`: no shaking. Crossfade between broken and whole instead.
