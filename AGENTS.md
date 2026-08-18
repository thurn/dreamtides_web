Use the `wt` skill for all work unless explicitly asked to work "on master".

~/.llms/skills/wt/SKILL.md (note this is not project-local)

Never edit files in the main repo directly unless explicitly asked to work "on master".

Perform follow up work on the same worktree as the intial work until promotion.

When work is complete, create one detailed local commit and immediately submit
it with `tg candidate HEAD` for speculative validation without promotion
authority. Do not wait for user approval before committing or scheduling the
candidate. After explicit promotion approval, authorize the exact candidate
with `tg approve <candidate-id>`; Tollgate owns any required regeneration,
certified promotion to `master`, and leased remote push. Worktree branches are
local-only and must never be pushed to a remote.

Do not create new branches unless explicitly requested.

Do not print a summary of changes.

For major work items (e.g. hundreds of non-test lines changed), please request review via the
independent-review skill and fix flagged issues:

 ~/.llms/skills/independent-review

Run one independent review maximum, there is no need to re-run it for follow-up tasks.

Dreamtides battle rules are in docs/battle_rules/battle_rules.md

Write deterministic tests against stable observable contracts using synthetic fixtures; never gate CI on mutable production data, copy, default algorithm choices, private implementation details, statistical or timing thresholds, load-sensitive behavior, or commands that reference deleted tests.

Do not write tests which assert on specific UI strings being used

If you encounter a pre-existing issue, please describe it in ./pre-existing-issues.txt
and include this as part of your commit. 

Do NOT commit image files to version control.

# Coop architecture

Coop game state is a fold of the room event log. React `useState`/`useRef` never
gates game flow; anything both players must agree on is an event in the log.
Clients write intent events only, via `src/coop/actions.ts`.

# Logging

Journey logs live in logs/journey-log.jsonl

All new features should have logging. We should focus on how to answer
questions about algorithm behavior. "If someone asked me to reconstruct
what this algorithm did in a given production game, would I be able to?"

Read logs for all production game design debugging.

# Cards

Card data lives in data/cards.ron

Avatars live in data/avatars.ron

Please always identify cards by UUID, *never* by card name.

Card names ARE NOT UNIQUE. Creating a map or set keyed by card name
or comparing card names for equality is ALWAYS A BUG. Eradicate
this practice proactively when spotted. Names should be resolved
immediately before display in the UI, all other code should use
UUIDs.

# Generation

Generated compatibility data, runtime catalogs, typed token mirrors, Cumulus
metadata, and localization adapters are disposable workspace materializations.
Normal development, review, test, build, and deploy commands refresh them
automatically through `scripts/prepare-workspace.mjs`. Do not edit or commit
generated outputs.

# Draft Pools

Unless otherwise specified, assume all draft questions are about the "tides4"
draft pool construction algorithm and that the source data for drafts lives
in data/tides.ron and the embedded tide pools in data/avatars.ron.


# Selection Data

Card, Dreamsign, Avatar, and affiliation selection derives from the
canonical RON catalogs. `data/tides.ron` defines the shared affinity space.

# Verification

Use focused tests and checks while iterating. Once the implementation is stable,
run the diff-aware local review before committing:

```bash
npm run review
```

Run the commands from the repository root. In a fresh worktree, run
`npm install` before this check because `node_modules` is not committed.
`npm run review` validates affected generated data, lints changed code,
typechecks type-affecting changes, and runs tests related to the diff with one
worker. Use focused test paths while iterating:

```bash
npm test -- src/path/to/affected.test.ts
```

The exhaustive commands are `npm run lint:full`, `npm run test:full`, and
`npm run review:full`. Run them only for changes to test infrastructure,
repository-wide configuration, cross-cutting architecture, release validation,
or when the user explicitly asks. CI runs `npm run review:full`.

Choose QA in proportion to the change:

- Data, documentation, and internal refactors: focused checks while iterating,
  then the diff-aware review. Browser QA and screenshots are not required unless the
  change alters runtime behavior or presentation.
- Stateful UI, routing, drag/drop, coop, and overlays: exercise the changed
  normal player workflow with browser QA. Assert state, interaction results,
  DOM geometry, and the captured error buffer.
- Visual or responsive changes: add targeted screenshot inspection. The
  routine budget is one desktop capture, one narrow/mobile capture, and one
  changed interaction state. Recapture only an affected viewport after a fix.
- New screens, major redesigns, and renderer/compositor work: expand the state
  and viewport matrix where each extra capture proves a distinct risk. Require
  one final cold visual review; renderer work also needs same-scene on/off and
  deliberately broken negative controls.

For applicable journey prototype UI work, run browser QA through the globally
configured Playwright MCP service against a local Vite server. The singleton
HTTP service shares one headless Chromium process while giving each MCP client
an isolated BrowserContext. Prefer accessibility/DOM snapshots and Playwright
locators for routine interaction; capture screenshots only when rendered
appearance is relevant. Do not directly launch Chrome, Chromium, Playwright
browsers, Selenium, or a separate browser-automation CLI. Start the QA Vite
server on a port other than `http://localhost:5173` (for example
`npm run dev -- --port 5174`) so QA does not kill the developer's own server
already running on the default port.
To QA screens that are otherwise reachable only by playing battles forward (for
example the Dream Atlas boss preview), append `?goto=<scene>` to the dev URL (e.g.
`http://localhost:5174/?goto=atlas`) to boot straight onto that screen. The
registered scenes and the full `?goto=` mechanics are documented in
`docs/journey_prototype/qa_scenes.md` (source of truth: `src/runtime/qa-scenes.ts`).

MCP clients are isolated automatically; reuse the current task's BrowserContext
for its walkthrough and close only that context when QA is complete. Assert
`location.href` + `window.innerWidth` before each screenshot, and tear down only
your own server — `npm run dev` spawns a
`dev-with-emulator.mjs`/`vite --strictPort` tree, so `pkill -f "vite --port N"`
misses it and a broad `pkill -f vite` kills the developer's 5173 server. Full
session, assert-before-acting, and teardown detail is in
[docs/journey_prototype/qa_tooling.md](docs/journey_prototype/qa_tooling.md).

Validate the relevant feature through the normal player workflow, inspect the
captured `window.__caps` buffer for render errors,
unhandled rejections, and console errors, and check the UI state directly in
the browser. Confirm controls are usable, expected state changes occur, text
and controls are fully visible, layout spacing is stable, elements are free of
clipping or overlap, and the resulting screen is visually coherent at the
selected viewport sizes. Prefer DOM measurements for objective layout claims;
use screenshots for rendered appearance and holistic composition. Stop when
focused checks pass, the relevant workflow and responsive branches pass, the
error buffer is empty, and the final visual review has no unresolved material
finding. Do not repeat the full suite or full screenshot matrix after every
small visual adjustment. Full Playwright MCP context, teardown, and
assert-before-acting details are in `docs/journey_prototype/qa_tooling.md`.

# Deploy

Deploy the prototype to production with `npm run deploy` (`scripts/deploy.sh`). It runs every step needed to make production match local: builds `dist/`, deploys it to Firebase Hosting, and uploads the binary art to the Storage bucket. Art is served from the bucket — not Hosting — so a Hosting-only deploy leaves newly-keyed art 404ing; `npm run deploy` covers both origins.

The build needs a populated `.env` + `.env.production` (gitignored) with the `VITE_FIREBASE_*` config and `VITE_ASSET_BASE_URL`, and fails fast if those vars are missing. The art upload needs an authenticated `gcloud` with write access to the bucket (`gcloud auth login`; see docs/journey_prototype/asset-hosting.md).

# Documentation style

Do not describe what the system *no longer* does. Documentation should describe
the current system as it exists, not contrast it against removed behaviour.
Phrasings like "X no longer exists", "there is no longer a Y", "this is no
longer used", "we removed Z", or "unlike before" are not acceptable in
documentation. Write the current state directly.
