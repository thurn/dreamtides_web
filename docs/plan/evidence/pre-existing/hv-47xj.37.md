# Pre-existing issues found by hv-47xj.37

- `BattleInit.dreamscapeId` (`src/battle/types.ts`) and
  `JourneyFailureSummary.dreamscapeIdOrNone` (`src/types/journey.ts`) hold an
  `AtlasNodeId`, not a `DreamscapeId`. The field names say otherwise, and
  readers index `atlas.nodes` with them. `src/rules/battle/battle-events.test.ts`
  filled the field with `testDreamscapeId(NODE_ID)` behind an
  `as unknown as BattleInit` cast, and it passed only because the two string
  values happened to match. This bead switched that fixture to `NODE_ID`.
  Renaming the fields to `nodeId`/`nodeIdOrNone` touches persisted fold
  state (the battle init), so it needs its own bead with fixture regen.
