<script lang="ts">
  /**
   * A pirate galley seen from above, its bow pointing down (the parent turns it to its heading). The hull
   * and sails are Kenney's Pirate Pack sprites (CC0, web/public/pirates); the oars are drawn on the water
   * and make one stroke each time the crew rows. `phase`: where that stroke is (0: blades go in, pulled
   * back until 0.45, then lifted and brought back to rest at 1); null: nobody is rowing, the oars rest.
   * `power`: how hard the stroke is (0 to 1); `messy`: the crew is out of time, so the oars are not
   * together. `speed` (0 to 1) sizes the wake.
   */
  let {
    ship,
    color,
    phase = null,
    power = 0.5,
    messy = false,
    boosted = false,
    speed = 0,
  }: { ship: string; color: string; phase?: number | null; power?: number; messy?: boolean; boosted?: boolean; speed?: number } = $props();

  /** Ships with their own sail in the pack; the others get the plain sail dyed in their color */
  const SPRITES = ['red', 'yellow', 'green', 'white'];
  const sprite = $derived(SPRITES.includes(ship) ? ship : 'white');
  const dyed = $derived(!SPRITES.includes(ship));
  const uid = $props.id();

  /** Where the oars go through the hull (sprite pixels, the sprite is 66 x 113) */
  const PORTS = [38, 50, 62, 74];
  const OAR = 28;
  /** Oars at rest: held a little forward, blades just above the water */
  const REST = { angle: 18, lift: 0.35 };
  /** The sweep of an oar (deg, + toward the bow) and how far its blade is out of the water (0 to 1) */
  function stroke(p: number | null, amp: number): { angle: number; lift: number } {
    if (p === null || p < 0 || p >= 1) return REST;
    const x = p;
    const catchAt = 34 * amp + 6;
    const finishAt = -24 * amp - 4;
    if (x < 0.45) {
      const k = 1 - (1 - x / 0.45) ** 2;
      return { angle: catchAt + (finishAt - catchAt) * k, lift: 0 };
    }
    const k = (x - 0.45) / 0.55;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    return { angle: finishAt + (REST.angle - finishAt) * e, lift: Math.sin(k * Math.PI) * (1 - k) + REST.lift * k };
  }
  const amp = $derived(0.35 + 0.65 * Math.min(1, Math.max(0, power)));
  const MESS = [0, 0.09, -0.07, 0.12];
  const oars = $derived(PORTS.map((y, i) => ({ y, ...stroke(phase === null ? null : phase - (messy ? MESS[i] : 0), amp) })));
  /** The blades just went in: rings on the water */
  const splash = $derived.by(() => {
    if (phase === null) return 0;
    const x = phase;
    return x >= 0 && x < 0.3 ? 1 - x / 0.3 : 0;
  });
  /** The tip of an oar, on the left side (side -1) or the right (1) */
  const tip = (o: { y: number; angle: number }, side: number) => {
    const a = (o.angle * Math.PI) / 180;
    return { x: (side < 0 ? 12 : 54) + side * Math.cos(a) * (OAR - 3), y: o.y + Math.sin(a) * (OAR - 3) };
  };
  /** The wind lines of a boost: across the stern, each with its own sway and start */
  const GUSTS = [
    { x: -4, c: 4, d: 0.3 },
    { x: 12, c: -5, d: 0 },
    { x: 27, c: 5, d: 0.42 },
    { x: 41, c: -5, d: 0.15 },
    { x: 55, c: 5, d: 0.55 },
    { x: 70, c: -4, d: 0.24 },
  ];
  const wake = $derived(Math.min(1, Math.max(0, speed)) * (boosted ? 1.4 : 1));
</script>

<div class="ship" class:boosted style:--team={color} style:--wake={wake}>
  <svg class="water" viewBox="0 0 66 113" aria-hidden="true">
    <defs>
      <linearGradient id="wake-{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2={-20 - 60 * wake}>
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
    </defs>
    <!-- The wake: foam opening behind the stern, fading away -->
    <g class="foam" stroke="url(#wake-{uid})" opacity={0.3 + 0.7 * Math.min(1, wake)}>
      <path d="M16 92 Q4 30 {-6 - 18 * wake} {-20 - 60 * wake}" />
      <path d="M50 92 Q62 30 {72 + 18 * wake} {-20 - 60 * wake}" />
      <path class="trail" d="M26 6 Q33 {-10 - 30 * wake} 40 6" />
    </g>
    <path class="bowwave" d="M18 98 Q33 {118 + 4 * wake} 48 98" opacity={0.35 + 0.5 * wake} />

    {#if splash > 0}
      <g class="rings" opacity={splash}>
        {#each oars as o, i (i)}
          {#each [-1, 1] as side (side)}
            {@const t = tip(o, side)}
            <ellipse cx={t.x} cy={t.y} rx={2 + 5 * (1 - splash)} ry={1.6 + 3.6 * (1 - splash)} />
          {/each}
        {/each}
      </g>
    {/if}

    <!-- The oars, both sides -->
    {#each oars as o, i (i)}
      {#each [-1, 1] as side (side)}
        <g transform="translate({side < 0 ? 12 : 54} {o.y}) rotate({side < 0 ? 180 - o.angle : o.angle})">
          <rect x="0" y="-1.3" width={OAR} height="2.6" rx="1.3" fill="#c9965a" stroke="#5a3415" stroke-width="0.5" />
          <rect x={OAR - 9} y={-3 + o.lift * 1.6} width="10" height={6 - o.lift * 3.2} rx="2" fill={o.lift > 0.2 ? '#dcb07a' : '#a8743c'} stroke="#5a3415" stroke-width="0.5" />
        </g>
      {/each}
    {/each}
  </svg>

  {#if boosted}
    <!-- A boost: gusts of wind blowing from behind, into the sails -->
    <svg class="wind" viewBox="0 0 66 113" aria-hidden="true">
      {#each GUSTS as g, i (i)}
        <path d="M{g.x} 0 q{g.c} -14 0 -28 q{-g.c} -14 0 -28 q{g.c} -12 0 -24" style:animation-delay="{g.d}s" />
      {/each}
    </svg>
  {/if}
  <img class="hull" src="/pirates/ship-{sprite}.png" alt="" draggable="false" />
  {#if dyed}<span class="dye"></span>{/if}
</div>

<style>
  .ship {
    position: relative;
    width: 100%;
    height: 100%;
    animation: roll 2.8s ease-in-out infinite;
  }
  @keyframes roll {
    0%,
    100% {
      transform: rotate(-1.6deg) scale(1);
    }
    50% {
      transform: rotate(1.6deg) scale(1.015);
    }
  }
  .water {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .foam path {
    fill: none;
    stroke-width: calc(3px + var(--wake) * 3px);
    stroke-linecap: round;
    stroke-dasharray: 14 4;
    animation: foam 0.6s linear infinite;
  }
  .foam .trail {
    stroke-width: 4px;
    stroke-dasharray: none;
    animation: none;
  }
  @keyframes foam {
    to {
      stroke-dashoffset: -18;
    }
  }
  .boosted .foam path {
    animation-duration: 0.25s;
  }
  .bowwave {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
  }
  .rings ellipse {
    fill: none;
    stroke: #fff;
    stroke-width: 1.2;
  }
  .hull {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 3px 2px rgb(0 0 0 / 0.35));
    user-select: none;
  }
  .wind {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .wind path {
    fill: none;
    stroke: #fff;
    stroke-width: 3.4;
    stroke-linecap: round;
    stroke-dasharray: 40 100;
    opacity: 0;
    filter: drop-shadow(0 0 2px rgb(255 255 255 / 0.8));
    animation: gust 0.7s linear infinite;
  }
  @keyframes gust {
    0% {
      transform: translateY(-60px);
      stroke-dashoffset: 40;
      opacity: 0;
    }
    25% {
      opacity: 0.95;
    }
    100% {
      transform: translateY(30px);
      stroke-dashoffset: -40;
      opacity: 0;
    }
  }
  /* The plain sail, dyed in the ship's color (its place in the sprite: 0,24 66x47) */
  .dye {
    position: absolute;
    left: 0;
    top: calc(24 / 113 * 100%);
    width: 100%;
    height: calc(47 / 113 * 100%);
    background: var(--team);
    mix-blend-mode: multiply;
    -webkit-mask: url('/pirates/sail-plain.png') 0 0 / 100% 100%;
    mask: url('/pirates/sail-plain.png') 0 0 / 100% 100%;
  }
</style>
