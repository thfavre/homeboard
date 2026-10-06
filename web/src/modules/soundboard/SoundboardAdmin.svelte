<script lang="ts">
  import { Synced } from '$lib/synced.svelte.ts';
  import { Play, Plus, RotateCcw, Trash2, Upload } from '@lucide/svelte';
  import type { SoundboardState } from '$shared/soundboard.ts';
  import { hb, rpc, attempt, upload } from '$lib/client.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import TwoStepButton from '$lib/ui/TwoStepButton.svelte';
  import Ducking from '../spotify/Ducking.svelte';
  import MiSearch from './MiSearch.svelte';
  import SoundCard from './SoundCard.svelte';

  const mod = $derived(hb.modules.soundboard as SoundboardState | undefined);
  const volume = new Synced(() => (hb.modules.soundboard ? Math.round(hb.modules.soundboard.volume * 100) : undefined), 80);
  const cooldown = new Synced(() => hb.modules.soundboard?.cooldownSec, 4);
  const maxSec = new Synced(() => hb.modules.soundboard?.searchMaxSec, 10);
  let adding = $state<string | null>(null);
  let name = $state('');
  let fileInput = $state<HTMLInputElement>();

  const set = (args: Record<string, unknown>) => attempt(() => rpc('soundboard', 'setOptions', args));
  const test = (id: string) => attempt(() => rpc('soundboard', 'test', { id }));

  async function add(mp3: string, title: string) {
    adding = mp3;
    await attempt(() => rpc('soundboard', 'addFromSearch', { mp3, title }), `${title} added to the board`);
    adding = null;
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    await attempt(() => upload('soundboard', 'upload', file, { name: name || file.name.replace(/\.[^.]+$/, '') }), 'Sound added');
    name = '';
    if (fileInput) fileInput.value = '';
  }
</script>

<!-- Tap once to arm, again to delete (it goes to Recently deleted) -->
{#snippet del(onconfirm: () => Promise<unknown>)}
  <TwoStepButton class="ghost small del" {onconfirm}>
    <Trash2 size={15} />
    {#snippet armed()}Delete{/snippet}
  </TwoStepButton>
{/snippet}

{#if mod}
  <Section title="Settings" hint="Sounds play on the TV page, so the PC must send its audio to the TV.">
    <label class="field">
      <span>Volume {volume.value}%</span>
      <input
        type="range"
        min="0"
        max="100"
        bind:value={volume.value}
        onpointerdown={volume.start}
        onchange={() => {
          set({ volume: volume.value / 100 });
          volume.end();
        }}
      />
    </label>
    <label class="field">
      <span>Pause between two sounds (seconds)</span>
      <input class="input" type="number" min="0" max="120" bind:value={cooldown.value} onfocus={cooldown.start} onblur={() => { set({ cooldownSec: Number(cooldown.value) }); cooldown.end(); }} />
    </label>
    <Ducking source="soundboard" title="Lower the music" hint="Spotify gets quieter while a sound plays." />
  </Section>

  <Section title="Built-in sounds">
    {#each mod.builtins ?? [] as b (b.id)}
      <div class="line">
        <button class="btn ghost small" aria-label="Test" onclick={() => test(b.id)}><Play size={15} /></button>
        <span class="grow">{b.name}</span>
        <Toggle checked={b.enabled} label={b.name} onchange={(v) => attempt(() => rpc('soundboard', 'setBuiltin', { id: b.id, enabled: v }))} />
        {@render del(() => attempt(() => rpc('soundboard', 'deleteBuiltin', { id: b.id })))}
      </div>
    {:else}
      <p class="faint">All built-in sounds were deleted.</p>
    {/each}
  </Section>

  <Section title="Your sounds" hint="Short clips work best (a few seconds).">
    {#each mod.sounds.filter((s) => s.kind === 'file') as s (s.id)}
      <div class="line">
        <button class="btn ghost small" aria-label="Test" onclick={() => test(s.id)}><Play size={15} /></button>
        <span class="grow">{s.name}</span>
        {@render del(() => attempt(() => rpc('soundboard', 'deleteCustom', { id: s.id })))}
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

  {#if mod.trash?.length}
    <Section title="Recently deleted" hint="The last 10 sounds you deleted. Older ones are gone for good.">
      {#each mod.trash as t (t.id)}
        <div class="line">
          <span class="grow">{t.name}<span class="faint sub">{t.kind === 'builtin' ? 'Built-in' : 'Your sound'}</span></span>
          <button class="btn ghost small" onclick={() => attempt(() => rpc('soundboard', 'restore', { id: t.id }), `${t.name} restored`)}><RotateCcw size={15} /> Restore</button>
        </div>
      {/each}
    </Section>
  {/if}

  <Section title="Sound search" hint="Sounds from myinstants.com. Tap a sound to play it on the TV, or + to add it to the board: it is downloaded, so it keeps working without internet.">
    <div class="line">
      <span class="grow">Guests can search for sounds<span class="faint sub">They play them on the TV at the usual price, and can keep their own</span></span>
      <Toggle checked={mod.guestSearch} label="Guests can search for sounds" onchange={(v) => set({ guestSearch: v })} />
    </div>
    {#if mod.guestSearch}
      <label class="field">
        <span>Longest sound guests can find (seconds, 0 = no limit)</span>
        <input class="input" type="number" min="0" max="60" bind:value={maxSec.value} onfocus={maxSec.start} onblur={() => { set({ searchMaxSec: Number(maxSec.value) }); maxSec.end(); }} />
      </label>
    {/if}
    <MiSearch>
      {#snippet item(s, i)}
        <SoundCard name={s.title} hue={(i * 47 + 200) % 360} onclick={() => attempt(() => rpc('soundboard', 'playSearch', { mp3: s.mp3, title: s.title }))}>
          {#snippet aside()}
            <button aria-label="Add to the board" disabled={adding === s.mp3} onclick={() => add(s.mp3, s.title)}><Plus size={18} /></button>
          {/snippet}
        </SoundCard>
      {/snippet}
    </MiSearch>
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
  /* Same width with the bin and with "Delete", so the row does not jump */
  .line :global(.del) {
    min-width: 4.6rem;
    justify-content: center;
  }
  .sub {
    display: block;
    font-size: 0.8rem;
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
