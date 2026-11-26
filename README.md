# Isla Brava: Water Bomber

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Falken21/best-flight-game-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Falken21/best-flight-game-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A 3D firefighting flight game for the make.fun bounty
[Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057).

The pine forest of Isla Brava is burning. You fly the island's only water
bomber: skim the crater lake to fill your tank, climb out heavy, line up on
a smoke column and drop your water before the fire spreads — tree to tree,
downwind — to the village, the lighthouse and the fuel depot. Every doused
fire stops feeding the island's SCORCH meter; let it reach 100% and the
island is lost.

## Play

Serve `game/` with any static file server (or `node serve.ts` here) and
open it in a desktop browser. No network requests, no build step.

- **↑ / ↓** — climb / dive
- **← / →** or **A / D** — bank and turn
- **Q / E** — rudder trim
- **Shift / Ctrl** — throttle up / down
- **Space** — drop water (a marker on the ground shows where it will land)
- **P** — pause, **Enter** — start / restart

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with `buildDossier`.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `game/` — the game itself: `index.html`, sources under `src/` (world,
  plane, fires, particles, HUD, input, audio, screenshot scenes) and the
  vendored three.js build under `vendor/`.
- `screenshots/` — four real renders of the game at 1280×720.

## Design

`DESIGN.md` holds the short design brief: the player promise, the
scoop-and-drop core loop, the escalation and the screenshot plan.
