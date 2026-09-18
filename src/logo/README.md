# Center garden

The `logo` module slot now contains a **ground-level planted garden**, replacing the floating placeholder cubes. Its five beds follow the original contours of `assets/logo/manage-and-more-signet.svg`, supplied by the user. The source SVG is used only for geometry: its blue fill is not rendered as a logo.

Each section is a shallow soil bed with pale rounded stone edging. Shrubs, grasses, and small cream, pink, lavender, and yellow flowers are distributed inside the contours, leaving the gaps as open paths. Plants use deterministic placement and instanced geometry. Grass moves gently in a breeze; reduced-motion mode disables it.

The garden remains stable across all financial moods and donation/loss events. It does not shatter, spin, or float. This intentionally supersedes the earlier logo-shattering brief. It stays inside `LOGO_RADIUS` in XZ, but sits at ground level instead of `LOGO_CENTER_Y`; no shared constants or other modules are changed.

- `/`: garden and Miis together.
- `/?only=logo`: garden alone (legacy module identifier preserved).
- `/?only=logo&debug`: plant/bed counts and breeze toggle.
- `/?only=crowd`: intentionally excludes the garden.

`gardenFootprints()` converts SVG contours to ground-plane shapes. `buildGarden()` owns all of its resources under `ctx.root` and releases them in `dispose()`. Asset paths resolve against `ctx.assetBase`, including on GitHub Pages. No new dependencies or donor data.

## Walkable garden expansion

The garden now uses `GARDEN_RADIUS = 5.2` (about twice the earlier footprint), with four wooden benches and six warm emissive lanterns. Furniture and beds register obstacles with core's optional navigation service. Open reachable spaces between the actual SVG contours remain walkable; benches are obstacles, not sitting interactions yet. Lanterns use emissive materials rather than extra shadow-casting point lights.
