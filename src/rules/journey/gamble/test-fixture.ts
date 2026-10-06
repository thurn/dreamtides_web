// Shared fixtures for the Gamble site reducer tests: one open Gamble site on
// the current node, and an event applier that runs the real reducer.

import type { EventContext, GameEvent, Genesis } from "../../../eventlog/types";
import { TEST_CONTENT_CONFIG } from "../../../testing/journey-genesis";
import { parseAtlasNodeId, parseSiteId } from "../../../types/identifiers";
import type {
  Dreamsign,
  GambleSiteRuntime,
  JourneyState,
  SiteState,
} from "../../../types/journey";
import { LayerName } from "../../../types/layer-name";
import {
  testDreamscapeId,
  testDreamsignId,
  testEventActor,
  testJourneySeed,
} from "../../../types/test-identities";
import { genesisFoldState, type FoldState } from "../../fold-state";
import { reduceGameEvent } from "../../reducer";

export const SITE_ID = parseSiteId("fixture-gamble");
const NODE_ID = parseAtlasNodeId("fixture-node");
const GENESIS: Genesis = {
  seed: testJourneySeed("fixture-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};
export const REWARD_DREAMSIGN: Dreamsign = {
  id: testDreamsignId("reward-sign"),
  name: "Reward Sign",
  effectDescription: "Fixture effect.",
};
export const OTHER_DREAMSIGN_ID = testDreamsignId("other-sign");

export function gambleStateWith(
  siteRuntime: GambleSiteRuntime,
  overrides: Partial<JourneyState> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  const site: SiteState = {
    id: SITE_ID,
    type: "Gamble",
    isEnhanced: false,
    isVisited: false,
  };
  return {
    ...base,
    journey: {
      ...base.journey,
      essence: 200,
      maxDreamsigns: 12,
      remainingDreamsignPool: [
        testDreamsignId("reward-sign"),
        OTHER_DREAMSIGN_ID,
      ],
      currentDreamscape: NODE_ID,
      screen: { type: "site", siteId: SITE_ID },
      atlas: {
        ...base.journey.atlas,
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
        nodes: {
          [NODE_ID]: {
            id: NODE_ID,
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture-dreamscape"),
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
      },
      siteRuntime: {
        [SITE_ID]: siteRuntime,
      },
      ...overrides,
    },
  };
}

export function apply(
  state: FoldState,
  type:
    | "PLACE_GRAVOK_WAGER"
    | "SETTLE_GRAVOK_WAGER"
    | "PLAY_AGAIN_GRAVOK_WAGER"
    | "REPLACE_GRAVOK_WAGER_DREAMSIGN"
    | "DRAW_TIDEMARK_LADDER_CLIMB"
    | "SETTLE_TIDEMARK_LADDER_CLIMB"
    | "REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN"
    | "DRAW_STARWAY_STAIRS"
    | "SETTLE_STARWAY_STAIRS"
    | "CASH_OUT_STARWAY_STAIRS"
    | "PLAY_AGAIN_STARWAY_STAIRS"
    | "DRAW_FOUR_SUIT_REPRISE"
    | "SETTLE_FOUR_SUIT_REPRISE"
    | "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION"
    | "PLAY_AGAIN_FOUR_SUIT_REPRISE"
    | "DEAL_BLACKJACK"
    | "HIT_BLACKJACK"
    | "STAND_BLACKJACK"
    | "SETTLE_BLACKJACK"
    | "PLAY_AGAIN_BLACKJACK"
    | "COMPLETE_SITE",
  payload: Record<string, unknown>,
) {
  const event: GameEvent = {
    type,
    payload,
    actor: testEventActor("fixture-player"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
  const context: EventContext = {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 1,
    timestamp: "1970-01-01T00:00:00.000Z",
    rng: () => 0.5,
    intervening: [],
  };
  return reduceGameEvent(state, event, context);
}
