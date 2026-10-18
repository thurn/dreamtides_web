// A synthetic D97 run folded through the real reducer, for save tests: a run
// started in a synthetic dream (`SAVE_DREAM`) that has opened its shop,
// bought a card, touched its waypoint and stepped into its room. The frozen golden fixtures
// (`./fixtures/d97-save-v<n>.json`) were written from such a run; a test pins
// that this run still has the current schema version's golden shape.

import { defineDream, type D97DreamDefinition, type D97DreamRoom } from "../../content/d97/dreams/schema";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { syntheticD97Content } from "../../rules/d97/d97-content.fixtures";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B } from "../../rules/d97/d97-dreams.fixtures";
import { genesisFoldState, type FoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event, GENESIS } from "../../rules/reducer-fixtures";
import { parseDreamAnchorId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";

export const SAVE_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
export const SAVE_AVATAR = testAvatarId("d97-save-avatar");

/**
 * The synthetic dream the run is in: synthetic dream A with its shop at the
 * anchor UUID the golden fixtures' saved shop is keyed by, so a run folded
 * today keeps the current golden's shape.
 */
export const SAVE_DREAM: D97DreamDefinition = defineDream({
  ...SYNTHETIC_DREAM_A,
  topology: { ...SYNTHETIC_DREAM_A.topology, shopAnchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000005") },
});

/** The save dream's room, which the run ends in. */
export const SAVE_ROOM: D97DreamRoom = SAVE_DREAM.rooms[0];

/** Register the synthetic content the run folds against, with `dreams` registered (the first is the default). */
export function registerSaveContent(dreams: readonly D97DreamDefinition[] = [SAVE_DREAM, SYNTHETIC_DREAM_B]): void {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [SAVE_AVATAR], poolSize: 40, dreams }));
}

/** The folded synthetic run and the seq of its last applied event. */
export function foldSyntheticRun(): { readonly state: FoldState; readonly seq: number } {
  const steps: [string, Record<string, unknown>][] = [
    ["D97_START_RUN", { avatarId: SAVE_AVATAR, dreamId: SAVE_DREAM.id }],
    ["D97_OPEN_SHOP", { anchorId: SAVE_DREAM.topology.shopAnchorId }],
    ["D97_BUY_SHOP_CARD", { anchorId: SAVE_DREAM.topology.shopAnchorId, slotIndex: 0 }],
    ["D97_ACTIVATE_WAYPOINT", { anchorId: SAVE_DREAM.topology.waypointAnchorId }],
    ["D97_ENTER_ROOM", { anchorId: SAVE_ROOM.buildingDoorAnchorId }],
  ];
  let state = genesisFoldState(SAVE_GENESIS);
  let seq = 0;
  for (const [type, payload] of steps) {
    seq += 1;
    const result = reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(SAVE_GENESIS.seed, seq) }));
    if (result.outcome !== "applied") throw new Error(`${type} bounced`);
    state = result.state;
  }
  return { state, seq };
}
