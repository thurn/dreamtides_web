import {
  auguryDocument,
  sitesDocument,
  tides4Document,
} from "../content/documents";
import { parseAuguryData } from "../data/augury-data";
import { buildRewardSelectionData } from "../data/reward-selection-data";
import { parseSitesData } from "../data/sites-data";
import { validateTides4Decks } from "../draft/pool/tides4-io";
import { buildPoolData } from "../draft/pool/pool-data";
import type { ExplorationContent } from "../data/exploration";
import type { RunPoolContext } from "../data/journey-content";
import type { TutorialJourneyPool } from "../data/tutorial-journey-pool";
import type { ApollyonIncarnationContent } from "../types/content";
import { testAvatarId, testFoldHash } from "../types/test-identities";
import { gambleFixture } from "./gamble-fixture";
import { transfigurationFixture } from "./transfiguration-fixture";
import { makeTutorialConfiguration } from "./tutorial-configuration-fixture";

const auguryJson = auguryDocument();
const sitesJson = sitesDocument();
const tidesJson = tides4Document();

const EMPTY_EXPLORATION: ExplorationContent = {
  foldHash: testFoldHash("e"),
  customCards: [],
  customDreamsigns: [],
  encounters: [],
};

/** A tutorial journey pool pinned to an Avatar no synthetic fixture offers. */
const UNOFFERED_TUTORIAL_JOURNEY_POOL: TutorialJourneyPool = {
  avatarId: testAvatarId("unoffered-tutorial-journey-avatar"),
  poolSize: 1,
  openingOffers: [],
  openingDreamsignIds: [],
  tides: [],
};

const NO_APOLLYON_INCARNATIONS: readonly ApollyonIncarnationContent[] = [];

/** A run-pool context with no cards, tides, starters, or dreamsigns. */
function emptyPoolContext(): RunPoolContext {
  return {
    poolData: buildPoolData([]),
    idIndex: new Map(),
    starterCardNumbers: [],
    allDreamsignPoolIds: [],
  };
}

/**
 * Stable generated configuration for synthetic tests that construct
 * JourneyContent. The Exploration, tutorial, tutorial journey pool, Apollyon,
 * and run-pool catalogs are empty or synthetic; tests that exercise one of
 * them override it after spreading this fixture.
 */
export const CONFIG_DATA_FIXTURE = {
  exploration: EMPTY_EXPLORATION,
  tutorial: makeTutorialConfiguration(),
  tutorialJourneyPool: UNOFFERED_TUTORIAL_JOURNEY_POOL,
  apollyonIncarnations: NO_APOLLYON_INCARNATIONS,
  poolContext: emptyPoolContext(),
  gambleData: gambleFixture(),
  transfigurationData: transfigurationFixture(),
  rewardSelectionData: buildRewardSelectionData({
    tides: validateTides4Decks(tidesJson),
    augury: parseAuguryData(auguryJson),
    sites: parseSitesData(sitesJson),
  }),
  auguryData: parseAuguryData(auguryJson),
} as const;
