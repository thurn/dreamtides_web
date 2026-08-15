---
name: qs
description: Use when working with the journey prototype, adding journey features, fixing journey bugs, or running journey prototype tests and typechecking. Triggers on journey prototype, journey sim, qs, journey bug, journey_prototype.
---

# Journey Prototype (QS)

Read these first:

- **Architecture + current flow**: [docs/journey_prototype/journey_prototype.md](../../../docs/journey_prototype/journey_prototype.md)
- **Multiplayer + Firebase**: [docs/journey_prototype/firebase_multiplayer.md](../../../docs/journey_prototype/firebase_multiplayer.md)
- **URL parameters**: [docs/journey_prototype/url_parameters.md](../../../docs/journey_prototype/url_parameters.md)
- **Browser QA + tooling notes**: [docs/journey_prototype/qa_tooling.md](../../../docs/journey_prototype/qa_tooling.md)

## Current Runtime Model

- The prototype is this repository (`~/quest_prototype/`).
- Every journey runs inside a Firebase Realtime Database room. The landing
  screen is the **room gate** rendered by
  `src/multiplayer/MultiplayerRoomGate.tsx`:
  - Without a `?game=` parameter the gate shows a **Create Game** button that
    creates a room, navigates to `?game=<id>`, and joins it.
  - With `?game=<id>` the gate subscribes to the room snapshot and mounts the
    journey UI once the snapshot is `ready`.
- Once the room is mounted, `src/state/multiplayer-journey-context.tsx`
  derives `state` from `session.room.journeyState` (defaulting via
  `createDefaultState()` when the room has no journey yet) and exposes
  `useJourney()` so screens see the same shape as the single-player path.
- Journey start is a **Avatar selection** screen with 3 choices. Picking a
  Avatar resolves a fixed package, builds the starter deck, draft state,
  and atlas via `startJourneyFromAvatar`, and transitions
  `state.screen` straight to the first dreamscape.
- Top-level state is `JourneyState` in `src/types/journey.ts`. Routing is driven
  by `state.screen` and dispatched in
  `src/components/ScreenRouter.tsx` (`journeyStart`, `atlas`, `dreamscape`,
  `site`, `journeyComplete`, `journeyFailed`).
- Use `useJourney()` from `src/state/journey-context.tsx`, not
  `useJourneyContext()`.
- Logging goes through `logEvent()` in `src/logging.ts`. In dev it:
  1. writes one JSON line to `console.log`
  2. stores entries in-memory for tests via `getLogEntries()`
  3. POSTs to `/api/log`
  4. gets appended by Vite to `logs/journey-log.jsonl`

## Multiplayer Persistence (Important)

All journey mutations route through `src/multiplayer/room-service.ts`. The two
write paths are:

- `writeRoomUpdate` — focused multi-path `update()` for individual fields
  (e.g. `writeJourneyField`, `writeWholeJourneyState`).
- `runRoomTransaction` — full-room transaction whose updater receives a
  normalized `MultiplayerRoom | null` and returns the next room.

Realtime Database **silently drops** `null` values, empty arrays, and empty
objects on write. A room round-tripped through Firebase therefore loses any
field whose default value is `null`, `[]`, or `{}`. `normalizeRoomSnapshot`
and `normalizeJourneyState` in `room-service.ts` restore those fields against
`createDefaultState()` before the snapshot reaches React or transaction
updaters.

When you add a `JourneyState` field, or a nested field on `DreamAtlas`,
`DreamscapeNode`, `DraftState`, etc., that defaults to `null`, `[]`, or `{}`:

1. Add the field to `createDefaultState()` in `src/state/journey-context.tsx`.
2. Add a default in `normalizeJourneyState` (or its nested helpers) in
   `src/multiplayer/room-service.ts`.
3. Add a `room-service.test.ts` case that feeds an RTDB-stripped snapshot
   (field omitted) and asserts the default is restored.

Skipping step 2 produces render-time crashes like
`Cannot read properties of undefined (reading 'length' | 'map' | …)`
the first time a fresh room is loaded back from Firebase.

## Running

`.env` is required for Firebase to initialize. Copy `.env.example` to `.env`
and fill in the seven `VITE_FIREBASE_*` values
(see [firebase_multiplayer.md](../../../docs/journey_prototype/firebase_multiplayer.md)).
`.env` is gitignored.

```bash
cd ~/quest_prototype
npm install
npm run dev
```

`npm run dev` runs `scripts/setup-assets.mjs` automatically first. That setup
script is idempotent and refreshes:

- `public/card-data.json`
- `public/avatars-v2-data.json`
- `public/cards/` symlinks into the local image cache

Useful one-offs:

```bash
npm run setup-assets
npm run review
npm test -- src/path/to/affected.test.ts
npm run review:full  # test infrastructure, cross-cutting changes, releases
npm run build
npm run preview     # serves dist/ without a file watcher
```

**Worktrees:** `node_modules` is not committed. Run `npm install` before
typecheck, lint, tests, or browser QA in a fresh worktree.

## Key Files

| File | Role |
|------|------|
| `src/App.tsx` | App shell, loads journey content + Firebase, mounts the room gate, HUD, deck viewer intro, debug overlay |
| `src/multiplayer/MultiplayerRoomGate.tsx` | Create / join / subscribe / presence; renders the journey only when the room is `ready` |
| `src/multiplayer/room-service.ts` | RTDB read/write primitives, snapshot normalization (`normalizeJourneyState`, `normalizeAtlas`, `normalizeDraftState`), transaction helper |
| `src/multiplayer/room-types.ts` | `MultiplayerRoom`, `RoomSession`, `RoomMetadata`, schema version |
| `src/state/multiplayer-journey-context.tsx` | Multiplayer mutations: every change is written via `writeRoomUpdate` or `runRoomTransaction` |
| `src/state/journey-context.tsx` | `useJourney()` consumer hook, `createDefaultState()`, single-player provider for tests |
| `src/types/journey.ts` | `JourneyState`, `Screen`, `SiteType`, atlas/site types |
| `src/components/ScreenRouter.tsx` | Dispatches `state.screen` and site screens |
| `src/screens/JourneyStartScreen.tsx` | Avatar offer UI |
| `src/state/journey-state-actions.ts` | `startJourneyFromAvatar`, screen/site/atlas transitions |
| `src/data/journey-content.ts` | Loads normalized journey content and validates Avatar packages |
| `src/atlas/atlas-generator.ts` | Atlas generation, site pools, site metadata, dreamscape creation |
| `src/draft/draft-engine.ts` | Fixed-pool draft logic with 4-card offers and persisted draft state |
| `src/firebase/app-config.ts` | Reads `VITE_FIREBASE_*` env vars and initializes the Firebase app + database |
| `src/runtime/runtime-config.ts` | Parses URL params (`game`, `seed`, `goto`) |

## Adding a New Site Type

At minimum, update the places that define type, routing, and reachability:

1. Add the new variant to `SiteType` in `src/types/journey.ts`.
2. Implement the site UI in `src/screens/`.
3. Route it from `SiteScreen` in `src/components/ScreenRouter.tsx`.
4. Add display metadata to `SITE_TYPE_META` in `src/atlas/atlas-generator.ts`.
5. If the site should spawn normally, add it to `buildAdditionalSitePool()`.
6. If a biome can enhance it, add or update entries in `src/data/biomes.ts`.
7. Add or update tests for atlas generation and the new screen behavior.

Without the atlas pool change, the site is unreachable in normal gameplay.

## Extending Journey State

- Update `JourneyState` in `src/types/journey.ts`.
- Thread the new data through `JourneyContextValue`, `JourneyMutations`, and
  `createDefaultState()` in `src/state/journey-context.tsx`.
- Update any bootstrap/reset helpers that need to preserve or clear the field.
- Add a default in `normalizeJourneyState` (or a nested helper) in
  `src/multiplayer/room-service.ts` if the field can be `null`, `[]`, or
  `{}`. See **Multiplayer Persistence** above.
- Wire the mutation through `multiplayer-journey-context.tsx`. Field-scoped
  writes go through `writeJourneyField`; whole-state replacements go through
  `writeWholeJourneyState`; multi-field invariants go through
  `writeRoomTransaction`.
- Every mutation or state transition that changes journey state should emit a
  `logEvent()` entry. Missing journey logs are a conformance problem.

For tests, prefer the public surface and assert log behavior through
`getLogEntries()` rather than adding test-only hooks.

## Acceptance Criteria

- Use focused checks while iterating, then run the diff-aware `npm run review`
  once the implementation is stable. Use `npm run review:full` for test
  infrastructure, cross-cutting changes, releases, or an explicit full-suite
  request.
- Select browser and visual QA by the risk matrix in
  `docs/journey_prototype/qa_tooling.md`. Browser QA is required for changed
  runtime behavior; screenshot QA is required for changed visual output.
- Always run the relevant persisted-room workflow when a change touches
  `room-service.ts`, `multiplayer-journey-context.tsx`, or reshapes `JourneyState`.

## Browser QA With agent-browser

Confirm the tool is available (it ships via `npx`):

```bash
npx agent-browser --help
npx agent-browser skills get core    # refresher on snapshot/refs/waits
```

### Starting a Server

Pick one. Both work, but they differ:

```bash
npm run dev -- --port 5174           # vite dev with HMR; choose a free non-5173 port
npm run build && npm run preview -- --port 4174
```

Use `npm run preview` if `npm run dev` fails with a chokidar `ELOOP` error
on `.claude/.llms` — that symlink points at itself, and the dev-mode file
watcher chokes on it. The preview server has no watcher and is unaffected.

Use a free, explicit port other than 5173. **Read the actual URL from the server
stdout** before opening agent-browser.

### Open The App

```bash
agent-browser --session <unique-name> open http://localhost:5174/
agent-browser --session <unique-name> wait --load networkidle
agent-browser --session <unique-name> snapshot -i -c
```

The landing screen exposes a single `Create Game` button. Click it; the URL
becomes `?game=<roomId>` and the snapshot reveals the 3-Avatar selection.
Picking an Avatar transitions straight to the first dreamscape.

### Capturing Render-Time Errors

`agent-browser console get` does **not** reliably surface uncaught React
render exceptions or rejected promises — many appear as "white screen, no
console output." Install JS hooks immediately after opening the page so the
buffer is in place before you click anything that triggers a render:

```bash
agent-browser eval "
window.__caps = { errors: [], rejections: [], consoleErrors: [] };
window.addEventListener('error', e => window.__caps.errors.push({
  msg: String(e.message),
  src: e.filename + ':' + e.lineno + ':' + e.colno,
}));
window.addEventListener('unhandledrejection', e =>
  window.__caps.rejections.push(String(e.reason?.stack || e.reason).slice(0, 1500)));
const oce = console.error;
console.error = (...a) => {
  window.__caps.consoleErrors.push(a.map(x => x?.stack || String(x)).join(' | ').slice(0, 1500));
  oce.apply(console, a);
};
'hooks installed'
"
```

After each user action, read the buffer:

```bash
agent-browser eval "JSON.stringify(window.__caps).slice(0, 3000)"
```

The buffer survives client-side route changes but is **wiped by full page
reloads** (`agent-browser open …`). Re-install after a reload.

### Diagnosing A Blank Screen

If `agent-browser snapshot -i -c` returns just
`generic [ref=e1] clickable [onclick]` with no children, React rendered an
empty tree — almost always an unhandled exception during render. Steps:

1. Read `window.__caps.errors` (above) for the message and source line.
2. Inspect the live DOM: `document.getElementById('root')?.children.length`
   should be `> 0` for any healthy screen.
3. Read the room directly from RTDB to compare written vs. expected shape:

   ```bash
   curl -s "https://redacted-firebase-project-default-rtdb.firebaseio.com/rooms/<id>.json" | jq .
   ```

   Missing `null`/empty fields confirm an RTDB-stripping issue — extend
   `normalizeJourneyState`. See **Multiplayer Persistence** above.

### Smoke Path

Use only the relevant portion of this flow. Run the complete path when the
change can affect journey-wide progression or persistence:

1. Open the app and confirm the landing screen renders a single
   **Create Game** button.
2. Click **Create Game**. Confirm the URL gains `?game=<6-char-id>` and the
   snapshot shows exactly 3 Avatar buttons.
3. Pick an Avatar. Confirm the snapshot transitions to the dreamscape
   view (biome heading, list of sites, HUD with Essence/Cards/Signs counts,
   `1 connected` presence indicator).
4. Enter a non-battle site. Battle should stay locked until the other sites
   are visited.
5. Reach a draft site and confirm the offer shows 4 unique cards when enough
   unique cards remain. Pick a card and confirm pick counter and deck size
   advance.
6. Reach a Dreamsign surface when relevant and confirm shown Dreamsigns are
   spent from the shared pool for the run.
7. Complete a battle and confirm atlas progression afterward.
8. Reload the same `?game=<id>` URL and confirm state rehydrates from
   Firebase to the same screen and counts. This validates the RTDB
   round-trip.
9. Open the HUD debug overlay when relevant and verify package/draft summary
   details appear there, not in normal player-facing UI.

### Screenshots

Use the screenshot budget and exceptions in `qa_tooling.md`. A routine visual
change needs at most one desktop, one narrow/mobile, and one changed-interaction
capture; skip any that do not prove a changed branch.

```bash
agent-browser --session <unique-name> screenshot /tmp/qs-desktop.png
agent-browser --session <unique-name> screenshot /tmp/qs-mobile.png
agent-browser --session <unique-name> screenshot /tmp/qs-interaction.png
```

Inspect screenshots visually after capture. Verify:

- card art and Avatar portraits load
- layout spacing is stable
- battle/site buttons are not clipped or overlapped
- HUD values make sense for the current state
- normal screens do not expose package internals

### Logs And Errors

Use the current logging surfaces:

```bash
tail -n 40 /Users/dthurn/quest_prototype/logs/journey-log.jsonl
agent-browser console get | tail -40
agent-browser eval "JSON.stringify(window.__caps)"
```

`window.__journeyLog` and `window.__errors` are not published by the app — use
the JSONL file, the captured `__caps` buffer, and `agent-browser console get`
instead. Watch the dev-server terminal for asset-load errors. If you need a
saved copy from the UI, use the HUD `Download Log` button.

### Firebase Inspection

The dev rules under `database.rules.json` permit anonymous reads on `rooms`,
so you can inspect any room state directly:

```bash
curl -s "https://redacted-firebase-project-default-rtdb.firebaseio.com/rooms/<id>.json" | jq .
curl -s "https://redacted-firebase-project-default-rtdb.firebaseio.com/rooms/<id>/journeyState.json" | jq .
curl -s "https://redacted-firebase-project-default-rtdb.firebaseio.com/rooms/<id>/journeyState/draftState.json" | jq .
```

This is the fastest way to confirm whether a write succeeded and to spot
fields that RTDB stripped.

### Responsive Checks

If the change affects layout, test the responsive branches it can change.
Measure objective geometry first and capture only representative evidence:

```bash
agent-browser eval "window.resizeTo(1280, 800)"
agent-browser screenshot /tmp/qs-desktop.png

agent-browser eval "window.resizeTo(768, 1024)"
agent-browser screenshot /tmp/qs-tablet.png
```
