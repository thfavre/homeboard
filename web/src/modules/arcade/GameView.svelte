<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { Hourglass } from '@lucide/svelte';
  import { ARCADE_UNIT, arcadeGame, type ArcadeGhost, type ArcadeMatch } from '$shared/arcade.ts';
  import { hb, onEvent, rpc, serverNow } from '$lib/client.svelte.ts';
  import PixelText from '$lib/ui/PixelText.svelte';
  import type { Run } from './engine/run.ts';
  import Face from './Face.svelte';
  import { gradient } from './store.svelte.ts';

  /**
   * A round being played, full screen on the phone: the game runs here (Phaser, no lag), started at
   * the time the server set for both players, after a VS screen. The score goes to the server as it
   * moves (with the lives left and the fever), where the player is goes to the rival's phone for
   * their ghost, and the rival's comes in. The bar on top shows both players, their scores and lives,
   * who leads, the fever bar and the time; callouts tell when the rival takes the lead, crashes or is
   * out. Once out, the game stays visible (the rival's ghost goes on) with a panel at the bottom.
   */
  let { match }: { match: ArcadeMatch } = $props();

  const me = $derived(hb.me?.id ?? '');
  // The round this view plays: the parent makes a new view for each round
  const index = untrack(() => match.rounds.length - 1);
  const round = $derived(match.rounds[index]);
  const info = untrack(() => arcadeGame(match.rounds[index].game)!);
  const other = $derived(match.players.find((p) => p.id !== me)!);
  const mine = $derived(match.players.find((p) => p.id === me)!);
  const theirScore = $derived(round?.scores[other.id] ?? 0);
  const theirLives = $derived(round?.lives?.[other.id] ?? info.lives);
  const theyAreOut = $derived(!!round?.done.includes(other.id));
  const theirFever = $derived(!!round?.fever?.includes(other.id));
  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

  let host = $state<HTMLDivElement | null>(null);
  let run: Run | null = null;
  let score = $state(0);
  let lives = $state(info.lives);
  let fever = $state(0);
  let feverOn = $state(false);
  let left = $state(info.seconds * 1000);
  let over = $state<'out' | 'time' | null>(null);
  let count = $state<number | null>(null);
  let failed = $state(false);
  let gone = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // The score goes out at most 4 times a second; the last one (the run is over) at once
  let sentAt = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  function send(final: boolean) {
    if (pending) clearTimeout(pending);
    pending = null;
    const go = () => {
      sentAt = Date.now();
      void rpc('arcade', 'score', { match: match.id, round: index, score, lives, fever: feverOn, over: final }).catch(() => {});
    };
    const wait = 250 - (Date.now() - sentAt);
    if (final || wait <= 0) go();
    else pending = setTimeout(go, wait);
  }

  // The rival's ghost, from their phone
  const offGhost = onEvent<ArcadeGhost>('arcade', 'ghost', (g) => {
    if (g.match === match.id && g.round === index && g.from === other.id) run?.rival(g.d);
  });

  onMount(() => {
    // Back on this screen after the run was over (the page reloaded): no second run
    if (round.done.includes(me)) {
      score = round.scores[me] ?? 0;
      over = 'out';
      return;
    }
    void (async () => {
      try {
        const [{ startRun }, sfx, { loadFighter }] = await Promise.all([import('./engine/run.ts'), import('./engine/sfx.ts'), import('./engine/fighters.ts')]);
        const [meF, rivalF] = await Promise.all([loadFighter(mine), loadFighter(other)]);
        if (gone || !host) return;
        sfx.soundsOn(!!(hb.modules.arcade as { settings?: { sounds?: boolean } })?.settings?.sounds);
        run = startRun(host, {
          game: info.id,
          seed: round.seed,
          seconds: info.seconds,
          lives: info.lives,
          me: meF,
          rival: rivalF,
          onScore: (s) => {
            score = s;
            send(false);
          },
          onOver: (s, why) => {
            score = s;
            over = why;
            send(true);
          },
          onTime: (ms) => (left = ms),
          onLives: (n) => {
            lives = n;
            send(false);
          },
          onFever: (level, on) => {
            fever = level;
            if (on !== feverOn) {
              feverOn = on;
              send(false);
            }
          },
          onGhost: (d) => void rpc('arcade', 'ghost', { match: match.id, round: index, d }).catch(() => {}),
        });
        if (theyAreOut) run.rivalOver();
        // VS, then 3, 2, 1 on the server's clock, then go
        const start = match.startsAt ?? serverNow();
        for (const n of [3, 2, 1]) {
          const at = start - n * 1000 - serverNow();
          timers.push(
            setTimeout(
              () => {
                count = n;
                sfx.play('beep');
              },
              Math.max(0, at),
            ),
          );
        }
        timers.push(
          setTimeout(
            () => {
              count = 0;
              sfx.play('go');
              run?.begin();
              timers.push(setTimeout(() => (count = null), 600));
            },
            Math.max(0, start - serverNow()),
          ),
        );
      } catch (err) {
        console.error('Arcade game', err);
        failed = true;
        // Nothing can be played on this phone: the run counts as over at 0
        over = 'out';
        send(true);
      }
    })();
  });

  onDestroy(() => {
    gone = true;
    offGhost();
    for (const t of timers) clearTimeout(t);
    if (pending) clearTimeout(pending);
    run?.destroy();
  });

  // ------------------------------------------------------------ callouts about the race

  let calledAt = 0;
  function callout(text: string, color: string) {
    if (!run || over) return;
    const now = Date.now();
    // Never two on top of each other
    const wait = Math.max(0, calledAt + 1300 - now);
    calledAt = now + wait;
    timers.push(setTimeout(() => !over && run?.callout(text, color), wait));
  }

  let leader: 'me' | 'them' | null = null;
  $effect(() => {
    const a = score;
    const b = theirScore;
    const now = a > b ? 'me' : b > a ? 'them' : leader;
    if (now !== leader && leader !== null) callout(now === 'me' ? 'YOU TAKE THE LEAD' : `${firstName(other.name)} TAKES THE LEAD`, now === 'me' ? '#4dff9e' : other.color);
    if (a + b > 0) leader = now;
  });

  let knownLives = untrack(() => info.lives);
  $effect(() => {
    const n = theirLives;
    if (n < knownLives && n > 0) callout(`${firstName(other.name)} CRASHED`, other.color);
    knownLives = n;
  });

  let knownOut = false;
  $effect(() => {
    if (!theyAreOut || knownOut) return;
    knownOut = true;
    run?.rivalOver();
    if (!over) callout(info.lives && theirScore >= score ? `${firstName(other.name)} IS OUT. BEAT ${theirScore}` : `${firstName(other.name)} IS DONE`, other.color);
  });

  let knownFever = false;
  $effect(() => {
    if (theirFever && !knownFever) callout(`${firstName(other.name)} FEVER`, '#ffd23d');
    knownFever = theirFever;
  });

  // The score bumps a little each time it goes up
  let bump = $state(false);
  let lastScore = 0;
  $effect(() => {
    if (score <= lastScore) return;
    lastScore = score;
    bump = false;
    requestAnimationFrame(() => (bump = true));
  });

  const seconds = $derived(Math.ceil(left / 1000));
  const ratio = $derived(Math.max(0, Math.min(1, left / (info.seconds * 1000))));
  /** For a game with lives, the clock only matters near its end */
  const showClock = $derived(!info.lives || seconds <= 15);
  /** My share of the points so far: the lead bar */
  const share = $derived(score + theirScore > 0 ? (score / (score + theirScore)) * 100 : 50);
  const unit = (n: number) => (n === 1 ? ARCADE_UNIT.one : ARCADE_UNIT.many);
</script>

{#snippet hearts(n: number, color: string)}
  {#if info.lives}
    <span class="hearts" aria-label="{n} lives">
      {#each Array.from({ length: info.lives }) as _, i (i)}
        <svg viewBox="0 0 7 6" class="heart" class:lost={i >= n} style:--c={color} aria-hidden="true">
          <path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
        </svg>
      {/each}
    </span>
  {/if}
{/snippet}

<div class="view" style:--g={gradient(info.colors)} style:--a={info.colors[0]} style:--b={info.colors[1]}>
  <div class="hud">
    <div class="side me" class:hot={feverOn}>
      <Face player={mine} size={36} />
      <div class="score">
        <PixelText text="You" size={8} color="#c9c2ff" />
        <span class="num" class:bump><PixelText text={score} size={20} color={feverOn ? '#ffd23d' : '#ffffff'} /></span>
        {@render hearts(lives, '#ff4d6d')}
      </div>
    </div>
    <div class="middle">
      <PixelText text={info.name} size={7} color="#ffd23d" />
      {#if showClock}
        <span class="clock" class:low={seconds <= 5}><PixelText text={seconds} size={14} color={seconds <= 5 ? '#ff6b7d' : '#ffffff'} /></span>
      {:else}
        <span class="vs"><PixelText text="VS" size={10} color="#ff4fb0" /></span>
      {/if}
    </div>
    <div class="side them" class:out={theyAreOut} class:hot={theirFever}>
      <div class="score right">
        <PixelText text={firstName(other.name).slice(0, 9)} size={8} color={other.color} />
        <span class="num"><PixelText text={theirScore} size={20} color={theirFever ? '#ffd23d' : '#ffffff'} /></span>
        {@render hearts(theirLives, other.color)}
      </div>
      <Face player={other} size={36} />
    </div>
    <div class="lead" aria-hidden="true">
      <span class="mine" style:width="{share}%"></span>
      <span class="knot" style:left="{share}%"></span>
    </div>
    <div class="fever" class:on={feverOn} aria-label="Fever">
      <span class="fill" style:transform="scaleX({fever})"></span>
      {#each Array.from({ length: 10 }) as _, i (i)}<span class="seg" style:left="{(i + 1) * 10}%"></span>{/each}
    </div>
    <div class="bar"><span style:transform="scaleX({ratio})"></span></div>
  </div>

  <div class="stage" class:fever={feverOn} bind:this={host}></div>

  {#if count === 3}
    <div class="versus" out:fade={{ duration: 200 }}>
      <div class="vs-side" in:fly={{ x: -120, duration: 300 }}>
        <Face player={mine} size={84} />
        <PixelText text="You" size={14} color="#ffffff" />
      </div>
      <span class="vs-word" in:scale={{ start: 2.4, duration: 320, delay: 120 }}><PixelText text="VS" size={42} color="#ffd23d" /></span>
      <div class="vs-side" in:fly={{ x: 120, duration: 300 }}>
        <Face player={other} size={84} />
        <PixelText text={firstName(other.name).slice(0, 9)} size={14} color={other.color} />
      </div>
    </div>
  {/if}
  {#if count !== null && count < 3}
    {#key count}
      <div class="count" in:scale={{ start: 1.8, duration: 260 }} out:fade={{ duration: 150 }}>
        <PixelText text={count === 0 ? 'GO' : count} size={96} color={count === 0 ? '#4dff9e' : '#ffffff'} />
      </div>
    {/key}
  {/if}

  {#if over}
    {#if theyAreOut || failed}
      <div class="over" in:fade={{ duration: 200, delay: 500 }}>
        <div class="over-card">
          <span class="eyebrow">{failed ? 'This phone cannot run the game' : over === 'time' ? 'Time is up' : 'Out'}</span>
          <PixelText text={score} size={48} color="#ffffff" />
          <span class="dim">{unit(score)}</span>
          <span class="small">{firstName(other.name)} finished with <strong class="mono">{theirScore}</strong></span>
        </div>
      </div>
    {:else}
      <div class="watching" in:fly={{ y: 80, duration: 260, delay: 500 }}>
        <div class="w-score">
          <PixelText text={over === 'time' ? 'Time' : 'Out'} size={9} color="#ff8a96" />
          <PixelText text={score} size={22} color="#ffffff" />
        </div>
        <div class="w-text">
          <span class="waiting"><Hourglass size={15} /> {firstName(other.name)} is still playing: <strong class="mono">{theirScore}</strong></span>
          {#if theirScore <= score}<span class="faint small">They need {score + 1 - theirScore} more to beat you</span>
          {:else}<span class="faint small">They are ahead</span>{/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .view {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: #0b0718;
    touch-action: none;
    overscroll-behavior: none;
    user-select: none;
    -webkit-user-select: none;
  }
  /* The score bar: a dark arcade cabinet's top, lit in the game's colors */
  .hud {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.4rem;
    padding: calc(0.45rem + env(safe-area-inset-top)) 0.6rem 1.05rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 60%),
      #140c28;
    color: #fff;
    border-bottom: 3px solid var(--a);
    box-shadow:
      0 3px 0 var(--b),
      0 8px 24px -8px rgba(0, 0, 0, 0.8);
    z-index: 2;
  }
  .side {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.2rem 0.3rem;
    border-radius: 6px;
    transition:
      opacity 0.3s,
      box-shadow 0.3s;
  }
  .them {
    justify-content: flex-end;
  }
  .them.out {
    opacity: 0.5;
  }
  .side.hot {
    box-shadow:
      0 0 0 2px #ffd23d,
      0 0 14px rgba(255, 210, 61, 0.6);
    animation: hot 0.5s steps(2) infinite;
  }
  @keyframes hot {
    50% {
      box-shadow:
        0 0 0 2px #ff4fb0,
        0 0 14px rgba(255, 79, 176, 0.6);
    }
  }
  .score {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    justify-items: start;
  }
  .score.right {
    justify-items: end;
  }
  .num {
    display: inline-block;
  }
  .num.bump {
    animation: bump 0.18s ease-out;
  }
  @keyframes bump {
    from {
      transform: scale(1.35);
    }
  }
  .hearts {
    display: inline-flex;
    gap: 2px;
  }
  .heart {
    width: 11px;
    height: 10px;
    fill: var(--c);
    shape-rendering: crispEdges;
    filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.6));
    transition: opacity 0.3s;
  }
  .heart.lost {
    fill: #3a2f55;
    filter: none;
  }
  .middle {
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    max-width: 8rem;
  }
  .clock.low {
    animation: pulse 0.5s infinite alternate;
  }
  @keyframes pulse {
    to {
      transform: scale(1.2);
    }
  }
  /* Who leads: my share of the points, in my color against theirs */
  .lead {
    position: absolute;
    left: 0.6rem;
    right: 0.6rem;
    bottom: 0.55rem;
    height: 4px;
    background: var(--b);
    opacity: 0.95;
  }
  .lead .mine {
    display: block;
    height: 100%;
    background: #4dff9e;
    transition: width 0.3s;
  }
  .lead .knot {
    position: absolute;
    top: -3px;
    width: 4px;
    height: 10px;
    margin-left: -2px;
    background: #fff;
    transition: left 0.3s;
  }
  /* The fever bar: 10 segments, gold, flashing once full */
  .fever {
    position: absolute;
    left: 0.6rem;
    width: calc(50% - 1.2rem);
    bottom: 0.15rem;
    height: 5px;
    background: #2a1f4a;
    overflow: hidden;
  }
  .fever .fill {
    position: absolute;
    inset: 0;
    background: #ffd23d;
    transform-origin: left;
    transition: transform 0.15s linear;
  }
  .fever.on .fill {
    animation: rainbow 0.6s steps(3) infinite;
  }
  @keyframes rainbow {
    0% {
      background: #ffd23d;
    }
    33% {
      background: #ff4fb0;
    }
    66% {
      background: #4fe8ff;
    }
  }
  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #140c28;
  }
  .bar {
    position: absolute;
    right: 0.6rem;
    width: calc(50% - 1.2rem);
    bottom: 0.15rem;
    height: 5px;
    background: #2a1f4a;
  }
  .bar span {
    display: block;
    height: 100%;
    background: #fff;
    transform-origin: right;
    transition: transform 0.12s linear;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .stage::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 0 transparent;
    transition: box-shadow 0.3s;
  }
  .stage.fever::after {
    animation: frame 0.6s steps(3) infinite;
  }
  @keyframes frame {
    0% {
      box-shadow: inset 0 0 0 4px #ffd23d;
    }
    33% {
      box-shadow: inset 0 0 0 4px #ff4fb0;
    }
    66% {
      box-shadow: inset 0 0 0 4px #4fe8ff;
    }
  }
  .stage :global(canvas) {
    display: block;
  }
  .versus {
    position: fixed;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    justify-items: center;
    padding: 1rem;
    pointer-events: none;
    background: linear-gradient(115deg, rgba(20, 12, 40, 0.92) 50%, rgba(40, 12, 40, 0.92) 50%);
  }
  .vs-side {
    display: grid;
    justify-items: center;
    gap: 0.6rem;
  }
  .count {
    position: fixed;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .over {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.45);
  }
  .over-card {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    width: min(100%, 20rem);
    padding: 1.4rem 1.2rem;
    border: 3px solid var(--a);
    border-radius: 4px;
    background: rgba(20, 12, 40, 0.95);
    color: #fff;
    text-align: center;
    box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.9);
  }
  /* Out while the rival still plays: a panel at the bottom, the game stays in view */
  .watching {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(0.75rem + env(safe-area-inset-bottom));
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.7rem 0.9rem;
    border: 3px solid var(--a);
    border-radius: 4px;
    background: rgba(20, 12, 40, 0.92);
    color: #fff;
    pointer-events: none;
  }
  .w-score {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }
  .w-text {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    font-size: 0.9rem;
  }
  .waiting {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
