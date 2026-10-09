<script lang="ts">
  /**
   * A pirate galley seen from the side, sailing right: team colored sails with a skull, a black flag,
   * and a row of oars that row with the drum. `phase`: where the stroke is (0: blades go in on the beat,
   * pulled back until 0.45, then lifted forward again). `power`: how hard the last stroke was (0 to 1);
   * `messy`: the crew is out of time, so the oars are not together.
   */
  let {
    color,
    phase = 0,
    power = 0.5,
    messy = false,
    boosted = false,
    id,
  }: { color: string; phase?: number; power?: number; messy?: boolean; boosted?: boolean; id: string } = $props();

  const OARS = [72, 98, 124, 150, 176];
  /** The angle of an oar (deg, 0: straight down) and how far it is lifted, at a point of the stroke */
  function stroke(p: number, amp: number): { angle: number; lift: number } {
    const x = ((p % 1) + 1) % 1;
    const catchAt = -34 * amp - 6;
    const finishAt = 26 * amp + 4;
    if (x < 0.45) {
      // The pull: fast at first, easing off at the end
      const k = 1 - (1 - x / 0.45) ** 2;
      return { angle: catchAt + (finishAt - catchAt) * k, lift: 0 };
    }
    // The recovery: blades out of the water, swung forward
    const k = (x - 0.45) / 0.55;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    return { angle: finishAt + (catchAt - finishAt) * e, lift: Math.sin(k * Math.PI) * 9 + 3 * (1 - k) };
  }
  const amp = $derived(0.35 + 0.65 * Math.min(1, Math.max(0, power)));
  const oars = $derived(OARS.map((x, i) => ({ x, ...stroke(phase - (messy ? [0.0, 0.09, -0.07, 0.13, -0.04][i] : 0), amp) })));
  /** Blades just went in: water splashes */
  const splash = $derived.by(() => {
    const x = ((phase % 1) + 1) % 1;
    return x < 0.22 ? 1 - x / 0.22 : 0;
  });
  const g = (name: string) => `${name}-${id}`;
</script>

<svg class="ship" class:boosted viewBox="0 0 280 180" style:--team={color} aria-hidden="true">
  <defs>
    <linearGradient id={g('wood')} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9b6233" />
      <stop offset="0.5" stop-color="#6e4020" />
      <stop offset="1" stop-color="#3f230f" />
    </linearGradient>
    <linearGradient id={g('sail')} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color={color} stop-opacity="0.82" />
      <stop offset="0.55" stop-color={color} />
      <stop offset="1" stop-color="#000" stop-opacity="0.25" />
    </linearGradient>
    <linearGradient id={g('shine')} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
  </defs>

  <g class="bob">
    <!-- Rigging -->
    <g stroke="#2b1a0e" stroke-width="0.9" opacity="0.75">
      <line x1="128" y1="10" x2="262" y2="62" />
      <line x1="128" y1="10" x2="30" y2="62" />
      <line x1="190" y1="26" x2="262" y2="62" />
      <line x1="46" y1="28" x2="12" y2="60" />
    </g>

    <!-- Masts and yards -->
    <g fill="#4a2a12">
      <rect x="125.5" y="8" width="5" height="80" rx="1.5" />
      <rect x="187.5" y="24" width="4.5" height="64" rx="1.5" />
      <rect x="43.5" y="26" width="4" height="40" rx="1.5" />
      <rect x="92" y="18" width="72" height="3.4" rx="1.7" />
      <rect x="160" y="33" width="58" height="3" rx="1.5" />
      <rect x="22" y="31" width="48" height="2.6" rx="1.3" />
    </g>

    <!-- Sails, filled by the wind -->
    <g class="sails">
      <path d="M95 21 Q128 15 161 21 Q170 47 160 76 Q128 68 96 76 Q86 47 95 21 Z" fill="url(#{g('sail')})" stroke="#000" stroke-opacity="0.25" />
      <path d="M95 21 Q128 15 161 21 Q170 47 160 76 Q128 68 96 76 Q86 47 95 21 Z" fill="url(#{g('shine')})" />
      <path d="M163 36 Q189 31 215 36 Q223 56 214 78 Q189 72 165 78 Q157 56 163 36 Z" fill="url(#{g('sail')})" stroke="#000" stroke-opacity="0.25" />
      <path d="M24 34 Q46 30 68 34 Q73 47 67 60 Q46 56 26 60 Q20 47 24 34 Z" fill="url(#{g('sail')})" stroke="#000" stroke-opacity="0.25" />
      <!-- The skull and crossbones -->
      <g transform="translate(128 46)">
        <g stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.92">
          <line x1="-13" y1="-6" x2="13" y2="16" />
          <line x1="13" y1="-6" x2="-13" y2="16" />
        </g>
        <circle cx="0" cy="0" r="10" fill="#fff" />
        <rect x="-5.5" y="6" width="11" height="6" rx="2" fill="#fff" />
        <circle cx="-3.8" cy="-0.5" r="2.9" fill="#1a1a1a" />
        <circle cx="3.8" cy="-0.5" r="2.9" fill="#1a1a1a" />
        <path d="M0 3.5 L-1.6 6.3 L1.6 6.3 Z" fill="#1a1a1a" />
      </g>
    </g>

    <!-- The black flag, flapping -->
    <g transform="translate(130 8)">
      <path class="flag" d="M0 0 Q12 -4 24 1 Q20 7 24 13 Q12 9 0 13 Z" fill="#141414" />
      <circle cx="10" cy="6" r="2.6" fill="#fff" />
      <path class="pennant" d="M0 14 L16 17 L0 20 Z" fill={color} />
    </g>

    <!-- Hull -->
    <path d="M8 58 L58 58 L62 86 L14 94 Z" fill="url(#{g('wood')})" stroke="#2b1a0e" stroke-width="1.5" />
    <path d="M14 86 L224 86 Q240 82 254 62 L262 60 L252 98 Q242 124 210 132 L56 132 Q24 126 14 86 Z" fill="url(#{g('wood')})" stroke="#2b1a0e" stroke-width="1.5" />
    <!-- Bowsprit -->
    <line x1="246" y1="70" x2="278" y2="50" stroke="#4a2a12" stroke-width="4" stroke-linecap="round" />
    <!-- Planks and the crew's stripe -->
    <g stroke="#2b1a0e" stroke-opacity="0.45" stroke-width="1">
      <path d="M20 108 Q120 112 248 104" fill="none" />
      <path d="M30 120 Q120 124 236 116" fill="none" />
    </g>
    <path d="M12 90 L250 90" stroke={color} stroke-width="5" />
    <path d="M10 60 L60 60" stroke={color} stroke-width="3.5" />
    <!-- Stern lantern and windows -->
    <circle cx="14" cy="52" r="3.6" fill="#ffd36b" class="lantern" />
    <rect x="22" y="68" width="8" height="8" rx="1.5" fill="#ffd36b" opacity="0.8" />
    <rect x="36" y="68" width="8" height="8" rx="1.5" fill="#ffd36b" opacity="0.8" />

    <!-- The oars, through their ports -->
    {#each oars as o, i (i)}
      <g transform="translate({o.x} {100 - o.lift}) rotate({o.angle})">
        <rect x="-1.8" y="0" width="3.6" height="62" rx="1.8" fill="#c9965a" stroke="#5a3415" stroke-width="0.8" />
        <path d="M-5 50 Q-6.5 62 0 72 Q6.5 62 5 50 Z" fill="#b07c42" stroke="#5a3415" stroke-width="0.8" />
      </g>
      <circle cx={o.x} cy="100" r="3.8" fill="#24140a" />
    {/each}
  </g>

  {#if splash > 0}
    <g fill="#e9f7ff" opacity={splash}>
      {#each oars as o, i (i)}
        {@const bx = o.x - Math.tan((o.angle * Math.PI) / 180) * (40 + o.lift)}
        <ellipse cx={bx} cy={139 - (1 - splash) * 6} rx={5 + 4 * (1 - splash)} ry={2.2} />
        <circle cx={bx - 5 - (1 - splash) * 4} cy={133 - (1 - splash) * 10} r="1.6" />
        <circle cx={bx + 5 + (1 - splash) * 5} cy={131 - (1 - splash) * 12} r="1.3" />
      {/each}
    </g>
  {/if}
</svg>

<style>
  .ship {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .bob {
    transform-box: view-box;
    transform-origin: 140px 130px;
    animation: bob 2.6s ease-in-out infinite;
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0) rotate(-1.4deg);
    }
    50% {
      transform: translateY(3px) rotate(1.2deg);
    }
  }
  .flag {
    transform-box: fill-box;
    transform-origin: left center;
    animation: flap 0.9s ease-in-out infinite alternate;
  }
  .pennant {
    transform-box: fill-box;
    transform-origin: left center;
    animation: flap 0.6s ease-in-out infinite alternate;
  }
  @keyframes flap {
    from {
      transform: skewY(-6deg) scaleX(0.92);
    }
    to {
      transform: skewY(6deg) scaleX(1);
    }
  }
  .sails {
    transform-box: view-box;
    transform-origin: 128px 80px;
    animation: billow 3.2s ease-in-out infinite;
  }
  @keyframes billow {
    0%,
    100% {
      transform: scaleX(1);
    }
    50% {
      transform: scaleX(1.025);
    }
  }
  .boosted .sails {
    animation-duration: 0.5s;
  }
  .lantern {
    animation: glow 1.4s ease-in-out infinite alternate;
  }
  @keyframes glow {
    to {
      opacity: 0.55;
    }
  }
</style>
