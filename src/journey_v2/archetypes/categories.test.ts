import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "../context/buildMerchantContext";
import { MERCHANT_TUNING } from "../tuning";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { MerchantContext } from "../types";
import { buildCategoryUniverse } from "./categories";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function makeContext(input: {
  poolCards: readonly CardData[];
  deckEntries?: { entryId: string; cardNumber: number }[];
  clusters?: { id: number; flagship: string; members: string[] }[];
  corpusCards?: Record<string, { quality: number }>;
}): MerchantContext {
  const questContent = makeMerchantTestContent({
    cards: input.poolCards,
    merchantCorpus: makeMerchantTestCorpus({
      cards: input.corpusCards ?? {},
      clusters: input.clusters ?? [],
    }),
  });
  const deck = (input.deckEntries ?? []).map((e) =>
    makeMerchantTestDeckEntry({ entryId: e.entryId, cardNumber: e.cardNumber }),
  );
  return buildMerchantContext({
    questState: makeMerchantTestQuestState({ deck }),
    questContent,
    site: makeMerchantTestSite(),
  });
}

describe("category universe", () => {
  it("omits subtypes below the pool threshold and includes those at it", () => {
    const cards: CardData[] = [];
    const threshold = MERCHANT_TUNING.subtypeMinPoolCards;
    // Exactly `threshold` Warriors; threshold-1 Spirits.
    for (let i = 0; i < threshold; i += 1) {
      cards.push(
        makeMerchantTestCard({
          id: uuid(100 + i),
          cardNumber: 100 + i,
          subtype: "Warrior",
        }),
      );
    }
    for (let i = 0; i < threshold - 1; i += 1) {
      cards.push(
        makeMerchantTestCard({
          id: uuid(200 + i),
          cardNumber: 200 + i,
          subtype: "Spirit",
        }),
      );
    }
    const context = makeContext({ poolCards: cards });
    const universe = buildCategoryUniverse(context);
    const ids = universe.map((c) => c.id);
    expect(ids).toContain("subtype:Warrior");
    expect(ids).not.toContain("subtype:Spirit");
  });

  it("labels cluster categories by flagship display name", () => {
    const flagship = makeMerchantTestCard({
      id: uuid(500),
      cardNumber: 500,
      name: "Skull Weaver",
    });
    const member = makeMerchantTestCard({ id: uuid(501), cardNumber: 501 });
    const context = makeContext({
      poolCards: [flagship, member],
      clusters: [
        { id: 7, flagship: uuid(500), members: [uuid(500), uuid(501)] },
      ],
    });
    const universe = buildCategoryUniverse(context);
    const cluster = universe.find((c) => c.id === "cluster:7");
    expect(cluster).toBeDefined();
    expect(cluster?.label).toBe("Skull Weaver package");
  });

  it("flips deckAffine at exactly 2 deck cards for a subtype category", () => {
    const cards: CardData[] = [];
    const threshold = MERCHANT_TUNING.subtypeMinPoolCards;
    for (let i = 0; i < threshold; i += 1) {
      cards.push(
        makeMerchantTestCard({
          id: uuid(100 + i),
          cardNumber: 100 + i,
          subtype: "Warrior",
        }),
      );
    }

    const oneInDeck = makeContext({
      poolCards: cards,
      deckEntries: [{ entryId: "d0", cardNumber: 100 }],
    });
    const oneCat = buildCategoryUniverse(oneInDeck).find(
      (c) => c.id === "subtype:Warrior",
    );
    expect(oneCat?.deckAffine).toBe(false);

    const twoInDeck = makeContext({
      poolCards: cards,
      deckEntries: [
        { entryId: "d0", cardNumber: 100 },
        { entryId: "d1", cardNumber: 101 },
      ],
    });
    const twoCat = buildCategoryUniverse(twoInDeck).find(
      (c) => c.id === "subtype:Warrior",
    );
    expect(twoCat?.deckAffine).toBe(true);
  });

  it("flips cluster deckAffine at 1 deck card", () => {
    const flagship = makeMerchantTestCard({ id: uuid(500), cardNumber: 500 });
    const member = makeMerchantTestCard({ id: uuid(501), cardNumber: 501 });
    const clusters = [
      { id: 7, flagship: uuid(500), members: [uuid(500), uuid(501)] },
    ];
    const none = makeContext({ poolCards: [flagship, member], clusters });
    expect(
      buildCategoryUniverse(none).find((c) => c.id === "cluster:7")?.deckAffine,
    ).toBe(false);

    const one = makeContext({
      poolCards: [flagship, member],
      clusters,
      deckEntries: [{ entryId: "d0", cardNumber: 500 }],
    });
    expect(
      buildCategoryUniverse(one).find((c) => c.id === "cluster:7")?.deckAffine,
    ).toBe(true);
  });
});
