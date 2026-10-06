<script lang="ts">
  import { Now, secondsLeft } from '../store.svelte.ts';

  /** A bar that burns down until `endsAt` (server time), with the seconds left */
  let { endsAt, totalMs, label }: { endsAt: number; totalMs: number; label: string } = $props();
  const now = new Now(200);
  const ratio = $derived(Math.max(0, Math.min(1, (endsAt - now.value) / totalMs)));
  const left = $derived(secondsLeft(endsAt, now.value));
</script>

<div class="fuse" class:low={left <= 10}>
  <div class="track"><span style:width="{ratio * 100}%"></span></div>
  <span class="text">{label} <strong class="mono">{left}s</strong></span>
</div>

<style>
  .fuse {
    display: grid;
    gap: 0.4rem;
    width: 100%;
  }
  .track {
    height: 0.35rem;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--gradient);
    transition: width 0.2s linear;
  }
  .low .track span {
    background: var(--danger);
  }
  .text {
    font-size: 0.8rem;
    color: var(--text-faint);
    text-align: center;
  }
  .low .text strong {
    color: var(--danger);
  }
</style>
