<script lang="ts">
  import { Check, Crown } from '@lucide/svelte';
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { GAME_COLORS, type MatchState, type ReflexTap, type ReflexView } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';
  import CountUp from '../ui/CountUp.svelte';
  import { Now, gamesState } from '../store.svelte.ts';

  /**
   * While playing: the color, and who has tapped (no times, they stay secret).
   * Then the reveal: a round at a time, everyone's time of it popping in one after the other,
   * totals counting up; once all are out the rows sort themselves and the fastest gets the crown.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as ReflexView);
  const s = $derived(gamesState());
  const now = new Now(100);
  const showColors = $derived(!!s && (s.settings.tvColors || !s.lights));
  const hex = $derived(GAME_COLORS.find((c) => c.id === v.color)?.hex ?? null);
  const lit = $derived(showColors && hex && (v.step === 'go' || v.step === 'done'));

  const revealing = $derived(v.step === 'reveal' || m.phase === 'result');
  // A round at a time for everyone, each player's time a moment after the previous one
  const shownAt = (playerIndex: number, round: number) => (v.revealAt ?? Infinity) + round * (v.stepMs ?? 0) + playerIndex * (v.cascadeMs ?? 0);
  const visible = (playerIndex: number, round: number) => m.phase === 'result' || now.value >= shownAt(playerIndex, round);
  const allOut = $derived(visible(m.players.length - 1, v.rounds - 1));
  const cost = (t: ReflexTap) => t.ms ?? v.penaltyMs;
  const shownTotal = (id: string, i: number) => (v.taps?.[id] ?? []).reduce((sum, t, r) => sum + (visible(i, r) ? cost(t) : 0), 0);
  const rows = $derived.by(() => {
    const list = m.players.map((p, i) => ({ p, i, total: shownTotal(p.id, i) }));
    return allOut ? [...list].sort((a, b) => a.total - b.total) : list;
  });
  const winners = $derived(m.result?.winners ?? []);
  // Smaller chips when there are many rounds
  const chip = $derived(Math.min(7.5, 62 / Math.max(1, v.rounds) - 0.8));
  const fastestMs = $derived(Math.min(...Object.values(v.taps ?? {}).flatMap((list) => list.map((t) => t.ms ?? Infinity))));
</script>

{#if !revealing}
  <div class="reflex">
    <div class="stage" class:lit style:--c={hex ?? 'transparent'}>
      <span class="eyebrow">Round {v.round} of {v.rounds}</span>
      {#if v.step === 'done'}
        <h1>{v.tapped.length === m.players.length ? 'Everyone is in' : `${v.tapped.length} of ${m.players.length} tapped`}</h1>
      {:else if v.step === 'go'}
        <h1 class="now">{showColors ? 'TAP' : 'TAP THE COLOR'}</h1>
      {:else if v.step === 'wait'}
        <h1 class="wait">Wait for it...</h1>
      {:else}
        <h1>Get ready</h1>
      {/if}
    </div>

    <ol class="players">
      {#each m.players as p (p.id)}
        {@const done = v.tapped.includes(p.id)}
        <li class:done>
          <Avatar name={p.name} color={p.color} id={p.id} size="2.8rem" />
          <span class="name truncate">{p.name}</span>
          {#if done}<span class="tick" in:scale={{ start: 0.3, duration: 250 }}><Check size="1.6rem" strokeWidth={3} /></span>{/if}
        </li>
      {/each}
    </ol>
  </div>
{:else}
  <div class="reveal" style:--chip="{chip}rem">
    <h1 class="title">{allOut ? (m.result ? m.result.headline : 'Final times') : 'The times'}</h1>
    <ol class="board">
      {#each rows as row (row.p.id)}
        {@const won = allOut && winners.includes(row.p.id)}
        <li class="card" class:won animate:flip={{ duration: 700 }}>
          <span class="who">
            <Avatar name={row.p.name} color={row.p.color} id={row.p.id} size="3rem" />
            <span class="truncate">{row.p.name}</span>
          </span>
          <span class="slots">
            {#each Array(v.rounds) as _, r}
              {@const t = v.taps?.[row.p.id]?.[r]}
              <span class="slot">
                {#if t && visible(row.i, r)}
                  <span
                    class="time mono"
                    class:miss={t.ms === null}
                    class:best={t.ms !== null && t.ms === fastestMs}
                    in:scale={{ start: 1.8, duration: 400, opacity: 0 }}
                  >
                    {t.ms !== null ? t.ms : t.miss === 'early' ? 'early' : t.miss === 'wrong' ? 'wrong' : 'miss'}
                  </span>
                {/if}
              </span>
            {/each}
          </span>
          <span class="total mono"><CountUp value={row.total / 1000} decimals={2} />s</span>
          <span class="prize">
            {#if won}
              <span class="crown" in:scale={{ start: 0.2, duration: 600 }}><Crown size="2rem" /></span>
              {#if hb.core?.economyEnabled && (m.result?.payouts[row.p.id] ?? 0) > 0}<span class="gain"><Money amount={m.result!.payouts[row.p.id]} sign /></span>{/if}
            {/if}
          </span>
        </li>
      {/each}
    </ol>
    <p class="faint note">Time in ms per round. A miss counts {v.penaltyMs / 1000} s. Lowest total wins.</p>
  </div>
{/if}

<style>
  .reflex {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 26rem;
    gap: 2.5rem;
  }
  .stage {
    position: relative;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 2rem;
    border-radius: 2.5rem;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    text-align: center;
    transition:
      background 0.05s linear,
      box-shadow 0.05s linear;
  }
  .stage.lit {
    background: var(--c);
    box-shadow: 0 0 10rem -2rem var(--c);
    color: #fff;
    text-shadow: 0 0.2rem 1rem rgba(0, 0, 0, 0.35);
  }
  .eyebrow {
    position: absolute;
    top: 2rem;
    font-size: 1.2rem;
  }
  .lit .eyebrow {
    color: rgba(255, 255, 255, 0.8);
  }
  h1 {
    font-size: 6rem;
    letter-spacing: -0.03em;
  }
  .wait {
    color: var(--text-dim);
    animation: hb-pulse 1.2s ease-in-out infinite;
  }
  .now {
    font-size: 9rem;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
    align-content: center;
  }
  .players li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.6rem 1.2rem 0.6rem 0.6rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.35rem;
    font-weight: 600;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }
  .players li.done {
    opacity: 1;
  }
  .name {
    flex: 1;
  }
  .tick {
    display: grid;
    color: var(--success);
  }
  .reveal {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1.2rem;
    justify-items: center;
  }
  .title {
    font-size: 3.6rem;
  }
  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    align-content: center;
    gap: 0.8rem;
    max-width: 100%;
  }
  .board li {
    display: grid;
    grid-template-columns: 14rem auto 10rem 8rem;
    align-items: center;
    gap: 1.5rem;
    padding: 0.8rem 1.4rem;
  }
  .board li.won {
    border-color: var(--coin);
    box-shadow: 0 0 3.5rem -1rem var(--coin);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.4rem;
    font-weight: 600;
    min-width: 0;
  }
  .slots {
    display: flex;
    gap: 0.6rem;
  }
  .slot {
    width: var(--chip);
    height: 3rem;
    border-radius: 0.8rem;
    border: 1px dashed var(--border-strong);
    display: grid;
  }
  .time {
    display: grid;
    place-items: center;
    border-radius: 0.8rem;
    background: var(--surface-3);
    font-size: min(1.3rem, calc(var(--chip) * 0.28));
    font-weight: 700;
  }
  .time.best {
    background: color-mix(in srgb, var(--success) 30%, var(--surface-3));
    color: var(--success);
  }
  .time.miss {
    background: color-mix(in srgb, var(--danger) 20%, var(--surface-3));
    color: var(--danger);
    font-weight: 600;
  }
  .total {
    text-align: right;
    font-size: 2.4rem;
    font-weight: 700;
  }
  .prize {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .crown {
    color: var(--coin);
    display: grid;
  }
  .gain {
    color: var(--success);
    font-size: 1.3rem;
  }
  .note {
    font-size: 1.1rem;
  }
</style>
