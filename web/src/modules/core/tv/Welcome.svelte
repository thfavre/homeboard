<script lang="ts">
  import { hb } from '$lib/client.svelte.ts';
</script>

<div class="welcome card">
  <span class="eyebrow">Welcome to</span>
  <h1>{hb.core?.appName}</h1>
  <p class="dim">
    {#if hb.core?.guestsOnline}
      {hb.core.guestsOnline} {hb.core.guestsOnline === 1 ? 'guest' : 'guests'} connected
    {:else}
      Scan the code to join
    {/if}
  </p>
</div>

<style>
  .welcome {
    height: 100%;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    text-align: center;
  }
  h1 {
    font-size: 7rem;
    letter-spacing: -0.05em;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding: 0 0.1em 0.1em;
  }
  p {
    font-size: 1.5rem;
  }
</style>
