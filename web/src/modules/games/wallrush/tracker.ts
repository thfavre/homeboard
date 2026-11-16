import { WALLRUSH_FILES_URL, drawPoseShape, wallRushModel, type PoseShape, type WallRushFit, type WallRushModel } from '$shared/wallrush.ts';

// Body tracking on the TV computer: MediaPipe's pose landmarker, run on the graphics card, gives the
// body's joints and its outline (a mask). Its files are the add-on the host downloaded in the admin.

interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}
interface Mask {
  width: number;
  height: number;
  getAsWebGLTexture(): WebGLTexture;
}
interface PoseResult {
  landmarks: Landmark[][];
  segmentationMasks?: Mask[];
}
interface Landmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number, callback: (r: PoseResult) => void): void;
  close(): void;
}

// MediaPipe's landmark numbers
const NOSE = 0;
const SHOULDERS = [11, 12];
const HIPS = [23, 24];
const FEET = [27, 28, 29, 30, 31, 32];

/** One tracked camera picture */
export interface Frame {
  /** Picture size, pixels */
  w: number;
  h: number;
  /** The player's outline: 4 bytes a pixel (w * h * 4), the first one above 127 where the player is */
  mask: Uint8Array | null;
  landmarks: Landmark[] | null;
  at: number;
}

export interface Tracker {
  landmarker: Landmarker;
  /** MediaPipe draws on this WebGL context: the mask is read from it */
  gl: WebGL2RenderingContext;
  fb: WebGLFramebuffer;
}

export async function loadTracker(model: WallRushModel): Promise<Tracker> {
  const vision = await import(/* @vite-ignore */ `${WALLRUSH_FILES_URL}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${WALLRUSH_FILES_URL}/wasm`);
  const canvas = document.createElement('canvas');
  const landmarker: Landmarker = await vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${WALLRUSH_FILES_URL}/${wallRushModel(model).file.path}`, delegate: 'GPU' },
    canvas,
    runningMode: 'VIDEO',
    numPoses: 1,
    outputSegmentationMasks: true,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const gl = canvas.getContext('webgl2')!;
  return { landmarker, gl, fb: gl.createFramebuffer()! };
}

/**
 * Track one picture. The mask stays on the graphics card as an 8 bit texture, and MediaPipe's own
 * read back gives only zeros there (on Windows): it is read here, as bytes, in MediaPipe's context.
 */
export function track(t: Tracker, video: HTMLVideoElement, at: number): Frame {
  const frame: Frame = { w: video.videoWidth, h: video.videoHeight, mask: null, landmarks: null, at };
  t.landmarker.detectForVideo(video, at, (r) => {
    frame.landmarks = r.landmarks[0] ?? null;
    const m = r.segmentationMasks?.[0];
    if (!m || !frame.landmarks) return;
    const { gl } = t;
    const before = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, m.getAsWebGLTexture(), 0);
    const px = new Uint8Array(m.width * m.height * 4);
    gl.readPixels(0, 0, m.width, m.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, before);
    frame.mask = px;
    frame.w = m.width;
    frame.h = m.height;
  });
  return frame;
}

/** The mask says the player is at this pixel */
const isBody = (mask: Uint8Array, i: number) => mask[i * 4] > 127;

// ------------------------------------------------------------------ the world grid

/** The part of the world the game looks at, and its resolution (cells per world unit) */
export const GRID = { x0: -1.2, x1: 1.2, y0: -0.04, y1: 1.32, res: 140 };
export const GW = Math.round((GRID.x1 - GRID.x0) * GRID.res);
export const GH = Math.round((GRID.y1 - GRID.y0) * GRID.res);

/** A shape cut in the grid: 1 inside the hole */
export function holeGrid(shape: PoseShape, margin: number): Uint8Array {
  const c = new OffscreenCanvas(GW, GH);
  const g = c.getContext('2d')!;
  g.fillStyle = g.strokeStyle = '#fff';
  drawPoseShape(g as unknown as CanvasRenderingContext2D, shape, margin, (p) => ({ x: (p.x - GRID.x0) * GRID.res, y: (GRID.y1 - p.y) * GRID.res }), GRID.res);
  const px = g.getImageData(0, 0, GW, GH).data;
  const out = new Uint8Array(GW * GH);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  return out;
}

const seen = (l: Landmark | undefined, min = 0.5) => !!l && (l.visibility ?? 1) >= min;
const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The player's size and place in the picture, so their body can be laid on the world grid whatever
 * the distance to the camera. Their standing height is measured once (calibration); after that it
 * follows the length of their torso, which stays the same whatever pose they take.
 */
export class Body {
  /** Torso length over standing height, from the calibration */
  ratio: number | null = null;
  /** Standing height and floor line in the picture, pixels (smoothed) */
  heightPx = 0;
  floorPx = 0;
  /** The grid: 1 where the player is */
  readonly cells = new Uint8Array(GW * GH);
  /** When the player was last seen (0: never) */
  seenAt = 0;
  /** Calibration: standing heights measured lately, to know the player stands still */
  private samples: { at: number; h: number }[] = [];

  /** What stops the calibration now ('' when the player is seen whole) */
  static problem(f: Frame): string {
    const l = f.landmarks;
    if (!l || !f.mask) return 'Step in front of the camera';
    if (!seen(l[NOSE]) || l[NOSE].y < 0.04) return 'Your head is out of the picture: step back';
    const feet = [l[27], l[28]];
    if (!feet.every((a) => seen(a, 0.4)) || feet.some((a) => a.y > 0.97)) return 'Your feet are out of the picture: step back';
    return '';
  }

  /** Measure the standing player. True when they stood still long enough */
  calibrate(f: Frame): boolean {
    if (Body.problem(f)) {
      this.samples = [];
      return false;
    }
    const l = f.landmarks!;
    const floor = this.footLine(f)!;
    const top = this.headTop(f);
    const height = floor - top;
    const torso = this.torsoPx(f);
    if (height < f.h * 0.25 || !torso) return false;
    this.samples = [...this.samples.filter((s) => f.at - s.at < 1500), { at: f.at, h: height }];
    const hs = this.samples.map((s) => s.h);
    const steady = this.samples.length >= 12 && f.at - this.samples[0].at > 1200 && Math.max(...hs) - Math.min(...hs) < height * 0.05;
    // Upright: shoulders above the hips, not leaning
    const s = mid(l[SHOULDERS[0]], l[SHOULDERS[1]]);
    const hp = mid(l[HIPS[0]], l[HIPS[1]]);
    const upright = Math.abs((s.x - hp.x) * f.w) < Math.abs((s.y - hp.y) * f.h) * 0.2;
    if (!steady || !upright) return false;
    this.ratio = torso / height;
    this.heightPx = height;
    this.floorPx = floor;
    return true;
  }

  private torsoPx(f: Frame): number {
    const l = f.landmarks!;
    if (![...SHOULDERS, ...HIPS].every((i) => seen(l[i], 0.4))) return 0;
    const s = mid(l[SHOULDERS[0]], l[SHOULDERS[1]]);
    const h = mid(l[HIPS[0]], l[HIPS[1]]);
    return Math.hypot((s.x - h.x) * f.w, (s.y - h.y) * f.h);
  }

  /** Lowest foot point seen, pixels (the foot on the floor when the other is raised) */
  private footLine(f: Frame): number | null {
    const ys = FEET.map((i) => f.landmarks![i]).filter((a) => seen(a, 0.3)).map((a) => a.y * f.h);
    return ys.length ? Math.max(...ys) : null;
  }

  /**
   * Top of the head: the highest point of the body outline in a band around the head (the nose can
   * be on the edge of the outline when the player looks aside, so the band is as wide as the shoulders)
   */
  private headTop(f: Frame): number {
    const l = f.landmarks!;
    const n = l[NOSE];
    const half = Math.max(8, Math.abs(l[SHOULDERS[0]].x - l[SHOULDERS[1]].x) * f.w * 0.45);
    const x0 = Math.max(0, Math.round(n.x * f.w - half));
    const x1 = Math.min(f.w - 1, Math.round(n.x * f.w + half));
    const ny = Math.round(n.y * f.h);
    for (let y = 0; y < ny; y++) {
      const row = y * f.w;
      for (let x = x0; x <= x1; x += 2) if (isBody(f.mask!, row + x)) return y;
    }
    return ny;
  }

  /** Lay the player of this picture on the grid. False when nobody is seen */
  update(f: Frame): boolean {
    if (!this.ratio || !f.mask || !f.landmarks) return false;
    const torso = this.torsoPx(f);
    const floor = this.footLine(f);
    if (torso) this.heightPx += (torso / this.ratio - this.heightPx) * 0.25;
    if (floor !== null) this.floorPx += (floor - this.floorPx) * 0.3;
    const { w, h, mask } = f;
    const cols = new Int32Array(GW);
    for (let i = 0; i < GW; i++) {
      const wx = GRID.x0 + (i + 0.5) / GRID.res;
      // As in a mirror: the player's right is on the right of the screen
      cols[i] = Math.round(w / 2 - wx * this.heightPx);
    }
    let any = 0;
    for (let j = 0; j < GH; j++) {
      const wy = GRID.y1 - (j + 0.5) / GRID.res;
      const y = Math.round(this.floorPx - wy * this.heightPx);
      const row = j * GW;
      if (y < 0 || y >= h) {
        this.cells.fill(0, row, row + GW);
        continue;
      }
      for (let i = 0; i < GW; i++) {
        const x = cols[i];
        const on = x >= 0 && x < w && isBody(mask, y * w + x) ? 1 : 0;
        this.cells[row + i] = on;
        any += on;
      }
    }
    if (any > 40) this.seenAt = f.at;
    return any > 40;
  }

  /** How the player fits a hole right now */
  fit(hole: Uint8Array, now: number): WallRushFit {
    let body = 0;
    let inside = 0;
    let area = 0;
    for (let i = 0; i < hole.length; i++) {
      area += hole[i];
      if (!this.cells[i]) continue;
      body += 1;
      inside += hole[i];
    }
    const visible = now - this.seenAt < 500 && body > 40;
    return { seen: visible, outside: visible ? (body - inside) / body : 1, coverage: area ? inside / area : 0 };
  }
}
