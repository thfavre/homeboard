# Homeboard

A party dashboard for the TV, controlled from phones. Guests scan a QR code, pick a name and a
PIN, and spend a custom currency (earned by hanging out and playing) on songs, stickers, photos,
lights, sounds, quizzes and games. Everything runs on your PC; a free Cloudflare tunnel makes it
reachable from any network.

Ideas and to-dos: [IDEAS.md](IDEAS.md). Working on the code with an AI assistant: [AGENTS.md](AGENTS.md).

<img width="1250" height="700" alt="image" src="https://github.com/user-attachments/assets/801fe5b3-47ab-4fcc-899f-b26dc2e9794c" />


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

Settings for this PC go in a `.env` file (copy `.env.example`, not in git): `PORT` (4300),
`HB_DOMAIN` and `HB_TUNNEL_NAME` (own domain), `HB_TUNNEL=0` (no tunnel), `HB_TV_POSITION=1920,0`
(kiosk on a second screen), `HB_BROWSER` (browser path), `HB_DATA_DIR` (another data folder, to
run a test copy without touching the real guests and settings).

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
  Perfect Circle, Bluff, Coin Flip, Rhythm Rain, Pirate Race, Crowd Race and Spy Hunt (hide in a
  crowd on the TV, snipe from the phones). Their characters are LPC sprites, built by
  `scripts/crowd-sprites.ts`, and their streets and square are LPC style environment art; credits in
  `web/public/crowd/CREDITS.txt` and `web/public/crowd/env/CREDITS.txt`.
  Plus **Wall Rush** (solo): the player's phone films them and streams to the TV over the Wi-Fi
  (WebRTC), the TV tracks the body with MediaPipe on the TV computer's graphics card, and the player
  takes the pose of the hole in each neon wall rushing at them. Its body tracking (15 to 40 MB) is an
  optional add-on downloaded from the admin (**Games > Wall Rush**), never shipped with Homeboard, so
  a Raspberry Pi install never needs it. Code in `server/modules/games/wallrush/` and
  `web/src/modules/games/wallrush/`
- **Arcade**: 1 vs 1 phone games with a bet: 1, 3 or 5 games drawn at random among Knife Throw,
  Tower Stack, Flap, Zig, Plank, Street Dash, Pop Up, Quick Maths and Slicer, each revealed when its
  round starts. Both players get the same run (same seed), played on their own phone with no lag and
  started together by the server, in pixel art with their own town character; each sees the other's
  ghost as they play (relayed by the server), with lives, combos and a fever bar that doubles points.
  The players' characters walk into the town's arcade, whose marquee shows the race. Games are
  Phaser 4 scenes on `ArcadeScene` (`web/src/modules/arcade/engine/base.ts`, one file each in
  `games/`), sounds made by ZzFX. `scripts/arcade-bot.ts` is a fake opponent for trying them on a
  test copy

Plus: selfie avatars, rotating leaderboards, activity feed, gifts, themes, and an economy editor
for every price and reward. Every module can be turned off and configured in the admin.

Guests rejoin from any phone with the same name and PIN; balances live on the server. For a fixed
address, create a named Cloudflare tunnel once (`cloudflared tunnel login`, `tunnel create
homeboard`, `tunnel route dns homeboard example.com`), then set `HB_DOMAIN` in `.env` or enter it in
admin **Access > Own domain**.

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
