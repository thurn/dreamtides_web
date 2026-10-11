# hv-umm2.108 pre-existing observations

- No test pins that `Special` cards (Nightmare `b0a2c3d4-e5f6-4789-8abc-0def12345678`,
  Contemplation `69964b8e-0f38-4fb7-a0cd-89430ef04c2d`) stay out of opponent
  filler decks. `NON_POOL_RARITIES` in
  `src/battle/integration/create-battle-init.ts` excludes them, and neither
  card is in any tide pool, so drafts, shops and rewards never offer them,
  but a change to that set would not fail CI. A synthetic test of
  `isEnemyFillerCard` over each excluded rarity would pin it; it lies
  outside this bead's areas.
- `npm run lab:preflight` stages a "when … is dissolved" character only as
  a play that materializes it, so the card lab never fires the trigger:
  Seer of the Fallen's preflight and sweep rows certify its play, not its
  ability. The synthetic contracts and the weighted fuzz cover the trigger.
