/**
 * Sprites cut out of the LPC sheets in web/public/arcade (see its CREDITS.txt): crates and barrels
 * from [LPC] Containers, fruit from [LPC] Food, the cat from [LPC] Cats and Dogs. The sheets load with the run; each sprite becomes a
 * texture of its own named `lpc-<name>` (ArcadeScene.create), in the sheets' pixels.
 */

const SHEETS = {
  containers: '/arcade/lpc-containers.png',
  food: '/arcade/lpc-fruits-veggies.png',
  cat: '/arcade/lpc-cat.png',
} as const;
export type LpcSheet = keyof typeof SHEETS;
export type LpcImages = Record<LpcSheet, HTMLImageElement>;

/** Each sprite: its sheet and its box there (x, y, w, h) */
export const LPC_FRAMES = {
  // Crates and barrels, seen like the town (from the front and a little above)
  crate: ['containers', 193, 496, 32, 40],
  crateCorner: ['containers', 458, 691, 38, 44],
  barrel: ['containers', 3, 7, 28, 38],
  barrelBanded: ['containers', 33, 85, 31, 43],
  crateStack: ['containers', 0, 551, 63, 55],
  // Fruit, one of each
  apple: ['food', 9, 969, 13, 15],
  greenApple: ['food', 40, 967, 13, 15],
  yellowApple: ['food', 73, 967, 13, 15],
  goldApple: ['food', 105, 967, 13, 15],
  peach: ['food', 329, 973, 13, 14],
  orange: ['food', 455, 973, 15, 14],
  lemon: ['food', 550, 969, 14, 11],
  watermelon: ['food', 706, 8, 28, 18],
  // The ginger cat, facing us
  cat: ['cat', 138, 68, 13, 25],
} as const satisfies Record<string, readonly [LpcSheet, number, number, number, number]>;
export type LpcFrame = keyof typeof LPC_FRAMES;

function load(src: string, ms = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error(`${src} did not load`)), ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`${src} did not load`));
    };
    img.src = src;
  });
}

/** Both sheets, loaded */
export async function loadLpc(): Promise<LpcImages> {
  const [containers, food, cat] = await Promise.all([load(SHEETS.containers), load(SHEETS.food), load(SHEETS.cat)]);
  return { containers, food, cat };
}
