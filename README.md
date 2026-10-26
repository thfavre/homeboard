# Homeboard

A party dashboard for the TV, controlled from phones. Guests scan a QR code, pick a name and a
PIN, and spend a custom currency (earned by hanging out and playing) on songs, stickers, photos,
lights, sounds, quizzes and games. Everything runs on your PC; a free Cloudflare tunnel makes it
reachable from any network.

Ideas and to-dos: [IDEAS.md](IDEAS.md). Working on the code with an AI assistant: [AGENTS.md](AGENTS.md).

## Quick start

Needs Node.js 22.12 or newer.

```bash
npm install
npm run party      # build, start, open the TV page in Chrome kiosk mode
```

The console prints the TV page (`http://localhost:4300/tv`), the admin page
(`http://localhost:4300/admin`) with its password, and the public URL. In the admin, **Access >
Show pairing code** turns your phone into a host remote.

| Command | What it does |
| --- | --- |
| `npm run party` | Build, start and open the TV (sound allowed) |
| `npm run build` then `npm start` | Same without opening the TV |
| `npm run dev` | Server auto reload + Vite on port 5173 |
| `npm run check` | Type check |

Environment: `PORT` (4300), `HB_TUNNEL=0` (no tunnel), `HB_TV_POSITION=1920,0` (kiosk on a
second screen), `HB_BROWSER` (browser path), `HB_DATA_DIR` (another data folder, to run a test
copy without touching the real guests and settings).

## Modules

- **Music**: Spotify queue (Premium; set up in admin **Music**)
- **Pixel canvas**: shared r/place style canvas
- **Stickers**: built-in, text, selfie or guest-made stickers bouncing on the TV
- **Photos**: photo with caption shown big on the TV
- **Lights**: WLED effects and scenes
- **Soundboard**: sounds on the TV speakers, MyInstants search
- **Text-to-Speech**: guests speak text through the TV
- **Quiz**: trivia (Open Trivia DB, The Trivia API), custom and participative quizzes
- **Games**: 1 vs 1 duels with a bet or room games: Blind Timer, Light Simon, Color Reflex,
  Perfect Circle, Bluff, Coin Flip, Rhythm Rain, Pirate Race

Plus: selfie avatars, rotating leaderboards, activity feed, gifts, themes, and an economy editor
for every price and reward. Every module can be turned off and configured in the admin.

Guests rejoin from any phone with the same name and PIN; balances live on the server. For a fixed
address, set up a named Cloudflare tunnel and enter it in admin **Access > Own domain**.

## Architecture

```
server/core/        HTTP + Socket.IO hub, module API, session, economy, settings, tunnel
server/modules/     One folder per feature (register in server/modules/index.ts)
shared/             Types shared by server and web
web/src/            guest/ tv/ admin/ shells, lib/, themes/, modules/<id>/ UI
data/               Runtime data, not in git
```

The server is the single source of truth: each module publishes a state per role (guest, TV,
admin) over Socket.IO, and clients call module methods with `rpc()`.

**New module**: `defineModule({ id, name, settings, setup(ctx) })` in `server/modules/<id>/`,
plus a `ClientModule` (TV slots, guest tile, admin page) in `web/src/modules/<id>/index.ts`;
register both. It gets an on/off switch, its prices in the Economy screen and a guest tile.

**New theme**: copy `web/src/themes/midnight.css`, import it in `web/src/themes/index.ts` and
add it to `shared/themes.ts`.

## License

MIT, see [LICENSE](LICENSE).
