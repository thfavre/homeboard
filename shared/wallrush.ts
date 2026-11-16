// Wall Rush: a glowing wall with a body shaped hole rushes at the player, filmed by a phone. The TV
// tracks the body (MediaPipe on the TV computer's graphics card) and checks it fits the hole.
//
// World units: 1 = the player's standing height. x = 0 is the middle of the camera picture,
// y = 0 the floor, y goes up. Everything is seen as in a mirror (the player's right hand is on the right).

export type WallRushLevel = 'easy' | 'normal' | 'hard';
export type WallRushSpeed = 'chill' | 'normal' | 'fast';
export type WallRushModel = 'lite' | 'full' | 'heavy';

export const WALLRUSH_LEVELS: { id: WallRushLevel; name: string; help: string; margin: number; outside: number }[] = [
  // margin: room around every limb of the hole (world units). outside: share of the body allowed out of it
  { id: 'easy', name: 'Easy', help: 'Wide holes, a hand out still passes', margin: 0.05, outside: 0.12 },
  { id: 'normal', name: 'Normal', help: 'The hole is a bit bigger than the body', margin: 0.035, outside: 0.08 },
  { id: 'hard', name: 'Hard', help: 'Tight holes, the pose has to be right', margin: 0.022, outside: 0.05 },
];
export const wallRushLevel = (id: string) => WALLRUSH_LEVELS.find((l) => l.id === id) ?? WALLRUSH_LEVELS[1];

/** Time a wall takes to reach the player: the first wall, then the last one (they speed up in between) */
export const WALLRUSH_SPEEDS: { id: WallRushSpeed; name: string; firstMs: number; lastMs: number }[] = [
  { id: 'chill', name: 'Chill', firstMs: 6500, lastMs: 4500 },
  { id: 'normal', name: 'Normal', firstMs: 5500, lastMs: 3200 },
  { id: 'fast', name: 'Fast', firstMs: 4200, lastMs: 2400 },
];
export const wallRushSpeed = (id: string) => WALLRUSH_SPEEDS.find((s) => s.id === id) ?? WALLRUSH_SPEEDS[1];

/** Pause between a wall reaching the player and the next one setting off (the result shows meanwhile) */
export const WALLRUSH_GAP_MS = 1100;
/** "3, 2, 1" before the first wall */
export const WALLRUSH_COUNTDOWN_MS = 3000;
/** Longest the player has to set the camera up and stand in front of it */
export const WALLRUSH_SETUP_MS = 180_000;

// ------------------------------------------------------------------ add-on files

/**
 * The tracking engine is not part of Homeboard: the host downloads it from the admin (a Raspberry Pi
 * install never needs it). Pinned versions, checked with their SHA-256.
 */
export const WALLRUSH_MEDIAPIPE = '0.10.21';
const NPM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WALLRUSH_MEDIAPIPE}`;
const MODELS = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

export interface AddonFile {
  /** Path in the add-on folder */
  path: string;
  url: string;
  sha256: string;
  bytes: number;
}

export const WALLRUSH_ENGINE: AddonFile[] = [
  { path: 'vision_bundle.mjs', url: `${NPM}/vision_bundle.mjs`, sha256: '40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c', bytes: 137_735 },
  { path: 'wasm/vision_wasm_internal.js', url: `${NPM}/wasm/vision_wasm_internal.js`, sha256: '4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb', bytes: 204_284 },
  { path: 'wasm/vision_wasm_internal.wasm', url: `${NPM}/wasm/vision_wasm_internal.wasm`, sha256: 'f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7', bytes: 9_574_032 },
];

export const WALLRUSH_MODELS: { id: WallRushModel; name: string; help: string; file: AddonFile }[] = [
  {
    id: 'lite',
    name: 'Lite',
    help: 'Fastest, less precise. For a small graphics card',
    file: { path: 'pose_lite.task', url: `${MODELS}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a', bytes: 5_777_746 },
  },
  {
    id: 'full',
    name: 'Full',
    help: 'Good balance of speed and precision',
    file: { path: 'pose_full.task', url: `${MODELS}/pose_landmarker_full/float16/1/pose_landmarker_full.task`, sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1', bytes: 9_398_198 },
  },
  {
    id: 'heavy',
    name: 'Heavy',
    help: 'Most precise, needs a strong graphics card',
    file: { path: 'pose_heavy.task', url: `${MODELS}/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`, sha256: '64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b', bytes: 30_664_242 },
  },
];
export const wallRushModel = (id: string) => WALLRUSH_MODELS.find((m) => m.id === id) ?? WALLRUSH_MODELS[1];
export const wallRushBytes = (model: WallRushModel) => WALLRUSH_ENGINE.reduce((s, f) => s + f.bytes, 0) + wallRushModel(model).file.bytes;

/** Where the TV loads the add-on from (served by the games module) */
export const WALLRUSH_FILES_URL = '/api/m/games/wallrush';

export interface AddonStatus {
  /** Models downloaded (with the engine). Empty: not installed */
  models: WallRushModel[];
  /** Downloading now: 0 to 1 */
  progress: number | null;
  error: string;
  /** Size on disk, bytes */
  bytes: number;
}

// ------------------------------------------------------------------ poses

/**
 * A pose, drawn by angles (degrees, 0 = to the right, 90 = up, -90 = down) so the body keeps its
 * proportions. `l` is the limb on the left of the screen. The figure is set on the floor by its
 * lowest foot, so a raised leg really leaves the ground.
 */
export interface PoseDef {
  id: string;
  name: string;
  /** 1 (anyone) to 3 (stretchy) */
  level: 1 | 2 | 3;
  /** Torso, from the hips to the neck (90: upright) */
  torso?: number;
  arms: { l: [number, number]; r: [number, number] };
  legs: { l: [number, number]; r: [number, number] };
}

const DOWN = -90;
export const POSES: PoseDef[] = [
  { id: 'star', name: 'Star', level: 1, arms: { l: [150, 150], r: [30, 30] }, legs: { l: [-112, -112], r: [-68, -68] } },
  { id: 'up', name: 'Touchdown', level: 1, arms: { l: [98, 95], r: [82, 85] }, legs: { l: [-93, DOWN], r: [-87, DOWN] } },
  { id: 't', name: 'Airplane', level: 1, arms: { l: [180, 180], r: [0, 0] }, legs: { l: [-94, -92], r: [-86, -88] } },
  { id: 'goal', name: 'Goalpost', level: 1, arms: { l: [180, 90], r: [0, 90] }, legs: { l: [-100, -100], r: [-80, -80] } },
  { id: 'disco', name: 'Disco', level: 1, arms: { l: [-135, -135], r: [50, 50] }, legs: { l: [-97, -95], r: [-83, -85] } },
  { id: 'wide', name: 'Big Y', level: 2, arms: { l: [130, 130], r: [50, 50] }, legs: { l: [-122, -122], r: [-58, -58] } },
  { id: 'wave', name: 'Hello', level: 2, arms: { l: [-100, -95], r: [0, 90] }, legs: { l: [-95, DOWN], r: [-85, DOWN] } },
  { id: 'lean', name: 'Side Bend', level: 2, torso: 104, arms: { l: [-105, -100], r: [115, 160] }, legs: { l: [-100, -97], r: [-80, -83] } },
  { id: 'squat', name: 'Sumo', level: 2, arms: { l: [180, 180], r: [0, 0] }, legs: { l: [-150, -95], r: [-30, -85] } },
  { id: 'tree', name: 'Tree', level: 3, arms: { l: [100, 80], r: [80, 100] }, legs: { l: [-92, DOWN], r: [-25, -160] } },
  { id: 'lowy', name: 'Low Y', level: 3, arms: { l: [120, 120], r: [60, 60] }, legs: { l: [-152, -98], r: [-28, -82] } },
  { id: 'kick', name: 'Karate', level: 3, torso: 98, arms: { l: [170, 120], r: [10, 60] }, legs: { l: [-98, DOWN], r: [-10, -15] } },
];
export const poseDef = (id: string) => POSES.find((p) => p.id === id) ?? POSES[0];

export interface Point {
  x: number;
  y: number;
}
/** A pose as segments with a thickness, plus the head: what the hole is cut from */
export interface PoseShape {
  head: Point & { r: number };
  torso: Point[];
  limbs: { a: Point; b: Point; w: number }[];
  /** Lowest and highest points, to size the wall */
  top: number;
}

// Body proportions, in standing heights
const TORSO = 0.31;
const NECK = 0.075;
const HEAD_R = 0.068;
const SHOULDER = 0.112;
const HIP = 0.062;
const UPPER_ARM = 0.165;
const FOREARM = 0.15;
const HAND = 0.07;
const THIGH = 0.245;
const SHIN = 0.255;
/** Ankle height when standing */
const ANKLE = 0.035;

const dir = (deg: number): Point => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
const add = (p: Point, d: Point, len: number): Point => ({ x: p.x + d.x * len, y: p.y + d.y * len });

/** The pose's shape, standing on the floor, its middle at x (world units) */
export function poseShape(pose: PoseDef, x = 0): PoseShape {
  const t = dir(pose.torso ?? 90);
  // Across the body (to the right of the screen when upright)
  const side: Point = { x: t.y, y: -t.x };
  const hip: Point = { x: 0, y: 0 };
  const neck = add(hip, t, TORSO);
  const head = add(neck, t, NECK + HEAD_R * 0.85);
  const shoulderL = add(add(neck, t, -0.03), side, -SHOULDER);
  const shoulderR = add(add(neck, t, -0.03), side, SHOULDER);
  const hipL = add(hip, side, -HIP);
  const hipR = add(hip, side, HIP);

  const limbs: PoseShape['limbs'] = [{ a: neck, b: add(neck, t, NECK), w: 0.07 }];
  const arm = (from: Point, [up, fore]: [number, number]) => {
    const elbow = add(from, dir(up), UPPER_ARM);
    const wrist = add(elbow, dir(fore), FOREARM);
    limbs.push({ a: from, b: elbow, w: 0.085 }, { a: elbow, b: wrist, w: 0.07 }, { a: wrist, b: add(wrist, dir(fore), HAND), w: 0.075 });
  };
  const feet: Point[] = [];
  const leg = (from: Point, [up, low]: [number, number]) => {
    const knee = add(from, dir(up), THIGH);
    const ankle = add(knee, dir(low), SHIN);
    limbs.push({ a: from, b: knee, w: 0.125 }, { a: knee, b: ankle, w: 0.095 });
    // The foot, seen from the front: a short wide bit under the ankle
    limbs.push({ a: ankle, b: { x: ankle.x, y: ankle.y - ANKLE * 0.6 }, w: 0.1 });
    feet.push(ankle);
  };
  arm(shoulderL, pose.arms.l);
  arm(shoulderR, pose.arms.r);
  leg(hipL, pose.legs.l);
  leg(hipR, pose.legs.r);

  // Set it on the floor by its lowest foot, and in its place across the wall
  const lift = ANKLE - Math.min(...feet.map((f) => f.y));
  const move = (p: Point): Point => ({ x: p.x + x, y: p.y + lift });
  const shape: PoseShape = {
    head: { ...move(head), r: HEAD_R },
    torso: [shoulderL, shoulderR, hipR, hipL].map(move),
    limbs: limbs.map((l) => ({ a: move(l.a), b: move(l.b), w: l.w })),
    top: 0,
  };
  shape.top = Math.max(shape.head.y + HEAD_R, ...shape.limbs.flatMap((l) => [l.a.y, l.b.y]));
  return shape;
}

/**
 * Draw the shape filled on a 2D canvas, `grow` world units bigger all around. `map` turns world
 * units into canvas pixels (scale: pixels per world unit).
 */
export function drawPoseShape(g: CanvasRenderingContext2D, shape: PoseShape, grow: number, map: (p: Point) => Point, scale: number): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  const torso = shape.torso.map(map);
  torso.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
  g.lineWidth = grow * 2 * scale + 0.02 * scale;
  g.stroke();
  for (const l of shape.limbs) {
    const a = map(l.a);
    const b = map(l.b);
    g.lineWidth = (l.w + grow * 2) * scale;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  const h = map(shape.head);
  g.beginPath();
  g.arc(h.x, h.y, (shape.head.r + grow) * scale, 0, Math.PI * 2);
  g.fill();
}

// ------------------------------------------------------------------ the game

export interface WallRushWall {
  pose: string;
  /** Where the hole is across the wall (world units, 0 = middle) */
  x: number;
  /** Server time it reaches the player */
  arriveAt: number;
  travelMs: number;
}

export interface WallRushFit {
  /** The TV saw a body when the wall arrived */
  seen: boolean;
  /** Share of the body out of the hole (0 to 1) */
  outside: number;
  /** Share of the hole the body fills (0 to 1) */
  coverage: number;
}

export interface WallRushResult extends WallRushFit {
  pass: boolean;
  points: number;
}

export interface WallRushView {
  /** camera: waiting for the phone camera and the player in front of it */
  step: 'camera' | 'countdown' | 'walls' | 'done';
  /** Countdown: when the first wall sets off. Camera: when the setup gives up */
  until: number | null;
  walls: WallRushWall[];
  results: (WallRushResult | null)[];
  score: number;
  combo: number;
  /** Lives left (null: unlimited) */
  lives: number | null;
  maxLives: number | null;
  level: WallRushLevel;
  model: WallRushModel;
  /** The TV said the camera picture arrives */
  cameraOn: boolean;
}

/** Points multiplier for a streak of walls passed */
export const wallRushMultiplier = (combo: number) => Math.min(4, 1 + Math.floor(combo / 3));

/** The TV and the camera phone set up their video link through these (WebRTC offer and answer; hello: a TV asks for an offer) */
export interface WallRushSignal {
  kind: 'offer' | 'answer' | 'hello';
  sdp?: string;
  /** Offer: the phone's id (the TV answers it) */
  from?: string;
}
