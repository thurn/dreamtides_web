import { makeTestPoolContext } from "../../testing/pool-context";
import {
  testJourneySeed,
  testCardId,
  testAvatarId,
  testTideId,
  testTutorialJourneyTideId,
  testDreamsignId,
} from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { AvatarContent } from "../../types/content";
import type { Tides4DeckJson } from "../../draft/pool/tides4-io";
import type { TutorialJourneyPool } from "../../data/tutorial-journey-pool";
import {
  buildAvatarOfferViews,
  buildJourneyStartGuideDialogue,
  largestTides,
  resolveAvatarOffer,
  toAvatarOfferView,
} from "./journey-start-view-model";
import { parseCardName } from "../../types/card-identity";
import {
  parsePresentationId,
  parseDeckEntryId,
  parseAtlasNodeId,
  parseBattleId,
  parseSiteId,
} from "../../types/identifiers";
import { LayerName } from "../../types/layer-name";
import type { CardData } from "../../types/cards";
import { testJourneyState, TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import type { DreamscapeNode, JourneyState } from "../../types/journey";
import {
  buildJourneyCompleteCardIds,
  buildJourneyCompleteView,
} from "./journey-complete-view-model";
import { buildJourneyFailedView } from "./journey-failed-view-model";
import { buildJourneyDebugEditorView as buildJourneyDebugEditorViewImpl } from "./journey-debug-view-model";
import { NIGHTMARE_CARD_ID, NIGHTMARE_CARD_NAME } from "../../data/nightmare";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import type { EventContext } from "../../eventlog/types";
import { frontDoorAction } from "../../rules/front-door";
import type { FrontDoorState } from "../../rules/fold-state";
import { buildMainMenuView } from "./main-menu-view-model";
import { TEST_TUTORIAL_CARD_CONSTANTS } from "../../testing/tutorial-configuration-fixture";
import { buildLoadingView } from "./loading-view-model";

describe("journey-start-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function tide(idSeed: string, cardCount: number): Tides4DeckJson {
    return {
      id: testTideId(idSeed),
      displayName: idSeed,
      auguryPackageReference: `${idSeed} package`,
      displayDescription: `${idSeed} description`,
      role: "facet",
      resonance: "shadow",
      cards: Array.from({ length: cardCount }, (_, index) => ({
        id: testCardId(`${idSeed}-card-${String(index)}`),
        copies: 1,
      })),
    };
  }

  function avatar(overrides: Partial<AvatarContent> = {}): AvatarContent {
    return {
      id: testAvatarId("dc-1"),
      name: "The Cartographer",
      title: "Mapper of Sleep",
      renderedText: "Whenever you map a dream, draw a card.",
      imageNumber: "42",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 3,
      ...overrides,
    };
  }

  describe("largestTides", () => {
    it("keeps the four largest tides by total card count, in original order", () => {
      const tides = [
        tide("a", 2),
        tide("b", 10),
        tide("c", 1),
        tide("d", 8),
        tide("e", 5),
        tide("f", 3),
      ];
      expect(largestTides(tides).map((t) => t.id)).toEqual(
        ["b", "d", "e", "f"].map(testTideId),
      );
    });
  });

  describe("resolveAvatarOffer", () => {
    it("returns only the UUID-pinned tutorial Avatar", () => {
      const avatars = [
        avatar({ id: testAvatarId("avatar-a") }),
        avatar({ id: testAvatarId("avatar-b") }),
        avatar({ id: testAvatarId("avatar-c") }),
        avatar({ id: testAvatarId("avatar-d") }),
      ];

      const tutorialAvatarId = testAvatarId("avatar-c");
      const offer = resolveAvatarOffer(
        avatars,
        testJourneySeed("game-seed"),
        12,
        tutorialAvatarId,
      );

      expect(offer.map((candidate) => candidate.id)).toEqual([
        tutorialAvatarId,
      ]);
    });

    it("derives the normal three-avatar offer when no tutorial UUID is set", () => {
      const avatars = ["a", "b", "c", "d"].map((id) =>
        avatar({ id: testAvatarId(id) }),
      );

      const offer = resolveAvatarOffer(
        avatars,
        testJourneySeed("game-seed"),
        0,
      );

      expect(offer).toHaveLength(3);
      expect(new Set(offer.map((candidate) => candidate.id)).size).toBe(3);
    });
  });

  describe("buildJourneyStartGuideDialogue", () => {
    it("maps authored Mira guidance for a UUID-pinned offer", () => {
      const tutorialAvatarId = testAvatarId("tutorial-avatar-uuid");
      const dialogue = buildJourneyStartGuideDialogue(tutorialAvatarId, {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 40,
        verticalOffset: -10,
        bubbleWidth: 550,
        text: "Authored [purple]Avatar[/purple] guidance.",
      });
      expect(dialogue).toMatchObject({
        id: parsePresentationId(`journey-start-guidance:${tutorialAvatarId}`),
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
        },
        delaySeconds: 1,
        horizontalOffset: 40,
        verticalOffset: -10,
        bubbleWidth: 550,
      });
      expect(dialogue?.model.portraitAlt).toEqual(expect.any(String));
      expect(dialogue?.model.speakerName).toEqual(expect.any(String));
      expect(dialogue?.model.text).toEqual(expect.any(String));
    });
  });

  describe("toAvatarOfferView", () => {
    it("suppresses signature cards whenever tides exist (tides4 runs show tides instead)", () => {
      const view = toAvatarOfferView(
        avatar({
          signatureCardIds: [testCardId("uuid-a"), testCardId("uuid-b")],
        }),
        [tide("t1", 3)],
        new Map([
          [testCardId("uuid-a"), "Alpha"],
          [testCardId("uuid-b"), "Beta"],
        ]),
      );
      expect(view.signatureCards).toEqual([]);
      expect(view.tides.map((t) => t.id)).toEqual([testTideId("t1")]);
    });

    it("shows signature cards keyed by their stable UUIDs when there are no tides", () => {
      const cardNameById = new Map([
        [testCardId("uuid-a1"), "Alpha"],
        [testCardId("uuid-a2"), "Alpha"],
      ]);
      const view = toAvatarOfferView(
        avatar({
          signatureCardIds: [testCardId("uuid-a1"), testCardId("uuid-a2")],
        }),
        [],
        cardNameById,
      );
      // Two cards sharing a display name stay distinct because keys come from
      // the UUID list, never from the name.
      expect(view.signatureCards.map(({ id }) => id)).toEqual([
        testCardId("uuid-a1"),
        testCardId("uuid-a2"),
      ]);
      expect(view.signatureCards.map(({ name }) => name)).toEqual([
        cardNameById.get(testCardId("uuid-a1")),
        cardNameById.get(testCardId("uuid-a2")),
      ]);
    });

    it("resolves signature names from the catalog by UUID and skips UUIDs absent from it", () => {
      const cardNameById = new Map([
        [testCardId("uuid-b"), "Beta catalog name"],
      ]);
      const view = toAvatarOfferView(
        avatar({
          signatureCardIds: [testCardId("uuid-missing"), testCardId("uuid-b")],
        }),
        [],
        cardNameById,
      );
      expect(view.signatureCards).toEqual([
        { id: testCardId("uuid-b"), name: cardNameById.get(testCardId("uuid-b")) },
      ]);
    });
  });

  describe("buildAvatarOfferViews", () => {
    it("shows the authored valor tides for the UUID-pinned tutorial offer", () => {
      const pool: TutorialJourneyPool = {
        avatarId: testAvatarId("dc-1"),
        poolSize: 6,
        openingOffers: [],
        openingDreamsignIds: [],
        tides: ["Bannerwake", "Sunwall", "Unfallen"].map((name, index) => ({
          id: testTutorialJourneyTideId(`tide-${String(index)}`),
          name,
          description: `${name} description`,
          type: "valor" as const,
          cards: [
            {
              id: testCardId(
                `00000000-0000-4000-8000-00000000000${String(index)}`,
              ),
              copies: 2,
            },
          ],
        })),
      };

      // The signature UUID resolves in the catalog, so only the tutorial
      // offer's tide view suppresses it.
      const poolContext = makeTestPoolContext();
      poolContext.poolData.cardNameById = new Map([
        [testCardId("signature-id"), "Hidden signature"],
      ]);
      const [view] = buildAvatarOfferViews(
        [
          avatar({
            signatureCardIds: [testCardId("signature-id")],
          }),
        ],
        poolContext,
        testJourneySeed("game-seed"),
        pool,
        testAvatarId("dc-1"),
      );

      expect(view.signatureCards).toEqual([]);
      expect(view.tides).toEqual([
        {
          id: "tide-0",
          label: "Bannerwake",
          description: "Bannerwake description",
          tide: "valor",
        },
        {
          id: "tide-1",
          label: "Sunwall",
          description: "Sunwall description",
          tide: "valor",
        },
        {
          id: "tide-2",
          label: "Unfallen",
          description: "Unfallen description",
          tide: "valor",
        },
      ]);
    });
  });
});

describe("journey-complete-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function card(cardNumber: number, idSeed: string): CardData {
    return {
      id: testCardId(idSeed),
      name: parseCardName("Shared Display Name"),
      cardNumber,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 1,
      isFast: false,
      renderedText: "A fixture ability.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  function node(
    idSeed: string,
    state: DreamscapeNode["state"],
  ): DreamscapeNode {
    return {
      id: parseAtlasNodeId(idSeed),
      layer: LayerName.One,
      indexInLayer: 0,
      dreamscapeId: null,
      sites: [],
      position: { x: 0, y: 0 },
      state,
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    };
  }

  function state(): JourneyState {
    const base = testJourneyState();
    return {
      ...base,
      essence: 140,
      completionLevel: 7,
      avatar: {
        id: testAvatarId("avatar-uuid"),
        name: "The Wayfinder",
        title: "Bearer of the Last Light",
        renderedText: "A fixture ability.",
        imageNumber: "001",
        startingEssence: 200,
      },
      deck: [
        {
          entryId: parseDeckEntryId("entry-a"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-b"),
          cardNumber: 2,
          transfiguration: null,
          isBane: false,
        },
      ],
      dreamsigns: [
        {
          id: testDreamsignId("dreamsign-uuid"),
          name: "Fixture Sign",
          effectDescription: "A fixture effect.",
        },
      ],
      atlas: {
        ...base.atlas,
        nodes: {
          [parseAtlasNodeId("completedA")]: node("completed-a", "completed"),
          [parseAtlasNodeId("completedB")]: node("completed-b", "completed"),
          [parseAtlasNodeId("available")]: node("available", "available"),
        },
      },
    };
  }

  describe("buildJourneyCompleteView", () => {
    it("builds the interactive Avatar portrait and victory statistics from run state", () => {
      const journey = state();
      const view = buildJourneyCompleteView(journey);

      expect(view.avatar).toMatchObject({
        id: journey.avatar?.id,
        imageNumber: "001",
      });
      expect(view.avatar?.name).toEqual(expect.any(String));
      expect(view.avatar?.title).toEqual(expect.any(String));
      expect(view.avatar?.ability).toEqual(expect.any(String));
      expect(view.stats.map(({ id, value }) => [id, value])).toEqual([
        ["battles", 7],
        ["dreamscapes", 2],
        ["cards", 2],
        ["dreamsigns", 1],
        ["essence", 140],
      ]);
    });

    it("resolves same-named final-deck cards to distinct UUIDs for logging", () => {
      const fixtureState = state();
      const cardIds = buildJourneyCompleteCardIds(
        fixtureState.deck,
        new Map([
          [1, card(1, "00000000-0000-0000-0000-000000000001")],
          [2, card(2, "00000000-0000-0000-0000-000000000002")],
        ]),
      );

      expect(cardIds).toEqual([
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
      ]);
    });
  });
});

describe("journey-failed-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function state(overrides: Partial<JourneyState> = {}): JourneyState {
    const base = testJourneyState();
    return {
      ...base,
      completionLevel: 2,
      avatar: {
        id: testAvatarId("avatar-uuid"),
        name: "The Wayfinder",
        title: "Bearer of the Last Light",
        renderedText: "A fixture ability.",
        imageNumber: "001",
        startingEssence: 200,
      },
      failureSummary: {
        battleId: parseBattleId("battle-uuid"),
        result: "defeat",
        reason: "score_target_reached",
        siteId: parseSiteId("site-uuid"),
        siteLabel: "Battle",
        dreamscapeIdOrNone: parseAtlasNodeId("dreamscape-uuid"),
        turnNumber: 6,
        playerScore: 4,
        enemyScore: 10,
      },
      ...overrides,
    };
  }

  describe("buildJourneyFailedView", () => {
    it("builds the interactive Avatar portrait and terminal battle summary", () => {
      const journey = state();
      const view = buildJourneyFailedView(journey);

      expect(view).toMatchObject({
        result: "defeat",
        reason: "score_target_reached",
        avatar: {
          id: journey.avatar?.id,
          imageNumber: "001",
        },
      });
      expect(view?.avatar?.name).toEqual(expect.any(String));
      expect(view?.avatar?.title).toEqual(expect.any(String));
      expect(view?.avatar?.ability).toEqual(expect.any(String));
      expect(view?.stats.map(({ id, value }) => [id, value])).toEqual([
        ["battles", 2],
        ["round", 6],
        ["playerScore", 4],
        ["enemyScore", 10],
      ]);
    });
  });
});

describe("journey-debug-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const buildJourneyDebugEditorView = (
    ...args: Parameters<
      typeof buildJourneyDebugEditorViewImpl
    > extends readonly [unknown, ...infer Rest]
      ? Rest
      : never
  ) => buildJourneyDebugEditorViewImpl(transfigurationFixture(), ...args);

  function card(overrides: Partial<CardData> = {}): CardData {
    return {
      id: testCardId("card-1"),
      name: parseCardName("Shared Name"),
      cardNumber: 1,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 3,
      spark: 2,
      isFast: false,
      renderedText: "A focused fixture.",
      imageNumber: 1,
      artOwned: true,
      ...overrides,
    };
  }

  function state(): JourneyState {
    return {
      essence: 4,
      maxDreamsigns: 3,
      completionLevel: 2,
      dreamsigns: [
        {
          id: testDreamsignId("sign-a"),
          name: "Shared Sign",
          effectDescription: "Fixture",
        },
      ],
      deck: [
        {
          entryId: parseDeckEntryId("entry-a"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
          statOverride: { energyCost: 0 },
        },
        {
          entryId: parseDeckEntryId("nightmare"),
          cardNumber: 10002,
          transfiguration: "Kindled",
          isBane: true,
        },
        {
          entryId: parseDeckEntryId("missing"),
          cardNumber: 404,
          transfiguration: null,
          isBane: false,
        },
      ],
    } as unknown as JourneyState;
  }

  describe("buildJourneyDebugEditorView", () => {
    it("uses UUID card identities and entry ids while retaining duplicate deck entries", () => {
      const shared = card();
      const nightmare = card({
        id: NIGHTMARE_CARD_ID,
        name: parseCardName(NIGHTMARE_CARD_NAME),
        cardNumber: 10002,
      });
      const view = buildJourneyDebugEditorView(
        state(),
        new Map([
          [1, shared],
          [10002, nightmare],
        ]),
        [
          {
            id: testDreamsignId("sign-a"),
            name: "Shared Sign",
            effectDescription: "Fixture",
          },
        ],
      );

      expect(view.cards[0]?.cardId).toBe(shared.id);
      expect(view.cards[0]?.model.cardId).toBe(shared.id);
      expect(view.deck.map((entry) => entry.entryId)).toEqual([
        parseDeckEntryId("entry-a"),
        parseDeckEntryId("nightmare"),
        parseDeckEntryId("missing"),
      ]);
      expect(view.deck[0]?.model?.displaySnapshot.energyCost).toBe(0);
      expect(view.deck[1]?.model?.transfiguration?.sparkChanged).toBe(true);
      expect(view.deck[2]?.model).toBeNull();
    });

    it("keeps a positional provider address separate from Dreamsign display identity", () => {
      const journey = state();
      const view = buildJourneyDebugEditorView(
        journey,
        new Map([[1, card()]]),
        [],
      );

      expect(view.dreamsigns[0]).toMatchObject({
        actionId: "dreamsign:0",
        templateId: journey.dreamsigns[0]?.id,
      });
      expect(view.dreamsigns[0]?.name).toEqual(expect.any(String));
    });
  });
});

describe("main-menu-view-model", () => {
  const MAIN_MENU_STATE: FrontDoorState = {
    phase: "main",
    journeyId: null,
    tutorial: null,
  };

  const EVENT_CONTEXT: EventContext = {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 1,
    rng: () => 0,
    timestamp: "1970-01-01T00:00:00.000Z",
    intervening: [],
  };

  describe("buildMainMenuView", () => {
    it("keeps every rendered control unique and New Journey reachable through the game fold", () => {
      const view = buildMainMenuView();
      const controls = [
        ...view.actions.map(({ id }) => ({ id, surface: "action" })),
        ...view.socials.map(({ id }) => ({ id, surface: "social" })),
      ];
      const ids = controls.map(({ id }) => id);

      expect(new Set(ids).size).toBe(ids.length);
      const next = frontDoorAction(
        MAIN_MENU_STATE,
        { surface: "main", actionId: "new-journey" },
        EVENT_CONTEXT,
      );

      expect(next).not.toBeNull();
      expect(next).not.toBe(MAIN_MENU_STATE);
    });
  });
});

describe("loading-view-model", () => {
  const TUTORIAL_LOADING_CHARACTER_CARD_ID =
    TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenCharacterCardId;

  const TUTORIAL_LOADING_EVENT_CARD_ID =
    TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenEventCardId;

  function card(cardNumber: number, idSeed: string): CardData {
    return {
      id: testCardId(idSeed),
      name: parseCardName(`Fixture ${String(cardNumber)}`),
      cardNumber,
      cardType: cardNumber === 1 ? "Character" : "Event",
      subtype: cardNumber === 1 ? "Warrior" : "",
      isStarter: true,
      energyCost: cardNumber,
      spark: cardNumber === 1 ? 3 : null,
      isFast: false,
      renderedText: "Fixture rules.",
      imageNumber: cardNumber,
      artOwned: true,
    };
  }

  describe("buildLoadingView", () => {
    it("resolves both authored cards by UUID", () => {
      const champion = card(1, TUTORIAL_LOADING_CHARACTER_CARD_ID);
      const worlds = card(2, TUTORIAL_LOADING_EVENT_CARD_ID);
      const view = buildLoadingView(
        new Map([
          [champion.cardNumber, champion],
          [worlds.cardNumber, worlds],
        ]),
        TEST_TUTORIAL_CARD_CONSTANTS,
      );

      expect(view.loadingCharacter.cardId).toBe(champion.id);
      expect(view.loadingEvent.cardId).toBe(worlds.id);
      expect(view.loadingCharacter.displaySnapshot).toBe(champion);
      expect(view.loadingEvent.displaySnapshot).toBe(worlds);
    });
  });
});
