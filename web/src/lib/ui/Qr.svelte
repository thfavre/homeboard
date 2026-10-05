<script lang="ts">
  let { svg, size = '100%' }: { svg: string; size?: string } = $props();
</script>

<div class="qr" style:width={size}>
  {#if svg}{@html svg}{/if}
</div>

<style>
  .qr {
    flex: none;
    aspect-ratio: 1;
    padding: 0.7rem;
    background: #fff;
    border-radius: 1rem;
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
</style>
