// Pose contract: radians in local XYZ order; Y up, character faces +Z.
// Arms and legs point down at rest. Root offsets are fractions of avatar height.
// This module has no renderer or mesh dependency. Adapt its named joints to a
// future rig's rest pose / axes; do not apply blindly to arbitrary skeletons.
export const JOINTS = ['hips', 'spine', 'head', 'leftUpperArm', 'leftForearm', 'leftHand', 'rightUpperArm', 'rightForearm', 'rightHand', 'leftThigh', 'leftShin', 'leftFoot', 'rightThigh', 'rightShin', 'rightFoot'];
export const MOTIONS = [
  { id: 'idle', name: 'Idle', category: 'Ambient', duration: 4, description: 'A little breathing, a little daydreaming.' },
  { id: 'walk', name: 'Walk', category: 'Locomotion', duration: 1.2, description: 'An easy stroll. Played in place, ready for a path.' },
  { id: 'run', name: 'Run', category: 'Locomotion', duration: 0.72, description: 'Quick feet, swinging arms, somewhere to be.' },
  { id: 'dance', name: 'Dance', category: 'Expression', duration: 2.4, description: 'Side to side, with absolutely no self-consciousness.' },
  { id: 'panic', name: 'Panic', category: 'Expression', duration: 1.2, description: 'Flailing hands and frantic feet. Everything is definitely fine.' },
  { id: 'eat', name: 'Eat', category: 'Activity', duration: 4, description: 'Raise a cookie, take a bite, and enjoy the moment.' },
  { id: 'wave', name: 'Wave', category: 'Social', duration: 2.8, description: 'A friendly hello, with a little head tilt.' },
  { id: 'cheer', name: 'Cheer', category: 'Expression', duration: 1.8, description: 'Hands up! A small celebration with a happy hop.' },
];
const MOTION_BY_ID = Object.fromEntries(MOTIONS.map(motion => [motion.id, motion]));
const POSE_CHANNELS = ['mouth', 'blink', 'worried', 'food'];
const TAU = Math.PI * 2;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const envelope = (p, start, up, down, end) => smooth((p - start) / (up - start)) * (1 - smooth((p - down) / (end - down)));
export function createPose() {
  return { joints: Object.fromEntries(JOINTS.map(name => [name, [0, 0, 0]])), root: [0, 0, 0], mouth: 0, blink: 0, worried: 0, food: 0 };
}
export function sampleMotion(id, time, pose = createPose()) {
  const motion = Object.hasOwn(MOTION_BY_ID, id) ? MOTION_BY_ID[id] : null;
  if (!motion) throw new Error(`Unknown motion: ${id}`);
  for (const name of JOINTS) pose.joints[name].fill(0);
  pose.root.fill(0);
  pose.mouth = pose.blink = pose.worried = pose.food = 0;
  const p = ((time % motion.duration) + motion.duration) % motion.duration / motion.duration;
  const a = p * TAU, s = Math.sin(a), c = Math.cos(a), j = pose.joints;
  j.leftUpperArm[2] = 0.1;
  j.rightUpperArm[2] = -0.1;
  j.leftForearm[0] = j.rightForearm[0] = -0.08;
  pose.blink = envelope(p, 0.78, 0.795, 0.805, 0.83);
  if (id === 'idle') {
    j.spine[0] = 0.018 * s;
    j.head[1] = 0.16 * s;
    j.head[2] = 0.035 * c;
    j.leftUpperArm[2] += 0.025 * s;
    j.rightUpperArm[2] -= 0.025 * s;
    pose.root[1] = 0.002 * (1 + s);
  }
  if (id === 'walk' || id === 'run' || id === 'panic') {
    const fast = id !== 'walk';
    const stride = fast ? 0.85 : 0.5;
    j.leftThigh[0] = stride * s;
    j.rightThigh[0] = -stride * s;
    j.leftShin[0] = (fast ? 1.15 : 0.55) * Math.max(0, -s);
    j.rightShin[0] = (fast ? 1.15 : 0.55) * Math.max(0, s);
    j.leftFoot[0] = -0.18 * s;
    j.rightFoot[0] = 0.18 * s;
    j.leftUpperArm[0] = -stride * s;
    j.rightUpperArm[0] = stride * s;
    j.leftForearm[0] = j.rightForearm[0] = fast ? -1.15 : -0.25;
    j.spine[0] = fast ? 0.12 : 0.035;
    j.spine[1] = 0.075 * s;
    // Compensate for the shortened support leg, so feet don't sink below floor.
    pose.root[1] = fast ? 0.018 + 0.035 * Math.abs(c) : -0.018 * Math.abs(s);
    j.head[0] = fast ? -0.08 : 0;
  }
  if (id === 'dance') {
    pose.root[0] = 0.055 * s;
    pose.root[1] = 0.013 * (1 + Math.cos(a * 2));
    j.hips[2] = -0.10 * s;
    j.spine[2] = 0.18 * s;
    j.spine[1] = 0.14 * c;
    j.head[2] = -0.1 * s;
    j.leftUpperArm[2] = 0.8 + 0.35 * s;
    j.rightUpperArm[2] = -0.8 + 0.35 * s;
    j.leftUpperArm[0] = -0.3 - 0.35 * c;
    j.rightUpperArm[0] = -0.3 + 0.35 * c;
    j.leftForearm[0] = -0.9 - 0.45 * c;
    j.rightForearm[0] = -0.9 + 0.45 * c;
    j.leftThigh[2] = 0.07 + 0.14 * s;
    j.rightThigh[2] = -0.07 + 0.14 * s;
    j.leftShin[0] = 0.25 * Math.max(0, s);
    j.rightShin[0] = 0.25 * Math.max(0, -s);
    pose.mouth = 0.22;
  }
  if (id === 'panic') {
    j.leftUpperArm[2] = 2.3 + 0.3 * Math.sin(2 * a);
    j.rightUpperArm[2] = -2.3 + 0.3 * Math.sin(2 * a + 1);
    j.leftUpperArm[0] = j.rightUpperArm[0] = -0.15;
    j.leftForearm[0] = -0.5 + 0.4 * s;
    j.rightForearm[0] = -0.5 - 0.4 * s;
    j.head[1] = 0.3 * s;
    j.head[2] = 0.09 * Math.sin(a * 2);
    pose.mouth = 1;
    pose.worried = 1;
  }
  if (id === 'eat') {
    const bite = envelope(p, 0.08, 0.3, 0.5, 0.75);
    j.rightUpperArm[0] = -0.45 - 0.62 * bite;
    j.rightUpperArm[2] = -0.15 + 0.35 * bite;
    j.rightForearm[0] = -0.8 - 1.25 * bite;
    j.rightHand[0] = 0.2 * bite;
    j.head[0] = 0.10 * bite;
    j.head[1] = -0.1 * bite;
    j.leftUpperArm[2] = 0.22;
    j.leftForearm[0] = -0.45;
    pose.food = 1;
    pose.mouth = bite * (0.15 + 0.25 * (1 + Math.sin(a * 8)));
  }
  if (id === 'wave') {
    const hello = envelope(p, 0, 0.18, 0.78, 1);
    j.rightUpperArm[2] = -0.1 - 2.1 * hello;
    j.rightForearm[2] = -0.35 * hello + 0.35 * Math.sin(a * 3) * hello;
    j.rightForearm[0] = -0.25 * hello;
    j.head[2] = -0.13 * hello;
    j.rightHand[2] = 0.2 * Math.sin(a * 3) * hello;
    pose.mouth = 0.2 * hello;
  }
  if (id === 'cheer') {
    const lift = 0.5 - 0.5 * c;
    j.leftUpperArm[2] = 0.35 + 2.3 * lift;
    j.rightUpperArm[2] = -0.35 - 2.3 * lift;
    j.leftForearm[0] = j.rightForearm[0] = -0.3;
    j.head[0] = -0.13 * lift;
    pose.root[1] = 0.10 * Math.pow(Math.max(0, -c), 2);
    j.leftThigh[2] = 0.12 * lift;
    j.rightThigh[2] = -0.12 * lift;
    pose.mouth = 0.6 * lift;
  }
  return pose;
}

// Snapshot-based transitions also handle interrupted transitions without snapping.
export function blendPoses(from, to, weight, out = createPose()) {
  const t = smooth(weight);
  for (const name of JOINTS) for (let axis = 0; axis < 3; axis++) out.joints[name][axis] = from.joints[name][axis] * (1 - t) + to.joints[name][axis] * t;
  for (let axis = 0; axis < 3; axis++) out.root[axis] = from.root[axis] * (1 - t) + to.root[axis] * t;
  for (const key of POSE_CHANNELS) out[key] = from[key] * (1 - t) + to[key] * t;
  return out;
}
