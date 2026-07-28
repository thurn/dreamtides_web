import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectDreamAvatarOffer,
  selectDreamAvatarOfferForReroll,
  selectDreamAvatarOfferForSeed,
  toJourneyDreamAvatar,
} from "./dream-avatar-selection";
import type { DreamAvatarContent } from "../types/content";

function makeDreamAvatar(id: string): DreamAvatarContent {
  return {
    id,
    name: `DreamAvatar ${id}`,
    title: `Title ${id}`,
    renderedText: `Rules text for ${id}.`,
    imageNumber: `00${id}`,
    portraitFocus: { x: 0.42, y: 0.18 },
    startingEssence: 250,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("selectDreamAvatarOffer", () => {
  it("returns exactly 3 distinct DreamAvatars", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.1);

    const offer = selectDreamAvatarOffer([
      makeDreamAvatar("a"),
      makeDreamAvatar("b"),
      makeDreamAvatar("c"),
      makeDreamAvatar("d"),
      makeDreamAvatar("e"),
    ]);

    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((dreamAvatar) => dreamAvatar.id)).size).toBe(3);
  });

  it("fails loudly when the validated DreamAvatar list is too small", () => {
    expect(() =>
      selectDreamAvatarOffer([
        makeDreamAvatar("a"),
        makeDreamAvatar("b"),
      ]),
    ).toThrow("Expected at least 3 DreamAvatars");
  });

  it("derives the same offer from the same room seed across remounts", () => {
    const dreamAvatars = ["a", "b", "c", "d", "e", "f"].map(makeDreamAvatar);

    const first = selectDreamAvatarOfferForSeed(dreamAvatars, "room-seed");
    const second = selectDreamAvatarOfferForSeed(dreamAvatars, "room-seed");

    expect(first.map((dreamAvatar) => dreamAvatar.id)).toEqual(
      second.map((dreamAvatar) => dreamAvatar.id),
    );
  });

  it("derives deterministic rerolls that change at least one shown id", () => {
    const dreamAvatars = ["a", "b", "c", "d", "e", "f"].map(makeDreamAvatar);
    const initial = selectDreamAvatarOfferForReroll(
      dreamAvatars,
      "room-seed",
      0,
    );
    const rerolled = selectDreamAvatarOfferForReroll(
      dreamAvatars,
      "room-seed",
      1,
    );
    const repeated = selectDreamAvatarOfferForReroll(
      dreamAvatars,
      "room-seed",
      1,
    );

    expect(rerolled.map((dreamAvatar) => dreamAvatar.id)).toEqual(
      repeated.map((dreamAvatar) => dreamAvatar.id),
    );
    expect(rerolled.some(
      (dreamAvatar) => !initial.some((shown) => shown.id === dreamAvatar.id),
    )).toBe(true);
  });
});

describe("toJourneyDreamAvatar", () => {
  it("returns the player-facing DreamAvatar display fields", () => {
    expect(toJourneyDreamAvatar(makeDreamAvatar("a"))).toEqual({
      id: "a",
      name: "DreamAvatar a",
      title: "Title a",
      renderedText: "Rules text for a.",
      imageNumber: "00a",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 250,
    });
  });

  it("omits optional portrait focus when the source record has none", () => {
    const dreamAvatar = makeDreamAvatar("a");
    delete dreamAvatar.portraitFocus;

    const result = toJourneyDreamAvatar(dreamAvatar);

    expect(result).toEqual({
      id: "a",
      name: "DreamAvatar a",
      title: "Title a",
      renderedText: "Rules text for a.",
      imageNumber: "00a",
      startingEssence: 250,
    });
    expect(Object.prototype.hasOwnProperty.call(result, "portraitFocus")).toBe(
      false,
    );
  });
});
