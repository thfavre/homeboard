<script lang="ts">
  import { PIRATE, PIRATE_SONG_TEST_SEC, type PirateSoundId, type PirateView } from '$shared/games.ts';
  import { onEvent, serverNow } from '$lib/client.svelte.ts';
  import { audioContext } from '../soundboard/player.ts';
  import { gameMatch, gamesState } from './store.svelte.ts';
  import { BUILT_IN_FILES, loadPirateSound, pirateSound } from './ui/pirateSound.ts';
  import { FADE_OUT_SEC, SongOnBeats } from './ui/pirateSong.ts';

  /**
   * The sound of Pirate Race on the TV, with nothing on screen: the drum on every beat (scheduled on the
   * audio clock from the server's beat times, a little early for the speaker delay), the crew's roar
   * when the race starts, the boosts and the finish, and the race songs in step with the drum (each from
   * its start, fading in). Also plays a sound or a song the host tries from the admin.
   */
  const s = $derived(gamesState());
  const raceMatch = $derived(gameMatch('pirates'));
  const v = $derived(raceMatch?.phase === 'play' ? (raceMatch.view as PirateView | null) : null);
  const url = (kind: PirateSoundId) => s?.settings.pirateSounds?.[kind]?.url ?? null;
  /** The drum at the host's level */
  const drum = (volume: number) => (volume * (s?.settings.pirateDrumVolume ?? 100)) / 100;

  // The picked files are decoded as soon as they are known, so the first beat is not late
  $effect(() => {
    for (const pick of Object.values(s?.settings.pirateSounds ?? {})) if (pick?.url) void loadPirateSound(pick.url);
    for (const [kind, file] of Object.entries(BUILT_IN_FILES)) if (!url(kind as PirateSoundId)) void loadPirateSound(file);
    // The songs too, once a race is on its way (each is a few MB once decoded)
    if (raceMatch) for (const song of s?.settings.pirateSongs ?? []) void loadPirateSound(song.url);
  });

  /** The race songs playing or about to, by the drum beat their beat 0 falls on */
  const playing = new Map<number, SongOnBeats>();
  const stopSongs = (fadeSec = FADE_OUT_SEC) => {
    for (const p of playing.values()) p.stop(fadeSec);
    playing.clear();
  };
  $effect(() => {
    if (!v || v.step === 'finish') stopSongs();
  });
  $effect(() => () => stopSongs(0.3));
  // The host's song volume, heard at once (in a race and while trying a song)
  $effect(() => {
    const volume = s?.settings.pirateSongVolume ?? 70;
    for (const p of playing.values()) p.setVolume(volume);
    test?.song.setVolume(volume);
  });

  /** Beats already scheduled (index), and whether the roar is */
  let lastBeat = -1;
  let roared = false;
  let race = '';
  $effect(() => {
    const id = raceMatch?.id ?? '';
    if (id !== race) {
      race = id;
      lastBeat = -1;
      roared = false;
    }
  });

  /**
   * The link between the server clock and the audio clock (server seconds minus audio seconds). Read
   * fresh, it moves by a few ms to tens of ms from one reading to the next (the audio clock goes forward
   * in steps, a block of samples at a time), and every drum beat would land a little off the song, which
   * plays on without a break. So one steady link is kept: the audio clock is only ever late when read,
   * so the smallest reading is the truest; it creeps up slowly to follow the two clocks drifting apart,
   * and jumps when they really move (the clock measured again, the audio woken up).
   */
  let link: number | null = null;
  function clockLink(ac: AudioContext): number {
    const reading = serverNow() / 1000 - ac.currentTime;
    if (link === null || reading < link || reading - link > 0.1) link = reading;
    else link += Math.min(reading - link, 0.0002);
    return link;
  }

  /** Schedule what falls in the next 1.2 s */
  function schedule() {
    if (!v) return;
    const ac = audioContext();
    if (ac.state !== 'running') void ac.resume().catch(() => {});
    const now = serverNow();
    const early = v.audioOffset;
    const base = clockLink(ac);
    const at = (serverTime: number) => (serverTime - early) / 1000 - base;
    if (v.step !== 'finish') {
      const known = v.beats.map((b) => ({ i: b.i, time: at(b.at) }));
      const last = v.beats[v.beats.length - 1]?.i ?? -1;
      for (const play of v.songs ?? []) {
        const pick = s?.settings.pirateSongs?.find((x) => x.id === play.id);
        // Only the songs whose beats are being sent (one starting soon, or playing)
        if (!pick || play.beat > last || play.beat + pick.beats.length < (v.beats[0]?.i ?? 0)) continue;
        let p = playing.get(play.beat);
        if (!p) {
          p = new SongOnBeats(pick.url, pick.beats, s?.settings.pirateSongVolume ?? 70, play.beat);
          playing.set(play.beat, p);
        }
        void p.beats(known);
      }
    }
    for (const b of v.beats) {
      if (b.i <= lastBeat) continue;
      const ahead = b.at - early - now;
      if (ahead > 1200) break;
      lastBeat = b.i;
      if (ahead < -40) continue;
      // The accent on every 4th beat: counted from the song's beat 0 while one plays (its bars), else from the race's first beat
      const song = (v.songs ?? []).findLast((p) => p.beat <= b.i);
      const accent = b.i < PIRATE.countIn || (b.i - (song?.beat ?? PIRATE.countIn)) % 4 === 0;
      pirateSound(accent ? 'drumAccent' : 'drum', { url: url(accent ? 'drumAccent' : 'drum'), when: at(b.at), accent, volume: drum(accent ? 0.95 : 0.85) });
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
      onEvent<{ kind: PirateSoundId; url: string | null }>('games', 'pirateTest', (d) => pirateSound(d.kind, { url: d.url, volume: d.kind === 'drum' || d.kind === 'drumAccent' ? drum(0.85) : 0.85, accent: d.kind === 'drumAccent' })),
      onEvent<SongTest | null>('games', 'pirateSongTest', (d) => void testSong(d)),
    ];
    return () => {
      offs.forEach((off) => off());
      stopTest();
    };
  });

  // ------------------------------------------------------------ trying a song from the admin

  type SongTest = { id: string; drum: string | null; accent?: string | null };
  let test = $state<{ song: SongOnBeats; timer: ReturnType<typeof setTimeout>; tick: ReturnType<typeof setInterval> } | null>(null);
  function stopTest() {
    if (!test) return;
    clearTimeout(test.timer);
    clearInterval(test.tick);
    test.song.stop(0.4);
    test = null;
  }
  /** 20 s of the song from its start, at its own tempo, with the drum on every beat */
  async function testSong(d: SongTest | null) {
    stopTest();
    if (!d) return;
    const pick = s?.settings.pirateSongs?.find((x) => x.id === d.id);
    if (!pick) return;
    const buffer = await loadPirateSound(pick.url);
    if (!buffer) return;
    const ac = audioContext();
    if (ac.state !== 'running') await ac.resume().catch(() => {});
    const player = new SongOnBeats(pick.url, pick.beats, s?.settings.pirateSongVolume ?? 70, 0);
    const beats = player.ownBeats(ac.currentTime + 0.3 + pick.beats[0]).filter((b) => b.time < ac.currentTime + PIRATE_SONG_TEST_SEC + 0.5);
    const count = beats.length - 1;
    void player.beats(beats);
    // The drum a second ahead at a time, so stopping the test stops it too
    let next = 0;
    const drums = () => {
      while (next < count && beats[next].time < ac.currentTime + 1.2) {
        const accent = next % 4 === 0;
        pirateSound(accent ? 'drumAccent' : 'drum', { url: accent ? (d.accent ?? null) : d.drum, when: beats[next].time, volume: drum(accent ? 0.95 : 0.85), accent });
        next++;
      }
    };
    drums();
    const tick = setInterval(drums, 250);
    test = { song: player, timer: setTimeout(stopTest, PIRATE_SONG_TEST_SEC * 1000), tick };
  }
</script>
