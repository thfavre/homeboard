<script lang="ts">
  import { Briefcase, CloudFog, Crosshair, Pencil, Shuffle, Timer, Trophy, Zap, EyeOff } from '@lucide/svelte';
  import { SPY_GADGETS, type SpyGadget, type SpyMe, type SpyView } from '$shared/crowd.ts';
  import type { MatchState } from '$shared/games.ts';
  import { hb } from '$lib/client.svelte.ts';
  import { Now, gamesState } from '../store.svelte.ts';
  import HoldButton from './HoldButton.svelte';
  import Joystick from './Joystick.svelte';
  import Bullets from './Bullets.svelte';
  import { play, stickSender } from './input.ts';

  /**
   * Spy Hunt on a phone. The spy: a stick to walk, a gadget picked before the hunt and used once. A
   * sniper: SHOOT and DRAW under the left thumb, the stick that moves the crosshair under the right one.
   * Who is the spy is public; which character they are is what the snipers must find.
   */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as SpyView | null);
  const me = $derived(hb.me?.id ?? '');
  const myColor = $derived(hb.me?.color ?? '#3d8bff');
  const now = new Now(150);
  const isSpy = $derived(v?.spy === me);
  const shots = $derived(v?.shots[me] ?? 0);
  const blind = $derived(!!v && now.value < v.blindUntil);
  const reloading = $derived(!!v && (v.readyAt[me] ?? 0) > now.value && v.step === 'hunt');
  const left = $derived(v ? Math.max(0, v.until - now.value) : 0);
  const opened = $derived(v?.cases.filter((c) => c.open).length ?? 0);
  const clock = (ms: number) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const allowed = $derived((gamesState()?.settings.spyGadgets ?? []).filter((g) => SPY_GADGETS.some((x) => x.id === g)));
  const ICONS = { flashbang: Zap, smoke: CloudFog, decoy: Shuffle } as const;

  /** What I am this round (asked again each round and step: the server keeps it) */
  let mine = $state<SpyMe | null>(null);
  $effect(() => {
    if (!v) return;
    void [v.round, v.step, v.gadget.used];
    void play<SpyMe>({ t: 'me' }).then((r) => r && (mine = r));
  });

  const moveStick = stickSender('move');
  const aimStick = stickSender('aim');

  async function pickGadget(g: SpyGadget) {
    const r = await play<SpyMe>({ t: 'pick', g });
    if (r) mine = r;
  }
  async function useGadget() {
    navigator.vibrate?.([40, 30, 40]);
    const r = await play<SpyMe & { ok: boolean }>({ t: 'gadget' });
    if (r) mine = r;
  }

  let feedback = $state<{ text: string; tone: 'good' | 'bad' | 'dim'; key: number } | null>(null);
  let seq = 0;
  async function fire() {
    navigator.vibrate?.(30);
    const r = await play<{ hit: string | null }>({ t: 'fire' });
    const text = r?.hit === 'spy' ? 'You got the spy!' : r?.hit === 'npc' ? 'Wrong one: a passer-by' : r?.hit === 'miss' ? 'Missed' : null;
    if (!text) return;
    if (r?.hit === 'spy') navigator.vibrate?.([60, 40, 160]);
    feedback = { text, tone: r?.hit === 'spy' ? 'good' : r?.hit === 'npc' ? 'bad' : 'dim', key: ++seq };
    const k = seq;
    setTimeout(() => feedback?.key === k && (feedback = null), 2200);
  }
  const draw = (on: boolean) => void play({ t: 'draw', on });

  const gadgetName = (g: SpyGadget | null) => SPY_GADGETS.find((x) => x.id === g)?.name ?? '';
  const outcome = $derived.by(() => {
    if (!v || v.step !== 'reveal') return null;
    const shooter = m.players.find((p) => p.id === v.shooter)?.name ?? 'A sniper';
    if (v.outcome === 'shot') return isSpy ? { big: 'You were shot', small: `${shooter} found you` } : v.shooter === me ? { big: 'You got the spy!', small: '+2 points' } : { big: `${shooter} got the spy`, small: 'Next round soon' };
    if (v.outcome === 'time') return isSpy ? { big: 'Time is up', small: 'You stayed hidden, but the suitcases stayed shut' } : { big: 'Time is up', small: '+1 point for every sniper' };
    return isSpy ? { big: 'You got away!', small: '+3 points' } : { big: 'The spy got away', small: v.outcome === 'ammo' ? 'Every sniper ran out of shots' : 'The suitcases are open' };
  });
</script>

{#if v}
  <div class="pad" style:--me={myColor}>
    <div class="top">
      <span class="pill mono">Round {v.round}/{v.rounds}</span>
      <span class="pill mono"><Timer size={16} /> {v.step === 'hunt' ? clock(left) : v.step === 'pick' ? `starts in ${Math.ceil(left / 1000)}` : '0:00'}</span>
      <span class="pill"><Trophy size={16} /> {v.points[me] ?? 0}</span>
    </div>

    {#if outcome}
      <div class="status">
        <strong>{outcome.big}</strong>
        <span>{outcome.small}</span>
      </div>
      <div></div>
    {:else if isSpy}
      <div class="status">
        <span class="role spy">You are the spy</span>
        <strong>{v.step === 'pick' ? 'Find yourself' : 'Open the suitcases'}</strong>
        <span>{v.step === 'pick' ? 'Move the stick and watch who moves on the TV. Walk like everyone else.' : `Walk over a suitcase in a corner: it opens a few seconds later.`}</span>
        <span class="cases">
          {#each v.cases as c, i (i)}<span class="case" class:open={c.open}><Briefcase size={22} /></span>{/each}
          <span class="mono">{opened}/{v.needed}</span>
        </span>
      </div>
      <div class="spy-controls">
        {#if v.step === 'pick' && allowed.length}
          <div class="gadgets">
            <span class="eyebrow">Pick your gadget</span>
            <div class="gadget-row">
              {#each allowed as g (g)}
                {@const info = SPY_GADGETS.find((x) => x.id === g)!}
                {@const Icon = ICONS[g]}
                <button class="gadget" class:active={mine?.gadget === g} onclick={() => pickGadget(g)}>
                  <Icon size={22} />
                  <strong>{info.name}</strong>
                </button>
              {/each}
            </div>
            <small class="help">{mine?.gadget ? SPY_GADGETS.find((x) => x.id === mine?.gadget)?.help : 'Not picked in time: one is drawn for you'}</small>
          </div>
        {:else if mine?.gadget}
          {@const Icon = ICONS[mine.gadget]}
          <HoldButton color="#8b5bff" size="small" disabled={v.step !== 'hunt' || mine.used} onpress={useGadget}>
            <Icon size={22} />{mine.used ? `${gadgetName(mine.gadget)} used` : gadgetName(mine.gadget).toUpperCase()}
          </HoldButton>
        {/if}
        <div class="stick-wrap"><Joystick label="Walk" color={myColor} onmove={moveStick} /></div>
      </div>
    {:else}
      <div class="status" class:blind>
        <span class="role">Sniper</span>
        {#if blind}
          <strong><EyeOff size={26} /> Blinded!</strong>
          <span>Flashbang. Wait for your eyes to clear</span>
        {:else}
          <strong>{v.step === 'pick' ? 'Get ready' : 'Find the spy'}</strong>
          <span>{v.step === 'pick' ? 'You can aim already. Shooting starts with the hunt' : 'Someone walks oddly... Hold DRAW to point at them on the TV'}</span>
        {/if}
        <span class="pill"><Bullets left={shots} /></span>
        {#if feedback}
          {#key feedback.key}<span class="feedback {feedback.tone}">{feedback.text}</span>{/key}
        {/if}
      </div>
      <div class="controls">
        <div class="left">
          <HoldButton color="#ff3b5c" size="big" disabled={v.step !== 'hunt' || shots <= 0 || reloading || blind} onpress={fire}>
            <Crosshair size={28} />{shots <= 0 ? 'NO SHOTS' : reloading ? 'RELOADING' : 'SHOOT'}
          </HoldButton>
          <HoldButton color="#3d8bff" size="small" disabled={v.step !== 'hunt' || blind} onpress={() => draw(true)} onrelease={() => draw(false)}>
            <Pencil size={20} />DRAW
          </HoldButton>
        </div>
        <div class="right">
          <Joystick label="Aim" color={myColor} disabled={blind} onmove={aimStick} />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .pad {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.8rem;
    min-height: 100%;
    padding: 0.3rem 0 2.2rem;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }
  .top {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .status {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.4rem;
    text-align: center;
  }
  .status strong {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-display);
    font-size: 2rem;
    line-height: 1.1;
  }
  .status > span {
    color: var(--text-dim);
    font-size: 0.95rem;
    max-width: 22rem;
  }
  .status.blind strong {
    color: #ffe9a8;
  }
  .role {
    padding: 0.2rem 0.9rem;
    border-radius: 999px;
    background: var(--surface-2);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.8rem !important;
    color: var(--text) !important;
  }
  .role.spy {
    background: color-mix(in srgb, #8b5bff 30%, transparent);
  }
  .cases {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }
  .case {
    display: inline-flex;
    color: var(--text-faint);
  }
  .case.open {
    color: var(--coin);
  }
  .spy-controls {
    display: grid;
    gap: 1rem;
    justify-items: center;
  }
  .stick-wrap {
    width: min(70vw, 17rem);
  }
  .gadgets {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }
  .eyebrow {
    text-align: center;
  }
  .gadget-row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.5rem;
  }
  .gadget {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.7rem 0.4rem;
    border-radius: var(--radius);
    background: var(--surface);
    border: 2px solid var(--border);
    color: var(--text);
    font-size: 0.9rem;
  }
  .gadget.active {
    border-color: #8b5bff;
    background: color-mix(in srgb, #8b5bff 22%, var(--surface));
  }
  .help {
    min-height: 2.4em;
    color: var(--text-dim);
    text-align: center;
  }
  .feedback {
    margin-top: 0.3rem;
    padding: 0.25rem 0.9rem;
    border-radius: 999px;
    font-weight: 700;
    animation: pop 0.25s ease-out;
  }
  .feedback.good {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success) !important;
  }
  .feedback.bad {
    background: color-mix(in srgb, #ff5a5a 18%, transparent);
    color: #ff8a8a !important;
  }
  .feedback.dim {
    background: var(--surface);
  }
  @keyframes pop {
    from {
      transform: scale(1.3);
    }
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 1rem;
    align-items: end;
  }
  .left,
  .right {
    display: grid;
    gap: 0.9rem;
  }
</style>
