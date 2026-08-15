import { testJourneySeed } from "../types/test-identities";
import { parseCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type {
  AvatarContent,
  ResolvedAvatarPackage,
} from "../types/content";
import type {
  DeckEntry,
  Avatar,
  Dreamsign,
  JourneyState,
  SiteState,
} from "../types/journey";
import { LayerName } from "../types/layer-name";
import {
  backRankSlotIds,
  createEmptySlotRecord,
  frontRankSlotIds,
} from "./types";
import type { BackRankSlotId, FrontRankSlotId } from "./types";
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import {
  testCardId,
  testCardSubtype,
  testAvatarId,
  testDreamscapeId,
  testDreamsignId,
} from "../types/test-identities";

/** A generous materialized window for test ranks. The play area grows without
 *  bound at runtime; tests build an explicit window and override slots by id. */
const TEST_FRONT_RANK_WINDOW = 12;
const TEST_BACK_RANK_WINDOW = TEST_FRONT_RANK_WINDOW + 1;

/**
 * Front-rank slot record with every slot `null` across the test window, for
 * building battle test states. The `Record<…, null>` return is assignable to both
 * the `string | null` (BattleMutableState) and `AiCard | null` (forward model)
 * slot shapes; override individual slots by spreading, e.g.
 * `{ ...emptyFrontRankSlots(), F0: card }`.
 */
export function emptyFrontRankSlots(): Record<FrontRankSlotId, null> {
  return createEmptySlotRecord(frontRankSlotIds(TEST_FRONT_RANK_WINDOW));
}

/** Back-rank slot record with every slot `null`; see {@link emptyFrontRankSlots}. */
export function emptyBackRankSlots(): Record<BackRankSlotId, null> {
  return createEmptySlotRecord(backRankSlotIds(TEST_BACK_RANK_WINDOW));
}

export function makeBattleTestSite(): SiteState {
  return {
    id: parseSiteId("site-7"),
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
}

export function makeBattleTestAvatars(): AvatarContent[] {
  return [
    {
      id: testAvatarId("avatar-arc"),
      name: "Aeris, the Prism Guide",
      title: "Storm Archivist",
      renderedText:
        "Whenever the first event each turn resolves, gain momentum.",
      imageNumber: "001",
      startingEssence: 250,
    },
    {
      id: testAvatarId("avatar-bloom"),
      name: "Talan, Keeper of Branches",
      title: "Verdant Witness",
      renderedText: "Your field grows harder to uproot with every turn passed.",
      imageNumber: "002",
      startingEssence: 250,
    },
  ];
}

export function makeBattleTestCardDatabase(): Map<number, CardData> {
  const cards: CardData[] = [
    makeCard(101, "Spark Initiate", "Character", 1, 2),
    makeCard(102, "Arc Runner", "Character", 2, 3),
    makeCard(103, "Static Channeler", "Character", 3, 2),
    makeCard(104, "Tempest Guard", "Character", 4, 4),
    makeCard(105, "Storm Titan", "Character", 6, 6),
    makeCard(106, "Ion Burst", "Event", 1, null),
    makeCard(107, "Refraction", "Event", 3, null),
    makeCard(108, "Arc Collapse", "Event", 5, null),
    makeCard(201, "Beta Tender", "Character", 1, 1),
    makeCard(202, "Garden Sentinel", "Character", 2, 2),
    makeCard(203, "Canopy Ranger", "Character", 3, 3),
    makeCard(204, "Verdant Colossus", "Character", 5, 5),
    makeCard(205, "Harvest Ritual", "Event", 2, null),
    makeCard(206, "Root Recall", "Event", 4, null),
    makeCard(301, "Null Courier", "Character", 1, 1),
    makeCard(302, "Mirror Adept", "Character", 4, 3),
    makeCard(303, "Silent Current", "Event", 2, null),
    makeCard(304, "Late Pulse", "Event", 6, null),
  ];

  for (let i = 0; i < 42; i += 1) {
    const cardType = i % 4 === 0 ? "Event" : "Character";
    cards.push(
      makeCard(
        1000 + i,
        `Alpha Pool ${String(i)}`,
        cardType,
        1 + (i % 6),
        cardType === "Character" ? 1 + (i % 4) : null,
      ),
    );
  }

  for (let i = 0; i < 42; i += 1) {
    const cardType = i % 5 === 0 ? "Event" : "Character";
    cards.push(
      makeCard(
        1100 + i,
        `Beta Pool ${String(i)}`,
        cardType,
        1 + (i % 6),
        cardType === "Character" ? 1 + (i % 4) : null,
      ),
    );
  }

  for (let i = 0; i < 4; i += 1) {
    cards.push(
      makeCard(
        1200 + i,
        `Global Removal ${String(i)}`,
        "Event",
        2 + (i % 2),
        null,
      ),
    );
  }

  return new Map(cards.map((card) => [card.cardNumber, card]));
}

export function makeBattleTestState(): Pick<
  JourneyState,
  | "atlas"
  | "battleModifiers"
  | "completionLevel"
  | "currentDreamscape"
  | "deck"
  | "avatar"
  | "dreamsigns"
  | "resolvedPackage"
  | "seed"
> {
  return {
    atlas: {
      nodes: {
        [parseAtlasNodeId("dreamscape-2")]: {
          id: parseAtlasNodeId("dreamscape-2"),
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("test_dreamscape"),
          sites: [makeBattleTestSite()],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: parseAtlasNodeId("dreamscape-2"),
      bossNodeId: parseAtlasNodeId("dreamscape-2"),
      currentNodeId: parseAtlasNodeId("dreamscape-2"),
      layers: [[parseAtlasNodeId("dreamscape-2")], [], [], [], [], [], []],
      knownDreamsignCarrierIds: [],
    },
    battleModifiers: [],
    completionLevel: 2,
    currentDreamscape: parseAtlasNodeId("dreamscape-2"),
    deck: makeBattleTestDeckEntries(),
    avatar: makeBattleTestAvatar(),
    dreamsigns: makeBattleTestDreamsigns(),
    resolvedPackage: makeResolvedPackage(),
    seed: testJourneySeed("test-journey-seed"),
  };
}

function makeBattleTestDeckEntries(): DeckEntry[] {
  return [
    makeDeckEntry(parseDeckEntryId("deck-1"), 101),
    makeDeckEntry(parseDeckEntryId("deck-2"), 102),
    makeDeckEntry(parseDeckEntryId("deck-3"), 103),
    makeDeckEntry(parseDeckEntryId("deck-4"), 104),
    makeDeckEntry(parseDeckEntryId("deck-5"), 106),
    makeDeckEntry(parseDeckEntryId("deck-6"), 201),
    makeDeckEntry(parseDeckEntryId("deck-7"), 205),
    makeDeckEntry(parseDeckEntryId("deck-8"), 301),
  ];
}

function makeBattleTestAvatar(): Avatar {
  return {
    id: testAvatarId("avatar-arc"),
    name: "Aeris",
    title: "Storm Archivist",
    renderedText: "Gain a fleeting advantage whenever your line bends first.",
    imageNumber: "001",
    startingEssence: 250,
  };
}

function makeBattleTestDreamsigns(): Dreamsign[] {
  return [
    {
      name: "Bolt Script",
      effectDescription: "The first event each turn costs 1 less.",
    },
    {
      name: "Wilted Crown",
      effectDescription: "A lingering drawback for regression testing.",
    },
  ];
}

function makeResolvedPackage(): ResolvedAvatarPackage {
  return {
    avatar: makeBattleTestAvatars()[0],
    draftPoolCopiesByCard: {
      "101": 2,
      "102": 2,
      "103": 2,
      "104": 2,
    },
    dreamsignPoolIds: [testDreamsignId("sign-1"), testDreamsignId("sign-2")],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: 200,
    doubledCardCount: 4,
    legalSubsetCount: 3,
    preferredSubsetCount: 2,
  };
}

function makeCard(
  cardNumber: number,
  name: string,
  cardType: CardData["cardType"],
  energyCost: number | null,
  spark: number | null,
): CardData {
  return {
    name: parseCardName(name),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: testCardSubtype(cardType === "Character" ? "Warrior" : ""),
    isStarter: false,
    energyCost,
    spark,
    isFast: false,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDeckEntry(entryId: DeckEntryId, cardNumber: number): DeckEntry {
  return {
    entryId,
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}
