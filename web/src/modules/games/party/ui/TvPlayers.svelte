<script lang="ts">
  import { Check } from '@lucide/svelte';
  import type { GamePlayer } from '$shared/games.ts';
  import Avatar from '$lib/ui/Avatar.svelte';

  /**
   * TV: the players down the side, with what each one did in this phase: `true` a check (answered),
   * a text ("4/10", "27"), or nothing. `good`: shown in green (a right answer).
   */
  let { players, status }: { players: GamePlayer[]; status: (id: string) => { text?: string; done?: boolean; good?: boolean } | null } = $props();
</script>

<div class="players">
  {#each players as p (p.id)}
    {@const st = status(p.id)}
    <div class="p">
      <Avatar name={p.name} color={p.color} id={p.id} size="2.6rem" />
      <span class="truncate">{p.name}</span>
      {#if st?.done}<span class="pill success"><Check size="1rem" strokeWidth={3} /></span>{:else if st?.text}<span class="mono prog" class:good={st.good}>{st.text}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .players {
    display: grid;
    gap: 0.6rem;
    align-content: center;
    max-height: 100%;
    overflow: hidden;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.4rem 1rem 0.4rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 1.3rem;
    font-weight: 600;
  }
  .p .truncate {
    flex: 1;
  }
  .prog {
    color: var(--text-dim);
    font-size: 1.5rem;
    font-weight: 700;
  }
  .prog.good {
    color: var(--success);
  }
</style>
