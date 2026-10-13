<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { ArrowUpRight, Camera, Crown, Sparkles, Tv, UsersRound } from '@lucide/svelte';
  import { hb, price } from '$lib/client.svelte.ts';
  import Money from '$lib/ui/Money.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import { ago } from '$lib/time.ts';
  import { activeModules, moduleById } from '../modules/index.ts';
  import { avatarFlow } from './avatar.svelte.ts';

  let { open, earn }: { open: (id: string) => void; earn: () => void } = $props();

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

  /** Each tile gets its own theme colour so the grid is easy to scan */
  const tints = ['--accent', '--accent-2', '--coin', '--danger', '--success', '--warning'];

  const economy = $derived(!!hb.core?.economyEnabled);
  const others = $derived(Math.max(0, (hb.core?.guestsOnline ?? 1) - 1));
  const rank = $derived.by(() => {
    const i = hb.core?.leaderboardMode === 'off' ? -1 : (hb.core?.leaderboard.findIndex((g) => g.id === hb.me?.id) ?? -1);
    return i < 0 ? null : i + 1;
  });
  const live = $derived(moduleById(hb.core?.takeover)?.guest?.title ?? (hb.core?.takeover ? 'Something' : null));
  const recent = $derived(hb.activity.slice(0, 4));

  // Refresh the "2 min ago" labels
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 20_000);
    return () => clearInterval(t);
  });

  const greeting = $derived.by(() => {
    const h = new Date(now).getHours();
    return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening';
  });
</script>

<div class="home">
  {#if hb.me}
    <section class="hero card">
      <div class="who">
        <!-- Tap the picture to edit it, or to take one -->
        <button
          class="pic"
          onclick={() => (avatarFlow.mode = hb.me?.avatar ? 'edit' : 'new')}
          aria-label={hb.me.avatar ? 'Edit your picture' : 'Take a selfie'}
        >
          <Avatar name={hb.me.name} color={hb.me.color} src={hb.me.avatar} size="3.4rem" />
          <span class="pic-badge">
            {#if hb.me.avatar}<Sparkles size={12} />{:else}<Camera size={12} />{/if}
          </span>
        </button>
        <div class="hi">
          <span class="faint small">{greeting},</span>
          <h1 class="truncate">{hb.me.name}</h1>
        </div>
      </div>
      <div class="facts">
        <span class="fact">
          <UsersRound size={15} />
          {others === 0 ? 'Only you so far' : `${others} other${others === 1 ? '' : 's'} here`}
        </span>
        {#if rank}
          <span class="fact gold"><Crown size={15} /> #{rank} on the board</span>
        {/if}
        {#if live}
          <span class="fact live"><span class="dot"></span>{live} on the TV</span>
        {/if}
      </div>
      {#if economy}
        <button class="wallet" onclick={earn}>
          <span class="wallet-amount"><Money amount={hb.me.balance} whole /></span>
          <span class="wallet-label dim">{hb.core?.currency.name} to spend</span>
          <span class="wallet-cta">Earn more <ArrowUpRight size={16} /></span>
        </button>
      {/if}
    </section>
  {/if}

  {#each homeCards as m (m.id)}
    {@const Card = m.guestHome!.component}
    <Card />
  {/each}

  <section class="block">
    <div class="block-head">
      <h2 class="eyebrow">Things to do</h2>
      {#if features.length}<span class="hint faint"><Tv size={14} /> It all shows on the TV</span>{/if}
    </div>

    {#if features.length}
      <div class="grid">
        {#each features as m, i (m.id)}
          {@const f = m.guest!}
          {@const cost = f.priceKey ? price(f.priceKey) : 0}
          {@const unit = f.priceKey ? hb.core?.prices[f.priceKey]?.unit : undefined}
          {@const short = economy && cost > (hb.me?.balance ?? 0)}
          <button class="tile card" class:wide={features.length % 2 === 1 && i === 0} style:--tint="var({tints[i % tints.length]})" onclick={() => open(m.id)}>
            <span class="icon"><f.icon size={22} /></span>
            <span class="text">
              <span class="title">{f.title}</span>
              <span class="tagline">{f.tagline}</span>
            </span>
            {#if economy && f.priceKey}
              <span class="price" class:short>
                <Money amount={cost} free />
                {#if unit && cost > 0}<span class="unit">/ {unit}</span>{/if}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <div class="card empty">
        <span class="empty-icon"><Sparkles size={26} /></span>
        <strong>Nothing to do just yet</strong>
        <p class="dim">The host has not turned on any activity. Hang tight, it will show up here.</p>
      </div>
    {/if}
  </section>

  {#if recent.length}
    <section class="block">
      <div class="block-head"><h2 class="eyebrow">Happening now</h2></div>
      <div class="card feed">
        {#each recent as it (it.id)}
          <div class="entry" animate:flip={{ duration: 300 }} in:fly={{ y: -10, duration: 300 }}>
            {#if it.guest}
              <Avatar name={it.guest.name} color={it.guest.color} id={it.guest.id} size="1.9rem" />
            {:else}
              <span class="entry-icon"><Sparkles size={15} /></span>
            {/if}
            <span class="entry-text">
              <span class="line">{it.text}</span>
              <span class="faint when">{ago(it.at, now)}</span>
            </span>
            {#if it.amount}<span class="entry-amount"><Money amount={it.amount} /></span>{/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .home {
    /* Coin gold is too light to read as text on light themes */
    --coin-text: color-mix(in srgb, var(--coin) 75%, var(--text));
    display: grid;
    gap: 1.25rem;
  }
  .small {
    font-size: 0.85rem;
  }

  /* ---------------------------------------------------------------- hero */
  .hero {
    position: relative;
    overflow: hidden;
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
  }
  /* A soft wash of the theme gradient behind the greeting */
  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--gradient);
    opacity: 0.12;
    mask-image: radial-gradient(120% 90% at 0% 0%, #000 20%, transparent 70%);
    pointer-events: none;
  }
  .hero > * {
    position: relative;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .pic {
    position: relative;
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 50%;
    transition: transform 0.15s ease;
  }
  .pic:active {
    transform: scale(0.94);
  }
  .pic-badge {
    position: absolute;
    right: -0.15rem;
    bottom: -0.15rem;
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--bg);
    border: 2px solid var(--bg);
  }
  .hi {
    min-width: 0;
    display: grid;
  }
  .hi h1 {
    font-size: 1.55rem;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.28rem 0.65rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-dim);
  }
  .fact.gold {
    color: var(--coin-text);
    border-color: color-mix(in srgb, var(--coin) 30%, transparent);
    background: color-mix(in srgb, var(--coin) 10%, transparent);
  }
  .fact.live {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: currentColor;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .wallet {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.85rem;
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--coin) 25%, var(--border));
    background: color-mix(in srgb, var(--coin) 7%, var(--surface-2));
    text-align: left;
    transition: transform 0.12s ease;
  }
  .wallet:active {
    transform: scale(0.985);
  }
  .wallet-amount {
    font-size: 1.15rem;
  }
  .wallet-label {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
  }
  .wallet-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--coin-text);
  }

  /* ------------------------------------------------------------- sections */
  .block {
    display: grid;
    gap: 0.6rem;
  }
  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.2rem;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
  }

  /* --------------------------------------------------------------- tiles */
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  /* An odd number of tiles: the first one gets the full width */
  .tile.wide {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    gap: 0.85rem;
    min-height: 0;
  }
  .tile.wide .icon {
    flex: none;
    margin: 0;
  }
  .tile.wide .text {
    flex: 1;
  }
  .tile.wide .price {
    margin: 0;
    padding: 0;
    flex: none;
  }
  .tile {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    min-height: 8.75rem;
    padding: 0.95rem;
    text-align: left;
    transition:
      transform 0.12s ease,
      border-color 0.15s ease;
  }
  .tile::after {
    content: '';
    position: absolute;
    right: -2.5rem;
    top: -2.5rem;
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    background: var(--tint);
    opacity: 0.1;
    filter: blur(18px);
    pointer-events: none;
  }
  .tile:active {
    transform: scale(0.97);
    border-color: color-mix(in srgb, var(--tint) 45%, transparent);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    margin-bottom: 0.45rem;
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--tint) 16%, transparent);
    color: var(--tint);
  }
  .text {
    min-width: 0;
    display: grid;
    gap: 0.15rem;
  }
  .title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.02rem;
    letter-spacing: -0.01em;
  }
  .tagline {
    font-size: 0.8rem;
    line-height: 1.35;
    color: var(--text-dim);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .price {
    margin-top: auto;
    padding-top: 0.5rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    font-size: 0.82rem;
  }
  .price.short {
    color: var(--danger);
  }
  .unit {
    font-size: 0.72rem;
    color: var(--text-faint);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    padding: 1.6rem 1.2rem;
    text-align: center;
  }
  .empty p {
    font-size: 0.88rem;
  }
  .empty-icon {
    display: grid;
    place-items: center;
    width: 3.2rem;
    height: 3.2rem;
    margin-bottom: 0.3rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }

  /* ---------------------------------------------------------------- feed */
  .feed {
    padding: 0.2rem 0.9rem;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }
  .entry:last-child {
    border-bottom: 0;
  }
  .entry-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text-dim);
  }
  .entry-text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .line {
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    font-size: 0.72rem;
  }
  .entry-amount {
    font-size: 0.8rem;
    color: var(--text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
