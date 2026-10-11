import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type {
  CardChoiceSiteRuntime,
  DeckEntry,
} from "../../types/journey";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import {
  buildDuplicationCards as buildDuplicationCardsImpl,
  buildDuplicationOfferLog,
} from "./duplication-view-model";

describe("duplication-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const transfigurationData = transfigurationFixture();

  const buildDuplicationCards = (
    ...args: Parameters<typeof buildDuplicationCardsImpl> extends readonly [
      unknown,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) => buildDuplicationCardsImpl(transfigurationData, ...args);

  function makeCard(cardNumber: number): CardData {
    return {
      name: parseCardName(`Fixture ${String(cardNumber)}`),
      id: testCardId(
        `00000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
      ),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "Materialized: Gain 1 essence.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  function makeEntry(cardNumber: number): DeckEntry {
    return {
      entryId: parseDeckEntryId(`entry-${String(cardNumber)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    };
  }

  function runtime(
    acceptedEntryIds: DeckEntryId[] = [],
  ): CardChoiceSiteRuntime {
    return {
      kind: "cardChoice",
      choiceKind: "duplication",
      entryIds: [
        parseDeckEntryId("entry-2"),
        parseDeckEntryId("missing-entry"),
        parseDeckEntryId("entry-1"),
      ],
      acceptedEntryIds,
    };
  }

  describe("buildDuplicationCards", () => {
    it("preserves persisted concrete entry order and canonical UUID identity", () => {
      const state = {
        ...testJourneyState(),
        deck: [makeEntry(1), makeEntry(2)],
      };
      const cardDatabase = new Map([
        [1, makeCard(1)],
        [2, makeCard(2)],
      ]);

      const cards = buildDuplicationCards(state, runtime(), cardDatabase);

      expect(cards.map((card) => card.entryId)).toEqual(["entry-2", "entry-1"]);
      expect(cards.map((card) => card.model.cardId)).toEqual([
        cardDatabase.get(2)?.id,
        cardDatabase.get(1)?.id,
      ]);
    });
  });

  describe("buildDuplicationOfferLog", () => {
    it("records persisted entry ids with canonical card UUIDs", () => {
      const state = {
        ...testJourneyState(),
        deck: [makeEntry(1), makeEntry(2)],
      };
      const cardDatabase = new Map([
        [1, makeCard(1)],
        [2, makeCard(2)],
      ]);

      expect(buildDuplicationOfferLog(state, runtime(), cardDatabase)).toEqual([
        {
          entryId: parseDeckEntryId("entry-2"),
          cardId: cardDatabase.get(2)?.id,
        },
        {
          entryId: parseDeckEntryId("entry-1"),
          cardId: cardDatabase.get(1)?.id,
        },
      ]);
    });
  });
});
