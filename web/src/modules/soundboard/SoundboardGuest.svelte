<script lang="ts">
  import { BookmarkCheck, BookmarkPlus, X } from '@lucide/svelte';
  import type { MiSound, SoundboardState } from '$shared/soundboard.ts';
  import { hb, rpc, attempt, onEvent, price, serverNow } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import MiSearch from './MiSearch.svelte';
  import SoundCard from './SoundCard.svelte';
  import ListenButton from './ListenButton.svelte';

  const mod = $derived(hb.modules.soundboard as SoundboardState | undefined);
  const economy = $derived(!!hb.core?.economyEnabled);
  // Party sounds (the host's board) and searched ones (incl. My sounds) are priced separately
  const partyCost = $derived(price('soundboard.sound'));
  const searchCost = $derived(price('soundboard.search'));
  let now = $state(serverNow());
  let last = $state<string | null>(null);
  let tab = $state<'board' | 'search'>('board');
  let sending = $state<string | null>(null);
  // My sounds: this guest's own board, saved from search
  let mine = $state<MiSound[]>([]);
  let editing = $state(false);
  const saved = (mp3: string) => mine.some((m) => m.mp3 === mp3);

  $effect(() => {
    if (!mod?.guestSearch) return;
    rpc<MiSound[]>('soundboard', 'mine').then((l) => (mine = l)).catch(() => {});
    return onEvent<MiSound[]>('soundboard', 'mine', (l) => (mine = l));
  });

  async function toggleSaved(s: MiSound) {
    const method = saved(s.mp3) ? 'removeMine' : 'saveMine';
    const list = await attempt(() => rpc<MiSound[]>('soundboard', method, s), method === 'saveMine' ? `${s.title} saved to My sounds` : undefined);
    if (list) mine = list;
    if (!mine.length) editing = false;
  }

  $effect(() => {
    const t = setInterval(() => (now = serverNow()), 250);
    return () => clearInterval(t);
  });

  const wait = $derived(mod && mod.cooldownSec > 0 ? Math.max(0, Math.ceil((mod.cooldownUntil - now) / 1000)) : 0);

  async function play(id: string, name: string) {
    const ok = await attempt(() => rpc('soundboard', 'play', { id }), `${name} is playing`);
    if (ok) last = id;
  }

  async function playSearch(mp3: string, title: string) {
    sending = mp3;
    const ok = await attempt(() => rpc('soundboard', 'playSearch', { mp3, title }), `${title} is playing`);
    sending = null;
    if (ok) last = `mi:${mp3}`;
  }
</script>

{#snippet tag(amount: number)}
  {#if economy}<span class="tag"><Money {amount} free /><span class="each">each</span></span>{/if}
{/snippet}

{#if mod}
  <div class="sounds">
    <p class="dim intro">
      Sounds play through the TV speakers.
      {#if !mod.guestSearch && economy && partyCost}Each one costs <Money amount={partyCost} />.{/if}
    </p>
    {#if mod.cooldownSec > 0}
      <p class="faint wait">{wait ? `Next sound available in ${wait}s` : ''}</p>
    {/if}

    {#if mod.guestSearch}
      <div class="tabs">
        <button class:active={tab === 'board'} onclick={() => (tab = 'board')}>Board</button>
        <button class:active={tab === 'search'} onclick={() => (tab = 'search')}>Search</button>
      </div>
    {/if}

    {#if mod.guestSearch && tab === 'search'}
      <div class="head">
        <h4>Tap a sound to play it</h4>
        {@render tag(searchCost)}
      </div>
      <MiSearch>
        {#snippet item(s, i)}
          <SoundCard name={s.title} hue={(i * 47 + 200) % 360} active={last === `mi:${s.mp3}`} disabled={wait > 0 || sending === s.mp3} onclick={() => playSearch(s.mp3, s.title)} asideBelow>
            {#snippet aside()}
              <ListenButton sound={s} />
              <button class:on={saved(s.mp3)} aria-label={saved(s.mp3) ? 'Remove from My sounds' : 'Save to My sounds'} onclick={() => toggleSaved(s)}>
                {#if saved(s.mp3)}<BookmarkCheck size={16} />{:else}<BookmarkPlus size={16} />{/if}
              </button>
            {/snippet}
          </SoundCard>
        {/snippet}
      </MiSearch>
    {:else}
    {#if mod.guestSearch}
      <div class="head">
        <h4>My sounds</h4>
        {@render tag(searchCost)}
        <span class="grow"></span>
        {#if mine.length}<button class="btn ghost small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>{/if}
      </div>
      <div class="grid">
        {#each mine as s, i (s.mp3)}
          <SoundCard name={s.title} hue={(i * 47 + 200) % 360} active={last === `mi:${s.mp3}`} disabled={editing || wait > 0 || sending === s.mp3} onclick={() => playSearch(s.mp3, s.title)} badge={editing ? removeBadge : undefined} />
          {#snippet removeBadge()}
            <button class="remove" aria-label={`Remove ${s.title}`} onclick={() => toggleSaved(s)}><X size={14} /></button>
          {/snippet}
        {:else}
          <button class="card empty mine-empty" onclick={() => (tab = 'search')}>
            <BookmarkPlus size={18} /> Search for sounds and save them here. Only you see them.
          </button>
        {/each}
      </div>
      <div class="divider"><span>Party sounds</span>{@render tag(partyCost)}</div>
    {/if}
    <div class="grid">
      {#each mod.sounds as s, i (s.id)}
        <SoundCard name={s.name} hue={(i * 47) % 360} active={last === s.id} disabled={wait > 0} onclick={() => play(s.id, s.name)} />
      {:else}
        <div class="card empty">No sounds available.</div>
      {/each}
    </div>
    {/if}
  </div>
{/if}

<style>
  .sounds {
    display: grid;
    gap: 0.9rem;
  }
  .intro {
    font-size: 0.9rem;
  }
  .wait {
    font-size: 0.85rem;
    margin-top: -0.4rem;
    min-height: 1.3em;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .tabs button {
    padding: 0.5rem;
    border: 0;
    border-radius: calc(var(--radius-sm) - 3px);
    background: none;
    color: var(--text-dim);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .tabs button.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: -0.3rem;
    min-height: 2rem;
  }
  .grow {
    flex: 1;
  }
  /* Price of the sounds in a section */
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    color: var(--text);
    font-size: 0.78rem;
    text-transform: none;
    letter-spacing: 0;
  }
  .each {
    color: var(--text-dim);
    font-weight: 500;
  }
  .head h4 {
    margin: 0;
    font-size: 0.95rem;
  }
  .mine-empty {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem;
    text-align: left;
    color: var(--text-dim);
    font-size: 0.88rem;
    border-style: dashed;
  }
  .remove {
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    border: 0;
    background: var(--danger);
    color: #fff;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--text-faint);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-strong);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
  }
</style>
