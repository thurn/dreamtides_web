import { describe, expect, it } from "vitest";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import {
  buildGambleSiteView,
  buildStandardPlayingCardDeck,
  dealGamblePlayingCards,
  resolveGambleGuide,
} from "./gamble-site-view-model";

const GAMBLE_SITE: SiteState & { type: "Gamble" } = {
  id: "fixture-gamble-site",
  type: "Gamble",
  isEnhanced: false,
  isVisited: false,
};

describe("gamble-site-view-model", () => {
  it("builds exactly one entry for every rank-and-suit combination", () => {
    const deck = buildStandardPlayingCardDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
    expect(deck).toContainEqual({
      id: "10-diamonds",
      rank: "10",
      suit: "diamonds",
    });
  });

  it("deals six unique cards reproducibly from a seed", () => {
    const first = dealGamblePlayingCards("fixture-seed-a");
    const repeat = dealGamblePlayingCards("fixture-seed-a");
    const other = dealGamblePlayingCards("fixture-seed-b");

    expect(first).toHaveLength(6);
    expect(new Set(first.map((card) => card.id)).size).toBe(6);
    expect(repeat).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("maps the resident guide and dealt cards without production-data assertions", () => {
    const guides: readonly DreamGuideContent[] = [
      {
        id: "fixture-gambler",
        name: "Fixture Gambler",
        homeDreamscapeId: "fixture-dreamscape",
        siteType: "Gamble",
        dialog: ["A fixture greeting."],
        homeSpecialty: "Fixture specialty.",
      },
    ];
    const guide = resolveGambleGuide(guides);
    const view = buildGambleSiteView({
      sceneNode: null,
      site: GAMBLE_SITE,
      guide,
      guideLine: "A chosen greeting.",
      dealSeed: "fixture-deal",
    });

    expect(view).toMatchObject({
      siteId: "fixture-gamble-site",
      dealId: "fixture-deal",
      guide: {
        id: "fixture-gambler",
        name: "Fixture Gambler",
        line: "A chosen greeting.",
      },
    });
    expect(view.cards).toHaveLength(6);
  });
});
