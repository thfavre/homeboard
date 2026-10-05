/**
 * A form value that follows a server value, except while the user is editing it.
 * Create it during component setup:
 *
 *   const volume = new Synced(() => hb.modules.spotify?.admin?.volume, 50);
 *   <input bind:value={volume.value} onfocus={volume.start} onblur={() => { save(volume.value); volume.end(); }} />
 */
export class Synced<T> {
  value = $state() as T;
  #editing = false;
  #holdUntil = 0;

  constructor(source: () => T | null | undefined, fallback: T) {
    this.value = source() ?? fallback;
    $effect(() => {
      const v = source();
      if (v !== undefined && v !== null && !this.#editing && Date.now() >= this.#holdUntil) this.value = v;
    });
  }

  /** The user started editing: stop following the server */
  start = () => {
    this.#editing = true;
  };

  /** Editing is over. `holdMs` ignores server values for a moment (for slow devices like Spotify). */
  end = (holdMs = 0) => {
    this.#editing = false;
    this.#holdUntil = Date.now() + holdMs;
  };
}
