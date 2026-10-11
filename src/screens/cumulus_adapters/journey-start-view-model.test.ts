import { makeTestPoolContext } from "../../testing/pool-context";
import {
  testJourneySeed,
  testCardId,
  testAvatarId,
  testTideId,
  testTutorialJourneyTideId,
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
import { parsePresentationId } from "../../types/identifiers";

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
