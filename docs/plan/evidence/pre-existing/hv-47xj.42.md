# hv-47xj.42 issues outside the offer-usability move

- **`matchesPredicate` is copied into six more modules.** The Exploration
  predicate check that `src/exploration/offer-usability.ts` exports also has
  private copies in `src/exploration/compound-action-plan.ts`,
  `src/exploration/multi-card-replacement-plan.ts`,
  `src/exploration/multi-card-transfiguration-plan.ts`,
  `src/exploration/random-deck-target-plan.ts`,
  `src/reward-selection/selectReward.ts`, and
  `src/session/providers/exploration-provider.ts`. The preparation planners
  and the offer-usability check can drift apart on what "cheap character"
  means; one shared predicate would prevent that.
- **Exploration resolution builders share card-choice helpers with the
  offer view.** The `*RewardForResolution` builders in
  `src/screens/cumulus_adapters/exploration-view-model.ts` (about 1,800
  lines) read `deckCardChoice`, `offeredCards`, `dreamsignChoices`,
  `dreamsignById`, `avatarById`, `modelForCard`, `authoredEssencePerSpark`,
  and `unpreparedEffect`, which the action views also use, while
  `buildExplorationSiteView` calls `rewardForResolution`. Moving the builders
  into their own module without an import cycle needs those helpers in a
  shared card-choice view-model module first.
