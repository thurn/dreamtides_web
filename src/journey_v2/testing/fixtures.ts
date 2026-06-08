import type { FitModel } from "../../draft/replay/fit-model";
import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type {
  DreamcallerContent,
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../../types/content";
import type { DeckEntry, Dreamsign, QuestState, SiteState } from "../../types/quest";
import { createDefaultState } from "../../state/quest-context";

export const TEST_CARD_UUIDS = {
  ordinary: "11111111-1111-4111-8111-111111111111",
  deckCopy: "22222222-2222-4222-8222-222222222222",
  starterFlag: "33333333-3333-4333-8333-333333333333",
  starterRarity: "44444444-4444-4444-8444-444444444444",
  specialRarity: "55555555-5555-4555-8555-555555555555",
  outsidePool: "66666666-6666-4666-8666-666666666666",
} as const;

export function makeMerchantTestCard(
  overrides: Partial<CardData> & Pick<CardData, "id" | "cardNumber">,
): CardData {
  const { id, cardNumber, ...rest } = overrides;
  return {
    name: `Fixture Card ${cardNumber}`,
    id,
    cardNumber,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
    ...rest,
  };
}

export function makeMerchantTestDeckEntry(
  overrides: Partial<DeckEntry> & Pick<DeckEntry, "entryId" | "cardNumber">,
): DeckEntry {
  const { entryId, cardNumber, ...rest } = overrides;
  return {
    entryId,
    cardNumber,
    transfiguration: null,
    isBane: false,
    ...rest,
  };
}

export function makeMerchantTestSite(overrides: Partial<SiteState> = {}): SiteState {
  return {
    id: "site-merchant-fixture",
    type: "Reward",
    isEnhanced: false,
    isVisited: false,
    ...overrides,
  };
}

export function makeMerchantTestDreamsignTemplate(
  overrides: Partial<DreamsignTemplate> & Pick<DreamsignTemplate, "id">,
): DreamsignTemplate {
  const { id, ...rest } = overrides;
  return {
    id,
    name: `Fixture Sign ${id}`,
    effectDescription: "",
    ...rest,
  };
}

export function makeMerchantTestDreamsign(
  overrides: Partial<Dreamsign> = {},
): Dreamsign {
  return {
    id: "held-sign",
    name: "Held Sign",
    effectDescription: "",
    isBane: false,
    ...overrides,
  };
}

export function makeMerchantTestQuestState(
  overrides: Partial<QuestState> = {},
): QuestState {
  return {
    ...createDefaultState(),
    seed: "merchant-fixture-seed",
    essence: 120,
    essenceCap: 360,
    ...overrides,
  };
}

function makeMerchantTestDreamcallerContent(): DreamcallerContent {
  return {
    id: "dreamcaller-fixture",
    name: "Fixture Dreamcaller",
    title: "Fixture",
    renderedText: "",
    imageNumber: "0000",
    startingEssence: 120,
  };
}

export function makeMerchantTestResolvedPackage(
  overrides: Partial<ResolvedDreamcallerPackage> = {},
): ResolvedDreamcallerPackage {
  return {
    dreamcaller: makeMerchantTestDreamcallerContent(),
    draftPoolCopiesByCard: {},
    dreamsignPoolIds: [],
    mandatoryOnlyPoolSize: 0,
    draftPoolSize: 0,
    doubledCardCount: 0,
    legalSubsetCount: 0,
    preferredSubsetCount: 0,
    ...overrides,
  };
}

export function makeMerchantTestContent({
  cards,
  dreamsignTemplates = [],
  fitModel,
}: {
  cards: readonly CardData[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
  fitModel?: FitModel;
}): QuestContent {
  return {
    cardDatabase: new Map(cards.map((card) => [card.cardNumber, card])),
    dreamcallers: [],
    dreamsignTemplates,
    fitModel,
  };
}

export function makeMerchantTestFitModel(): FitModel {
  return {
    decks: [],
    idf: new Map(),
    prior: new Map(),
    coocNorm: new Map(),
    numberToName: new Map(),
    nameIndex: new Map(),
    tuning: {
      alpha: 1,
      beta: 1,
      gamma: 1,
      K: 1,
      idfPower: 1,
      minDf: 1,
      maxDfFrac: 1,
      minDeckSize: 1,
      maxDeckSize: 99,
    },
  };
}
