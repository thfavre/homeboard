/**
 * Opens a feature's panel on the phone from anywhere (a button in another feature's panel): the
 * guest app tells how when it starts
 */
let opener: ((id: string) => void) | null = null;

export function setFeatureOpener(fn: (id: string) => void): void {
  opener = fn;
}

export function openFeature(id: string): void {
  opener?.(id);
}
