<script lang="ts">
  /** A wax seal pressed with a letter: a blob with a wavy rim, a ring and the letter in relief */
  let { color, letter, size = 56 }: { color: string; letter: string; size?: number } = $props();

  /** The wavy rim of the blob of wax */
  const rim = (() => {
    const pts: string[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r = 23 + Math.sin(a * 7) * 1.4 + Math.sin(a * 3 + 1) * 0.9;
      pts.push(`${(25 + Math.cos(a) * r).toFixed(2)},${(25 + Math.sin(a) * r).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  })();
</script>

<svg viewBox="0 0 50 50" width={size} height={size} aria-hidden="true">
  <defs>
    <radialGradient id="wax-shine" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="0.38" />
      <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
      <stop offset="1" stop-color="#000" stop-opacity="0.32" />
    </radialGradient>
  </defs>
  <path d={rim} fill={color} />
  <path d={rim} fill="url(#wax-shine)" />
  <circle cx="25" cy="25" r="15.5" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="2" />
  <circle cx="25" cy="25.6" r="15.5" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1" />
  <text x="25" y="31.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700" fill="#000" fill-opacity="0.3">{letter}</text>
  <text x="25" y="30.6" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" font-weight="700" fill="#fff" fill-opacity="0.22">{letter}</text>
</svg>
