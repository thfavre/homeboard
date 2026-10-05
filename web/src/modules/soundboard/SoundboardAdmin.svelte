<script lang="ts">
  import { Play, Trash2, Upload } from '@lucide/svelte';
  import type { SoundboardState } from '$shared/soundboard.ts';
  import { hb, rpc, attempt, upload } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';

  const mod = $derived(hb.modules.soundboard as SoundboardState | undefined);
  let volume = $state(Math.round((hb.modules.soundboard?.volume ?? 0.8) * 100));
  let cooldown = $state(String(hb.modules.soundboard?.cooldownSec ?? 4));
  let name = $state('');
  let fileInput = $state<HTMLInputElement>();

  const set = (args: Record<string, unknown>) => attempt(() => rpc('soundboard', 'setOptions', args));
  const test = (id: string) => attempt(() => rpc('soundboard', 'test', { id }));

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    await attempt(() => upload('soundboard', 'upload', file, { name: name || file.name.replace(/\.[^.]+$/, '') }), 'Sound added');
    name = '';
    if (fileInput) fileInput.value = '';
  }
</script>

{#if mod}
  <Section title="Settings" hint="Sounds play on the TV page, so the PC must send its audio to the TV.">
    <label class="field">
      <span>Volume {volume}%</span>
      <input type="range" min="0" max="100" bind:value={volume} onchange={() => set({ volume: volume / 100 })} />
    </label>
    <label class="field">
      <span>Pause between two sounds (seconds)</span>
      <input class="input" type="number" min="0" max="120" bind:value={cooldown} onblur={() => set({ cooldownSec: Number(cooldown) })} />
    </label>
  </Section>

  <Section title="Built-in sounds">
    {#each mod.builtins ?? [] as b (b.id)}
      <div class="line">
        <button class="btn ghost small" aria-label="Test" onclick={() => test(b.id)}><Play size={15} /></button>
        <span class="grow">{b.name}</span>
        <Toggle checked={b.enabled} label={b.name} onchange={(v) => attempt(() => rpc('soundboard', 'setBuiltin', { id: b.id, enabled: v }))} />
      </div>
    {/each}
  </Section>

  <Section title="Your sounds" hint="Short clips work best (a few seconds).">
    {#each mod.sounds.filter((s) => s.kind === 'file') as s (s.id)}
      <div class="line">
        <button class="btn ghost small" aria-label="Test" onclick={() => test(s.id)}><Play size={15} /></button>
        <span class="grow">{s.name}</span>
        <button class="btn ghost small" aria-label="Delete" onclick={() => confirm(`Delete ${s.name}?`) && attempt(() => rpc('soundboard', 'deleteCustom', { id: s.id }))}>
          <Trash2 size={15} />
        </button>
      </div>
    {:else}
      <p class="faint">No uploaded sounds yet.</p>
    {/each}
    <div class="row">
      <input class="input" bind:value={name} placeholder="Name (optional)" maxlength="30" />
      <button class="btn" onclick={() => fileInput?.click()}><Upload size={18} /> Upload</button>
      <input bind:this={fileInput} type="file" accept="audio/*" hidden onchange={onFile} />
    </div>
  </Section>
{/if}

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .grow {
    flex: 1;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
