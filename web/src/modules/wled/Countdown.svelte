<script lang="ts">
  /** Seconds left until `until`, updated every half second */
  let { until }: { until: number } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });
</script>

<span class="mono">{Math.max(0, Math.ceil((until - now) / 1000))}s</span>
