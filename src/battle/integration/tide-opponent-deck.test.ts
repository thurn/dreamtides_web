import { describe, expect, it } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import { buildTideOpponentDeck } from "./tide-opponent-deck";
import { testAffiliationId, testDreamAvatarId, testTideId, testCardId, testDreamsignId, testContentHash } from "../../types/test-identities";

const FACET_TIDE_ID = testTideId("facet-a");

const AVATAR: DreamAvatarContent = {
  id: testDreamAvatarId("avatar-a"),
  name: "Synthetic Avatar",
  title: "Fixture",
  renderedText: "A synthetic ability.",
  imageNumber: "1",
  startingEssence: 100,
};

const AFFILIATION: AffiliationContent = {
  id: testAffiliationId("affiliation-a"),
  name: "Synthetic Affiliation",
  atlasCardTheme: "Fixture",
  tideIds: [
    FACET_TIDE_ID,
    testTideId("signature-a"),
    testTideId("neutral-a"),
  ],
};

function card(index: number, rarity: CardData["rarity"] = "Common"): CardData {
  const suffix = String(index).padStart(12, "0");
  return {
    id: testCardId(`a0000000-0000-4000-8000-${suffix}`),
    name: parseCardName(`Card ${String(index)}`),
    cardNumber: index,
    cardType: index % 2 === 0 ? "Character" : "Event",
    subtype: index % 2 === 0 ? "Warrior" : "",
    isStarter: rarity === "Starter",
    rarity,
    energyCost: index % 5,
    spark: index % 2 === 0 ? 2 : null,
    isFast: false,
    renderedText: "",
    imageNumber: index,
    artOwned: true,
  };
}

const POOL_CARDS = Array.from({ length: 42 }, (_, index) =>
  card(index + 1, index === 0 ? "Legendary" : index < 8 ? "Rare" : "Common"),
);
const STARTERS = Array.from({ length: 10 }, (_, index) =>
  card(index + 101, "Starter"),
);

const TIDES: Tides4DecksJson = {
  version: 2,
  selection: { bandFraction: 0.25, bandMinimum: 5 },
  tides: [
    {
      id: testTideId("signature-a"),
      displayName: "Signature",
      displayDescription: "Synthetic signature.",
      resonance: "shadow",
      role: "signature",
      cards: POOL_CARDS.slice(0, 12).map((entry) => ({
        id: entry.id,
        copies: 1,
      })),
    },
    {
      id: FACET_TIDE_ID,
      displayName: "Facet",
      displayDescription: "Synthetic facet.",
      resonance: "ember",
      role: "facet",
      cards: POOL_CARDS.slice(12).map((entry) => ({ id: entry.id, copies: 1 })),
    },
    {
      id: testTideId("neutral-a"),
      displayName: "Neutral",
      displayDescription: "Synthetic neutral.",
      resonance: "vision",
      role: "neutral",
      cards: POOL_CARDS.slice(22).map((entry) => ({ id: entry.id, copies: 1 })),
    },
  ],
  tidePoolByDreamAvatar: {
    [AVATAR.id]: {
      starter: testTideId("signature-a"),
      facets: [FACET_TIDE_ID],
      neutral: [testTideId("neutral-a")],
    },
  },
};

const DREAMSIGNS: DreamsignTemplate[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: testDreamsignId(`dreamsign-${String(index)}`),
    name: `Dreamsign ${String(index)}`,
    effectDescription: "",
    rarity: index < 6 ? "Rare" : "Common",
    tideIds: [index < 6 ? FACET_TIDE_ID : testTideId("other")],
  }),
);

function build(completionLevel: number, reverse = false) {
  const cards = [...POOL_CARDS, ...STARTERS];
  if (reverse) cards.reverse();
  return buildTideOpponentDeck({
    opponentDreamAvatar: AVATAR,
    affiliation: AFFILIATION,
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    dreamsignTemplates: DREAMSIGNS,
    completionLevel,
    poolSeed: 1776,
    opponentsContentHash: testContentHash("opponents"),
    progression: {
      abilityActiveFromLayer: 1,
      dreamsignsFromLayer: 3,
      legendariesFromLayer: 5,
      starterDilution: [10, 5],
    },
    deckSize: 30,
    tides4Decks: TIDES,
    tides4Tuning: { dealSize: 42, copyCap: 2, maxFacets: 3 },
    deferLog: () => {},
  });
}

describe("unified Tide opponent deck", () => {
  it("builds a deterministic 30-card mature deck and selects a matching Dreamsign", () => {
    const forward = build(5);
    const reversed = build(5, true);

    expect(forward).not.toBeNull();
    expect(forward).toEqual(reversed);
    expect(forward?.baseCards).toHaveLength(30);
    expect(new Set(forward?.finalCards.map((entry) => entry.id)).size).toBe(30);
    expect(forward?.dreamsign?.tideIds).toEqual([FACET_TIDE_ID]);
    expect(forward?.abilityActive).toBe(true);
  });

  it("applies early-layer Legendary suppression and exact Starter dilution", () => {
    const result = build(0);

    expect(result?.dreamsign).toBeNull();
    expect(result?.abilityActive).toBe(false);
    expect(result?.finalCards).toHaveLength(30);
    expect(
      result?.finalCards.filter((entry) => entry.rarity === "Starter"),
    ).toHaveLength(10);
    expect(
      result?.finalCards.some((entry) => entry.rarity === "Legendary"),
    ).toBe(false);
    expect(result?.modifications.cardsCut).toHaveLength(10);
    expect(result?.modifications.legendariesSuppressed).toBe(1);
  });
});
