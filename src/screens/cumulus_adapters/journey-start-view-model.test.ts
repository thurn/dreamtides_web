import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

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
import { asDreamAvatarId } from "../../types/identifiers";
import { asCardId, asCardName } from "../../types/card-identity";
import { asTideId } from "../../types/identifiers";

function tide(id: string, cardCount: number): Tides4DeckJson {
  return {
    id,
    displayName: id,
    displayDescription: `${id} description`,
    role: "facet",
    resonance: "shadow",
    cards: Array.from({ length: cardCount }, (_, index) => ({
      id: `${id}-card-${String(index)}`,
      copies: 1,
    })),
  };
}

function dreamAvatar(
  overrides: Partial<DreamAvatarContent> = {},
): DreamAvatarContent {
  return {
    id: asDreamAvatarId("dc-1"),
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
    expect(largestTides(tides).map((t) => t.id)).toEqual(["b", "d", "e", "f"]);
  });

  it("counts copies, not unique card entries", () => {
    const big: Tides4DeckJson = {
      id: "big",
      displayName: "big",
      displayDescription: "big description",
      role: "facet",
      resonance: "shadow",
      cards: [{ id: "x", copies: 20 }],
    };
    const tides = [tide("a", 5), tide("b", 5), tide("c", 5), tide("d", 5), big];
    expect(largestTides(tides)).toHaveLength(4);
    expect(largestTides(tides).map((t) => t.id)).toContain("big");
  });
});

describe("resolveDreamAvatarOffer", () => {
  it("returns only the UUID-pinned tutorial DreamAvatar", () => {
    const dreamAvatars = [
      dreamAvatar({ id: asDreamAvatarId("avatar-a") }),
      dreamAvatar({ id: asDreamAvatarId("avatar-b") }),
      dreamAvatar({ id: asDreamAvatarId("avatar-c") }),
      dreamAvatar({ id: asDreamAvatarId("avatar-d") }),
    ];

    const offer = resolveDreamAvatarOffer(
      dreamAvatars,
      "room-seed",
      12,
      asDreamAvatarId("avatar-c"),
    );

    expect(offer.map((candidate) => candidate.id)).toEqual(["avatar-c"]);
  });

  it("returns an empty tutorial offer when the persisted UUID is unavailable", () => {
    const offer = resolveDreamAvatarOffer(
      [dreamAvatar({ id: asDreamAvatarId("avatar-a") })],
      "room-seed",
      0,
      asDreamAvatarId("missing-avatar"),
    );

    expect(offer).toEqual([]);
  });

  it("derives the normal three-avatar offer when no tutorial UUID is set", () => {
    const dreamAvatars = ["a", "b", "c", "d"].map((id) =>
      dreamAvatar({ id: asDreamAvatarId(id) }),
    );

    const offer = resolveDreamAvatarOffer(dreamAvatars, "room-seed", 0);

    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((candidate) => candidate.id)).size).toBe(3);
  });
});

describe("buildJourneyStartGuideDialogue", () => {
  it("maps authored Mira guidance for a UUID-pinned offer", () => {
    expect(
      buildJourneyStartGuideDialogue(asDreamAvatarId("tutorial-avatar-uuid"), {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 40,
        verticalOffset: -10,
        bubbleWidth: 550,
        text: "Authored [purple]Dream Avatar[/purple] guidance.",
      }),
    ).toEqual({
      id: "journey-start-guidance:tutorial-avatar-uuid",
      model: {
        portrait: { kind: "character-portrait", characterId: "mira" },
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Authored [purple]Dream Avatar[/purple] guidance.",
      },
      delaySeconds: 1,
      horizontalOffset: 40,
      verticalOffset: -10,
      bubbleWidth: 550,
    });
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
      buildJourneyStartGuideDialogue(asDreamAvatarId("tutorial-avatar-uuid")),
    ).toBeUndefined();
  });
});

describe("toDreamAvatarOfferView", () => {
  it("suppresses signature cards whenever tides exist (tides4 runs show tides instead)", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [asCardName("Alpha"), asCardName("Beta")],
        signatureCardIds: [asCardId("uuid-a"), asCardId("uuid-b")],
      }),
      [tide("t1", 3)],
    );
    expect(view.signatureCards).toEqual([]);
    expect(view.tides.map((t) => t.id)).toEqual(["t1"]);
  });

  it("shows signature cards keyed by their stable UUIDs when there are no tides", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [asCardName("Alpha"), asCardName("Alpha")],
        signatureCardIds: [asCardId("uuid-a1"), asCardId("uuid-a2")],
      }),
      [],
    );
    // Two cards sharing a display name stay distinct because keys come from
    // the index-aligned UUID list, never from the name.
    expect(view.signatureCards).toEqual([
      { id: "uuid-a1", name: "Alpha" },
      { id: "uuid-a2", name: "Alpha" },
    ]);
  });

  it("falls back to a name+index key only when a UUID is missing", () => {
    const view = toDreamAvatarOfferView(
      dreamAvatar({
        signatureCards: [asCardName("Alpha")],
        signatureCardIds: [],
      }),
      [],
    );
    expect(view.signatureCards).toEqual([{ id: "Alpha-0", name: "Alpha" }]);
  });

  it("copies the DreamAvatar's display fields through unchanged", () => {
    const view = toDreamAvatarOfferView(dreamAvatar(), []);
    expect(view).toMatchObject({
      id: "dc-1",
      name: "The Cartographer",
      title: "Mapper of Sleep",
      renderedText: "Whenever you map a dream, draw a card.",
      imageNumber: "42",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 3,
    });
  });
});

describe("buildDreamAvatarOfferViews", () => {
  it("shows the authored valor tides for the UUID-pinned tutorial offer", () => {
    const pool: TutorialJourneyPool = {
      dreamAvatarId: asDreamAvatarId("dc-1"),
      poolSize: 6,
      openingOffers: [],
      openingDreamsignIds: [],
      tides: ["Bannerwake", "Sunwall", "Unfallen"].map((name, index) => ({
        id: asTideId(`tide-${String(index)}`),
        name,
        description: `${name} description`,
        type: "valor" as const,
        cards: [
          {
            id: asCardId(`00000000-0000-4000-8000-00000000000${String(index)}`),
            copies: 2,
          },
        ],
      })),
    };

    const [view] = buildDreamAvatarOfferViews(
      [
        dreamAvatar({
          signatureCards: [asCardName("Hidden signature")],
          signatureCardIds: [asCardId("signature-id")],
        }),
      ],
      undefined,
      "room-seed",
      pool,
      asDreamAvatarId("dc-1"),
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
