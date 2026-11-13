/**
 * The TV's full screen view: the main widget alone on the whole screen, without the name and clock
 * at the top, the side cards and the footer. A main widget turns it on with its own button (the
 * town), and it ends when that widget goes, when the browser leaves full screen (Escape) or when
 * the button is pressed again.
 */
export const tvFull = $state({ on: false });

/** Whether this page asked the browser for full screen (and so leaves it again) */
let asked = false;

export function enterFull(): void {
  tvFull.on = true;
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  asked = true;
  document.documentElement.requestFullscreen().catch(() => (asked = false));
}

export function leaveFull(): void {
  tvFull.on = false;
  if (asked && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  asked = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    // Left with Escape (or the browser's own way out): the TV's own layout comes back with it
    if (!document.fullscreenElement && asked) {
      asked = false;
      tvFull.on = false;
    }
  });
}
