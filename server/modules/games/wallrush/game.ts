import {
  POSES,
  WALLRUSH_COUNTDOWN_MS,
  WALLRUSH_GAP_MS,
  WALLRUSH_SETUP_MS,
  wallRushLevel,
  wallRushMultiplier,
  wallRushSpeed,
  type PoseDef,
  type WallRushResult,
  type WallRushView,
  type WallRushWall,
} from '../../../../shared/wallrush.ts';
import { HbError, clamp, num } from '../../../core/util.ts';
import type { GameFactory } from '../engine.ts';

/** How long after a wall arrives the TV has to say how the player fit, before it counts as a miss */
const REPORT_MS = 1500;
/** The result screen comes this long after the last wall */
const END_MS = 1800;

/**
 * Wall Rush, solo: the server draws the walls and their timing, the TV films the player (through the
 * phone camera), tracks the body and reports how it fit each hole when the wall arrives.
 */
export const wallRush: GameFactory = (m) => {
  const st = m.settings;
  const player = m.players[0];
  const level = wallRushLevel(st.wallrushLevel);
  const speed = wallRushSpeed(st.wallrushSpeed);
  const count = Math.round(clamp(st.wallrushWalls, 3, 30));
  const maxLives = st.wallrushLives > 0 ? st.wallrushLives : null;

  let step: WallRushView['step'] = 'camera';
  let until: number | null = Date.now() + WALLRUSH_SETUP_MS;
  let walls: WallRushWall[] = [];
  let results: (WallRushResult | null)[] = [];
  let score = 0;
  let combo = 0;
  let best = 0;
  let lives = maxLives;
  let cameraOn = false;

  /** Easy poses first, the stretchy ones towards the end; never the same pose twice in a row */
  const drawPoses = (): PoseDef[] => {
    const out: PoseDef[] = [];
    for (let i = 0; i < count; i++) {
      const top = i < count / 3 ? 1 : i < (count * 2) / 3 ? 2 : 3;
      const pool = POSES.filter((p) => p.level <= top && p.id !== out[i - 1]?.id);
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
  };

  const launch = () => {
    const poses = drawPoses();
    let at = Date.now();
    walls = poses.map((pose, i) => {
      const travelMs = Math.round(speed.firstMs + ((speed.lastMs - speed.firstMs) * i) / Math.max(1, count - 1));
      at += (i ? WALLRUSH_GAP_MS : 0) + travelMs;
      // The first walls are in the middle; later ones may make the player step aside a little
      const x = i < 2 ? 0 : Math.round((Math.random() * 2 - 1) * Math.min(0.22, i * 0.03) * 100) / 100;
      return { pose: pose.id, x, arriveAt: at, travelMs };
    });
    results = walls.map(() => null);
    walls.forEach((w, i) => m.later(w.arriveAt - Date.now() + REPORT_MS, () => judge(i, { seen: false, outside: 1, coverage: 0 })));
  };

  const judge = (i: number, fit: { seen: boolean; outside: number; coverage: number }) => {
    if (step !== 'walls' || results[i] !== null || i < 0 || i >= walls.length) return;
    const pass = fit.seen && fit.outside <= level.outside;
    let points = 0;
    if (pass) {
      combo += 1;
      best = Math.max(best, combo);
      points = (100 + Math.round(fit.coverage * 100)) * wallRushMultiplier(combo - 1);
      score += points;
    } else {
      combo = 0;
      if (lives !== null) lives = Math.max(0, lives - 1);
    }
    results[i] = { ...fit, pass, points };
    // Walls still to come are dropped when the last life goes
    if (lives === 0 || results.every((r) => r !== null)) end();
    m.publish();
  };

  const end = () => {
    if (step === 'done') return;
    step = 'done';
    until = null;
    m.later(END_MS, () => {
      const passed = results.filter((r) => r?.pass).length;
      const played = results.filter((r) => r !== null).length;
      m.finish({
        winners: [],
        scores: { [player.id]: score },
        headline: `${player.name}: ${score} pts`,
        lines: [{ id: player.id, label: `${score} pts`, detail: `${passed} of ${played} walls, best streak ${best}` }],
      });
    });
  };

  return {
    start() {
      // Nobody got in front of the camera in time
      m.later(WALLRUSH_SETUP_MS, () => {
        if (step !== 'camera') return;
        step = 'done';
        m.finish({ winners: [], headline: 'The camera never saw anyone', lines: [{ id: player.id, label: '0 pts', detail: 'No camera' }] });
      });
      m.publish();
    },

    input(playerId, args) {
      // The phone camera sends its video link offer to the TV
      if (args?.rtc?.kind === 'offer' && typeof args.rtc.sdp === 'string') {
        if (args.rtc.sdp.length > 20_000) throw new HbError('This offer is too big');
        m.tv('wallrush:rtc', { kind: 'offer', sdp: args.rtc.sdp, from: playerId });
        return true;
      }
      throw new HbError('Nothing to do now');
    },

    tvInput(args) {
      const a = args?.wallrush;
      if (!a) return;
      if (a.kind === 'answer' && typeof a.sdp === 'string' && a.to === player.id) {
        m.toPlayer(player.id, 'wallrush:rtc', { kind: 'answer', sdp: a.sdp });
      } else if (a.kind === 'hello') {
        // A TV (re)opened the game: the camera phone sends it a new offer
        m.toPlayer(player.id, 'wallrush:rtc', { kind: 'hello' });
      } else if (a.kind === 'camera') {
        cameraOn = !!a.on;
        m.publish();
      } else if (a.kind === 'ready' && step === 'camera') {
        // The player stands in front of the camera, all of them seen: off we go
        step = 'countdown';
        until = Date.now() + WALLRUSH_COUNTDOWN_MS;
        m.publish();
        m.later(WALLRUSH_COUNTDOWN_MS, () => {
          step = 'walls';
          until = null;
          launch();
          m.publish();
        });
      } else if (a.kind === 'fit') {
        judge(Math.round(num(a.wall, -1)), { seen: !!a.seen, outside: clamp(num(a.outside, 1), 0, 1), coverage: clamp(num(a.coverage, 0), 0, 1) });
      }
    },

    view(): WallRushView {
      return { step, until, walls, results, score, combo, lives, maxLives, level: level.id, model: st.wallrushModel, cameraOn };
    },
  };
};
