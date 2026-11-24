# ZeroTyperance

[Русская версия](README.ru.md)

An independent re-implementation of the game engine of **Zero Tolerance** (Sega Mega Drive / Genesis, 1994) in
TypeScript, running in your browser, in the console's picture or in HD. One or two players: co-op over your local
network or the internet.

**Beta:** the HD view (the Custom renderer) and co-op are experimental: they are still in beta and may contain bugs.

**The ROM image.** The installer downloads the original Zero Tolerance ROM image from
[technopop.net](http://www.technopop.net/) (or its archive.org copy when that site is down), where its copyright owner
Randel Reiss "has made the original Zero Tolerance Sega Genesis ROM image royalty-free for distribution"; the same page
notes that portions of the ROM image are copyright Sega, who never officially granted permission for distribution.
The download is checked against a pinned SHA-256. ZeroTyperance itself contains no graphics, music, sounds, maps,
text or data tables copied from the game: the page reads all of them from that ROM image in your browser and keeps
the results in the browser's storage. What it ships besides its code is the engine's rule values (speeds, timings,
damage and the like, written as numbers) and the frame timing of the attract demos as measured on a console. To use
your own copy of the ROM image instead, install with `ZT_NO_ROM=1` and pick it in the page.

Version 0.3.0.

## What it adds

The game plays as on the console. Around it ZeroTyperance adds:

- **Renderers** (Video page; **F9** switches at any time): *Original*, the console's picture; *Custom* (beta), the 3-D view
  at the window's full resolution and width, with the game's own textures and the whole sky panorama (needs WebGL2);
  *Classic smooth*, the console's framing with smooth motion. The game underneath is the same in all of them.
- **Smooth motion**: the view moves at your display's rate instead of the game's 12 steps a second.
- **HUD layout** Bar or Corners (**F10**), the weapon's size, the field of view, the resolution and a frame limit.
- **Controls**: *Original* (the pad's buttons on the keyboard, a gamepad or touch controls) or *Modern* (W A S D to
  walk and strafe, the mouse to turn, fire and switch items); every key can be rebound.
- **Co-op** (beta) for two players over your local network or the internet (see Co-op below).
- **Passwords** (yours are kept for a quick start), **save states**, ten **cheat** switches and a game speed switch.
- **Voice mode**: how often the announcer may repeat itself.
- A setup wizard on the first start; every menu page also works with the mouse alone.

## Install

**Windows:** from the [latest release](https://github.com/DarthNuts/ZeroTyperance/releases/latest) download

- **`ZeroTyperance-0.3.0-setup.exe`**, the installer: no administrator rights; it installs into
  `%LOCALAPPDATA%\Programs\ZeroTyperance`, adds a Start menu entry (and, if you tick it, a desktop shortcut) and an
  entry in Settings → Apps for uninstalling. Running a newer setup later updates the game.
- or **`ZeroTyperance-0.3.0-windows-x64.zip`**, the portable app: unzip it anywhere (a USB stick works) and start
  `ZeroTyperance.exe` in its folder.

Both include Node.js 24.22.2 and download the ROM image (see above) when installed or first started. The files
are not code-signed, so Windows SmartScreen may say "Windows protected your PC": choose **More info**, then **Run
anyway**.

Windows, from PowerShell instead (installs the `zerotyperance` command):

```powershell
irm https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.ps1 | iex
```

Linux, macOS:

```sh
curl -fsSL https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.sh | bash
```

The one-line installers put the game, its small local server and a private copy of Node.js 24.22.2 (downloaded
from nodejs.org and checked against a pinned SHA-256) into one folder, and add the command `zerotyperance`:

| | folder | command |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Programs\ZeroTyperance` | `zerotyperance` (user PATH) and the Start menu |
| Linux, macOS | `~/.local/share/zerotyperance` | `~/.local/bin/zerotyperance` |

No administrator rights. Running the installer again updates the game.

## Play

**Windows app** (the setup or the portable zip): start **ZeroTyperance** from the Start menu, or `ZeroTyperance.exe`.
It opens the game in its own window (Microsoft Edge's app mode; Chrome or your default browser when Edge is missing)
and stays in the notification area next to the clock while the game server runs: click its icon to open the window
again, right-click it and choose **Quit** to stop it.

**The command** (the one-line installers):

```sh
zerotyperance
```

It serves the game on `http://localhost:8802/` and opens your browser (Chrome, Edge or Firefox). The first time,
the page checks the ROM image and extracts the assets once (a few minutes); without the downloaded image it asks
you to pick one. Close the program's window, or
press Ctrl+C, to stop it. Options: `--port N`, `--no-open`.

### Where your settings are kept

The game keeps your settings (input, video, sound, cheats), your saved passwords, the save states and the extracted
assets in the browser's own storage for its address, `http://localhost:8802` (local storage and IndexedDB). That
storage is part of your browser profile, under your user account, never in the game's folder:

- Windows (the app opens Microsoft Edge): `%LOCALAPPDATA%\Microsoft\Edge\User Data`; Chrome:
  `%LOCALAPPDATA%\Google\Chrome\User Data`.
- Linux: `~/.config/google-chrome`, `~/.config/chromium`, `~/.config/microsoft-edge` or `~/.mozilla/firefox`.

The game's folder holds only the program, the ROM image (`rom`) and, for the Windows app, its log
`ZeroTyperance.log`. Another port or another browser starts with fresh settings: keep the same port between runs.
Clearing the browser's site data for `http://localhost:8802` resets everything (see Uninstall).

## Co-op

- **Anywhere (the default):** both players start ZeroTyperance. One chooses **Co-op → Host a game**, names the room
  ("Zero Tolerance" by default; the computer's name when the room opens on the host's own program), picks where
  the game starts (**Password**: New game, or a password from the
  list or typed, as on the Password page) and tells the other the room code; the other chooses **Co-op → Join a game** and
  types it (two players behind the same router can also pick the room by its name from the list, then type the
  code). The game goes through the ZeroTyperance co-op server at `85.235.151.36`
  (TCP and UDP port 47810): no port forwarding. When the host cannot reach that server, the room opens on the host's
  own program instead, and a player on another network then needs the host's address, as below.
- **Same network:** works as above; without the co-op server the Join page still lists the open games of your
  local network (or open the host's address, for example `http://192.168.1.20:8802/`, and enter the room code).
  On Windows, allow Node.js on private networks when asked.
- **Internet without the co-op server:** both players type the address of the host's program into
  **Co-op → Server** (a typed address is used alone): the host `localhost:8802`, the other player
  `HOST-ADDRESS:8802`. The host forwards TCP port 8802 to their computer; the other player opens
  `http://HOST-ADDRESS:8802/`, types the address there and joins with the room code. That page asks the other player for the ROM image the
  first time: the host's program hands its copy only to its own computer and its local network (an installed
  ZeroTyperance keeps one in its folder, `rom/Zerotole.bin`).
- Both players need the same ROM image and the same version of ZeroTyperance.

## Network and privacy

- The program listens on port 8802 on every network interface so that a second player can join. The co-op service
  has no passwords and no encryption (plain `http://` and `ws://`): anyone who can reach the port can open the page
  and join an open game with its code. On your local network the Join page lists the open games; a player who comes
  from the internet does not get the list and has to type the code. The ROM image is served only to this computer
  and your local network. Both rules go by the address a request comes from: behind a reverse proxy or a tunnel on
  this computer (nginx, ngrok, `ssh -R`, ...) every request looks local, so the list and the ROM image go to anyone
  the tunnel lets in. Forward the port itself instead.
- It also answers STUN requests on UDP port 8802 (it tells a co-op partner the address and port it sees, for the
  direct connection between the two browsers).
- It listens on IPv6 as well: on a computer with a public IPv6 address and no firewall, port 8802 is reachable from
  the internet without any port forwarding.
- While it runs it announces its open games on your local network once a second (UDP port 47811), with your
  computer's name and the rooms' names (never their codes).
- **The co-op server.** Only when a player chooses Host a game or Join a game with the Server row empty does the
  page connect to the co-op server at `85.235.151.36` (TCP and UDP port 47810), which the author of ZeroTyperance
  runs. It sees your IP address, the room's name and code and the network addresses your browser offers for the direct
  connection to the other player (which can include your address on your local network). It passes the two pages'
  connection setup to each other, and it carries the game's messages when the two browsers cannot connect directly.
  Its connections are not encrypted (`ws://`). The co-op program on that server stores nothing; its log keeps the
  time, the event, the room code and only the network part of your address (the first three numbers of an IPv4
  address, the first 48 bits of an IPv6 one). Type another server into **Co-op → Server** to use only that one.
- No telemetry: apart from that server, the page and the program contact nothing else. The one-line installers
  contact only GitHub (this release), nodejs.org (Node.js) and technopop.net or web.archive.org (the ROM image); the
  Windows setup and portable app, which carry Node.js, only technopop.net or web.archive.org (the ROM image).

## Uninstall

Windows app: the setup's copy through Settings → Apps → ZeroTyperance → Uninstall; the portable app by deleting its
folder.

Windows, the PowerShell install:

```powershell
$env:ZT_UNINSTALL=1; irm https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.ps1 | iex
```

Linux, macOS:

```sh
curl -fsSL https://github.com/DarthNuts/ZeroTyperance/releases/latest/download/install.sh | bash -s -- --uninstall
```

The extracted assets stay in the browser until you clear the site data of `http://localhost:8802`.

## Source

The repository's `source/` folder holds the TypeScript of the page (exactly the modules the release ships, printed
without comments), its data pack of rule values and its build. `cd source && npm install && npm run build` writes
`source/site/`, equal byte for byte to the `app/` folder of the release archive (`version.json` aside, which the
release adds). The audio renderer's C source is in `audio/`. `launcher/` holds the program the installer installs
beside the page: `launch.mjs` (the `zerotyperance` command), `server/server.mjs` (the local web and co-op server) and
`unzip1.mjs` (unpacks the ROM image's zip). `windows/` holds the Windows app's sources: `launcher.c` and
`launcher.rc` (`ZeroTyperance.exe`, built with MinGW-w64), `setup.nsi` (the installer, NSIS 3), `fetch_rom.mjs` (the
ROM image download) and `make_icon.py` (draws `zt.ico`).

## Credits

- **Randel Reiss and the Technopop team**, for the original game, and for making its ROM image royalty-free on
  [technopop.net](http://www.technopop.net/): without that this project could not exist.
- **Ziz**, for the GZDoom remake of Zero Tolerance and the inspiration: [Telegram](https://t.me/ZTRemake),
  [Boosty](https://boosty.to/ztremake), [YouTube](https://www.youtube.com/@%D0%97%D0%B8%D0%B7-%D0%BA3%D1%86).
- **Vladimir Kononovich** ([YouTube](https://www.youtube.com/@DocMefistO), [GitHub](https://github.com/lab313ru/)),
  for the detailed and complete layout and annotations of the ROM, and for his videos
  [one](https://youtu.be/Jk80oOD6kTU) and [two](https://www.youtube.com/watch?v=AiaqfKlpkOI).
- **Anthropic's Claude**, for writing literally all the code, and the tests and documents with it.
- **AdvancedFan2020**, for the
  [maps and the password list](https://www.deviantart.com/advancedfan2020/art/Zero-Tolerance%3A-Maps-and-Passwords-1269781046).
- **Dimon12321**, for his tool-assisted run of the whole game
  ([video](https://www.youtube.com/watch?v=o93RqpvFtgc), [the movie file on TASVideos](https://tasvideos.org/2702M)):
  played back from the first level to the ending, it was the game's regression test.
- **Real-Gecko**, for the idea of the HD renderer ([zero-tolerance](https://github.com/Real-Gecko/zero-tolerance)).
  The idea only: no code was taken.
- **Willy Wodka**, for the idea of the interpolation behind smooth motion
  ([ztpp](https://github.com/wowwillywodka/ztpp)). The idea only: no code was taken.
- **Nemesis_c, r57shell, Smoke, Lipetsk, GoodBye (aka vfiuchcikicshuusrch) and Segaman**, for the website
  [elektropage.ru](https://elektropage.ru/) and the ROM hacking tools for the original Zero Tolerance and Beyond Zero
  Tolerance.
- **MyCorp**, for the website [zt.ucoz.ru](https://zt.ucoz.ru/) and its huge archive of information on Zero
  Tolerance.
- **Metalslayer and vovka1987tv**, for their help testing the game, especially co-op.
- **Segaman, aka Mikhail Shilenko**, for his work on Zero Tolerance Underground and his Beyond Zero Tolerance.

The software it is built with and on:

- The audio renderer: [Nuked-OPN2](https://github.com/nukeykt/Nuked-OPN2) by Alexey Khokholov (Nuke.YKT), the
  YM2612 FM chip; emu76489 by Mitsutaka Okazaki, the SN76489 sound chip; [z80](https://github.com/superzazu/z80) by
  Nicolas Allemand, the sound processor (licences in `THIRD_PARTY_NOTICES.txt`).
- [TypeScript](https://www.typescriptlang.org/) and [Node.js](https://nodejs.org/); the Windows app with
  [MinGW-w64](https://www.mingw-w64.org/) and [NSIS](https://nsis.sourceforge.io/).

## Anti-credits

- **Segaman, aka Mikhail Shilenko**, for refusing to cooperate with the community and personally refusing to help with
  this project, which motivated and pushed us to do everything on our own.
- **Piko Interactive and QUByte Interactive**, for the laziest re-release of Zero Tolerance: a slap in the face to the
  fans, who were left to do everything themselves.

## Legal

Zero Tolerance (c) 1994 Technopop / Accolade; Randel Reiss owns its copyright and trademark. Sega and Mega Drive /
Genesis are trademarks of Sega. This project is not affiliated with or endorsed by any of them and contains no
graphics, music, maps, text or data tables copied from the game; its installer downloads the ROM image from its
copyright owner's site. See `LICENSE` and
`THIRD_PARTY_NOTICES.txt` (the audio renderer includes Nuked-OPN2 under the LGPL-2.1; its complete source is in
`audio/` and in the release file `zerotyperance-audio-source.tar.gz`).
