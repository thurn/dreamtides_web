# QA Tooling for the Journey Prototype

Browser QA for the journey prototype uses the globally configured Playwright
MCP service against a local Vite server on a **non-default port**. The
developer's own server owns `http://localhost:5173`.

The Playwright MCP endpoint is `http://localhost:8931/mcp`. A launchd service
keeps one HTTP server available to all Codex tasks. Concurrent MCP clients share
its headless Chromium process and receive independent BrowserContexts, cookies,
storage, tabs, navigation state, and viewport state. Use
`playwright-mcp-service status` to inspect it and
`playwright-mcp-service start` when it is not loaded.

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
before running final automated review or generating a large device matrix.
Resolve the direction early, then run final verification once the design is
stable.

## Browser Automation

Start the prototype on your own port:

```bash
npm install
npm run dev -- --port 5174
```

Read the actual URL from server stdout. Navigate there with
`browser_navigate`, then use `browser_snapshot` to inspect the accessibility
tree and find stable targets. Prefer snapshot references, roles, labels, test
IDs, and Playwright locators for routine interaction. Use `browser_click`,
`browser_fill_form`, `browser_type`, `browser_drag`, and `browser_wait_for` for
normal workflows.

Use `browser_evaluate` for state and geometry that snapshots cannot establish.
Use `browser_console_messages` and `browser_network_requests` for diagnostics.
Reserve `browser_run_code_unsafe` for compact scripted checks that the focused
tools cannot express.

Close the task's context with `browser_close` when QA is complete. Leave the
singleton Playwright MCP service running for other tasks.

## Assert The Target Before You Act

Element presence is not enough. Before every measurement or screenshot,
evaluate:

```js
() => ({ href: location.href, width: innerWidth, height: innerHeight })
```

Confirm the URL contains the task's server port and the viewport matches the
intended responsive branch. Set the CSS viewport with `browser_resize` and
repeat the assertion after navigation or a target switch.

## Capturing Render-Time Errors

Install the error buffer with `browser_evaluate` immediately after navigation
and before the first tested interaction:

```js
() => {
  window.__caps = { errors: [], rejections: [], consoleErrors: [] };
  window.addEventListener('error', event => window.__caps.errors.push({
    message: String(event.message),
    source: `${event.filename}:${event.lineno}:${event.colno}`,
  }));
  window.addEventListener('unhandledrejection', event =>
    window.__caps.rejections.push(
      String(event.reason?.stack || event.reason).slice(0, 1500),
    ));
  const originalConsoleError = console.error;
  console.error = (...args) => {
    window.__caps.consoleErrors.push(
      args.map(value => value?.stack || String(value)).join(' | ').slice(0, 1500),
    );
    originalConsoleError.apply(console, args);
  };
  return 'hooks installed';
}
```

After each meaningful action, evaluate `() => window.__caps`. Client-side
route changes preserve the buffer; a full page navigation requires installing
it again. A missing buffer is a failed QA setup.

If the accessibility snapshot contains only an empty generic root, inspect
`window.__caps`, check that
`document.getElementById('root')?.children.length > 0`, and inspect failed
network requests.

## Tearing Down Your Server

`npm run dev -- --port N` launches a process tree:

```text
npm run dev --port N
└─ node scripts/dev-with-emulator.mjs --port N
   └─ node …/vite --strictPort --port N (+ Firebase emulator processes)
```

Track the process or launchd label created for the task and stop exactly that
tree. Verify the chosen port is free afterward:

```bash
lsof -iTCP:5174 -sTCP:LISTEN -n -P
```

## Hidden Tides Smoke Path

Use the relevant subset of this hidden-tides migration smoke path. Run the full
path only when the change can affect complete journey flow:

1. Open the QA server and confirm the app starts on Avatar selection.
2. Verify the journey start shows exactly 3 Avatar choices.
3. Pick one Avatar and confirm the run enters journey play immediately.
4. Reach a draft site and confirm the offer shows 4 unique cards.
5. Continue to another draft and confirm duplicates can recur across the run
   but never inside one offer.
6. Reach a Dreamsign surface and confirm shown Dreamsigns are spent immediately,
   including skipped ones.
7. Reach a later Dreamsign surface and confirm no shown Dreamsign repeats.
8. Open the debug surface, if present, and confirm package summary details stay
   out of the normal player flow.

## Screenshots And Inspection

Use `browser_take_screenshot` only when appearance is relevant. For review
artifacts, use `scale: "device"`; the shared service creates contexts at 2×
device scale. Save screenshots under the task worktree, verify their dimensions
with `file`, and inspect them visually after capture.

For a desktop/laptop layout sweep, use the screenshot matrix:

```bash
npm run screenshots:desktop -- --start --smoke
```

The matrix connects to the same singleton MCP service, captures with an
isolated context, and records URL, viewport, root, scroll, image, readiness,
and error-buffer assertions in `manifest.json`. Review contact sheets first and
open full-resolution cells only when a thumbnail looks suspicious. Artifacts
live under `artifacts/journey-desktop-screenshots/<run-id>/`.

During QA confirm:

- the heading contains `Dreamtides`;
- normal player-facing screens do not expose `mandatoryTides`, `optionalTides`,
  or card `tides`;
- draft offers remain 4-unique until fewer than 4 unique cards remain;
- Dreamsigns do not repeat within one run; and
- `window.__caps.errors`, `.rejections`, and `.consoleErrors` stay empty.

## Stop Rule And QA Result

Stop QA when all applicable conditions are true:

1. Focused automated checks pass, and the core suite has passed once on the
   stable implementation.
2. The relevant normal-player workflow succeeds.
3. Changed responsive branches pass objective geometry and interaction checks.
4. `window.__caps` exists and all three captured error arrays are empty.
5. The final visual review has no unresolved medium- or high-severity finding.

Before handoff, emit one compact machine-readable record in the task transcript:

```json
{"qa_result":{"risk":"visual-ui","checks":["focused-tests","browser-workflow","desktop","mobile"],"finding":"none","severity":"none","production_change":false,"source":"interaction","minutes":12}}
```

`source` is one of `automated`, `interaction`, `geometry`, `screenshot`, or
`user-review`.
