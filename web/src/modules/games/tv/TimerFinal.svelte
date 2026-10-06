<script lang="ts">
  import type { MatchState, TimerView } from '$shared/games.ts';
  import Standings, { type StandingRow } from './Standings.svelte';

  /** Blind Timer final standings: most rounds won first, the total gap breaks ties */
  let { m }: { m: MatchState } = $props();
  const v = $derived(m.view as TimerView);
  const sec = (ms: number) => (ms / 1000).toFixed(2);
  const rows = $derived<StandingRow[]>(
    [...m.players]
      .sort((a, b) => (v.wins[b.id] ?? 0) - (v.wins[a.id] ?? 0) || (v.totals[a.id] ?? 0) - (v.totals[b.id] ?? 0))
      .map((p) => {
        const w = v.wins[p.id] ?? 0;
        return {
          id: p.id,
          total: `${w} ${w === 1 ? 'win' : 'wins'}`,
          sub: `gap ${sec(v.totals[p.id] ?? 0)} s`,
          chips: v.history.map((r) => {
            const t = r.times[p.id];
            if (t === null || t === undefined) return { text: 'miss', tone: 'bad' as const };
            const d = t - r.target;
            return {
              text: `${d >= 0 ? '+' : '-'}${sec(Math.abs(d))}`,
              tone: Math.abs(d) < 500 ? 'good' : Math.abs(d) >= 2000 ? 'bad' : 'mid',
              won: r.winners.includes(p.id),
            };
          }),
        };
      }),
  );
</script>

<Standings {m} {rows} legend="Gap to the target in each round (crown: closest that round). Most rounds won wins; a tie goes to the smallest total gap." />
