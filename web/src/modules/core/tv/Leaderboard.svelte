<script lang="ts">
  import type { Component } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
  import { Camera, Coins, Gamepad2, Guitar, Music, Palette, Sticker, Trophy, Volume2 } from '@lucide/svelte';
  import { RHYTHM_COLORS } from '$shared/games.ts';
  import type { Board, GuestStat } from '$shared/protocol.ts';
  import { hb } from '$lib/client.svelte.ts';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Money from '$lib/ui/Money.svelte';

  /**
   * The boards the host picked (one, or several taking turns: richest, most pixels painted, stickers
   * sent, games played, Rhythm Rain scores on a song...), with a crossfade between them.
   */
  const ICONS: Record<GuestStat, Component<any>> = {
    pixels: Palette,
    stickers: Sticker,
    games: Gamepad2,
    wins: Trophy,
    songs: Music,
    sounds: Volume2,
    photos: Camera,
  };
  const iconOf = (b: Board) => (b.kind === 'money' ? Coins : b.kind === 'score' ? Guitar : (ICONS[b.of as GuestStat] ?? Trophy));

  const boards = $derived(hb.core?.boards ?? []);
  const seconds = $derived(Math.max(5, hb.core?.boardSeconds ?? 15));

  // The board on screen, by id: it stays put when the list changes around it
  let currentId = $state('');
  const current = $derived(boards.find((b) => b.id === currentId) ?? boards[0]);
  const position = $derived(current ? boards.indexOf(current) : 0);
  /** Bumped each time the board changes, to restart the progress bar */
  let turn = $state(0);

  $effect(() => {
    if (boards.length < 2) return;
    const t = setInterval(() => {
      const i = current ? boards.indexOf(current) : -1;
      currentId = boards[(i + 1) % boards.length].id;
      turn++;
    }, seconds * 1000);
    return () => clearInterval(t);
  });

  // The card follows the height of the board it shows, so it grows and shrinks smoothly
  const heights = $state<Record<string, number>>({});
  const measure = (node: HTMLElement, id: string) => {
    const ro = new ResizeObserver(() => (heights[id] = node.offsetHeight));
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  };
  const height = $derived(current ? heights[current.id] : undefined);

  const rowsOf = (b: Board) => b.rows.slice(0, 10);
  // Smaller rows once the list gets long, so the sidebar keeps room for the join card
  const compactOf = (b: Board) => rowsOf(b).length > 6;
  /** The podium is bigger: 1st, 2nd and 3rd, then normal size */
  const PODIUM = [1.5, 1.3, 1.15];
  const scaleOf = (i: number) => PODIUM[i] ?? 1;
  const avatarSize = (b: Board, i: number) => `${(compactOf(b) ? 1.6 : 2) * scaleOf(i)}rem`;
  const count = (n: number) => n.toLocaleString('en-US');
  const colorsText = (n: number) => (n === 1 ? '1 color' : `${n} colors`);
</script>

{#if current}
  <div class="card board" class:dotted={boards.length > 1} style:height={height ? `${height}px` : undefined}>
    <div class="pages">
      <!-- Keyed by board: the outgoing one keeps its rows while it fades out -->
      {#each [current] as b (b.id)}
        {@const Icon = iconOf(b)}
        {@const compact = compactOf(b)}
        <div class="page" class:compact use:measure={b.id} in:fade={{ duration: 450, delay: 250 }} out:fade={{ duration: 300 }}>
          {#if b.song}
            <div class="song" in:fly={{ y: -10, duration: 450, delay: 250 }}>
              {#if b.song.cover}
                <img class="cover" src={b.song.cover} alt="" />
              {:else}
                <span class="cover blank"><Guitar size="1.6rem" /></span>
              {/if}
              <span class="song-text">
                <span class="eyebrow"><Guitar size="0.85rem" /> Rhythm Rain · {b.song.chart} · {colorsText(b.song.colors)}</span>
                <strong class="truncate">{b.song.title}</strong>
                {#if b.song.artist}<span class="artist truncate">{b.song.artist}</span>{/if}
              </span>
            </div>
          {:else}
            <span class="eyebrow title" in:fly={{ y: -10, duration: 450, delay: 250 }}><Icon size="0.95rem" /> {b.title}</span>
          {/if}
          <ol>
            {#each rowsOf(b) as g, i (g.id)}
              <li animate:flip={{ duration: 500 }} class="place-{i + 1}" style:--k={scaleOf(i)} in:fly={{ x: 28, duration: 450, delay: 300 + i * 55 }}>
                <span class="rank mono">{i + 1}</span>
                <Avatar name={g.name} color={g.color} id={g.id} size={avatarSize(b, i)} />
                <span class="name truncate">{g.name}</span>
                {#if b.kind === 'money'}
                  <Money amount={g.value} />
                {:else}
                  <span class="value mono">{count(g.value)}<span class="unit">{b.kind === 'score' ? 'pts' : g.value === 1 ? b.one : b.unit}</span></span>
                {/if}
              </li>
            {/each}
          </ol>
        </div>
      {/each}
    </div>
    {#if boards.length > 1}
      <div class="dots" aria-hidden="true">
        {#each boards as b, i (b.id)}
          <span class="dot" class:on={i === position} style:--tint={b.kind === 'score' ? RHYTHM_COLORS[0].hex : undefined}>
            {#if i === position}{#key turn}<span class="fill" style:animation-duration="{seconds}s"></span>{/key}{/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .board {
    position: relative;
    box-sizing: content-box;
    padding: 1.1rem 1.2rem;
    /* Can shrink (cutting the last rows) rather than push the join card off the screen */
    min-height: 0;
    overflow: hidden;
    transition: height 0.6s cubic-bezier(0.3, 0.8, 0.3, 1);
  }
  .board.dotted {
    padding-bottom: 1.4rem;
  }
  .pages {
    display: grid;
  }
  /* The outgoing and the incoming board on top of each other during the crossfade */
  .page {
    grid-area: 1 / 1;
    align-self: start;
    display: grid;
    align-content: start;
    gap: 0.7rem;
    min-width: 0;
  }
  .page.compact {
    gap: 0.5rem;
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .song {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }
  .cover {
    flex: none;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 0.6rem;
    object-fit: cover;
    box-shadow: 0 0.4rem 1.2rem -0.4rem rgba(0, 0, 0, 0.6);
  }
  .cover.blank {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .song-text {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
  }
  .song-text .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .song-text strong {
    font-size: 1.15rem;
  }
  .artist {
    color: var(--text-dim);
    font-size: 0.9rem;
  }
  .compact ol {
    gap: 0.28rem;
  }
  .compact li {
    font-size: calc(0.92rem * var(--k, 1));
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: calc(1.02rem * var(--k, 1));
  }
  .rank {
    width: 1.1rem;
    color: var(--text-faint);
    font-weight: 700;
    text-align: center;
  }
  .place-1 .rank {
    color: var(--coin);
  }
  .place-2 .rank {
    color: #c9d1e0;
  }
  .place-3 .rank {
    color: #d99a6c;
  }
  .name {
    flex: 1;
    font-weight: 500;
  }
  .place-1 .name,
  .place-2 .name,
  .place-3 .name {
    font-weight: 700;
  }
  .value {
    font-weight: 700;
    white-space: nowrap;
  }
  .unit {
    margin-left: 0.3em;
    font-size: 0.75em;
    font-weight: 500;
    color: var(--text-faint);
  }
  /* A bit of air between the podium and the rest */
  .place-3 {
    padding-bottom: 0.3rem;
  }
  /* Which board is on, and how long until the next one */
  .dots {
    position: absolute;
    left: 1.2rem;
    right: 1.2rem;
    bottom: 0.55rem;
    display: flex;
    justify-content: center;
    gap: 0.3rem;
  }
  .dot {
    position: relative;
    width: 0.4rem;
    height: 0.25rem;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--text) 18%, transparent);
    transition: width 0.5s ease;
  }
  .dot.on {
    width: 1.8rem;
  }
  .fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--tint, var(--accent));
    transform-origin: left;
    animation: fill linear both;
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
</style>
