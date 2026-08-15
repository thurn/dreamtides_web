import { testJourneySeed } from "../types/test-identities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectAvatarOffer,
  selectAvatarOfferForReroll,
  selectAvatarOfferForSeed,
  toJourneyAvatar,
} from "./avatar-selection";
import type { AvatarContent } from "../types/content";
import { testAvatarId } from "../types/test-identities";

function makeAvatar(idSeed: string): AvatarContent {
  return {
    id: testAvatarId(idSeed),
    name: `Avatar ${idSeed}`,
    title: `Title ${idSeed}`,
    renderedText: `Rules text for ${idSeed}.`,
    imageNumber: `00${idSeed}`,
    portraitFocus: { x: 0.42, y: 0.18 },
    startingEssence: 250,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("selectAvatarOffer", () => {
  it("returns exactly 3 distinct Avatars", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.1);

    const offer = selectAvatarOffer([
      makeAvatar("a"),
      makeAvatar("b"),
      makeAvatar("c"),
      makeAvatar("d"),
      makeAvatar("e"),
    ]);

    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((avatar) => avatar.id)).size).toBe(3);
  });

  it("fails loudly when the validated Avatar list is too small", () => {
    expect(() =>
      selectAvatarOffer([makeAvatar("a"), makeAvatar("b")]),
    ).toThrow("Expected at least 3 Avatars");
  });

  it("derives the same offer from the same room seed across remounts", () => {
    const avatars = ["a", "b", "c", "d", "e", "f"].map(makeAvatar);

    const first = selectAvatarOfferForSeed(avatars, testJourneySeed("room-seed"));
    const second = selectAvatarOfferForSeed(avatars, testJourneySeed("room-seed"));

    expect(first.map((avatar) => avatar.id)).toEqual(
      second.map((avatar) => avatar.id),
    );
  });

  it("derives deterministic rerolls that change at least one shown id", () => {
    const avatars = ["a", "b", "c", "d", "e", "f"].map(makeAvatar);
    const initial = selectAvatarOfferForReroll(
      avatars,
      testJourneySeed("room-seed"),
      0,
    );
    const rerolled = selectAvatarOfferForReroll(
      avatars,
      testJourneySeed("room-seed"),
      1,
    );
    const repeated = selectAvatarOfferForReroll(
      avatars,
      testJourneySeed("room-seed"),
      1,
    );

    expect(rerolled.map((avatar) => avatar.id)).toEqual(
      repeated.map((avatar) => avatar.id),
    );
    expect(
      rerolled.some(
        (avatar) => !initial.some((shown) => shown.id === avatar.id),
      ),
    ).toBe(true);
  });
});

describe("toJourneyAvatar", () => {
  it("returns the player-facing Avatar display fields", () => {
    expect(toJourneyAvatar(makeAvatar("a"))).toEqual({
      id: testAvatarId("a"),
      name: "Avatar a",
      title: "Title a",
      renderedText: "Rules text for a.",
      imageNumber: "00a",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 250,
    });
  });

  it("omits optional portrait focus when the source record has none", () => {
    const avatar = makeAvatar("a");
    delete avatar.portraitFocus;

    const result = toJourneyAvatar(avatar);

    expect(result).toEqual({
      id: testAvatarId("a"),
      name: "Avatar a",
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
