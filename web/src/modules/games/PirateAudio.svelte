<script lang="ts">
  import { PIRATE, type PirateSoundId, type PirateView } from '$shared/games.ts';
  import { onEvent, serverNow } from '$lib/client.svelte.ts';
  import { audioContext } from '../soundboard/player.ts';
  import { gamesState } from './store.svelte.ts';
  import { loadPirateSound, pirateSound } from './ui/pirateSound.ts';

  /**
   * The sound of Pirate Race on the TV, with nothing on screen: the drum on every beat (scheduled on the
   * audio clock from the server's beat times, a little early for the speaker delay), the crew's roar when
   * the race starts, the boosts and the finish. Also plays a sound the host tries from the admin.
   */
  const s = $derived(gamesState());
  const v = $derived(s?.match?.game === 'pirates' && s.match.phase === 'play' ? (s.match.view as PirateView | null) : null);
  const url = (kind: PirateSoundId) => s?.settings.pirateSounds?.[kind]?.url ?? null;

  // The picked files are decoded as soon as they are known, so the first beat is not late
  $effect(() => {
    for (const pick of Object.values(s?.settings.pirateSounds ?? {})) if (pick?.url) void loadPirateSound(pick.url);
  });

  /** Beats already scheduled (index), and whether the roar is */
  let lastBeat = -1;
  let roared = false;
  let race = '';
  $effect(() => {
    const id = s?.match?.id ?? '';
    if (id !== race) {
      race = id;
      lastBeat = -1;
      roared = false;
    }
  });

  /** Schedule what falls in the next 1.2 s */
  function schedule() {
    if (!v) return;
    const ac = audioContext();
    if (ac.state !== 'running') void ac.resume().catch(() => {});
    const now = serverNow();
    const early = v.audioOffset;
    const at = (serverTime: number) => ac.currentTime + (serverTime - early - now) / 1000;
    for (const b of v.beats) {
      if (b.i <= lastBeat) continue;
      const ahead = b.at - early - now;
      if (ahead > 1200) break;
      lastBeat = b.i;
      if (ahead < -40) continue;
      pirateSound('drum', { url: url('drum'), when: at(b.at), accent: b.i < PIRATE.countIn, volume: b.i < PIRATE.countIn ? 0.95 : 0.85 });
    }
    if (!roared && v.raceAt - early - now < 1200) {
      roared = true;
      if (v.raceAt - early - now > -300) pirateSound('roar', { url: url('roar'), when: at(v.raceAt), volume: 0.7 });
    }
  }

  $effect(() => {
    if (!v) return;
    const t = setInterval(schedule, 100);
    schedule();
    return () => clearInterval(t);
  });

  $effect(() => {
    const offs = [
      onEvent('games', 'pirateBoost', () => pirateSound('boost', { url: url('boost'), volume: 0.75 })),
      onEvent('games', 'pirateFinish', () => pirateSound('finish', { url: url('finish'), volume: 0.85 })),
      onEvent<{ kind: PirateSoundId; url: string | null }>('games', 'pirateTest', (d) => pirateSound(d.kind, { url: d.url, volume: 0.85 })),
    ];
    return () => offs.forEach((off) => off());
  });
</script>
