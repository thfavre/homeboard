# Notes for AI assistants

Read [README.md](README.md) first (what Homeboard is, commands, architecture). This file adds
what you need to change the code safely.

## Stack

Node.js 22.12+, TypeScript run directly by `tsx` (the server has no build step), Svelte 5 with
runes, Vite, Express and Socket.IO. `npm run check` type checks everything; run it after changes.

## Where things are

- One feature = one module: `server/modules/<id>/` + `web/src/modules/<id>/`, registered in
  both `index.ts` files. Shared types go in `shared/<id>.ts`. Copy an existing module.
- The server owns all state. Modules publish a state per role (guest, TV, admin) with
  `ctx.state()`; clients call `rpc(module, method, args)` (`web/src/lib/client.svelte.ts`).
- Prices and rewards are declared with `ctx.price()` and `ctx.earn()` so they show in the admin's
  Economy editor. Never hardcode an amount.
- Settings are declared in `defineModule({ settings })` and saved in `data/settings.json`.
  Saved values override the defaults, so changing a default only affects new installs.
- `data/` is runtime data (settings, session, uploads), not in git.

## Rules

- Everything in English: code, comments, UI text, docs.
- No emoji in the UI; use icons from `@lucide/svelte` or drawn SVG.
- No browser pop-ups: no `alert`, `confirm` or `prompt` (use `web/src/lib/dialog.svelte.ts` or
  `TwoStepButton`), and forms use `novalidate` with in-app error text.
- Every option is controllable from the admin page. A module's Settings section goes near the
  top of its admin page, never at the bottom.
- Keep the look polished and use the theme CSS variables (`web/src/themes/`), not fixed colors.
- Match the surrounding code: comment density, naming, plain sentences in comments.

## Testing without breaking a party

The owner may have a live party running on port 4300 using the real `data/` folder, with the TV
and phones connected. So:

- Never call admin actions (new session, kick, new code...) on port 4300.
- Never run `npm run build` in the main folder while it runs: the server serves `dist/web`, and
  every screen reloads itself when the build changes. Build in a copy (git worktree) instead.
- Run a test copy on a free port with its own data folder:

  ```bash
  PORT=4395 HB_DATA_DIR=/tmp/hb-test HB_TUNNEL=0 npx tsx server/index.ts
  ```

  Check the port is free first. A fresh data folder has no WLED lights, so tests never drive the
  real lights. Drive it with `socket.io-client` (auth `{ role: 'admin' }` works from localhost,
  guests join with `rpc('core', 'join', { code, name, pin })`).

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4300` | Server port (the Vite dev proxy follows it) |
| `HB_DATA_DIR` | `./data` | Data folder. Point it somewhere else to run a test copy that cannot touch the real guests, balances and settings |
| `HB_TUNNEL` | on | `0`: no Cloudflare tunnel (local network only) |
| `HB_TV_POSITION` | none | `x,y` of the kiosk TV window, e.g. `1920,0` for a second screen |
| `HB_BROWSER` | auto | Browser used for the kiosk TV window |
| `HB_TUNNEL_TARGET` | the server, or Vite in dev | Where the tunnel forwards to |
| `HB_SPOTIFY_API`, `HB_SPOTIFY_ACCOUNTS` | Spotify | Point the Spotify module at a fake server in tests |
| `HB_SUPERVISED` | unset | Set by `npm run party` (`server/run.ts`); enables the restart from the TV's hidden menu. Do not set it yourself |
