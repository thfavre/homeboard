<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { Briefcase, Timer, Trophy, Zap, CloudFog, Shuffle } from '@lucide/svelte';
  import { SPY_GADGETS, type CrowdEvent, type SpyView } from '$shared/crowd.ts';
  import type { MatchState } from '$shared/games.ts';
  import { Now } from '../store.svelte.ts';
  import CrowdField from './CrowdField.svelte';
  import Bullets from './Bullets.svelte';
  import KillFeed from './KillFeed.svelte';
  import { crowdMusic, crowdSound } from './sound.ts';

  /** Spy Hunt on the TV: the square, the clock, the suitcases left, the snipers' shots, the spy's gadget */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as SpyView | null);
  const now = new Now(200);
  const player = (id: string | null) => m.players.find((p) => p.id === id);
  const spy = $derived(player(v?.spy ?? null));
  const opened = $derived(v?.cases.filter((c) => c.open).length ?? 0);
  const GADGET_ICONS = { flashbang: Zap, smoke: CloudFog, decoy: Shuffle } as const;

  $effect(() => {
    if (!v) return;
    if (m.phase === 'play') crowdMusic.play('spy', v.musicVolume);
    else crowdMusic.stop();
  });
  onDestroy(() => crowdMusic.stop());

  const left = $derived(v ? Math.max(0, v.until - now.value) : 0);
  const clock = (ms: number) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  let beeped = -1;
  $effect(() => {
    const sec = Math.ceil(left / 1000);
    if (v && (v.step === 'pick' || v.step === 'hunt') && sec >= 1 && sec <= (v.step === 'pick' ? 3 : 5) && sec !== beeped) {
      beeped = sec;
      crowdSound('beep', v.soundVolume);
    }
  });
  let endedRound = 0;
  $effect(() => {
    if (!v || v.step !== 'reveal' || endedRound === v.round) return;
    endedRound = v.round;
    crowdSound(v.outcome === 'time' ? 'round' : 'win', v.soundVolume);
  });

  /** A big word for a moment when the spy uses the gadget */
  let flashWord = $state<{ text: string; key: number } | null>(null);
  let seq = 0;
  const onevent = (e: CrowdEvent) => {
    if (e.k !== 'gadget') return;
    flashWord = { text: SPY_GADGETS.find((g) => g.id === e.g)?.name ?? '', key: ++seq };
    const mine = seq;
    setTimeout(() => flashWord?.key === mine && (flashWord = null), 1800);
  };

  const verdict = $derived.by(() => {
    if (!v || v.step !== 'reveal') return null;
    const shooter = player(v.shooter);
    switch (v.outcome) {
      case 'shot':
        return { big: `${shooter?.name} got the spy!`, small: `${spy?.name} was the spy · +2 points`, color: shooter?.color };
      case 'cases':
        return { big: `${spy?.name} got away!`, small: 'The spy opened the suitcases · +3 points', color: spy?.color };
      case 'ammo':
        return { big: `${spy?.name} got away!`, small: 'The snipers ran out of shots · +3 points', color: spy?.color };
      default:
        return { big: 'Time is up', small: `${spy?.name} was the spy · +1 point to every sniper` };
    }
  });
</script>

{#if v}
  <div class="spy">
    <div class="bar">
      <span class="round mono">Round {v.round}<span class="faint">/{v.rounds}</span></span>
      <span class="chip spy-chip" style:--c={spy?.color}>Spy <strong>{spy?.name}</strong></span>
      <span class="chip clock" class:hurry={v.step === 'hunt' && left < 20_000}>
        <Timer size="1.2rem" />
        <span class="mono">{v.step === 'pick' ? '-' : clock(v.step === 'hunt' ? left : 0)}</span>
      </span>
      <span class="chip cases">
        {#each v.cases as c, i (i)}<span class="case" class:open={c.open}><Briefcase size="1.3rem" /></span>{/each}
        <span class="dim">{opened}/{v.needed}</span>
      </span>
      <span class="chip gadget">
        {#if v.gadget.used}
          {@const Icon = GADGET_ICONS[v.gadget.used]}
          <Icon size="1.1rem" /> {SPY_GADGETS.find((g) => g.id === v.gadget.used)?.name} used
        {:else}
          <Zap size="1.1rem" /> {v.gadget.picked ? 'Gadget ready' : 'No gadget yet'}
        {/if}
      </span>
      <span class="spacer"></span>
      <div class="snipers">
        {#each m.players.filter((p) => p.id !== v.spy) as p (p.id)}
          <span class="sniper" style:--c={p.color}>
            <span class="dot"></span>
            <strong class="truncate">{p.name}</strong>
            <Bullets left={v.shots[p.id] ?? 0} size="0.9rem" />
            {#if v.points[p.id]}<span class="points"><Trophy size="0.9rem" />{v.points[p.id]}</span>{/if}
          </span>
        {/each}
      </div>
    </div>

    <div class="arena">
      <CrowdField
        kind="spy"
        round={v.round}
        looks={v.looks ?? []}
        players={m.players}
        soundVolume={v.soundVolume}
        readyAt={v.readyAt}
        reloadMs={v.reloadMs}
        reveal={v.reveal !== undefined ? { [v.spy]: v.reveal } : null}
        winner={v.outcome === 'cases' || v.outcome === 'ammo' ? v.spy : null}
        cases={v.cases}
        smoke={v.smoke}
        blindUntil={v.blindUntil}
        drawFadeMs={v.drawFadeMs}
        {onevent}
      />
      <KillFeed kills={v.kills} players={m.players} spy={v.spy} />

      {#if v.step === 'pick'}
        <div class="banner" transition:fade>
          {#if left <= 3000}
            {#key Math.ceil(left / 1000)}<span class="count mono" in:scale={{ start: 1.8, duration: 300 }}>{Math.max(1, Math.ceil(left / 1000))}</span>{/key}
          {:else}
            <span class="big" style:color={spy?.color}>{spy?.name} is the spy</span>
            <span class="small">Somewhere in the crowd... snipers, get ready</span>
          {/if}
        </div>
      {:else if v.step === 'hunt' && now.value - (v.until - v.huntMs) < 1400}
        <div class="banner" out:fade><span class="count go" in:scale={{ start: 2 }}>HUNT!</span></div>
      {:else if verdict}
        <div class="banner" in:fly={{ y: 30 }}>
          <span class="big" style:color={verdict.color ?? '#fff'}>{verdict.big}</span>
          <span class="small">{verdict.small}{v.round < v.rounds ? ' · next round soon' : ''}</span>
        </div>
      {/if}
      {#if flashWord}
        {#key flashWord.key}
          <div class="banner"><span class="word" in:scale={{ start: 0.4, duration: 350 }} out:fade>{flashWord.text}!</span></div>
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
  .spy {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.9rem;
    min-height: 0;
    height: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.7rem;
    min-width: 0;
  }
  .round {
    font-size: 1.6rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.9rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.15rem;
    white-space: nowrap;
  }
  .spy-chip {
    border: 2px solid var(--c);
  }
  .clock .mono {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .clock.hurry {
    color: var(--danger, #ff5a5a);
    border-color: currentColor;
  }
  .case {
    display: inline-flex;
    color: var(--text-faint);
  }
  .case.open {
    color: var(--coin);
    filter: drop-shadow(0 0 0.4rem var(--coin));
  }
  .spacer {
    flex: 1;
  }
  .snipers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .sniper {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 14rem;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: var(--surface);
    border: 2px solid color-mix(in srgb, var(--c) 70%, transparent);
    font-size: 1rem;
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--c);
    flex: none;
  }
  .points {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    color: var(--coin);
    font-weight: 700;
  }
  .arena {
    position: relative;
    min-height: 0;
  }
  .banner {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.6rem;
    pointer-events: none;
    text-align: center;
  }
  .big {
    font-family: var(--font-display);
    font-size: 4.2rem;
    font-weight: 800;
    color: #fff;
    text-shadow:
      0 0.3rem 1.6rem rgb(0 0 0 / 0.8),
      0 0 0.2rem rgb(0 0 0 / 0.9);
  }
  .small {
    padding: 0.4rem 1.2rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .count {
    font-size: 11rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0.4rem 2rem rgb(0 0 0 / 0.8);
  }
  .go {
    font-family: var(--font-display);
    color: #ff6b6b;
  }
  .word {
    font-family: var(--font-display);
    font-size: 6rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 0 2rem rgb(255 255 255 / 0.8), 0 0.3rem 1rem rgb(0 0 0 / 0.7);
  }
</style>
