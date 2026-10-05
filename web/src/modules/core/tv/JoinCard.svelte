<script lang="ts">
  import { hb } from '$lib/client.svelte.ts';
  import Qr from '$lib/ui/Qr.svelte';

  const join = $derived(hb.core?.join);
  const host = $derived(join ? join.url.replace(/^https?:\/\//, '').replace(/[/?].*$/, '') : '');
</script>

{#if join}
  <div class="card join">
    <Qr svg={join.qrSvg} size="10rem" />
    <div class="info">
      <span class="eyebrow">Join the party</span>
      <p class="how">Scan the code with your phone camera, or open</p>
      <p class="url mono">{host}</p>
      {#if join.codeRequired}
        <div class="code">
          {#each join.code.split('') as d}<span>{d}</span>{/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .join {
    display: flex;
    gap: 1.2rem;
    padding: 1.1rem;
    align-items: center;
  }
  .info {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .how {
    color: var(--text-dim);
    font-size: 0.85rem;
    line-height: 1.3;
  }
  .url {
    font-size: 0.8rem;
    color: var(--text);
    word-break: break-all;
    line-height: 1.25;
  }
  .code {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
  .code span {
    display: grid;
    place-items: center;
    width: 2.2rem;
    height: 2.7rem;
    border-radius: 0.6rem;
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
  }
</style>
