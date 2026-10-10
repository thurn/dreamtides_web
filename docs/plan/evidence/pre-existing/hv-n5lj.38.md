# Pre-existing issues found by hv-n5lj.38

- `src/runtime/qa-scenes.ts` (`JOURNEY_COMPLETE_SCENE`): the scene parks the
  run on `journeyComplete` with `currentDreamscape` set to the completed boss
  node, a state the fold invariants reject for a played run
  (`journey_complete_inconsistent`, `current_dreamscape_not_available`);
  END_BATTLE's victory clears `currentDreamscape`.
