export interface Photo {
  id: string;
  url: string;
  caption: string;
  guest: { name: string; color: string };
  at: number;
}

export interface PhotosState {
  current: (Photo & { until: number }) | null;
  queued: number;
  /** The next photos (up to 3), for the pile on the TV */
  upcoming: Photo[];
  displaySec: number;
  /** 0 = no limit */
  maxQueue: number;
  /** Admin only */
  queue?: Photo[];
  gallery?: Photo[];
}
