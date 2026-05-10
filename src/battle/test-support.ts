import type { CardData } from "../types/cards";
import type { DreamcallerContent, ResolvedDreamcallerPackage } from "../types/content";
import type { DeckEntry, Dreamcaller, Dreamsign, QuestState, SiteState } from "../types/quest";

export function makeBattleTestSite(): SiteState {
  return {
    id: "site-7",
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  };
}

export function makeBattleTestDreamcallers(): DreamcallerContent[] {
  return [
    {
      id: "dreamcaller-arc",
      name: "Aeris, the Prism Guide",
      title: "Storm Archivist",
      renderedText: "Whenever the first event each turn resolves, gain momentum.",
      imageNumber: "001",
      mandatoryTides: ["alpha"],
      optionalTides: ["beta", "gamma"],
    },
    {
      id: "dreamcaller-bloom",
      name: "Talan, Keeper of Branches",
      title: "Verdant Witness",
      renderedText: "Your field grows harder to uproot with every turn passed.",
      imageNumber: "002",
      mandatoryTides: ["beta"],
      optionalTides: ["alpha", "delta"],
    },
  ];
}

export function makeBattleTestCardDatabase(): Map<number, CardData> {
  const cards: CardData[] = [
    makeCard(101, "Spark Initiate", "Character", 1, 2, ["alpha"]),
    makeCard(102, "Arc Runner", "Character", 2, 3, ["alpha"]),
    makeCard(103, "Static Channeler", "Character", 3, 2, ["alpha"]),
    makeCard(104, "Tempest Guard", "Character", 4, 4, ["alpha"]),
    makeCard(105, "Storm Titan", "Character", 6, 6, ["alpha"]),
    makeCard(106, "Ion Burst", "Event", 1, null, ["alpha"]),
    makeCard(107, "Refraction", "Event", 3, null, ["alpha"]),
    makeCard(108, "Arc Collapse", "Event", 5, null, ["alpha"]),
    makeCard(201, "Beta Tender", "Character", 1, 1, ["beta"]),
    makeCard(202, "Garden Sentinel", "Character", 2, 2, ["beta"]),
    makeCard(203, "Canopy Ranger", "Character", 3, 3, ["beta"]),
    makeCard(204, "Verdant Colossus", "Character", 5, 5, ["beta"]),
    makeCard(205, "Harvest Ritual", "Event", 2, null, ["beta"]),
    makeCard(206, "Root Recall", "Event", 4, null, ["beta"]),
    makeCard(301, "Null Courier", "Character", 1, 1, ["gamma"]),
    makeCard(302, "Mirror Adept", "Character", 4, 3, ["gamma"]),
    makeCard(303, "Silent Current", "Event", 2, null, ["gamma"]),
    makeCard(304, "Late Pulse", "Event", 6, null, ["gamma"]),
  ];

  return new Map(cards.map((card) => [card.cardNumber, card]));
}

export function makeBattleTestState(): Pick<
  QuestState,
  | "atlas"
  | "completionLevel"
  | "currentDreamscape"
  | "deck"
  | "dreamcaller"
  | "dreamsigns"
  | "resolvedPackage"
> {
  return {
    atlas: {
      nodes: {
        "dreamscape-2": {
          id: "dreamscape-2",
          biomeName: "Test Biome",
          biomeColor: "#112233",
          sites: [makeBattleTestSite()],
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
        },
      },
      edges: [],
      nexusId: "dreamscape-2",
    },
    completionLevel: 2,
    currentDreamscape: "dreamscape-2",
    deck: makeBattleTestDeckEntries(),
    dreamcaller: makeBattleTestDreamcaller(),
    dreamsigns: makeBattleTestDreamsigns(),
    resolvedPackage: makeResolvedPackage(),
  };
}

function makeBattleTestDeckEntries(): DeckEntry[] {
  return [
    makeDeckEntry("deck-1", 101),
    makeDeckEntry("deck-2", 102),
    makeDeckEntry("deck-3", 103),
    makeDeckEntry("deck-4", 104),
    makeDeckEntry("deck-5", 106),
    makeDeckEntry("deck-6", 201),
    makeDeckEntry("deck-7", 205),
    makeDeckEntry("deck-8", 301),
  ];
}

function makeBattleTestDreamcaller(): Dreamcaller {
  return {
    id: "dreamcaller-arc",
    name: "Aeris",
    title: "Storm Archivist",
    renderedText: "Gain a fleeting advantage whenever your line bends first.",
    imageNumber: "001",
  };
}

function makeBattleTestDreamsigns(): Dreamsign[] {
  return [
    {
      name: "Bolt Script",
      effectDescription: "The first event each turn costs 1 less.",
      isBane: false,
    },
    {
      name: "Wilted Crown",
      effectDescription: "A lingering drawback for regression testing.",
      isBane: true,
    },
  ];
}

function makeResolvedPackage(): ResolvedDreamcallerPackage {
  return {
    dreamcaller: makeBattleTestDreamcallers()[0],
    mandatoryTides: ["alpha"],
    optionalSubset: ["beta"],
    selectedTides: ["alpha", "beta"],
    draftPoolCopiesByCard: {
      "101": 2,
      "102": 2,
      "103": 2,
      "104": 2,
    },
    dreamsignPoolIds: ["sign-1", "sign-2"],
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
  tides: string[],
): CardData {
  return {
    name,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Unit" : "Spell",
    isStarter: false,
    energyCost,
    spark,
    isFast: false,
    tides,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDeckEntry(entryId: string, cardNumber: number): DeckEntry {
  return {
    entryId,
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}
