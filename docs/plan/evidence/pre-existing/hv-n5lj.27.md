# Pre-existing issues found by hv-n5lj.27

- **Journey Dreamwell reveals could render empty.** The battle screen looked
  up each revealed Dreamwell card in the sandbox Dreamwell deck that
  `createBattleInit` built (four cycles of five shuffled cards per order),
  while the engine builds its own deck from the whole catalog. A card the
  sandbox deck happened to leave out (about one in seven order-3 cards per
  battle) showed no reveal visual and no battle-log name. This bead resolves
  it: the screen resolves Dreamwell display data from the loaded catalog.
- **Sandbox `BattleInit` keeps journey-only fields** (`src/battle/types.ts`,
  outside this bead's areas): `openingHandEventDrawCardUuids`,
  `openingHandEventDrawEntryIds`, `journeyDeckEntries`, `isFinalBoss`,
  `opponentsContentHash`, `dreamsignSummaries`, and `atlasSnapshot` are set
  by the tutorial init and read by nothing, and the `bug-039`
  comment on `startingSide` names invariants "enforced in
  `create-battle-init.ts`", which builds only journey battles.
- **Journey battle `LOAD_STATE` validation is structural**
  (`asValidJourneyBattle` in `src/rules/journey/lifecycle.ts`): it accepts any
  record as the journey init, so a payload missing `cardDefinitions` loads
  and then throws in the battle screen.
- **The seed-1 Greedy battle scenario varies between runs**
  (`artifacts/qa/hv-n5lj.24/battle.mjs`, reused here): the desktop battle log
  sometimes omits the opponent's two "moved to the back rank" lines (13 vs 11
  lines). `hv-n5lj.24`'s own before/after/rerun reports show both lengths, and
  this bead's desktop rerun matches its base capture pixel for pixel.
