<script lang="ts">
  import { AudioLines } from '@lucide/svelte';
  import type { SoundboardState } from '$shared/soundboard.ts';
  import { hb, rpc, attempt, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';

  const mod = $derived(hb.modules.soundboard as SoundboardState | undefined);
  const cost = $derived(price('soundboard.sound'));
  let now = $state(Date.now());
  let last = $state<string | null>(null);

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  const wait = $derived(mod ? Math.max(0, Math.ceil((mod.cooldownUntil - now) / 1000)) : 0);

  async function play(id: string, name: string) {
    const ok = await attempt(() => rpc('soundboard', 'play', { id }), `${name} is playing`);
    if (ok) last = id;
  }
</script>

{#if mod}
  <div class="sounds">
    <p class="dim intro">
      Sounds play through the TV speakers.
      {#if hb.core?.economyEnabled && cost}Each one costs <Money amount={cost} />.{/if}
    </p>
    <p class="faint wait">{wait ? `Next sound available in ${wait}s` : 'Ready, pick a sound'}</p>

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
