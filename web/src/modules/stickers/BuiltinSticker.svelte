<script lang="ts" module>
  let seq = 0;

  function burst(spikes: number, outer: number, inner: number): string {
    const pts: string[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (Math.PI * i) / spikes - Math.PI / 2;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  const BURST = burst(14, 47, 37);
</script>

<script lang="ts">
  /** Hand-drawn vector stickers. Ids must match shared/stickers.ts */
  let { id }: { id: string } = $props();
  const g = `st${++seq}`;
</script>

<svg viewBox="0 0 100 100" class="sticker" aria-hidden="true">
  <defs>
    <linearGradient id="{g}-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe680" />
      <stop offset="1" stop-color="#ff9f1c" />
    </linearGradient>
    <linearGradient id="{g}-love" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff8fab" />
      <stop offset="1" stop-color="#e11d48" />
    </linearGradient>
    <linearGradient id="{g}-fire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb347" />
      <stop offset="1" stop-color="#ff3d2e" />
    </linearGradient>
    <linearGradient id="{g}-violet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c4b5fd" />
      <stop offset="1" stop-color="#7c3aed" />
    </linearGradient>
    <linearGradient id="{g}-ice" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#67e8f9" />
      <stop offset="1" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="{g}-teal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34d399" />
      <stop offset="1" stop-color="#3b82f6" />
    </linearGradient>
    <radialGradient id="{g}-silver" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="0.5" stop-color="#c7cbd6" />
      <stop offset="1" stop-color="#6b7280" />
    </radialGradient>
    <clipPath id="{g}-ball"><circle cx="50" cy="56" r="38" /></clipPath>
  </defs>

  {#if id === 'star'}
    <path
      d="M50 8 L61.8 35.8 L91.9 38.4 L69 58.2 L75.9 87.6 L50 72 L24.1 87.6 L31 58.2 L8.1 38.4 L38.2 35.8 Z"
      fill="url(#{g}-gold)"
      stroke="#fff"
      stroke-width="4"
      stroke-linejoin="round"
    />
    <ellipse cx="40" cy="40" rx="6" ry="3.5" fill="#fff" opacity="0.6" transform="rotate(-30 40 40)" />
  {:else if id === 'heart'}
    <path
      d="M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C39 8 46 13 50 21 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z"
      fill="url(#{g}-love)"
      stroke="#fff"
      stroke-width="4"
      stroke-linejoin="round"
    />
    <ellipse cx="28" cy="28" rx="9" ry="5" fill="#fff" opacity="0.55" transform="rotate(-35 28 28)" />
  {:else if id === 'bolt'}
    <path d="M62 4 L16 58 H46 L36 96 L84 40 H54 Z" fill="url(#{g}-gold)" stroke="#fff" stroke-width="4" stroke-linejoin="round" />
  {:else if id === 'crown'}
    <path d="M10 32 L30 54 L50 20 L70 54 L90 32 L82 78 H18 Z" fill="url(#{g}-gold)" stroke="#fff" stroke-width="4" stroke-linejoin="round" />
    <rect x="16" y="80" width="68" height="10" rx="4" fill="url(#{g}-gold)" stroke="#fff" stroke-width="3" />
    <circle cx="10" cy="30" r="6" fill="#ff4d6d" stroke="#fff" stroke-width="2.5" />
    <circle cx="50" cy="18" r="6" fill="#4cc9f0" stroke="#fff" stroke-width="2.5" />
    <circle cx="90" cy="30" r="6" fill="#ff4d6d" stroke="#fff" stroke-width="2.5" />
  {:else if id === 'flame'}
    <path
      d="M50 96 C26 96 14 78 14 60 C14 40 30 30 34 8 C44 20 46 32 46 40 C52 34 56 26 56 16 C74 30 86 48 86 64 C86 82 72 96 50 96 Z"
      fill="url(#{g}-fire)"
      stroke="#fff"
      stroke-width="4"
      stroke-linejoin="round"
    />
    <path d="M50 90 C39 90 33 81 33 72 C33 62 41 57 44 47 C48 54 52 58 54 64 C58 60 60 56 60 52 C66 60 67 66 67 72 C67 83 60 90 50 90 Z" fill="#ffe680" />
  {:else if id === 'note'}
    <path d="M40 22 L86 10 V24 L40 36 Z" fill="url(#{g}-violet)" stroke="#fff" stroke-width="3" stroke-linejoin="round" />
    <rect x="38" y="22" width="7" height="56" fill="url(#{g}-violet)" stroke="#fff" stroke-width="3" />
    <rect x="80" y="12" width="7" height="56" fill="url(#{g}-violet)" stroke="#fff" stroke-width="3" />
    <ellipse cx="29" cy="78" rx="15" ry="11" fill="url(#{g}-violet)" stroke="#fff" stroke-width="4" transform="rotate(-18 29 78)" />
    <ellipse cx="71" cy="68" rx="15" ry="11" fill="url(#{g}-violet)" stroke="#fff" stroke-width="4" transform="rotate(-18 71 68)" />
  {:else if id === 'disco'}
    <line x1="50" y1="0" x2="50" y2="18" stroke="#c7cbd6" stroke-width="3" />
    <circle cx="50" cy="56" r="38" fill="url(#{g}-silver)" stroke="#fff" stroke-width="4" />
    <g clip-path="url(#{g}-ball)" stroke="#4b5563" stroke-width="1.4" opacity="0.55" fill="none">
      {#each [-30, -20, -10, 0, 10, 20, 30] as dy}<line x1="0" y1={56 + dy} x2="100" y2={56 + dy} />{/each}
      {#each [8, 20, 31] as rx}<ellipse cx="50" cy="56" {rx} ry="38" />{/each}
      <line x1="50" y1="0" x2="50" y2="100" />
    </g>
    <rect x="30" y="34" width="8" height="8" fill="#fff" opacity="0.9" />
    <rect x="58" y="62" width="7" height="7" fill="#a5f3fc" opacity="0.9" />
    <rect x="40" y="70" width="6" height="6" fill="#f0abfc" opacity="0.9" />
  {:else if id === 'sparkle'}
    <path d="M46 6 C50 36 60 46 92 50 C60 54 50 64 46 94 C42 64 32 54 4 50 C32 46 42 36 46 6 Z" fill="url(#{g}-ice)" stroke="#fff" stroke-width="4" stroke-linejoin="round" />
    <path d="M82 6 C84 16 87 19 96 20 C87 22 84 25 82 34 C80 25 77 22 68 20 C77 19 80 16 82 6 Z" fill="#fff" />
  {:else if id === 'smile'}
    <circle cx="50" cy="50" r="44" fill="url(#{g}-gold)" stroke="#fff" stroke-width="4" />
    <ellipse cx="36" cy="40" rx="5" ry="8" fill="#3b2a00" />
    <ellipse cx="64" cy="40" rx="5" ry="8" fill="#3b2a00" />
    <path d="M28 58 Q50 82 72 58" fill="none" stroke="#3b2a00" stroke-width="6" stroke-linecap="round" />
    <ellipse cx="30" cy="24" rx="9" ry="5" fill="#fff" opacity="0.5" transform="rotate(-30 30 24)" />
  {:else if id === 'wow'}
    <polygon points={BURST} fill="url(#{g}-fire)" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" />
    <text x="50" y="60" text-anchor="middle" class="word" font-size="28" fill="#fff">WOW</text>
  {:else if id === 'gg'}
    <rect x="8" y="22" width="84" height="56" rx="18" fill="url(#{g}-teal)" stroke="#fff" stroke-width="4" />
    <text x="50" y="63" text-anchor="middle" class="word" font-size="34" fill="#fff">GG</text>
  {:else if id === 'cheers'}
    <path d="M4 40 L16 34 L16 70 L4 64 L10 52 Z" fill="#be123c" stroke="#fff" stroke-width="3" stroke-linejoin="round" />
    <path d="M96 40 L84 34 L84 70 L96 64 L90 52 Z" fill="#be123c" stroke="#fff" stroke-width="3" stroke-linejoin="round" />
    <rect x="12" y="30" width="76" height="36" rx="6" fill="url(#{g}-love)" stroke="#fff" stroke-width="3.5" />
    <text x="50" y="55" text-anchor="middle" class="word" font-size="17" fill="#fff">CHEERS</text>
  {:else}
    <circle cx="50" cy="50" r="40" fill="url(#{g}-violet)" stroke="#fff" stroke-width="4" />
  {/if}
</svg>

<style>
  .sticker {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
  }
  .word {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
</style>
