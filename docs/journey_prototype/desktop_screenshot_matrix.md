# Desktop Screenshot Matrix

The desktop screenshot matrix captures curated Dream Journey QA scenes across
representative laptop and desktop viewports, then renders compact visual indexes
for review. Every viewport uses a 1× device-pixel ratio, so each PNG's pixel
dimensions match its viewport dimensions.

## Token-efficient review loop

1. Run the smoke or core matrix.
2. Inspect the generated contact sheet PNGs.
3. Open the HTML grid or an individual full-resolution PNG only for a
   suspicious cell.
4. Re-run only the affected scene and viewports after a fix.

The contact sheets are the primary review surface. The full-resolution captures
remain available for targeted inspection without sending the entire matrix
through an agent's visual context.

## Commands

Start one isolated development server on port 5178, capture the default core
matrix, and tear down the server and browser session:

```bash
npm run screenshots:desktop -- --start
```

Capture the smaller smoke scene set:

```bash
npm run screenshots:desktop -- --start --smoke
```

Capture the core scenes across every extended viewport:

```bash
npm run screenshots:desktop -- --start --extended
```

Capture one scene at every core viewport:

```bash
npm run screenshots:desktop -- --start --scene atlas
```

Capture selected scenes and viewports:

```bash
npm run screenshots:desktop -- --start \
  --scene draft \
  --scene battle-playable \
  --viewport 1366x768 \
  --viewport 1920x1080
```

Point the run at an existing caller-managed server:

```bash
npm run screenshots:desktop -- \
  --url http://localhost:5178 \
  --scene atlas
```

List the live scene registry and the declarative viewport registry without
capturing:

```bash
npm run screenshots:desktop -- --list-scenes
npm run screenshots:desktop -- --list-viewports
```

Use `--seed <non-negative-integer>` to override the default seed of `42`.
Use `--verbose` for successful-cell readiness details. For machine-readable
output, `--json` writes one compact result object; `npm run --silent` also
suppresses npm's command banner:

```bash
npm run --silent screenshots:desktop -- --start --smoke --json
```

## Presets

The default `core` scene preset covers distinct layout families:

- `dream-avatar-select`
- `dreamscape`
- `atlas`
- `draft`
- `shop`
- `deckviewer`
- `poolviewer`
- `startingdeck`
- `reward-at-cap`
- `battle`
- `battle-playable`
- `journeycomplete`
- `journeyfailed`

The `smoke` scene preset contains:

- `dream-avatar-select`
- `dreamscape`
- `atlas`
- `draft`
- `battle-playable`
- `journeycomplete`

The `full` scene preset expands directly from every scene registered in
`QA_SCENES`. Use `--scene-preset full` to select it. Presets are validated
against the same registry before every capture, so a stale scene id fails with
a clear diagnostic.

The default `core` viewport preset contains:

| ID | Dimensions | Risk represented |
| --- | --- | --- |
| `desktop-1366x768` | 1366×768 | Common laptop with constrained vertical space |
| `desktop-1440x900` | 1440×900 | Representative 16:10 laptop workspace |
| `desktop-1920x1080` | 1920×1080 | Mainstream desktop workspace |
| `desktop-3440x1440` | 3440×1440 | Ultrawide max-width and horizontal composition |

The `extended` viewport preset contains the core set plus:

- `desktop-1280x720`
- `desktop-1536x864`
- `desktop-2560x1080`
- `desktop-2560x1440`
- `desktop-2560x1600`

The shorter dimension form, such as `--viewport 1366x768`, is accepted as an
alias for the stable `desktop-1366x768` id.

## Capture and diagnostics

One run starts one server when `--start` is present and uses one unique,
isolated `agent-browser` session. Each matrix cell navigates directly to:

```text
/?goto=<scene>&seed=<seed>
```

The capture waits for the QA room, `document.fonts.ready`, a non-empty rendered
root, completed visible images, and two consecutive stable layout
measurements. Immediately before capture it records the actual URL, `goto`,
viewport dimensions, root geometry, document scroll dimensions, visible image
health, and the page error buffer. A failed cell is recorded in the report and
the remaining cells continue.

The managed server uses port 5178 by default. Port 5173 is rejected. Cleanup is
scoped to the run's browser session and managed server process group.

## Output

Runs are written beneath:

```text
artifacts/journey-desktop-screenshots/<run-id>/
```

The directory is gitignored. Its stable layout is:

```text
<run-id>/
  manifest.json
  index.html
  contact-sheet-<scene-group>.png
  <scene-id>/
    <viewport-id>.png
```

`manifest.json` contains run metadata and a diagnostic record for every cell.
`index.html` is a local grid with scenes as rows and viewports as columns,
including thumbnails, status badges, and links to full-resolution captures.
Contact sheets split the selected scenes into journey, collection, site, and
battle layout families when those families are present.

The ordinary stdout result contains only capture count, failure count, elapsed
time, and absolute paths to the manifest, HTML report, and contact sheets.
Progress and diagnostics are written to stderr.

The matrix is a local collection and inspection tool. It is not a CI gate or a
pixel-baseline suite.
