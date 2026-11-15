<script lang="ts">
  import { fly } from 'svelte/transition';
  import { ChevronLeft, ChevronRight, Hammer, Inbox, Joystick, Mail, Moon, Sparkles } from '@lucide/svelte';
  import { enabled, hb } from '$lib/client.svelte.ts';
  import ArcadeGuest from '../arcade/ArcadeGuest.svelte';
  import { SEALS, type Letter } from '$shared/worldActions.ts';
  import type { WorldState } from '$shared/world.ts';
  import BuildLot from './BuildLot.svelte';
  import Courier from './Courier.svelte';
  import Fireworks from './Fireworks.svelte';
  import WaxSeal from './WaxSeal.svelte';
  import { loadMail, mail, openLetter, unread } from './mail.svelte.ts';
  import { paperStyle } from './papers.ts';

  /**
   * Things a guest makes happen in the town from the phone, beyond their look: send a letter by
   * courier, launch fireworks, build on the lot, challenge someone at the arcade. Each opens on its
   * own page; the letters received and sent are kept here too.
   */

  type View = 'menu' | 'courier' | 'fireworks' | 'build' | 'arcade' | 'letters';
  let view = $state<View>('menu');

  const world = $derived(hb.modules.world as WorldState | undefined);
  const actions = $derived(world?.actions);
  const waiting = $derived(unread().length);

  $effect(() => {
    if (hb.connected) void loadMail();
  });

  const TITLES: Record<Exclude<View, 'menu'>, string> = { courier: 'Send a letter', fireworks: 'Fireworks', build: 'Build lot', arcade: 'Arcade', letters: 'Letters' };
  const arcadeOn = $derived(enabled('arcade'));
  // The arcade turned off while its page is open: back to the list
  $effect(() => {
    if (view === 'arcade' && !arcadeOn) view = 'menu';
  });

  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sealOf = (l: Letter) => SEALS.find((s) => s.id === l.seal)?.color ?? SEALS[0].color;
</script>

<div class="actions">
  {#if view === 'menu'}
    <div class="menu" in:fly={{ x: -30, duration: 200 }}>
      {#if actions?.courier.on}
        <button type="button" class="item card" onclick={() => (view = 'courier')}>
          <span class="icon courier"><Mail size={24} /></span>
          <span class="text">
            <strong>Send a letter</strong>
            <span class="dim">Write on fine paper, slip in some {world?.shop?.currencyName ?? 'money'}, and watch the courier walk it over on the TV.</span>
          </span>
          <ChevronRight size={20} />
        </button>
      {/if}
      {#if actions?.fireworks.on}
        <button type="button" class="item card" onclick={() => (view = 'fireworks')}>
          <span class="icon fire"><Sparkles size={24} /></span>
          <span class="text">
            <strong>Fireworks</strong>
            <span class="dim">Design your own show and light up the town's night sky.</span>
            {#if actions.fireworks.night}<span class="tag"><Moon size={13} />Night: the sky is open</span>{/if}
          </span>
          <ChevronRight size={20} />
        </button>
      {/if}
      {#if world?.lot?.on}
        <button type="button" class="item card" onclick={() => (view = 'build')}>
          <span class="icon build"><Hammer size={24} /></span>
          <span class="text">
            <strong>Build lot</strong>
            <span class="dim">Stack blocks into sculptures and decorate the lot on the square: your character builds it on the TV.</span>
          </span>
          <ChevronRight size={20} />
        </button>
      {/if}
      {#if arcadeOn}
        <button type="button" class="item card" onclick={() => (view = 'arcade')}>
          <span class="icon arcade"><Joystick size={24} /></span>
          <span class="text">
            <strong>Arcade</strong>
            <span class="dim">Challenge someone to a quick 1 vs 1 game: your characters walk into the town's arcade to play.</span>
          </span>
          <ChevronRight size={20} />
        </button>
      {/if}
      <button type="button" class="item card" onclick={() => (view = 'letters')}>
        <span class="icon box"><Inbox size={24} /></span>
        <span class="text">
          <strong>Letters</strong>
          <span class="dim">The letters the courier brought you, and the ones you sent.</span>
        </span>
        {#if waiting}<span class="badge">{waiting}</span>{/if}
        <ChevronRight size={20} />
      </button>
      {#if !actions?.courier.on && !actions?.fireworks.on && !world?.lot?.on && !arcadeOn}
        <p class="faint small">The host has turned the town's actions off for now.</p>
      {/if}
    </div>
  {:else}
    <div class="page" in:fly={{ x: 30, duration: 200 }}>
      <button type="button" class="back" onclick={() => (view = 'menu')}><ChevronLeft size={18} />{TITLES[view]}</button>
      {#if view === 'courier'}
        <Courier onsent={() => (view = 'letters')} />
      {:else if view === 'fireworks'}
        <Fireworks />
      {:else if view === 'build'}
        <BuildLot />
      {:else if view === 'arcade'}
        <ArcadeGuest />
      {:else}
        <section class="letters">
          <h3 class="eyebrow">Received</h3>
          {#if mail.box?.inbox.length}
            {#each mail.box.inbox as l (l.id)}
              <button type="button" class="letter" style={paperStyle(l.paper)} onclick={() => openLetter(l)}>
                <span class="seal"><WaxSeal color={sealOf(l)} letter={l.fromName.charAt(0).toUpperCase()} size={36} /></span>
                <span class="lines">
                  <strong>From {l.fromName}</strong>
                  <span class="truncate">{l.text}</span>
                </span>
                <span class="when">{time(l.deliveredAt ?? l.sentAt)}{#if l.readAt === null}<span class="new">New</span>{/if}</span>
              </button>
            {/each}
          {:else}
            <p class="faint small">No letters yet. When someone sends you one, the courier walks it to your character on the TV.</p>
          {/if}
          <h3 class="eyebrow">Sent</h3>
          {#if mail.box?.sent.length}
            {#each mail.box.sent as l (l.id)}
              <div class="sent">
                <span class="truncate">To <strong>{l.toName}</strong>: {l.text}</span>
                <span class="pill" class:accent={l.deliveredAt === null}>{l.deliveredAt === null ? 'On the way' : `Delivered ${time(l.deliveredAt)}`}</span>
              </div>
            {/each}
          {:else}
            <p class="faint small">Nothing sent yet.</p>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .menu,
  .page {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.95rem;
    text-align: left;
    color: inherit;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.1rem;
    height: 3.1rem;
    border-radius: var(--radius-sm);
  }
  .icon.courier {
    background: color-mix(in srgb, var(--accent-2) 22%, transparent);
    color: var(--accent-2);
  }
  .icon.fire {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--accent);
  }
  .icon.build {
    background: color-mix(in srgb, var(--warning) 22%, transparent);
    color: var(--warning);
  }
  .icon.arcade {
    background: linear-gradient(135deg, color-mix(in srgb, #ff4fb0 30%, transparent), color-mix(in srgb, #4fe8ff 22%, transparent));
    color: #ff7ac8;
  }
  .icon.box {
    background: var(--surface-3);
    color: var(--text-dim);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .text .dim {
    font-size: 0.88rem;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    width: fit-content;
    margin-top: 0.15rem;
    padding: 0.12rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge {
    display: grid;
    place-items: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    width: fit-content;
    padding: 0.2rem 0.4rem 0.2rem 0;
    border: 0;
    background: none;
    color: var(--text);
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
  }
  .letters {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .letters .eyebrow:not(:first-child) {
    margin-top: 0.8rem;
  }
  /* A letter in the list: a strip of its own paper, sealed */
  .letter {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.75rem;
    border: 0;
    border-radius: 4px;
    background: radial-gradient(130% 160% at 50% 40%, transparent 55%, var(--edge) 100%), var(--paper);
    color: var(--ink);
    text-align: left;
    box-shadow: 0 8px 18px -12px rgba(0, 0, 0, 0.7);
  }
  .seal {
    line-height: 0;
  }
  .lines {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .lines .truncate {
    font-size: 0.85rem;
    opacity: 0.75;
  }
  .when {
    display: grid;
    justify-items: end;
    gap: 0.2rem;
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .new {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: #b3262e;
    color: #fff;
    font-weight: 700;
  }
  .sent {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    font-size: 0.88rem;
  }
  .sent .truncate {
    flex: 1;
    min-width: 0;
  }
  .sent .pill {
    flex: none;
    font-size: 0.72rem;
  }
</style>
