/**
 * Easter eggs of the TV shoutout banner: some words change how the banner looks.
 * Words are matched case- and accent-insensitive, as whole words. A trailing * matches any ending,
 * and a word starting with / is a raw regular expression (written without accents, in lowercase).
 * A shoutout gets at most one text style, any number of overlays (the first two are kept) and the shout shake.
 */

export type TextFx = 'rainbow' | 'fire' | 'matrix' | 'glitch' | 'spooky' | 'gold' | 'sad' | 'disco' | 'love';
export type OverlayFx =
  | 'confetti'
  | 'bubbles'
  | 'hearts'
  | 'snow'
  | 'matrix'
  | 'spooky'
  | 'fireworks'
  | 'disco'
  | 'coins'
  | 'rain'
  | 'stars'
  | 'embers';

interface Egg {
  id: string;
  words: string[];
  text?: TextFx;
  overlay?: OverlayFx;
}

/** In priority order: the first matching text style wins */
const EGGS: Egg[] = [
  {
    id: 'pride',
    text: 'rainbow',
    words: ['lgbt*', 'gay', 'gays', 'lesbi*', 'queer', 'queers', 'pride', 'trans', 'bisexu*', 'non-binai*', 'non-binar*', 'nonbinai*', 'nonbinar*'],
  },
  {
    id: 'spooky',
    text: 'spooky',
    overlay: 'spooky',
    words: [
      'halloween', 'boo', 'ghost*', 'fantome*', 'spooky', 'scary', 'zombie*', 'vampire*', 'witch*', 'sorciere*',
      'pumpkin*', 'citrouille*', 'monster*', 'monstre*', 'skeleton*', 'squelette*', 'creepy', 'horror', 'horreur', 'trick or treat',
    ],
  },
  {
    id: 'matrix',
    text: 'matrix',
    overlay: 'matrix',
    words: [
      'matrix', 'matrice', 'hacker*', 'hacked', 'hacking', 'neo', 'cyber*', 'mainframe', 'red pill', 'blue pill',
      'pilule rouge', 'pilule bleue', 'terminal', 'sudo', 'pirate informatique',
    ],
  },
  {
    id: 'glitch',
    text: 'glitch',
    words: [
      'glitch*', 'bug', 'bugs', 'buggy', 'beug', 'bogue', 'error', 'erreur', 'crash*', 'lag', 'lagging', 'laggy',
      '404', 'bsod', 'blue screen', 'ecran bleu', 'broken', 'casse', 'cassee',
    ],
  },
  {
    id: 'fire',
    text: 'fire',
    overlay: 'embers',
    words: [
      'fire', 'on fire', "/feu(?!x?\\s+d'?\\s*artifice)", 'en feu', 'hot', 'flame*', 'flamme*', 'burn*', 'brule*', 'caliente', 'fuego',
      'spicy', 'incendie', 'lit af', 'blaze', 'inferno',
    ],
  },
  {
    id: 'gold',
    text: 'gold',
    words: [
      'champion*', 'winner*', 'gagnant*', 'victory', 'victoire', 'gold', 'golden', 'medal*', 'medaille*', 'trophy',
      'trophee', 'goat', 'legend*', 'legende*', 'number one', 'mvp', 'first place', 'king', 'roi', 'reine',
    ],
  },
  {
    id: 'sad',
    text: 'sad',
    overlay: 'rain',
    words: [
      'sad', 'triste', 'cry', 'crying', 'cries', 'pleure*', 'pleurer', 'rainy', 'raining', 'pluie', 'il pleut', 'snif', 'sniff',
      'depressed', 'deprime*', 'tears', 'larme*', ':(', ":'(",
    ],
  },
  {
    id: 'disco',
    text: 'disco',
    overlay: 'disco',
    words: [
      'disco', 'dance', 'dancing', 'danse', 'danser', 'dansez', 'dancefloor', 'piste de danse', 'boogie', 'groove*',
      'funky', 'ymca', 'saturday night', 'macarena',
    ],
  },
  {
    id: 'love',
    text: 'love',
    overlay: 'hearts',
    words: [
      'love', 'i love you', 'luv', "je t'aime", 'je t aime', 'jtm', 'amour', 'bisou*', 'kiss*', 'xoxo', 'darling',
      'cheri', 'cherie', 'mon coeur', 'coeur', 'heart*', 'crush', '<3', 'sweetheart', 'valentin*',
    ],
  },
  {
    id: 'birthday',
    overlay: 'confetti',
    words: [
      'birthday', 'happy birthday', 'bday', 'b-day', 'hbd', 'anniversaire', 'anniv', 'joyeux anniversaire',
      'bon anniversaire', 'bon anniv', 'cumpleanos', 'cake', 'gateau', 'bougies', 'candles',
    ],
  },
  {
    id: 'cheers',
    overlay: 'bubbles',
    words: [
      'cheers', 'sante', 'a la tienne', 'a la votre', 'tchin', 'tchin tchin', 'chin chin', 'cin cin', 'skol', 'skal',
      'prost', 'salud', 'champagne', 'champ', 'bubbly', 'apero', 'prosecco', 'toast',
    ],
  },
  {
    id: 'snow',
    overlay: 'snow',
    words: [
      'christmas', 'xmas', 'merry christmas', 'noel', 'joyeux noel', 'snow*', 'neige*', 'santa', 'pere noel', 'flocon*',
      'winter', 'hiver', 'ski', 'skiing', 'frozen', 'bonhomme de neige', 'sapin', 'reindeer', 'renne*',
    ],
  },
  {
    id: 'newyear',
    overlay: 'fireworks',
    words: [
      'happy new year', 'new year', 'nouvel an', 'bonne annee', 'nye', 'countdown', 'minuit', 'midnight',
      'firework*', "feu d'artifice", "feux d'artifice", 'feu d artifice', 'feux d artifice', 'reveillon', 'saint-sylvestre',
    ],
  },
  {
    id: 'money',
    overlay: 'coins',
    words: [
      'money', 'cash', 'rich', 'riche', 'riches', 'argent', 'fric', 'thune*', 'dollar*', 'euro', 'euros', 'francs',
      'millionaire*', 'milliardaire*', 'billionaire*', 'jackpot', 'bling', 'pognon', 'moula', 'make it rain',
    ],
  },
  {
    id: 'space',
    overlay: 'stars',
    words: [
      'space', 'espace', 'rocket*', 'fusee*', 'moon', 'lune', 'to the moon', 'galaxy', 'galaxie', 'star wars', 'stars',
      'etoile*', 'alien*', 'astronaut*', 'nasa', 'ufo', 'ovni', 'cosmos', 'warp',
    ],
  },
];

export interface EggFx {
  text?: TextFx;
  overlays: OverlayFx[];
  shout: boolean;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`]/g, "'");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPattern = (word: string) => {
  if (word.startsWith('/')) return word.slice(1);
  const any = word.endsWith('*');
  const base = normalize(any ? word.slice(0, -1) : word);
  return escape(base).replace(/ +/g, '\\s+') + (any ? '[\\p{L}\\d]*' : '');
};

const matchers = EGGS.map((egg) => ({
  egg,
  re: new RegExp(`(?<![\\p{L}\\d])(?:${egg.words.map(toPattern).join('|')})(?![\\p{L}\\d])`, 'u'),
}));

/** Shouting: at least 3 letters, and at least 75% of them in capitals */
function isShouting(text: string): boolean {
  const cased = (text.match(/\p{L}/gu) ?? []).filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (cased.length < 3) return false;
  return cased.filter((c) => c === c.toUpperCase()).length / cased.length >= 0.75;
}

export function detectEggs(text: string): EggFx {
  const t = normalize(text);
  const hits = matchers.filter((m) => m.re.test(t)).map((m) => m.egg);
  const overlays = [...new Set(hits.map((e) => e.overlay).filter((o): o is OverlayFx => !!o))].slice(0, 2);
  return { text: hits.find((e) => e.text)?.text, overlays, shout: isShouting(text) };
}

/**
 * Food words: the matching emoji falls from the word in a cascade while the banner scrolls.
 * Typing the emoji itself works too. Words that mean something else too often are left out
 * (French "mais", "the", "pain", "marron", English "date", "mate").
 */
const FOODS: [emoji: string, words: string[]][] = [
  ['🍇', ['grape', 'grapes', 'raisin', 'raisins']],
  ['🍈', ['melon', 'melons']],
  ['🍉', ['watermelon*', 'pasteque*']],
  ['🍊', ['orange', 'oranges', 'tangerine*', 'mandarine*', 'clementine*']],
  ['🍋', ['lemon', 'lemons', 'citron', 'citrons', 'lime', 'limes']],
  ['🍌', ['banana', 'bananas', 'banane', 'bananes']],
  ['🍍', ['pineapple*', 'ananas']],
  ['🥭', ['mango', 'mangos', 'mangoes', 'mangue', 'mangues']],
  ['🍎', ['apple', 'apples', 'pomme', 'pommes']],
  ['🍐', ['pear', 'pears', 'poire', 'poires']],
  ['🍑', ['peach', 'peaches', 'peche', 'peches']],
  ['🍒', ['cherry', 'cherries', 'cerise', 'cerises']],
  ['🍓', ['strawberry', 'strawberries', 'fraise', 'fraises']],
  ['🫐', ['blueberry', 'blueberries', 'myrtille', 'myrtilles']],
  ['🥝', ['kiwi', 'kiwis']],
  ['🍅', ['tomato', 'tomatoes', 'tomate', 'tomates']],
  ['🫒', ['olive', 'olives']],
  ['🥥', ['coconut*', 'noix de coco']],
  ['🥑', ['avocado*', 'avocat', 'avocats', 'guacamole']],
  ['🍆', ['eggplant*', 'aubergine*']],
  ['🥔', ['potato', 'potatoes', 'pomme de terre', 'pommes de terre', 'patate', 'patates']],
  ['🍠', ['sweet potato', 'sweet potatoes', 'patate douce', 'patates douces']],
  ['🥕', ['carrot', 'carrots', 'carotte', 'carottes']],
  ['🌽', ['corn', 'corn on the cob', 'epi de mais']],
  ['🌶', ['chili', 'chilli', 'chilis', 'piment', 'piments', 'jalapeno*']],
  ['🫑', ['bell pepper*', 'poivron', 'poivrons']],
  ['🥒', ['cucumber*', 'concombre*', 'cornichon*', 'pickle', 'pickles']],
  ['🥬', ['lettuce', 'laitue', 'cabbage', 'chou', 'choux', 'kale', 'spinach', 'epinard*']],
  ['🥦', ['broccoli', 'brocoli', 'brocolis']],
  ['🧄', ['garlic', 'ail']],
  ['🧅', ['onion', 'onions', 'oignon', 'oignons']],
  ['🍄', ['mushroom*', 'champignon*']],
  ['🥜', ['peanut*', 'cacahuete*', 'cacahouete*']],
  ['🫘', ['beans', 'haricot*']],
  ['🌰', ['chestnut*', 'chataigne*']],
  ['🍞', ['bread', 'toast', 'brioche*']],
  ['🥐', ['croissant*']],
  ['🥖', ['baguette*']],
  ['🥨', ['pretzel*', 'bretzel*']],
  ['🥯', ['bagel', 'bagels']],
  ['🥞', ['pancake*', 'crepe', 'crepes']],
  ['🧇', ['waffle*', 'gaufre*']],
  ['🧀', ['cheese', 'fromage*', 'raclette', 'cheddar', 'gruyere', 'emmental', 'camembert', 'mozzarella', 'parmesan']],
  ['🫕', ['fondue']],
  ['🍖', ['meat', 'viande*', 'bbq', 'barbecue', 'ribs', 'grillade*']],
  ['🍗', ['chicken*', 'poulet*', 'nuggets', 'wings']],
  ['🥩', ['steak*', 'beef', 'boeuf', 'entrecote*']],
  ['🥓', ['bacon', 'lardon*', 'jambon*', 'ham']],
  ['🍔', ['burger*', 'hamburger*', 'cheeseburger*', 'big mac', 'mcdo', 'mcdonald*']],
  ['🍟', ['fries', 'french fries', 'frite', 'frites', 'chips']],
  ['🍕', ['pizza*']],
  ['🌭', ['hot dog', 'hot dogs', 'hotdog*', 'saucisse*', 'sausage*']],
  ['🥪', ['sandwich*']],
  ['🌮', ['taco', 'tacos']],
  ['🌯', ['burrito*', 'wrap', 'wraps']],
  ['🥙', ['kebab*', 'kebap*', 'doner', 'shawarma', 'gyros']],
  ['🧆', ['falafel*']],
  ['🥚', ['egg', 'eggs', 'oeuf', 'oeufs', 'œuf', 'œufs']],
  ['🍳', ['omelette*', 'omelet']],
  ['🥘', ['paella']],
  ['🍲', ['soup', 'soupe*', 'stew', 'potage', 'ragout']],
  ['🥣', ['cereal*', 'cereale*', 'porridge', 'muesli']],
  ['🥗', ['salad', 'salads', 'salade', 'salades']],
  ['🍿', ['popcorn', 'pop corn', 'pop-corn']],
  ['🧈', ['butter', 'beurre']],
  ['🧂', ['salt', 'sel']],
  ['🍱', ['bento*']],
  ['🍙', ['onigiri']],
  ['🍚', ['rice', 'riz', 'risotto']],
  ['🍛', ['curry']],
  ['🍜', ['ramen', 'noodle*', 'nouille*', 'pho']],
  ['🍝', ['pasta', 'pates', 'spaghetti*', 'lasagne*', 'lasagna', 'carbonara', 'bolognese', 'bolognaise']],
  ['🍣', ['sushi*', 'sashimi', 'maki', 'makis']],
  ['🍤', ['tempura']],
  ['🥟', ['dumpling*', 'gyoza*', 'ravioli*']],
  ['🥠', ['fortune cookie*']],
  ['🍡', ['dango']],
  ['🦀', ['crab', 'crabs', 'crabe', 'crabes']],
  ['🦞', ['lobster*', 'homard*']],
  ['🦐', ['shrimp*', 'prawn*', 'crevette*']],
  ['🦑', ['squid', 'calamar*']],
  ['🦪', ['oyster*', 'huitre*']],
  ['🐟', ['fish', 'poisson*', 'salmon', 'saumon', 'tuna', 'thon']],
  ['🍦', ['ice cream', 'ice-cream', 'glace', 'glaces']],
  ['🍨', ['sorbet*', 'gelato']],
  ['🍩', ['donut*', 'doughnut*', 'beignet*']],
  ['🍪', ['cookie', 'cookies', 'biscuit*']],
  ['🎂', ['cake', 'cakes', 'gateau', 'gateaux']],
  ['🍰', ['cheesecake*', 'tiramisu']],
  ['🧁', ['cupcake*', 'muffin*']],
  ['🥧', ['pie', 'pies', 'tarte', 'tartes']],
  ['🍫', ['chocolate*', 'chocolat*', 'nutella']],
  ['🍬', ['candy', 'candies', 'bonbon*', 'sweets']],
  ['🍭', ['lollipop*', 'sucette*']],
  ['🍮', ['flan', 'pudding', 'creme brulee']],
  ['🍯', ['honey', 'miel']],
  ['🥛', ['milk', 'lait']],
  ['☕', ['coffee', 'cafe', 'cafes', 'espresso*', 'cappuccino*', 'latte']],
  ['🍵', ['tea', 'matcha']],
  ['🧃', ['juice', 'jus']],
  ['🥤', ['soda', 'sodas', 'coca', 'coke', 'pepsi', 'milkshake*']],
  ['🧋', ['bubble tea', 'boba']],
  ['🍶', ['sake']],
  ['🍺', ['beer', 'beers', 'biere', 'bieres', 'binch']],
  ['🍾', ['champagne', 'prosecco']],
  ['🍷', ['wine', 'vin', 'vins', 'pinard']],
  ['🥃', ['whisky', 'whiskey', 'rhum', 'rum', 'cognac']],
  ['🍸', ['cocktail*', 'martini', 'gin']],
  ['🍹', ['mojito*', 'margarita*', 'pina colada', 'spritz']],
  ['🧊', ['ice cube*', 'glacon*']],
];

export interface FoodSpan {
  start: number;
  end: number;
  emoji: string;
}

/** The emoji itself is a trigger too */
const foodEntries = FOODS.flatMap(([emoji, words]) =>
  [...words.map(toPattern), escape(emoji)].map((pattern) => ({ emoji, pattern, re: new RegExp(`^(?:${pattern})$`, 'u') })),
);
/** Longest first, so "pomme de terre" wins over "pomme" */
const foodRe = new RegExp(
  `(?<![\\p{L}\\d])(?:${foodEntries
    .map((e) => e.pattern)
    .sort((a, b) => b.length - a.length)
    .join('|')})(?![\\p{L}\\d])`,
  'gu',
);

/** The food words of a text, as ranges of the original text (accents and emoji variation selectors are ignored) */
export function detectFood(text: string, max = 6): FoodSpan[] {
  let norm = '';
  /** Index in the original text of each character of the normalized one */
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = ch === '️' ? '' : normalize(ch);
    for (let k = 0; k < n.length; k++) at.push(i);
    norm += n;
    i += ch.length;
  }
  at.push(i);
  const spans: FoodSpan[] = [];
  for (const m of norm.matchAll(foodRe)) {
    const entry = foodEntries.find((e) => e.re.test(m[0]));
    if (!entry) continue;
    spans.push({ start: at[m.index], end: at[m.index + m[0].length], emoji: entry.emoji });
    if (spans.length >= max) break;
  }
  return spans;
}
