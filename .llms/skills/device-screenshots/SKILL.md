---
name: device-screenshots
description: Use when asked to mock up, preview, or screenshot the quest prototype UI on phones or desktop resolutions (iPhone 16, iPhone SE, Galaxy S25 Ultra, Galaxy A16, Razr+, Z Flip7, 1920x1080, 2560x1440, 2560x1600, 3440x1440, 2560x1080). Triggers on device screenshot, desktop screenshot, mobile screenshot, mobile mock-up, phone preview, desktop preview, device frame, how does this look on mobile, how does this look on desktop, iPhone screenshot, Android screenshot, /device-screenshots.
---

# Device Screenshot Mock-ups

Render the running quest prototype web app at a phone or desktop target's
resolution, aspect ratio, and pixel density, and capture a PNG. Use it to
preview how a screen looks on common phones and desktop viewports.

The tool is `scripts/device-screenshots.mjs`. It drives a headless Chromium via
`agent-browser`, loading the app in an `<iframe>` sized to the target screen at
the correct device pixel ratio. Phone targets paint the screen cut-out (Dynamic
Island or camera punch-hole) and home indicator over the UI. The status bar
(clock / battery / Wi-Fi) is omitted so the UI renders edge to edge. `--frame`
wraps phone targets in a device body/bezel.

### Safe areas match the target

The iframe has no physical display cutout, so the browser reports
`env(safe-area-inset-*)` as 0. To make a mock-up match hardware, the tool
encodes the target's safe-area insets (and, for cut-out phones, the cutout's
bounding box) into a `deviceFrame` query param on the iframe URL. The app
republishes them as `var(--safe-area-inset-top/right/bottom/left)` and
`var(--display-cutout-top/left/right/width/height)` (see
`src/runtime/device-frame.ts` and the `:root` block in
`src/tango/primitives/tango-tokens.css`). App code reads those variables — never
`env()` directly — so a notch-clearing layout that works on device also works in
a mock-up, and the insets zero out on a no-cut-out target like `iphone-se-3`.

`--no-cutout` suppresses the injected cutout box along with the painted island,
so the app never anchors UI to an island the capture does not show.

To render UI **in** the unsafe region (e.g. a control beside the Dynamic
Island), position it from the `--display-cutout-*` box. The `?demo=device-frame`
page demonstrates both a notch-clearing title and a control parked to the right
of the island:

```bash
node scripts/device-screenshots.mjs -d iphone-16 --query 'demo=device-frame' \
  --url http://localhost:5178
```

Requires Node 18+ and the `agent-browser` CLI. A dev server must be reachable
(`--url`/`--port`), or pass `--start` to launch one for the run.

## Usage

```bash
node scripts/device-screenshots.mjs [options]
# or
npm run device-screenshots -- [options]
```

The app must be served somewhere the tool can reach. Either start a dev server
yourself on a non-default port and point at it, or let the tool manage one:

```bash
# You already have a server running on port 5178:
node scripts/device-screenshots.mjs --url http://localhost:5178

# Let the tool start and stop its own server (uses --port, default 5178):
node scripts/device-screenshots.mjs --start
```

Never start a server on port 5173 (the developer's default). Use `--port 5178`
or similar.

## Common examples

```bash
# Default: iPhone 16, landing screen, into ./screenshots/iphone-16.png
node scripts/device-screenshots.mjs --url http://localhost:5178

# Every target:
node scripts/device-screenshots.mjs --all --url http://localhost:5178

# A desktop viewport jumping straight to a QA scene (real game UI):
node scripts/device-screenshots.mjs -d desktop-2560x1440 --scene shop \
  --url http://localhost:5178

# A phone and ultrawide desktop into a chosen folder:
node scripts/device-screenshots.mjs -d iphone-16 -d desktop-3440x1440 \
  -o ./out --url http://localhost:5178
```

## Targets

Run `--list` for the live table (id, name, logical/physical resolution, dpr):

```bash
node scripts/device-screenshots.mjs --list
```

| id                     | target                    | notes                                   |
| ---------------------- | ------------------------- | --------------------------------------- |
| `iphone-16`            | iPhone 16                 | Dynamic Island, iOS home indicator      |
| `iphone-se-3`          | iPhone SE (3rd gen)       | Bezels + Touch ID home button, no cut-out |
| `galaxy-s25-ultra`     | Samsung Galaxy S25 Ultra  | QHD+, center punch-hole                  |
| `galaxy-a16-5g`        | Samsung Galaxy A16 5G     | center punch-hole                        |
| `razr-plus-2025`       | Motorola Razr+ 2025       | foldable inner display                  |
| `galaxy-z-flip7`       | Samsung Galaxy Z Flip7    | foldable inner display                  |
| `desktop-1920x1080`    | 1920 x 1080 Desktop       | desktop browser viewport                |
| `desktop-2560x1440`    | 2560 x 1440 Desktop       | desktop browser viewport                |
| `desktop-2560x1600`    | 2560 x 1600 Desktop       | desktop browser viewport                |
| `desktop-3440x1440`    | 3440 x 1440 Desktop       | desktop browser viewport                |
| `desktop-2560x1080`    | 2560 x 1080 Desktop       | desktop browser viewport                |

Phone resolutions/densities are close approximations of the real hardware,
enough to judge layout. Desktop targets capture at 1x density, so image
dimensions match the target id exactly unless `--scale` is supplied.

## Choosing what the app shows

- `--route <path>` - app route, e.g. `--route /editor`. Default `/`.
- `--scene <id>` - jump to a QA scene via `?goto=<id>` (e.g. `shop`, `atlas`,
  `purge`). See `docs/quest_prototype/qa_scenes.md` for the full list. Scenes
  need the dev server's Firebase emulator running (a plain `vite` is not
  enough); prefer `npm run dev` / `--start`.
- `--query <str>` - append a raw query string (without a leading `?`/`&`),
  e.g. `--query "seed=42&goto=battle"`.

## Appearance options

- `--frame` - draw the device body/bezel for phone targets. Adds a small
  device-name caption above the frame.
- `--no-cutout` - hide phone Dynamic Island / punch-hole.
- `--no-home` - hide phone home indicator.
- `--no-caption` - omit the device-name caption in `--frame` mode.
- `--backdrop <css>` - colour behind the screen's rounded corners
  (default `#0e0e12`).
- `--light` / `--dark` - preferred colour scheme (default `--dark`).

## Capture options

- `-o, --out <path>` - output directory, or a `.png` file when one target is
  selected. Default `./screenshots`.
- `--wait <ms>` - delay after load before capturing (default 4500). Increase
  for scenes that build a room/battle.
- `--scale <n>` - override device pixel ratio (e.g. `1` for a smaller phone
  file or `2` for a high-density desktop capture).
- `--json` - machine-readable output describing each capture.

## Notes

- Output filenames are `<device-id>.png`, or `<device-id>-frame.png` with
  `--frame`. Physical image dimensions equal `logical x dpr` (or
  `x --scale`).
- If nothing renders in the frame, the app probably was not ready yet - raise
  `--wait`, and confirm the server at `--url` actually serves the app.
- The tool uses its own `agent-browser` session and closes it when done, so it
  will not disturb a separate `agent-browser` session you have open.
