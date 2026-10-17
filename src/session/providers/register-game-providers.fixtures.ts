// Real journey content, event-log helpers, and the synthetic single-node
// Augury fixture the real-provider tests share.

import { expect } from "vitest";
import type { Genesis } from "../../eventlog/types";
import type { SeqEvent } from "../../rules/replay/replay";
import { replayLog } from "../../rules/replay/replay";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { AvatarContent, DreamsignTemplate } from "../../types/content";
import type { JourneyState, SiteState, SiteType } from "../../types/journey";
import { parseCardName } from "../../types/card-identity";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  makeSyntheticAtlasData,
  MINIMAL_SITES_DATA,
  SYNTHETIC_ATLAS_DREAMSCAPES,
} from "../../testing/atlas-fixtures";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
  TEST_STARTER_CARD_NUMBERS,
} from "../../testing/pool-context";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { LayerName } from "../../types/layer-name";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
  makeAuguryTestSite,
} from "../../journey_v2/testing/fixtures";
import {
  parseAtlasNodeId,
  parseDeckEntryId,
  parseSiteId,
} from "../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamscapeId,
  testDreamsignId,
  testEventActor,
  testJourneySeed,
} from "../../types/test-identities";

export const AVATAR_ID = testAvatarId("avatar-real-provider");
export const TIMESTAMP = "1970-01-01T00:00:00.000Z";
export const GENESIS: Genesis = {
  seed: testJourneySeed("real-provider-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};
export const OPEN = { selectionRulesVersion: SELECTION_RULES_VERSION };

function makeCard(cardNumber: number, isStarter: boolean): CardData {
  return {
    name: parseCardName(`Card ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamsignTemplates(count: number): DreamsignTemplate[] {
  return Array.from({ length: count }, (_value, index) =>
    makeAuguryTestDreamsignTemplate({
      id: testDreamsignId(`dreamsign-${String(index).padStart(3, "0")}`),
      name: `Dreamsign ${String(index)}`,
    }),
  );
}

const AVATAR: AvatarContent = {
  id: AVATAR_ID,
  name: "Provider Witness",
  title: "Provider Witness",
  renderedText: "Test ability.",
  imageNumber: "0006",
  startingEssence: 200,
};

/** Real journey-start, atlas, shop, and battle-init generators, no fetch. */
export function makeJourneyContent(): JourneyContent {
  const dreamsignTemplates = makeDreamsignTemplates(8);
  const cards = [
    ...TEST_STARTER_CARD_NUMBERS.map((cardNumber) => makeCard(cardNumber, true)),
    ...buildTestCorpusCards(),
  ];
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((card) => [card.cardNumber, card])),
    avatars: [AVATAR],
    dreamwellCards: [],
    dreamsignTemplates,
    dreamscapes: SYNTHETIC_ATLAS_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: makeSyntheticAtlasData(),
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
    poolContext: makeTestPoolContext(dreamsignTemplates.map(({ id }) => id)),
  };
}

/** A committed event at `seq`. */
export function ev(
  seq: number,
  type: SeqEvent["event"]["type"],
  payload: Record<string, unknown>,
): SeqEvent {
  return {
    seq,
    event: {
      type,
      payload,
      actor: testEventActor("p1"),
      clientTimestamp: TIMESTAMP,
    },
  };
}

export const START: SeqEvent[] = [
  ev(1, "START_JOURNEY", { avatarId: AVATAR_ID }),
  ev(2, "SELECT_AVATAR", { avatarId: AVATAR_ID }),
];

export function startedJourney(): JourneyState {
  return replayLog({ genesis: GENESIS, events: START }).finalState.journey;
}

export function siteOf(label: string, type: SiteType, isEnhanced = false): SiteState {
  return { id: parseSiteId(label), type, isEnhanced, isVisited: false };
}

export function expectAllApplied(outcomes: ReturnType<typeof replayLog>["outcomes"]) {
  for (const outcome of outcomes) {
    expect(
      outcome.outcome,
      `seq ${String(outcome.seq)} ${outcome.error?.message ?? ""}`,
    ).toBe("applied");
  }
}

// ---------------------------------------------------------------------------
// Synthetic single-node fixture for Gamble and Augury resolution
// ---------------------------------------------------------------------------

const AUGURY_SEED = testJourneySeed("augury-real-provider-seed");
// LOAD_STATE requires the loaded snapshot's seed to equal the game seed.
export const AUGURY_GENESIS: Genesis = { ...GENESIS, seed: AUGURY_SEED };
export const AUGURY_SITE_ID = parseSiteId("site-augury-resolve");
const AUGURY_NODE_ID = parseAtlasNodeId("dreamscape-a");

export function makeAuguryFixture(dreamsignCount = 10): {
  journey: JourneyState;
  content: JourneyContent;
  site: SiteState;
} {
  const site = makeAuguryTestSite({ id: AUGURY_SITE_ID, type: "Augury" });
  const cards = Array.from({ length: 30 }, (_value, index) => {
    const cardNumber = 1000 + index;
    return makeAuguryTestCard({
      id: testCardId(
        `aaaa0000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
      ),
      cardNumber,
      name: parseCardName(`Pool ${String(cardNumber)}`),
    });
  });
  const dreamsignTemplates = makeDreamsignTemplates(dreamsignCount);
  const content = makeAuguryTestContent({ cards, dreamsignTemplates });
  const journey = makeAuguryTestJourneyState({
    seed: AUGURY_SEED,
    currentDreamscape: AUGURY_NODE_ID,
    screen: { type: "site", siteId: site.id },
    remainingDreamsignPool: dreamsignTemplates.map(({ id }) => id),
    deck: [1000, 1001, 1002, 1003, 1004, 1005].map((cardNumber, index) =>
      makeAuguryTestDeckEntry({
        entryId: parseDeckEntryId(`deck-${String(index + 1)}`),
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        [AUGURY_NODE_ID]: {
          id: AUGURY_NODE_ID,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("test_dreamscape"),
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: AUGURY_NODE_ID,
      bossNodeId: AUGURY_NODE_ID,
      currentNodeId: AUGURY_NODE_ID,
      layers: [],
      knownDreamsignCarrierIds: [],
    },
  });
  return { journey, content, site };
}

