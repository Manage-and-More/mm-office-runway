# Group emotes

Normal lobby behavior remains the default. Group emotes temporarily own every resident's movement and pose, then return control to independent idle/walk/eat schedules. No automatic donation triggers or confetti are installed.

## Try it

Open `/?debug`, expand **crowd → Group emotes**, select an occasion, and use **Play / replace**, **Queue next**, or **Cancel**. Available examples:

- `garden-dance`: gather in rings outside the garden and furniture, dance together, cheer, release.
- `wave-ripple`: wave in participant order with a small delay.
- `group-cheer`: cheer together in place.

The dance uses the existing procedural dance clip; it is not a finished rumba animation.

## API

The crowd module returns `instance.groupEmotes`. The same facade is available on its own `ctx.root.userData.groupEmotes` for a future integration layer. The facade stays stable across crowd-count rebuilds.

```js
const api = crowdInstance.groupEmotes;
api.list(); // [{ id, label }]
api.play('garden-dance'); // boolean: accepted or rejected
api.play('wave-ripple', { busy: 'queue' });
api.play('group-cheer', { busy: 'replace' });
api.getStatus(); // active, emote, phase, progress (0..1), queued, lastResult
const unsubscribe = api.subscribe(event => {
  // event.type: start | phase | cue | finish
  // event.id, event.phase; cue adds name, finish adds result
});
api.cancel();
unsubscribe();
```

`busy` defaults to `reject`. `queue` accepts up to four pending emotes. `replace` clears pending work and replaces the active sequence. Cancel clears the queue and resumes the lobby in place without teleporting. End results include `completed`, `cancelled`, `replaced`, `unreachable-formation`, and `formation-timeout`. A count change cancels the current sequence; module disposal also removes listeners.

## Add an occasion

Add an entry to `definitions.js`; no changes to the director are required:

```js
{
  id: 'anniversary', label: 'Anniversary',
  phases: [
    { type: 'formation', formation: 'garden-rings', timeout: 40 },
    { type: 'motion', motion: 'dance', duration: 12, speed: 1,
      stagger: 0, facing: 'center', cues: [{ at: 2, name: 'celebration-accent' }] },
    { type: 'release', duration: 0.6 },
  ],
}
```

Formation phases wait for every participant to settle: either arriving at its slot, or being boxed in for about six seconds after a few reroute attempts. Gathering is therefore best effort — a resident stuck behind the others dances where it stands instead of holding up the whole occasion, which matters in the maze-like park where corridors are single file. A dance never starts while someone is still making progress. On timeout or an unreachable route the director safely resumes standard behavior. Motion durations and stagger values are seconds; duration is per participant, and the phase lasts through the last participant's offset. Motion playback uses one director clock, so fully synchronized clips do not drift. `facing` is `center`, `front`, or `keep`. Release blends to idle, then seeds each resident's normal controller from its current pose.

Add a formation function to `formations.js` returning `{x,z}` slots. The registry validates all definitions up front and takes an immutable copy. Assignment minimizes total squared travel distance. Navigation routes around registered beds/furniture and preserves personal space; it is local crowd steering with a timeout, not a guarantee of arbitrary multi-agent route solving.

Cues are named hooks, emitted once when their phase-local time is crossed. Consumers can add effects later without touching timing logic. No visual effects are rendered by this infrastructure. Reduced motion skips formation travel, uses gentle idle in place, and suppresses cues. The debug pause freezes all crowd clocks.

## Shared navigation contract

Core now supplies optional `ctx.navigation` (documented in `src/contracts/module.js`). Garden registers its actual planting-bed and furniture polygons; crowd queries walkability and routes without importing garden internals. With navigation present, normal strolling can use reachable paths **inside** the garden; the old `CROWD_INNER_RADIUS` exclusion applies only as a fallback when the service is absent. Formation rings sit outside `GARDEN_RADIUS` and furniture.

## Validation

`node --test src/crowd/*.test.js src/crowd/group-emotes/*.test.js src/core/navigation.test.js`

Tests cover lifecycle, queue policies, cancellation, immutable/invalid definitions, synchronized completion, reduced motion, cues, 40-person gathering, formation capacity to 150, collision spacing, and obstacle-aware navigation. An integration check also runs the actual SVG garden, 40 instanced Miis, and the full gather/dance/release sequence against the pinned Three.js version.
