import type { SheetInfo } from '$shared/world.ts';

/** Where the avatar preview zooms */
export type Focus = 'head' | 'torso' | 'legs' | 'feet' | null;

/**
 * What the one avatar preview of the panel shows. My look, the wardrobe and the shop share the
 * preview so it stays put when switching tabs: each tab only writes what to draw and where to zoom.
 */
export interface PreviewView {
  url: string | null;
  sheet: SheetInfo | null;
  building: boolean;
  focus: Focus;
  facing: 'down' | 'up';
}
