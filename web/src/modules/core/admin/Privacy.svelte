<script lang="ts">
  import type { PrivacySettings } from '$shared/protocol.ts';
  import { hb, rpc, attempt } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';

  const privacy = $derived(hb.core?.privacy);
  const set = (patch: Partial<PrivacySettings>) => attempt(() => rpc('core', 'setGeneral', { privacy: patch }));

  const FEED = [
    { value: 'names', title: 'With names', example: 'Thomas played Air horn' },
    { value: 'anonymous', title: 'Without names', example: 'Someone played Air horn' },
    { value: 'off', title: 'Hidden', example: 'No feed, the rest of the screen gets the space' },
  ] as const;

  const NAMES = [
    { key: 'photoNames', title: 'Photos', hint: 'Name under each photo' },
    { key: 'stickerNames', title: 'Stickers', hint: 'Name under each bouncing sticker' },
    { key: 'songNames', title: 'Songs', hint: '"Requested by" on the music' },
    { key: 'effectNames', title: 'Lights and sounds', hint: 'Who started a light effect or a sound' },
  ] as const;
</script>

{#if privacy}
  <Section title="Activity feed" hint="The line of recent events at the bottom of the TV. You always see names here in the admin.">
    <div class="choices">
      {#each FEED as f (f.value)}
        <button class="choice" class:active={privacy.activity === f.value} onclick={() => set({ activity: f.value })}>
          <span class="radio"></span>
          <span class="text">
            <strong>{f.title}</strong>
            <span class="faint">{f.example}</span>
          </span>
        </button>
      {/each}
    </div>
  </Section>

  <Section title="Show names on the TV" hint="Turn off to show things without saying who sent them.">
    {#each NAMES as n (n.key)}
      <div class="line">
        <div>
          <strong>{n.title}</strong>
          <p class="faint small">{n.hint}</p>
        </div>
        <Toggle checked={privacy[n.key]} label={n.title} onchange={(v) => set({ [n.key]: v })} />
      </div>
    {/each}
    <p class="faint small">The leaderboard can be hidden in Economy. Quiz scores always show names.</p>
  </Section>
{/if}

<style>
  .choices {
    display: grid;
    gap: 0.5rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    text-align: left;
  }
  .choice.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .radio {
    flex: none;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
  }
  .active .radio {
    border: 5px solid var(--accent);
  }
  .text {
    display: grid;
    gap: 0.1rem;
    font-size: 0.9rem;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .small {
    font-size: 0.82rem;
  }
</style>
