import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../types/card-identity";
import type { EditorCardRecord } from "./types";
import { buildCardNameSubstringGroups } from "./card-name-substring-groups";

function card(id: string, name: string, cardNumber: number): EditorCardRecord {
  return {
    id,
    cardNumber,
    cardType: "Character",
    "energy-cost": 1,
    subtype: "",
    name,
    spark: 1,
    "rendered-text": "",
    tags: [],
    tides: [],
    mtgName: "",
    popularity: 0,
    source: {},
    preview: {
      id: asCardId(id),
      cardNumber,
      name: asCardName(name),
      cardType: "Character",
      isStarter: false,
      energyCost: 1,
      spark: 1,
      subtype: "",
      isFast: false,
      renderedText: "",
      imageNumber: 0,
      artOwned: false,
      mtgName: "",
    },
  };
}

describe("buildCardNameSubstringGroups", () => {
  it("keeps distinct overlapping matches so one UUID can appear in multiple groups", () => {
    const dreamlight = card("uuid-dreamlight", "Dreamlight Guide", 1);
    const groups = buildCardNameSubstringGroups([
      dreamlight,
      card("uuid-dream", "Dream Caller", 2),
      card("uuid-light", "Starlight Keeper", 3),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["dream", "light"]);
    expect(groups.map((group) => group.cards.map((entry) => entry.id))).toEqual([
      ["uuid-dream", "uuid-dreamlight"],
      ["uuid-dreamlight", "uuid-light"],
    ]);
  });

  it("keeps the longest substring when nested matches have identical participants", () => {
    const groups = buildCardNameSubstringGroups([
      card("uuid-first", "Flame Keeper", 1),
      card("uuid-second", "Flame Keepers", 2),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("flame keeper");
  });

  it("retains nested matches when their participant sets differ", () => {
    const groups = buildCardNameSubstringGroups([
      card("uuid-first", "Moonlight Guide", 1),
      card("uuid-second", "Moonlight Keeper", 2),
      card("uuid-third", "Moonlit Scout", 3),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["moonli", "moonlight"]);
    expect(groups[0]?.cards).toHaveLength(3);
    expect(groups[1]?.cards).toHaveLength(2);
  });

  it("matches case-insensitively and orders groups and cards by direction", () => {
    const cards = [
      card("uuid-beta", "STARLIGHT Beta", 2),
      card("uuid-alpha", "Starlight Alpha", 1),
      card("uuid-dream-one", "Dream Guide", 3),
      card("uuid-dream-two", "Dream Keeper", 4),
    ];

    const ascending = buildCardNameSubstringGroups(cards, "asc");
    const descending = buildCardNameSubstringGroups(cards, "desc");

    expect(ascending.map((group) => group.key)).toEqual(["dream", "starlight"]);
    expect(ascending[1]?.substring).toBe("STARLIGHT");
    expect(ascending[1]?.cards.map((entry) => entry.id)).toEqual([
      "uuid-alpha",
      "uuid-beta",
    ]);
    expect(descending.map((group) => group.key)).toEqual(["starlight", "dream"]);
    expect(descending[0]?.cards.map((entry) => entry.id)).toEqual([
      "uuid-beta",
      "uuid-alpha",
    ]);
  });

  it("does not create a group from repeated text in one card name", () => {
    expect(
      buildCardNameSubstringGroups([card("uuid-only", "Moon Moon", 1)]),
    ).toEqual([]);
  });

  it("does not count surrounding spaces toward the minimum length", () => {
    expect(
      buildCardNameSubstringGroups([
        card("uuid-red", "Red Chan", 1),
        card("uuid-blue", "Blue Chan", 2),
      ]),
    ).toEqual([]);
  });

  it("allows internal spaces when at least five non-space characters match", () => {
    const groups = buildCardNameSubstringGroups([
      card("uuid-path", "Path of the Dawn", 1),
      card("uuid-call", "Call of the Ocean", 2),
    ]);

    expect(groups.map((group) => group.key)).toContain("of the");
  });
});
