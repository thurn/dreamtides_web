# hv-47xj.16 issues outside the dead-code sweep

Carried forward from the legacy `pre-existing-issues.txt`:

- **Hastened glossary gap.** The Hastened transfiguration has no entry in
  `src/content/glossary.ts`, so card-text tooltips and the glossary popup
  cannot explain it. Needs authored copy.
- **Slug identity for dreamscapes and guides.** Dreamscapes and Dream Guides
  are identified at runtime by art-key slugs (`firstlight_meadow`,
  `tobias_tanglefur`) rather than their catalog UUIDs, in
  `src/content/dreamscapes.ts`, `src/content/guides.ts`, and the guide
  references in `src/content/sites.ts`, contrary to the UUID invariant.
- **QA scenes are not reproducible.** With `?goto=<scene>&seed=7`, most
  scenes (Atlas layouts, site offers, Avatar choices, battle hands) render
  different content on each load. Guide dialogue picks its line with
  `Math.random()` on each mount
  (`src/screens/cumulus_adapters/guide-dialogue-view-model.ts`).
- **Journey-menu error fallback is hidden.** The
  `overlay:cumulus-journey-menu` error boundary's fallback paints beneath the
  dreamscape layer, so its title is hidden and its Retry, Recover Game, and
  Export Log buttons cannot be clicked.

Found by this bead:

- **Single-controller playtest machinery.** `TAKE_PLAYTEST_CONTROL`,
  `FoldState.playtestControl`, the reducer's `authorizePlaytestIntent` and
  `observer_read_only` bounce, `src/session/single-controller.ts`, and
  `isCurrentPlaytestController` in `src/state/front-door-context.tsx` arbitrate
  between clients of one game. Deleting them needs edits in `src/battle/` and
  `src/rules/battle/` (the tutorial battle controller and battle events), so
  it belongs with the Phase 4/6 tutorial port.
- **Multi-client and relocation narration.** About 25 comments describe
  "two clients folding the same event" or "every client" (for example
  `src/rules/journey/draft.ts`, `src/session/providers/*.ts`,
  `src/draft/draft-engine.ts`, `src/eventlog/rng.ts`), and the
  `src/rules/journey/*.ts` case comments narrate the "legacy" mutation each
  case relocated. Both describe history rather than the current system.
- **`LegacyPromptText` has no producer.** Nothing creates the
  `legacy-prompt-text` prompt kind in `src/data/dreamwell-prompts.ts`; its
  readers are `src/battle/components/battle-prompt-logging.ts` and
  `src/screens/cumulus_adapters/mobile-battle-view-model.ts`. Remove it with
  the sandbox in Phase 4.
- **Sandbox room comment.** `src/battle/types.ts` (line 601) says a reveal is
  "shared through the room fold".
- **Genesis economy literals.** `genesisJourneyState` in
  `src/rules/fold-state.ts` falls back to literal `200` and `12` when a
  genesis has no pinned economy. The replay fixtures' genesis
  (`scripts/regenerate-replay-fixtures.mjs`) pins only `poolVariant`, so
  making the fields required means regenerating the fixtures.
- **`tsconfig.node.json` does not typecheck.** `npx tsc -p tsconfig.node.json`
  fails because `vite.config.ts` imports `./src/types/build-identity.ts` with
  a `.ts` extension outside that project's file list. The review typecheck
  does not run it.
