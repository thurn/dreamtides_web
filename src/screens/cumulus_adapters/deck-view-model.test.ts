// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  testJourneySeed,
  testCardId,
  testAvatarId,
  testTideId,
  testExplorationActionId,
} from "../../types/test-identities";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { CardData } from "../../types/cards";
import type { AvatarContent } from "../../types/content";
import type { DeckEntry, Avatar, SiteState } from "../../types/journey";
import type { RunPoolContext } from "../../data/journey-content";
import type { PoolData } from "../../draft/pool/types";
import { parseCardName } from "../../types/card-identity";
import { buildDesktopDeckView } from "./desktop-deck-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { buildMobileDeckView, toDeckCardView } from "./mobile-deck-view-model";
import { buildStartingDeckView as buildStartingDeckViewImpl } from "./starting-deck-view-model";
import type { DraftState } from "../../types/draft";
import { createBaseBattleDeckCardDefinition } from "../../battle/card-definition";
import { createPoolCardDropCommand } from "../../battle/components/battle-ui-commands";
import {
  buildPoolViewerView,
  DEFAULT_POOL_VIEWER_FILTERS,
} from "./pool-viewer-view-model";
import {
  buildDraftTransfiguredOfferLog,
  buildDraftView as buildDraftViewImpl,
  resolveOfferCards,
  sortOfferCards,
} from "./draft-view-model";
import { draftOfferKey } from "../../data/draft-site-bootstrap";

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

describe("mobile-deck-view-model", () => {
  const transfigurationData = transfigurationFixture();

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

  describe("toDeckCardView", () => {
    it("resolves a plain entry to its card, keyed by entryId and carrying no transfiguration", () => {
      const card = makeCard({ cardNumber: 7 });
      const entry = makeEntry({
        entryId: parseDeckEntryId("e7"),
        cardNumber: 7,
      });

      const view = toDeckCardView(transfigurationData, entry, database(card));

      expect(view).not.toBeNull();
      expect(view?.entryId).toBe("e7");
      expect(view?.model.cardId).toBe(card.id);
      expect(view?.model.transfiguration).toBeUndefined();
      expect(view?.isBane).toBe(false);
    });

    it("carries a transfiguration display descriptor for a transfigured entry", () => {
      const card = makeCard({ cardNumber: 4, cardType: "Character", spark: 2 });
      const entry = makeEntry({
        cardNumber: 4,
        transfiguration: "Kindled",
        sparkBonus: 1,
      });

      const view = toDeckCardView(transfigurationData, entry, database(card));

      expect(view?.model.transfiguration).toBeDefined();
      // Kindled changes spark, so the display marks the spark as changed.
      expect(view?.model.transfiguration?.sparkChanged).toBe(true);
      expect(view?.model.displaySnapshot.spark).toBe(5);
    });
  });

  describe("buildMobileDeckView", () => {
    it("keeps distinct entryId keys even when two entries share a card (and name)", () => {
      const card = makeCard({ cardNumber: 1 });
      const deck = [
        makeEntry({ entryId: parseDeckEntryId("copy-a"), cardNumber: 1 }),
        makeEntry({ entryId: parseDeckEntryId("copy-b"), cardNumber: 1 }),
      ];

      const view = buildMobileDeckView(
        transfigurationData,
        deck,
        database(card),
      );

      expect(view.cards.map((c) => c.entryId)).toEqual(["copy-a", "copy-b"]);
    });
  });
});

describe("starting-deck-view-model", () => {
  const buildStartingDeckView = (
    deck: readonly DeckEntry[],
    cardDatabase: Map<number, CardData>,
  ) => buildStartingDeckViewImpl(deck, cardDatabase);

  function makeCardDatabase(): Map<number, CardData> {
    return new Map<number, CardData>([
      [
        1,
        {
          name: parseCardName("Archive Sentry"),
          id: testCardId("archive-sentry"),
          cardNumber: 1,
          cardType: "Character",
          subtype: "",
          isStarter: false,
          energyCost: 3,
          spark: 1,
          isFast: false,
          renderedText: "Hold the line.",
          imageNumber: 1,
          artOwned: true,
        },
      ],
      [
        2,
        {
          name: parseCardName("Glimpse of What Was"),
          id: testCardId("glimpse"),
          cardNumber: 2,
          cardType: "Event",
          subtype: "",
          isStarter: false,
          energyCost: 1,
          spark: null,
          isFast: false,
          renderedText: "Draw a card.",
          imageNumber: 2,
          artOwned: true,
        },
      ],
    ]);
  }

  function makeDeck(): DeckEntry[] {
    return [
      {
        entryId: parseDeckEntryId("entry-1"),
        cardNumber: 1,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("entry-2"),
        cardNumber: 2,
        transfiguration: null,
        isBane: false,
      },
    ];
  }

  describe("buildStartingDeckView", () => {
    it("resolves each deck entry to its card, keyed by entryId with its rules text", () => {
      const view = buildStartingDeckView(makeDeck(), makeCardDatabase());

      expect(view.cards).toHaveLength(2);
      const [first, second] = view.cards;
      // Keyed by the stable entry id, never the card name.
      expect(first?.entryId).toBe("entry-1");
      expect(second?.entryId).toBe("entry-2");
      // The resolved card is carried through with its rules text (GameCard reads
      // that text directly for its folded-in hover glossary help).
      expect(first?.model.displaySnapshot.cardNumber).toBe(1);
      expect(first?.model.displaySnapshot.renderedText).toBe("Hold the line.");
      expect(second?.model.displaySnapshot.renderedText).toBe("Draw a card.");
      // The test hook is derived from the entry id.
      expect(first?.testId).toContain("entry-1");
    });

    it("preserves acquisition order", () => {
      // A deck whose entries are out of card-number order still resolves in the
      // order the entries were acquired.
      const deck: DeckEntry[] = [
        {
          entryId: parseDeckEntryId("entry-2"),
          cardNumber: 2,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-1"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
      ];

      const view = buildStartingDeckView(deck, makeCardDatabase());

      expect(view.cards.map((c) => c.entryId)).toEqual(["entry-2", "entry-1"]);
    });
  });
});

describe("pool-viewer-view-model", () => {
  function card(
    idSeed: string,
    number: number,
    name: string,
    cardType: CardData["cardType"] = "Character",
  ): CardData {
    return {
      id: testCardId(idSeed),
      cardNumber: number,
      name: parseCardName(name),
      cardType,
      subtype: cardType === "Character" ? "Warrior" : "",
      isStarter: false,
      energyCost: number,
      spark: cardType === "Character" ? 1 : null,
      isFast: false,
      renderedText: `Rules for ${name}`,
      imageNumber: number,
      artOwned: true,
    };
  }

  const alpha = card("card-alpha", 1, "Shared Name");

  const beta = card("card-beta", 2, "Shared Name", "Event");

  const database = new Map([
    [1, alpha],
    [2, beta],
  ]);

  const poolState: DraftState = {
    mode: "tides4",
    draftPoolCopiesByCard: { "1": 2, "2": 1 },
    remainingCopiesByCard: { "1": 2, "2": 1 },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
  };

  function build(
    overrides: Partial<Parameters<typeof buildPoolViewerView>[0]> = {},
  ) {
    return buildPoolViewerView({
      cardDatabase: database,
      draftState: poolState,
      resolvedPackage: null,
      poolVariant: null,
      tides4Provenance: null,
      source: "run",
      filters: DEFAULT_POOL_VIEWER_FILTERS,
      title: "pool",
      frame: "fullScreen",
      ...overrides,
    });
  }

  describe("buildPoolViewerView", () => {
    it("keeps duplicate display names distinct through UUID-backed stable entries", () => {
      const view = build();
      expect(view.cards.map((entry) => entry.model.cardId)).toEqual([
        alpha.id,
        beta.id,
      ]);
      expect(view.cards.map((entry) => entry.entryId)).toEqual([
        `run:${alpha.id}`,
        `run:${beta.id}`,
      ]);
    });

    it("filters deterministically without changing entry identity", () => {
      const view = build({
        filters: {
          ...DEFAULT_POOL_VIEWER_FILTERS,
          type: "event",
          query: "shared",
        },
      });
      expect(view.cards).toHaveLength(1);
      expect(view.cards[0]?.entryId).toBe(`run:${beta.id}`);
    });

    it("maps catalog and signature sources without display-name identity", () => {
      const resolvedPackage = {
        avatar: {
          id: testAvatarId("dc"),
          name: "Fixture",
          title: "",
          renderedText: "",
          imageNumber: "1",
          startingEssence: 0,
          signatureCardIds: [beta.id],
        },
        draftPoolCopiesByCard: {},
        dreamsignPoolIds: [],
        mandatoryOnlyPoolSize: 0,
        draftPoolSize: 0,
        doubledCardCount: 0,
        legalSubsetCount: 0,
        preferredSubsetCount: 0,
      };
      expect(
        build({ source: "catalog" }).cards.map((item) => item.model.cardId),
      ).toEqual([alpha.id, beta.id]);
      expect(
        build({ source: "signature", resolvedPackage }).cards[0]?.model.cardId,
      ).toBe(beta.id);
    });

    it("carries a stable gallery entry through the pool-to-deck battle mutation", () => {
      const entry = build().cards.find(
        (item) => item.entryId === `run:${alpha.id}`,
      );
      if (entry === undefined) throw new Error("expected alpha pool entry");
      const command = createPoolCardDropCommand(
        createBaseBattleDeckCardDefinition(entry.model.displaySnapshot),
        { side: "player", zone: "deck", position: "top" },
        99,
      );
      if (command.id !== "DEBUG_EDIT") throw new Error("expected debug edit");
      expect(command.edit).toMatchObject({
        kind: "CREATE_CARD_FROM_DEFINITION",
        definition: { cardId: entry.model.cardId },
        destination: { side: "player", zone: "deck", position: "top" },
      });
    });
  });
});

describe("draft-view-model", () => {
  const buildDraftView = (
    params: Omit<
      Parameters<typeof buildDraftViewImpl>[0],
      "transfigurationData"
    >,
  ) =>
    buildDraftViewImpl({
      ...params,
      transfigurationData: transfigurationFixture(),
    });

  function card(
    overrides: Partial<CardData> & { cardNumber: number },
  ): CardData {
    return {
      name: parseCardName(`Card ${String(overrides.cardNumber)}`),
      id: testCardId(`card-${String(overrides.cardNumber)}`),
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: 1,
      isFast: false,
      renderedText: "Text.",
      imageNumber: overrides.cardNumber,
      artOwned: false,
      ...overrides,
    };
  }

  function cardDatabase(cards: CardData[]): Map<number, CardData> {
    return new Map(cards.map((c) => [c.cardNumber, c]));
  }

  describe("sortOfferCards", () => {
    it("orders by energy cost ascending, then by name", () => {
      const cards = [
        card({ cardNumber: 3, energyCost: 2, name: parseCardName("Zephyr") }),
        card({ cardNumber: 1, energyCost: 1, name: parseCardName("Beacon") }),
        card({ cardNumber: 2, energyCost: 2, name: parseCardName("Anchor") }),
      ];
      expect(sortOfferCards(cards).map((c) => c.cardNumber)).toEqual([1, 2, 3]);
    });
  });

  describe("resolveOfferCards", () => {
    it("resolves numbers to cards and sorts them", () => {
      const db = cardDatabase([
        card({ cardNumber: 10, energyCost: 3 }),
        card({ cardNumber: 11, energyCost: 1 }),
      ]);
      expect(resolveOfferCards([10, 11], db).map((c) => c.cardNumber)).toEqual([
        11, 10,
      ]);
    });
  });

  describe("buildDraftView", () => {
    const DRAFT_SITE: SiteState = {
      id: parseSiteId("draft-site"),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    };

    it("assembles the offer and a card-number key; null scene without a node", () => {
      const db = cardDatabase([
        card({ cardNumber: 5, energyCost: 2 }),
        card({ cardNumber: 6, energyCost: 1 }),
      ]);
      const view = buildDraftView({
        offerCardNumbers: [5, 6],
        cardDatabase: db,
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 0,
        pickCount: 5,
      });
      expect(view.offer.map((c) => c.displaySnapshot.cardNumber)).toEqual([
        6, 5,
      ]);
      // The key is the offered card numbers (identity), not names.
      expect(view.offerKey).toBe(draftOfferKey([5, 6]));
      expect(view.scene).toBeNull();
    });

    it("derives the 1-indexed pick counter from picks completed and the site's total", () => {
      const view = buildDraftView({
        offerCardNumbers: [1],
        cardDatabase: cardDatabase([card({ cardNumber: 1 })]),
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 2,
        pickCount: 5,
      });
      expect(view.pickNumber).toBe(3);
      expect(view.pickTotal).toBe(5);
    });

    it("renders and logs exact persisted transfigurations by offered card identity", () => {
      const view = buildDraftView({
        offerCardNumbers: [5, 6],
        offerTransfigurations: { "5": "Empowered", "6": "Kindled" },
        cardDatabase: cardDatabase([
          card({ cardNumber: 5, energyCost: 4 }),
          card({ cardNumber: 6, spark: 2 }),
        ]),
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 0,
        pickCount: 5,
      });
      expect(view.offer.map((model) => model.transfiguration?.type)).toEqual([
        "Kindled",
        "Empowered",
      ]);
      expect(
        buildDraftTransfiguredOfferLog(view, {
          siteId: parseSiteId("exploration-site"),
          actionId: testExplorationActionId("exploration-action"),
        }),
      ).toEqual({
        sourceSiteId: parseSiteId("exploration-site"),
        sourceActionId: testExplorationActionId("exploration-action"),
        pickNumber: 1,
        cards: [
          { cardId: testCardId("card-6"), transfiguration: "Kindled" },
          { cardId: testCardId("card-5"), transfiguration: "Empowered" },
        ],
      });
    });
  });
});
