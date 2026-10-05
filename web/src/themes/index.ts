// Every theme file is loaded; the active one is chosen with <html data-theme="...">.
// To add a theme: create <id>.css here, import it below, and add it to shared/themes.ts.
import './midnight.css';
import './aurora.css';
import './paper.css';

export function applyTheme(id: string | undefined): void {
  if (id) document.documentElement.dataset.theme = id;
}
