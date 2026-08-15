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
import { testCardId, testTideId } from "../types/test-identities";

const TIDE_A_ID = testTideId("tide-a");
const TIDE_B_ID = testTideId("tide-b");
const CARD_A_ID = testCardId("card-a");
const CARD_B_ID = testCardId("card-b");
const SHARED_CARD_ID = testCardId("card-shared");

const tides: Tides4DecksJson = {
  version: 2,
  selection: { bandFraction: 0.25, bandMinimum: 5 },
  tides: [
    {
      id: TIDE_A_ID,
      displayName: "A",
      auguryPackageReference: "A package",
      displayDescription: "A synthetic tide.",
      resonance: "ember",
      role: "facet",
      cards: [
        { id: CARD_A_ID, copies: 2 },
        { id: SHARED_CARD_ID, copies: 1 },
      ],
    },
    {
      id: TIDE_B_ID,
      displayName: "B",
      auguryPackageReference: "B package",
      displayDescription: "Another synthetic tide.",
      resonance: "vision",
      role: "neutral",
      cards: [
        { id: CARD_B_ID, copies: 2 },
        { id: SHARED_CARD_ID, copies: 1 },
      ],
    },
  ],
  tidePoolByAvatar: {},
};

describe("Tide affinity", () => {
  it("uses authored copy counts as the card vector weights", () => {
    const index = buildTideAffinityIndex(tides);

    expect([...(index.cardVectors.get(CARD_A_ID) ?? [])]).toEqual([
      [TIDE_A_ID, 2],
    ]);
    expect([...(index.cardVectors.get(SHARED_CARD_ID) ?? [])]).toEqual(
      [
        [TIDE_A_ID, 1],
        [TIDE_B_ID, 1],
      ],
    );
  });

  it("adds joined tides, distinct deck cards, and Dreamsign tides to one context", () => {
    const index = buildTideAffinityIndex(tides);
    const context = buildAffinityContext({
      index,
      joinedTideIds: [TIDE_A_ID],
      deckCardUuids: [
        SHARED_CARD_ID,
        SHARED_CARD_ID,
        CARD_B_ID,
      ],
      dreamsignTideIds: [TIDE_B_ID],
    });

    expect([...context]).toEqual([
      [TIDE_A_ID, 2],
      [TIDE_B_ID, 4],
    ]);
    expect(cardAffinity(CARD_B_ID, context, index)).toBeCloseTo(
      4 / Math.sqrt(20),
    );
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
