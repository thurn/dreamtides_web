import { describe, expect, it } from "vitest";
import type { SiteState } from "../../types/quest";
import type { Tides4DeckJson } from "../../draft/pool/tides4-io";
import { tangoScreenFor, tangoSiteScreenFor } from "./registry";
import { largestTides } from "./QuestStartScreenAdapter";

describe("tangoScreenFor", () => {
  it("resolves the migrated questStart screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "questStart" })).not.toBeNull();
  });

  it("returns null for screens not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(tangoScreenFor({ type: "atlas" })).toBeNull();
    expect(tangoScreenFor({ type: "dreamscape" })).toBeNull();
    expect(tangoScreenFor({ type: "site", siteId: "site-1" })).toBeNull();
    expect(tangoScreenFor({ type: "questComplete" })).toBeNull();
    expect(tangoScreenFor({ type: "questFailed" })).toBeNull();
  });
});

describe("tangoSiteScreenFor", () => {
  it("returns null for every site (no site screens migrated yet)", () => {
    expect(tangoSiteScreenFor({ type: "Draft" } as SiteState)).toBeNull();
    expect(tangoSiteScreenFor({ type: "Reward" } as SiteState)).toBeNull();
  });
});

describe("largestTides", () => {
  function tide(id: string, cardCount: number): Tides4DeckJson {
    return {
      id,
      name: id,
      role: "facet",
      color: "purple",
      cards: Array.from({ length: cardCount }, (_, index) => ({
        id: `${id}-card-${String(index)}`,
        name: `${id}-card-${String(index)}`,
        copies: 1,
      })),
    };
  }

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
      name: "big",
      role: "facet",
      color: "purple",
      cards: [{ id: "x", name: "x", copies: 20 }],
    };
    const tides = [tide("a", 5), tide("b", 5), tide("c", 5), tide("d", 5), big];
    expect(largestTides(tides)).toHaveLength(4);
    expect(largestTides(tides).map((t) => t.id)).toContain("big");
  });
});
