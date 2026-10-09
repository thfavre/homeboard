<script lang="ts">
  import { Minus, Play, Plus, Square, X } from '@lucide/svelte';
  import { GAMES, gameInfo, type GameId } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Money from '$lib/ui/Money.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { GAME_ICONS, gamesState } from './store.svelte.ts';

  const s = $derived(gamesState());
  const m = $derived(s?.match ?? null);
  const roomGames = GAMES.filter((g) => g.modes.includes('room'));
  let game = $state<GameId>('timer');
  let stake = $state(0);
  // Prize paid by the house; starts at the "win a room game" reward
  const defaultPrize = () => hb.core?.admin?.earnRules.find((r) => r.key === 'games.win')?.amount ?? 0;
  let prize = $state<number | null>(null);

  /** Number settings with a stepper (the server keeps them in the same range) */
  const COUNTS = [
    { key: 'timerRounds', label: 'Blind Timer rounds', max: 10 },
    { key: 'circleCount', label: 'Perfect Circle: circles each', max: 10 },
    { key: 'reflexRounds', label: 'Color Reflex rounds', max: 15 },
    { key: 'simonStart', label: 'Light Simon: colors in the first round', max: 10 },
  ] as const;
  /** Seconds the winner plays with their prize (0: no prize) */
  const PERKS = [
    { key: 'reflexPerkSec', label: 'Color Reflex: the winner controls the lights' },
    { key: 'circlePerkSec', label: 'Perfect Circle: the winner scratches their circle on the TV' },
  ] as const;
  const PERK_STEPS = [0, 15, 30, 45, 60, 90, 120, 180, 300];
  const perkStep = (now: number, dir: 1 | -1) =>
    dir > 0 ? (PERK_STEPS.find((x) => x > now) ?? now) : ([...PERK_STEPS].reverse().find((x) => x < now) ?? now);
  /** Rhythm Rain song lengths, in seconds */
  const SONG_STEPS = [20, 30, 45, 60, 75, 90, 120];
  const songStep = (now: number, dir: 1 | -1) =>
    dir > 0 ? (SONG_STEPS.find((x) => x > now) ?? now) : ([...SONG_STEPS].reverse().find((x) => x < now) ?? now);
  const PHASES = { lobby: 'Waiting for players', intro: 'Showing the rules', play: 'Playing', result: 'Showing the result' } as const;
  const setSettings = (patch: object) => attempt(() => rpc('games', 'setSettings', patch));

  function toggleGame(id: GameId, on: boolean) {
    const list = s?.settings.enabled ?? [];
    setSettings({ enabled: on ? [...list, id] : list.filter((x) => x !== id) });
  }
</script>

{#if s}
  {#if m}
    <Section title="On the TV now" hint={`${gameInfo(m.game)?.name} (${m.mode === 'duel' ? '1 vs 1' : 'room'}): ${PHASES[m.phase]}`}>
      <div class="players">
        {#each m.players as p (p.id)}<span class="pill" style:border-color={p.color}>{p.name}</span>{:else}<span class="faint">No player yet</span>{/each}
      </div>
      {#if hb.core?.economyEnabled && m.pot > 0}<p class="dim">Pot: <Money amount={m.pot} /></p>{/if}
      <div class="row">
        {#if m.phase === 'lobby'}
          <button class="btn primary" disabled={m.players.length < 2} onclick={() => attempt(() => rpc('games', 'begin'))}><Play size={18} /> Start now</button>
        {/if}
        <TwoStepButton class="danger" onconfirm={() => attempt(() => rpc('games', 'stop'))}>
          <Square size={16} /> Stop
          {#snippet armed()}Stop and refund?{/snippet}
        </TwoStepButton>
      </div>
    </Section>
  {:else}
    <Section title="Start a game for the room" hint="Free for you. Guests join from their phone; the winner takes the pot and your prize.">
      <div class="choices">
        {#each roomGames as g (g.id)}
          {@const Icon = GAME_ICONS[g.id]}
          <button class="chip" class:active={game === g.id} onclick={() => (game = g.id)}><Icon size={16} /> {g.name}</button>
        {/each}
      </div>
      {#if hb.core?.economyEnabled}
        <div class="line">
          <span>Entry for each player <span class="faint small">Goes in the pot, 0 = free to join</span></span>
          <AmountInput value={stake} oncommit={(v) => (stake = v)} />
        </div>
        <div class="line">
          <span>Prize for the winner <span class="faint small">Paid by you, on top of the pot</span></span>
          <AmountInput value={prize ?? defaultPrize()} oncommit={(v) => (prize = v)} />
        </div>
      {/if}
      <button class="btn primary" onclick={() => attempt(() => rpc('games', 'startRoom', { game, stake, prize: prize ?? defaultPrize() }))}><Play size={18} /> Start {gameInfo(game)?.name}</button>
    </Section>
  {/if}

  {#if s.invites.length}
    <Section title="Challenges waiting">
      {#each s.invites as inv (inv.id)}
        <div class="line">
          <span><strong>{inv.from.name}</strong> vs <strong>{inv.to.name}</strong> <span class="dim">{gameInfo(inv.game)?.name}</span></span>
          <button class="btn small ghost" onclick={() => attempt(() => rpc('games', 'cancelInvite', { id: inv.id }))}><X size={16} /> Cancel</button>
        </div>
      {/each}
    </Section>
  {/if}

  <Section title="Games guests can start" hint="1 vs 1 duels cost the challenge fee; room games cost the start fee (see prices above).">
    {#each GAMES as g (g.id)}
      {@const Icon = GAME_ICONS[g.id]}
      <div class="line">
        <span class="game">
          <Icon size={18} />
          <span>
            {g.name}
            <span class="faint small">{g.modes.includes('room') ? '1 vs 1 or room' : '1 vs 1 only'}{g.lights ? ', uses the lights' : ''}</span>
          </span>
        </span>
        <Toggle checked={s.settings.enabled.includes(g.id)} onchange={(v) => toggleGame(g.id, v)} label={g.name} />
      </div>
    {/each}
  </Section>

  <Section title="Options">
    {#if hb.core?.economyEnabled}
      <div class="line">
        <span>Highest bet <span class="faint small">0 = no limit</span></span>
        <AmountInput value={s.settings.maxStake} oncommit={(v) => setSettings({ maxStake: v })} />
      </div>
    {/if}
    {#each COUNTS as r (r.key)}
      {@const n = s.settings[r.key]}
      <div class="line">
        <span>{r.label} <span class="faint small">1 to {r.max}</span></span>
        <span class="stepper">
          <button class="btn small" disabled={n <= 1} onclick={() => setSettings({ [r.key]: n - 1 })}><Minus size={16} /></button>
          <strong class="mono">{n}</strong>
          <button class="btn small" disabled={n >= r.max} onclick={() => setSettings({ [r.key]: n + 1 })}><Plus size={16} /></button>
        </span>
      </div>
    {/each}
    {#each PERKS as r (r.key)}
      {@const n = s.settings[r.key]}
      <div class="line">
        <span>{r.label} <span class="faint small">Seconds, 0 = no prize</span></span>
        <span class="stepper">
          <button class="btn small" disabled={n <= 0} onclick={() => setSettings({ [r.key]: perkStep(n, -1) })}><Minus size={16} /></button>
          <strong class="mono">{n}</strong>
          <button class="btn small" disabled={n >= 300} onclick={() => setSettings({ [r.key]: perkStep(n, 1) })}><Plus size={16} /></button>
        </span>
      </div>
    {/each}
    <div class="line">
      <span>
        Scratch light
        <span class="faint small">A WLED light that turns with the Perfect Circle record, following every scratch</span>
      </span>
      <select class="input light" value={s.settings.scratchLight} onchange={(e) => setSettings({ scratchLight: e.currentTarget.value })}>
        <option value="">None</option>
        {#each s.lightDevices ?? [] as d (d.id)}<option value={d.id}>{d.name}{d.online ? '' : ' (offline)'}</option>{/each}
      </select>
    </div>
    <div class="line">
      <span>
        Rhythm Rain light
        <span class="faint small">The WLED strip the game is played on, best hung upright. The game can only be started when it is reachable</span>
      </span>
      <select class="input light" value={s.settings.rhythmLight} onchange={(e) => setSettings({ rhythmLight: e.currentTarget.value })}>
        <option value="">None</option>
        {#each s.lightDevices ?? [] as d (d.id)}<option value={d.id}>{d.name}{d.online ? '' : ' (offline)'}</option>{/each}
      </select>
    </div>
    {#if s.settings.rhythmLight}
      <div class="line">
        <span>
          Rhythm Rain: first LED at the top
          <span class="faint small">Turn it on if the notes fall instead of climbing</span>
        </span>
        <Toggle checked={s.settings.rhythmReverse} onchange={(v) => setSettings({ rhythmReverse: v })} label="First LED at the top" />
      </div>
    {/if}
    <div class="line">
      <span>
        Rhythm Rain: note speed <strong class="mono">{s.settings.rhythmSpeed}%</strong>
        <span class="faint small">Scales how fast the notes climb at every level, 100% = as designed</span>
      </span>
      <input
        class="speed"
        type="range"
        min="50"
        max="200"
        step="10"
        value={s.settings.rhythmSpeed}
        onchange={(e) => setSettings({ rhythmSpeed: Number(e.currentTarget.value) })}
      />
    </div>
    <div class="line">
      <span>Rhythm Rain: song length <span class="faint small">Seconds, 20 to 120</span></span>
      <span class="stepper">
        <button class="btn small" disabled={s.settings.rhythmSec <= 20} onclick={() => setSettings({ rhythmSec: songStep(s.settings.rhythmSec, -1) })}><Minus size={16} /></button>
        <strong class="mono">{s.settings.rhythmSec}</strong>
        <button class="btn small" disabled={s.settings.rhythmSec >= 120} onclick={() => setSettings({ rhythmSec: songStep(s.settings.rhythmSec, 1) })}><Plus size={16} /></button>
      </span>
    </div>
    <div class="line">
      <span>
        Show the light colors on the TV too
        <span class="faint small">{s.lights ? 'Light Simon and Color Reflex use your WLED lights' : 'No light reachable: the TV always shows the colors'}</span>
      </span>
      <Toggle checked={s.settings.tvColors} onchange={(v) => setSettings({ tvColors: v })} label="Colors on the TV" />
    </div>
  </Section>
{/if}

<style>
  .speed {
    width: 10rem;
    accent-color: var(--accent);
  }
  .light {
    width: auto;
    min-width: 10rem;
  }
  .players,
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.88rem;
  }
  .chip.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .game {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }
  /* Label with a hint under it */
  .game > span,
  .line > span:not(.game, .stepper) {
    display: grid;
  }
  .small {
    font-size: 0.78rem;
  }
  .line > .stepper {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .stepper strong {
    min-width: 1.5rem;
    text-align: center;
    font-size: 1.1rem;
  }
</style>
