import {
  MOVES,
  POSES,
  WALLRUSH_COUNTDOWN_MS,
  WALLRUSH_GAP_MS,
  WALLRUSH_POINTS,
  WALLRUSH_SETUP_MS,
  wallRushGrade,
  wallRushLevel,
  wallRushMultiplier,
  wallRushSpeed,
  type PoseDef,
  type WallRushGrade,
  type WallRushMusic,
  type WallRushResult,
  type WallRushView,
  type WallRushWall,
} from '../../../../shared/wallrush.ts';
import { HbError, clamp, num } from '../../../core/util.ts';
import type { GameFactory } from '../engine.ts';

/** How long after a wall arrives the TV has to say how the player fit, before it counts as a miss */
const REPORT_MS = 1500;
/** The result screen comes this long after the last wall */
const END_MS = 2200;
/** The music plays this long before the first wall arrives, and fades this long after the last */
const MUSIC_LEAD_MS = 600;
const MUSIC_TAIL_MS = 2500;

/**
 * Wall Rush, solo: the server draws the walls and their timing (on the beat of a song when there is
 * one), the TV films the player through the phone camera, tracks the body and reports how it fit
 * each hole when the wall arrives.
 */
export const wallRush: GameFactory = (m) => {
  const st = m.settings;
  const player = m.players[0];
  const level = wallRushLevel(st.wallrushLevel);
  const speed = wallRushSpeed(st.wallrushSpeed);
  const count = Math.round(clamp(st.wallrushWalls, 3, 30));
  const maxLives = st.wallrushLives > 0 ? st.wallrushLives : null;
  const song = m.song;

  let step: WallRushView['step'] = 'camera';
  let until: number | null = Date.now() + WALLRUSH_SETUP_MS;
  let walls: WallRushWall[] = [];
  let results: (WallRushResult | null)[] = [];
  let music: WallRushMusic | null = null;
  let score = 0;
  let combo = 0;
  let best = 0;
  let lives = maxLives;
  let cameraOn = false;
  const grades: Record<WallRushGrade, number> = { perfect: 0, great: 0, good: 0, hit: 0 };

  /**
   * Easy poses first, the stretchy ones towards the end, never the same twice in a row; every
   * third or fourth wall is a quick move (duck, step aside) to get the player moving.
   */
  const drawPoses = (): PoseDef[] => {
    const out: PoseDef[] = [];
    let sinceMove = 0;
    for (let i = 0; i < count; i++) {
      const prev = out[i - 1]?.id;
      if (i >= 2 && sinceMove >= 2 && Math.random() < (sinceMove >= 3 ? 1 : 0.4)) {
        const pool = MOVES.filter((p) => p.id !== prev);
        out.push(pool[Math.floor(Math.random() * pool.length)]);
        sinceMove = 0;
        continue;
      }
      const top = i < count / 3 ? 1 : i < (count * 2) / 3 ? 2 : 3;
      const pool = POSES.filter((p) => p.level <= top && p.id !== prev);
      out.push(pool[Math.floor(Math.random() * pool.length)]);
      sinceMove += 1;
    }
    return out;
  };

  const launch = () => {
    const poses = drawPoses();
    const now = Date.now();
    const travel = (i: number) => Math.round(speed.firstMs + ((speed.lastMs - speed.firstMs) * i) / Math.max(1, count - 1));
    // When each wall reaches the player: spaced by their travel time (the next one sets off while the
    // last is still coming), at least the gap apart; on the beat with music
    const arrivals: number[] = [];
    if (song) {
      const beat = 60_000 / song.bpm;
      // Two beats per step at a fast tempo, one at a slow one: about 0.5 to 1 s
      const unit = beat < 450 ? beat * 2 : beat;
      // From the song's best part, early enough for the walls to fit before it ends
      const needMs = MUSIC_LEAD_MS + travel(0) + count * Math.max(WALLRUSH_GAP_MS, travel(0) * 0.7) + MUSIC_TAIL_MS;
      const lengthMs = (song.durationSec ?? 0) * 1000;
      const fromMs = Math.max(0, lengthMs ? Math.min(song.previewMs, lengthMs - needMs) : song.previewMs);
      const at = now + 400;
      // Server time of the song's start (its beats count from there)
      const zero = at - fromMs;
      const onBeat = (t: number) => zero + Math.ceil((t - zero) / unit - 0.001) * unit;
      let t = onBeat(at + MUSIC_LEAD_MS + travel(0));
      for (let i = 0; i < count; i++) {
        if (i) t = onBeat(t + Math.max(WALLRUSH_GAP_MS, travel(i) * 0.7));
        arrivals.push(Math.round(t));
      }
      music = { url: song.url, title: song.title, artist: song.artist, bpm: song.bpm, at, fromMs, untilAt: arrivals[count - 1] + MUSIC_TAIL_MS };
    } else {
      let t = now + travel(0);
      for (let i = 0; i < count; i++) {
        if (i) t += Math.max(WALLRUSH_GAP_MS, travel(i) * 0.7);
        arrivals.push(t);
      }
    }
    walls = poses.map((pose, i) => {
      // The first walls are in the middle; later ones may make the player step aside a little
      const x = pose.rects || i < 2 ? 0 : Math.round((Math.random() * 2 - 1) * Math.min(0.2, i * 0.03) * 100) / 100;
      return { pose: pose.id, x, arriveAt: arrivals[i], travelMs: travel(i) };
    });
    results = walls.map(() => null);
    walls.forEach((w, i) => m.later(w.arriveAt - Date.now() + REPORT_MS, () => judge(i, { seen: false, outside: 1, coverage: 0 })));
  };

  const judge = (i: number, fit: { seen: boolean; outside: number; coverage: number }) => {
    if (step !== 'walls' || results[i] !== null || i < 0 || i >= walls.length) return;
    const grade = wallRushGrade(fit, level.outside);
    const pass = grade !== 'hit';
    let points = 0;
    grades[grade] += 1;
    if (pass) {
      combo += 1;
      best = Math.max(best, combo);
      points = (WALLRUSH_POINTS[grade] + Math.round(fit.coverage * 50)) * wallRushMultiplier(combo - 1);
      score += points;
    } else {
      combo = 0;
      if (lives !== null) lives = Math.max(0, lives - 1);
    }
    results[i] = { ...fit, pass, grade, points };
    // Walls still to come are dropped when the last life goes
    if (lives === 0 || results.every((r) => r !== null)) end();
    m.publish();
  };

  const end = () => {
    if (step === 'done') return;
    step = 'done';
    until = null;
    // The music fades out now, not at the planned end
    if (music) music = { ...music, untilAt: Math.min(music.untilAt, Date.now() + 1500) };
    m.later(END_MS, () => {
      const played = results.filter((r) => r !== null).length;
      const parts = [grades.perfect && `${grades.perfect} perfect`, grades.great && `${grades.great} great`, grades.good && `${grades.good} good`, grades.hit && `${grades.hit} hit`].filter(Boolean);
      m.finish({
        winners: [],
        scores: { [player.id]: score },
        headline: `${player.name}: ${score} pts`,
        lines: [{ id: player.id, label: `${score} pts`, detail: `${played} walls: ${parts.join(', ') || 'none'}. Best streak ${best}` }],
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
      return { step, until, walls, results, score, combo, lives, maxLives, level: level.id, model: st.wallrushModel, cameraOn, music, audioOffset: st.rhythmAudioOffset };
    },
  };
};
