Unless a prompt starts with "master", please load the `wt` skill for all requests
and perform all work in a temporary git worktree as described there.

*Always* commit changes with detailed description, then `git push` immediately.

Do not create new branches unless explicitly requested.

Do not print a summary of changes.

Dreamtides battle rules are in docs/battle_rules/battle_rules.md

# Cards

Card data lives in data/tabula/cards_v2.toml

Legacy cards are in data/tabula/rendered-cards.toml, this is
no longer used and kept for historical reference.

Dreamcallers live in data/tabula/dreamcallers_v2.toml

Ignore all metadata systems on cards like "tides", "tags",
"archetypes", etc. These are all legacy. Tides no longer
exist.

Please always identify cards by UUID, *never* by card name. A lot of our
legacy algorithm code does this and it's a huge nightmare to support.

# Draft Data

The directory docs/draft_records_adapted/ has a high quality set of data about real Dreamtides drafts.

There are many other legacy directories with draft data, consumed by some of our algorithms, but this
data is much lower quality. Assume we want to migrate all code to consume `draft_records_adapted`, and
only use `draft_records_adapted` going forward.

# Verification

Run the core checks after code changes:

```bash
npm run lint
npm run typecheck
npm test
```

Run the commands from the repository root. In a fresh worktree, run
`npm install` before these checks because `node_modules` is not committed.

For quest prototype UI work, run browser QA with `/opt/homebrew/bin/agent-browser`
against a local Vite server. `npx agent-browser` is an acceptable fallback when
the Homebrew-installed binary is unavailable. Start the QA Vite server on a port
other than `http://localhost:5173` (for example `npm run dev -- --port 5174`) so
QA does not kill the developer's own server already running on the default port.
When tearing down the QA server, kill only the process you started — capture its
PID at launch, or match its exact port (`pkill -f "vite --port 5174"`). Never run
a broad `pkill -f vite` (or `pkill -f "firebase|vite|emulator"`): it matches
every Vite process regardless of port and terminates the developer's 5173 server
too. Validate the feature through the
normal player workflow, inspect the captured error buffer for render errors,
unhandled rejections, and console errors, and check the UI state directly in
the browser. Confirm controls are usable, expected state changes occur, text
and controls are fully visible, layout spacing is stable, elements are free of
clipping or overlap, and the resulting screen is visually coherent at the
tested viewport sizes.

# Documentation style

Do not describe what the system *no longer* does. Documentation should describe
the current system as it exists, not contrast it against removed behaviour.
Phrasings like "X no longer exists", "there is no longer a Y", "this is no
longer used", "we removed Z", or "unlike before" are not acceptable in
documentation. Write the current state directly.
