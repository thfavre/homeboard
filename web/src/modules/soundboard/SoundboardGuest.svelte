<script lang="ts">
  import { AudioLines, BookmarkCheck, BookmarkPlus, Play, X } from '@lucide/svelte';
  import type { MiSound, SoundboardState } from '$shared/soundboard.ts';
  import { hb, rpc, attempt, onEvent, price, serverNow } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import MiSearch from './MiSearch.svelte';

  const mod = $derived(hb.modules.soundboard as SoundboardState | undefined);
  const cost = $derived(price('soundboard.sound'));
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

  const wait = $derived(mod ? Math.max(0, Math.ceil((mod.cooldownUntil - now) / 1000)) : 0);

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

{#if mod}
  <div class="sounds">
    <p class="dim intro">
      Sounds play through the TV speakers.
      {#if hb.core?.economyEnabled && cost}Each one costs <Money amount={cost} />.{/if}
    </p>
    <p class="faint wait">{wait ? `Next sound available in ${wait}s` : 'Ready, pick a sound'}</p>

    {#if mod.guestSearch}
      <div class="tabs">
        <button class:active={tab === 'board'} onclick={() => (tab = 'board')}>Board</button>
        <button class:active={tab === 'search'} onclick={() => (tab = 'search')}>Search MyInstants</button>
      </div>
    {/if}

    {#if mod.guestSearch && tab === 'search'}
      <MiSearch>
        {#snippet actions(s)}
          <button class="btn ghost small" class:on={saved(s.mp3)} aria-label={saved(s.mp3) ? 'Remove from My sounds' : 'Save to My sounds'} onclick={() => toggleSaved(s)}>
            {#if saved(s.mp3)}<BookmarkCheck size={16} />{:else}<BookmarkPlus size={16} />{/if}
          </button>
          <button class="btn small" disabled={wait > 0 || sending === s.mp3} onclick={() => playSearch(s.mp3, s.title)}><Play size={15} /> Play</button>
        {/snippet}
      </MiSearch>
    {:else}
    {#if mod.guestSearch}
      <div class="head">
        <h4>My sounds</h4>
        {#if mine.length}<button class="btn ghost small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>{/if}
      </div>
      <div class="grid">
        {#each mine as s, i (s.mp3)}
          <div class="mine">
            <button class="sound card" class:last={last === `mi:${s.mp3}`} disabled={editing || wait > 0 || sending === s.mp3} onclick={() => playSearch(s.mp3, s.title)} style:--h={(i * 47 + 200) % 360}>
              <span class="icon"><AudioLines size={20} /></span>
              <span class="name">{s.title}</span>
            </button>
            {#if editing}<button class="remove" aria-label={`Remove ${s.title}`} onclick={() => toggleSaved(s)}><X size={14} /></button>{/if}
          </div>
        {:else}
          <button class="card empty mine-empty" onclick={() => (tab = 'search')}>
            <BookmarkPlus size={18} /> Search MyInstants and save sounds here. Only you see them.
          </button>
        {/each}
      </div>
      <div class="divider"><span>Party sounds</span></div>
    {/if}
    <div class="grid">
      {#each mod.sounds as s, i (s.id)}
        <button class="sound card" class:last={last === s.id} disabled={wait > 0} onclick={() => play(s.id, s.name)} style:--h={(i * 47) % 360}>
          <span class="icon"><AudioLines size={20} /></span>
          <span class="name">{s.name}</span>
        </button>
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
    justify-content: space-between;
    margin-bottom: -0.3rem;
  }
  .head h4 {
    margin: 0;
    font-size: 0.95rem;
  }
  .mine {
    position: relative;
    display: grid;
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
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    border: 0;
    background: var(--danger);
    color: #fff;
  }
  .on {
    color: var(--accent);
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
  .sound {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.9rem 0.9rem;
    text-align: left;
    transition: transform 0.1s ease;
  }
  .sound:active:not(:disabled) {
    transform: scale(0.96);
  }
  .sound:disabled {
    opacity: 0.5;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.8rem;
    background: hsl(var(--h) 80% 60% / 0.16);
    color: hsl(var(--h) 85% 68%);
  }
  .name {
    font-weight: 600;
    font-size: 0.92rem;
    line-height: 1.2;
  }
  .last {
    border-color: var(--accent);
  }
</style>
