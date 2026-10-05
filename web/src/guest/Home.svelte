<script lang="ts">
  import { ChevronRight } from '@lucide/svelte';
  import { hb, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import { activeModules } from '../modules/index.ts';

  let { open }: { open: (id: string) => void } = $props();

  const homeCards = $derived(
    activeModules()
      .filter((m) => m.guestHome)
      .sort((a, b) => a.guestHome!.order - b.guestHome!.order),
  );
  const features = $derived(
    activeModules()
      .filter((m) => m.guest)
      .sort((a, b) => a.guest!.order - b.guest!.order),
  );
</script>

<div class="home">
  <p class="hello">Hi <strong>{hb.me?.name}</strong>, what do you want to do?</p>

  {#each homeCards as m (m.id)}
    {@const Card = m.guestHome!.component}
    <Card />
  {/each}

  {#if features.length}
    <div class="grid">
      {#each features as m (m.id)}
        {@const f = m.guest!}
        <button class="tile card" onclick={() => open(m.id)}>
          <span class="icon"><f.icon size={22} /></span>
          <span class="text">
            <span class="title">{f.title}</span>
            <span class="tagline">{f.tagline}</span>
          </span>
          {#if f.priceKey && hb.core?.economyEnabled}
            {@const pInfo = hb.core.prices[f.priceKey]}
            <span class="price">
              <Money amount={price(f.priceKey)} free />
              {#if pInfo?.unit}<span class="dim small">{` / ${pInfo.unit}`}</span>{/if}
            </span>
          {/if}
          <ChevronRight size={18} class="chev" />
        </button>
      {/each}
    </div>
  {:else}
    <div class="card empty">The host has not turned on any activity yet. Hang tight.</div>
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: 1rem;
  }
  .hello {
    color: var(--text-dim);
    font-size: 1.05rem;
    padding: 0.25rem 0.1rem;
  }
  .hello strong {
    color: var(--text);
  }
  .grid {
    display: grid;
    gap: 0.6rem;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.95rem 1rem;
    text-align: left;
    transition: transform 0.12s ease;
  }
  .tile:active {
    transform: scale(0.985);
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.1rem;
  }
  .title {
    font-weight: 600;
    font-size: 1rem;
  }
  .tagline {
    font-size: 0.83rem;
    color: var(--text-dim);
  }
  .price {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .tile :global(.chev) {
    color: var(--text-faint);
    flex: none;
  }
</style>
