// A synthetic D97 run folded through the real reducer, for save tests: a run
// started in the development dream that has opened its shop, bought a card
// and touched its waypoint. The frozen golden schema-version-1 fixture
// (`./fixtures/d97-save-v1.json`) was written from it; while the schema is
// version 1, a test pins that this run still has that fixture's shape.

import { DEVELOPMENT_DREAM } from "../../content/d97/dreams/development";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { syntheticD97Content } from "../../rules/d97/d97-content.fixtures";
import { genesisFoldState, type FoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event, GENESIS } from "../../rules/reducer-fixtures";
import { testAvatarId } from "../../types/test-identities";

export const SAVE_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
export const SAVE_AVATAR = testAvatarId("d97-save-avatar");

/** Register the synthetic content the run folds against. */
export function registerSaveContent(): void {
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [SAVE_AVATAR], poolSize: 40 }));
}

/** The folded synthetic run and the seq of its last applied event. */
export function foldSyntheticRun(): { readonly state: FoldState; readonly seq: number } {
  const steps: [string, Record<string, unknown>][] = [
    ["D97_START_RUN", { avatarId: SAVE_AVATAR, dreamId: DEVELOPMENT_DREAM.id }],
    ["D97_OPEN_SHOP", { anchorId: DEVELOPMENT_DREAM.topology.shopAnchorId }],
    ["D97_BUY_SHOP_CARD", { anchorId: DEVELOPMENT_DREAM.topology.shopAnchorId, slotIndex: 0 }],
    ["D97_ACTIVATE_WAYPOINT", { anchorId: DEVELOPMENT_DREAM.topology.waypointAnchorId }],
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
