import type { Component } from 'svelte';

export type TvSlot = 'main' | 'side' | 'footer' | 'overlay';

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

export interface AdminSection {
  title: string;
  icon: Component<any>;
  order: number;
  component: Component;
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
