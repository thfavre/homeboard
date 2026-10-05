<script lang="ts">
  let { size = '1em' }: { size?: string } = $props();
</script>

<svg class="coin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <circle cx="12" cy="12" r="11" fill="var(--coin-2)" />
  <circle cx="12" cy="11" r="10" fill="var(--coin)" />
  <circle cx="12" cy="11" r="6.6" fill="none" stroke="var(--coin-2)" stroke-width="1.6" opacity="0.8" />
  <path d="M12 7.2l1.15 2.45 2.65.3-1.97 1.8.54 2.62L12 13.05l-2.37 1.32.54-2.62-1.97-1.8 2.65-.3z" fill="var(--coin-2)" />
</svg>

<style>
  .coin {
    flex: none;
    vertical-align: -0.14em;
  }
</style>
