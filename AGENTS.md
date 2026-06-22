*Always* commit changes with detailed description, then `git push` immediately.

Do not create new branches unless explicitly requested.

Do not print a summary of changes.

Dreamtides battle rules are in docs/battle_rules/battle_rules.md

Do not write tests which fail when I change my production TOML files
or change things like default algorithm chocies. Assume all TOML
game design data is subject to change at any time.

If you encounter a pre-existing issue, please describe it in ./pre-existing-issues.txt
and include this as part of your commit. 

# Logging

Quest logs live in logs/quest-log.jsonl

All new features should have logging. We should focus on how to answer
questions about algorithm behavior. "If someone asked me to reconstruct
what this algorithm did in a given production game, would I be able to?"

Read logs for all production game design debugging.

# Cards

Card data lives in data/tabula/cards_v2.toml

Dreamcallers live in data/tabula/dreamcallers_v2.toml

Ignore all metadata systems on cards like "tides", "tags",
"archetypes", etc. These are all legacy. Tides no longer
exist.

Please always identify cards by UUID, *never* by card name. A lot of our
legacy algorithm code does this and it's a huge nightmare to support.

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
To QA screens that are otherwise reachable only by playing battles forward (for
example the Dream Atlas boss preview), append `?goto=<scene>` to the dev URL (e.g.
`http://localhost:5174/?goto=atlas`) to boot straight onto that screen. The
registered scenes and the full `?goto=` mechanics are documented in
`docs/quest_prototype/qa_scenes.md` (source of truth: `src/runtime/qa-scenes.ts`).
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
