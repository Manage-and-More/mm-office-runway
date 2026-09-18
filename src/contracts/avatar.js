// CONTRACT — between the avatar workstream (produces specs) and the crowd workstream (renders them).
// The JSON Schema in avatar.schema.json is the source of truth; this is the JSDoc mirror.
// Rule for renderers: an unknown enum value must fall back to a default, never throw.
// That lets the avatar side add values before the crowd side supports them.

/**
 * @typedef {Object} AvatarSpec
 * @property {string} id                 kebab-case, equals the file name in data/avatars/.
 * @property {string} [displayName]      Shown on hover. Omit for anonymous donors.
 * @property {{ public: true, givenOn: string }} consent   Donor agreed to appear publicly (YYYY-MM-DD).
 * @property {{ shape: string, skinTone: string }} head
 * @property {{ style: string, color: string }} hair
 * @property {{ style: string, color: string }} eyes
 * @property {string} eyebrows
 * @property {string} nose
 * @property {string} mouth
 * @property {string} glasses
 * @property {string} facialHair
 * @property {string} shirtColor
 * @property {number} height             0.8..1.2, relative to a standard Mii.
 */

export {};
