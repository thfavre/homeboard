<script lang="ts">
  import { ArrowDown, ArrowUp, Crown, Drum, Zap } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { PIRATE, PIRATE_SHIPS, formationName, type MatchState, type PirateCrew, type PirateView } from '$shared/games.ts';
  import { hb, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import PirateShip from '../ui/PirateShip.svelte';

  /**
   * Pirate Race on the TV: a sea map seen from above. The crews wait on the harbor beach on the left, and
   * their small ships row along a route to the treasure island on the right, the oars moving on the beat.
   * A ship surges after each stroke of its crew (its wake grows with its speed), its route behind it fills
   * with its color, and it glows during a boost. Art: Kenney's Pirate Pack (CC0) in web/public/pirates.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PirateView | null);
  const economy = $derived(!!hb.core?.economyEnabled);
  const shipOf = (c: PirateCrew) => PIRATE_SHIPS.find((s) => s.id === c.ship)!;
  const playerOf = (id: string) => m.players.find((p) => p.id === id);

  /** Where each ship is drawn (eases toward its real progress) and how fast it goes (0 to 1) */
  let shown = $state<Record<string, number>>({});
  let speed = $state<Record<string, number>>({});

  // The clock, every frame: the oars follow the beat and the ships glide to their place
  let now = $state(serverNow());
  $effect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      now = serverNow();
      const dt = Math.min(100, t - last);
      last = t;
      if (v) {
        for (const c of v.crews) {
          const cur = shown[c.ship] ?? c.progress;
          const gap = c.progress - cur;
          shown[c.ship] = Math.abs(gap) < 1e-4 ? c.progress : cur + gap * (1 - Math.exp(-dt / 380));
          const target = c.finishedAt ? 0 : Math.min(1, 0.12 + Math.abs(gap) * v.strokes * 0.9);
          speed[c.ship] = (speed[c.ship] ?? 0) + (target - (speed[c.ship] ?? 0)) * (1 - Math.exp(-dt / 160));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  /** The beat just passed and the next one */
  const beat = $derived.by(() => {
    const beats = v?.beats ?? [];
    let last = null;
    let next = null;
    for (const b of beats) {
      if (b.at <= now) last = b;
      else {
        next = b;
        break;
      }
    }
    return { last, next };
  });
  /** Where the stroke is: 0 on the beat. Before the drum (and after the race) the crews row slowly. */
  const phase = $derived.by(() => {
    const { last, next } = beat;
    if (!v || v.step !== 'race' || !last || !next) return (now / 1600) % 1;
    return (now - last.at) / Math.max(1, next.at - last.at);
  });
  const drumKick = $derived(beat.last && v?.step === 'race' ? Math.exp(-(now - beat.last.at) / 130) : 0);

  /** The count-in: 4, 3, 2, 1, then ROW! */
  const count = $derived.by(() => {
    if (!v || v.step !== 'race' || m.phase !== 'play') return null;
    if (now >= v.raceAt) return now < v.raceAt + 900 ? 'ROW!' : null;
    const i = beat.last?.i ?? -1;
    return i < 0 ? 'Ready...' : String(PIRATE.countIn - i);
  });

  // ---------------------------------------------------------------- The map

  let sw = $state(0);
  let sh = $state(0);
  type Pt = { x: number; y: number };
  /**
   * The map in pixels: the harbor beach (crew cards) on the left, the island on the right, and one route
   * per ship from its pier to the island's beach, sampled by distance so a ship at 40% has rowed 40% of it.
   */
  const map = $derived.by(() => {
    const n = v?.crews.length ?? 2;
    const harbor = Math.min(sw * 0.2, 300);
    const isle = Math.min(sh * 0.94, sw * 0.36);
    const ix = sw - isle * 0.5 - sw * 0.01;
    const iy = sh / 2;
    const len = Math.max(46, Math.min(84, (sh / n) * 0.48));
    const routes = Array.from({ length: n }, (_, i) => {
      const a = { x: harbor + len * 0.9, y: (sh * (i + 0.5)) / n };
      const b = { x: ix - isle * 0.43 - len * 0.5, y: iy - isle * 0.3 + (isle * 0.6 * (i + 0.5)) / n };
      const dx = b.x - a.x;
      const c1 = { x: a.x + dx * 0.42, y: a.y };
      const c2 = { x: b.x - dx * 0.42, y: b.y };
      const pts: Pt[] = [];
      const dist: number[] = [];
      for (let k = 0; k <= 64; k++) {
        const t = k / 64;
        const u = 1 - t;
        const p = {
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        };
        dist.push(k ? dist[k - 1] + Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : 0);
        pts.push(p);
      }
      const d = `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
      return { a, b, pts, dist, d };
    });
    return { n, harbor, isle, ix, iy, len, wid: (len * 66) / 113, routes };
  });
  /** A ship's place on its route at a progress (0 to 1), and its heading in degrees (0: to the right) */
  function along(i: number, p: number): Pt & { deg: number } {
    const r = map.routes[i];
    if (!r) return { x: 0, y: 0, deg: 0 };
    const want = Math.min(1, Math.max(0, p)) * r.dist[r.dist.length - 1];
    let k = 1;
    while (k < r.dist.length - 1 && r.dist[k] < want) k++;
    const s = r.dist[k] - r.dist[k - 1] || 1;
    const f = Math.min(1, Math.max(0, (want - r.dist[k - 1]) / s));
    const p0 = r.pts[k - 1];
    const p1 = r.pts[k];
    return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, deg: (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI };
  }

  const strokeText = (c: PirateCrew) => (c.stroke.synced ? 'In sync!' : c.stroke.power >= 0.6 ? 'Good stroke' : c.stroke.power > 0 ? 'Out of time' : 'Splash!');
  const placeText = (n: number | null) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

  /** Rocks and reefs around the routes (fractions of the sea) */
  const ROCKS = [
    { src: 'rock2', x: 0.4, y: 0.03, s: 7 },
    { src: 'rock1', x: 0.46, y: 0.05, s: 4.5 },
    { src: 'rock5', x: 0.57, y: 0.97, s: 7.5 },
    { src: 'rock4', x: 0.3, y: 0.975, s: 5 },
  ];
  /** Trees on the island (fractions of the island) */
  const PALMS = [
    { src: 'palm2', x: 0.3, y: 0.24, s: 0.26, r: 10 },
    { src: 'palm1', x: 0.72, y: 0.22, s: 0.22, r: -30 },
    { src: 'palm3', x: 0.74, y: 0.7, s: 0.2, r: 20 },
    { src: 'palm2', x: 0.28, y: 0.72, s: 0.2, r: 40 },
    { src: 'palm1', x: 0.86, y: 0.46, s: 0.18, r: 70 },
  ];
</script>

{#if v}
  <div class="race">
    <div class="bar">
      <div class="drum" style:--kick={drumKick}>
        <span class="skin"><Drum size="2.2rem" /></span>
        <span class="tempo">
          <strong class="mono">{v.step === 'crew' ? '--' : v.bpm}</strong>
          <span class="faint">beats a minute</span>
        </span>
        {#if v.step === 'race' && v.trend !== 'steady'}
          <span class="trend {v.trend}" in:scale>
            {#if v.trend === 'faster'}<ArrowUp size="1.4rem" /> Faster!{:else}<ArrowDown size="1.4rem" /> Slower...{/if}
          </span>
        {/if}
      </div>
      <span class="spacer"></span>
      <span class="pill">{formationName(m.players.length)}</span>
      <span class="pill">Row on the beat · {PIRATE.boostStreak} in sync = boost</span>
    </div>

    <div class="sea" bind:clientWidth={sw} bind:clientHeight={sh} style:--len="{map.len}px" style:--wid="{map.wid}px">
      <div class="texture"></div>
      <div class="waves"></div>

      <!-- The treasure island -->
      <div class="isle" style:left="{map.ix}px" style:top="{map.iy}px" style:--s="{map.isle}px">
        <span class="shallow"></span>
        <img class="land" src="/pirates/island.png" alt="" draggable="false" />
        {#each PALMS as t, i (i)}
          <img class="palm" src="/pirates/{t.src}.png" alt="" draggable="false" style:left="{t.x * 100}%" style:top="{t.y * 100}%" style:width="{t.s * 100}%" style:rotate="{t.r}deg" />
        {/each}
        <svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M8 8 L32 32 M32 8 L8 32" stroke="#c0392b" stroke-width="6" stroke-linecap="round" />
        </svg>
        <div class="chest">
          <span class="glow"></span>
          <svg viewBox="0 0 120 100" aria-hidden="true">
            <path d="M14 40 Q14 12 60 12 Q106 12 106 40 Z" fill="#8a5426" stroke="#3d220c" stroke-width="3" transform="rotate(-18 14 40)" />
            <ellipse cx="60" cy="44" rx="42" ry="10" fill="#ffd54a" />
            <circle cx="44" cy="40" r="7" fill="#ffe789" /><circle cx="62" cy="36" r="8" fill="#ffcf3a" /><circle cx="78" cy="41" r="6" fill="#ffe789" />
            <path d="M42 30 L46 22 L50 30 Z" fill="#ff5d8f" /><circle cx="70" cy="28" r="4" fill="#4ad7ff" />
            <rect x="14" y="44" width="92" height="46" rx="6" fill="#9c6230" stroke="#3d220c" stroke-width="3" />
            <rect x="14" y="56" width="92" height="7" fill="#c9a33a" /><rect x="54" y="52" width="12" height="16" rx="2" fill="#e8c34a" stroke="#3d220c" stroke-width="2" />
          </svg>
          <span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span>
        </div>
      </div>

      {#each ROCKS as r, i (i)}
        <img class="rock" src="/pirates/{r.src}.png" alt="" draggable="false" style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.s}rem" />
      {/each}

      <!-- The routes: dotted ahead, in the crew's color behind -->
      <svg class="routes" width={sw} height={sh} aria-hidden="true">
        {#each v.crews as c, i (c.ship)}
          {@const r = map.routes[i]}
          {#if r}
            <path d={r.d} class="ahead" />
            <path d={r.d} class="behind" pathLength="1" stroke={shipOf(c).hex} stroke-dasharray="{shown[c.ship] ?? c.progress} 2" />
          {/if}
        {/each}
      </svg>

      <!-- The harbor beach, with a pier for each ship -->
      <div class="shore" style:width="{map.harbor + 24}px"></div>
      {#each map.routes as r, i (i)}
        <span class="pier" style:left="{map.harbor - 8}px" style:top="{r.a.y}px" style:width="{r.a.x - map.harbor - map.len * 0.3}px"></span>
      {/each}

      {#each v.crews as c, i (c.ship)}
        {@const ship = shipOf(c)}
        {@const r = map.routes[i]}
        {#if r}
          <div class="card" style:--team={ship.hex} style:top="{r.a.y}px" style:width="{map.harbor - 22}px" class:won={c.place === 1}>
            <span class="name"><span class="flag"></span>{ship.name} ship</span>
            <span class="crew">
              {#each c.members as id (id)}
                {@const p = playerOf(id)}
                {#if p}<Avatar name={p.name} color={p.color} id={p.id} size="1.8rem" />{/if}
              {/each}
            </span>
            <span class="foot">
              <span class="pips" aria-label={`${c.streak} in sync`}>
                {#each Array.from({ length: PIRATE.boostStreak }) as _, k}<span class:on={k < c.streak}></span>{/each}
              </span>
              <span class="mono pct">{Math.round(c.progress * 100)}%</span>
            </span>
          </div>
        {/if}
      {/each}

      <!-- The ships -->
      {#each v.crews as c, i (c.ship)}
        {@const ship = shipOf(c)}
        {@const boosted = now < c.boostUntil}
        {@const at = along(i, shown[c.ship] ?? c.progress)}
        <div class="boat" style:left="{at.x}px" style:top="{at.y}px" style:rotate="{at.deg - 90}deg">
          <PirateShip ship={c.ship} color={ship.hex} {phase} power={c.stroke.seq ? c.stroke.power : 0.45} messy={!!c.stroke.seq && !c.stroke.synced} {boosted} speed={speed[c.ship] ?? 0} />
        </div>
        <div class="over" style:left="{at.x}px" style:top="{at.y}px" style:--team={ship.hex}>
          {#if c.stroke.seq && m.phase === 'play'}
            {#key c.stroke.seq}
              <span class="pop" class:sync={c.stroke.synced} class:bad={c.stroke.power === 0}>{strokeText(c)}</span>
            {/key}
          {/if}
          {#if boosted}<span class="boost" in:scale={{ start: 0.4 }}><Zap size="1.1rem" /> BOOST</span>{/if}
          {#if c.place && m.phase === 'result'}<span class="place" class:first={c.place === 1}>{placeText(c.place)}</span>{/if}
        </div>
      {/each}
    </div>

    {#if v.step === 'crew' && m.phase === 'play'}
      <div class="overlay" transition:fade>
        <h1 in:fly={{ y: -30 }}>Find your crew!</h1>
        <p class="dim">Your phone shows your ship color. The drum starts in a moment: row on every beat.</p>
        <div class="crews">
          {#each v.crews as c, k (c.ship)}
            {@const ship = shipOf(c)}
            <div class="crew-card" style:--team={ship.hex} in:scale={{ delay: 200 + k * 180, start: 0.7 }}>
              <span class="mini"><span><PirateShip ship={c.ship} color={ship.hex} phase={(now / 1600) % 1} speed={0.3} /></span></span>
              <strong>{ship.name} ship</strong>
              <span class="names">
                {#each c.members as id (id)}
                  {@const p = playerOf(id)}
                  {#if p}<span class="mate"><Avatar name={p.name} color={p.color} id={p.id} size="2.4rem" />{p.name}</span>{/if}
                {/each}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if count}
      {#key count}
        <div class="count" class:go={count === 'ROW!'} in:scale={{ start: 1.8, duration: 260 }} out:fade={{ duration: 150 }}>{count}</div>
      {/key}
    {/if}

    {#if m.result}
      {@const r = m.result}
      {@const winners = v.crews.filter((c) => c.place === 1 && r.winners.length)}
      <div class="overlay result" in:fade={{ delay: 1400 }}>
        <h1 class="headline" in:fly={{ y: -30, delay: 1500 }}>{r.headline}</h1>
        <div class="podium">
          {#each winners as c (c.ship)}
            {@const ship = shipOf(c)}
            <div class="winner" style:--team={ship.hex} in:scale={{ delay: 1800, start: 0.6 }}>
              <span class="crown"><Crown size="2.6rem" /></span>
              <span class="names">
                {#each c.members as id (id)}
                  {@const p = playerOf(id)}
                  {#if p}
                    <span class="mate big">
                      <Avatar name={p.name} color={p.color} id={p.id} size="4rem" />
                      <strong>{p.name}</strong>
                      <span class="dim small">{v.stats[id]?.onBeat ?? 0} on the beat</span>
                      {#if economy && r.payouts[id] > 0}<span class="gain"><Money amount={r.payouts[id]} sign /></span>{/if}
                    </span>
                  {/if}
                {/each}
              </span>
            </div>
          {/each}
        </div>
        <div class="others">
          {#each [...v.crews].filter((c) => !winners.includes(c)).sort((a, b) => (a.place ?? 9) - (b.place ?? 9)) as c (c.ship)}
            <span class="pill" style:border-color={shipOf(c).hex}>{placeText(c.place)} · {shipOf(c).name} ship · {Math.round(c.progress * 100)}%</span>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .race {
    position: relative;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1rem;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .spacer {
    flex: 1;
  }
  .bar .pill {
    font-size: 1.1rem;
    padding: 0.4em 1em;
  }
  .drum {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .skin {
    display: grid;
    place-items: center;
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #f3dcb0, #b9844a 70%, #6e4020);
    color: #3d220c;
    transform: scale(calc(1 + var(--kick) * 0.22));
    box-shadow: 0 0 calc(var(--kick) * 2.5rem) color-mix(in srgb, #ffb347 calc(var(--kick) * 100%), transparent);
  }
  .tempo {
    display: grid;
    line-height: 1.1;
  }
  .tempo strong {
    font-size: 2rem;
  }
  .trend {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1.2rem;
  }
  .trend.faster {
    background: color-mix(in srgb, var(--danger) 22%, transparent);
    color: var(--danger);
    animation: shake 0.5s ease-in-out infinite;
  }
  .trend.slower {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
  }
  @keyframes shake {
    50% {
      transform: translateY(-2px);
    }
  }

  /* ------------------------------------------------ The sea, from above */
  .sea {
    position: relative;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius);
    background:
      radial-gradient(ellipse 60% 70% at 52% 50%, #2e8fd2, transparent 75%),
      linear-gradient(180deg, #2a86c8, #1d6db0 50%, #2a86c8);
    box-shadow: inset 0 0 5rem rgb(0 20 50 / 0.45);
  }
  .texture,
  .waves {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .texture {
    background: url('/pirates/water.png') 0 0 / 180px 180px;
    opacity: 0.18;
    mix-blend-mode: screen;
    animation: tide 40s linear infinite;
  }
  .waves {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240'%3E%3Cg fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-opacity='0.35'%3E%3Cpath d='M20 40 q10 -8 20 0 t20 0'/%3E%3Cpath d='M190 30 q8 -6 16 0'/%3E%3Cpath d='M120 120 q10 -8 20 0 t20 0'/%3E%3Cpath d='M260 150 q8 -6 16 0 t16 0'/%3E%3Cpath d='M40 190 q8 -6 16 0'/%3E%3Cpath d='M200 215 q10 -8 20 0'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 320px 240px;
    animation: tide 26s linear infinite reverse;
  }
  @keyframes tide {
    to {
      background-position: 360px 120px;
    }
  }

  .isle {
    position: absolute;
    width: var(--s);
    height: var(--s);
    translate: -50% -50%;
  }
  .shallow {
    position: absolute;
    inset: -14%;
    border-radius: 42%;
    background: radial-gradient(closest-side, rgb(140 225 245 / 0.75) 62%, rgb(110 205 240 / 0.35) 80%, transparent);
    animation: breathe 4s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      transform: scale(1.03);
      opacity: 0.85;
    }
  }
  .land {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 10px rgb(255 255 255 / 0.6));
    animation: surf 3s ease-in-out infinite;
  }
  @keyframes surf {
    50% {
      filter: drop-shadow(0 0 7px #fff) drop-shadow(0 0 16px rgb(255 255 255 / 0.4));
    }
  }
  .palm {
    position: absolute;
    translate: -50% -50%;
    filter: drop-shadow(4px 8px 3px rgb(0 0 0 / 0.25));
  }
  .mark {
    position: absolute;
    left: 50%;
    top: 47%;
    width: 13%;
    translate: -50% -50%;
    opacity: 0.85;
  }
  .chest {
    position: absolute;
    left: 50%;
    top: 47%;
    translate: -50% -62%;
    width: 22%;
  }
  .chest svg {
    position: relative;
    width: 100%;
    filter: drop-shadow(0 6px 4px rgb(0 0 0 / 0.3));
  }
  .glow {
    position: absolute;
    inset: -45%;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(255 214 74 / 0.8), transparent 62%);
    animation: shimmer 1.6s ease-in-out infinite alternate;
  }
  @keyframes shimmer {
    to {
      opacity: 0.45;
      transform: scale(0.9);
    }
  }
  .spark {
    position: absolute;
    width: 0.8rem;
    height: 0.8rem;
    background: #fff;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    animation: twinkle 1.3s ease-in-out infinite;
  }
  .s1 {
    left: 15%;
    top: 5%;
  }
  .s2 {
    left: 75%;
    top: -5%;
    animation-delay: 0.45s;
  }
  .s3 {
    left: 52%;
    top: 30%;
    animation-delay: 0.9s;
  }
  @keyframes twinkle {
    0%,
    100% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.3) rotate(45deg);
    }
  }
  .rock {
    position: absolute;
    translate: -50% -50%;
    filter: drop-shadow(0 0 3px rgb(255 255 255 / 0.8));
  }

  .routes {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .routes path {
    fill: none;
    stroke-linecap: round;
  }
  .ahead {
    stroke: #fff;
    stroke-opacity: 0.4;
    stroke-width: 3;
    stroke-dasharray: 2 12;
  }
  .behind {
    stroke-width: 5;
    stroke-opacity: 0.55;
  }

  /* The harbor: a beach on the left edge, with the crews' signs and their piers */
  .shore {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background:
      radial-gradient(circle at 30% 20%, rgb(255 255 255 / 0.25) 0 2px, transparent 3px) 0 0 / 46px 52px,
      linear-gradient(90deg, #e9cf98, #f6e3b6 70%, #f9ecc8);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='160' preserveAspectRatio='none'%3E%3Cpath d='M0 0 L28 0 Q40 40 28 80 Q16 120 28 160 L0 160 Z'/%3E%3C/svg%3E") right 0 top 0 / 40px 160px repeat-y,
      linear-gradient(#000, #000) 0 0 / calc(100% - 39px) 100% no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='160' preserveAspectRatio='none'%3E%3Cpath d='M0 0 L28 0 Q40 40 28 80 Q16 120 28 160 L0 160 Z'/%3E%3C/svg%3E") right 0 top 0 / 40px 160px repeat-y,
      linear-gradient(#000, #000) 0 0 / calc(100% - 39px) 100% no-repeat;
    filter: drop-shadow(4px 0 0 rgb(255 255 255 / 0.7));
  }
  .pier {
    position: absolute;
    height: calc(var(--wid) * 0.42);
    translate: 0 -50%;
    border-radius: 3px;
    background: repeating-linear-gradient(90deg, #a26a35 0 9px, #7b4a20 9px 11px);
    box-shadow:
      0 0 0 2px #5a3415,
      0 5px 6px rgb(0 0 0 / 0.3);
  }
  .card {
    position: absolute;
    left: 10px;
    translate: 0 -50%;
    z-index: 3;
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem 0.75rem 0.6rem;
    border-radius: 0.8rem;
    background: linear-gradient(135deg, color-mix(in srgb, var(--team) 26%, #13263a), #10202f);
    border: 2px solid color-mix(in srgb, var(--team) 70%, transparent);
    box-shadow: 0 6px 16px rgb(40 25 5 / 0.35);
    color: #fff;
  }
  .card.won {
    box-shadow:
      0 0 0 3px var(--coin),
      0 0 2rem var(--coin);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 800;
    font-size: 1.1rem;
    line-height: 1;
  }
  .flag {
    width: 0.8rem;
    height: 1.1rem;
    border-radius: 0.15rem;
    background: var(--team);
    box-shadow: 0 0 0.6rem var(--team);
  }
  .crew {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .pips {
    display: flex;
    gap: 0.25rem;
  }
  .pips span {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 2px solid rgb(255 255 255 / 0.5);
    transition:
      background 0.2s ease,
      box-shadow 0.2s ease;
  }
  .pips span.on {
    background: var(--team);
    border-color: var(--team);
    box-shadow: 0 0 0.6rem var(--team);
  }
  .pct {
    font-weight: 700;
    font-size: 1rem;
    color: rgb(255 255 255 / 0.8);
  }

  .boat {
    position: absolute;
    z-index: 4;
    width: var(--wid);
    height: var(--len);
    margin: calc(var(--len) / -2) 0 0 calc(var(--wid) / -2);
  }
  .over {
    position: absolute;
    z-index: 6;
    width: 0;
    height: 0;
  }
  .pop {
    position: absolute;
    left: 0;
    bottom: calc(var(--len) * 0.45);
    translate: -50% 0;
    white-space: nowrap;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    background: rgb(0 20 40 / 0.6);
    color: #fff;
    font-weight: 700;
    font-size: 1.05rem;
    animation: rise 1.1s ease-out forwards;
  }
  .pop.sync {
    background: var(--team);
    color: #111;
  }
  .pop.bad {
    color: #9fd6ff;
  }
  @keyframes rise {
    0% {
      transform: translateY(10px) scale(0.8);
      opacity: 0;
    }
    20% {
      transform: translateY(0) scale(1.05);
      opacity: 1;
    }
    100% {
      transform: translateY(-16px);
      opacity: 0;
    }
  }
  .boost {
    position: absolute;
    left: 0;
    top: calc(var(--len) * 0.42);
    translate: -50% 0;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #ffe14d, #ff8a3a);
    color: #3a1a00;
    font-weight: 800;
    font-size: 0.95rem;
    animation: pulse 0.4s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      transform: scale(1.1);
    }
  }
  .place {
    position: absolute;
    right: calc(var(--len) * 0.3);
    top: 0;
    translate: 0 -50%;
    padding: 0.1rem 0.7rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .place.first {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1.4rem;
    padding: 2rem;
    text-align: center;
    border-radius: var(--radius);
    background: radial-gradient(ellipse at center, rgb(4 18 40 / 0.82), rgb(4 18 40 / 0.94));
    color: #fff;
  }
  .overlay h1 {
    font-size: 4.4rem;
    letter-spacing: -0.03em;
  }
  .overlay > .dim {
    font-size: 1.5rem;
  }
  .crews {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1.2rem;
  }
  .crew-card {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
    min-width: 15rem;
    padding: 1rem 1.4rem 1.3rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--team) 16%, rgb(255 255 255 / 0.04));
    border: 2px solid var(--team);
    box-shadow: 0 0 3rem -1rem var(--team);
  }
  .crew-card strong {
    font-size: 1.6rem;
    color: var(--team);
  }
  /* A ship rowing to the right, on a patch of sea */
  .mini {
    position: relative;
    width: 10rem;
    height: 5.6rem;
    border-radius: 1rem;
    background: radial-gradient(ellipse at center, #2e8fd2, #1d6db0);
    overflow: hidden;
  }
  .mini > span {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2.6rem;
    height: 4.45rem;
    translate: -50% -50%;
    rotate: -90deg;
  }
  .names {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem 0.9rem;
  }
  .mate {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
    font-size: 1.2rem;
  }
  .mate.big {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    font-size: 1.4rem;
  }
  .small {
    font-size: 1rem;
  }
  .count {
    position: absolute;
    left: 50%;
    top: 52%;
    translate: -50% -50%;
    z-index: 11;
    font-family: var(--font-display);
    font-size: 11rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0.4rem 3rem rgb(0 0 0 / 0.6);
    pointer-events: none;
  }
  .count.go {
    background: linear-gradient(135deg, #ffe14d, #ff8a3a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding: 0 0.15em;
  }
  .result {
    background: radial-gradient(ellipse at center, rgb(4 18 40 / 0.7), rgb(4 18 40 / 0.9));
  }
  .headline {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent !important;
    padding: 0 0.1em;
  }
  .podium {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2rem;
  }
  .winner {
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    padding: 1.2rem 2rem 1.5rem;
    border-radius: var(--radius);
    border: 3px solid var(--team);
    background: color-mix(in srgb, var(--team) 18%, transparent);
    box-shadow: 0 0 4rem -0.5rem var(--team);
  }
  .crown {
    color: var(--coin);
  }
  .gain {
    color: var(--success);
    font-weight: 700;
  }
  .others {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
  }
  .others .pill {
    font-size: 1.15rem;
    border: 2px solid;
    background: rgb(255 255 255 / 0.06);
    color: #fff;
  }
</style>
