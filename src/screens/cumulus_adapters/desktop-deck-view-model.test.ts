import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type { CardData } from "../../types/cards";
import type { DreamAvatarContent } from "../../types/content";
import type { DeckEntry, DreamAvatar, Dreamsign } from "../../types/journey";
import type { RunPoolContext } from "../../data/journey-content";
import type { PoolData } from "../../draft/pool/types";
import { asCardId, asCardName } from "../../types/card-identity";
import { buildDesktopDeckView } from "./desktop-deck-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";

const transfigurationData = transfigurationFixture();

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Event"),
    id: asCardId("test-event"),
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
    entryId: "entry-1",
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function database(...cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

const dreamAvatar: DreamAvatar = {
  id: "dc-1",
  name: "Sable",
  title: "The Unmaker",
  renderedText: "Banish a card.",
  imageNumber: "12",
  startingEssence: 3,
};

const dreamsign: Dreamsign = {
  id: "ds-1",
  name: "First Sign",
  effectDescription: "Draw an extra card.",
};

const dreamAvatarContent: DreamAvatarContent = {
  id: dreamAvatar.id,
  name: dreamAvatar.name,
  title: dreamAvatar.title,
  renderedText: dreamAvatar.renderedText,
  imageNumber: dreamAvatar.imageNumber,
  startingEssence: dreamAvatar.startingEssence,
};

function tidesContext(
  poolVariant: RunPoolContext["poolVariant"],
): RunPoolContext {
  const tideId = "tide-sig-fixture";
  const poolData: PoolData = {
    tides4Decks: {
      version: 2,
      selection: { bandFraction: 0.25, bandMinimum: 5 },
      tides: [
        {
          id: tideId,
          displayName: "Kindled Path",
          displayDescription:
            "Gather strength before releasing a decisive surge.",
          role: "signature",
          resonance: "ember",
          cards: Array.from({ length: 80 }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            copies: 2,
          })),
        },
      ],
      tidePoolByDreamAvatar: {
        [dreamAvatar.id]: {
          starter: tideId,
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
    const a = makeCard({ cardNumber: 1, id: asCardId("a") });
    const b = makeCard({ cardNumber: 2, id: asCardId("b") });
    const deck = [
      makeEntry({ entryId: "e2", cardNumber: 2 }),
      makeEntry({ entryId: "e1", cardNumber: 1 }),
    ];

    const view = buildDesktopDeckView(transfigurationData, deck, database(a, b), null, []);

    expect(view.cards.map((c) => c.entryId)).toEqual(["e2", "e1"]);
  });

  it("maps the DreamAvatar to the sidebar view (portrait visual + rules text)", () => {
    const view = buildDesktopDeckView(transfigurationData, [], database(), dreamAvatar, []);

    expect(view.dreamAvatar).toEqual({
      id: "dc-1",
      imageNumber: "12",
      name: "Sable",
      title: "The Unmaker",
      renderedText: "Banish a card.",
    });
  });

  it("carries a null DreamAvatar through as null", () => {
    const view = buildDesktopDeckView(transfigurationData, [], database(), null, []);
    expect(view.dreamAvatar).toBeNull();
  });

  it("copies the dreamsigns into the view", () => {
    const signs = [dreamsign];
    const view = buildDesktopDeckView(transfigurationData, [], database(), null, signs);

    expect(view.dreamsigns).toMatchObject(signs);
    // A copy, not the caller's array, so the view cannot alias live state.
    expect(view.dreamsigns).not.toBe(signs);
  });

  it("derives the current journey tides from the chosen avatar id and stable run seed", () => {
    const view = buildDesktopDeckView(
      transfigurationData,
      [],
      database(),
      dreamAvatar,
      [],
      [dreamAvatarContent],
      tidesContext("tides4"),
      "run-seed",
    );

    expect(view.tides).toEqual([
      {
        id: "tide-sig-fixture",
        label: "Kindled Path",
        description: "Gather strength before releasing a decisive surge.",
        tide: "ember",
      },
    ]);
  });

});
