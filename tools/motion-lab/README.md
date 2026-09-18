# Mii Motion Lab

Run `npm run dev` and open `/tools/motion-lab/`. The former `/animations.html` URL redirects here. The lobby is `/`, or `/?only=crowd` without the logo. All URLs also work under the GitHub Pages repository prefix.

The gallery previews eight original procedural motions: idle, walk, run, dance, panic, eat, wave, and cheer. Select a card for a larger preview; drag or use left/right arrow keys on the focused preview to rotate, and scroll to zoom. Pause and speed affect all previews. Scrubbing pauses playback and inspects the selected motion. Restart resets the clocks. Reduced-motion preferences start previews paused.

Implementation lives in `src/crowd/`: `lab.js` and `lab.css` provide the gallery; the public `buildMii(spec)` API, `avatar.js`, and `motions.js` are shared with the lobby. One renderer handles all gallery views and skips offscreen cards. No new runtime dependencies or build step.

These are procedural motion studies on an original Mii-inspired rigid-part avatar, not a Nintendo model or production motion-capture clips. See [the crowd notes](../../src/crowd/README.md) for the pose contract and future rig integration.

Checks: `node --test src/crowd/*.test.js` and `npm run check`.
