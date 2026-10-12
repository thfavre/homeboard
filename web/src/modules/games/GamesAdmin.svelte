<script lang="ts">
  import { ChevronDown, Minus, Play, Plus, Square, X } from '@lucide/svelte';
  import { GAMES, PIRATE_LENGTHS, gameInfo, isCardGame, pirateLength, type GameId, type GamesSettings } from '$shared/games.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import AmountInput from '$lib/ui/AmountInput.svelte';
  import Money from '$lib/ui/Money.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import { formatAmount } from '$shared/money.ts';
  import { GAME_ICONS, Now, gamesState } from './store.svelte.ts';
  import RhythmSongsAdmin from './RhythmSongsAdmin.svelte';
  import PirateSoundsAdmin from './PirateSoundsAdmin.svelte';
  import PirateSongsAdmin from './PirateSongsAdmin.svelte';

  const s = $derived(gamesState());
  const roomGames = GAMES.filter((g) => g.modes.includes('room'));
  let game = $state<GameId>('timer');
  let stake = $state(0);
  // Prize paid by the house; starts at the "win a room game" reward
  const defaultPrize = () => hb.core?.admin?.earnRules.find((r) => r.key === 'games.win')?.amount ?? 0;
  let prize = $state<number | null>(null);

  const PHASES = { lobby: 'Waiting for players', intro: 'Showing the rules', play: 'Playing', result: 'Showing the result' } as const;
  const setSettings = (patch: Partial<GamesSettings>) => attempt(() => rpc('games', 'setSettings', patch));

  function toggleGame(id: GameId, on: boolean) {
    const list = s?.settings.enabled ?? [];
    setSettings({ enabled: on ? [...list, id] : list.filter((x) => x !== id) });
  }

  /** Next value up or down a list of allowed steps */
  const stepIn = (steps: number[], now: number, dir: 1 | -1) =>
    dir > 0 ? (steps.find((x) => x > now) ?? now) : ([...steps].reverse().find((x) => x < now) ?? now);
  /** Seconds the winner plays with their prize (0: no prize) */
  const PERK_STEPS = [0, 15, 30, 45, 60, 90, 120, 180, 300];
  /** Rhythm Rain song lengths, in seconds */
  const SONG_STEPS = [20, 30, 45, 60, 75, 90, 120, 150, 180, 210, 240, 300, 360, 480, 600];
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const MODE_NAMES = { duel: '1 vs 1', room: 'room', solo: 'solo' } as const;

  // The game whose options are open (one at a time keeps the list short on a phone)
  let open = $state<GameId | null>(null);
  const hasOptions = (id: GameId) => id !== 'coin';
  /** Bluff bonus: x times the bet, on top of the fixed bonus */
  const MULT_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  /** Minutes between two Bluff games */
  const COOLDOWN_STEPS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
  /** Seconds the Bluff players have to choose */
  const CHOOSE_STEPS = [10, 15, 20, 30, 45, 60, 90, 120, 180];
  const now = new Now(10_000);
  /** Guests who cannot play a Bluff yet, with the minutes left */
  const bluffWaits = $derived(
    Object.entries(s?.bluffReadyAt ?? {})
      .filter(([, at]) => at > now.value)
      .map(([id, at]) => ({ id, name: hb.core?.admin?.guests.find((g) => g.id === id)?.name ?? 'A guest', min: Math.ceil((at - now.value) / 60_000) }))
      .sort((a, b) => a.min - b.min),
  );
  /** Bonus each player gets when both share in Bluff (also listed in Prices and rewards) */
  const bluffBonus = $derived(hb.core?.admin?.earnRules.find((r) => r.key === 'games.bluff'));

  // A slider shows its value while it moves, and saves when it is let go
  type SliderKey = 'rhythmAudioOffset' | 'pirateAudioOffset' | 'pirateSongVolume' | 'pirateDrumVolume';
  let drag = $state<Partial<Record<SliderKey, number>>>({});
  async function saveSlider(key: SliderKey, v: number) {
    await setSettings({ [key]: v });
    delete drag[key];
  }

  const lightName = (id: string) => s?.lightDevices?.find((d) => d.id === id)?.name ?? 'a light';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const perkText = (sec: number) => (sec > 0 ? `${sec}s prize` : 'no prize');
  /** What the closed card says about the game's options */
  function summary(id: GameId, st: GamesSettings): string {
    switch (id) {
      case 'timer':
        return plural(st.timerRounds, 'round');
      case 'simon':
        return `starts with ${plural(st.simonStart, 'color')}`;
      case 'reflex':
        return `${plural(st.reflexRounds, 'round')}, ${perkText(st.reflexPerkSec)}`;
      case 'circle':
        return `${plural(st.circleCount, 'circle')} each, ${perkText(st.circlePerkSec)}`;
      case 'bluff':
        return `${hb.core?.economyEnabled ? `${formatAmount(bluffBonus?.amount ?? 0)} + ${st.bluffMultiplier}x the bet each if both share, ` : ''}${st.bluffChooseSec || 30}s to choose, ${st.bluffCooldownMin ? `one every ${st.bluffCooldownMin} min per guest` : 'no wait'}`;
      case 'rhythm':
        return st.rhythmLight
          ? `on ${lightName(st.rhythmLight)}, ${plural(s?.rhythmSongs.length ?? 0, 'song')}, ${st.rhythmFullSong ? 'whole songs' : `${clock(st.rhythmMinSec)} to ${clock(st.rhythmMaxSec)}`}, ${perkText(st.rhythmPerkSec)}`
          : 'needs a light';
      case 'pirates':
        return `${pirateLength(st.pirateLength).name.toLowerCase()} race, ${st.pirateLight ? `on ${lightName(st.pirateLight)}, treasure at ${st.pirateTreasure}%` : 'TV only'}`;
      default:
        return '';
    }
  }
  const modes = (id: GameId) => {
    const g = gameInfo(id)!;
    return `${g.modes.map((x) => MODE_NAMES[x]).join(' or ')}${g.lights ? ', lights' : ''}`;
  };
</script>

{#snippet stepper(label: string, hint: string, n: number, min: number, max: number, set: (dir: 1 | -1) => void)}
  <div class="line">
    <span class="label">{label} <span class="faint small">{hint}</span></span>
    <span class="stepper">
      <button class="btn small" aria-label="Less" disabled={n <= min} onclick={() => set(-1)}><Minus size={16} /></button>
      <strong class="mono">{n}</strong>
      <button class="btn small" aria-label="More" disabled={n >= max} onclick={() => set(1)}><Plus size={16} /></button>
    </span>
  </div>
{/snippet}

{#snippet length(label: string, key: 'rhythmMinSec' | 'rhythmMaxSec')}
  {@const n = s!.settings[key]}
  <div class="line">
    <span class="label">{label}</span>
    <span class="stepper">
      <button class="btn small" aria-label="Shorter" disabled={n <= SONG_STEPS[0]} onclick={() => setSettings({ [key]: stepIn(SONG_STEPS, n, -1) })}><Minus size={16} /></button>
      <strong class="mono">{clock(n)}</strong>
      <button class="btn small" aria-label="Longer" disabled={n >= SONG_STEPS[SONG_STEPS.length - 1]} onclick={() => setSettings({ [key]: stepIn(SONG_STEPS, n, 1) })}><Plus size={16} /></button>
    </span>
  </div>
{/snippet}

{#snippet count(label: string, key: 'timerRounds' | 'circleCount' | 'reflexRounds' | 'simonStart', max: number)}
  {@const n = s!.settings[key]}
  {@render stepper(label, `1 to ${max}`, n, 1, max, (dir) => setSettings({ [key]: n + dir }))}
{/snippet}

{#snippet perk(label: string, key: 'reflexPerkSec' | 'circlePerkSec' | 'rhythmPerkSec')}
  {@const n = s!.settings[key]}
  {@render stepper(label, 'Seconds, 0 = no prize', n, 0, 300, (dir) => setSettings({ [key]: stepIn(PERK_STEPS, n, dir) }))}
{/snippet}

{#snippet lightSelect(label: string, hint: string, key: 'scratchLight' | 'rhythmLight' | 'pirateLight')}
  <div class="line">
    <span class="label">{label} <span class="faint small">{hint}</span></span>
    <select class="input light" value={s!.settings[key]} onchange={(e) => setSettings({ [key]: e.currentTarget.value })}>
      <option value="">None</option>
      {#each s!.lightDevices ?? [] as d (d.id)}<option value={d.id}>{d.name}{d.online ? '' : ' (offline)'}</option>{/each}
    </select>
  </div>
{/snippet}

{#snippet slider(label: string, hint: string, key: SliderKey, min: number, max: number, show: (v: number) => string, step = 10)}
  {@const v = drag[key] ?? s!.settings[key]}
  <div class="line wrap">
    <span class="label"><span>{label} <strong class="mono value">{show(v)}</strong></span> <span class="faint small">{hint}</span></span>
    <input
      class="range"
      type="range"
      {min}
      {max}
      {step}
      value={v}
      aria-label={label}
      oninput={(e) => (drag[key] = Number(e.currentTarget.value))}
      onchange={(e) => saveSlider(key, Number(e.currentTarget.value))}
    />
  </div>
{/snippet}

{#snippet tvColors()}
  <div class="line">
    <span class="label">
      Show the light colors on the TV too
      <span class="faint small">{s!.lights ? 'Shared by Light Simon and Color Reflex' : 'No light reachable: the TV always shows the colors'}</span>
    </span>
    <Toggle checked={s!.settings.tvColors} onchange={(v) => setSettings({ tvColors: v })} label="Colors on the TV" />
  </div>
{/snippet}

{#snippet options(id: GameId)}
  {#if id === 'timer'}
    {@render count('Rounds', 'timerRounds', 10)}
  {:else if id === 'simon'}
    {@render count('Colors in the first round', 'simonStart', 10)}
    {@render tvColors()}
  {:else if id === 'reflex'}
    {@render count('Rounds', 'reflexRounds', 15)}
    {@render perk('Winner controls the lights', 'reflexPerkSec')}
    {@render tvColors()}
  {:else if id === 'circle'}
    {@render count('Circles each', 'circleCount', 10)}
    {@render perk('Winner scratches their circle on the TV', 'circlePerkSec')}
    {@render lightSelect('Scratch light', 'A WLED light that turns with the record, following every scratch', 'scratchLight')}
  {:else if id === 'bluff'}
    {#if hb.core?.economyEnabled && bluffBonus}
      <p class="faint small">You add a bonus for each player to the pot: the fixed part, plus a number of times their bet. Both share: each gets their bet back plus their bonus. One steals: the thief takes everything, both bets and both bonuses, so stealing always pays twice as much as sharing. Both steal: nobody gets anything.</p>
      <div class="line">
        <span class="label">Fixed bonus <span class="faint small">Each player, whatever the bet</span></span>
        <AmountInput value={bluffBonus.amount} oncommit={(v) => attempt(() => rpc('core', 'setEarn', { key: 'games.bluff', amount: v }))} />
      </div>
      {@const mult = s!.settings.bluffMultiplier}
      <div class="line">
        <span class="label">Plus times the bet <span class="faint small">0 = only the fixed bonus</span></span>
        <span class="stepper">
          <button class="btn small" aria-label="Less" disabled={mult <= MULT_STEPS[0]} onclick={() => setSettings({ bluffMultiplier: stepIn(MULT_STEPS, mult, -1) })}><Minus size={16} /></button>
          <strong class="mono">{mult}x</strong>
          <button class="btn small" aria-label="More" disabled={mult >= MULT_STEPS[MULT_STEPS.length - 1]} onclick={() => setSettings({ bluffMultiplier: stepIn(MULT_STEPS, mult, 1) })}><Plus size={16} /></button>
        </span>
      </div>
    {/if}
    {@const sec = s!.settings.bluffChooseSec || 30}
    <div class="line">
      <span class="label">Time to choose <span class="faint small">Seconds. No choice in time counts as sharing</span></span>
      <span class="stepper">
        <button class="btn small" aria-label="Less" disabled={sec <= CHOOSE_STEPS[0]} onclick={() => setSettings({ bluffChooseSec: stepIn(CHOOSE_STEPS, sec, -1) })}><Minus size={16} /></button>
        <strong class="mono">{sec}</strong>
        <button class="btn small" aria-label="More" disabled={sec >= CHOOSE_STEPS[CHOOSE_STEPS.length - 1]} onclick={() => setSettings({ bluffChooseSec: stepIn(CHOOSE_STEPS, sec, 1) })}><Plus size={16} /></button>
      </span>
    </div>
    {@const cd = s!.settings.bluffCooldownMin}
    <div class="line">
      <span class="label">Wait between two games <span class="faint small">Minutes both players wait after a Bluff before playing another. 0 = no wait</span></span>
      <span class="stepper">
        <button class="btn small" aria-label="Less" disabled={cd <= 0} onclick={() => setSettings({ bluffCooldownMin: stepIn(COOLDOWN_STEPS, cd, -1) })}><Minus size={16} /></button>
        <strong class="mono">{cd}</strong>
        <button class="btn small" aria-label="More" disabled={cd >= COOLDOWN_STEPS[COOLDOWN_STEPS.length - 1]} onclick={() => setSettings({ bluffCooldownMin: stepIn(COOLDOWN_STEPS, cd, 1) })}><Plus size={16} /></button>
      </span>
    </div>
    {#each bluffWaits as w (w.id)}
      <div class="line">
        <span class="label">{w.name} can play a Bluff in {w.min} min</span>
        <button class="btn small" onclick={() => attempt(() => rpc('games', 'resetBluff', { guestId: w.id }))}>Allow now</button>
      </div>
    {/each}
  {:else if id === 'rhythm'}
    <h4 class="group">Light</h4>
    {@render lightSelect('Light strip', 'The WLED strip the game is played on, best hung upright. The game can only start when it is reachable', 'rhythmLight')}
    {#if s!.settings.rhythmLight}
      <div class="line">
        <span class="label">First LED at the top <span class="faint small">Turn it on if the notes fall instead of climbing</span></span>
        <Toggle checked={s!.settings.rhythmReverse} onchange={(v) => setSettings({ rhythmReverse: v })} label="First LED at the top" />
      </div>
    {/if}
    <h4 class="group">Play</h4>
    <div class="line">
      <span class="label">Whole songs <span class="faint small">Play every song from start to end, whatever its length</span></span>
      <Toggle checked={s!.settings.rhythmFullSong} onchange={(v) => setSettings({ rhythmFullSong: v })} label="Whole songs" />
    </div>
    {#if !s!.settings.rhythmFullSong}
      <p class="faint small">
        Song length. With music, the game plays the part of the song around its best part (where the song's preview starts, the part guests hear when they pick it) that fits best between
        these two, cut where the music pauses. A shorter song is played whole. Without music, a game lasts the shortest.
      </p>
      {@render length('Shortest', 'rhythmMinSec')}
      {@render length('Longest', 'rhythmMaxSec')}
    {/if}
    {@render perk('Duel winner shoots fireworks on the light', 'rhythmPerkSec')}
    {@render slider('Music timing', 'Notes reach the zone after the beat you hear: move it to +. Before the beat: to -. Speakers in Bluetooth or a sound bar can need a lot', 'rhythmAudioOffset', -2000, 2000, (v) => `${v > 0 ? '+' : ''}${v} ms`)}
    <RhythmSongsAdmin songs={s!.rhythmSongs} light={!!s!.settings.rhythmLight} running={s!.matches.find((m) => m.game === 'rhythm')?.id ?? null} />
  {:else if id === 'pirates'}
    <h4 class="group">Light</h4>
    {@render lightSelect('Race light', 'The WLED light the ships sail on, toward the gold treasure. Every other light plays a blue sea wave during the race', 'pirateLight')}
    {#if s!.settings.pirateLight}
      <div class="line">
        <span class="label">First LED at the treasure end <span class="faint small">Turn it on if the ships sail the wrong way</span></span>
        <Toggle checked={s!.settings.pirateReverse} onchange={(v) => setSettings({ pirateReverse: v })} label="First LED at the treasure end" />
      </div>
      {@render stepper('Treasure position', '% of the light the ships sail before reaching it', s!.settings.pirateTreasure, 10, 100, (dir) => setSettings({ pirateTreasure: s!.settings.pirateTreasure + dir * 10 }))}
    {/if}
    <h4 class="group">Race</h4>
    <div class="line wrap">
      <span class="label">Distance to the treasure <span class="faint small">{pirateLength(s!.settings.pirateLength).help}. Harder to row there means a longer game</span></span>
      <div class="choices">
        {#each PIRATE_LENGTHS as l (l.id)}
          <button class="chip" class:active={s!.settings.pirateLength === l.id} onclick={() => setSettings({ pirateLength: l.id })}>{l.name}</button>
        {/each}
      </div>
    </div>
    <p class="faint small">Crews are made from the number of players: 1 vs 1, 1 vs 1 vs 1, 2 vs 2, 5 ships of one, 3 vs 3, 3 vs 4, 4 vs 4, 3 vs 3 vs 3, 5 vs 5, 5 vs 6, 4 vs 4 vs 4, then 3, 4 and 5 crews as even as can be, with no limit. A ship goes as fast as the average stroke of its crew, so uneven crews stay fair.</p>
    {@render slider('Drum volume', 'On the TV, during the race and when trying a sound or a song', 'pirateDrumVolume', 0, 100, (v) => `${v}%`, 2)}
    {@render slider('Drum timing', 'The drum plays this much early on the TV, to make up for its speaker delay (Bluetooth, sound bar)', 'pirateAudioOffset', -1000, 1000, (v) => `${v > 0 ? '+' : ''}${v} ms`)}
    <h4 class="group">Songs</h4>
    <PirateSongsAdmin songs={s!.settings.pirateSongs ?? []} />
    {#if s!.settings.pirateSongs?.length}
      {@render slider('Song volume', 'On the TV, under the drum', 'pirateSongVolume', 0, 100, (v) => `${v}%`, 2)}
    {/if}
    <h4 class="group">Sounds</h4>
    <PirateSoundsAdmin picks={s!.settings.pirateSounds ?? {}} />
  {/if}
{/snippet}

{#if s}
  {#each s.matches as m (m.id)}
    <Section title={isCardGame(m.game) ? 'Playing now' : 'On the TV now'} hint={`${gameInfo(m.game)?.name} (${MODE_NAMES[m.mode]}): ${PHASES[m.phase]}`}>
      <div class="players">
        {#each m.players as p (p.id)}<span class="pill" style:border-color={p.color}>{p.name}</span>{:else}<span class="faint">No player yet</span>{/each}
      </div>
      {#if hb.core?.economyEnabled && m.pot > 0}<p class="dim">Pot: <Money amount={m.pot} /></p>{/if}
      <div class="row">
        {#if m.phase === 'lobby'}
          <button class="btn primary" disabled={m.players.length < 2} onclick={() => attempt(() => rpc('games', 'begin', { id: m.id }))}><Play size={18} /> Start now</button>
        {/if}
        <TwoStepButton class="danger" onconfirm={() => attempt(() => rpc('games', 'stop', { id: m.id }))}>
          <Square size={16} /> Stop
          {#snippet armed()}Stop and refund?{/snippet}
        </TwoStepButton>
      </div>
    </Section>
  {/each}
  {#if !s.matches.length}
    <Section title="Start a game for the room" hint="Free for you. Guests join from their phone; the winner takes the pot and your prize.">
      <div class="choices">
        {#each roomGames as g (g.id)}
          {@const Icon = GAME_ICONS[g.id]}
          <button class="chip" class:active={game === g.id} onclick={() => (game = g.id)}><Icon size={16} /> {g.name}</button>
        {/each}
      </div>
      {#if hb.core?.economyEnabled}
        <div class="line">
          <span class="label">Entry for each player <span class="faint small">Goes in the pot, 0 = free to join</span></span>
          <AmountInput value={stake} oncommit={(v) => (stake = v)} />
        </div>
        <div class="line">
          <span class="label">Prize for the winner <span class="faint small">Paid by you, on top of the pot</span></span>
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

  <Section title="Games" hint="Switch on the games guests can start, and tap a game for its options. Duels cost the challenge fee, room games the start fee.">
    <div class="games">
      {#each GAMES as g (g.id)}
        {@const Icon = GAME_ICONS[g.id]}
        {@const on = s.settings.enabled.includes(g.id)}
        {@const expandable = hasOptions(g.id)}
        {@const isOpen = open === g.id}
        <div class="game" class:off={!on} class:open={isOpen} style:--g1={g.colors[0]} style:--g2={g.colors[1]}>
          <div class="head">
            <button class="name" disabled={!expandable} aria-expanded={expandable ? isOpen : undefined} onclick={() => (open = isOpen ? null : g.id)}>
              <span class="tile"><Icon size={20} /></span>
              <span class="label">
                <strong>{g.name}</strong>
                <span class="faint small truncate">
                  {modes(g.id)}{#if expandable}<span class:warn={g.id === 'rhythm' && !s.settings.rhythmLight}> · {summary(g.id, s.settings)}</span>{/if}
                </span>
              </span>
              {#if expandable}<span class="chev"><ChevronDown size={18} /></span>{/if}
            </button>
            <Toggle checked={on} onchange={(v) => toggleGame(g.id, v)} label={g.name} />
          </div>
          {#if isOpen}
            <div class="opts">{@render options(g.id)}</div>
          {/if}
        </div>
      {/each}
    </div>
  </Section>
{/if}

<style>
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

  /* One card per game: its switch on the right, its options under it */
  .games {
    display: grid;
    gap: 0.5rem;
  }
  .game {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    transition: border-color 0.2s ease;
  }
  .game.open {
    border-color: color-mix(in srgb, var(--g1) 45%, var(--border));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem 0.6rem 0.6rem;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .name:disabled {
    cursor: default;
  }
  .name .label {
    flex: 1;
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.7rem;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    color: #fff;
    box-shadow: 0 6px 18px -8px var(--g1);
    transition:
      filter 0.2s ease,
      opacity 0.2s ease;
  }
  .off .tile {
    filter: grayscale(0.85);
    opacity: 0.55;
  }
  .off .name strong {
    color: var(--text-dim);
  }
  .chev {
    flex: none;
    display: grid;
    color: var(--text-faint);
    transition: transform 0.2s ease;
  }
  .open .chev {
    transform: rotate(180deg);
  }
  .warn {
    color: var(--danger);
  }
  .opts {
    display: grid;
    gap: 0.85rem;
    padding: 0.85rem 0.85rem 0.95rem;
    border-top: 1px solid var(--border);
  }
  .group {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-top: 0.3rem;
  }
  .opts > .group:first-child {
    margin-top: 0;
  }

  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .line.wrap {
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
  }
  /* Label with a hint under it */
  .label {
    display: grid;
    min-width: 0;
  }
  .line > .label {
    flex: 1 1 12rem;
  }
  .value {
    font-size: 0.9rem;
    color: var(--accent);
    margin-left: 0.25rem;
  }
  .small {
    font-size: 0.78rem;
  }
  .stepper {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .stepper strong {
    min-width: 1.75rem;
    text-align: center;
    font-size: 1.1rem;
  }
  .range {
    flex: 1 1 10rem;
    max-width: 14rem;
    accent-color: var(--accent);
  }
  .light {
    flex: none;
    width: auto;
    min-width: 9rem;
    max-width: 12rem;
  }
</style>
