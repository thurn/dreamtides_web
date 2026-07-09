import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectDreamcallerOffer,
  toQuestDreamcaller,
} from "./dreamcaller-selection";
import type { DreamcallerContent } from "../types/content";

function makeDreamcaller(id: string): DreamcallerContent {
  return {
    id,
    name: `Dreamcaller ${id}`,
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

describe("selectDreamcallerOffer", () => {
  it("returns exactly 3 distinct Dreamcallers", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.1);

    const offer = selectDreamcallerOffer([
      makeDreamcaller("a"),
      makeDreamcaller("b"),
      makeDreamcaller("c"),
      makeDreamcaller("d"),
      makeDreamcaller("e"),
    ]);

    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((dreamcaller) => dreamcaller.id)).size).toBe(3);
  });

  it("fails loudly when the validated Dreamcaller list is too small", () => {
    expect(() =>
      selectDreamcallerOffer([
        makeDreamcaller("a"),
        makeDreamcaller("b"),
      ]),
    ).toThrow("Expected at least 3 Dreamcallers");
  });
});

describe("toQuestDreamcaller", () => {
  it("returns the player-facing Dreamcaller display fields", () => {
    expect(toQuestDreamcaller(makeDreamcaller("a"))).toEqual({
      id: "a",
      name: "Dreamcaller a",
      title: "Title a",
      renderedText: "Rules text for a.",
      imageNumber: "00a",
      portraitFocus: { x: 0.42, y: 0.18 },
      startingEssence: 250,
    });
  });

  it("omits optional portrait focus when the source record has none", () => {
    const dreamcaller = makeDreamcaller("a");
    delete dreamcaller.portraitFocus;

    const result = toQuestDreamcaller(dreamcaller);

    expect(result).toEqual({
      id: "a",
      name: "Dreamcaller a",
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
