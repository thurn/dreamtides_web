# Pre-existing issues found in hv-umm2.445

- **Battle status badge text is not visible.** `BattleStatusBadges`
  (`src/cumulus/components/battle/BattleStatusBadges.tsx`) renders each
  status as a glyph whose label is only its `aria-label`, with
  `pointer-events: none` and no `InfoCard`. A sighted player sees a bolt on
  a Borrowed Minutes character but cannot read that it is banished at end of
  turn; the same holds for every duration, keyword, cost and payable badge.
- **The battle log's delayed-trigger line names no moment.**
  `engineBattleLogText` (`src/runtime/battle-prompt-messages.ts`, the
  `trigger` floating change) builds its line from `engineStatusLabel`
  without a `moment`, because the log builder has no catalog; its line reads
  as the generic waiting copy.
- **A display test builds an unresolvable floating trigger.**
  `engine-battle-view-model-display.test.ts` ("keeps separate physical
  trigger sources …") pushes `trigger` changes whose `ref` names ability 0 of
  a vanilla card, which has none; the engine would throw on that state. The
  status builder names no moment for such a reference instead of failing.
- **The hv-umm2.86 judged script races the engine probe.**
  `artifacts/qa/hv-umm2.86/judged.mjs` reads `window.__engineProbe` right
  after opening the enemy card lab and throws `probe missing` when the probe
  mounts after the lab reports ready; the hv-umm2.445 adaptation reads it
  as absent until it mounts.
