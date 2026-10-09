# Homeboard

A party dashboard for the TV, controlled from phones. Guests scan a QR code, enter a name and
can then queue songs, paint on a shared pixel canvas, send bouncing stickers and photos, trigger
WLED light effects, play sounds and take part in quizzes. Every action can cost a custom
currency that guests earn by hanging out and playing.

Everything runs on your PC. A free Cloudflare quick tunnel makes it reachable from any network
(guests do not need your Wi-Fi), so there is no hosting to pay for.

# Future ideas
- [ ] screamer
- [ ] blind test
- [ ] playing gifs
- [ ] spin the wheel
- [ ] Sync Selfie: Take a selfie on the same signal as everyone else, then see the mosaic of all the faces on the TV.
- [x] Custom stickers (like the same as the one on that the user creted for whatsapp, or he can create one from a photo, or from a drawing)
- [ ] Add something that cost a lot, like 1000, and advertise it as a big thing, but it will just like stop the lights, and do a fart sound, or something like that. (like a joke for the rich people)
- [x] ! Make the leaderboard more divers. Like sometimes it changes to the leaderboardt of the most pixels draw in the canas, or more stickers sent, most games done,... (with a smooth transtition, and not just a hard change) (and also when a song has been played on guitar hero by more than 5 players (in 1vs1 save both player score of course, with the same difficulty / numbers of colors), allow it to show on the leaderboard with the score (show the cover and song name))

-- games ---
- [x] 1vs1 someone on the TV (like a game show (and put some coins?))
- [ ] gift for a condition? Like we can see somewhere that doing X gives a gift.
- [ ] slot machine, it shows on a corner of the TV
- [x] Blind Timer: Stop the timer as close as possible to 10.00 seconds without seeing it run.
- [x] Light Simon: Repeat the color sequence shown by the WLED lights, which grows longer each round until someone slips up.
- [x] Color Reflex: Tap the button matching the color the lights turn, faster than your opponent.
- [x] Bluff: Secretly choose to share or steal the pot, hoping to guess what the other player will do.
- [x] Coin Flip: each player's face is on one side of the coin, one of them throws it to the TV, the face it lands on takes the pot.
- [ ] Blind Drawing: Draw the given word on a black screen, then discover the result in full on the TV.
- [ ] From Memory: Study an image for 5 seconds, redraw it, then compare your drawing to the original on the TV.
- [x] Perfect Circle: Draw the most perfect circle you can in one stroke, and the app scores your precision.
- [ ] Beat Maker: Compose a rhythm on a grid without hearing a single sound, then let the room vote when it plays on the TV.
- [ ] Horse Race: Bet on a horse and watch the race unfold on the TV, hoping yours crosses the line first.
- [x] Pirate Race: crews of pirates (1 vs 1 up to 4 vs 4 vs 4) row in time with a drum that speeds up and slows down; the ships sail on the TV and on a WLED light (the other lights play a sea wave), first to the treasure wins.

- [ ] on the a selecatble Wled device  Tir à la corde, spammer(possible de le faire en 1vs1, 2vs2,.. ou même nombre impair)
- [ ] on the a selecatble Wled deviceZone cible : un point lumineux monte et descend, et il faut presser pile quand il traverse la zone verte. La zone rétrécit et la vitesse augmente à chaque réussite.
- [x] on the a selecatble Wled device (with direction) Pluie rythmique : des lumières montent depuis le bas, et il faut presser quand elles touchent le haut, comme Guitar Hero. Le haut-parleur joue un son à chaque note réussie.
- [x] make the Led guitar hero playable in solo, gusest should be able to preview 5s of the song, make the WLED effect a bit nicer? Also it should pause the spotify music when the game is played, and resume it after the game is finished. Only play the sound of the button on the TV speaker when he plays solo with music, otherwise only do the effect on the player phone (so at 2 player with or without music it should only play the sound on the guest deivce that is playing, to his own action). Also make sure the games in sync music / led effect.


# Bugs / improvements
- [x] The TV page sometimes cahnge the layout and the right part become too big (for ex when I add a lot of music to the queue...)
- [x] pixelcanvas: should be able to use gesture to navigate the canvas, not just drag the finger to draw. (like pinch to zoom, two fingers to move), and imrpove the UI, Like the bottom part should never move, even when moving, and better way to display all those colors. And when I paint a few pixels, it show price 0, write the correct prize reduction on the phone guest
- [x] When a user adds a song but spotify is not played anywhere, he sees a +10 on his money and the error. (He gets -10 for putting a song and instend of +10 for the error). Make sure this bug doesnt also appens somewhere else.
- [x] Let the admin choose the delay for the passive earning.
- Add more fun emoji for the selfie avatars (like a crown, a hat, a mustache, a monocle, etc.)
- [x] add some lights effects (dark, a better fiework that uses the firework effect, some effects that are not just copied on all devices the same). and also some scene that will be stay until a new scene is selected, only chill thigs
- [x] show a +x to the music queue when there is more than the screen can display in te queue.
- [ ] buy domain name
- [ ] redo a more fair economy
- [x] WLED on ChillGuy should only change the eye segment effect/color
- [x] ! for the coin flip, just put the face of the participans so easier to undertand who won. And still ranomly choose who trow the coin. Also I dont think we need the whole screen to do that, like we could do everything on the 2 participant phone, just the trow the coin on the big TV, and show a small animation of the money going to the winner. (so it would be more like a duel, and not a game for the whole room), also make the coin with the head on it look a bit nicer, like 3D, and make the coin flip animation a bit more realistic, like it should be a bit more random, and not just go up and down, but also rotate a bit.
- [x] change the passive incom, makes that he doesnt need to be always online, if not online, it will increase what he would gain when he comes back online. up to X hours (admin can change it, 1h by deauflt) and user get a nice message when he comes back online, like "you were offline for 2h, you earned +20 coins while you were away"
- [ ] idea, think if its good, amin desactivable of course: make prices degressives when the feature is not used.. until its 1 or even free
- improve the game settings admin side


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
| **Pixel canvas** | Paint pixel by pixel (r/place style), pinch to zoom and two fingers to move | Clear, resize |
| **Stickers** | Built-in vector stickers, text, their own face, or stickers they make (cut out of a photo, drawn with a finger, or imported like a WhatsApp sticker, animated ones stay animated), bouncing for X minutes | Duration, limit, upload your own, turn guest-made stickers on or off, delete one from a guest's collection |
| **Photos** | Photo with caption shown big on the TV | Remove (with refund), replay, duration |
| **Lights** (WLED) | Pick an effect, on all lights or one | Devices, effect editor, test, stop |
| **Soundboard** | Play a sound on the TV speakers, or search MyInstants | Volume, cooldown, upload sounds, add sounds from MyInstants, let guests search MyInstants and keep their own "My sounds" (with a length limit) |
| **Quiz** | Answer; start a quiz (random trivia or custom) for a fee; create custom quizzes | Start, pause, live time per question, custom quiz library with pictures |
| **Games** | Challenge someone to a 1 vs 1 duel with a bet, or start a game anyone can join: Blind Timer, Light Simon, Color Reflex, Perfect Circle, Bluff (duel), Coin Flip (duel) | Start a room game, stop with refund, choose which games guests can start, bet limit, light colors on the TV |

Core features: session code, name + PIN to rejoin from another phone, live activity feed, leaderboard
(it takes turns with other boards, see below), money rain, gifts, kick, themes, and a full economy editor (currency name, every price and reward).

### How guests are recognized

When joining, each guest picks a name and a 4-digit PIN (they are told not to reuse a real PIN).
The phone then remembers them: closing the page or the browser is fine. On another phone or
browser, they enter the **same name and PIN** to get their account back. Guests can see their PIN
(blurred until they tap the eye) in their profile; it is never sent to the TV or the host screen,
and 10 wrong PINs lock that name for a minute (longer each time). Guests can change their PIN in their profile, and
the host can set a new one from the Guests screen if someone forgets it.

Because the free tunnel URL changes when the server restarts, phones forget the account after a
restart. Balances are kept on the server, so guests just join again with their name and PIN.

### Quiz

Questions come from Open Trivia DB (by category and difficulty), from The Trivia API (search any of
about 1400 topics such as Harry Potter, football or Switzerland), or from custom quizzes
(made by the host or by guests, with an optional picture per question, kept between parties).
A host-started quiz waits up to 60 seconds for players; pressing Ready makes it start sooner
(15 seconds once half are ready, right away when everyone is). A guest-started quiz is started by
that guest, or by itself after 60 seconds. The host can pause and change the time per question
live. At the end, for 20 seconds: the winner drives their picture with a joystick and spins it,
2nd and 3rd have a small effect, and everyone else can make their picture peek in from the side.

### Games

**1 vs 1**: a guest picks a game, an opponent and a bet. They pay the challenge fee plus their
bet; the opponent sees the challenge on their phone (and the TV announces it) and has a minute
to accept by matching the bet. The winner takes the pot; a tie splits it. Declined or
expired challenges give everything back.

**Everyone**: a guest (for the start fee) or the host starts a game with an entry amount, and every
phone gets a Join screen for 45 seconds. The winner takes the pot plus a prize paid by the house:
the host chooses it when starting the game, otherwise it is the room-game reward.

Before every game, players get 30 seconds to read the rules (on the TV and their phone) and
press Ready; it starts as soon as everyone is ready.

Blind Timer is played over several rounds (3 by default, set in the admin), each with a new
target between 8 and 30 seconds. Nobody sees who stopped; after each round the TV sweeps a time
axis and drops each player's face where they stopped. The closest wins the round, the most
rounds won wins the game, and a tie goes to the smallest total gap.

Perfect Circle: each player draws several circles (3 by default, set in the admin) within one
minute, each sent when the finger is lifted. The scores stay secret until the TV reveals every
circle one by one with its score while the totals count up; the best total wins.

Coin Flip is played on the two phones: each player's face is on one side of the coin, one of them
is drawn to swipe it up, and only the throw shows on the TV (in the middle of the screen, over
what is there), tumbling on its way, then the pot flies to the face it landed on.

Bluff is played on the two phones too: the phones explain the rules with what each outcome pays
(both share: your bet back plus a bonus, the fixed bonus plus a number of times the bet, set in the
admin; one steals: the thief takes the pot; both steal: nothing), then each picks Share or Steal in
secret. The TV only shows a small card at the top: who has chosen, then both cards turned over.
A Bluff can be played once every 30 minutes for the whole party (set in the admin).

Bluff, Coin Flip and Rhythm Rain leave the TV as it is (a small card at the top), so they can be
played at the same time, one of each; a game on the whole TV waits for them to end, and they wait
for it.

Light Simon and Color Reflex drive the WLED lights with solid colors (queued light effects wait,
and every light goes back to what it was doing afterwards). The TV shows the colors too, or only
when no light is reachable if the host turns that off. Each game is one file in
`server/modules/games/` plus a phone and a TV screen in `web/src/modules/games/`.

### Leaderboard

In the admin's Leaderboard page, the host picks what the right column of the TV ranks: one board, or
several that take turns with a crossfade (or none). The boards: richest, big spenders, top earners,
pixels painted, stickers sent, photos shared, songs queued, sounds played, games played, games won,
and Rhythm Rain songs. A song played with music gets its own board (cover, title, best score of each
guest) once enough guests played it at the same difficulty and number of colors (6 by default); in a
duel both scores count. When boards take turns, one shows once at least two guests are on it.

### Selfie avatars

After joining, guests are offered to take a selfie (camera only, not the photo library: the live
camera in the page over https, or the phone camera app otherwise). They can give themselves a big
head, tiny head, swirl, long or wide face, waves or pixels (tap the face to aim the effect), and
drag one emoji anywhere on the picture. The picture replaces their initials everywhere: leaderboard,
quiz, photos, activity feed, host screens. From their profile they can change the effects, retake
or remove it; the host can remove it too. The original selfie stays private on the PC (only its
owner can load it, to edit), and every picture is deleted with a new session.

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
