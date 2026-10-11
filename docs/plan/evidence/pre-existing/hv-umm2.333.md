# Pre-existing issues found by hv-umm2.333

- `src/engine/triggers/matcher.ts` (`matchListener` at a `dissolved` event): a stolen character's own ▸Dissolved ability triggers for its owner, from its owner's void, while its "when this leaves play" abilities trigger for the player who controlled it as it left play, and its "when … is dissolved" abilities do too (RD-hv-umm2.333-1). rules.md § Ability Types says only that ▸Dissolved "triggers from wherever the dissolved card went"; who controls it under gain control is undecided.
