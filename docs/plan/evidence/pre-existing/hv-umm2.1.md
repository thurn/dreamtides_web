# hv-umm2.1 pre-existing issues

- **The enemy-deck fallback can deal Special and Tutorial cards.**
  `finalizeEnemyDeck` and `padEnemyDeck` in
  `src/battle/integration/create-battle-init.ts` fill an enemy deck from every
  catalog card that is not a starter and has a numeric cost. That filter
  admits Nightmare (`b0a2c3d4-e5f6-4789-8abc-0def12345678`), Contemplation
  (`69964b8e-0f38-4fb7-a0cd-89430ef04c2d`), and the Tutorial card
  (`229ab3a1-3720-41a2-924c-8fe112188f8e`). It runs when the tide-built opponent deck is shorter than
  `minimumDeckSize` or no opponent build is chosen. Journey opponent decks
  otherwise draw only from the tides4 pools, which hold no Special or
  Tutorial card. C1 says Contemplation never appears in opponent decks, so
  the filler should also skip the `Starter`, `Tutorial`, and `Special`
  rarities, as `selectReward` in `src/reward-selection/selectReward.ts` does.
