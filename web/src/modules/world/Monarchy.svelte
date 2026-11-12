<script lang="ts">
  import { Crown } from '@lucide/svelte';
  import { hb, serverNow } from '$lib/client.svelte.ts';
  import { day } from '$lib/time.ts';
  import type { Reign, WorldState } from '$shared/world.ts';

  /**
   * The monarchy: every King the town has had, the reigning one on top, each with a regnal number
   * (Arthur I, Arthur II when they take the title again), how long they reigned, and a bar that
   * measures the reign against the longest one. A golden line runs down from crown to crown.
   */

  const mod = $derived(hb.modules.world as WorldState | undefined);
  const reigns = $derived(mod?.king?.reigns ?? []);

  // The clock, so the reign that is going on keeps counting
  let now = $state(serverNow());
  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 10_000);
    return () => clearInterval(t);
  });

  const ROMAN: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  function roman(n: number): string {
    let out = '';
    for (const [value, letters] of ROMAN) {
      while (n >= value) {
        out += letters;
        n -= value;
      }
    }
    return out;
  }

  /** How long a reign lasted, in its two biggest units */
  function length(ms: number): string {
    const min = Math.floor(ms / 60_000);
    if (min < 1) return 'under a minute';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')} min`;
    const d = Math.floor(h / 24);
    return `${d} ${d === 1 ? 'day' : 'days'} ${h % 24} h`;
  }

  /** A moment as "20:15", with the day before it when it was not today */
  function moment(at: number): string {
    const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${day(at, now)}, ${time}`;
  }

  /** The reigns, the latest first, each with its regnal number and its length so far */
  const line = $derived.by(() => {
    const seen = new Map<string, number>();
    const list = reigns.map((r: Reign) => {
      const nth = (seen.get(r.id) ?? 0) + 1;
      seen.set(r.id, nth);
      return { ...r, nth, ms: Math.max(0, (r.to ?? now) - r.from) };
    });
    const longest = Math.max(1, ...list.map((r) => r.ms));
    return list.reverse().map((r) => ({ ...r, share: r.ms / longest, longest: r.ms === longest && list.length > 1 }));
  });
</script>

{#if line.length}
  <div class="monarchy">
    <div class="head">
      <span class="eyebrow">The monarchy</span>
      <span class="count">{line.length} {line.length === 1 ? 'reign' : 'reigns'}</span>
    </div>
    <ol>
      {#each line as r (r.from)}
        <li class:reigning={r.to === null}>
          <span class="mark" style:--who={r.color}><Crown size={r.to === null ? 18 : 13} /></span>
          <div class="reign">
            <div class="who">
              <span class="name">{r.name} <span class="nth">{roman(r.nth)}</span></span>
              <span class="time">{r.to === null ? 'reigning' : ''} {length(r.ms)}</span>
            </div>
            <div class="bar"><span style:width="{Math.max(3, r.share * 100)}%"></span></div>
            <div class="when">
              <span>{r.to === null ? `since ${moment(r.from)}` : `${moment(r.from)} to ${moment(r.to)}`}</span>
              {#if r.longest}<span class="tag">Longest reign</span>{/if}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .monarchy {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .count {
    font-size: 0.8rem;
    color: var(--text-faint);
  }
  ol {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The line of succession, from crown to crown */
  ol::before {
    content: '';
    position: absolute;
    top: 1rem;
    bottom: 1rem;
    left: 1.05rem;
    width: 2px;
    transform: translateX(-50%);
    background: linear-gradient(var(--warning), color-mix(in srgb, var(--warning) 15%, transparent));
  }
  li {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
  }
  /* A crown on a coin in the King's own color */
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.1rem;
    height: 1.6rem;
  }
  .mark :global(svg) {
    box-sizing: content-box;
    padding: 0.28rem;
    border: 2px solid var(--who);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-dim);
  }
  .reigning .mark {
    height: 2.1rem;
  }
  .reigning .mark :global(svg) {
    border-color: var(--warning);
    background: var(--warning);
    color: var(--bg);
    box-shadow: 0 0 0.9rem color-mix(in srgb, var(--warning) 55%, transparent);
  }
  .reign {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }
  .reigning .reign {
    padding: 0.5rem 0.65rem 0.55rem;
    border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
  }
  .who {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .reigning .name {
    font-size: 1.08rem;
  }
  .nth {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--warning);
  }
  .time {
    flex: none;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .reigning .time {
    color: var(--warning);
    font-weight: 600;
  }
  /* The reign measured against the longest one */
  .bar {
    height: 0.3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 9%, transparent);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--warning) 55%, var(--surface-3));
    transition: width 0.6s ease;
  }
  .reigning .bar span {
    background: var(--warning);
  }
  .when {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.76rem;
    color: var(--text-faint);
  }
  .tag {
    flex: none;
    padding: 0.05rem 0.4rem;
    border: 1px solid color-mix(in srgb, var(--warning) 50%, transparent);
    border-radius: 999px;
    color: var(--warning);
    font-weight: 600;
  }
</style>
