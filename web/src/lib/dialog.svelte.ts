/**
 * In-app dialogs (never the browser's confirm/alert/prompt).
 * Render <DialogHost /> once per app, then `await ask(...)` or `await choose(...)` anywhere.
 */

export interface DialogOption<T = string> {
  label: string;
  value: T;
  kind?: 'primary' | 'danger' | 'default';
}

interface OpenDialog {
  title: string;
  message?: string;
  options: DialogOption<unknown>[];
  cancelLabel: string;
  resolve: (value: unknown) => void;
}

export const dialog = $state({ current: null as OpenDialog | null });

/** Several choices. Resolves with the chosen value, or null when cancelled. */
export function choose<T>(opts: { title: string; message?: string; options: DialogOption<T>[]; cancelLabel?: string }): Promise<T | null> {
  dialog.current?.resolve(null);
  return new Promise((resolve) => {
    dialog.current = {
      title: opts.title,
      message: opts.message,
      options: opts.options as DialogOption<unknown>[],
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      resolve: (v) => {
        dialog.current = null;
        resolve(v as T | null);
      },
    };
  });
}

/** Yes / no confirmation */
export async function ask(opts: { title: string; message?: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  const r = await choose({
    title: opts.title,
    message: opts.message,
    options: [{ label: opts.confirm ?? 'Confirm', value: true, kind: opts.danger ? 'danger' : 'primary' }],
  });
  return r === true;
}
