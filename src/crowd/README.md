# Crowd: standard Mii lobby

The current implementation is a **40-person standard lobby**: mostly idle, with independent short strolls, eating, waving, and occasional cheering. The white tile floor, lighting, and camera remain owned by core. The central logo area stays clear.

## Entry points

- `/`: crowd and logo together.
- `/?only=crowd`: lobby alone.
- `/?only=crowd&debug`: crowd size (8–150), pause, and live action counts.
- `/tools/motion-lab/`: inspect all eight individual motions, including dance, run, and panic studies that are **not** active lobby states yet.

`standard` is the only crowd state implemented. The crowd safely accepts every `RunwayState.mood`, but loss/donation events do not change its state yet. Celebration and panic controllers, and their transitions, are future work. The logo and financial HUD still respond to runway data independently.

## Repo contracts

`mii.js` exports `buildMii(spec)` → `THREE.Group`, feet near Y=0, facing +Z, approximately 1 unit tall × `spec.height`. The avatar maker uses the same API. `group.userData.applyPose(pose)`, `.joints`, and `.setMood(mood)` expose animation and expression hooks. Unknown enum values fall back; invalid colors and heights get safe defaults. Skin, shirt, hair color/style, head proportions, glasses, and some facial-hair variations are supported; other facial-style fields currently use a generic default or approximation.

The first consented avatars fill available lobby slots. Remaining slots use deterministic fictional demo characters, generated in memory; these are explicitly labelled as demos in the page and never written as donor records or given fabricated consent. The count is fixed at 40 for this demo, rather than inferred from donor count. The current three sample specs therefore leave 37 demo slots.

## Motion and behavior

- `motions.js`: deterministic, renderer-independent pose samplers and shared motion catalog.
- `avatar.js`: rigid-part character, cached materials/geometries, and pose adapter.
- `standard.js`: independent seeded schedules, pace variation, and 0.45-second pose transitions. Idle dominates; activities return to idle.
- `layout.js`: spaced initial positions inside the shared crowd ring, with clearance around the logo.
- `wander.js`: short local routes, smooth turning, boundary/route checks, and personal-space checks. A blocked walker returns to idle. Reduced-motion characters remain in slow idle.
- `batches.js`: one `InstancedMesh` per shared geometry, using per-instance colors. Currently 11 geometry batches for the sample 40-person lobby. This avoids one draw call per body part; no crowd objects are added outside `ctx.root`.
- `index.js`: module lifecycle, assembly, debug controls, and disposal.

Pose rotations use local XYZ radians, Y up, forward +Z, limbs down in the neutral pose. Root offsets are normalized to character height (2.7 model units before the public `buildMii` scale). `JOINTS` defines semantic names. Mouth, blink, worried, and food channels are optional capabilities for a future avatar adapter.

For the final rig, map names, rest pose, and bone axes in the adapter, then check proportions, ground contact, and hand-to-mouth alignment. These motions are not automatically compatible with arbitrary skeletons. The placeholder head pivots at its center. Walking is an approximate procedural cycle, not IK foot locking; navigation separately controls world position. Eating attaches a cookie to the right-hand joint rather than simulating consumption.

## Validation

`node --test src/crowd/*.test.js` covers motion loops, transitions, state reset, scheduling, independent timing, reduced motion, crowd spacing, deterministic demo generation, and walking routes. `npm run check` validates donor schemas and syntax.

Integration checks against Three.js 0.170.0 exercise `buildMii` with all sample specs and unknown enum values, every motion, all incoming moods, 40/150-character batching, and disposal. Browser visual/GPU validation and a screenshot remain necessary when browser access is available; CPU update timing is not a frame-rate guarantee.

This slice reaches outside crowd paths only for the requested white textured stage / closer camera (`src/core/stage.js`), readable lobby UI and tool link (`index.html`, `style.css`), and tool/docs relocation. Shared contracts, logo code, donor records, and dependencies are unchanged.
