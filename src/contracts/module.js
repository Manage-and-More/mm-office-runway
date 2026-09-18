// CONTRACT — shared by core, logo and crowd.
// Changing this file needs a PR approved by every workstream owner (see AGENTS.md).
// Types only: nothing here runs, so modules can `import` it purely for JSDoc.

/**
 * Derived from the data source by core (src/core/runway.js). Read-only for modules.
 * @typedef {Object} RunwayState
 * @property {number} funds          Euros currently available for the office.
 * @property {number} monthlyCost    Euros the office costs per month.
 * @property {number} runwayMonths   funds / monthlyCost (Infinity if monthlyCost is 0).
 * @property {number} health         0..1 — runwayMonths / config.healthyMonths, clamped. 1 = all good.
 * @property {Mood} mood             Bucketed health; thresholds live in config.js.
 * @property {"sheet"|"json"|"debug"|"offline"} source
 */

/** @typedef {"thriving"|"calm"|"worried"|"panic"} Mood */

/**
 * Fired on ctx.events as `fundschange` whenever funds change (and once at startup, with previous = null).
 * @typedef {Object} FundsChange
 * @property {RunwayState|null} previous
 * @property {RunwayState} current
 * @property {number} delta          Euros; < 0 means money was lost, > 0 means money came in.
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
 * @property {boolean} debug                       Page opened with ?debug.
 */

/**
 * @typedef {Object} Frame
 * @property {number} dt             Seconds since last frame (clamped to 0.1).
 * @property {number} time           Seconds since start.
 * @property {RunwayState} state     Always read state from here; don't cache it.
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
export const LOGO_RADIUS = 2.5;
export const CROWD_INNER_RADIUS = 3.5;
export const CROWD_OUTER_RADIUS = 11;
