import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { debounce, log } from './util.ts';

/** A JSON document kept in memory and written to disk shortly after each change */
export class JsonFile<T> {
  data: T;
  private scheduleSave: () => void;

  constructor(
    private path: string,
    initial: T,
  ) {
    this.data = initial;
    if (existsSync(path)) {
      try {
        this.data = JSON.parse(readFileSync(path, 'utf8'));
      } catch (err) {
        log.warn('store', `Could not read ${path}, starting fresh`, err);
      }
    }
    this.scheduleSave = debounce(() => this.saveNow(), 500);
  }

  save(): void {
    this.scheduleSave();
  }

  saveNow(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
