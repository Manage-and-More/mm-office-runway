// Add occasions here. Choreography is data; timing/navigation stays in the director.
// The dance demo uses our existing playful dance loop, not a finished rumba clip.
export const GROUP_EMOTES = [
  {
    id: 'garden-dance', label: 'Gather & dance',
    phases: [
      { type: 'formation', formation: 'garden-rings', timeout: 40 },
      { type: 'motion', motion: 'dance', duration: 12, speed: 1, stagger: 0, facing: 'center' },
      { type: 'motion', motion: 'cheer', duration: 1.8, facing: 'front' },
      { type: 'release', duration: 0.6 },
    ],
  },
  {
    id: 'wave-ripple', label: 'Wave around the lobby',
    phases: [
      { type: 'motion', motion: 'wave', duration: 2.8, stagger: 0.06, facing: 'front' },
      { type: 'release', duration: 0.6 },
    ],
  },
  {
    id: 'group-cheer', label: 'Everybody cheers',
    phases: [
      { type: 'motion', motion: 'cheer', duration: 3.6, facing: 'front' },
      { type: 'release', duration: 0.6 },
    ],
  },
];
