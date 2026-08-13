import { asCardName } from "../../types/card-identity";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type {
  DreamAvatarContent,
  DreamsignTemplate,
  ResolvedDreamAvatarPackage,
} from "../../types/content";
import type {
  DeckEntry,
  Dreamsign,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { createDefaultState } from "../../state/journey-context";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";

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
    name: asCardName(`Fixture Card ${cardNumber}`),
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

export function makeMerchantTestSite(
  overrides: Partial<SiteState> = {},
): SiteState {
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
    ...overrides,
  };
}

export function makeMerchantTestJourneyState(
  overrides: Partial<JourneyState> = {},
): JourneyState {
  return {
    ...createDefaultState(),
    seed: "merchant-fixture-seed",
    essence: 120,
    ...overrides,
  };
}

function makeMerchantTestDreamAvatarContent(): DreamAvatarContent {
  return {
    id: "dream-avatar-fixture",
    name: "Fixture DreamAvatar",
    title: "Fixture",
    renderedText: "",
    imageNumber: "0000",
    startingEssence: 120,
  };
}

export function makeMerchantTestResolvedPackage(
  overrides: Partial<ResolvedDreamAvatarPackage> = {},
): ResolvedDreamAvatarPackage {
  return {
    dreamAvatar: makeMerchantTestDreamAvatarContent(),
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
}: {
  cards: readonly CardData[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
  fitModel?: unknown;
  merchantCorpus?: unknown;
  dreamsignProfiles?: unknown;
}): JourneyContent {
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((card) => [card.cardNumber, card])),
    dreamAvatars: [],
    dreamwellCards: [],
    dreamsignTemplates,
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}
