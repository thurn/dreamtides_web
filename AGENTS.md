Use the `wt` skill for all work unless explicitly asked to work "on master".

Never edit files in the main repo directly unless explicitly asked to work "on master".

Perform follow up work on the same worktree as the intial work until promotion.

*Always* commit changes with detailed description, then `git push` immediately.

Do not create new branches unless explicitly requested.

Do not print a summary of changes.

Dreamtides battle rules are in docs/battle_rules/battle_rules.md

Do not write tests which fail when I change my production TOML files
or change things like default algorithm chocies. Assume all TOML
game design data is subject to change at any time.

If you encounter a pre-existing issue, please describe it in ./pre-existing-issues.txt
and include this as part of your commit. 

When analyzing images, assume your perception of color is incorrect, prefer to
directly measure it.

Never generate UI mockups as images; write code instead.

# Coop architecture

Coop game state is a fold of the room event log. React `useState`/`useRef` never
gates game flow; anything both players must agree on is an event in the log.
Clients write intent events only, via `src/coop/actions.ts`.

# Logging

Quest logs live in logs/quest-log.jsonl

All new features should have logging. We should focus on how to answer
questions about algorithm behavior. "If someone asked me to reconstruct
what this algorithm did in a given production game, would I be able to?"

Read logs for all production game design debugging.

# Cards

Card data lives in data/tabula/cards_v2.toml

Dreamcallers live in data/tabula/dreamcallers_v2.toml

Please always identify cards by UUID, *never* by card name.

Card names ARE NOT UNIQUE. Creating a map or set keyed by card name
or comparing card names for equality is ALWAYS A BUG. Eradicate
this practice proactively when spotted. Names should be resolved
immediately before display in the UI, all other code should use
UUIDs.

# Generation

You can run `scripts/regenerate-assets.sh` to update generated artifacts
based on TOML data changes etc. Run this script after creating a new worktree
and include its output with your commit.

# Draft Pools

Unless otherwise specified, assume all draft questions are about the "tides4"
draft pool construction algorithm and that the source data for drafts lives
in data/tides4.jsonc


# Draft Data

The directory docs/draft_records_adapted/ has a high quality set of data about real Dreamtides drafts.

There are many other legacy directories with draft data, consumed by some of our algorithms, but this
data is much lower quality. Assume we want to migrate all code to consume `draft_records_adapted`, and
only use `draft_records_adapted` going forward.

# Verification

Use focused tests and checks while iterating. Once the implementation is stable,
run the complete core checks before committing:

```bash
npm run lint
npm run typecheck
npm test
```

Run the commands from the repository root. In a fresh worktree, run
`npm install` before these checks because `node_modules` is not committed.

Choose QA in proportion to the change:

- Data, documentation, and internal refactors: focused checks while iterating,
  then the core checks. Browser QA and screenshots are not required unless the
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

For applicable quest prototype UI work, run browser QA with `/opt/homebrew/bin/agent-browser`
against a local Vite server. `npx agent-browser` is an acceptable fallback when
the Homebrew-installed binary is unavailable. Start the QA Vite server on a port
other than `http://localhost:5173` (for example `npm run dev -- --port 5174`) so
QA does not kill the developer's own server already running on the default port.
To QA screens that are otherwise reachable only by playing battles forward (for
example the Dream Atlas boss preview), append `?goto=<scene>` to the dev URL (e.g.
`http://localhost:5174/?goto=atlas`) to boot straight onto that screen. The
registered scenes and the full `?goto=` mechanics are documented in
`docs/quest_prototype/qa_scenes.md` (source of truth: `src/runtime/qa-scenes.ts`).

Isolate every `agent-browser` call with a unique `--session <name>` (the shared
`default` session is one persistent Chrome that keeps stale tabs and viewport
across runs), assert `location.href` + `window.innerWidth` before each
screenshot, and tear down only your own server — `npm run dev` spawns a
`dev-with-emulator.mjs`/`vite --strictPort` tree, so `pkill -f "vite --port N"`
misses it and a broad `pkill -f vite` kills the developer's 5173 server. Full
session, assert-before-acting, and teardown detail is in
[docs/quest_prototype/qa_tooling.md](docs/quest_prototype/qa_tooling.md).

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
small visual adjustment. Full `agent-browser` session, teardown, and
assert-before-acting details are in `docs/quest_prototype/qa_tooling.md`.

# Deploy

Deploy the prototype to production with `npm run deploy` (`scripts/deploy.sh`). It runs every step needed to make production match local: builds `dist/`, deploys it to Firebase Hosting, and uploads the binary art to the Storage bucket. Art is served from the bucket — not Hosting — so a Hosting-only deploy leaves newly-keyed art 404ing; `npm run deploy` covers both origins.

The build needs a populated `.env` + `.env.production` (gitignored) with the `VITE_FIREBASE_*` config and `VITE_ASSET_BASE_URL`, and fails fast if those vars are missing. The art upload needs an authenticated `gcloud` with write access to the bucket (`gcloud auth login`; see docs/quest_prototype/asset-hosting.md).

# Documentation style

Do not describe what the system *no longer* does. Documentation should describe
the current system as it exists, not contrast it against removed behaviour.
Phrasings like "X no longer exists", "there is no longer a Y", "this is no
longer used", "we removed Z", or "unlike before" are not acceptable in
documentation. Write the current state directly.
