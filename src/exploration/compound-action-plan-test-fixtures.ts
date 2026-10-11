import { testJourneySeed } from "../types/test-identities";
import type { JourneySeed } from "../types/journey-seed";
import { MINIMAL_ATLAS_DATA, MINIMAL_SITES_DATA } from "../testing/atlas-fixtures";
import type { JourneyContent } from "../data/journey-content";
import { testJourneyState } from "../testing/journey-genesis";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { parseCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type {
  CardTypeChange,
  DeckEntry,
  SiteState,
  TransfigurationType,
} from "../types/journey";
import {
  prepareExplorationCompoundActionPlan,
  type ExplorationCompoundActionPreparation,
  type ExplorationCompoundActionPlanInput,
} from "./compound-action-plan";
import { parseSiteId } from "../types/identifiers";
import type { DeckEntryId } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { ExplorationActionId } from "../types/identifiers";
import { testCardId, testExplorationActionId } from "../types/test-identities";

 const ENCOUNTER_ID = testCardId("c0000000-0000-4000-8000-000000000001");

export function card(input: {
  index: number;
  cardType: CardData["cardType"];
  isStarter?: boolean;
  isFast?: boolean;
  rarity?: CardData["rarity"];
}): CardData {
  const isCharacter = input.cardType === "Character";
  return {
    id: testCardId(
      `c0000000-0000-4000-8000-${String(input.index).padStart(12, "0")}`,
    ),
    name: parseCardName(`Compound fixture ${String(input.index)}`),
    cardNumber: input.index,
    cardType: input.cardType,
    subtype: isCharacter ? "Warrior" : "",
    isStarter: input.isStarter ?? false,
    ...(input.isStarter === true
      ? { roles: ["starter-deck" as const], rarity: "Starter" as const }
      : input.rarity === undefined
        ? {}
        : { rarity: input.rarity }),
    energyCost: 4,
    spark: isCharacter ? 2 : null,
    isFast: input.isFast ?? false,
    renderedText: isCharacter ? "Deal 2 damage." : "Draw a card.",
    amplifiedText: isCharacter ? "Deal 4 damage." : "Draw two cards.",
    imageNumber: input.index,
    artOwned: true,
  };
}

export function cardsFixture(): CardData[] {
  return [
    card({ index: 1, cardType: "Character" }),
    card({ index: 2, cardType: "Character" }),
    card({ index: 3, cardType: "Character", rarity: "Legendary" }),
    card({ index: 4, cardType: "Event" }),
    card({ index: 5, cardType: "Event", isFast: true }),
    card({ index: 6, cardType: "Event" }),
    card({ index: 7, cardType: "Event" }),
    card({ index: 8, cardType: "Event" }),
    card({ index: 9, cardType: "Event" }),
    card({ index: 10, cardType: "Event", isStarter: true }),
  ];
}

export function contentFixture(cards = cardsFixture()): JourneyContent {
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    avatars: [],
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

export function entry(
  entryId: DeckEntryId,
  cardNumber: number,
  options: {
    transfiguration?: TransfigurationType | null;
    typeChange?: CardTypeChange | null;
  } = {},
): DeckEntry {
  return {
    entryId,
    cardNumber,
    transfiguration: options.transfiguration ?? null,
    typeChange: options.typeChange,
    isBane: false,
  };
}

 function journey(
  deck: readonly DeckEntry[],
  seed: JourneySeed = testJourneySeed("compound-plan-seed"),
) {
  return {
    ...testJourneyState(),
    seed,
    deck: [...deck],
  };
}

export const site: SiteState = {
  id: parseSiteId("compound-plan-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

type SpecificInput = ExplorationCompoundActionPlanInput extends infer Input
  ? Input extends { kind: ExplorationCompoundActionPlanInput["kind"] }
    ? Omit<
        Input,
        "actionId" | "encounterCardId" | "journey" | "site" | "content"
      >
    : never
  : never;

export function prepare(
  specific: SpecificInput,
  options: {
    deck?: readonly DeckEntry[];
    seed?: JourneySeed;
    siteOverride?: SiteState;
    actionId?: ExplorationActionId;
    encounterCardId?: CardId;
    content?: JourneyContent;
  } = {},
): ExplorationCompoundActionPreparation {
  return prepareExplorationCompoundActionPlan({
    ...specific,
    actionId: options.actionId ?? testExplorationActionId("compound-action"),
    encounterCardId: options.encounterCardId ?? ENCOUNTER_ID,
    journey: journey(options.deck ?? [], options.seed),
    site: options.siteOverride ?? site,
    content: options.content ?? contentFixture(),
  });
}
