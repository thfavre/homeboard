import {
  BENCHES,
  BOARD_SPOTS,
  BROOK_HW,
  CAFE,
  CAMPFIRE,
  CARPET_START,
  CARPET_Y,
  CROSSING,
  DAIS_FOOT,
  FIRE_SEATS,
  FISH_SPOTS,
  FOUNTAIN_SEATS,
  PRAY_HALL_COLS,
  PRAY_ROWS,
  THRONE_SEAT,
  THRONE_STAND,
  TOWN,
  TOWN_AREA,
  TOWN_HALL,
  TOWN_OBSTACLES,
  TOWN_PLACES,
  TOWN_SCENE,
  WANIM,
  brookSide,
  darknessAt,
  minuteOf,
  minutesFrom,
  partyAt,
  praySpots,
  type DayNight,
  type PlaceId,
  type Seat,
  type TownFrame,
  type WDir,
} from '../../../shared/world.ts';
import { SPRITE_SCALE } from '../../../shared/crowd.ts';

/**
 * The life of the town: characters wander the ground band, stop for a while, sit on benches or on
 * the fountain's rim, have a coffee on the cafe's terrace, read the notice board, fish from the
 * river's bank, sit by the campfire (lit at night), pet the cat, walk up to each other and chat for
 * a while; a guest away for too long walks to the edge, lies down to sleep and slowly fades out.
 * At nightfall someone goes round the lamp posts and lights them one by one (and puts them out in
 * the morning). Every few nights the cafe throws a party: many stay up for it, dance inside (seen
 * through its window) or stand outside with a drink.
 * The town has its own short day, a few minutes long (set by the host): each character goes to bed at its own
 * time after dusk and gets up at its own time around dawn, different every night, while a few
 * night owls stay up until morning and sleep in instead.
 * When a guest changes their look on the phone, the character walks to the shop for it (clothes or
 * barber) and comes out in the new look. For the King's ceremony the camera moves over to the
 * throne room off the town's right edge: the King walks up the carpet to the throne, the others
 * follow and line up along the carpet, and when all are there the King raises his hands, everyone
 * kneels and the King sits. The module ticks it and sends the frames to the TV.
 */

const WALK_UPS = 42;
const CAT_UPS = 26;
/** Hurrying to the ceremony from far away: this much faster, until this close */
const HURRY = 1.7;
const HURRY_FROM = 240;

/**
 * What a character can go do. An activity is only considered within its viewing distance of the
 * character (0: seen from the whole town) and while it has room: `capacity` characters may do it,
 * or head for it, at once (per bench for the benches).
 */
const ACTIVITIES = {
  petCat: { radius: 300, capacity: 1 },
  bench: { radius: 540, capacity: 1 },
  /** Someone to chat with, standing around or wandering (two at a time, any number of pairs) */
  chat: { radius: 380, capacity: 2 },
  /** The fountain's rim and the notice board (one on each of their places); the cafe, the river and the campfire are seen from the whole town */
  fountain: { radius: 620 },
  board: { radius: 700 },
};
/**
 * Each time a character picks something to do, the chance of each activity, tried in this order
 * (one that is off, or has no room left, is skipped). The fountain's rim is less sought than a
 * bench; the fire draws more at night, when it burns.
 */
const CHANCE = { bench: 0.14, fountain: 0.035, cat: 0.1, cafe: 0.1, board: 0.05, fish: 0.04, fire: 0.045, fireAtNight: 0.25 };
/** How long a character sits on each kind of seat (ms, a random time in the range); longer by the fire at night */
const SEAT_MS: Record<SeatAt | 'fireNight', [number, number]> = {
  fountain: [8000, 22_000],
  cafe: [14_000, 34_000],
  fire: [12_000, 28_000],
  fireNight: [25_000, 55_000],
};
const SEATS: Record<SeatAt, Seat[]> = { fountain: FOUNTAIN_SEATS, cafe: CAFE.seats, fire: FIRE_SEATS };
/** The cafe's terrace is open while it is lighter than this (or during a party) */
const CAFE_OPEN_DARK = 0.5;
/**
 * The campfire: it burns on this share of the nights, and on this share of the days for a while
 * (town minutes, from a time between the hours given); someone kneels by the pit and lights it, for
 * this long. Nobody free to do it this long: it catches on its own.
 */
const FIRE_NIGHTS = 2 / 3;
const FIRE_DAYS = 0.15;
const DAY_FIRE = { from: 9 * 60, to: 16 * 60, lasts: 120 };
const KINDLE_MS = 3200;
/** Going to the cafe's terrace: the share who first get a coffee inside, how long at the counter, and the places at it (along the window) */
const COFFEE_SHARE = 0.6;
const COFFEE_MS: [number, number] = [3500, 7000];
const COFFEE_COUNTER = [0.8, 0.66, 0.92];
/**
 * The cafe's parasols: opened this many town minutes after dawn and folded this many after dusk
 * (a random time in each range, every day and table its own), by someone standing this far in front
 * of the table, for this long; nobody free to do it this long, it goes by itself
 */
const PARASOL_DAY = { open: [30, 180] as [number, number], close: [-90, 45] as [number, number] };
const PARASOL_REACH = 22;
const PARASOL_MS = 1800;
const PARASOL_WAIT_MS = 25_000;
const KINDLE_WAIT_MS = 20_000;
/** Where the one lighting the fire kneels: left of the pit, facing it */
const KINDLE_AT = { x: CAMPFIRE.x - 34, y: CAMPFIRE.y + 4 };
/** Reading the notice board */
const READ_MS: [number, number] = [4000, 9000];
/** Fishing: how long, the share of tries with a bite, the bite (the float bobbing) and the fish held up */
const FISH_MS: [number, number] = [22_000, 48_000];
const BITE_SHARE = 0.4;
const BITE_MS = 1400;
const CATCH_MS = 2400;
/** The lamps are lit from this darkness on (and put out below it) */
const LAMPS_DARK = 0.3;
/** The lamplighter stands this far left of a lamp post, and holds the pole up to it this long */
const LAMP_REACH = 24;
const LIGHT_MS = 1500;
/** Nobody free to light them this long (or the lamplighter is off): the lamps switch themselves, one this often */
const LAMP_WAIT_MS = 15_000;
const LAMP_AUTO_MS = 1100;
/** During a party: the chance a character free to pick something goes to it, the share going inside (if there is room), how long inside and outside */
const PARTY_CHANCE = 0.7;
/** The share of the party's guests who stay to its end (the others go home one by one, from a third of the way in) */
const PARTY_TO_THE_END = 0.4;
const PARTY_INSIDE = 0.55;
const PARTY_INSIDE_MS: [number, number] = [16_000, 34_000];
const PARTY_OUTSIDE_MS: [number, number] = [12_000, 28_000];
/** Two characters chatting stand this far apart, facing each other */
const CHAT_GAP = 42;
/** A tree's crown hides who stands behind it: this far to each side of the trunk, and up from it */
const CROWN = { half: 72, up: 150 };
/** On the way to a chat for longer than this: they give up */
const CHAT_MEET_MS = 15_000;
/** In a chat they take turns: one speaks this long (talking with the hands), then the other */
const CHAT_TURN_MS = 2600;
/** Some turns end with both laughing (this share of the turns), for the last part of the turn */
const CHAT_LAUGH_SHARE = 0.3;
const CHAT_LAUGH_MS = 900;
/** Everything in the way on the square: the fountain, the trees, the lamp posts */
const OBSTACLES = TOWN_OBSTACLES;
/** How far ahead a walker looks for something in the way */
const LOOK_AHEAD = 48;
/** Room a walker keeps from the edge of what stands on the square, going around it (less than STAND_CLEAR, so a spot next to it can be reached) */
const EDGE_GAP = 3;
/** Going around something: the heading turns by this much at a time, at most this many times (to 135 degrees) */
const TURN_STEP = Math.PI / 24;
const TURN_STEPS = 18;
/** Two standing characters this close push each other apart (nobody stands on anyone) */
const PERSONAL_SPACE = 34;
/** Close enough to a target to be there */
const ARRIVE = 6;
/** Room kept between a character's feet and what stands on the square, when a place to stand is picked next to it */
const STAND_CLEAR = 5;
/** Walking but less than this far from where it was this long ago: a character is stuck */
const STUCK_DIST = 14;
const STUCK_MS = 2500;
/** A stuck character whose walk matters slips past the others for this long (nobody pushes it back) */
const THROUGH_MS = 3000;
/** Room between two characters queueing at a shop door */
const QUEUE_GAP = 36;
/** How far from a door a character fades in or out of it */
const DOOR_FADE = 26;
/** Time inside after the look changes: the TV shows it changing (the barber's cut, the curtain) */
const CHANGE_MS = 3200;
/** The light takes at least this long to go from day to night (a switch to always night in the admin fades in) */
const DARK_FADE_S = 20;
/** A night is counted from this long before dusk: everyone's bedtime and the owls' late morning fall within one */
const NIGHT_LEAD_MIN = 240;
/** Night owls go to bed within this after dawn, and sleep this long (minutes, a random time in each range) */
const OWL_BED_MIN = 60;
const OWL_SLEEP_MIN: [number, number] = [150, 270];
/** The longest step the town moves in at once (seconds): a longer tick is split into steps */
const MAX_STEP_S = 0.2;
/** Up in the morning: a stretch, arms up (characters whose clothes have the art for it) */
const STRETCH_MS = 1800;

type Doing =
  | { kind: 'idle'; until: number }
  | { kind: 'wander'; tx: number; ty: number }
  | { kind: 'goBench'; bench: number }
  | { kind: 'sit'; bench: number; until: number }
  | { kind: 'goPet' }
  | { kind: 'pet'; until: number }
  | { kind: 'goSleep'; tx: number; ty: number; night: boolean }
  | { kind: 'sleep'; night: boolean }
  | { kind: 'cheer'; until: number }
  | { kind: 'goThrone'; onCarpet: boolean }
  | { kind: 'throne'; stage: 'stand' | 'hail' | 'seat' | 'sit' | 'rise' | 'cheer'; until: number; next?: number }
  | { kind: 'descend' }
  | { kind: 'goHall'; lane?: number }
  | { kind: 'goPray'; spot: number; inLane: boolean }
  | { kind: 'pray'; spot: number; until: number; knelt: boolean }
  | { kind: 'goChat'; with: string; tx: number; ty: number; since: number }
  | Chat
  | Visit
  | { kind: 'goSeat'; at: SeatAt; seat: number }
  | { kind: 'seated'; at: SeatAt; seat: number; until: number }
  | { kind: 'goRead'; spot: number }
  | { kind: 'read'; spot: number; until: number }
  | { kind: 'goFish'; spot: number }
  | Fishing
  | Lamps
  | Party
  | { kind: 'kindle'; at: number }
  | Coffee
  | { kind: 'parasol'; table: number; open: boolean; at: number };

/**
 * Getting a coffee inside the cafe before sitting on its terrace (the chair `seat` is held all
 * along): to the door, in, at the counter (seen through the window) until `until`, out, then to
 * the chair. `cut`: called away while going in, the time inside is cut to this.
 */
interface Coffee {
  kind: 'coffee';
  seat: number;
  phase: 'go' | 'enter' | 'inside' | 'exit';
  until: number;
  cut: number;
}

/** The seats besides the benches: the fountain's rim, the cafe's chairs, the logs by the campfire */
type SeatAt = 'fountain' | 'cafe' | 'fire';

/** Fishing from the bank until `until`; a fish bites at `bite` (0: none this time), is pulled out (`landed`) and held up, then they go */
interface Fishing {
  kind: 'fish';
  spot: number;
  until: number;
  bite: number;
  landed?: boolean;
}

/**
 * The lamplighter's round: to lamp `lamp`, then holding the pole up to it from `at` (0: still on the
 * way), lighting it (`lit`) or putting it out, then on to the nearest lamp left
 */
interface Lamps {
  kind: 'lamps';
  lamp: number;
  at: number;
  lit: boolean;
}

/**
 * At the cafe's party. go: to the door (a place inside is held, `slot`), enter, inside dancing until
 * `until`, exit. terrace: to a spot outside (`slot`), then stand there with a drink until `until`.
 * `cut`: called away while going in, the time inside is cut to this.
 */
interface Party {
  kind: 'party';
  phase: 'go' | 'enter' | 'inside' | 'exit' | 'terrace' | 'stand';
  slot: number;
  until: number;
  cut: number;
}

/**
 * Two characters talking: `with` is the other one, who has the same chat. Until both stand in
 * place it waits (`start` 0); then they take turns for a while, until `until`. `seed` picks who
 * speaks first and which turns end in a laugh, the same for both.
 */
interface Chat {
  kind: 'chat';
  with: string;
  start: number;
  until: number;
  seed: number;
}

/**
 * The King's ceremony. gather: the King is called first and walks to the throne; once he is in
 * the throne room (`open`) the others are called, and take their places along the carpet in the
 * order they arrive, standing. court: all are there (or it took too long): the King raises his
 * hands and sits, the others kneel. leave: everyone gets up and goes back to town, and the camera
 * follows them home.
 */
interface Ceremony {
  phase: 'gather' | 'court' | 'leave';
  /** When this phase began */
  since: number;
  /** When the others were called (0: not yet, the King is still on his way to the throne room) */
  open: number;
  /** The places along the carpet, in the order they are given out (see praySpots) */
  spots: { x: number; y: number }[];
}

/** How long the camera takes to move over to the throne room, and back to the town */
const PAN_MS = 9000;
const PAN_BACK_MS = 11_000;
/** Once the court is over the camera stays this long, while everyone gets up */
const LEAVE_PAUSE_MS = 3500;
/** The others are called without the King in the throne room, and the court starts without everyone there, this long after the time they have to get going */
const KING_WAIT_MS = 20_000;
const GATHER_EXTRA_MS = 35_000;
/** How long the King holds his hands up to open the court */
const HAIL_MS = 2600;
/** Seated, the King gets up to cheer his court this often */
const CHEER_EVERY_MS = 10000;
/** Arriving this close to the bridge over the river, a character is given its place along the carpet */
const BRIDGE_ZONE = 40;
/** How far from the bridge's parapets the ones going to the ceremony keep (world units) */
const BRIDGE_EDGE = 8;
/** The furthest a place along the carpet lies from its middle line (world units) */
const SPOT_REACH = Math.max(...praySpots(PRAY_ROWS).map((s) => Math.abs(s.y - CARPET_Y)));
/** This close to the end of the court nobody is called anymore: they would arrive as everyone leaves */
const LAST_CALL_MS = 8000;

/**
 * A trip to a shop: walk to its door, queue if it is full, go in, be seen through the window for a
 * while (the look changes halfway), come out. `seat` is the place inside, `since` when the
 * character joined the queue (first come, first in).
 */
interface Visit {
  kind: 'visit';
  place: PlaceId;
  phase: 'go' | 'queue' | 'enter' | 'inside' | 'exit';
  seat: number;
  since: number;
  until: number;
  dressAt: number;
  dressed: boolean;
}

interface Walker {
  id: string;
  x: number;
  y: number;
  dir: WDir;
  doing: Doing;
  /** 0..1, fading out while leaving; a walker at 0 is removed */
  alpha: number;
  fading: boolean;
  /** The worn art has no sitting sheets: stays off benches and away from the cat */
  noSit: boolean;
  /** The worn art has no emote or jump sheets: no gestures or laughs in a chat (see chatPose) */
  noCheer: boolean;
  /** Shops to go to, in order (see RosterEntry.errands) */
  errands: PlaceId[];
  /** The activity already asked to wrap up for a trip (it is asked once) */
  wrapped: Doing | null;
  /** Where it was, and when, the last time it got somewhere (see unstick) */
  anchor: { x: number; y: number; at: number };
  /** Until then it slips past the other characters: it neither pushes nor is pushed (it was stuck) */
  through: number;
  /** The side it is going around something on (1 or -1; 0: nothing in the way) */
  turn: number;
}

/**
 * How important an activity is. A call for a character (a shop trip, the King's ceremony) only
 * interrupts what is less important than itself; an activity of the same priority or higher is
 * carried on, and the call waits until the character is between two activities.
 */
const PRIORITY = {
  /** Standing around, wandering, a bench */
  casual: 0,
  /** Something chosen for a while: petting the cat, a cheer */
  activity: 1,
  /** A trip to a shop for the look on the phone */
  errand: 2,
  /** Asleep while the guest is away, or for the night */
  rest: 3,
  /** The King's ceremony: everyone goes, the sleepers too; only a shop trip under way is finished first (it cannot be cut short) */
  ceremony: 4,
} as const;

/**
 * How an activity ends, for a character called away (see PRIORITY and plan). `left` is how long it
 * would still take on its own (ms). `wrapUp` ends it early and naturally within `ms` (standing up
 * from the bench, stopping a walk); an activity without it cannot be cut short, and the call waits
 * until it is over. `quickStop` marks a casual activity (wandering, a bench) that is dropped within a
 * moment for a call, however long it had left. A new activity declares its rule here; going to sleep
 * and cheering respect it too.
 */
interface Rule<D extends Doing> {
  priority: number;
  left(d: D, w: Walker, now: number): number;
  wrapUp?(d: D, w: Walker, now: number, ms: number): void;
  quickStop?(d: D, w: Walker, now: number, ms: number): void;
}
type Rules = { [K in Doing['kind']]: Rule<Extract<Doing, { kind: K }>> };

export interface RosterEntry {
  id: string;
  online: boolean;
  /** How long they have been away (ms; 0 while online) */
  awayMs: number;
  /** See Walker.noSit and Walker.noCheer */
  noSit?: boolean;
  noCheer?: boolean;
  /** Shops the character has to visit to look like on the phone (the latest look counts, so one trip each) */
  errands?: PlaceId[];
}

export interface TownOptions {
  /** Away this long: lies down to sleep; this much longer: fades out */
  sleepAfterMs: number;
  fadeAfterMs: number;
  /** How long a character stays inside a shop (ms, a random time in the range) */
  insideMs: [number, number];
  /** Wandering or sitting on a bench is dropped within a random time in this range (ms) */
  quickStopMs: [number, number];
  /** Another activity ending on its own within this is finished before going to the shop */
  finishWithinMs: number;
  /** A longer one is wrapped up within a random time in this range, if it can be cut short */
  wrapUpMs: [number, number];
  /** Each time a character picks something to do, the chance it goes to chat with someone nearby (0..1; 0: never) */
  chatChance: number;
  /** How long a chat lasts once both stand face to face (ms, a random time in the range) */
  chatMs: [number, number];
  /** The guest holding the King's title (null: nobody, or the title is off) */
  king: string | null;
  /** A ceremony: how long the King holds court once seated, and how long everyone has to finish what they are doing and go (ms) */
  courtMs: number;
  graceMs: number;
  /** Day and night, and the time now on the town's own clock (minutes, see townMinutes) */
  dayNight: DayNight;
  localMinutes: number;
  /** Characters go to bed at night: bedtimes spread over this many minutes around dusk, and this share are night owls (0..1) */
  nightSleep: boolean;
  bedtimeSpreadMin: number;
  nightOwls: number;
  /** Which of the town's things to do are on */
  activities: { cafe: boolean; fountain: boolean; board: boolean; fish: boolean; fire: boolean };
  /** Someone lights the lamps at nightfall (off: they light themselves) */
  lamplighter: boolean;
  /** The cafe's party night: on its own every so many days, for so many town hours from nightfall, and the share who stay up for it (0..1) */
  party: { on: boolean; everyDays: number; chance: number; hours: number; goers: number };
}

/**
 * A number in 0..1 from a text, always the same for the same text (FNV-1a, then mixed so texts that
 * differ only in their last character, like one night's number and the next, land far apart)
 */
function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/** A night owl has this chance to be one again the next night (the others become one often enough to keep the share) */
const OWL_KEEP = 0.5;
/** How many nights back a character's nights are followed to know whether it is a night owl (enough to forget where it started) */
const OWL_MEMORY = 12;
const owls = new Map<string, boolean>();

/**
 * Whether a character is a night owl on night `night`: about `share` of the town each night, a
 * different lot from one night to the next. A night owl stays one the next night with the chance
 * OWL_KEEP, the others become one just often enough to keep the share. Worked out by following
 * the character's last nights (the same answer every time, on every server start).
 */
export function nightOwl(id: string, night: number, share: number): boolean {
  if (share <= 0) return false;
  if (share >= 1) return true;
  const key = `${id}:${night}:${share}`;
  const known = owls.get(key);
  if (known !== undefined) return known;
  const become = (share * (1 - OWL_KEEP)) / (1 - share);
  let owl = hash01(`${id}:${night - OWL_MEMORY}:owl`) < share;
  for (let n = night - OWL_MEMORY + 1; n <= night; n++) owl = hash01(`${id}:${n}:owl`) < (owl ? OWL_KEEP : become);
  if (owls.size > 5000) owls.clear();
  owls.set(key, owl);
  return owl;
}

/**
 * Whether a character sleeps for the night right now. Each one has its own bedtime, from dusk to
 * the spread after it (so some are still up well into the night), and gets up around dawn, both
 * different every night. Night owls (a different lot each night, see nightOwl) stay up and go to
 * bed after dawn, for a few hours.
 */
export function asleepForTheNight(id: string, o: Pick<TownOptions, 'dayNight' | 'localMinutes' | 'nightSleep' | 'bedtimeSpreadMin' | 'nightOwls'>): boolean {
  if (!o.nightSleep || !o.dayNight.on) return false;
  const dusk = minuteOf(o.dayNight.dusk);
  const night = minutesFrom(dusk, minuteOf(o.dayNight.dawn));
  // Which night it is, and how far into it (counted from its lead before dusk)
  const since = o.localMinutes - dusk + NIGHT_LEAD_MIN;
  const key = Math.floor(since / 1440);
  const rel = since - key * 1440 - NIGHT_LEAD_MIN;
  const owl = nightOwl(id, key, o.nightOwls);
  const a = hash01(`${id}:${key}:bed`);
  const b = hash01(`${id}:${key}:wake`);
  const spread = o.bedtimeSpreadMin;
  const [bed, wake] = owl
    ? [night + a * OWL_BED_MIN, night + OWL_SLEEP_MIN[0] + b * (OWL_SLEEP_MIN[1] - OWL_SLEEP_MIN[0])]
    : [a * spread, night + (b - 0.5) * spread * 0.6];
  return rel >= bed && rel < wake;
}

export interface TownHooks {
  /** Halfway through a visit, and again on the way out: the character now wears what its guest picked for this shop */
  dress(id: string, place: PlaceId): void;
  /** A fish on the line is pulled out of the water (once per fish) */
  caught?(id: string): void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const idle = (now: number, a: number, b: number): Doing => ({ kind: 'idle', until: now + rand(a, b) });

/** Walking time to a point (ms) */
const walkMs = (w: Walker, x: number, y: number) => (Math.hypot(x - w.x, y - w.y) / WALK_UPS) * 1000;

/** Inside the cafe at the party, or going through its door: nothing else starts until it is out */
const inCafe = (w: Walker) =>
  (w.doing.kind === 'party' || w.doing.kind === 'coffee') && (w.doing.phase === 'enter' || w.doing.phase === 'inside' || w.doing.phase === 'exit');

/** A walk ends naturally anywhere: stop, look around for a moment */
const stopWalking = (_d: Doing, w: Walker, now: number, ms: number) => {
  w.doing = { kind: 'idle', until: now + Math.min(ms, rand(400, 1200)) };
};

/** Stop where you are and stand there for `ms` (the moment before heading off) */
const pauseFor = (_d: Doing, w: Walker, now: number, ms: number) => {
  w.doing = { kind: 'idle', until: now + ms };
};

/** Something with an end time ends a little sooner */
const sooner = (d: { until: number }, _w: Walker, now: number, ms: number) => {
  d.until = Math.min(d.until, now + ms);
};

/** The obstacle on the square a point is inside (the fountain, a tree, a lamp post) */
function obstacleAt(x: number, y: number, margin = 0): (typeof OBSTACLES)[number] | undefined {
  return OBSTACLES.find((o) => ((x - o.x) / (o.rx + margin)) ** 2 + ((y - o.y) / (o.ry + margin)) ** 2 < 1);
}

/**
 * Where a character can stand to be at a point: the point itself, or when it lies inside something
 * on the square (a place by the cat, next to a tree), the nearest spot just outside it
 */
function standable(x: number, y: number): { x: number; y: number } {
  const o = obstacleAt(x, y, STAND_CLEAR);
  if (!o) return { x, y };
  const nx = (x - o.x) / (o.rx + STAND_CLEAR);
  const ny = (y - o.y) / (o.ry + STAND_CLEAR);
  const d = Math.hypot(nx, ny);
  // Dead in the middle: out to the front
  const [ux, uy] = d ? [nx / d, ny / d] : [0, 1];
  return { x: o.x + ux * (o.rx + STAND_CLEAR + 1), y: o.y + uy * (o.ry + STAND_CLEAR + 1) };
}

/** The nearest y on the bridge's deck */
const onBridge = (y: number) => Math.max(CROSSING.y0, Math.min(CROSSING.y1, y));

/** A random y on the bridge's deck, clear of its parapets: the crowd going over spreads out */
const bridgeLane = () => rand(CROSSING.y0 + BRIDGE_EDGE, CROSSING.y1 - BRIDGE_EDGE);

/**
 * The y to cross the bridge at, for a place along the carpet: the places furthest up go over its
 * top side, the ones furthest down its bottom side, so everyone comes off the bridge already
 * across from its lane, and nobody crosses another's way into the hall
 */
function laneForSpot(spotY: number): number {
  const mid = (CROSSING.y0 + CROSSING.y1) / 2;
  const half = (CROSSING.y1 - CROSSING.y0) / 2 - BRIDGE_EDGE;
  return mid + Math.max(-1, Math.min(1, (spotY - CARPET_Y) / SPOT_REACH)) * half;
}

/**
 * Where a character at `a` going to x `tx` must head first, when the river lies between: the near
 * end of the bridge, or once on it, its far end. Null: nothing to cross.
 */
function bridgeWay(a: { x: number; y: number }, tx: number): { x: number; y: number } | null {
  const side = (x: number) => (x < CROSSING.x0 ? -1 : x > CROSSING.x1 ? 1 : 0);
  const from = side(a.x);
  const to = side(tx);
  if (from === to) return null;
  const y = onBridge(a.y);
  // On the bridge: off its far end (just past it, so the walk on from there is on that side)
  if (from === 0) return { x: to > 0 ? CROSSING.x1 + 1 : CROSSING.x0 - 1, y };
  // To the near end: right on its edge, which counts as on the bridge
  return { x: from < 0 ? CROSSING.x0 : CROSSING.x1, y };
}

function blocked(x: number, y: number, margin = 0): boolean {
  return !!obstacleAt(x, y, margin);
}

/**
 * Push a character out of the obstacle it walked into: to just outside its edge, where its next
 * step sees the obstacle ahead and goes around (right on the edge it would walk straight back in)
 */
function keepOut(a: { x: number; y: number }): void {
  for (const o of OBSTACLES) {
    const nx = (a.x - o.x) / o.rx;
    const ny = (a.y - o.y) / o.ry;
    const d = Math.hypot(nx, ny);
    if (d >= 1 || d === 0) continue;
    a.x = o.x + (nx / d) * (o.rx + 1);
    a.y = o.y + (ny / d) * (o.ry + 1);
  }
}

/** Room kept from the town's river's water: nobody stands closer (the anglers stand just outside it) */
const BROOK_CLEAR = 12;
/** Too near the town's river, in it, or across it (the far side is not walked on) */
const wet = (x: number, y: number, margin = BROOK_CLEAR) => x < TOWN.w + 40 && brookSide(x, y) > -(BROOK_HW + margin);
/** Where a walk that would cross the town's river goes round it: by its end at the town's right edge, on the town's side */
const BROOK_WAY = { x: 1588, y: 598 };

/** The straight walk from a to b would go through the town's river */
function crossesBrook(ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
  for (let i = 1; i < n; i++) if (wet(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, 0)) return true;
  return false;
}

/** Push a character out of the town's river (pushed there by the others): back to its bank, the shortest way */
function keepDry(a: { x: number; y: number }): void {
  const side = brookSide(a.x, a.y);
  const want = -(BROOK_HW + 2);
  if (a.x > TOWN.w || side <= want) return;
  const gx = (brookSide(a.x + 1, a.y) - brookSide(a.x - 1, a.y)) / 2;
  const gy = (brookSide(a.x, a.y + 1) - brookSide(a.x, a.y - 1)) / 2;
  const g = Math.hypot(gx, gy) || 1;
  a.x -= ((side - want) * gx) / g;
  a.y -= ((side - want) * gy) / g;
}

/** A free spot on the square */
function randSpot() {
  for (let k = 0; k < 20; k++) {
    const x = rand(TOWN_AREA.x0, TOWN_AREA.x1);
    const y = rand(TOWN_AREA.y0, TOWN_AREA.y1);
    if (!blocked(x, y, 14) && !wet(x, y)) return { x, y };
  }
  return { x: TOWN.w / 2, y: (TOWN_AREA.y0 + TOWN_AREA.y1) / 2 };
}

export class TownSim {
  private walkers = new Map<string, Walker>();
  private cat = { x: 500, y: 700, dir: 3 as WDir, doing: { kind: 'idle', until: 0 } as Doing, petted: false };
  /** Which lamp posts are lit; since when some wait for the lamplighter (0: none waits), and when one last switched itself */
  private lampLit = TOWN_SCENE.lamps.map(() => false);
  private lampWait = 0;
  private lampAuto = 0;
  /** The campfire burns; since when it should and is not lit yet (0: nothing waits) */
  private fireLit = false;
  private fireWait = 0;
  /** The cafe's door: shut every morning until the first one goes in, then open until it closes for the night */
  private cafeDoorOpen = false;
  /** The cafe's parasols: open or folded, and since when one waits for someone to do it (0: none waits) */
  private parasolOpen = CAFE.tables.map(() => false);
  private parasolWait = CAFE.tables.map(() => 0);
  /** A party the host started: until when on the town's clock (minutes), and since when (its name) */
  private partyUntil = 0;
  private partyFrom = 0;
  /** The party night the host ended early (its name), so it does not start again */
  private partyStopped: string | null = null;
  /** The party now and its name (null: none), and the town's clock and the party's length at the last tick */
  private partyNow: { night: string; from: number; until: number } | null = null;
  private lastMinutes = 0;
  private lastPartyHours = 5;
  private last = 0;
  /** The King the throne is kept for */
  private king: string | null = null;
  /** The ceremony, while one is on */
  private ceremony: Ceremony | null = null;
  /** The camera: 0 on the town, 1 on the throne room. Where it moves from and to, from when on and for how long */
  private cam = { from: 0, to: 0, at: 0, ms: 1 };
  /** How dark it is (0 day, 1 night), moving toward the clock's in DARK_FADE_S at the fastest (-1: not known yet) */
  private dark = -1;
  /** Characters asleep for the night (not the ones whose guest is away) */
  private nightSleepers = 0;

  /** `clock`: the town's time (ms), which can run faster than real time; real time by default */
  constructor(
    private hooks: TownHooks,
    private clock: () => number = () => Date.now(),
  ) {}

  private rules: Rules = {
    idle: { priority: PRIORITY.casual, left: (d, _w, now) => d.until - now, wrapUp: sooner },
    // Wandering and benches are casual: dropped within a moment when something calls
    wander: { priority: PRIORITY.casual, left: (d, w) => walkMs(w, d.tx, d.ty), wrapUp: stopWalking, quickStop: pauseFor },
    goBench: { priority: PRIORITY.casual, left: (d, w) => walkMs(w, BENCHES[d.bench]?.x ?? w.x, BENCHES[d.bench]?.y ?? w.y), wrapUp: stopWalking, quickStop: pauseFor },
    sit: { priority: PRIORITY.casual, left: (d, _w, now) => d.until - now, wrapUp: sooner, quickStop: sooner },
    // Petting ends whenever: get up a little sooner, or stop on the way there
    goPet: { priority: PRIORITY.activity, left: (_d, w) => walkMs(w, this.cat.x, this.cat.y), wrapUp: stopWalking },
    pet: { priority: PRIORITY.activity, left: (d, _w, now) => d.until - now, wrapUp: sooner },
    // A chat ends whenever: stop on the way, or say goodbye a little sooner (the other one sees it
    // is over and goes on too)
    goChat: { priority: PRIORITY.activity, left: (d, w) => walkMs(w, d.tx, d.ty), wrapUp: stopWalking },
    chat: {
      priority: PRIORITY.activity,
      left: (d, _w, now) => (d.start ? d.until - now : CHAT_MEET_MS),
      wrapUp: (d, _w, now, ms) => {
        d.start ||= now;
        d.until = d.until ? Math.min(d.until, now + ms) : now + ms;
      },
    },
    // Never cut short: a cheer is over in a moment, a sleeper wakes when the guest is back, a visit
    // runs its course, and the ceremony ends for everyone at once
    cheer: { priority: PRIORITY.activity, left: (d, _w, now) => d.until - now },
    visit: { priority: PRIORITY.errand, left: () => Infinity },
    goThrone: { priority: PRIORITY.ceremony, left: () => Infinity },
    throne: { priority: PRIORITY.ceremony, left: () => Infinity },
    descend: { priority: PRIORITY.ceremony, left: () => Infinity },
    goHall: { priority: PRIORITY.ceremony, left: () => Infinity },
    goPray: { priority: PRIORITY.ceremony, left: () => Infinity },
    pray: { priority: PRIORITY.ceremony, left: () => Infinity },
    goSleep: { priority: PRIORITY.rest, left: () => Infinity },
    sleep: { priority: PRIORITY.rest, left: () => Infinity },
    // A seat or the notice board is casual, like a bench
    goSeat: { priority: PRIORITY.casual, left: (d, w) => walkMs(w, SEATS[d.at][d.seat].x, SEATS[d.at][d.seat].y), wrapUp: stopWalking, quickStop: pauseFor },
    seated: { priority: PRIORITY.casual, left: (d, _w, now) => d.until - now, wrapUp: sooner, quickStop: sooner },
    goRead: { priority: PRIORITY.casual, left: (d, w) => walkMs(w, BOARD_SPOTS[d.spot].x, BOARD_SPOTS[d.spot].y), wrapUp: stopWalking, quickStop: pauseFor },
    read: { priority: PRIORITY.casual, left: (d, _w, now) => d.until - now, wrapUp: sooner, quickStop: sooner },
    // Fishing ends whenever, but a fish on the line is landed first
    goFish: { priority: PRIORITY.activity, left: (d, w) => walkMs(w, FISH_SPOTS[d.spot].x, FISH_SPOTS[d.spot].y), wrapUp: stopWalking },
    fish: {
      priority: PRIORITY.activity,
      left: (d, _w, now) => d.until - now,
      wrapUp: (d, _w, now, ms) => {
        if (d.bite && d.bite <= now) return;
        d.bite = 0;
        d.until = Math.min(d.until, now + ms);
      },
    },
    // The lamplighter hands the round over to someone else (the lamps left wait for the next one)
    lamps: { priority: PRIORITY.activity, left: () => 60_000, wrapUp: (_d, w, now, ms) => (w.doing = idle(now, 200, Math.min(ms, 800))) },
    // Lighting the fire is dropped for a call: someone else lights it later
    // A coffee: off on the way, a little sooner out of the cafe; who has it goes on to sit (casual, like the seat)
    coffee: {
      priority: PRIORITY.casual,
      left: (d, w, now) => (d.phase === 'inside' ? d.until - now : d.phase === 'go' ? walkMs(w, CAFE.front.x, CAFE.front.y) : 1500),
      wrapUp: (d, w, now, ms) => {
        if (d.phase === 'go') stopWalking(d, w, now, ms);
        else if (d.phase === 'inside') d.until = Math.min(d.until, now + ms);
        else if (d.phase === 'enter') d.cut = now + ms;
      },
    },
    // Opening or folding a parasol is dropped for a call: someone else does it later
    parasol: { priority: PRIORITY.activity, left: (d, _w, now) => (d.at ? d.at + PARASOL_MS - now : 30_000), wrapUp: (_d, w, now, ms) => (w.doing = idle(now, 200, Math.min(ms, 800))) },
    kindle: { priority: PRIORITY.activity, left: (d, _w, now) => (d.at ? d.at + KINDLE_MS - now : 30_000), wrapUp: (_d, w, now, ms) => (w.doing = idle(now, 200, Math.min(ms, 800))) },
    // The party: off on the way, a little sooner out of the cafe or away from the terrace
    party: {
      priority: PRIORITY.activity,
      left: (d, w, now) => (d.phase === 'inside' || d.phase === 'stand' ? d.until - now : d.phase === 'go' || d.phase === 'terrace' ? walkMs(w, CAFE.door.x, CAFE.door.y) : 1000),
      wrapUp: (d, w, now, ms) => {
        if (d.phase === 'go' || d.phase === 'terrace') stopWalking(d, w, now, ms);
        else if (d.phase === 'inside' || d.phase === 'stand') d.until = Math.min(d.until, now + ms);
        else if (d.phase === 'enter') d.cut = now + ms;
      },
    },
  };

  /** The rule of what a character is doing now */
  private rule(w: Walker): Rule<Doing> {
    return this.rules[w.doing.kind] as Rule<Doing>;
  }

  /** Make a guest's character cheer for a moment (a win, a purchase), unless it is busy with something that cannot be cut short */
  cheer(id: string): void {
    const w = this.walkers.get(id);
    if (!w || (!this.rule(w).wrapUp && w.doing.kind !== 'cheer') || inCafe(w)) return;
    w.doing = { kind: 'cheer', until: this.clock() + 2600 };
  }

  /** Advance the town and build the frame for the TV */
  tick(roster: RosterEntry[], o: TownOptions): TownFrame {
    const now = this.clock();
    // (up to a second at once: with the town's time running fast the steps are longer)
    const dt = this.last ? Math.min(1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.king = o.king;
    this.stepCeremony(now, o);
    const darkTarget = darknessAt(o.dayNight, ((o.localMinutes % 1440) + 1440) % 1440);
    this.dark = this.dark < 0 ? darkTarget : this.dark + Math.max(-dt / DARK_FADE_S, Math.min(dt / DARK_FADE_S, darkTarget - this.dark));
    this.stepParty(o);

    const seen = new Set<string>();
    for (const r of roster) {
      seen.add(r.id);
      let w = this.walkers.get(r.id);
      const away = !r.online && r.awayMs > o.sleepAfterMs;
      const shouldFade = !r.online && r.awayMs > o.sleepAfterMs + o.fadeAfterMs;
      const errands = r.errands ?? [];
      // Asleep for the night, unless the guest just picked a new look: up to go and get it, back to
      // bed after. The ones staying up for the party go to bed once it is over.
      const night = !away && !errands.length && asleepForTheNight(r.id, o) && !this.upForParty(r.id, o);
      const shouldSleep = away || night;
      if (!w) {
        // Nobody sees a character that is not in the town: it takes its new look at once
        for (const p of errands) this.hooks.dress(r.id, p);
        // Faded away (or new): only come back when awake. New arrivals walk in from an edge (the
        // left one during a ceremony: the right one is the throne room then, in full view).
        if (away) continue;
        const from = this.ceremony || Math.random() < 0.5 ? -20 : TOWN.w + 20;
        const spot = randSpot();
        // (in from the right: above the river, which leaves the town lower down that edge)
        const y = from > 0 && wet(TOWN_AREA.x1, spot.y, 40) ? rand(TOWN_AREA.y0 + 20, BROOK_WAY.y - 20) : spot.y;
        w = { id: r.id, x: from, y, dir: from < 0 ? 3 : 1, doing: { kind: 'wander', tx: spot.x, ty: spot.y }, alpha: 1, fading: false, noSit: !!r.noSit, noCheer: !!r.noCheer, errands: [], wrapped: null, anchor: { x: from, y, at: now }, through: 0, turn: 0 };
        this.walkers.set(r.id, w);
        continue;
      }
      w.noSit = !!r.noSit;
      w.noCheer = !!r.noCheer;
      w.errands = errands;
      // An outfit change mid-sit (or mid-pet) would show missing art: stand up
      const k = w.doing.kind;
      if (w.noSit && (k === 'sit' || k === 'goBench' || k === 'pet' || k === 'goPet' || k === 'seated' || k === 'goSeat')) {
        w.doing = { kind: 'idle', until: now + 400 };
      }
      // The title went to someone else: down from the throne. The new King, kneeling with the others: up, the throne is waiting
      if (w.id !== this.king && (w.doing.kind === 'throne' || w.doing.kind === 'goThrone')) w.doing = this.offThrone(w, now);
      if (w.id === this.king && (w.doing.kind === 'pray' || w.doing.kind === 'goPray' || w.doing.kind === 'goHall')) w.doing = idle(now, 400, 1200);
      // Called to the ceremony while asleep (or on the way to bed): up again, it comes before sleep
      if ((w.doing.kind === 'sleep' || w.doing.kind === 'goSleep') && this.summoned(w, now, o)) {
        w.fading = false;
        w.alpha = 1;
        w.doing = idle(now, 500, 1500);
      }
      // Off to sleep, unless busy with something that cannot be cut short (a shop visit is finished
      // first), and never during a ceremony: those away sleep once it is over
      // (one inside the cafe at the party comes out first)
      if (shouldSleep && !this.ceremony && w.doing.kind !== 'sleep' && w.doing.kind !== 'goSleep' && this.rule(w).wrapUp && !inCafe(w)) {
        // Walk to an edge of the town and lie down there, with room from the other sleepers
        const bed = this.bedFor(w);
        w.doing = { kind: 'goSleep', tx: bed.x, ty: bed.y, night };
      }
      // Asleep for the night when the guest leaves (or the other way around): stays in bed, for the new reason
      if (shouldSleep && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep')) w.doing.night = night;
      if (!shouldSleep && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep')) {
        // Up in the morning: a stretch first, for one that was lying down for the night
        const stretch = w.doing.kind === 'sleep' && w.doing.night && !w.noCheer;
        w.fading = false;
        w.alpha = 1;
        w.doing = stretch ? { kind: 'cheer', until: now + STRETCH_MS } : { kind: 'idle', until: now + 600 };
      }
      w.fading = shouldFade && (w.doing.kind === 'sleep' || w.doing.kind === 'goSleep');
    }
    for (const id of this.walkers.keys()) {
      // Gone from the party: a place it held in a shop is free again (seats are counted from the walkers)
      if (!seen.has(id)) this.walkers.delete(id);
    }
    // A long tick (the town's time running fast) goes in short steps: walks go around things as at
    // normal speed, and nobody steps past where they were going
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP_S));
    for (let k = 1; k <= steps; k++) {
      const at = now - dt * 1000 * (1 - k / steps);
      const sdt = dt / steps;
      for (const [id, w] of this.walkers) {
        this.plan(w, at, o);
        this.step(w, at, sdt, o);
        this.unstick(w, at);
        if (w.fading) {
          w.alpha = Math.max(0, w.alpha - sdt / 3);
          if (w.alpha === 0) this.walkers.delete(id);
        }
      }
      this.separate();
      this.stepCat(at, sdt);
    }
    this.stepLamps(now, o);
    this.stepFire(now, o);
    this.stepParasols(now, o);
    // The cafe's door: shut once it closes for the night (when nobody is going through it)
    if (!this.cafeOpen() && ![...this.walkers.values()].some(inCafe)) this.cafeDoorOpen = false;
    this.nightSleepers = 0;
    for (const w of this.walkers.values()) if ((w.doing.kind === 'sleep' || w.doing.kind === 'goSleep') && w.doing.night) this.nightSleepers++;

    const ids: string[] = [];
    const a: number[] = [];
    for (const w of this.walkers.values()) {
      ids.push(w.id);
      const d = w.doing;
      if (d.kind === 'visit' && d.phase === 'inside') {
        // Seen through the shop window: x is the place inside, y the window's bottom
        const p = TOWN_PLACES[d.place];
        a.push(Math.round(p.seats[d.seat]), Math.round(p.window.y + p.window.h), WANIM.inside, this.insideDir(w, d, now), Math.round(w.alpha * 100));
      } else if (d.kind === 'coffee' && d.phase === 'inside') {
        // At the counter behind the cafe's window, facing it (x the place at it, y the window's bottom)
        a.push(Math.round(this.counterAt(w)), Math.round(CAFE.window.y + CAFE.window.h), WANIM.inside, 0, Math.round(w.alpha * 100));
      } else if (d.kind === 'party' && d.phase === 'inside') {
        // Dancing behind the cafe's window: x the place in it, y the window's bottom, turning now and then
        const turns: WDir[] = [2, 2, 1, 2, 3, 2, 0, 2];
        const dir = turns[Math.floor((now + w.id.charCodeAt(0) * 131) / 1300) % turns.length];
        a.push(Math.round(CAFE.inside[d.slot]), Math.round(CAFE.window.y + CAFE.window.h), WANIM.dance, dir, Math.round(w.alpha * 100));
      } else {
        a.push(Math.round(w.x), Math.round(w.y), this.animOf(w, now), w.dir, Math.round(w.alpha * this.doorAlpha(w) * 100));
      }
    }
    const someonePets = [...this.walkers.values()].some((w) => w.doing.kind === 'pet');
    return {
      t: now,
      ids,
      a,
      cat: { x: Math.round(this.cat.x), y: Math.round(this.cat.y), dir: this.cat.dir, walk: this.cat.doing.kind === 'wander' && !someonePets, hearts: someonePets },
      cam: Math.round(this.camAt(now) * 1000) / 1000,
      dark: Math.round(Math.max(0, this.dark) * 1000) / 1000,
      lamps: this.lampLit.reduce((bits, lit, i) => bits | (lit ? 1 << i : 0), 0),
      party: !!this.partyNow,
      fire: this.fireLit,
      cafeDoor: this.cafeDoorOpen,
      parasols: this.parasolOpen.reduce((bits, open, i) => bits | (open ? 1 << i : 0), 0),
    };
  }

  private animOf(w: Walker, now: number): number {
    const d = w.doing;
    switch (d.kind) {
      case 'wander':
      case 'goBench':
      case 'goPet':
      case 'goSleep':
      case 'goThrone':
      case 'descend':
      case 'goHall':
      case 'goPray':
      case 'goChat':
      case 'goSeat':
      case 'goRead':
      case 'goFish':
        return WANIM.walk;
      case 'seated':
        return WANIM.perch;
      case 'fish':
        if (!d.bite || now < d.bite) return WANIM.fish;
        return now < d.bite + BITE_MS ? WANIM.bite : now < d.bite + BITE_MS + CATCH_MS ? WANIM.catch : WANIM.idle;
      case 'lamps':
        return d.at ? WANIM.light : WANIM.walk;
      case 'kindle':
        return d.at ? WANIM.kindle : WANIM.walk;
      case 'parasol':
        // Reaching up to the parasol's crank, arms up
        return d.at ? WANIM.cheer : WANIM.walk;
      case 'coffee':
        return d.phase === 'inside' ? WANIM.inside : WANIM.walk;
      case 'party':
        return d.phase === 'stand' ? WANIM.drink : this.partyWalking(w, d) ? WANIM.walk : WANIM.idle;
      // The King before the throne: standing until all are there, his hands up to open the court,
      // a step back to the seat, seated, and up to cheer every few seconds. Whatever he wears: a piece without art for these poses is
      // just not drawn while they last.
      case 'throne':
        if (d.stage === 'hail') return now < d.until ? WANIM.cheer : WANIM.idle;
        if (d.stage === 'seat' || d.stage === 'rise') return WANIM.walk;
        if (d.stage === 'cheer') return WANIM.cheer;
        return d.stage === 'sit' ? WANIM.sit : WANIM.idle;
      // The others: standing in their place until the court opens, then on their knees (worn art
      // without sit sheets: they stay standing)
      case 'pray':
        return d.knelt && !w.noSit ? WANIM.pray : WANIM.idle;
      case 'visit':
        return this.walking(w, d) ? WANIM.walk : WANIM.idle;
      // (on a bench facing the front; on one seen from the side, sitting that way)
      case 'sit':
        return BENCHES[d.bench]?.dir === 2 ? WANIM.sit : WANIM.perch;
      case 'sleep':
        return WANIM.sleep;
      case 'pet':
        return WANIM.pet;
      case 'cheer':
        return WANIM.cheer;
      case 'chat':
        return this.chatPose(w, d, now);
      default:
        return WANIM.idle;
    }
  }

  /** Walk toward a point, around what stands in the way and over the bridge if it is across the river; true when there */
  private walkTo(w: Walker, tx: number, ty: number, speed: number, dt: number): boolean {
    // The town's river lies between: round its end at the town's edge first
    if (Math.hypot(w.x - BROOK_WAY.x, w.y - BROOK_WAY.y) > ARRIVE && crossesBrook(w.x, w.y, tx, ty)) {
      if (this.walkStraight(w, BROOK_WAY.x, BROOK_WAY.y, speed, dt)) Object.assign(w, BROOK_WAY);
      return false;
    }
    const via = bridgeWay(w, tx);
    if (!via) return this.walkStraight(w, tx, ty, speed, dt);
    // To the bridge's near end first, then over it (landing on each exactly, so the next leg starts from there)
    if (this.walkStraight(w, via.x, via.y, speed, dt)) Object.assign(w, via);
    return false;
  }

  /** Walk toward a point, around what stands in the way; true when there */
  private walkStraight(w: Walker, tx: number, ty: number, speed: number, dt: number): boolean {
    // A target inside something on the square can never be reached: the nearest spot beside it then
    ({ x: tx, y: ty } = standable(tx, ty));
    const dx = tx - w.x;
    const dy = ty - w.y;
    const d = Math.hypot(dx, dy);
    if (d < ARRIVE) return true;
    const step = Math.min(d, speed * dt);
    let ux = dx / d;
    let uy = dy / d;
    const o = this.inTheWay(w, ux, uy, d);
    if (o && blocked(w.x, w.y)) {
      // Pushed into it: straight out first, the shortest way (the edge's normal)
      const nx = (w.x - o.x) / (o.rx * o.rx);
      const ny = (w.y - o.y) / (o.ry * o.ry);
      const nl = Math.hypot(nx, ny) || 1;
      ux = nx / nl;
      uy = ny / nl;
    } else if (o) {
      // Turn just enough for the way ahead to be clear, to one side and the same side until past it
      // (changing sides every step gets nowhere). The side: the one that needs the smaller turn.
      const reach = Math.min(LOOK_AHEAD, d);
      const base = Math.atan2(uy, ux);
      const clear = (side: number, k: number) => !this.inTheWay(w, Math.cos(base + side * k * TURN_STEP), Math.sin(base + side * k * TURN_STEP), reach);
      if (!w.turn) {
        for (let k = 1; !w.turn && k <= TURN_STEPS; k++) w.turn = clear(1, k) ? 1 : clear(-1, k) ? -1 : 0;
        w.turn ||= 1;
      }
      let k = 1;
      while (k < TURN_STEPS && !clear(w.turn, k)) k++;
      ux = Math.cos(base + w.turn * k * TURN_STEP);
      uy = Math.sin(base + w.turn * k * TURN_STEP);
    } else {
      w.turn = 0;
    }
    w.x += ux * step;
    w.y += uy * step;
    w.dir = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 3 : 1) : uy > 0 ? 2 : 0;
    return false;
  }

  /**
   * What stands in the way of a straight walk toward the target, looking this far ahead (or the
   * thing the character stands in, if it got pushed into one): the line is tried every few units,
   * against everything grown by a small gap, so a walk along an edge does not cut through it
   */
  private inTheWay(w: Walker, ux: number, uy: number, dist: number): (typeof OBSTACLES)[number] | undefined {
    const here = obstacleAt(w.x, w.y);
    if (here) return here;
    const reach = Math.min(LOOK_AHEAD, dist);
    for (let s = 3; s <= reach; s += 3) {
      const o = obstacleAt(w.x + ux * s, w.y + uy * s, EDGE_GAP);
      if (o) return o;
    }
    return undefined;
  }

  /**
   * A character walking without getting anywhere (something in the way it cannot get around, or
   * others pushing back): a casual walk is dropped for something else; a walk that matters (the
   * ceremony, a shop, bed) slips past the others for a moment
   */
  private unstick(w: Walker, now: number): void {
    const walking = this.animOf(w, now) === WANIM.walk;
    if (!walking || Math.hypot(w.x - w.anchor.x, w.y - w.anchor.y) > STUCK_DIST) {
      w.anchor = { x: w.x, y: w.y, at: now };
      return;
    }
    if (now - w.anchor.at < STUCK_MS) return;
    w.anchor.at = now;
    const k = w.doing.kind;
    if (k === 'wander' || k === 'goBench' || k === 'goPet' || k === 'goChat' || k === 'goSeat' || k === 'goRead' || k === 'goFish') w.doing = idle(now, 300, 1200);
    else w.through = now + THROUGH_MS;
  }

  private step(w: Walker, now: number, dt: number, o: TownOptions): void {
    const d = w.doing;
    switch (d.kind) {
      case 'visit':
        this.stepVisit(w, d, now, dt, o);
        break;
      case 'wander':
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) {
          w.dir = Math.random() < 0.7 ? 2 : w.dir;
          w.doing = { kind: 'idle', until: now + rand(2000, 9000) };
        }
        break;
      case 'idle': {
        if (now < d.until) break;
        // Between two activities: the ceremony first (the King to the throne, the others to the
        // hall), then the shop
        if (this.summoned(w, now, o)) {
          w.doing = this.ceremonyPart(w);
          break;
        }
        if (w.errands.length) {
          w.doing = { kind: 'visit', place: w.errands[0], phase: 'go', seat: -1, since: 0, until: 0, dressAt: 0, dressed: false };
          break;
        }
        // A party on: most go to it
        // (except who went home from it already)
        if (this.partyNow && o.localMinutes < this.homeFromParty(w.id) && Math.random() < PARTY_CHANCE && this.goParty(w)) break;
        if (Math.random() < o.chatChance && this.startChat(w, now)) break;
        if (this.pickActivity(w, o)) break;
        const roll = Math.random();
        const all = [...this.walkers.values()];
        // Benches this character can see with a seat left (sitting there, or walking to it, takes the seat)
        const benches = w.noSit
          ? []
          : BENCHES.map((b, i) => ({ ...b, i })).filter(
              (b) =>
                Math.hypot(b.x - w.x, b.y - w.y) < ACTIVITIES.bench.radius &&
                all.filter((o) => (o.doing.kind === 'sit' || o.doing.kind === 'goBench') && o.doing.bench === b.i).length < ACTIVITIES.bench.capacity,
            );
        const petters = all.filter((o) => o.doing.kind === 'pet' || o.doing.kind === 'goPet').length;
        // (a cat that stopped in the fountain or under a tree is out of reach)
        const catInSight =
          !w.noSit && petters < ACTIVITIES.petCat.capacity && Math.hypot(this.cat.x - w.x, this.cat.y - w.y) < ACTIVITIES.petCat.radius && !blocked(this.cat.x, this.cat.y, STAND_CLEAR);
        if (roll < CHANCE.bench && benches.length) {
          const b = benches[Math.floor(Math.random() * benches.length)];
          w.doing = { kind: 'goBench', bench: b.i };
        } else if (roll < CHANCE.bench + CHANCE.cat && catInSight) {
          w.doing = { kind: 'goPet' };
        } else {
          const t = randSpot();
          w.doing = { kind: 'wander', tx: t.x, ty: t.y };
        }
        break;
      }
      case 'goBench': {
        const b = BENCHES[d.bench];
        const taken = [...this.walkers.values()].some((o) => o !== w && o.doing.kind === 'sit' && o.doing.bench === d.bench);
        if (!b || taken) {
          w.doing = { kind: 'idle', until: now + rand(300, 1200) };
          break;
        }
        if (this.walkTo(w, b.x, b.y, WALK_UPS, dt)) {
          w.x = b.x;
          w.y = b.y;
          w.dir = b.dir;
          w.doing = { kind: 'sit', bench: d.bench, until: now + rand(9000, 26_000) };
        }
        break;
      }
      case 'goPet': {
        // Beside the cat: on its left, or on its right when something stands there (the cat by a tree)
        const side = blocked(this.cat.x - 26, this.cat.y, STAND_CLEAR) ? 26 : -26;
        if (this.walkTo(w, this.cat.x + side, this.cat.y, WALK_UPS, dt)) {
          w.dir = this.cat.x > w.x ? 3 : 1;
          w.doing = { kind: 'pet', until: now + rand(3500, 7000) };
        }
        break;
      }
      case 'pet':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(800, 2500) };
        break;
      case 'goChat': {
        // The other one went off to something else, or it takes too long to meet: never mind
        if (!this.chatting(d.with, w.id) || now - d.since > CHAT_MEET_MS) {
          w.doing = idle(now, 300, 1200);
          break;
        }
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) {
          w.x = d.tx;
          w.y = d.ty;
          w.doing = { kind: 'chat', with: d.with, start: 0, until: 0, seed: 0 };
        }
        break;
      }
      case 'chat': {
        const other = this.walkers.get(d.with);
        if (!other || !this.chatting(d.with, w.id)) {
          w.doing = idle(now, 500, 1800);
          break;
        }
        // Face each other
        w.dir = other.x > w.x ? 3 : 1;
        // Both in place: the chat begins, for both at once
        if (!d.start && other.doing.kind === 'chat' && !other.doing.start) {
          const until = now + rand(o.chatMs[0], o.chatMs[1]);
          const seed = Math.floor(Math.random() * 1e6);
          Object.assign(d, { start: now, until, seed });
          Object.assign(other.doing, { start: now, until, seed });
        }
        if (d.start && now >= d.until) w.doing = idle(now, 800, 2500);
        break;
      }
      case 'sit':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(500, 2000) };
        break;
      case 'goSeat': {
        const s = SEATS[d.at][d.seat];
        // Taken by someone faster, or the place closed on the way (the cafe at night, a party starting): never mind
        if (this.seatTaken(d.at, d.seat, w) || (d.at === 'cafe' && !this.cafeOpen())) {
          w.doing = idle(now, 300, 1200);
          break;
        }
        if (this.walkTo(w, s.x, s.y, WALK_UPS, dt)) {
          Object.assign(w, { x: s.x, y: s.y, dir: s.dir });
          const night = d.at === 'fire' && this.fireLit;
          const [a, b] = SEAT_MS[night ? 'fireNight' : d.at];
          w.doing = { kind: 'seated', at: d.at, seat: d.seat, until: now + rand(a, b) };
        }
        break;
      }
      case 'seated':
        if (now >= d.until) w.doing = idle(now, 500, 2000);
        break;
      case 'goRead': {
        const s = BOARD_SPOTS[d.spot];
        if (this.walkTo(w, s.x, s.y, WALK_UPS, dt)) {
          Object.assign(w, { x: s.x, y: s.y, dir: 0 });
          w.doing = { kind: 'read', spot: d.spot, until: now + rand(READ_MS[0], READ_MS[1]) };
        }
        break;
      }
      case 'read':
        if (now >= d.until) w.doing = idle(now, 500, 1800);
        break;
      case 'goFish': {
        const s = FISH_SPOTS[d.spot];
        if (this.walkTo(w, s.x, s.y, WALK_UPS, dt)) {
          Object.assign(w, { x: s.x, y: s.y, dir: s.side > 0 ? 3 : 1 });
          const until = now + rand(FISH_MS[0], FISH_MS[1]);
          // Now and then a fish bites: pulled out and held up, then home with it (never with clothes that cannot cheer)
          const bite = !w.noCheer && Math.random() < BITE_SHARE ? now + rand(6000, until - now - 3000) : 0;
          w.doing = { kind: 'fish', spot: d.spot, until: bite ? bite + BITE_MS + CATCH_MS + 400 : until, bite };
        }
        break;
      }
      case 'fish':
        w.dir = FISH_SPOTS[d.spot].side > 0 ? 3 : 1;
        if (d.bite && !d.landed && now >= d.bite + BITE_MS) {
          d.landed = true;
          this.hooks.caught?.(w.id);
        }
        if (now >= d.until) w.doing = idle(now, 600, 1800);
        break;
      case 'parasol': {
        const t = CAFE.tables[d.table];
        // Done already (it went by itself), or not wanted that way anymore: never mind
        if (this.parasolOpen[d.table] === d.open || this.parasolWanted(d.table, o) !== d.open) {
          w.doing = idle(now, 400, 1200);
        } else if (!d.at) {
          if (this.walkTo(w, t.x, t.y + PARASOL_REACH, WALK_UPS, dt)) {
            Object.assign(w, { x: t.x, y: t.y + PARASOL_REACH, dir: 2 });
            d.at = now;
          }
        } else if (now - d.at >= PARASOL_MS) {
          this.parasolOpen[d.table] = d.open;
          w.doing = idle(now, 600, 1500);
        }
        break;
      }
      case 'coffee':
        this.stepCoffee(w, d, now, dt);
        break;
      case 'kindle':
        // Lit already (it caught on its own), or not wanted anymore: never mind
        if (this.fireLit || !this.fireWanted(o)) {
          w.doing = idle(now, 400, 1200);
        } else if (!d.at) {
          if (this.walkTo(w, KINDLE_AT.x, KINDLE_AT.y, WALK_UPS, dt)) {
            Object.assign(w, { ...KINDLE_AT, dir: 3 });
            d.at = now;
          }
        } else if (now - d.at >= KINDLE_MS) {
          this.fireLit = true;
          w.doing = idle(now, 800, 1800);
        }
        break;
      case 'lamps':
        this.stepLamplighter(w, d, now, dt);
        break;
      case 'party':
        this.stepPartyGoer(w, d, now, dt);
        break;
      case 'goSleep':
        if (this.walkTo(w, d.tx, d.ty, WALK_UPS, dt)) w.doing = { kind: 'sleep', night: d.night };
        break;
      case 'cheer':
        if (now >= d.until) w.doing = { kind: 'idle', until: now + rand(500, 1500) };
        break;
      case 'sleep':
        break;
      case 'goThrone': {
        // The ceremony ended on the way: back among the others
        if (!this.courtOpen()) {
          w.doing = this.offThrone(w, now);
          break;
        }
        // Onto the carpet first (in a hurry from far away), then up it at a king's pace, to stand
        // before the throne facing the hall
        if (!d.onCarpet) {
          const cx = Math.max(CARPET_START, Math.min(DAIS_FOOT - 30, w.x));
          if (this.walkTo(w, cx, CARPET_Y, this.pace(w, cx, CARPET_Y), dt)) d.onCarpet = true;
        } else if (this.walkTo(w, THRONE_STAND.x, THRONE_STAND.y, WALK_UPS, dt)) {
          w.x = THRONE_STAND.x;
          w.y = THRONE_STAND.y;
          w.dir = 1;
          w.doing = { kind: 'throne', stage: 'stand', until: 0 };
        }
        break;
      }
      case 'throne':
        if (!this.courtOpen()) {
          // The court is over: the King gets up after the others (one who never sat goes straight down)
          if (d.stage !== 'sit') w.doing = { kind: 'descend' };
          else if (!d.until) d.until = now + rand(2200, 3400);
          else if (now >= d.until) w.doing = { kind: 'descend' };
        } else if (d.stage === 'stand' && this.ceremony?.phase === 'court') {
          // The court opens: both hands up
          Object.assign(d, { stage: 'hail', until: now + HAIL_MS });
        } else if (d.stage === 'hail' && now >= d.until) {
          d.stage = 'seat';
        } else if (d.stage === 'seat') {
          // A step back onto the throne
          if (this.walkTo(w, THRONE_SEAT.x, THRONE_SEAT.y, WALK_UPS, dt)) {
            Object.assign(w, THRONE_SEAT);
            w.dir = 1;
            Object.assign(d, { stage: 'sit', until: 0, next: now + CHEER_EVERY_MS });
          }
        } else if (d.stage === 'sit' && now >= (d.next ?? 0)) {
          // Now and then up from the seat: a step forward, both hands up again, then back to sit
          d.stage = 'rise';
        } else if (d.stage === 'rise') {
          if (this.walkTo(w, THRONE_STAND.x, THRONE_STAND.y, WALK_UPS, dt)) {
            Object.assign(w, THRONE_STAND);
            w.dir = 1;
            Object.assign(d, { stage: 'cheer', until: now + HAIL_MS });
          }
        } else if (d.stage === 'cheer' && now >= d.until) {
          d.stage = 'seat';
        }
        break;
      case 'descend':
        // Down the stairs by the carpet, then off somewhere in town
        if (this.walkTo(w, DAIS_FOOT - 36, CARPET_Y, WALK_UPS, dt)) w.doing = this.backToTown(now);
        break;
      case 'goHall': {
        if (!this.courtOpen()) {
          w.doing = this.backToTown(now);
          break;
        }
        // To the bridge, each at its own y on it (all at the nearest end of the deck would walk in a
        // single file): whoever gets there first is given the place nearest the throne
        const tx = CROSSING.x0 - BRIDGE_ZONE + 10;
        const ty = (d.lane ??= bridgeLane());
        if (w.x >= CROSSING.x0 - BRIDGE_ZONE || this.walkTo(w, tx, ty, this.pace(w, tx, ty), dt)) {
          const spot = this.freeSpot();
          // No place left: stand around a while, then look again
          w.doing = spot >= 0 ? { kind: 'goPray', spot, inLane: false } : idle(now, 3000, 6000);
        }
        break;
      }
      case 'goPray': {
        if (!this.courtOpen()) {
          w.doing = this.backToTown(now);
          break;
        }
        const s = this.ceremony!.spots[d.spot];
        // Into its lane where the hall opens (or behind the place, when that is out by the river or on
        // the square), then along the lane to the place: the ones before went further in, nobody is in the way
        const entry = Math.min(CARPET_START + 2, s.x - 40);
        // A place in the hall: over the bridge at the y that lines up with its lane first
        if (!d.inLane && s.x > CROSSING.x1 && w.x <= CROSSING.x1) {
          const lane = laneForSpot(s.y);
          const bx = w.x < CROSSING.x0 ? CROSSING.x0 : CROSSING.x1 + 1;
          if (this.walkStraight(w, bx, lane, this.pace(w, entry, s.y), dt)) Object.assign(w, { x: bx, y: lane });
          break;
        }
        if (!d.inLane && w.x < entry - ARRIVE) {
          if (this.walkTo(w, entry, s.y, this.pace(w, entry, s.y), dt)) d.inLane = true;
          break;
        }
        d.inLane = true;
        if (this.walkTo(w, s.x, s.y, WALK_UPS, dt)) {
          w.x = s.x;
          w.y = s.y;
          w.dir = 3;
          w.doing = { kind: 'pray', spot: d.spot, until: 0, knelt: false };
        }
        break;
      }
      case 'pray': {
        // Down on the knees once the court opens, the ones nearest the throne first
        const c = this.ceremony;
        if (!d.knelt && c?.phase === 'court' && now >= c.since + (DAIS_FOOT - w.x) * 2.5) d.knelt = true;
        // The court is over: everyone gets up, one after the other, and goes back to town
        if (!d.until && !this.courtOpen()) d.until = now + rand(300, 2600);
        if (d.until && now >= d.until) w.doing = this.backToTown(now);
        break;
      }
    }
  }

  // ------------------------------------------------------------ chats

  /** This character is on its way to a chat with that one, or in it */
  private chatting(id: string, withId: string): boolean {
    const d = this.walkers.get(id)?.doing;
    return (d?.kind === 'goChat' || d?.kind === 'chat') && d.with === withId;
  }

  /**
   * Go chat with someone in sight who is standing around or wandering (and has no shop to go to):
   * both walk to a spot between them, side by side, and turn to each other. False: nobody to chat
   * with, or no room there.
   */
  private startChat(w: Walker, now: number): boolean {
    // Both on the square (not still walking in from the edge, nor out by the throne room)
    const onSquare = (c: Walker) => c.x >= TOWN_AREA.x0 && c.x <= TOWN_AREA.x1;
    if (this.ceremony || !onSquare(w)) return false;
    const free = [...this.walkers.values()].filter(
      (o) =>
        o !== w &&
        (o.doing.kind === 'idle' || o.doing.kind === 'wander') &&
        !o.errands.length &&
        !o.fading &&
        onSquare(o) &&
        Math.hypot(o.x - w.x, o.y - w.y) < ACTIVITIES.chat.radius,
    );
    if (!free.length) return false;
    const o = free[Math.floor(Math.random() * free.length)];
    // Halfway, kept on the square: the one on the left stands on the left
    const mx = Math.max(TOWN_AREA.x0 + CHAT_GAP, Math.min(TOWN_AREA.x1 - CHAT_GAP, (w.x + o.x) / 2));
    const my = Math.max(TOWN_AREA.y0 + 10, Math.min(TOWN_AREA.y1 - 10, (w.y + o.y) / 2));
    const [left, right] = w.x <= o.x ? [w, o] : [o, w];
    const spots = [
      { who: left, x: mx - CHAT_GAP / 2 },
      { who: right, x: mx + CHAT_GAP / 2 },
    ];
    // Not across the river, nor where something stands, nor hidden behind a tree's crown
    const hidden = (x: number) => TOWN_SCENE.trees.some((t) => Math.abs(x - t.x) < CROWN.half * t.size && my < t.y && my > t.y - CROWN.up * t.size);
    if (spots.some((s) => blocked(s.x, my, STAND_CLEAR) || wet(s.x, my) || bridgeWay(s.who, s.x) || hidden(s.x))) return false;
    for (const s of spots) {
      s.who.doing = { kind: 'goChat', with: (s.who === w ? o : w).id, tx: s.x, ty: my, since: now };
      s.who.wrapped = null;
    }
    return true;
  }

  /**
   * How a character in a chat stands right now: talking with the hands on its turn, listening (and
   * nodding) on the other's, and both laughing at the end of some turns. The two take turns from
   * the same clock and seed, so they always agree. Clothes without emote art (a dress, a cape) only
   * listen: their gestures would make the piece vanish.
   */
  private chatPose(w: Walker, d: Chat, now: number): number {
    if (!d.start || now >= d.until) return WANIM.idle;
    const t = now - d.start;
    const turn = Math.floor(t / CHAT_TURN_MS);
    // The same pick for both: a hash of the chat's seed and the turn
    const laughs = ((d.seed * 31 + turn * 977) % 1000) / 1000 < CHAT_LAUGH_SHARE;
    if (laughs && t % CHAT_TURN_MS > CHAT_TURN_MS - CHAT_LAUGH_MS) return w.noCheer ? WANIM.listen : WANIM.laugh;
    const first = (d.seed + (w.id < d.with ? 0 : 1)) % 2;
    return (turn + first) % 2 || w.noCheer ? WANIM.listen : WANIM.talk;
  }

  // ------------------------------------------------------------ the ceremony

  /** A ceremony is on (until the camera is back on the town) */
  get ceremonyOn(): boolean {
    return !!this.ceremony;
  }

  /** Where the ceremony is at (null: none is on) */
  get ceremonyPhase(): Ceremony['phase'] | null {
    return this.ceremony?.phase ?? null;
  }

  /** How dark the town is now (0 day, 1 night) */
  get darkness(): number {
    return Math.max(0, this.dark);
  }

  /** How many characters sleep for the night right now */
  get sleepingForTheNight(): number {
    return this.nightSleepers;
  }

  /** This guest's character is in the town (asleep or not): the King must be, for a ceremony to start on its own */
  inTown(id: string): boolean {
    return this.walkers.has(id);
  }

  /** Start a ceremony: the camera moves over to the throne room and the King is called, the others after him. False: one is on already */
  startCeremony(): boolean {
    if (this.ceremony) return false;
    const now = this.clock();
    this.ceremony = { phase: 'gather', since: now, open: 0, spots: [] };
    this.moveCam(1, now, PAN_MS);
    return true;
  }

  /** End the ceremony now: everyone gets up and goes home, and the camera follows them */
  endCeremony(): void {
    const c = this.ceremony;
    if (!c || c.phase === 'leave') return;
    const now = this.clock();
    Object.assign(c, { phase: 'leave', since: now });
    this.moveCam(0, now, PAN_BACK_MS, LEAVE_PAUSE_MS);
  }

  /** Everyone is gone (a new party): no ceremony, the camera back on the town at once */
  reset(): void {
    this.ceremony = null;
    this.cam = { from: 0, to: 0, at: 0, ms: 1 };
  }

  /**
   * The ceremony moves on. The King goes first: the others are called once he is in the throne
   * room (at once without a King in town, after a while if he does not come). The court opens when
   * everyone stands in place and the King before the throne (or after too long), lasts its time,
   * then everyone leaves.
   */
  private stepCeremony(now: number, o: TownOptions): void {
    const c = this.ceremony;
    if (!c) return;
    const waited = now - c.since;
    if (c.phase === 'court' && waited >= o.courtMs) this.endCeremony();
    else if (c.phase === 'leave' && now >= this.cam.at + this.cam.ms) this.ceremony = null;
    if (c.phase !== 'gather') return;
    const king = this.king ? this.walkers.get(this.king) : undefined;
    const crowd = [...this.walkers.values()].filter((w) => w.id !== this.king);
    if (!c.open) {
      const inHall = !!king && (king.doing.kind === 'throne' || (king.doing.kind === 'goThrone' && king.x >= CARPET_START));
      if (king && !inHall && waited < o.graceMs + KING_WAIT_MS) return;
      c.open = now;
      // As many rows on each side of the carpet as it takes to fit everyone inside the hall
      c.spots = praySpots(Math.min(PRAY_ROWS, Math.ceil(crowd.length / (PRAY_HALL_COLS * 2))));
      return;
    }
    // In place: everyone but those on a trip to a shop (they come after it and kneel as they arrive).
    // A full hall counts as everyone: who has no place left waits outside and does not hold it up.
    const full = this.freeSpot() < 0;
    const inPlace =
      crowd.every((w) => w.doing.kind === 'pray' || w.doing.kind === 'visit' || (full && w.doing.kind !== 'goPray')) && (!king || king.doing.kind === 'throne');
    if (waited >= PAN_MS && (inPlace || now - c.open >= o.graceMs + GATHER_EXTRA_MS)) Object.assign(c, { phase: 'court', since: now });
  }

  /** Send the camera somewhere from where it is now, after a pause */
  private moveCam(to: number, now: number, ms: number, pause = 0): void {
    this.cam = { from: this.camAt(now), to, at: now + pause, ms };
  }

  /** Where the camera is: it eases out of its place and into the new one */
  private camAt(now: number): number {
    const { from, to, at, ms } = this.cam;
    const t = Math.max(0, Math.min(1, (now - at) / ms));
    return from + (to - from) * t * t * (3 - 2 * t);
  }

  /** The throne room is open: a ceremony is on and not over yet */
  private courtOpen(): boolean {
    return !!this.ceremony && this.ceremony.phase !== 'leave';
  }

  /** This character is called to the ceremony (the King from the start, the others once he is in the throne room), and is not on its way or there yet */
  private summoned(w: Walker, now: number, o: TownOptions): boolean {
    const c = this.ceremony;
    if (!c || c.phase === 'leave') return false;
    if (c.phase === 'court' && now >= c.since + o.courtMs - LAST_CALL_MS) return false;
    if (w.id !== this.king && !c.open) return false;
    const k = w.doing.kind;
    return k !== 'goThrone' && k !== 'throne' && k !== 'descend' && k !== 'goHall' && k !== 'goPray' && k !== 'pray';
  }

  /** A character's part in the ceremony: the King goes to the throne, the others to the hall for a place along the carpet */
  private ceremonyPart(w: Walker): Doing {
    return w.id === this.king ? { kind: 'goThrone', onCarpet: false } : { kind: 'goHall' };
  }

  /** The free place nearest the throne: the places come in that order (-1: none left) */
  private freeSpot(): number {
    const taken = new Set<number>();
    for (const o of this.walkers.values()) if (o.doing.kind === 'goPray' || o.doing.kind === 'pray') taken.add(o.doing.spot);
    return (this.ceremony?.spots ?? []).findIndex((_, i) => !taken.has(i));
  }

  /** Walking speed to a point of the ceremony: in a hurry from far away, at a walk for the last stretch */
  private pace(w: Walker, x: number, y: number): number {
    return Math.hypot(x - w.x, y - w.y) > HURRY_FROM ? WALK_UPS * HURRY : WALK_UPS;
  }

  /** What a character on its way to the throne, or on it, does when that is over: down the stairs if it is up there */
  private offThrone(w: Walker, now: number): Doing {
    return w.x > DAIS_FOOT - 20 ? { kind: 'descend' } : idle(now, 400, 1200);
  }

  /** After the ceremony: off to a spot in town. While it is still on (a King who lost the title): a moment, then to kneel */
  private backToTown(now: number): Doing {
    if (this.courtOpen()) return idle(now, 300, 900);
    const t = randSpot();
    return { kind: 'wander', tx: t.x, ty: t.y };
  }

  /**
   * Where a character lies down to sleep: along the nearest edge of the town (a second row a little
   * further in when it fills up, the other edge when that is full too), where it has the most room
   * from the others asleep or on their way to bed. On the right, clear of the way to the throne
   * room's carpet, of the campfire and of the river.
   */
  private bedFor(w: Walker): { x: number; y: number } {
    const others: { x: number; y: number }[] = [];
    for (const o of this.walkers.values()) {
      if (o === w) continue;
      if (o.doing.kind === 'goSleep') others.push({ x: o.doing.tx, y: o.doing.ty });
      else if (o.doing.kind === 'sleep') others.push(o);
    }
    const near = w.x >= TOWN.w / 2;
    let best = { x: near ? TOWN.w - 50 : 50, y: rand(TOWN_AREA.y0 + 40, CARPET_Y - 70) };
    let bestScore = -Infinity;
    for (let k = 0; k < 160; k++) {
      const right = k < 100 ? near : !near;
      const inner = k % 3 === 2;
      const x = right ? TOWN.w - (inner ? 125 : 55) + rand(-12, 12) : (inner ? 125 : 55) + rand(-12, 12);
      const y = rand(TOWN_AREA.y0 + 40, TOWN_AREA.y1 - 20);
      // (a sleeper lies toward the middle: the whole body clear of the river, the logs and the carpet's way)
      if (right && (Math.abs(y - CARPET_Y) < 70 || y > CAMPFIRE.y - 60)) continue;
      // (and on the left, below the town hall's front: a sleeper lies on the square, not across its steps)
      if (!right && y < (TOWN_HALL.y + TOWN_HALL.h) * SPRITE_SCALE + 30) continue;
      if (blocked(x, y, 10) || wet(x, y) || wet(x + (right ? -60 : 60), y)) continue;
      // Lying down, a body takes room sideways: other sleepers count closer above and below than beside
      const room = others.reduce((m, o) => Math.min(m, Math.hypot((x - o.x) * 0.5, y - o.y)), 200);
      const score = Math.min(room, 45) - (right !== near ? 12 : 0) - (inner ? 6 : 0) + Math.random();
      if (score > bestScore) [best, bestScore] = [{ x, y }, score];
    }
    return best;
  }

  // ------------------------------------------------------------ the town's places

  /**
   * Maybe off to one of the town's places: the fountain's rim, the cafe's terrace, the notice board,
   * the river's bank, the campfire, each with its chance (see CHANCE). One that is off, out of sight
   * or full is not gone to this time. False: none of them this time.
   */
  private pickActivity(w: Walker, o: TownOptions): boolean {
    const a = o.activities;
    const seat = (at: SeatAt, radius: number): Doing | null => {
      const free = SEATS[at].map((s, i) => ({ ...s, i })).filter((s) => !this.seatTaken(at, s.i, w) && (!radius || Math.hypot(s.x - w.x, s.y - w.y) < radius));
      return free.length ? { kind: 'goSeat', at, seat: free[Math.floor(Math.random() * free.length)].i } : null;
    };
    const spot = (list: { x: number; y: number }[], taken: (o: Walker, i: number) => boolean, radius: number): number => {
      const free = list.map((s, i) => ({ ...s, i })).filter((s) => ![...this.walkers.values()].some((o) => o !== w && taken(o, s.i)) && (!radius || Math.hypot(s.x - w.x, s.y - w.y) < radius));
      return free.length ? free[Math.floor(Math.random() * free.length)].i : -1;
    };
    const options: [boolean, number, () => Doing | null][] = [
      [a.fountain && !w.noSit, CHANCE.fountain, () => seat('fountain', ACTIVITIES.fountain.radius)],
      [
        a.cafe && !w.noSit && this.cafeOpen(),
        CHANCE.cafe,
        () => {
          // Often a coffee from inside first, the chair held meanwhile (a few at the counter at most)
          const d = seat('cafe', 0);
          const atCounter = [...this.walkers.values()].filter((o) => o.doing.kind === 'coffee').length;
          return d?.kind === 'goSeat' && Math.random() < COFFEE_SHARE && atCounter < COFFEE_COUNTER.length
            ? { kind: 'coffee', seat: d.seat, phase: 'go', until: 0, cut: 0 }
            : d;
        },
      ],
      [
        a.board,
        CHANCE.board,
        () => {
          const i = spot(BOARD_SPOTS, (o, i) => (o.doing.kind === 'goRead' || o.doing.kind === 'read') && o.doing.spot === i, ACTIVITIES.board.radius);
          return i < 0 ? null : { kind: 'goRead', spot: i };
        },
      ],
      [
        a.fish,
        CHANCE.fish,
        () => {
          const i = spot(FISH_SPOTS, (o, i) => (o.doing.kind === 'goFish' || o.doing.kind === 'fish') && o.doing.spot === i, 0);
          return i < 0 ? null : { kind: 'goFish', spot: i };
        },
      ],
      [a.fire && !w.noSit, this.fireLit ? CHANCE.fireAtNight : CHANCE.fire, () => seat('fire', 0)],
    ];
    let roll = Math.random();
    for (const [on, chance, start] of options) {
      if (roll < chance) {
        const d = on ? start() : null;
        if (d) w.doing = d;
        return !!d;
      }
      roll -= chance;
    }
    return false;
  }

  /** Someone else sits on this seat, or is on the way to it */
  private seatTaken(at: SeatAt, seat: number, except: Walker): boolean {
    for (const o of this.walkers.values()) {
      if (o === except) continue;
      const d = o.doing;
      if ((d.kind === 'goSeat' || d.kind === 'seated') && d.at === at && d.seat === seat) return true;
      if (d.kind === 'coffee' && at === 'cafe' && d.seat === seat) return true;
    }
    return false;
  }

  /** The cafe's terrace is open: in the day, and on a party night */
  private cafeOpen(): boolean {
    return this.dark < CAFE_OPEN_DARK || !!this.partyNow;
  }

  // ------------------------------------------------------------ the lamplighter

  /** The lamp nearest a point that is not lit (`lit`) or not out yet (-1: none left) */
  private nextLamp(x: number, y: number, lit: boolean): number {
    let best = -1;
    let dist = Infinity;
    TOWN_SCENE.lamps.forEach((l, i) => {
      const d = Math.hypot(l.x - x, l.y - y);
      if (this.lampLit[i] !== lit && d < dist) [best, dist] = [i, d];
    });
    return best;
  }

  /**
   * The lamp posts are lit from nightfall and put out in the morning. Someone free (the one nearest
   * a lamp left) goes round them with a pole; with the lamplighter off, during a ceremony, or nobody
   * free for a while, they switch themselves, one after the other.
   */
  private stepLamps(now: number, o: TownOptions): void {
    const want = this.dark >= LAMPS_DARK;
    if (!this.lampLit.some((lit) => lit !== want)) {
      this.lampWait = 0;
      return;
    }
    const all = [...this.walkers.values()];
    if (all.some((w) => w.doing.kind === 'lamps' && w.doing.lit === want)) return;
    this.lampWait ||= now;
    if (o.lamplighter && !this.ceremony && now - this.lampWait < LAMP_WAIT_MS) {
      let best: Walker | null = null;
      let lamp = -1;
      let dist = Infinity;
      for (const w of all) {
        const free = (w.doing.kind === 'idle' || w.doing.kind === 'wander') && !w.errands.length && !w.fading && w.x >= TOWN_AREA.x0 && w.x <= TOWN_AREA.x1;
        if (!free) continue;
        const j = this.nextLamp(w.x, w.y, want);
        const d = j < 0 ? Infinity : Math.hypot(TOWN_SCENE.lamps[j].x - w.x, TOWN_SCENE.lamps[j].y - w.y);
        if (d < dist) [best, lamp, dist] = [w, j, d];
      }
      if (best) {
        best.doing = { kind: 'lamps', lamp, at: 0, lit: want };
        best.wrapped = null;
      }
    } else if (now - this.lampAuto >= LAMP_AUTO_MS) {
      this.lampLit[this.lampLit.findIndex((lit) => lit !== want)] = want;
      this.lampAuto = now;
    }
  }

  /** The lamplighter's round: to the nearest lamp left, the pole up to it for a moment, then on to the next */
  private stepLamplighter(w: Walker, d: Lamps, now: number, dt: number): void {
    // The light turned while on the round (or the last lamp is done): it ends here
    if ((this.dark >= LAMPS_DARK) !== d.lit) {
      w.doing = idle(now, 300, 900);
      return;
    }
    if (!d.at && this.lampLit[d.lamp] === d.lit) {
      const j = this.nextLamp(w.x, w.y, d.lit);
      if (j < 0) {
        w.doing = idle(now, 600, 1600);
        return;
      }
      d.lamp = j;
    }
    const l = TOWN_SCENE.lamps[d.lamp];
    if (!d.at) {
      if (this.walkTo(w, l.x - LAMP_REACH, l.y + 3, WALK_UPS, dt)) {
        Object.assign(w, { x: l.x - LAMP_REACH, y: l.y + 3, dir: 3 });
        d.at = now;
      }
    } else if (now - d.at >= LIGHT_MS) {
      this.lampLit[d.lamp] = d.lit;
      d.at = 0;
    }
  }

  // ------------------------------------------------------------ a coffee at the cafe

  /** Where at the counter (x behind the window) a customer stands: the places taken in the order they came in */
  private counterAt(w: Walker): number {
    const inside = [...this.walkers.values()].filter((o) => o.doing.kind === 'coffee' && o.doing.phase === 'inside');
    const k = Math.max(0, inside.indexOf(w)) % COFFEE_COUNTER.length;
    return CAFE.window.x + CAFE.window.w * COFFEE_COUNTER[k];
  }

  /** Getting a coffee: to the door, in (the door opens for the day, if it was not yet), at the counter, out, then to the chair held */
  private stepCoffee(w: Walker, d: Coffee, now: number, dt: number): void {
    switch (d.phase) {
      case 'go':
        // Closed meanwhile (night fell): never mind
        if (!this.cafeOpen()) w.doing = idle(now, 300, 900);
        else if (this.walkTo(w, CAFE.front.x, CAFE.front.y, WALK_UPS, dt)) d.phase = 'enter';
        break;
      case 'enter':
        if (this.walkTo(w, CAFE.door.x, CAFE.door.y, WALK_UPS, dt)) {
          const stay = now + rand(COFFEE_MS[0], COFFEE_MS[1]);
          Object.assign(d, { phase: 'inside', until: d.cut ? Math.min(stay, d.cut) : stay });
          this.cafeDoorOpen = true;
        }
        break;
      case 'inside':
        if (now >= d.until) d.phase = 'exit';
        break;
      case 'exit':
        // Out, then off to the chair with the coffee
        if (this.walkTo(w, CAFE.front.x - 30, CAFE.front.y + 22, WALK_UPS, dt)) w.doing = { kind: 'goSeat', at: 'cafe', seat: d.seat };
        break;
    }
  }

  // ------------------------------------------------------------ the cafe's parasols

  /**
   * A parasol should be open now: from some time in the morning to some time around nightfall,
   * different every day and for each table (see PARASOL_DAY), and all through a party
   */
  private parasolWanted(table: number, o: TownOptions): boolean {
    if (this.partyNow) return true;
    if (!o.dayNight.on) return true;
    const m = o.localMinutes;
    const day = Math.floor(m / 1440);
    const t = m - day * 1440;
    const dawn = minuteOf(o.dayNight.dawn);
    const dusk = minuteOf(o.dayNight.dusk);
    const open = dawn + PARASOL_DAY.open[0] + hash01(`parasol:${table}:${day}:up`) * (PARASOL_DAY.open[1] - PARASOL_DAY.open[0]);
    const close = dusk + PARASOL_DAY.close[0] + hash01(`parasol:${table}:${day}:down`) * (PARASOL_DAY.close[1] - PARASOL_DAY.close[0]);
    return close > open ? t >= open && t < close : t >= open || t < close;
  }

  /**
   * The cafe's parasols: when one should be open or folded and is not, someone free (the one
   * nearest) goes and does it; nobody free for a while (or during a ceremony), it goes by itself
   */
  private stepParasols(now: number, o: TownOptions): void {
    const all = [...this.walkers.values()];
    CAFE.tables.forEach((t, i) => {
      const want = this.parasolWanted(i, o);
      if (this.parasolOpen[i] === want) {
        this.parasolWait[i] = 0;
        return;
      }
      if (all.some((w) => w.doing.kind === 'parasol' && w.doing.table === i)) return;
      this.parasolWait[i] ||= now;
      if (this.ceremony || now - this.parasolWait[i] >= PARASOL_WAIT_MS) {
        this.parasolOpen[i] = want;
        return;
      }
      let best: Walker | null = null;
      let dist = Infinity;
      for (const w of all) {
        const free = (w.doing.kind === 'idle' || w.doing.kind === 'wander') && !w.errands.length && !w.fading && !w.noCheer && w.x >= TOWN_AREA.x0 && w.x <= TOWN_AREA.x1;
        const d = Math.hypot(w.x - t.x, w.y - t.y);
        if (free && d < dist) [best, dist] = [w, d];
      }
      if (best) {
        best.doing = { kind: 'parasol', table: i, open: want, at: 0 };
        best.wrapped = null;
      }
    });
  }

  // ------------------------------------------------------------ the campfire

  /**
   * The campfire should burn now: on its nights (2 in 3, the same ones every time), and on some
   * days for a couple of hours from a time of its own. Never with the campfire off.
   */
  private fireWanted(o: TownOptions): boolean {
    if (!o.activities.fire) return false;
    const m = o.localMinutes;
    if (this.dark >= 0.5) {
      // Which night: counted from noon, so the hours after midnight belong to the evening before
      const night = Math.floor((m - 12 * 60) / 1440);
      return hash01(`fire:${night}`) < FIRE_NIGHTS;
    }
    const day = Math.floor(m / 1440);
    if (hash01(`dayfire:${day}`) >= FIRE_DAYS) return false;
    const from = DAY_FIRE.from + hash01(`dayfire:${day}:at`) * (DAY_FIRE.to - DAY_FIRE.from);
    const t = m - day * 1440;
    return t >= from && t < from + DAY_FIRE.lasts;
  }

  /**
   * The campfire: when it should burn and does not yet, someone free (the one nearest) goes and
   * lights it; nobody free for a while (or during a ceremony), it catches on its own. When it should
   * not burn anymore it goes out.
   */
  private stepFire(now: number, o: TownOptions): void {
    if (!this.fireWanted(o)) {
      this.fireLit = false;
      this.fireWait = 0;
      return;
    }
    if (this.fireLit) return;
    const all = [...this.walkers.values()];
    if (all.some((w) => w.doing.kind === 'kindle')) return;
    this.fireWait ||= now;
    if (this.ceremony || now - this.fireWait >= KINDLE_WAIT_MS) {
      this.fireLit = true;
      return;
    }
    let best: Walker | null = null;
    let dist = Infinity;
    for (const w of all) {
      const free = (w.doing.kind === 'idle' || w.doing.kind === 'wander') && !w.errands.length && !w.fading && !w.noSit && w.x >= TOWN_AREA.x0 && w.x <= TOWN_AREA.x1;
      const d = Math.hypot(w.x - KINDLE_AT.x, w.y - KINDLE_AT.y);
      if (free && d < dist) [best, dist] = [w, d];
    }
    if (best) {
      best.doing = { kind: 'kindle', at: 0 };
      best.wrapped = null;
    }
  }

  // ------------------------------------------------------------ the party

  /** Whether a party is on at the cafe: one the host started, or one on its own on its night (unless the host ended it) */
  private stepParty(o: TownOptions): void {
    this.lastMinutes = o.localMinutes;
    this.lastPartyHours = o.party.hours;
    if (o.localMinutes < this.partyUntil) {
      this.partyNow = { night: `now${this.partyFrom}`, from: this.partyFrom, until: this.partyUntil };
      return;
    }
    const p = o.party.on && o.dayNight.on ? partyAt(o.localMinutes, o.dayNight.dusk, o.party.everyDays, o.party.hours, o.party.chance) : null;
    const from = p ? p.night * 1440 + minuteOf(o.dayNight.dusk) : 0;
    this.partyNow = p?.on && `${p.night}` !== this.partyStopped ? { night: `${p.night}`, from, until: from + o.party.hours * 60 } : null;
  }

  /**
   * This guest's character is at the party, or staying up for it: one of the party's guests (the
   * same ones all through one party) who has not gone home yet. Some stay to the end; the others go
   * home one by one from a third of the way in (see PARTY_TO_THE_END).
   */
  private upForParty(id: string, o: TownOptions): boolean {
    const p = this.partyNow;
    if (!p || hash01(`${id}:${p.night}:party`) >= o.party.goers) return false;
    return o.localMinutes < this.homeFromParty(id);
  }

  /** When this character goes home from the party now on (town minutes; the party's end for those who stay to the end) */
  private homeFromParty(id: string): number {
    const p = this.partyNow;
    if (!p) return -Infinity;
    const k = hash01(`${id}:${p.night}:home`);
    if (k < PARTY_TO_THE_END) return p.until;
    return p.from + (p.until - p.from) * (1 / 3 + ((2 / 3) * (k - PARTY_TO_THE_END)) / (1 - PARTY_TO_THE_END));
  }

  /** A party is on at the cafe */
  get partyOn(): boolean {
    return !!this.partyNow;
  }

  /** The host throws a party now, for the party's usual length. False: one is on already */
  startParty(): boolean {
    if (this.partyNow) return false;
    this.partyFrom = this.lastMinutes;
    this.partyUntil = this.lastMinutes + this.lastPartyHours * 60;
    this.partyNow = { night: `now${this.partyFrom}`, from: this.partyFrom, until: this.partyUntil };
    return true;
  }

  /** The host ends the party now: everyone comes out and goes on (to bed, at night) */
  endParty(): void {
    if (!this.partyNow) return;
    if (this.lastMinutes < this.partyUntil) this.partyUntil = 0;
    else this.partyStopped = this.partyNow.night;
    this.partyNow = null;
  }

  /** Off to the party: a place inside to dance (the window shows them), or out on the terrace with a drink. False: no room left */
  private goParty(w: Walker): boolean {
    if (this.ceremony) return false;
    const inside = this.partyPlace(true);
    const outside = this.partyPlace(false);
    if (inside >= 0 && (outside < 0 || Math.random() < PARTY_INSIDE)) w.doing = { kind: 'party', phase: 'go', slot: inside, until: 0, cut: 0 };
    else if (outside >= 0) w.doing = { kind: 'party', phase: 'terrace', slot: outside, until: 0, cut: 0 };
    else return false;
    return true;
  }

  /** A free place at the party, inside the cafe or out on its terrace (-1: none) */
  private partyPlace(inside: boolean): number {
    const taken = new Set<number>();
    for (const o of this.walkers.values()) {
      const d = o.doing;
      if (d.kind !== 'party' || d.phase === 'exit') continue;
      if ((d.phase === 'go' || d.phase === 'enter' || d.phase === 'inside') === inside) taken.add(d.slot);
    }
    const free = (inside ? CAFE.inside : CAFE.terrace).map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  /** On the move at the party (else dancing inside, or standing with a drink) */
  private partyWalking(_w: Walker, d: Party): boolean {
    return d.phase !== 'inside' && d.phase !== 'stand';
  }

  private stepPartyGoer(w: Walker, d: Party, now: number, dt: number): void {
    // Over (the night ends, the host ends it): out of the cafe, off the terrace
    const over = !this.partyNow;
    switch (d.phase) {
      case 'go':
        if (over) w.doing = idle(now, 300, 900);
        else if (this.walkTo(w, CAFE.front.x, CAFE.front.y, WALK_UPS, dt)) d.phase = 'enter';
        break;
      case 'enter':
        if (this.walkTo(w, CAFE.door.x, CAFE.door.y, WALK_UPS, dt)) {
          const stay = now + rand(PARTY_INSIDE_MS[0], PARTY_INSIDE_MS[1]);
          Object.assign(d, { phase: 'inside', until: d.cut ? Math.min(stay, d.cut) : stay });
          this.cafeDoorOpen = true;
        }
        break;
      case 'inside':
        if (now >= d.until || over) {
          d.phase = 'exit';
          w.dir = 2;
        }
        break;
      case 'exit':
        // Out, and a step aside from the door
        if (this.walkTo(w, CAFE.front.x + (w.id.charCodeAt(0) % 2 ? 36 : -36), CAFE.front.y + 18, WALK_UPS, dt)) w.doing = idle(now, 800, 2000);
        break;
      case 'terrace': {
        const s = CAFE.terrace[d.slot];
        if (over) w.doing = idle(now, 300, 900);
        else if (this.walkTo(w, s.x, s.y, WALK_UPS, dt)) {
          Object.assign(w, { x: s.x, y: s.y, dir: s.dir });
          Object.assign(d, { phase: 'stand', until: now + rand(PARTY_OUTSIDE_MS[0], PARTY_OUTSIDE_MS[1]) });
        }
        break;
      }
      case 'stand':
        w.dir = CAFE.terrace[d.slot].dir;
        if (now >= d.until || over) w.doing = idle(now, 600, 1600);
        break;
    }
  }

  // ------------------------------------------------------------ shop visits

  /** What calls this character away (the ceremony, a shop trip), or null when nothing does */
  private callOf(w: Walker, now: number, o: TownOptions): 'ceremony' | 'errand' | null {
    if (this.summoned(w, now, o)) return 'ceremony';
    if (w.errands.length) return 'errand';
    return null;
  }

  /**
   * A character called away (the ceremony, a shop to go to): what is as important as the call, or
   * more, is carried on. Below it, wandering or a bench is dropped within a moment; another activity
   * about to end on its own is finished, a longer one wraps up early if it can be cut short,
   * otherwise the call waits. The ceremony gives everyone its grace time to get going: what ends
   * within it is finished, the rest ends early and never later. What was called for starts from
   * idle, between two activities (see step).
   */
  private plan(w: Walker, now: number, o: TownOptions): void {
    const call = this.callOf(w, now, o);
    if (call === null || w.wrapped === w.doing) return;
    const d = w.doing;
    // Just arriving from beyond the edge of town: in first, it would stop out of the picture
    if (d.kind === 'wander' && (w.x < TOWN_AREA.x0 || w.x > TOWN_AREA.x1) && w.x < CROSSING.x0) return;
    const rule = this.rule(w);
    if (rule.priority >= PRIORITY[call]) return;
    const finishWithin = call === 'ceremony' ? o.graceMs : o.finishWithinMs;
    const within = (ms: number) => (call === 'ceremony' ? Math.min(ms, o.graceMs) : ms);
    // Standing around: a moment to notice, and off
    if (d.kind === 'idle') rule.wrapUp!(d, w, now, rand(300, 1200));
    else if (rule.quickStop) rule.quickStop(d, w, now, within(rand(o.quickStopMs[0], o.quickStopMs[1])));
    else if (rule.left(d, w, now) >= finishWithin && rule.wrapUp) rule.wrapUp(d, w, now, within(rand(o.wrapUpMs[0], o.wrapUpMs[1])));
    // What it was swapped for (the pause after a walk) already has its time: it is not cut short again
    w.wrapped = w.doing;
  }

  /** The visits of a shop in some phases */
  private visits(place: PlaceId, ...phases: Visit['phase'][]): Visit[] {
    const out: Visit[] = [];
    for (const o of this.walkers.values()) if (o.doing.kind === 'visit' && o.doing.place === place && phases.includes(o.doing.phase)) out.push(o.doing);
    return out;
  }

  /** The queue at a shop's door, first come first */
  private queue(place: PlaceId): Visit[] {
    return this.visits(place, 'queue').sort((a, b) => a.since - b.since);
  }

  /** A free place inside the shop (going in or inside holds one), or -1 */
  private freeSeat(place: PlaceId): number {
    const taken = new Set(this.visits(place, 'enter', 'inside').map((v) => v.seat));
    return TOWN_PLACES[place].seats.findIndex((_, i) => !taken.has(i));
  }

  private stepVisit(w: Walker, d: Visit, now: number, dt: number, o: TownOptions): void {
    const p = TOWN_PLACES[d.place];
    switch (d.phase) {
      case 'go':
      case 'queue': {
        // Changed back on the phone before getting in: no need to go anymore
        if (!w.errands.includes(d.place)) {
          w.doing = idle(now, 300, 900);
          break;
        }
        if (d.phase === 'go') {
          // At the door: in if there is room and nobody waits, else at the end of the queue
          const there = this.walkTo(w, p.front.x, p.front.y + QUEUE_GAP / 2, WALK_UPS, dt);
          if (there || Math.hypot(w.x - p.front.x, w.y - p.front.y) < QUEUE_GAP) {
            const seat = this.freeSeat(d.place);
            if (seat >= 0 && !this.queue(d.place).length) Object.assign(d, { phase: 'enter', seat });
            else Object.assign(d, { phase: 'queue', since: now });
          }
          break;
        }
        const rank = this.queue(d.place).indexOf(d);
        const seat = rank === 0 ? this.freeSeat(d.place) : -1;
        if (seat >= 0) {
          Object.assign(d, { phase: 'enter', seat });
          break;
        }
        // A line down from the door, everyone facing the shop
        if (this.walkTo(w, p.front.x, p.front.y + QUEUE_GAP * (rank + 1), WALK_UPS, dt)) w.dir = 0;
        break;
      }
      case 'enter':
        if (this.walkTo(w, p.door.x, p.door.y, WALK_UPS, dt)) {
          const stay = rand(o.insideMs[0], o.insideMs[1]);
          const dressAt = now + stay * 0.35;
          Object.assign(d, { phase: 'inside', until: Math.max(now + stay, dressAt + CHANGE_MS), dressAt });
        }
        break;
      case 'inside':
        if (!d.dressed && now >= d.dressAt) {
          d.dressed = true;
          this.hooks.dress(w.id, d.place);
        }
        if (now >= d.until) {
          // Once more on the way out: a change made while inside is taken too, without a second trip
          this.hooks.dress(w.id, d.place);
          d.phase = 'exit';
          w.dir = 2;
        }
        break;
      case 'exit':
        // Out, and a step aside from the door to show the new look
        if (this.walkTo(w, p.front.x + (w.id.charCodeAt(0) % 2 ? 40 : -40), p.front.y + 16, WALK_UPS, dt)) {
          w.dir = 2;
          w.doing = idle(now, 1800, 3200);
        }
        break;
    }
  }

  /** On the move during a visit (else standing in the queue) */
  private walking(w: Walker, d: Visit): boolean {
    if (d.phase !== 'queue') return d.phase !== 'inside';
    const p = TOWN_PLACES[d.place];
    const rank = this.queue(d.place).indexOf(d);
    return Math.hypot(w.x - p.front.x, w.y - (p.front.y + QUEUE_GAP * (rank + 1))) >= ARRIVE;
  }

  /** Going through a shop door: faded by how close to it */
  private doorAlpha(w: Walker): number {
    const d = w.doing;
    if (d.kind === 'coffee') return d.phase === 'enter' || d.phase === 'exit' ? Math.max(0, Math.min(1, Math.hypot(w.x - CAFE.door.x, w.y - CAFE.door.y) / DOOR_FADE)) : 1;
    if (d.kind === 'party') return d.phase === 'enter' || d.phase === 'exit' ? Math.max(0, Math.min(1, Math.hypot(w.x - CAFE.door.x, w.y - CAFE.door.y) / DOOR_FADE)) : 1;
    if (d.kind !== 'visit' || (d.phase !== 'enter' && d.phase !== 'exit')) return 1;
    const p = TOWN_PLACES[d.place];
    return Math.max(0, Math.min(1, Math.hypot(w.x - p.door.x, w.y - p.door.y) / DOOR_FADE));
  }

  /** Facing inside: turning around before the mirror at the clothes shop, still in the barber's chair */
  private insideDir(w: Walker, d: Visit, now: number): WDir {
    if (d.place === 'barber') return 2;
    const turns: WDir[] = [2, 2, 1, 2, 3, 0, 2];
    return turns[Math.floor((now + w.id.charCodeAt(0) * 97) / 800) % turns.length];
  }

  /** Push standing characters apart so nobody overlaps anyone */
  private separate(): void {
    // Not the ones sitting, lying, crouching or kneeling, nor the King on the carpet and the dais,
    // nor on a shop's steps (going in, inside, coming out), nor one slipping past the others (it was stuck)
    const list = [...this.walkers.values()].filter(
      (w) =>
        this.last >= w.through &&
        w.doing.kind !== 'sit' &&
        w.doing.kind !== 'sleep' &&
        w.doing.kind !== 'pet' &&
        w.doing.kind !== 'throne' &&
        w.doing.kind !== 'descend' &&
        !(w.doing.kind === 'goThrone' && w.doing.onCarpet) &&
        w.doing.kind !== 'pray' &&
        !(w.doing.kind === 'visit' && (w.doing.phase === 'enter' || w.doing.phase === 'inside' || w.doing.phase === 'exit')) &&
        // Nor on a seat, fishing on the bank, at a lamp with the pole, at the party past its door or in their spot on the terrace
        w.doing.kind !== 'seated' &&
        w.doing.kind !== 'fish' &&
        !(w.doing.kind === 'lamps' && w.doing.at) &&
        !(w.doing.kind === 'kindle' && w.doing.at) &&
        !(w.doing.kind === 'parasol' && w.doing.at) &&
        !(w.doing.kind === 'party' && w.doing.phase !== 'go' && w.doing.phase !== 'terrace') &&
        !(w.doing.kind === 'coffee' && w.doing.phase !== 'go'),
    );
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * 2.2; // Depth counts more: same depth means standing on each other
        const d = Math.hypot(dx, dy);
        if (d >= PERSONAL_SPACE || d === 0) continue;
        const push = ((PERSONAL_SPACE - d) / d) * 0.5;
        a.x = clampX(a.x - dx * push, a.x);
        b.x = clampX(b.x + dx * push, b.x);
        a.y = clampY(a.y - (dy / 2.2) * push);
        b.y = clampY(b.y + (dy / 2.2) * push);
      }
    }
    // Pushed into the fountain: back out to its edge; pushed off the bridge: back onto it
    for (const w of list) {
      keepOut(w);
      keepDry(w);
      if (w.x >= CROSSING.x0 && w.x <= CROSSING.x1) w.y = onBridge(w.y);
    }
  }

  private stepCat(now: number, dt: number): void {
    const petted = [...this.walkers.values()].some((w) => w.doing.kind === 'pet' || w.doing.kind === 'goPet');
    const c = this.cat;
    if (petted) return; // It likes it: it stays
    if (c.doing.kind === 'wander') {
      const d = c.doing;
      const dx = d.tx - c.x;
      const dist = Math.abs(dx) + Math.abs(d.ty - c.y);
      if (dist < ARRIVE) {
        c.doing = { kind: 'idle', until: now + rand(4000, 16_000) };
        return;
      }
      const step = Math.min(dist, CAT_UPS * dt);
      const len = Math.hypot(dx, d.ty - c.y) || 1;
      c.x += (dx / len) * step;
      c.y += ((d.ty - c.y) / len) * step;
      c.dir = dx > 0 ? 3 : 1;
    } else if (c.doing.kind === 'idle' && now >= c.doing.until) {
      const t = randSpot();
      c.doing = { kind: 'wander', tx: t.x, ty: t.y };
    }
  }
}

/** Keep a pushed character on the square; one out in the throne room (`from`: where it was) stays out there, short of the dais */
const clampX = (x: number, from: number) => Math.max(TOWN_AREA.x0, Math.min(from > TOWN_AREA.x1 ? Math.max(from, DAIS_FOOT - 20) : TOWN_AREA.x1, x));
const clampY = (y: number) => Math.max(TOWN_AREA.y0, Math.min(TOWN_AREA.y1, y));
