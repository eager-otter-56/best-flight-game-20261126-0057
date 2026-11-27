[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/eager-otter-56/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/eager-otter-56/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Sky Harbor Run

An original, fully offline flight game built for the make.fun bounty
**best-flight-game-20261126-0057**
(https://make.fun/bounty/best-flight-game-20261126-0057).

You fly a high-wing tourer over Sky Harbor Island — a heightfield island with
a harbour town, a lighthouse, pine forest and snow-tipped peaks — rendered as
a real-time WebGL 3D world with sun shadow mapping, and flown from either a
chase camera or a first-person cockpit view, with a full set of lit steam
gauges. There is a marked runway with edge lights and PAPI, and an
eight-gate ring course threaded through the valleys.

## The three sorties

- **Ring Runner** — fly all 8 gates in order, then land on the runway.
  Score rewards centred gates, fuel discipline and a gentle touchdown.
- **Harbour Landing** — one clean approach: gear down, under 120 kt,
  on the strip. Firm arrivals bend the hull gauge; very firm ones end it.
- **Free Flight** — no clock and no gates; explore, and mind the fuel.

The flight model rewards throttle and turn discipline: banked turns bleed
speed, the wing stalls below its speed (slower with flaps), fuel burns faster
at full throttle, and every gauge on the panel — airspeed, attitude,
altimeter, heading, vertical speed, throttle, fuel, hull — is live.

## Controls

- **Arrows** or **mouse drag** — stick (pitch and roll)
- **Shift / Ctrl** (or `+` / `-`) — throttle up / down
- **G** — landing gear · **F** — flaps · **V** — chase / cockpit view · **P** — pause · **R** — restart
- **1 / 2 / 3** — choose a sortie on the title screen

## Layout

- `main.ts` — the hand-in program (Node 22, standard library only): copies
  `game/` and `screenshots/` to the output directory and writes
  `dossier.json` with `vendor/makefun-game.ts`.
- `game/` — the playable game, plain static files, no build step and no
  network requests. Serve it with `node serve.ts` and open
  http://localhost:8080, or any static file server.
  - `game/src/terrain.js` — the island heightfield, runway, ring course, scenery
  - `game/src/physics.js` — the flight model: lift, stall, fuel, damage
  - `game/src/glworld.js` — the WebGL world: terrain mesh with real-time sun
    shadows, faceted town and trees, the 3D aeroplane, chase and cockpit cameras
  - `game/src/render3d.js` — the fallback 2D painter (sky, terrain, rings)
  - `game/src/aircraft.js` — the chase-view aeroplane for the fallback painter
  - `game/src/cockpit.js` — the lit instrument panel
  - `game/src/hud.js` — HUD tapes, target marker, minimap, banners
  - `game/src/missions.js` — the three sorties and scoring
  - `game/src/input.js` — keyboard and mouse controls
  - `game/src/audio.js` — procedural WebAudio engine, wind, chimes
  - `game/src/main.js` — boot, game loop and screen states
  - `game/src/shots.js` — posed `?shot=` scenes used for the screenshots
- `screenshots/` — real renders of the game in headless Chrome
  (`?shot=cover|approach|cockpit|sunset`), never edited or composited.

Everything — idea, art, names and sound — is original to this entry.
Licensed under the MIT License (see `LICENSE`).
