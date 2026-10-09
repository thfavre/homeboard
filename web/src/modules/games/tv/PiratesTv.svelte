<script lang="ts">
  import { ArrowDown, ArrowUp, Crown, Drum, Zap } from '@lucide/svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { PIRATE, PIRATE_SHIPS, formationName, type MatchState, type PirateCrew, type PirateView } from '$shared/games.ts';
  import { hb, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import PirateShip from '../ui/PirateShip.svelte';

  /**
   * Pirate Race on the TV: one lane of sea per ship, the ships rowing with the drum toward the treasure
   * island on the right. The oars move on the beat; a ship surges after each stroke of its crew, sparkles
   * when the crew is in time, and leaves a white wake during a boost.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as PirateView | null);
  const economy = $derived(!!hb.core?.economyEnabled);
  const shipOf = (c: PirateCrew) => PIRATE_SHIPS.find((s) => s.id === c.ship)!;
  const playerOf = (id: string) => m.players.find((p) => p.id === id);

  // The clock, every frame: the oars follow the beat
  let now = $state(serverNow());
  $effect(() => {
    let raf = 0;
    const loop = () => {
      now = serverNow();
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

  const strokeText = (c: PirateCrew) => (c.stroke.synced ? 'In sync!' : c.stroke.power >= 0.6 ? 'Good stroke' : c.stroke.power > 0 ? 'Out of time' : 'Splash!');
  const placeText = (n: number | null) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
</script>

{#if v}
  <div class="race" class:many={v.crews.length > 3}>
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

    <div class="sea">
      <div class="lanes">
        {#each v.crews as c (c.ship)}
          {@const ship = shipOf(c)}
          {@const boosted = now < c.boostUntil}
          {@const won = m.result?.winners.includes(c.members[0])}
          <div class="lane" class:boosted class:won style:--team={ship.hex} style:--p={c.progress}>
            <div class="water w1"></div>
            <div class="water w2"></div>
            <div class="tag">
              <span class="flag"></span>
              <span class="who">
                <strong>{ship.name} ship</strong>
                <span class="crew">
                  {#each c.members as id (id)}
                    {@const p = playerOf(id)}
                    {#if p}<Avatar name={p.name} color={p.color} id={p.id} size="1.9rem" />{/if}
                  {/each}
                </span>
              </span>
              <span class="pips" aria-label={`${c.streak} in sync`}>
                {#each Array.from({ length: PIRATE.boostStreak }) as _, i}<span class:on={i < c.streak}></span>{/each}
              </span>
            </div>
            <div class="boat">
              {#if boosted}<div class="speed" transition:fade></div>{/if}
              <PirateShip id={c.ship} color={ship.hex} {phase} power={c.stroke.seq ? c.stroke.power : 0.45} messy={!!c.stroke.seq && !c.stroke.synced} {boosted} />
              {#if c.stroke.seq && m.phase === 'play'}
                {#key c.stroke.seq}
                  <span class="pop" class:sync={c.stroke.synced} class:bad={c.stroke.power === 0}>{strokeText(c)}</span>
                {/key}
              {/if}
              {#if boosted}<span class="boost" in:scale={{ start: 0.4 }}><Zap size="1.2rem" /> BOOST</span>{/if}
              {#if c.place && m.phase === 'result'}<span class="place" class:first={c.place === 1}>{placeText(c.place)}</span>{/if}
            </div>
            <!-- The water in front of the ships: the blades go under it -->
            <div class="front"></div>
            <span class="meter mono">{Math.round(c.progress * 100)}%</span>
          </div>
        {/each}
      </div>

      <!-- The treasure island: the ships row to its beach -->
      <div class="island">
        <svg viewBox="0 0 220 600" preserveAspectRatio="none" class="sand" aria-hidden="true">
          <path d="M40 0 Q10 60 34 120 Q8 190 30 260 Q6 330 32 400 Q10 470 34 540 Q20 580 40 600 L220 600 L220 0 Z" fill="#e8c27a" />
          <path d="M40 0 Q10 60 34 120 Q8 190 30 260 Q6 330 32 400 Q10 470 34 540 Q20 580 40 600" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="5" class="surf" />
          <path d="M80 0 Q60 150 84 300 Q62 450 80 600 L220 600 L220 0 Z" fill="#d6a95c" opacity="0.6" />
        </svg>
        <svg viewBox="0 0 200 200" class="palm" aria-hidden="true">
          <path d="M104 196 Q96 140 112 70" stroke="#7a4d22" stroke-width="10" fill="none" stroke-linecap="round" />
          <g fill="#2fa45a">
            <path d="M112 70 Q70 40 30 64 Q72 52 112 74 Z" />
            <path d="M112 70 Q100 24 60 14 Q96 34 110 74 Z" />
            <path d="M112 70 Q140 22 186 30 Q146 38 114 74 Z" />
            <path d="M112 70 Q160 60 190 96 Q152 70 114 76 Z" />
            <path d="M112 70 Q90 80 70 120 Q92 86 114 76 Z" />
          </g>
          <circle cx="108" cy="78" r="6" fill="#6b3f1a" /><circle cx="118" cy="80" r="5.5" fill="#6b3f1a" />
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
    </div>

    {#if v.step === 'crew' && m.phase === 'play'}
      <div class="overlay" transition:fade>
        <h1 in:fly={{ y: -30 }}>Find your crew!</h1>
        <p class="dim">Your phone shows your ship color. The drum starts in a moment: row on every beat.</p>
        <div class="crews">
          {#each v.crews as c, k (c.ship)}
            {@const ship = shipOf(c)}
            <div class="crew-card" style:--team={ship.hex} in:scale={{ delay: 200 + k * 180, start: 0.7 }}>
              <span class="mini"><PirateShip id={`card-${c.ship}`} color={ship.hex} phase={(now / 1600) % 1} /></span>
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
      <div class="overlay result" in:fade={{ delay: 400 }}>
        <h1 class="headline" in:fly={{ y: -30, delay: 500 }}>{r.headline}</h1>
        <div class="podium">
          {#each winners as c (c.ship)}
            {@const ship = shipOf(c)}
            <div class="winner" style:--team={ship.hex} in:scale={{ delay: 800, start: 0.6 }}>
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

  .sea {
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 13rem;
    border-radius: var(--radius);
    overflow: hidden;
    background: linear-gradient(180deg, #0f5d9c, #08335f);
    box-shadow: inset 0 0 6rem rgb(0 0 0 / 0.35);
  }
  .lanes {
    min-height: 0;
    display: grid;
    grid-auto-rows: 1fr;
  }
  .lane {
    position: relative;
    container-type: size;
    min-height: 0;
    border-bottom: 2px dashed rgb(255 255 255 / 0.18);
  }
  .lane:last-child {
    border-bottom: 0;
  }
  .water {
    position: absolute;
    inset: 0;
    background-repeat: repeat-x;
    pointer-events: none;
  }
  .w1 {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='40'%3E%3Cpath d='M0 20 Q20 8 40 20 T80 20 T120 20 T160 20' fill='none' stroke='white' stroke-opacity='0.16' stroke-width='3'/%3E%3C/svg%3E");
    background-size: 160px 40px;
    background-position: 0 30%;
    animation: drift 7s linear infinite;
  }
  .w2 {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='50'%3E%3Cpath d='M0 25 Q27 12 55 25 T110 25 T165 25 T220 25' fill='none' stroke='white' stroke-opacity='0.1' stroke-width='4'/%3E%3C/svg%3E");
    background-size: 220px 50px;
    background-position: 0 80%;
    animation: drift 11s linear infinite reverse;
  }
  @keyframes drift {
    to {
      background-position-x: -440px;
    }
  }
  .front {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 19cqh;
    z-index: 3;
    pointer-events: none;
    background: linear-gradient(180deg, rgb(42 143 214 / 0.55), rgb(8 51 95 / 0.95));
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='200' preserveAspectRatio='none'%3E%3Cpath d='M0 8 Q20 0 40 8 T80 8 L80 200 L0 200 Z'/%3E%3C/svg%3E") 0 0 / 80px 100% repeat-x;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='200' preserveAspectRatio='none'%3E%3Cpath d='M0 8 Q20 0 40 8 T80 8 L80 200 L0 200 Z'/%3E%3C/svg%3E") 0 0 / 80px 100% repeat-x;
    animation: lap 2.4s linear infinite;
  }
  @keyframes lap {
    to {
      -webkit-mask-position: -80px 0;
      mask-position: -80px 0;
    }
  }
  .tag {
    position: absolute;
    left: 0.8rem;
    top: 0.5rem;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.8rem 0.3rem 0.4rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.35);
    backdrop-filter: blur(6px);
    color: #fff;
  }
  .flag {
    width: 1.1rem;
    height: 1.6rem;
    border-radius: 0.2rem;
    background: var(--team);
    box-shadow: 0 0 0.8rem var(--team);
  }
  .who {
    display: grid;
    gap: 0.15rem;
  }
  .who strong {
    font-size: 1.05rem;
    line-height: 1;
  }
  .crew {
    display: flex;
    gap: 0.2rem;
  }
    .pips {
    display: flex;
    gap: 0.25rem;
  }
  .pips span {
    width: 0.75rem;
    height: 0.75rem;
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
  .boat {
    position: absolute;
    bottom: -8cqh;
    height: 110cqh;
    aspect-ratio: 280 / 180;
    left: calc(var(--p) * (100cqw - 171cqh));
    transition: left 0.7s cubic-bezier(0.2, 0.7, 0.3, 1);
    z-index: 2;
  }
  .boosted .boat {
    filter: drop-shadow(0 0 1.2rem var(--team));
  }
  .speed {
    position: absolute;
    right: 80%;
    top: 30%;
    width: 60cqh;
    height: 45%;
    background: repeating-linear-gradient(180deg, transparent 0 14%, rgb(255 255 255 / 0.75) 14% 18%);
    -webkit-mask: linear-gradient(90deg, transparent, #000);
    mask: linear-gradient(90deg, transparent, #000);
    animation: whoosh 0.35s linear infinite;
  }
  @keyframes whoosh {
    from {
      transform: translateX(20%);
      opacity: 1;
    }
    to {
      transform: translateX(-30%);
      opacity: 0.4;
    }
  }
  .pop {
    position: absolute;
    left: 84%;
    top: 30%;
    white-space: nowrap;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    font-weight: 700;
    font-size: clamp(0.8rem, 11cqh, 1.3rem);
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
      transform: translateY(-14px);
      opacity: 0;
    }
  }
  .boost {
    position: absolute;
    left: 2%;
    top: 12%;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #ffe14d, #ff8a3a);
    color: #3a1a00;
    font-weight: 800;
    font-size: clamp(0.8rem, 11cqh, 1.2rem);
    animation: pulse 0.4s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      transform: scale(1.1);
    }
  }
  .place {
    position: absolute;
    left: 50%;
    top: 0;
    translate: -50% 0;
    padding: 0.1rem 0.8rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.55);
    color: #fff;
    font-weight: 800;
    font-size: 1.3rem;
  }
  .place.first {
    background: linear-gradient(135deg, var(--coin), var(--coin-2));
  }
  .meter {
    position: absolute;
    right: 0.8rem;
    bottom: 0.4rem;
    z-index: 4;
    color: rgb(255 255 255 / 0.75);
    font-weight: 700;
    font-size: 1.1rem;
  }

  .island {
    position: relative;
    min-height: 0;
  }
  .sand {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .surf {
    animation: surf 2.4s ease-in-out infinite;
  }
  @keyframes surf {
    50% {
      transform: translateX(-6px);
      stroke-opacity: 0.35;
    }
  }
  .palm {
    position: absolute;
    right: -1rem;
    top: 2%;
    width: 11rem;
  }
  .chest {
    position: absolute;
    left: 50%;
    top: 55%;
    translate: -45% -50%;
    width: 8rem;
  }
  .chest svg {
    position: relative;
    width: 100%;
  }
  .glow {
    position: absolute;
    inset: -40%;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(255 214 74 / 0.75), transparent 62%);
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
    width: 0.7rem;
    height: 0.7rem;
    background: #fff;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    animation: twinkle 1.3s ease-in-out infinite;
  }
  .s1 {
    left: 20%;
    top: 10%;
  }
  .s2 {
    left: 70%;
    top: 0;
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
  .mini {
    width: 9rem;
    aspect-ratio: 280 / 180;
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
