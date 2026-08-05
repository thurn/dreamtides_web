---
name: implement-exploration-encounters
description: Implement selected Dreamtides exploration encounter designs from data/exploration_candidates.json in the live data/tabula/exploration.toml catalog. Use when finding candidate card UUIDs absent from live Exploration, generating a selected encounter TOML workset, integrating one or more candidate encounters, adding or extending Exploration effect kinds, building Cumulus choice and outcome UI, creating mandatory outcome animations, or verifying a candidate encounter end to end.
---

# Implement Exploration Encounters

Ship selected candidate designs as replayable live Exploration behavior. Treat
the generated TOML as an authoring scaffold: every action still needs an
explicit runtime effect, complete UI, and a persisted-resolution animation that
shows the player exactly what happened.

## Establish the worktree and workset

1. Invoke `$wt` before reading repository data. Continue follow-up work in the
   same unpromoted worktree.
2. Run `npm install`, then run `scripts/regenerate-assets.sh` as required by the
   repository instructions.
3. Create a temporary run directory outside the repository and prepare the
   workset from the repository root:

   ```bash
   ENCOUNTER_RUN_DIR="$(mktemp -d)"
   node .llms/skills/implement-exploration-encounters/scripts/prepare-workset.mjs \
     --out "$ENCOUNTER_RUN_DIR/encounter_candidates.toml"
   ```

   Add one `--card-id <uuid>` per requested encounter when the user specifies a
   subset. Never select by card name. Without `--card-id`, include every
   candidate UUID absent from live `exploration.toml`.
4. Read the printed UUID report and the generated TOML. A candidate is
   represented when its canonical source-card UUID equals a live encounter
   `card-id`, case-insensitively. Stop with the report when the selected set is
   empty.
5. Keep the workset as scratch input. Do not commit it or copy it wholesale over
   `data/tabula/exploration.toml`.

The preparation script delegates selected-prose/action rendering to the
repository's `generate-selected-encounters-toml.mjs`, validates both catalogs,
rejects duplicate live UUIDs, and omits represented candidates. Use `--format
json` for machine-readable reporting and `--force` only to deliberately replace
an existing scratch workset.

## Convert designs into runtime mechanics

For each action, read its `template-id`, `template-variables`, `selection`, and
rendered `effect-text` together with the canonical template in
`data/templates.json`.

- Reuse an existing `effect-kind` only when its state transition, offer
  preparation, selection contract, logged result, and outcome presentation are
  semantically identical.
- Add a new `effect-kind` when the action changes state differently or needs
  distinct persisted result data. Do not encode new mechanics as label or
  effect-text interpretation.
- Keep UUIDs through catalogs, offers, selections, resolution, logs, and tests.
  Resolve names only at the final display boundary.
- Preserve the generated provenance fields and add the runtime fields required
  by the chosen effect kind.

Read [references/implementation-guide.md](references/implementation-guide.md)
before changing an effect kind, Cumulus presentation, logging, or animation. It
contains the vertical-slice file map, outcome-animation contract, and test
matrix.

## Implement the complete vertical slice

1. Extend authored-data validation and editor metadata for every new effect
   field.
2. Mint random offers when the site runtime is created, persist them in the
   room event log, and make resolution a deterministic fold over UUID-only
   intent. React state may sequence presentation after resolution; it must not
   gate shared game flow.
3. Persist every exact result required for replay, logging, and presentation:
   selected IDs, gained or purged IDs, affected deck-entry IDs, before/after
   semantics, resource deltas, and any rolled choice.
4. Invoke `$cumulus` before changing Exploration UI. Build any choice surface
   from Cumulus components and tokens.
5. Add a semantic outcome view-model and a dedicated animation for every new
   outcome. A resolved action must never fall through to `reward: null` merely
   because its state update succeeded. Selection UI, generic success copy, or
   closing the encounter does not satisfy this requirement.
6. Update Exploration logs so a production event sequence can reconstruct the
   authored action, minted offers, player selection, state transition, and
   displayed outcome.
7. Add the completed encounters to `data/tabula/exploration.toml`. Keep exactly
   two actions per encounter and globally unique action IDs.
8. Make catalog validation structural rather than tying CI to the current
   production encounter count.

Pre-existing issues are not an excuse. If existing Exploration code fails any
requirement in this skill, including replayability, logging, Cumulus behavior,
or the mandatory dedicated outcome animation, fix it in the same worktree. Use
`pre-existing-issues.txt` only for unrelated issues outside this implementation;
never file and defer a failing dependency of the encounter being shipped.

## Verify behavior and presentation

Run the workset verifier after the live TOML is authored:

```bash
node .llms/skills/implement-exploration-encounters/scripts/verify-workset.mjs \
  --workset "$ENCOUNTER_RUN_DIR/encounter_candidates.toml"
```

Then:

1. Run focused synthetic tests for data compilation, deterministic offers and
   resolution, replay, logging, view-model output, interaction, and the exact
   outcome animation.
2. Run `scripts/regenerate-assets.sh` and inspect its tracked output.
3. Exercise the normal player workflow with `agent-browser` on a non-default
   port using `/?goto=exploration&card=<card-uuid>`. Test every new action, not
   only encounter entry.
4. Assert the persisted state change, outcome-animation selector and semantic
   data attributes, animation completion/exit behavior, responsive geometry,
   accessible result text, and an empty `window.__caps` error buffer.
5. Inspect one desktop, one narrow/mobile, and one changed outcome-state capture
   when each proves a distinct visual risk. Reduced motion must still present
   the exact outcome with zero-duration or simplified choreography.
6. Run `npm run review` after focused checks pass. Request the repository's one
   independent review for a major implementation.

Do not accept an encounter because TOML compiles while an effect, UI branch,
animation, log field, or responsive state remains pending.

## Deliver

Commit the complete implementation with a detailed message, push the worktree
branch immediately, and perform the `$wt` review/promotion handoff. Keep any
visual review artifacts out of version control.
