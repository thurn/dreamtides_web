import { describe, expect, it } from "vitest";

import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../testing/config-data-fixture";
import { draftDataFixture } from "../testing/draft-data-fixture";
import { economyFixture } from "../testing/economy-fixture";
import { gambleFixture } from "../testing/gamble-fixture";
import { opponentsFixture } from "../testing/opponents-fixture";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import { parseCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import { validateTides4Decks } from "../draft/pool";
import type { DraftAvatar } from "./avatars-v2-database";
import { parseEconomyData } from "./economy-data";
import { parseExplorationContent } from "./exploration";
import { parseGambleData } from "./gamble-data";
import { buildJourneyContent } from "./journey-content";
import { parseOpponentsData } from "./opponents-data";
import { parseTransfigurationData } from "./transfiguration-data";
import {
  testCardId,
  testAvatarId,
  testExplorationActionId,
  testTideId,
} from "../types/test-identities";

function makeCard(cardNumber: number): CardData {
  return {
    name: parseCardName(`Card ${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: cardNumber === 1,
    roles: cardNumber === 1 ? ["starter-deck"] : undefined,
    rarity: cardNumber === 1 ? "Starter" : "Common",
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

describe("buildJourneyContent", () => {
  function sources(input: {
    cards: CardData[];
    avatars: DraftAvatar[];
    economy?: ReturnType<typeof economyFixture>;
  }) {
    const tides = validateTides4Decks({
      version: 2,
      selection: { bandFraction: 0.25, bandMinimum: 5 },
      tides: [
        {
          id: testTideId("tide-a"),
          displayName: "Tide A",
          auguryPackageReference: "Tide A package",
          displayDescription: "A synthetic tide.",
          resonance: "ember",
          role: "neutral",
          cards: [{ id: testCardId("card-1"), copies: 1 }],
        },
      ],
      tidePoolByAvatar: {},
    });
    const exploration = parseExplorationContent({
      schemaVersion: 2,
      contentHash: "0".repeat(64),
      foldHash: "0".repeat(64),
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: testCardId("card-1"),
          prose: "A fixture encounter.",
          action: [
            {
              id: testExplorationActionId("fixture-action"),
              label: "Invite someone through",
              effectText: "Gain a card",
              effectKind: "gain-offered-card",
              canonicalMechanicId: "gain-card",
              selectionPolicyId: "card-fit-quality",
              predicate: "cheap-character",
              count: 1,
            },
          ],
        },
      ],
    });
    return {
      draftData: draftDataFixture(),
      cardDatabase: new Map(input.cards.map((card) => [card.cardNumber, card])),
      exploration,
      auguryData: CONFIG_DATA_FIXTURE.auguryData,
      draftAvatars: input.avatars,
      dreamwellCards: [],
      dreamsignTemplates: [],
      tides4Decks: tides,
      dreamscapes: [],
      affiliations: [],
      guides: [],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      economyData: parseEconomyData(input.economy ?? economyFixture()),
      gambleData: parseGambleData({
        ...gambleFixture(),
        contentHash: "e".repeat(64),
        foldHash: "f".repeat(64),
      }),
      transfigurationData: parseTransfigurationData(transfigurationFixture()),
      opponentsData: parseOpponentsData(opponentsFixture()),
      apollyonIncarnations: [],
    };
  }

  it("assembles selection tuning from the catalogs that own it", () => {
    const content = buildJourneyContent(
      sources({
        cards: [makeCard(1), makeCard(2)],
        avatars: [
          {
            id: testAvatarId("avatar-1"),
            name: "Test Avatar",
            title: "Speaker of Tests",
            renderedText: "Test rules text.",
            imageNumber: "0001",
            startingEssence: 235,
            signatureCards: [],
            signatureCardIds: [],
          },
        ],
      }),
    );
    expect(content.cardDatabase.size).toBe(2);
    expect(content.poolContext?.poolData.tides4Decks?.version).toBe(2);
    expect(content.rewardSelectionData.tuning).toMatchObject({
      bandFraction: 0.25,
      minDeckForPurge: MINIMAL_SITES_DATA.encounterSites.minDeckForPurge,
      subtypeMinPoolCards:
        CONFIG_DATA_FIXTURE.auguryData.selection.subtypeMinPoolCards,
    });
  });

  it("uses the authored economy default when an avatar omits starting essence", () => {
    const economy = economyFixture();
    economy.journey.defaultStartingEssence = 137;
    const content = buildJourneyContent(
      sources({
        cards: [makeCard(1)],
        economy,
        avatars: [
          {
            id: testAvatarId("avatar-defaulted"),
            name: "Defaulted",
            title: "D",
            renderedText: "",
            imageNumber: "0001",
            signatureCards: [],
            signatureCardIds: [],
          },
        ],
      }),
    );
    expect(content.avatars[0].startingEssence).toBe(137);
  });
});
