import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { JsonFile } from './jsonFile.ts';
import { DATA_DIR } from './paths.ts';
import { deepMerge } from './util.ts';

/**
 * Persistent settings, split in namespaces (one per module).
 * Survive restarts and session resets.
 */
export class Settings extends EventEmitter {
  private file = new JsonFile<Record<string, unknown>>(join(DATA_DIR, 'settings.json'), {});
  private values = new Map<string, unknown>();

  register<T extends object>(ns: string, defaults: T): T {
    const merged = deepMerge(defaults, this.file.data[ns]);
    this.values.set(ns, merged);
    return merged;
  }

  get<T>(ns: string): T {
    const v = this.values.get(ns);
    if (v === undefined) throw new Error(`Settings namespace "${ns}" not registered`);
    return v as T;
  }

  update<T extends object>(ns: string, patch: Partial<T>): T {
    const next = { ...this.get<T>(ns), ...patch };
    this.values.set(ns, next);
    this.file.data[ns] = next;
    this.file.save();
    this.emit('change', ns);
    return next;
  }

  flush(): void {
    this.file.saveNow();
  }
}
