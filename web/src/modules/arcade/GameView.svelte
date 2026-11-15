<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { Hourglass } from '@lucide/svelte';
  import { arcadeGame, type ArcadeMatch } from '$shared/arcade.ts';
  import { hb, rpc, serverNow } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import type { Run } from './engine/run.ts';
  import { gradient } from './store.svelte.ts';

  /**
   * A round being played, full screen on the phone: the game runs here (Phaser, no lag), started at
   * the time the server set for both players. The score goes to the server as it moves; the top bar
   * shows both scores and the time left.
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
  const theyAreOut = $derived(!!round?.done.includes(other.id));

  let host = $state<HTMLDivElement | null>(null);
  let run: Run | null = null;
  let score = $state(0);
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
      void rpc('arcade', 'score', { match: match.id, round: index, score, over: final }).catch(() => {});
    };
    const wait = 250 - (Date.now() - sentAt);
    if (final || wait <= 0) go();
    else pending = setTimeout(go, wait);
  }

  onMount(() => {
    // Back on this screen after the run was over (the page reloaded): no second run
    if (round.done.includes(me)) {
      score = round.scores[me] ?? 0;
      over = 'out';
      return;
    }
    void (async () => {
      try {
        const [{ startRun }, sfx] = await Promise.all([import('./engine/run.ts'), import('./engine/sfx.ts')]);
        if (gone || !host) return;
        sfx.soundsOn(!!(hb.modules.arcade as { settings?: { sounds?: boolean } })?.settings?.sounds);
        run = startRun(host, {
          game: info.id,
          seed: round.seed,
          seconds: info.seconds,
          oneLife: info.oneLife,
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
        });
        // 3, 2, 1 on the server's clock, then go
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
    for (const t of timers) clearTimeout(t);
    if (pending) clearTimeout(pending);
    run?.destroy();
  });

  const seconds = $derived(Math.ceil(left / 1000));
  const ratio = $derived(Math.max(0, Math.min(1, left / (info.seconds * 1000))));
  /** For a game of one life, the clock only matters near its end */
  const showClock = $derived(!info.oneLife || seconds <= 15);
</script>

<div class="view" style:--g={gradient(info.colors)}>
  <div class="hud">
    <div class="side me">
      <Avatar name={mine.name} color={mine.color} id={mine.id} size="2rem" />
      <div class="score">
        <span class="name truncate">You</span>
        <strong class="mono">{score}</strong>
      </div>
    </div>
    <div class="middle">
      <span class="game-name truncate">{info.name}</span>
      {#if showClock}<span class="clock mono" class:low={seconds <= 5}>{seconds}s</span>{/if}
    </div>
    <div class="side them" class:out={theyAreOut}>
      <div class="score right">
        <span class="name truncate">{other.name}</span>
        <strong class="mono">{theirScore}</strong>
      </div>
      <Avatar name={other.name} color={other.color} id={other.id} size="2rem" />
    </div>
    <div class="bar"><span style:transform="scaleX({ratio})"></span></div>
  </div>

  <div class="stage" bind:this={host}></div>

  {#if count !== null}
    {#key count}
      <div class="count" in:scale={{ start: 1.8, duration: 260 }} out:fade={{ duration: 150 }}>{count === 0 ? 'GO' : count}</div>
    {/key}
  {/if}

  {#if over}
    <div class="over" in:fade={{ duration: 200, delay: 500 }}>
      <div class="over-card">
        <span class="eyebrow">{failed ? 'This phone cannot run the game' : over === 'time' ? 'Time is up' : 'Out'}</span>
        <strong class="mono big">{score}</strong>
        <span class="dim">{score === 1 ? info.one : info.unit}</span>
        <div class="vs">
          {#if theyAreOut}
            <span>{other.name} finished with <strong class="mono">{theirScore}</strong></span>
          {:else}
            <span class="waiting"><Hourglass size={16} /> {other.name} is still playing: <strong class="mono">{theirScore}</strong></span>
            {#if info.oneLife && theirScore <= score}<span class="faint small">They need {score + 1 - theirScore} more to beat you</span>{/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .view {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: #000;
    touch-action: none;
    overscroll-behavior: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .hud {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.5rem;
    padding: calc(0.5rem + env(safe-area-inset-top)) 0.8rem 0.7rem;
    background: var(--g);
    color: #fff;
    box-shadow: 0 6px 20px -8px rgba(0, 0, 0, 0.7);
    z-index: 2;
  }
  .side {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .them {
    justify-content: flex-end;
    transition: opacity 0.3s;
  }
  .them.out {
    opacity: 0.55;
  }
  .score {
    display: grid;
    min-width: 0;
    line-height: 1.05;
  }
  .score.right {
    text-align: right;
  }
  .name {
    font-size: 0.72rem;
    opacity: 0.9;
  }
  .score strong {
    font-size: 1.6rem;
    font-weight: 800;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .middle {
    display: grid;
    justify-items: center;
    max-width: 7.5rem;
  }
  .game-name {
    max-width: 100%;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .clock {
    font-size: 1.15rem;
    font-weight: 800;
  }
  .clock.low {
    animation: pulse 0.5s infinite alternate;
  }
  @keyframes pulse {
    to {
      transform: scale(1.15);
      color: #ffe0e0;
    }
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .bar span {
    display: block;
    height: 100%;
    background: #fff;
    transform-origin: left;
    transition: transform 0.12s linear;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .stage :global(canvas) {
    display: block;
  }
  .count {
    position: fixed;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    pointer-events: none;
    font-family: var(--font-display);
    font-size: 7rem;
    font-weight: 900;
    color: #fff;
    text-shadow:
      0 6px 30px rgba(0, 0, 0, 0.6),
      0 0 40px rgba(255, 255, 255, 0.4);
  }
  .over {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }
  .over-card {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    width: min(100%, 20rem);
    padding: 1.4rem 1.2rem;
    border-radius: var(--radius);
    background: rgba(18, 16, 30, 0.92);
    color: #fff;
    text-align: center;
    box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.9);
  }
  .big {
    font-size: 3.6rem;
    font-weight: 900;
    line-height: 1;
  }
  .vs {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.7rem;
    font-size: 0.9rem;
  }
  .waiting {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
