// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  testJourneySeed,
  testCardId,
  testAvatarId,
  testTideId,
} from "../../types/test-identities";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { CardData } from "../../types/cards";
import type { AvatarContent } from "../../types/content";
import type { DeckEntry, Avatar } from "../../types/journey";
import type { RunPoolContext } from "../../data/journey-content";
import type { PoolData } from "../../draft/pool/types";
import { parseCardName } from "../../types/card-identity";
import { buildDesktopDeckView } from "./desktop-deck-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId } from "../../types/identifiers";

describe("desktop-deck-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const transfigurationData = transfigurationFixture();

  const TIDE_ID = testTideId("tide-sig-fixture");

  function makeCard(overrides: Partial<CardData> = {}): CardData {
    return {
      name: parseCardName("Test Event"),
      id: testCardId("test-event"),
      cardNumber: 1,
      cardType: "Event",
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: null,
      isFast: false,
      renderedText: "Draw a card.",
      imageNumber: 1,
      artOwned: true,
      ...overrides,
    };
  }

  function makeEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
    return {
      entryId: parseDeckEntryId("entry-1"),
      cardNumber: 1,
      transfiguration: null,
      isBane: false,
      ...overrides,
    };
  }

  function database(...cards: CardData[]): Map<number, CardData> {
    return new Map(cards.map((card) => [card.cardNumber, card]));
  }

  const avatar: Avatar = {
    id: testAvatarId("dc-1"),
    name: "Sable",
    title: "The Unmaker",
    renderedText: "Banish a card.",
    imageNumber: "12",
    startingEssence: 3,
  };

  const avatarContent: AvatarContent = {
    id: avatar.id,
    name: avatar.name,
    title: avatar.title,
    renderedText: avatar.renderedText,
    imageNumber: avatar.imageNumber,
    startingEssence: avatar.startingEssence,
  };

  function tidesContext(
    poolVariant: RunPoolContext["poolVariant"],
  ): RunPoolContext {
    const poolData: PoolData = {
      tides4Decks: {
        version: 2,
        selection: { bandFraction: 0.25, bandMinimum: 5 },
        tides: [
          {
            id: TIDE_ID,
            displayName: "Kindled Path",
            auguryPackageReference: "Kindled Path package",
            displayDescription:
              "Gather strength before releasing a decisive surge.",
            role: "signature",
            resonance: "ember",
            cards: Array.from({ length: 80 }, (_, index) => ({
              id: testCardId(
                `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              ),
              copies: 2,
            })),
          },
        ],
        tidePoolByAvatar: {
          [avatar.id]: {
            starter: TIDE_ID,
            facets: [],
            neutral: [],
          },
        },
      },
    };
    return {
      poolData,
      idIndex: new Map(),
      starterCardNumbers: [],
      allDreamsignPoolIds: [],
      poolVariant,
    };
  }

  describe("buildDesktopDeckView", () => {
    it("resolves the deck in acquisition order", () => {
      const a = makeCard({ cardNumber: 1, id: testCardId("a") });
      const b = makeCard({ cardNumber: 2, id: testCardId("b") });
      const deck = [
        makeEntry({ entryId: parseDeckEntryId("e2"), cardNumber: 2 }),
        makeEntry({ entryId: parseDeckEntryId("e1"), cardNumber: 1 }),
      ];

      const view = buildDesktopDeckView(
        transfigurationData,
        deck,
        database(a, b),
        null,
        [],
        [],
        tidesContext("tides4"),
        testJourneySeed("run-seed"),
      );

      expect(view.cards.map((c) => c.entryId)).toEqual([
        parseDeckEntryId("e2"),
        parseDeckEntryId("e1"),
      ]);
    });

    it("derives the current journey tides from the chosen avatar id and stable run seed", () => {
      const view = buildDesktopDeckView(
        transfigurationData,
        [],
        database(),
        avatar,
        [],
        [avatarContent],
        tidesContext("tides4"),
        testJourneySeed("run-seed"),
      );

      expect(view.tides).toMatchObject([{ id: TIDE_ID, tide: "ember" }]);
      expect(view.tides[0]?.label).toEqual(expect.any(String));
      expect(view.tides[0]?.description).toEqual(expect.any(String));
    });
  });
});
