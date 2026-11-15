<script lang="ts">
  import { Square, Trophy, X } from '@lucide/svelte';
  import { ARCADE_GAMES, arcadeFormat, arcadeGame, type ArcadeGameId, type ArcadeSettings } from '$shared/arcade.ts';
  import { attempt, hb, rpc } from '$lib/client.svelte.ts';
  import { Synced } from '$lib/synced.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { ARCADE_ICONS, arcadeState, gradient } from './store.svelte.ts';

  const s = $derived(arcadeState());
  const economy = $derived(!!hb.core?.economyEnabled);
  const maxStake = new Synced(() => s?.settings.maxStake, 0);
  const screenSec = new Synced(() => s?.settings.screenSec, 5);

  const set = (args: Partial<ArcadeSettings>) => attempt(() => rpc('arcade', 'setSettings', args));
  function toggleGame(id: ArcadeGameId, on: boolean) {
    const off = s?.settings.off ?? [];
    set({ off: on ? off.filter((g) => g !== id) : [...off, id] });
  }
  const names = (ids: string[]) => ids.map((id) => s?.online.find((p) => p.id === id)?.name ?? '?');
</script>

{#if s}
  <Section title="Settings" hint="The challenge fee is in Prices and rewards, at the top of this page.">
    {#if economy}
      <label class="field">
        <span>Highest bet <span class="faint">(0: no limit)</span></span>
        <input
          class="input"
          type="number"
          min="0"
          bind:value={maxStake.value}
          onfocus={maxStake.start}
          onblur={() => {
            set({ maxStake: Number(maxStake.value) });
            maxStake.end();
          }}
        />
      </label>
    {/if}
    <Toggle checked={s.settings.sounds} onchange={(v) => set({ sounds: v })} label="Sounds and vibration on the phones" />
    <Toggle checked={s.settings.townWalk} onchange={(v) => set({ townWalk: v })} label="Players' characters walk into the town arcade while they play" />
    <Toggle checked={s.settings.townScreen} onchange={(v) => set({ townScreen: v })} label="The arcade's screen in the town shows the scores" />
    <label class="field">
      <span>Seconds on each match when several are played at once</span>
      <input
        class="input"
        type="number"
        min="2"
        max="30"
        bind:value={screenSec.value}
        onfocus={screenSec.start}
        onblur={() => {
          set({ screenSec: Number(screenSec.value) });
          screenSec.end();
        }}
      />
    </label>
  </Section>

  <Section title="Games" hint="The games the Arcade draws from: a challenge is 1, 3 or 5 of them, picked at random.">
    <div class="games">
      {#each ARCADE_GAMES as g (g.id)}
        {@const Icon = ARCADE_ICONS[g.id]}
        {@const on = !s.settings.off.includes(g.id)}
        <div class="game" class:off={!on}>
          <span class="icon" style:--g={gradient(g.colors)}><Icon size={20} /></span>
          <span class="text">
            <strong>{g.name}</strong>
            <span class="faint small">{g.tagline}. {g.lives ? `${g.lives} lives, ${g.seconds} s at most` : `${g.seconds} s`}.</span>
          </span>
          <Toggle checked={on} onchange={(v) => toggleGame(g.id, v)} label={`Offer ${g.name}`} />
        </div>
      {/each}
    </div>
  </Section>

  <Section title="Now playing" hint="Stopping a match or a challenge gives everyone their money back.">
    {#if !s.matches.length && !s.invites.length}
      <p class="faint small">Nobody is playing right now.</p>
    {/if}
    {#each s.matches as m (m.id)}
      {@const r = m.rounds[m.rounds.length - 1]}
      <div class="row">
        <span class="text">
          <strong>{m.players.map((p) => p.name).join(' vs ')}</strong>
          <span class="faint small">
            {m.count > 1 ? `Best of ${m.count}, game ${m.rounds.length}: ` : ''}{arcadeGame(r.game)?.name}, {m.players.map((p) => r.scores[p.id] ?? 0).join(' - ')}
            {#if m.phase === 'result'}(over){/if}
          </span>
        </span>
        {#if economy && m.stake}<Money amount={m.pot} />{/if}
        {#if m.phase !== 'result'}
          <TwoStepButton class="btn ghost small" onconfirm={() => attempt(() => rpc('arcade', 'stop', { id: m.id }))}>
            <Square size={14} /> Stop
            {#snippet armed()}<Square size={14} /> Stop it{/snippet}
          </TwoStepButton>
        {/if}
      </div>
    {/each}
    {#each s.invites as inv (inv.id)}
      <div class="row">
        <span class="text">
          <strong>{inv.from.name} challenged {inv.to.name}</strong>
          <span class="faint small">{arcadeFormat(inv.count)}, waiting for an answer</span>
        </span>
        <button class="btn ghost small" onclick={() => attempt(() => rpc('arcade', 'cancelInvite', { id: inv.id }))}><X size={15} /> Cancel</button>
      </div>
    {/each}
    {#if s.busy.length}<p class="faint small">Busy in a game: {names(s.busy).join(', ')}</p>{/if}
  </Section>

  <Section title="Best scores this party">
    {@const list = ARCADE_GAMES.filter((g) => s.records[g.id])}
    {#if !list.length}<p class="faint small">No scores yet.</p>{/if}
    {#each list as g (g.id)}
      {@const r = s.records[g.id]!}
      <div class="row">
        <span class="text"><strong>{g.name}</strong><span class="faint small">{r.name}</span></span>
        <strong class="mono">{r.score}</strong>
      </div>
    {/each}
    {#if list.length}
      <TwoStepButton class="btn ghost small" onconfirm={() => attempt(() => rpc('arcade', 'resetRecords'))}>
        <Trophy size={14} /> Clear the best scores
        {#snippet armed()}<Trophy size={14} /> Tap again to clear{/snippet}
      </TwoStepButton>
    {/if}
  </Section>
{/if}

<style>
  .games {
    display: grid;
    gap: 0.6rem;
  }
  .game,
  .row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .game.off .icon {
    filter: grayscale(1);
    opacity: 0.5;
  }
  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 12px;
    background: var(--g);
    color: #fff;
  }
  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .row {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .row:last-of-type {
    border-bottom: 0;
  }
</style>
