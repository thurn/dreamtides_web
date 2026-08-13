import { describe, expect, it } from "vitest";
import type { Tides4DecksJson } from "../draft/pool/tides4-io";
import {
  buildAffinityContext,
  buildTideAffinityIndex,
  cardAffinity,
  cosineAffinity,
  rarityStrength,
  sampleSelectionBand,
  selectionBandSize,
} from "./tide-affinity";

const tides: Tides4DecksJson = {
  version: 2,
  selection: { bandFraction: 0.25, bandMinimum: 5 },
  tides: [
    {
      id: "tide-a",
      displayName: "A",
      displayDescription: "A synthetic tide.",
      resonance: "ember",
      role: "facet",
      cards: [
        { id: "card-a", copies: 2 },
        { id: "card-shared", copies: 1 },
      ],
    },
    {
      id: "tide-b",
      displayName: "B",
      displayDescription: "Another synthetic tide.",
      resonance: "vision",
      role: "neutral",
      cards: [
        { id: "card-b", copies: 2 },
        { id: "card-shared", copies: 1 },
      ],
    },
  ],
  tidePoolByDreamAvatar: {},
};

describe("Tide affinity", () => {
  it("uses authored copy counts as the card vector weights", () => {
    const index = buildTideAffinityIndex(tides);

    expect([...index.cardVectors.get("card-a") ?? []]).toEqual([["tide-a", 2]]);
    expect([...index.cardVectors.get("card-shared") ?? []]).toEqual([
      ["tide-a", 1],
      ["tide-b", 1],
    ]);
  });

  it("adds joined tides, distinct deck cards, and Dreamsign tides to one context", () => {
    const index = buildTideAffinityIndex(tides);
    const context = buildAffinityContext({
      index,
      joinedTideIds: ["tide-a"],
      deckCardUuids: ["card-shared", "card-shared", "card-b"],
      dreamsignTideIds: ["tide-b"],
    });

    expect([...context]).toEqual([
      ["tide-a", 2],
      ["tide-b", 4],
    ]);
    expect(cardAffinity("card-b", context, index)).toBeCloseTo(4 / Math.sqrt(20));
    expect(cosineAffinity(new Map(), context)).toBe(0);
  });

  it("maps the four pool rarities onto one ordered strength scale", () => {
    expect([
      rarityStrength("Common"),
      rarityStrength("Uncommon"),
      rarityStrength("Rare"),
      rarityStrength("Legendary"),
    ]).toEqual([0, 1, 2, 3]);
    expect(rarityStrength("Starter")).toBe(-1);
  });

  it("exposes and samples the universal top band", () => {
    expect(selectionBandSize(0, 0.25, 5)).toBe(0);
    expect(selectionBandSize(3, 0.25, 5)).toBe(3);
    expect(selectionBandSize(30, 0.25, 5)).toBe(8);
    expect(sampleSelectionBand(["a", "b", "c"], 2, () => 0)).toBe("a");
    expect(sampleSelectionBand(["a", "b", "c"], 2, () => 1)).toBe("b");
  });
});
