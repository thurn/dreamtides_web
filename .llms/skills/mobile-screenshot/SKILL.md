---
name: mobile-screenshot
description: Use when asked to mock up, preview, or screenshot the quest prototype UI on a phone (iPhone 16, iPhone SE, Galaxy S25 Ultra, Galaxy A16, Razr+, Z Flip7). Triggers on mobile screenshot, mobile mock-up, phone preview, device frame, how does this look on mobile, iPhone screenshot, Android screenshot, /mobile-screenshot.
---

# Mobile Screenshot Mock-ups

Render the running quest prototype web app at a phone's resolution, aspect
ratio, and pixel density, and capture a PNG. Use it to preview how a screen
looks on mobile without a real device, the iOS Simulator, or an Android
emulator.

The tool is `scripts/mobile-screenshot.mjs`. It drives a headless Chromium via
`agent-browser`, loading the app in an `<iframe>` sized to the target screen at
the correct device pixel ratio, then paints the screen cut-out (Dynamic Island
or camera punch-hole) and the home indicator over the UI. The status bar
(clock / battery / Wi-Fi) is omitted so the UI renders edge to edge. `--frame`
wraps the screen in a device body/bezel.

Requires Node 18+ and the `agent-browser` CLI. A dev server must be reachable
(`--url`/`--port`), or pass `--start` to launch one for the run.

## Usage

```bash
node scripts/mobile-screenshot.mjs [options]
# or
npm run mobile-screenshot -- [options]
```

The app must be served somewhere the tool can reach. Either start a dev server
yourself on a non-default port and point at it, or let the tool manage one:

```bash
# You already have a server running on port 5178:
node scripts/mobile-screenshot.mjs --url http://localhost:5178

# Let the tool start and stop its own server (uses --port, default 5178):
node scripts/mobile-screenshot.mjs --start
```

Never start a server on port 5173 (the developer's default). Use `--port 5178`
or similar.

## Common examples

```bash
# Default: iPhone 16, landing screen, into ./screenshots/iphone-16.png
node scripts/mobile-screenshot.mjs --url http://localhost:5178

# Every device, with device frames:
node scripts/mobile-screenshot.mjs --all --frame --url http://localhost:5178

# A specific device jumping straight to a QA scene (real game UI):
node scripts/mobile-screenshot.mjs -d galaxy-s25-ultra --scene shop \
  --url http://localhost:5178

# Two devices into a chosen folder:
node scripts/mobile-screenshot.mjs -d iphone-16 -d galaxy-z-flip7 \
  -o ./out --url http://localhost:5178
```

## Devices

Run `--list` for the live table (id, name, logical/physical resolution, dpr):

```bash
node scripts/mobile-screenshot.mjs --list
```

| id                 | device                    | notes                                   |
| ------------------ | ------------------------- | --------------------------------------- |
| `iphone-16`        | iPhone 16                 | Dynamic Island, iOS home indicator      |
| `iphone-se-3`      | iPhone SE (3rd gen)       | Bezels + Touch ID home button, no cut-out |
| `galaxy-s25-ultra` | Samsung Galaxy S25 Ultra  | QHD+, center punch-hole                  |
| `galaxy-a16-5g`    | Samsung Galaxy A16 5G     | center punch-hole                        |
| `razr-plus-2025`   | Motorola Razr+ 2025       | foldable inner display                  |
| `galaxy-z-flip7`   | Samsung Galaxy Z Flip7    | foldable inner display                  |

Resolutions/densities are close approximations of the real hardware — enough to
judge layout, not a pixel-perfect emulation.

## Choosing what the app shows

- `--route <path>` — app route, e.g. `--route /editor`. Default `/`.
- `--scene <id>` — jump to a QA scene via `?goto=<id>` (e.g. `shop`, `atlas`,
  `purge`). See `docs/quest_prototype/qa_scenes.md` for the full list. Scenes
  need the dev server's Firebase emulator running (a plain `vite` is not
  enough); prefer `npm run dev` / `--start`.
- `--query <str>` — append a raw query string (without a leading `?`/`&`),
  e.g. `--query "seed=42&startInBattle=1"`.

## Appearance options

- `--frame` — draw the device body/bezel (and the SE home button). Adds a
  small device-name caption above the frame.
- `--no-cutout` — hide the Dynamic Island / punch-hole.
- `--no-home` — hide the home indicator.
- `--no-caption` — omit the device-name caption in `--frame` mode.
- `--backdrop <css>` — colour behind the screen's rounded corners
  (default `#0e0e12`).
- `--light` / `--dark` — preferred colour scheme (default `--dark`).

## Capture options

- `-o, --out <path>` — output directory, or a `.png` file when one device is
  selected. Default `./screenshots`.
- `--wait <ms>` — delay after load before capturing (default 4500). Increase
  for scenes that build a room/battle.
- `--scale <n>` — override device pixel ratio (e.g. `1` for a smaller file).
- `--json` — machine-readable output describing each capture.

## Notes

- Output filenames are `<device-id>.png`, or `<device-id>-frame.png` with
  `--frame`. Physical image dimensions equal `logical × dpr` (or `× --scale`).
- If nothing renders in the frame, the app probably was not ready yet — raise
  `--wait`, and confirm the server at `--url` actually serves the app.
- The tool uses its own `agent-browser` session and closes it when done, so it
  will not disturb a separate `agent-browser` session you have open.
