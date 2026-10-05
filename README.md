# Homeboard

A party dashboard for the TV, controlled from phones. Guests scan a QR code, enter a name and
can then queue songs, paint on a shared pixel canvas, send bouncing stickers and photos, trigger
WLED light effects, play sounds and take part in quizzes. Every action can cost a custom
currency that guests earn by hanging out and playing.

Everything runs on your PC. A free Cloudflare quick tunnel makes it reachable from any network
(guests do not need your Wi-Fi), so there is no hosting to pay for.

## Quick start

```bash
npm install
npm run party      # build, start the server and open the TV page full screen
```

The console prints:

- **TV**: `http://localhost:4300/tv` (the PC connected to the TV)
- **Admin**: `http://localhost:4300/admin` and the admin password
- **Public URL**: `https://<random>.trycloudflare.com` (changes every start, the QR code follows)

Open the admin on the PC, go to **Access** and scan **Show pairing code** with your phone: your
phone becomes a host remote. Guests just scan the QR code on the TV.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run party` | Build and start, open the TV in Chrome kiosk mode (sound allowed) |
| `npm run build` then `npm start` | Same without opening the TV window |
| `npm run dev` | Development: server with auto reload + Vite hot reload on port 5173 |
| `npm run check` | Type check everything |

Environment variables: `PORT` (default 4300), `HB_TUNNEL=0` (no public tunnel),
`HB_TV_POSITION=1920,0` (open the kiosk window on a second screen), `HB_BROWSER` (browser path).

## Features

| Module | Guests | Host |
| --- | --- | --- |
| **Music** (Spotify) | Search and queue songs, skip | Connect account, playback controls, explicit filter |
| **Pixel canvas** | Paint pixel by pixel (r/place style) | Clear, resize |
| **Stickers** | Built-in vector stickers or text, bouncing for X minutes | Duration, limit, upload your own |
| **Photos** | Photo with caption shown big on the TV | Remove (with refund), replay, duration |
| **Lights** (WLED) | Pick an effect, on all lights or one | Devices, effect editor, test, stop |
| **Soundboard** | Play a sound on the TV speakers | Volume, cooldown, upload sounds |
| **Quiz** | Answer on the phone | Start (category, difficulty, length), skip, stop |

Core features: session code, name + PIN to rejoin from another phone, live activity feed, leaderboard,
money rain, gifts, kick, themes, and a full economy editor (currency name, every price and reward).

### How guests are recognized

When joining, each guest picks a name and a 4-digit PIN (they are told not to reuse a real PIN).
The phone then remembers them: closing the page or the browser is fine. On another phone or
browser, they enter the **same name and PIN** to get their account back. Guests can see their PIN
(blurred until they tap the eye) in their profile; it is never sent to the TV or the host screen,
and 5 wrong PINs lock that name for 5 minutes. Guests can change their PIN in their profile, and
the host can set a new one from the Guests screen if someone forgets it.

Because the free tunnel URL changes when the server restarts, phones forget the account after a
restart. Balances are kept on the server, so guests just join again with their name and PIN.

### Spotify setup (one time)

Needs Spotify Premium. In the admin, open **Music** and follow the steps: create an app on the
Spotify developer dashboard, add the Redirect URI shown (`http://127.0.0.1:4300/api/m/spotify/callback`),
paste the Client ID, then click **Connect Spotify** on the PC. Start playing music on any
device (PC app, phone, speaker): guests can then add songs.

### Sound

Sounds play in the TV browser window, so the PC must output its audio to the TV. `npm run party`
opens Chrome with autoplay allowed. If you open the TV page yourself, click once on it to
enable sound.

## Architecture

```
server/
  index.ts              Entry point
  core/
    hub.ts              HTTP + Socket.IO server, auth, module wiring, state publishing
    module.ts           Module API (defineModule, ModuleContext)
    session.ts          Guests, balances, ledger (reset by "New session")
    economy.ts          Prices, earning rules, charge / refund / reward
    settings.ts         Persistent settings per module (data/settings.json)
    tunnel.ts           Cloudflare quick tunnel
  modules/<id>/index.ts One folder per feature
shared/                 Types and constants used by server and web
web/
  index.html tv.html admin.html
  src/
    lib/                Client store (client.svelte.ts), UI components, styles
    themes/             One CSS file per theme
    guest/ tv/ admin/   The three apps (shells only)
    modules/<id>/       UI of each module + index.ts declaring where it plugs in
data/                   Runtime data (settings, session, uploads), not in git
```

The server is the single source of truth. Each module publishes a state per role (guest, TV,
admin) that is pushed to clients over Socket.IO; clients call module methods with `rpc()`.

### Adding a module

1. **Server**: `server/modules/<id>/index.ts`

   ```ts
   export default defineModule({
     id: 'confetti',
     name: 'Confetti',
     description: 'Guests throw confetti on the TV',
     settings: { amount: 200 },
     setup(ctx) {
       ctx.price({ key: 'confetti.throw', label: 'Throw confetti', default: 300 });
       ctx.onGuest('throw', (_args, guest) => {
         ctx.economy.charge(guest, 'confetti.throw');
         ctx.emit('tv', 'burst', { by: guest.name, amount: ctx.settings.get().amount });
         ctx.activity(`${guest.name} threw confetti`, { guest });
         return true;
       });
     },
   });
   ```

   Register it in `server/modules/index.ts`.

2. **Web**: `web/src/modules/<id>/index.ts`

   ```ts
   export default {
     id: 'confetti',
     tv: [{ slot: 'overlay', order: 50, component: ConfettiTv }],
     guest: { title: 'Confetti', tagline: 'Make it rain paper', icon: PartyPopper, order: 80, component: ConfettiGuest, priceKey: 'confetti.throw' },
     admin: { title: 'Confetti', icon: PartyPopper, order: 80, component: ConfettiAdmin },
   } satisfies ClientModule;
   ```

   Register it in `web/src/modules/index.ts`. The module automatically gets an on/off switch,
   its prices appear in the Economy screen, and its tile appears on guest phones.

TV slots: `main` (big area, first visible wins), `side` (right column), `footer`, `overlay`
(full screen layer). Games use `tvTakeover` / `guestTakeover` with `ctx.takeover.start()`.

### Adding a theme

Create `web/src/themes/<id>.css` defining the CSS variables (copy `midnight.css`), import it
in `web/src/themes/index.ts` and add it to `shared/themes.ts`.
