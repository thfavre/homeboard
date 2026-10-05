<script lang="ts">
  import { hb } from '$lib/client.svelte.ts';

  /**
   * A guest's picture: their selfie when they made one, otherwise their initials.
   * Pass `id` and the selfie is found automatically.
   */
  let { name, color, size = '2.2rem', id, src }: { name: string; color: string; size?: string; id?: string; src?: string } = $props();

  const url = $derived(src ?? (id ? hb.core?.avatars?.[id] : undefined));
  const initials = $derived(
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase(),
  );
</script>

{#if url}
  <img class="avatar photo" src={url} alt={name} style:--c={color} style:width={size} style:height={size} />
{:else}
  <span class="avatar" style:--c={color} style:width={size} style:height={size} style:font-size={`calc(${size} * 0.4)`}>{initials}</span>
{/if}

<style>
  .avatar {
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c) 22%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--c) 70%, transparent);
    color: var(--c);
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .photo {
    object-fit: cover;
    border-width: 2px;
    border-color: var(--c);
  }
</style>
