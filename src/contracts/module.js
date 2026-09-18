// CONTRACT — shared by core, logo and crowd.
// Changes affect everyone: give the other workstreams a heads-up (see AGENTS.md).
// Types only: nothing here runs, so modules can `import` it purely for JSDoc.

/**
 * Derived from the data source by core (src/core/runway.js). Read-only for modules.
 * @typedef {Object} RunwayState
 * @property {number} funds          Euros currently available for the office.
 * @property {number} monthlyCost    Euros the office costs per month.
 * @property {number} runwayMonths   funds / monthlyCost (Infinity if monthlyCost is 0).
 * @property {number} stress         0..1 target stress from the S-curve in src/core/feelings.js (config.stress).
 *                                   Jumps when data changes — for visuals prefer the smoothed frame.feelings.stress.
 * @property {number} health         1 - stress. Kept for convenience.
 * @property {Mood} mood             Bucketed stress: thriving < 0.1 ≤ calm < 0.35 ≤ worried < 0.7 ≤ panic.
 * @property {"sheet"|"json"|"debug"|"offline"} source
 */

/** @typedef {"thriving"|"calm"|"worried"|"panic"} Mood */

/**
 * Fired on ctx.events as `fundschange` whenever funds change (and once at startup, with previous = null).
 * @typedef {Object} FundsChange
 * @property {RunwayState|null} previous
 * @property {RunwayState} current
 * @property {number} delta          Euros; < 0 means money was lost, > 0 means money came in.
 * @property {number} months         delta / monthlyCost: "months of runway bought (+) or lost (−)".
 * @property {number} impulse        -1..1 reaction strength: sign(months) · min(1, log2(1 + |months|)).
 *                                   0 at startup and for quiet changes (simulation sliders): don't react then.
 * @property {boolean} quiet
 */

/**
 * Smoothed, per-frame feelings. Drive continuous visuals from these.
 * @typedef {Object} Feelings
 * @property {number} stress         0..1, eases towards state.stress over config.feelings.stressSeconds.
 * @property {number} emotion        -1..1, kicked by each impulse and decaying over config.feelings.emotionSeconds.
 *                                   > 0 joy (money came in), < 0 shock (money lost).
 */

/**
 * @typedef {Object} ModuleContext
 * @property {import("three").Scene} scene
 * @property {import("three").Group} root          Your group, already in the scene. Put everything you create here.
 * @property {import("three").PerspectiveCamera} camera   Read-only; core owns the camera.
 * @property {import("three").WebGLRenderer} renderer     Read-only; core owns the renderer.
 * @property {EventTarget} events                  Listen for "fundschange" (CustomEvent<FundsChange>).
 * @property {import("./avatar.js").AvatarSpec[]} avatars   All consented donor avatars.
 * @property {URL} assetBase                       Your asset folder: new URL("logo.glb", ctx.assetBase).
 * @property {boolean} reducedMotion               User asked for less motion: calm everything down.
 * @property {ReturnType<typeof import("../core/navigation.js").createNavigation>} [navigation] Shared walkability; register bed/furniture contours, then query safe paths.
 * @property {boolean} debug                       Page opened with ?debug.
 */

/**
 * @typedef {Object} Frame
 * @property {number} dt             Seconds since last frame (clamped to 0.1).
 * @property {number} time           Seconds since start.
 * @property {RunwayState} state     Always read state from here; don't cache it.
 * @property {Feelings} feelings
 */

/**
 * What your module's default export returns.
 * @typedef {Object} ModuleInstance
 * @property {(frame: Frame) => void} update
 * @property {(gui: import("lil-gui").GUI) => void} [debugUI]   Optional: add your own knobs to the ?debug panel.
 * @property {() => void} [dispose]
 */

/**
 * The default export of src/<module>/index.js.
 * @typedef {(ctx: ModuleContext) => ModuleInstance | Promise<ModuleInstance>} CreateModule
 */

/**
 * World layout (units ≈ metres, y is up, ground is y = 0):
 *   logo  — centred on (0, LOGO_CENTER_Y, 0), stays inside LOGO_RADIUS.
 *   crowd — walks on the ground between CROWD_INNER_RADIUS and CROWD_OUTER_RADIUS.
 *   A Mii is ~1 unit tall.
 */
export const LOGO_CENTER_Y = 2.5;
export const LOGO_RADIUS = 2.5; // Legacy sculpture radius.
export const GARDEN_RADIUS = 5.2; // Ground-level planted centerpiece; paths between beds remain walkable.
export const CROWD_INNER_RADIUS = 3.5;
export const CROWD_OUTER_RADIUS = 11;
