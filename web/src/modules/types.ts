import type { Component } from 'svelte';

/** above: small widgets over the main widget (it keeps the rest of the space) */
export type TvSlot = 'main' | 'above' | 'side' | 'footer' | 'overlay';

export interface TvWidget {
  slot: TvSlot;
  /** Lower comes first. In the main slot only the first visible widget is shown. */
  order: number;
  component: Component;
  /** Extra visibility condition (the module must also be enabled) */
  visible?: () => boolean;
  /**
   * Side slot: widgets with the same spot take turns in one place (the first visible one by order
   * shows, with a fade between them). Lets a module stand in for another one's card for a while.
   */
  spot?: string;
}

export interface GuestFeature {
  title: string;
  tagline: string;
  icon: Component<any>;
  order: number;
  component: Component;
  /** Price key shown on the home tile */
  priceKey?: string;
}

/** Groups of the admin side menu, for the features: play, sound, and what shows on the TV or the lights */
export type AdminGroup = 'play' | 'sound' | 'screen';

export interface AdminSection {
  title: string;
  icon: Component<any>;
  /** Place in its group of the side menu (lower first) */
  order: number;
  /** Group of the side menu it is listed in */
  group: AdminGroup;
  /** More words the menu search finds it by (its title always counts) */
  keywords?: string;
  component: Component;
  /** Extra lines at the end of the module's "Prices and rewards" section, at the top of its page */
  prices?: Component;
}

/**
 * The client half of a module. Every part is optional: a module can have only a TV
 * widget, only an admin screen, etc.
 */
export interface ClientModule {
  id: string;
  tv?: TvWidget[];
  /** Full screen on the TV while the module holds the takeover (games) */
  tvTakeover?: Component;
  /** Full screen on guest phones while the module holds the takeover */
  guestTakeover?: Component;
  /**
   * Decide whether the phone shows guestTakeover, given whether the server takeover is live.
   * Lets a module keep its screen after it ended (results) or let the guest close it early.
   * Default: shown exactly while the takeover is live.
   */
  showGuestTakeover?: (live: boolean) => boolean;
  /** Small card on the guest home screen */
  guestHome?: { order: number; component: Component };
  /** Tile on the guest home screen that opens a full panel */
  guest?: GuestFeature;
  admin?: AdminSection;
}
