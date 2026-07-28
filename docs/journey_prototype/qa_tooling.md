# QA Tooling for the Journey Prototype

Browser QA for the journey prototype uses `agent-browser` against a local Vite
server you start on a **non-default port** (the developer's own server owns
`http://localhost:5173`). Do not use WebFetch for localhost, and do not
substitute Python Playwright when `agent-browser` is available in this
environment.

## Select The Smallest QA That Proves The Change

Use focused tests during implementation and run the diff-aware
`npm run review` once the work is stable. Select runtime evidence by risk:

| Change | Runtime evidence |
| --- | --- |
| Data, docs, internal refactor | None unless runtime behavior or presentation changes |
| Stateful UI, routing, drag/drop, coop, overlay | Relevant normal-player browser workflow, state assertions, DOM geometry, and error buffer |
| Visual or responsive UI | Browser workflow plus one desktop capture, one narrow/mobile capture, and one changed interaction state |
| New screen or major redesign | Early representative capture, relevant responsive branches, and one final cold visual review |
| Renderer, shader, compositor | Same-scene feature on/off captures, nonzero target-region contribution, expected-direction metrics, a deliberately broken negative control, and a holistic final image |

Three captures are a budget, not a quota. Skip irrelevant captures, and add a
state or viewport only when it proves a distinct contract. After a correction,
recapture only the affected evidence. Use DOM measurements for overlap,
clipping, overflow, safe-area clearance, dimensions, and hit targets; use
screenshots for the pixels and composition the player sees.

For subjective visual direction, take the first representative screenshot
before running final automated review or generating a large device matrix. Resolve the
direction early, then run the final verification once the design is stable.

## Browser Automation

Confirm the tool is available (it ships via `npx`):

```bash
npx agent-browser --help
```

Start the prototype on your own port, in the background:

```bash
cd /Users/dthurn/quest_prototype
npm install
npm run dev -- --port 5174   # any free non-5173 port; note the PID you launch
```

Drive it from `agent-browser`, and give every call a unique `--session` so your
Chrome is isolated from the shared `default` session (see "Session isolation"
below):

```bash
agent-browser --session qa-5174 open http://localhost:5174
agent-browser --session qa-5174 wait --load networkidle
```

Use the accessibility snapshot to inspect the current screen and find clickable
element refs:

```bash
agent-browser --session qa-5174 snapshot -i
agent-browser --session qa-5174 click @e3
agent-browser --session qa-5174 wait 500
```

## Session Isolation

`agent-browser` is not a fresh browser per command. It runs a **persistent
per-session daemon**; each `agent-browser` call is a thin client that connects
to the daemon, and the daemon keeps one Chrome instance alive between calls
(one tab pool, one active-tab pointer, one viewport / device-emulation state).

Sessions key that daemon. Every bare `agent-browser` call falls into the
session named `default`, so the `default` Chrome is shared across every QA run
on the machine and **persists between runs** — it accumulates stale tabs from
earlier sessions that were never closed. The failure modes this produces:

- Your command lands on a leftover tab pointed at a different server/port
  (an old `?goto=atlas` tab, a `/cumulus` doc page), so your `eval` / `screenshot`
  reads the wrong page.
- Another QA run — yours later, or a second agent concurrently — changes the
  active tab or the viewport out from under you between your commands.

Give each run its own session and none of this happens: a distinct `--session
<name>` (or the `AGENT_BROWSER_SESSION` env var) spins up a **separate Chrome
instance with its own profile directory**, fully isolated from `default` and
from every other named session. So concurrent multi-agent browser QA is fine —
each agent just needs its own session name.

```bash
agent-browser --session qa-5174 open http://localhost:5174   # isolated Chrome
agent-browser session list                                   # active sessions
agent-browser --session qa-5174 close                        # tear down only yours
```

Never run `agent-browser close --all` — it closes every session's browser,
including other agents' and the developer's. If you must use the shared
`default` session anyway, first run `agent-browser tab list`, close stale tabs,
and pin yourself to a known tab (`agent-browser tab <n>`) before acting.

## Assert The Target Before You Act

Element presence is not enough: confirm you are looking at the *right page at
the right size* before every measurement or screenshot. Two silent drifts cause
most false "it's broken" conclusions:

- **Wrong tab.** A shared/stale session may have flipped the active tab. Check
  `location.href` is your server and port.
- **Wrong viewport.** The viewport override can revert (e.g. to a mobile width)
  across an `open` or a target switch. A mobile width renders the **mobile
  variant** of a responsive screen, so a desktop-only selector coming back
  "not found" means *wrong viewport*, not *feature broken*. Re-assert
  `window.innerWidth` and re-run `agent-browser --session <name> set viewport
  <w> <h> 2` if it drifted.

```bash
agent-browser --session qa-5174 eval \
  '({url: location.href, w: window.innerWidth})'
# expect your port and the width you set; if not, fix tab/viewport, then retry
```

## Tearing Down Your Server

`npm run dev -- --port N` launches a **process tree**, not a lone Vite process:

```
npm run dev --port N
└─ node scripts/dev-with-emulator.mjs --port N
   └─ node …/vite --strictPort --port N   (+ Firebase emulator processes)
```

Because Vite's real argument string is `vite --strictPort --port N`, the pattern
`pkill -f "vite --port N"` matches **nothing**. Kill only your own tree, scoped
by port — capture the launch PID and kill the tree, or match the emulator
manager by port (a graceful stop that also shuts down that run's emulators):

```bash
pkill -TERM -f "dev-with-emulator.mjs --port 5174"
lsof -iTCP:5174 -sTCP:LISTEN -n -P   # empty output = the port is free
```

Never run a broad `pkill -f vite` (or `pkill -f "firebase|vite|emulator"`): it
matches every Vite process regardless of port and terminates the developer's
5173 server too.

## Hidden Tides Smoke Path

Use the relevant subset of this hidden-tides migration smoke path. Run the full
path only when the change can affect the complete journey flow:

1. Open your QA server (e.g. `http://localhost:5174`) and confirm the app starts
   on the Dream Avatar selection screen.
2. Verify the journey start shows exactly 3 Dream Avatar choices.
3. Pick one Dream Avatar and confirm the run enters journey play immediately.
4. Reach a draft site and confirm the offer shows 4 unique card names.
5. Continue far enough to see another draft offer and confirm duplicates can
   recur across the run but never inside the same offer.
6. Reach a Dreamsign surface and confirm shown Dreamsigns are spent immediately,
   including skipped ones.
7. Reach a later Dreamsign surface in the same run and confirm no previously
   shown Dreamsign repeats.
8. Open the debug surface, if present, and confirm package summary details are
   visible there without exposing package internals in the normal player flow.

## Screenshots And Inspection

Keep the `--session` you opened with on every call. A routine visual change
starts with the smallest representative set:

```bash
agent-browser --session qa-5174 screenshot /tmp/changed-desktop.png
agent-browser --session qa-5174 screenshot /tmp/changed-mobile.png
agent-browser --session qa-5174 screenshot /tmp/changed-interaction.png
```

Useful inspection commands:

```bash
agent-browser --session qa-5174 snapshot -i
agent-browser --session qa-5174 eval "JSON.stringify(window.__caps)"
```

`window.__journeyLog` and `window.__errors` are not application APIs. Never use
`window.__errors ?? []`: a missing buffer then looks like a clean run. Install
`window.__caps` before the first tested action, reinstall it after every full
page load, and treat a missing buffer as a failed QA setup.

Use these checks during QA:

- The heading contains `Dreamtides`.
- Normal player-facing screens do not expose `mandatoryTides`, `optionalTides`,
  or card `tides`.
- Draft offers remain 4-unique until fewer than 4 unique names remain in the
  pool.
- Dreamsigns do not repeat within one run.
- `window.__caps.errors`, `.rejections`, and `.consoleErrors` stay empty.

After checklist verification, perform one cold read of the final visual
evidence when the task is a new screen, major redesign, or high-risk rendering
change. State what looks suspicious, what was measured, and whether the image
actually demonstrates the requested property. Do not count opening an image as
inspection without recording a conclusion.

## Stop Rule And QA Result

Stop QA when all applicable conditions are true:

1. Focused automated checks pass, and the core suite has passed once on the
   stable implementation.
2. The relevant normal-player workflow succeeds.
3. Changed responsive branches pass objective geometry and interaction checks.
4. `window.__caps` exists and all three captured error arrays are empty.
5. The final visual review has no unresolved medium- or high-severity finding.

Before handoff, emit one compact machine-readable record in the task transcript
so future QA audits do not have to infer causality from tool ordering:

```json
{"qa_result":{"risk":"visual-ui","checks":["focused-tests","browser-workflow","desktop","mobile"],"finding":"overlap","severity":"medium","production_change":true,"source":"geometry","minutes":12}}
```

Use `finding: "none"`, `severity: "none"`, and `production_change: false` for
confirmation-only QA. `source` is one of `automated`, `interaction`, `geometry`,
`screenshot`, or `user-review`.

## TypeScript Module Testing

To invoke TypeScript modules directly (without a browser):

```bash
# Single expression
node --experimental-strip-types -e 'import { fn } from "./src/module.ts"; ...'

# Complex script — write to a file first to avoid shell escaping problems
cat > /tmp/test.mjs << 'EOF'
import { fn } from "/abs/path/to/src/module.ts";
console.log(fn());
EOF
node --experimental-strip-types /tmp/test.mjs
```

Avoid `node -e` with shell-special characters like `!`. Write to a file and run
it instead.

Running `npx tsx` is an alternative if `node --experimental-strip-types` does
not resolve imports correctly.

## Vite SPA Fallback Behavior

Vite serves the HTML fallback document for any path that does not match a static
file. This means a `curl` request for a missing static file (e.g.,
`/tides/Wild.png`) returns HTTP 200 with `Content-Type: text/html`, not 404.
Check the `Content-Type` header rather than the status code when verifying
whether a static file exists:

```bash
curl -s -I http://localhost:5174/tides/Arc.png | grep content-type
# content-type: image/webp  → file exists
# content-type: text/html   → Vite fallback, file missing
```

## TypeScript `as const` at Runtime

TypeScript `as const` arrays are a compile-time constraint only. Testing
mutability at runtime with `.push()` will always succeed, even for correctly
typed `readonly` arrays. Verify readonly enforcement only through
`npm run typecheck`, not through runtime mutation attempts.

## Dev Server Setup

The dev server output confirms the port. If assets are missing, the setup script
logs warnings but continues and the prototype uses placeholders.
