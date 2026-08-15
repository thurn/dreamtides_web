import { testJourneySeed } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { LocalizedString } from "@trox/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type { DreamAvatarContent } from "../../types/content";
import type { Tides4DeckJson } from "../../draft/pool/tides4-io";
import type { TutorialJourneyPool } from "../../data/tutorial-journey-pool";
import {
  buildDreamAvatarOfferViews,
  buildJourneyStartGuideDialogue,
  largestTides,
  resolveDreamAvatarOffer,
  toDreamAvatarOfferView,
} from "./journey-start-view-model";
import { parseCardName } from "../../types/card-identity";
import { parsePresentationId } from "../../types/identifiers";
import {
  testCardId,
  testDreamAvatarId,
  testTideId,
  testTutorialJourneyTideId,
} from "../../types/test-identities";

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

function dreamAvatar(
  overrides: Partial<DreamAvatarContent> = {},
): DreamAvatarContent {
  return {
    id: testDreamAvatarId("dc-1"),
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
  it("returns the input unchanged when at or below the cap", () => {
    const tides = [tide("a", 5), tide("b", 3), tide("c", 1)];
    expect(largestTides(tides)).toEqual(tides);
  });

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

  it("counts copies, not unique card entries", () => {
    const big: Tides4DeckJson = {
      id: testTideId("big"),
      displayName: "big",
      auguryPackageReference: "big package",
      displayDescription: "big description",
      role: "facet",
      resonance: "shadow",
      cards: [{ id: testCardId("x"), copies: 20 }],
    };
    const tides = [tide("a", 5), tide("b", 5), tide("c", 5), tide("d", 5), big];
    expect(largestTides(tides)).toHaveLength(4);
    expect(largestTides(tides).map((t) => t.id)).toContain(big.id);
  });
});

describe("resolveDreamAvatarOffer", () => {
  it("returns only the UUID-pinned tutorial DreamAvatar", () => {
    const dreamAvatars = [
      dreamAvatar({ id: testDreamAvatarId("avatar-a") }),
      dreamAvatar({ id: testDreamAvatarId("avatar-b") }),
      dreamAvatar({ id: testDreamAvatarId("avatar-c") }),
      dreamAvatar({ id: testDreamAvatarId("avatar-d") }),
    ];

    const tutorialAvatarId = testDreamAvatarId("avatar-c");
    const offer = resolveDreamAvatarOffer(
      dreamAvatars,
      testJourneySeed("room-seed"),
      12,
      tutorialAvatarId,
    );

    expect(offer.map((candidate) => candidate.id)).toEqual([
      tutorialAvatarId,
    ]);
  });

  it("returns an empty tutorial offer when the persisted UUID is unavailable", () => {
    const offer = resolveDreamAvatarOffer(
      [dreamAvatar({ id: testDreamAvatarId("avatar-a") })],
      testJourneySeed("room-seed"),
      0,
      testDreamAvatarId("missing-avatar"),
    );

    expect(offer).toEqual([]);
  });

  it("derives the normal three-avatar offer when no tutorial UUID is set", () => {
    const dreamAvatars = ["a", "b", "c", "d"].map((id) =>
      dreamAvatar({ id: testDreamAvatarId(id) }),
    );

    const offer = resolveDreamAvatarOffer(dreamAvatars, testJourneySeed("room-seed"), 0);

    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((candidate) => candidate.id)).size).toBe(3);
  });
});

describe("buildJourneyStartGuideDialogue", () => {
  it("maps authored Mira guidance for a UUID-pinned offer", () => {
    const tutorialAvatarId = testDreamAvatarId("tutorial-avatar-uuid");
    const dialogue = buildJourneyStartGuideDialogue(tutorialAvatarId, {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 40,
        verticalOffset: -10,
        bubbleWidth: 550,
        text: "Authored [purple]Dream Avatar[/purple] guidance.",
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
    expect(dialogue?.model.portraitAlt).toBeInstanceOf(LocalizedString);
    expect(dialogue?.model.speakerName).toBeInstanceOf(LocalizedString);
    expect(dialogue?.model.text).toBeInstanceOf(LocalizedString);
  });

  it("omits guidance from ordinary offers and missing authored data", () => {
    const authored = {
      speaker: "mira" as const,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 550,
      text: "Authored guidance.",
    };
    expect(buildJourneyStartGuideDialogue(undefined, authored)).toBeUndefined();
    expect(
      buildJourneyStartGuideDialogue(testDreamAvatarId("tutorial-avatar-uuid")),
    ).toBeUndefined();
  });
});

describe("toDreamAvatarOfferView", () => {
  it("suppresses signature cards whenever tides exist (tides4 runs show tides instead)", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [parseCardName("Alpha"), parseCardName("Beta")],
        signatureCardIds: [testCardId("uuid-a"), testCardId("uuid-b")],
      }),
      [tide("t1", 3)],
    );
    expect(view.signatureCards).toEqual([]);
    expect(view.tides.map((t) => t.id)).toEqual([testTideId("t1")]);
  });

  it("shows signature cards keyed by their stable UUIDs when there are no tides", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [parseCardName("Alpha"), parseCardName("Alpha")],
        signatureCardIds: [testCardId("uuid-a1"), testCardId("uuid-a2")],
      }),
      [],
    );
    // Two cards sharing a display name stay distinct because keys come from
    // the index-aligned UUID list, never from the name.
    expect(view.signatureCards.map(({ id }) => id)).toEqual([
      testCardId("uuid-a1"),
      testCardId("uuid-a2"),
    ]);
    expect(
      view.signatureCards.every(({ name }) => name instanceof LocalizedString),
    ).toBe(true);
  });

  it("falls back to a name+index key only when a UUID is missing", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [parseCardName("Alpha")],
        signatureCardIds: [],
      }),
      [],
    );
    expect(view.signatureCards).toHaveLength(1);
    expect(view.signatureCards[0]?.id).toBeNull();
    expect(view.signatureCards[0]?.name).toBeInstanceOf(LocalizedString);
  });

  it("copies the DreamAvatar's display fields through unchanged", () => {
    const avatar = dreamAvatar();
    const view = toDreamAvatarOfferView(avatar, []);
    expect(view).toMatchObject({
      id: avatar.id,
      imageNumber: "42",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 3,
    });
    expect(view.name).toBeInstanceOf(LocalizedString);
    expect(view.title).toBeInstanceOf(LocalizedString);
    expect(view.renderedText).toBeInstanceOf(LocalizedString);
  });
});

describe("buildDreamAvatarOfferViews", () => {
  it("shows the authored valor tides for the UUID-pinned tutorial offer", () => {
    const pool: TutorialJourneyPool = {
      dreamAvatarId: testDreamAvatarId("dc-1"),
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
            id: testCardId(`00000000-0000-4000-8000-00000000000${String(index)}`),
            copies: 2,
          },
        ],
      })),
    };

    const [view] = buildDreamAvatarOfferViews(
      [
        dreamAvatar({
          signatureCards: [parseCardName("Hidden signature")],
          signatureCardIds: [testCardId("signature-id")],
        }),
      ],
      undefined,
      testJourneySeed("room-seed"),
      pool,
      testDreamAvatarId("dc-1"),
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
