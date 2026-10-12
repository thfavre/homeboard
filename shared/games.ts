// Mini games: 1 vs 1 duels with a stake, room games that anyone can join, or solo games.

import type { PartyMiniId, PartyOptions } from './party.ts';

export type GameId = 'timer' | 'simon' | 'reflex' | 'circle' | 'bluff' | 'coin' | 'rhythm' | 'pirates' | 'party';
export type GameMode = 'duel' | 'room' | 'solo';

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  /** Shown on the TV and the phones before the game starts */
  rules: string;
  modes: GameMode[];
  /** Uses the WLED lights (also shown on the TV) */
  lights?: boolean;
  /** Played on a light only: no full screen on the TV, just a small card above the main widget */
  lightOnly?: boolean;
  /** Played on the phones: no full screen on the TV, just a small card and the big moment (Coin Flip: the throw) */
  phoneOnly?: boolean;
  /** Has its own sound: the Spotify music is paused while it is played, and resumed after */
  pausesMusic?: boolean;
  /** How to play in 3 short steps, for the phones */
  steps: string[];
  /** Two colors of the game's gradient */
  colors: [string, string];
  /** Most players a room game takes (no limit when unset) */
  maxPlayers?: number;
}

export const GAMES: GameInfo[] = [
  {
    id: 'timer',
    name: 'Blind Timer',
    tagline: 'Stop the clock at the target time, without seeing it',
    rules: 'A target time between 8 and 30 seconds is drawn. The timer starts on GO and is hidden: tap STOP when you think the target time has passed. The closest wins the round; the most rounds won wins the game (a tie goes to the smallest total gap).',
    modes: ['duel', 'room'],
    steps: ['A target between 8 and 30 seconds is drawn', 'GO: the clock starts and stays hidden. Tap STOP when you feel it', 'Closest wins the round. Most rounds won wins the game'],
    colors: ['#ff5f6d', '#ffa64d'],
  },
  {
    id: 'simon',
    name: 'Light Simon',
    tagline: 'Repeat the color sequence of the lights',
    rules: 'Watch the lights, then tap the same colors in the same order. One more color every round. One mistake and you are out.',
    modes: ['duel', 'room'],
    lights: true,
    steps: ['Watch the colors the lights play', 'Tap them back in the same order', 'One more each round. One slip and you are out'],
    colors: ['#8b7cff', '#3d8bff'],
  },
  {
    id: 'reflex',
    name: 'Color Reflex',
    tagline: 'Tap the color of the lights before anyone else',
    rules: 'When the lights change color, tap that color on your phone as fast as you can. Your times add up over the rounds and stay secret until the end. Too early, wrong color or no tap: a 3 second penalty. Lowest total wins.',
    modes: ['duel', 'room'],
    lights: true,
    steps: ['The lights go dark... then change color', 'Tap that color as fast as you can', 'Times revealed at the end: lowest total wins'],
    colors: ['#ffd23d', '#ff6a3d'],
  },
  {
    id: 'circle',
    name: 'Perfect Circle',
    tagline: 'Draw the roundest circle in one stroke',
    rules: 'Draw your circles with one finger, one stroke each, within one minute: each is sent when you lift your finger. The rounder, the higher the score. The TV reveals them all and the best total wins.',
    modes: ['duel', 'room'],
    steps: ['You have one minute to draw your circles, one stroke each', 'Each circle is sent when you lift your finger', 'The TV reveals them all: the best total wins'],
    colors: ['#2fd2c4', '#3d8bff'],
  },
  {
    id: 'bluff',
    name: 'Bluff',
    tagline: 'Share or steal the pot',
    rules: 'You both put the same bet in the pot, then choose in secret: share or steal. The house adds a bonus for each of you to the pot. Both share: each gets half (their bet back plus a bonus). One steals: the thief takes the whole pot, both bonuses included, the other gets nothing. Both steal: nobody gets anything.',
    modes: ['duel'],
    phoneOnly: true,
    steps: ['Talk it over, then choose in secret: share or steal', 'Both share: your bet back, plus a bonus', 'One steals: takes it all, twice as much. Both steal: nobody wins'],
    colors: ['#ff3b8d', '#8b3dff'],
  },
  {
    id: 'coin',
    name: 'Coin Flip',
    tagline: 'Your face on one side, theirs on the other',
    rules: 'Each player has their face on one side of the coin. One of you is picked at random to throw it: swipe it up from your phone and it flies on the TV. The face it lands on takes the whole pot.',
    modes: ['duel'],
    phoneOnly: true,
    steps: ['Your face is on one side of the coin, theirs on the other', 'One of you is picked to swipe the coin up to the TV', 'The face it lands on takes the whole pot'],
    colors: ['#ffc861', '#ff8a3a'],
  },
  {
    id: 'rhythm',
    name: 'Rhythm Rain',
    tagline: 'Hit the notes when they reach the top of the light',
    rules: 'Colored notes climb the light strip from the bottom. Tap the same color on your phone when a note crosses the zone near the top: green is perfect, orange is good, red is just in time. Hits in a row raise your multiplier, a missed note resets it, and a tap with no note of that color in the zone costs points: mashing every key does not pay. In a duel, the highest score wins.',
    modes: ['duel', 'solo'],
    lights: true,
    lightOnly: true,
    pausesMusic: true,
    steps: ['Notes climb the light strip from the bottom', 'Tap their color when they cross the zone at the top', 'Green is perfect. Keep the streak going for x4'],
    colors: ['#3dff9b', '#8b3dff'],
  },
  {
    id: 'pirates',
    name: 'Pirate Race',
    tagline: 'Row in time with the drum, first ship to the treasure wins',
    rules: 'The players are split into pirate crews, one ship each: your phone shows your ship color. A drum beats the rhythm on the TV, sometimes speeding up or slowing down little by little. Tap ROW exactly on each beat: the closer to the beat, the stronger the stroke. A ship moves with the average stroke of its crew, so a small crew is as fast as a big one. When the whole crew (or nearly) rows on the beat, the stroke is synchronized and goes further; 5 synchronized strokes in a row start a speed boost, which lasts as long as the crew stays in sync. Tapping off the beat splashes and wastes the stroke. The first ship to reach the treasure wins, and its crew shares the pot.',
    modes: ['room', 'duel'],
    lights: true,
    pausesMusic: true,
    steps: ['Find your crew: your phone shows your ship color', 'Tap ROW on every beat of the drum, all together', '5 synchronized strokes in a row: speed boost, as long as you stay in sync!'],
    colors: ['#2fb4ff', '#c98a2b'],
  },
  {
    id: 'party',
    name: 'Light Party',
    tagline: 'A few quick mini games on the light strip',
    rules: 'A few mini games drawn at random, played one after the other on the light strip: count the colors, remember a tower of blocks, make a color again... Each one starts with its rules: press Got it when you have read them. Every mini game gives points by place (5 for the best, 3, 2, then 1 for everyone who played). The most points at the end wins.',
    modes: ['room', 'duel'],
    lights: true,
    steps: ['A few mini games on the light strip, drawn at random', 'Each one starts with its rules: press Got it', 'Points for each place. Most points at the end wins'],
    colors: ['#ff5fc8', '#3d8bff'],
  },
];

export const gameInfo = (id: string) => GAMES.find((g) => g.id === id);
/** Played on a light or the phones: a small card at the top of the TV, so several can be played at once */
export const isCardGame = (id: string) => !!(gameInfo(id)?.lightOnly || gameInfo(id)?.phoneOnly);

/** Colors used by Light Simon and Color Reflex. `led` is what the WLED lights show. */
export const GAME_COLORS = [
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0000' },
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff00' },
  { id: 'blue', name: 'Blue', hex: '#3d8bff', led: '#0000ff' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23d', led: '#ffb000' },
] as const;
export type GameColor = (typeof GAME_COLORS)[number]['id'];

/** Blind Timer target: a whole number of seconds drawn for each game */
export const BLIND_TARGET_SEC = { min: 8, max: 30 };

export interface GamePlayer {
  id: string;
  name: string;
  color: string;
}

/** Time the challenged guest has to answer */
export const DUEL_INVITE_MS = 60_000;

export interface DuelInvite {
  id: string;
  game: GameId;
  from: GamePlayer;
  to: GamePlayer;
  stake: number;
  expiresAt: number;
  /** Rhythm Rain: number of colors (keys) and difficulty */
  colors?: number;
  chart?: RhythmDifficulty;
  /** Rhythm Rain played on one of the host's songs (costs the music price) */
  song?: { key: string; title: string; artist: string };
  /** Bluff: what each player can win */
  bluff?: BluffDeal;
}

export type MatchPhase = 'lobby' | 'intro' | 'play' | 'result';

export interface MatchResultLine {
  id: string;
  /** Main figure, e.g. "10.04 s" or "92.3 %" */
  label: string;
  /** Smaller text under it */
  detail?: string;
}

export interface MatchResult {
  /** Winners in order. Several = tie (the pot is split) */
  winners: string[];
  /** Every player, best first */
  lines: MatchResultLine[];
  /** Money won by each player (pot share and rewards), by guest id */
  payouts: Record<string, number>;
  headline: string;
}

export interface MatchState {
  id: string;
  game: GameId;
  mode: GameMode;
  /** Who started it (null: the host) */
  starter: GamePlayer | null;
  players: GamePlayer[];
  stake: number;
  pot: number;
  /** Paid by the house to the winner of a room game, on top of the pot (split on a tie) */
  prize: number;
  phase: MatchPhase;
  endsAt: number | null;
  phaseMs: number;
  /** Game specific, see the *View types below */
  view: unknown;
  result: MatchResult | null;
  /** Rules screen: players who pressed Ready (it starts once everyone is) */
  ready: string[];
  /** Pirate Race: the crews, dealt when the rules show so everyone already knows their ship */
  crews?: PirateCrewDeal[];
  /** Bluff: what each player can win, set when the duel starts */
  bluff?: BluffDeal;
}

/**
 * A prize the winner plays with for a while after the game, until the time is up or they close it.
 * lights: Color Reflex, they pick the color of every light. scratch: Perfect Circle, their best circle
 * becomes a vinyl they scratch from the phone, live on the TV (in place of the music's "Up next").
 */
export type Perk = { guest: GamePlayer; until: number; totalMs: number } & (
  | { kind: 'lights'; color: GameColor | null }
  | { kind: 'scratch'; drawing: CircleDrawing }
  | { kind: 'fireworks'; colors: RhythmColor[] }
);

/** 33 1/3 turns a minute, in radians a second: the speed of the scratch record left alone */
export const RECORD_SPEED = (100 / 3 / 60) * 2 * Math.PI;

/** Scratch moves, phone to TV: the record angle (radians, unbounded) and whether a finger is on it */
export interface ScratchMove {
  angle: number;
  touching: boolean;
}

export interface GamesState {
  invites: DuelInvite[];
  /**
   * Games being played: one on the whole TV, or several small ones at once (played on a light or the
   * phones, shown as cards at the top of the TV: Bluff, Coin Flip, Rhythm Rain)
   */
  matches: MatchState[];
  /** Guests who cannot play a Bluff yet, by id: when they can (both players wait after one) */
  bluffReadyAt: Record<string, number>;
  /** Bluff: the fixed part of the bonus each player gets when both share */
  bluffBase: number;
  perk: Perk | null;
  /** Admin only: the WLED lights, to pick the scratch light */
  lightDevices?: { id: string; name: string; online: boolean }[];
  /** WLED lights can show the game colors */
  lights: boolean;
  /** The host's songs for Rhythm Rain with music */
  rhythmSongs: RhythmSongInfo[];
  /** Guests online with their balance, to pick an opponent who can match the bet */
  online: (GamePlayer & { balance: number })[];
  settings: GamesSettings;
}

export interface GamesSettings {
  /** Games guests can start */
  enabled: GameId[];
  /** Highest stake a guest can put in a duel or a room game (hundredths, 0 = no limit) */
  maxStake: number;
  /** Show the light colors on the TV too (always shown when no light is reachable) */
  tvColors: boolean;
  /** Rounds of Blind Timer */
  timerRounds: number;
  /** Circles each player draws in Perfect Circle */
  circleCount: number;
  /** Rounds of Color Reflex */
  reflexRounds: number;
  /** Seconds the Color Reflex winner controls the lights (0: off) */
  reflexPerkSec: number;
  /** Seconds the Perfect Circle winner scratches their circle on the TV (0: off) */
  circlePerkSec: number;
  /** Seconds the Rhythm Rain duel winner shoots fireworks on the game's light (0: off) */
  rhythmPerkSec: number;
  /** WLED light that turns with the scratch record ('' = none) */
  scratchLight: string;
  /** Bluff: when both share, each gets the base bonus plus this many times their bet (0 to 3) */
  bluffMultiplier: number;
  /** Minutes a guest waits after playing a Bluff before playing another one (0: no wait) */
  bluffCooldownMin: number;
  /** Seconds the Bluff players have to choose (no choice counts as sharing) */
  bluffChooseSec: number;
  /** Colors in the first sequence of Light Simon */
  simonStart: number;
  /** WLED light the Rhythm Rain notes climb ('' = the TV only) */
  rhythmLight: string;
  /** The rhythm light's first LED is at the top (the notes go the other way) */
  rhythmReverse: boolean;
  /**
   * Length of a Rhythm Rain game in seconds: with music, a part of the song between the two around
   * the map's best part (the whole song when it is shorter). Without music: the shorter one.
   */
  rhythmMinSec: number;
  rhythmMaxSec: number;
  /** With music, play the whole song whatever its length */
  rhythmFullSong: boolean;
  /** Notes where the music rests are held (off: every note is a tap) */
  rhythmHolds: boolean;
  /** BeatSaver maps (keys) guests can play Rhythm Rain on, with their song and notes */
  rhythmSongs: string[];
  /** The host's own stars for each song (BeatSaver key: 1 to 5), to remember the ones they like */
  rhythmRatings: Record<string, number>;
  /** The music starts this many ms early, to make up for the sound delay of the TV or its speakers (-2000 to 2000) */
  rhythmAudioOffset: number;
  /** Solo: where the taps sound (anything but 'phone', like an old 'auto', means the TV) */
  rhythmSoloTaps: 'phone' | 'tv';
  /** WLED light the Pirate Race ships sail on ('' = the TV only); every other light plays a sea wave */
  pirateLight: string;
  /** The pirate light's first LED is at the treasure end */
  pirateReverse: boolean;
  /** Where the treasure is on the race light, in % of its length from the start (the ships sail to it) */
  pirateTreasure: number;
  /** Race length */
  pirateLength: PirateLength;
  /** The drum is played this many ms early, to make up for the sound delay of the TV (-1000 to 1000) */
  pirateAudioOffset: number;
  /** MyInstants sounds the host picked instead of the built-in ones */
  pirateSounds: Partial<Record<PirateSoundId, PirateSoundPick>>;
  /** Songs the crews row to (sailors singing), one picked at random each race: the drum keeps to its tempo and the song follows the drum */
  pirateSongs: PirateSong[];
  /** Its volume on the TV, 0 to 100 */
  pirateSongVolume: number;
  /** WLED strip Light Party is played on, hung upright ('' = none: the game cannot start) */
  partyLight: string;
  /** The party light's first LED is at the top */
  partyReverse: boolean;
  /** Mini games in one Light Party (at most the ones switched on) */
  partyRounds: number;
  /** Mini games Light Party draws from */
  partyMinis: PartyMiniId[];
  /** Settings of the party and of each mini game (see PARTY_GENERAL and each mini game's options) */
  partyOptions: PartyOptions;
  /** The drum's volume on the TV, 0 to 100 (100: as loud as it was made) */
  pirateDrumVolume: number;
}

// ------------------------------------------------------------ per game views

export interface TimerRound {
  /** Time to stop at (ms) */
  target: number;
  /** Elapsed ms per player (null: did not stop) */
  times: Record<string, number | null>;
  /** Closest player(s) of this round */
  winners: string[];
}

export interface TimerView {
  round: number;
  rounds: number;
  /** countdown and running: before and after GO (from startAt), reveal: this round's times */
  step: 'countdown' | 'running' | 'reveal';
  /** Time to stop at this round (ms) */
  target: number;
  /** Server time of GO */
  startAt: number;
  /** Rounds already revealed (the current one included during its reveal). Nobody sees who stopped before. */
  history: TimerRound[];
  /** Total distance to the targets so far (ms) per player, over the revealed rounds (breaks ties) */
  totals: Record<string, number>;
  /** Rounds won so far per player: the most rounds won wins the game */
  wins: Record<string, number>;
}

export interface SimonView {
  round: number;
  /** 'show': lights play the sequence; 'input': players repeat it */
  step: 'show' | 'input' | 'between';
  length: number;
  /** Players still in */
  alive: string[];
  /** Players who finished the sequence this round */
  done: string[];
  /** Number of right taps per player this round */
  progress: Record<string, number>;
  /** TV only: color shown right now */
  flash?: GameColor | null;
}

/** One round of one player: the reaction time, or why it was missed (then it counts as the penalty) */
export interface ReflexTap {
  ms: number | null;
  miss?: 'early' | 'wrong' | 'none';
}

export interface ReflexView {
  round: number;
  rounds: number;
  /** 'wait': lights are dark, 'go': color is on, 'done': round over, 'reveal': the TV shows the times */
  step: 'ready' | 'wait' | 'go' | 'done' | 'reveal';
  /** Players who tapped this round (no result, that stays secret) */
  tapped: string[];
  /** The round color: the TV gets it during 'go', the phones once the round is over */
  color: GameColor | null;
  /** A miss counts as this many ms */
  penaltyMs: number;
  /** From the reveal on: every round of every player */
  taps?: Record<string, ReflexTap[]>;
  /** Reveal timing (server time): round r at revealAt + r * stepMs, player i of it cascadeMs * i later */
  revealAt?: number;
  stepMs?: number;
  cascadeMs?: number;
}

export interface CircleDrawing {
  /** Normalised points (the shorter side of the pad is 1) */
  points: [number, number][];
  score: number;
  note?: string;
}

export interface CircleView {
  /** Circles each player draws */
  count: number;
  /** draw: everyone draws at their own pace, reveal: the TV shows the circles one by one */
  step: 'draw' | 'reveal';
  /** Circles sent so far per player */
  progress: Record<string, number>;
  /** From the reveal on: every player's circles, and the sum of their scores */
  drawings?: Record<string, CircleDrawing[]>;
  totals?: Record<string, number>;
  /** Reveal timing (server time): one circle every stepMs, in turns (1st circle of everyone, then 2nd...) */
  revealAt?: number;
  stepMs?: number;
}

export type BluffChoice = 'share' | 'steal';

/** What a Bluff player can win, the same for both (they bet the same) */
export interface BluffDeal {
  /** Each player's bet */
  stake: number;
  /** Bonus each gets when both share (base + multiplier x bet) */
  bonus: number;
  /** Both share: each gets this (their bet back + the bonus) */
  share: number;
  /** One steals: the thief gets this (the whole pot with both bonuses: always twice sharing, so stealing tempts) */
  steal: number;
}

export const bluffDeal = (stake: number, base: number, multiplier: number): BluffDeal => {
  const bonus = Math.max(0, base) + Math.round(stake * Math.max(0, multiplier));
  return { stake, bonus, share: stake + bonus, steal: (stake + bonus) * 2 };
};

/** Bluff payout of one player, from both choices */
export const bluffGain = (deal: BluffDeal, mine: BluffChoice, theirs: BluffChoice) =>
  mine === 'share' ? (theirs === 'share' ? deal.share : 0) : theirs === 'share' ? deal.steal : 0;

export interface BluffView {
  chosen: string[];
  /** After the game */
  choices?: Record<string, BluffChoice>;
}

export type CoinSide = 'heads' | 'tails';

export interface CoinView {
  /** draw: the phones pick who throws. toss: they swipe the coin up. flight: it flies on the TV (and lands). */
  step: 'draw' | 'toss' | 'flight';
  /** Who throws the coin (the result of the draw) */
  flipper: string;
  /** The player whose face is on each side of the coin */
  heads: string;
  tails: string;
  drawAt: number | null;
  drawMs: number;
  /** Server time of the throw, and how long the coin flies before it lands */
  flipAt: number | null;
  flipMs: number;
  /** How hard the coin was swiped (0 to 1) */
  power: number;
  /** Set when the coin lands */
  outcome: CoinSide | null;
}

// ------------------------------------------------------------ Rhythm Rain

/**
 * The keys, left to right (a game uses the first few). `led` is what the light strip shows. Ordered
 * so the colors in play stay easy to tell apart on the strip: blue always, yellow (closest to the
 * orange and red of the zone) only with 4 colors.
 */
export const RHYTHM_COLORS = [
  { id: 'blue', name: 'Blue', hex: '#3d8bff', led: '#0000ff' },
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0000' },
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff00' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23d', led: '#ffb000' },
  { id: 'orange', name: 'Orange', hex: '#ff7a2f', led: '#ff3c00' },
  { id: 'purple', name: 'Purple', hex: '#a35bff', led: '#8c00ff' },
  { id: 'cyan', name: 'Cyan', hex: '#2fe0e0', led: '#00ffd0' },
  { id: 'pink', name: 'Pink', hex: '#ff5fc8', led: '#ff0080' },
] as const;
export type RhythmColor = (typeof RHYTHM_COLORS)[number]['id'];

/** Colors (keys) a player can pick: 1 to 4 */
export const RHYTHM_MAX_COLORS = 4;
export const RHYTHM_DEFAULT_COLORS = 3;

/**
 * Difficulties, named like the Beat Saber charts: with music, the song's own chart of that name is
 * played (a song only offers the ones its map has). `travelMs`: time a note takes to climb to the zone
 * (shorter = faster). `minGapMs`: closest two notes can be (Beat Saber is played with two arms, here
 * thumbs). Without music, the notes are made up: `bpm` the tempo, `busy` how dense it starts, `densest`
 * the densest it gets (0 to 3).
 */
export const RHYTHM_DIFFICULTIES = [
  { id: 'Easy', name: 'Easy', short: 'E', travelMs: 2000, minGapMs: 480, bpm: [90, 100], busy: 0, densest: 1, help: 'Slow notes, lots of room between them.' },
  { id: 'Normal', name: 'Normal', short: 'N', travelMs: 1800, minGapMs: 380, bpm: [100, 110], busy: 0, densest: 2, help: 'Steady. The best start.' },
  { id: 'Hard', name: 'Hard', short: 'H', travelMs: 1550, minGapMs: 300, bpm: [110, 120], busy: 0, densest: 3, help: 'Faster, with quick runs.' },
  { id: 'Expert', name: 'Expert', short: 'X', travelMs: 1300, minGapMs: 230, bpm: [118, 126], busy: 1, densest: 3, help: 'Fast and busy from the start.' },
  { id: 'ExpertPlus', name: 'Expert+', short: 'X+', travelMs: 1100, minGapMs: 185, bpm: [124, 132], busy: 1, densest: 3, help: 'Very fast. For real guitar heroes.' },
] as const;
export type RhythmDifficulty = (typeof RHYTHM_DIFFICULTIES)[number]['id'];
export const RHYTHM_DEFAULT_DIFFICULTY: RhythmDifficulty = 'Normal';
/** The song a guest's phone suggests is drawn among the ones the host rated this many stars or more (any, if none is) */
export const RHYTHM_GOOD_STARS = 3;
/** How varied a song's rhythm is, from the steadiness of its charts (their average) */
export function rhythmFeel(charts: { steady: number }[] | undefined): { label: 'Varied' | 'Mixed' | 'Steady'; steady: number } | null {
  if (!charts?.length) return null;
  const steady = charts.reduce((sum, c) => sum + c.steady, 0) / charts.length;
  return { label: steady < 0.55 ? 'Varied' : steady < 0.72 ? 'Mixed' : 'Steady', steady };
}
export const rhythmDifficulty = (id: unknown) => RHYTHM_DIFFICULTIES.find((d) => d.id === id) ?? RHYTHM_DIFFICULTIES[1];
/** Colors from what a phone sent: 1 to 4 */
export const rhythmColors = (n: unknown) => Math.min(RHYTHM_MAX_COLORS, Math.max(1, Math.round(Number(n) || RHYTHM_DEFAULT_COLORS)));

/**
 * Timing of Rhythm Rain. A note climbs from the bottom of the strip to the middle of the hit zone
 * (the level's travel time), then goes on to the top. The zone is drawn with the windows below:
 * green within `perfectMs` of the middle, orange within `goodMs`, red within `okMs`.
 */
export const RHYTHM = {
  perfectMs: 70,
  goodMs: 140,
  okMs: 210,
  /** Middle of the hit zone, from the bottom of the strip (0 to 1) */
  zoneAt: 0.8,
  /** Time before the first note reaches the zone */
  leadMs: 4000,
  /** A tap reaches the server up to this late; notes count as missed only after it */
  graceMs: 400,
};

/** Taps count from when the first note shows on the strip to just after the last one (null: not yet) */
export const rhythmTapWindow = (notes: { at: number }[], travelMs: number): [number, number] | null =>
  notes.length ? [notes[0].at - travelMs, notes[notes.length - 1].at + RHYTHM.okMs + RHYTHM.graceMs] : null;

export type RhythmGrade = 'perfect' | 'good' | 'ok' | 'miss';
export const RHYTHM_POINTS: Record<RhythmGrade, number> = { perfect: 100, good: 60, ok: 30, miss: 0 };
/** A tap with no note of that color in the zone: mashing every key loses more than it wins */
export const RHYTHM_WRONG_PENALTY = 50;
/** x1, then one more every 8 hits in a row, up to x4 */
export const rhythmMultiplier = (combo: number) => Math.min(4, 1 + Math.floor(combo / 8));

export interface RhythmNote {
  /** Server time it crosses the middle of the zone */
  at: number;
  color: RhythmColor;
  /** A held note: keep the key down this long after `at` (no other note comes meanwhile) */
  holdMs?: number;
}

/**
 * Held notes. Where the music rests: the next note at least `gapBeats` away (from the first on Expert to the
 * second on Easy) and `rest` times the usual gap of the notes just before. They last `minBeats` to `maxBeats`, ending on a
 * half beat with time to let go before the next note (at least `letGoMs`). Holding earns `pointsPerSec`
 * (times the multiplier); letting go up to `earlyMs` before the end counts as held to the end.
 */
export const RHYTHM_HOLD = { gapBeats: [1.25, 2] as const, rest: 1.75, minBeats: 1, maxBeats: 4, letGoMs: 450, pointsPerSec: 100, earlyMs: 200 };

export const rhythmGradeOf = (gapMs: number): RhythmGrade => {
  const g = Math.abs(gapMs);
  return g <= RHYTHM.perfectMs ? 'perfect' : g <= RHYTHM.goodMs ? 'good' : g <= RHYTHM.okMs ? 'ok' : 'miss';
};

/** The note a tap of `color` at server time `at` hits (index), or -1: the closest one of that color in the zone not hit yet */
export function rhythmTarget(notes: RhythmNote[], at: number, color: RhythmColor, hit: (i: number) => boolean): number {
  let found = -1;
  let gap = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const d = Math.abs(notes[i].at - at);
    if (notes[i].at - at > RHYTHM.okMs) break;
    if (d <= RHYTHM.okMs && d < gap && notes[i].color === color && !hit(i)) {
      found = i;
      gap = d;
    }
  }
  return found;
}

export interface RhythmScore {
  score: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  ok: number;
  /** Notes that went by */
  missed: number;
  /** Taps with no note of that color in the zone */
  wrong: number;
  /** Held notes kept down to the end */
  held: number;
  /** Latest judgement, for the TV pop */
  last: { grade: RhythmGrade; at: number; seq: number } | null;
}

/**
 * A song that changes tempo: from `ms` of the song (where its beat number `beat` falls) the beats come
 * `bpm` a minute, up to the next change. The first one is the song's start tempo.
 */
export interface RhythmTempo {
  ms: number;
  beat: number;
  bpm: number;
}

/** The tempo change on at `ms` of the song (the first one before it) */
function tempoAt(tempo: RhythmTempo[], ms: number): RhythmTempo {
  let t = tempo[0];
  for (const x of tempo) {
    if (x.ms > ms) break;
    t = x;
  }
  return t;
}

/** The beat number at `ms` of the song: one tempo all along (`bpm`), or its tempo changes */
export function songBeat(ms: number, bpm: number, tempo?: RhythmTempo[] | null): number {
  if (!tempo?.length) return (ms * bpm) / 60_000;
  const t = tempoAt(tempo, ms);
  return t.beat + ((ms - t.ms) * t.bpm) / 60_000;
}

/** Where beat number `beat` falls in the song (ms): the reverse of `songBeat` */
export function songMsAt(beat: number, bpm: number, tempo?: RhythmTempo[] | null): number {
  if (!tempo?.length) return (beat * 60_000) / bpm;
  let t = tempo[0];
  for (const x of tempo) {
    if (x.beat > beat) break;
    t = x;
  }
  return t.ms + ((beat - t.beat) * 60_000) / t.bpm;
}

/** The tempo at `ms` of the song */
export const songBpmAt = (ms: number, bpm: number, tempo?: RhythmTempo[] | null) => (tempo?.length ? tempoAt(tempo, ms).bpm : bpm);

export interface RhythmView {
  /** Every note of the song, sorted (the lights show them anyway) */
  notes: RhythmNote[];
  bpm: number;
  /** The difficulty, the keys (left to right) and the time a note takes to climb to the zone */
  chart: RhythmDifficulty;
  lanes: RhythmColor[];
  travelMs: number;
  /** Server time of the first beat of the count-in, and the end of the song */
  startAt: number;
  endAt: number;
  /** Server time of one beat of the song (the beats fall every 60000 / bpm ms from it, or by `tempo`) */
  beatAt: number;
  /** The song's tempo changes, in ms from `beatAt` (null: one tempo all along) */
  tempo: RhythmTempo[] | null;
  /** Solo with music: the TV plays the tap sounds. Otherwise each phone plays its own. */
  tvSounds: boolean;
  scores: Record<string, RhythmScore>;
  /** Pixels of the light the notes climb (null: no light set or reachable) */
  leds: number | null;
  /** Played on a song: the TV plays `url` from `offsetMs` into it at server time `at`, for `durationMs` */
  music: { url: string; title: string; artist: string; cover?: string; at: number; offsetMs: number; durationMs: number } | null;
  /** With music: waiting for the TV to have the song ready (no notes yet) */
  loading: boolean;
}

export interface RhythmSongInfo {
  key: string;
  status: 'loading' | 'ready' | 'error';
  title?: string;
  artist?: string;
  /** The audio file */
  url?: string;
  /** BeatSaver's cover and 10 second MP3 preview (online) */
  cover?: string;
  preview?: string;
  /** BeatSaver likes and share of positive votes (0 to 1) */
  upvotes?: number;
  rating?: number;
  /** Where the map's best part starts in the song (ms), to preview it from the audio file */
  previewMs?: number;
  /**
   * The difficulties the map has, easiest first, with their notes per second as played here and how
   * steady their rhythm is (share of the gaps between notes of the most common length, 0 to 1)
   */
  charts?: { id: RhythmDifficulty; nps: number; steady: number }[];
  durationSec?: number;
  error?: string;
}

// ------------------------------------------------------------ Pirate Race

/** The ships, in the order crews are filled. `led` is what the race light shows. */
export const PIRATE_SHIPS = [
  { id: 'red', name: 'Red', hex: '#ff3b5c', led: '#ff0010' },
  { id: 'yellow', name: 'Yellow', hex: '#ffc83d', led: '#ffa000' },
  { id: 'green', name: 'Green', hex: '#2fd27a', led: '#00ff30' },
  { id: 'purple', name: 'Purple', hex: '#b35bff', led: '#a000ff' },
  { id: 'white', name: 'White', hex: '#f2f2f2', led: '#ffffff' },
] as const;
export type PirateShipId = (typeof PIRATE_SHIPS)[number]['id'];

/**
 * Crews by number of players: 1 vs 1, 1 vs 1 vs 1, 2 vs 2, five ships of one, 3 vs 3, 3 vs 4, 4 vs 4,
 * 3 vs 3 vs 3, 5 vs 5, 5 vs 6, 4 vs 4 vs 4. A ship goes as fast as the average stroke of its crew, so
 * uneven crews (3 vs 4) stay fair.
 */
export const PIRATE_FORMATIONS: Record<number, number[]> = {
  2: [1, 1],
  3: [1, 1, 1],
  4: [2, 2],
  5: [1, 1, 1, 1, 1],
  6: [3, 3],
  7: [3, 4],
  8: [4, 4],
  9: [3, 3, 3],
  10: [5, 5],
  11: [5, 6],
  12: [4, 4, 4],
};
/** More than 12 players: 3 crews up to 15, 4 up to 24, then all 5 ships, as even as can be (7 vs 7 vs 6) */
export const pirateFormation = (players: number): number[] => {
  const n = Math.max(2, Math.floor(players));
  if (PIRATE_FORMATIONS[n]) return PIRATE_FORMATIONS[n];
  const crews = n <= 15 ? 3 : n <= 24 ? 4 : PIRATE_SHIPS.length;
  return Array.from({ length: crews }, (_, k) => Math.floor(n / crews) + (k >= crews - (n % crews) ? 1 : 0));
};
/** "3 vs 4" */
export const formationName = (players: number) => pirateFormation(players).join(' vs ');

/** How long a race is: the distance to the treasure, in perfect strokes */
export const PIRATE_LENGTHS = [
  { id: 'short', name: 'Short', strokes: 45, help: 'About half a minute for a crew in time' },
  { id: 'normal', name: 'Normal', strokes: 70, help: 'About a minute' },
  { id: 'long', name: 'Long', strokes: 110, help: 'About a minute and a half' },
  { id: 'epic', name: 'Epic', strokes: 160, help: 'Two minutes or more: for strong arms' },
] as const;
export type PirateLength = (typeof PIRATE_LENGTHS)[number]['id'];
export const pirateLength = (id: unknown) => PIRATE_LENGTHS.find((l) => l.id === id) ?? PIRATE_LENGTHS[1];

/** The sounds of the race. Each one is made on the fly unless the host picked a MyInstants sound for it. */
export const PIRATE_SOUNDS = [
  { id: 'drum', name: 'Drum', help: 'Every beat, on the TV', search: 'war drum' },
  { id: 'drumAccent', name: 'Drum accent', help: 'Every 4th beat instead (and the count-in), on the TV', search: 'war drum' },
  { id: 'oar', name: 'Oar stroke', help: 'Each tap, on the rower’s phone', search: 'water splash' },
  { id: 'roar', name: 'Pirate roar', help: 'When the race starts, on the TV', search: 'pirate arr' },
  { id: 'boost', name: 'Speed boost', help: 'A crew gets a boost, on the TV', search: 'speed boost' },
  { id: 'finish', name: 'Finish', help: 'A ship reaches the treasure, on the TV', search: 'victory fanfare' },
] as const;
export type PirateSoundId = (typeof PIRATE_SOUNDS)[number]['id'];
/**
 * A race song, uploaded by the host. Its beats are measured when it is uploaded (and can be shifted all
 * together): the drum plays on them, a little slower or faster at times, and the song follows the drum.
 */
export interface PirateSong {
  id: string;
  file: string;
  url: string;
  title: string;
  /** Times of its beats in the file, seconds */
  beats: number[];
  /** Length of the file, seconds */
  duration?: number;
  /** Its main tempo, beats a minute (to show) */
  bpm: number;
  /** Made to a click: its beats are a steady grid */
  steady: boolean;
}
/** The drum drifts this far around a song's own pace (the song's speed moves with it) */
export const PIRATE_SONG_DRIFT = { slower: 0.9, faster: 1.1 };
/** How long trying a song on the TV lasts */
export const PIRATE_SONG_TEST_SEC = 20;


/** A picked sound: its local URL and its name (null: the built-in one) */
export type PirateSoundPick = { file: string; url: string; title: string } | null;

/** Timing of a stroke around the beat, and how much it is worth */
export const PIRATE = {
  perfectMs: 70,
  goodMs: 140,
  okMs: 220,
  /** Synchronized strokes in a row for a boost; it lasts until a stroke is out of sync */
  boostStreak: 5,
  /** A synchronized stroke goes this much further */
  syncBonus: 1.2,
  /** And a boosted one */
  boostSpeed: 1.6,
  /** Share of a crew rowing on the beat (good or better) for a synchronized stroke */
  syncShare: 0.75,
  /** Beats of the drum before the rowing counts */
  countIn: 4,
};
export type PirateGrade = 'perfect' | 'good' | 'ok' | 'splash';
export const PIRATE_POWER: Record<PirateGrade, number> = { perfect: 1, good: 0.75, ok: 0.4, splash: 0 };
export const pirateGradeOf = (gapMs: number): PirateGrade => {
  const g = Math.abs(gapMs);
  return g <= PIRATE.perfectMs ? 'perfect' : g <= PIRATE.goodMs ? 'good' : g <= PIRATE.okMs ? 'ok' : 'splash';
};
/** Crew members who must row on the beat for a synchronized stroke */
export const pirateSyncNeed = (crew: number) => Math.max(1, Math.ceil(crew * PIRATE.syncShare - 1e-9));

/** A ship and who rows it */
export interface PirateCrewDeal {
  ship: PirateShipId;
  members: string[];
}

export interface PirateCrew {
  ship: PirateShipId;
  members: string[];
  /** 0 to 1: at the treasure */
  progress: number;
  /** Synchronized strokes in a row (back to 0 on a stroke out of sync) */
  streak: number;
  /** Boosted: the crew made boostStreak synchronized strokes in a row and has stayed in sync since */
  boosted: boolean;
  /** Strokes judged so far, and the last one: its power (0 to 1), whether it was synchronized, and how many of the crew tapped */
  stroke: { seq: number; power: number; synced: boolean; at: number; rowers: number };
  /** Server time it reached the treasure */
  finishedAt: number | null;
  /** Place at the end (1: winner) */
  place: number | null;
}

export interface PirateBeat {
  /** Index of the beat (the count-in comes first) */
  i: number;
  at: number;
}

export interface PirateView {
  /** crew: teams are shown. race: the drum plays (count-in first). finish: a ship got there, the light plays the finale */
  step: 'crew' | 'race' | 'finish';
  crews: PirateCrew[];
  /** Server time of the first beat of the count-in, and of the first stroke that counts */
  drumAt: number;
  raceAt: number;
  /** The beats around now (a second back, several ahead), for the drum on the TV and the guide on the phones */
  beats: PirateBeat[];
  /** Tempo now, and where it goes over the next beats */
  bpm: number;
  trend: 'faster' | 'slower' | 'steady';
  /** Distance in perfect strokes */
  strokes: number;
  /** Where the treasure is on the race light, 0 to 1 (null: no race light) */
  treasureAt: number | null;
  /** The drum is played this many ms early on the TV (speaker delay) */
  audioOffset: number;
  /** Sounds the host picked (missing: built-in) */
  sounds: Partial<Record<PirateSoundId, string>>;
  /** The songs of the race (from the settings' songs), each from its very start, its beat 0 on drum beat `beat` */
  songs: { id: string; beat: number }[];
  /** Per player: strokes on the beat (good or better) and judged beats */
  stats: Record<string, { onBeat: number; perfect: number; beats: number }>;
}
