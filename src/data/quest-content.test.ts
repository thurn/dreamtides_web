import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countPackageOverlap,
  isPackageAdjacent,
  loadQuestContent,
  packageOverlapWeight,
  resolveDreamcallerPackage,
  selectPackageAdjacentOrFallback,
} from "./quest-content";
import type { DreamcallerContent, DreamsignTemplate } from "../types/content";
import type { CardData } from "../types/cards";

function makeCard(
  cardNumber: number,
  tides: string[],
): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    tides,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function buildCards(countsByPackageTide: Record<string, number>): CardData[] {
  const cards: CardData[] = [];
  let cardNumber = 1;

  for (const [packageTideId, count] of Object.entries(countsByPackageTide)) {
    for (let index = 0; index < count; index += 1) {
      cards.push(makeCard(cardNumber, [packageTideId]));
      cardNumber += 1;
    }
  }

  return cards;
}

function makeDreamcaller(
  optionalTides: string[],
): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "Speaker of Tests",
    renderedText: "Test rules text.",
    imageNumber: "0001",
    startingEssence: 250,
    mandatoryTides: ["m1", "m2", "m3"],
    optionalTides,
  };
}

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "adjacent-sign",
    name: "Adjacent Sign",
    effectDescription: "Adjacent effect.",
    packageTides: ["o4", "support"],
  },
  {
    id: "mandatory-sign",
    name: "Mandatory Sign",
    effectDescription: "Mandatory effect.",
    packageTides: ["m2"],
  },
  {
    id: "off-package-sign",
    name: "Off Package Sign",
    effectDescription: "Off package effect.",
    packageTides: ["unused"],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("countPackageOverlap", () => {
  it("counts shared package tides exactly once per shared entry", () => {
    expect(
      countPackageOverlap(["alpha", "beta", "gamma"], ["delta", "beta", "gamma"]),
    ).toBe(2);
  });

  it("returns false adjacency when there is no overlap", () => {
    expect(isPackageAdjacent(["alpha"], ["beta", "gamma"])).toBe(false);
  });

  it("filters to adjacent items and falls back when nothing overlaps", () => {
    const adjacentOnly = selectPackageAdjacentOrFallback(
      [
        { id: "a", tides: ["alpha"] },
        { id: "b", tides: ["beta"] },
      ],
      (item) => item.tides,
      ["beta"],
    );
    const fallback = selectPackageAdjacentOrFallback(
      [
        { id: "a", tides: ["alpha"] },
        { id: "b", tides: ["beta"] },
      ],
      (item) => item.tides,
      ["gamma"],
    );

    expect(adjacentOnly).toEqual([{ id: "b", tides: ["beta"] }]);
    expect(fallback).toEqual([
      { id: "a", tides: ["alpha"] },
      { id: "b", tides: ["beta"] },
    ]);
  });

  it("treats package overlap as a weight and returns 1 when no filter is active", () => {
    expect(packageOverlapWeight(["alpha", "beta"], ["beta", "gamma"])).toBe(1);
    expect(packageOverlapWeight(["alpha", "beta"], ["alpha", "beta"])).toBe(2);
    expect(packageOverlapWeight(["alpha"], [])).toBe(1);
  });
});

describe("resolveDreamcallerPackage", () => {
  it("rejects Dreamcallers with no legal optional subset", () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 5,
      o2: 5,
      o3: 5,
      o4: 5,
    });

    expect(() =>
      resolveDreamcallerPackage(
        makeDreamcaller(["o1", "o2", "o3", "o4"]),
        cards,
        DREAMSIGN_TEMPLATES,
      ),
    ).toThrow(/no legal optional subset/);
  });

  it("selects the preferred subset closest to the target centre and caps overlap copies at 2", () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 20,
      o2: 25,
      o3: 30,
      o4: 33,
    });
    cards.push(makeCard(999, ["m1", "o4", "extra"]));

    const resolved = resolveDreamcallerPackage(
      makeDreamcaller(["o1", "o2", "o3", "o4"]),
      cards,
      DREAMSIGN_TEMPLATES,
    );

    // Legal subset sizes are 196/200/205/210; the centre of the preferred
    // 190-210 range is 200, so {o1,o2,o4} (200 cards) is chosen.
    expect(resolved.mandatoryOnlyPoolSize).toBe(121);
    expect(resolved.optionalSubset).toEqual(["o1", "o2", "o4"]);
    expect(resolved.draftPoolSize).toBe(200);
    expect(resolved.draftPoolCopiesByCard["999"]).toBe(2);
    expect(resolved.doubledCardCount).toBe(1);
  });

  it("breaks equal-size preferred ties lexicographically", () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 25,
      o2: 25,
      o3: 25,
      o4: 25,
    });

    const resolved = resolveDreamcallerPackage(
      makeDreamcaller(["o1", "o2", "o3", "o4"]),
      cards,
      DREAMSIGN_TEMPLATES,
    );

    expect(resolved.optionalSubset).toEqual(["o1", "o2", "o3"]);
  });

  it("surfaces only Dreamsign templates adjacent to the resolved package", () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 20,
      o2: 25,
      o3: 30,
      o4: 33,
    });

    const resolved = resolveDreamcallerPackage(
      makeDreamcaller(["o1", "o2", "o3", "o4"]),
      cards,
      DREAMSIGN_TEMPLATES,
    );

    expect(resolved.dreamsignPoolIds).toEqual([
      "adjacent-sign",
      "mandatory-sign",
    ]);
  });
});

describe("loadQuestContent", () => {
  function stubFetch({
    cards,
    dreamcallers,
    dreamsigns,
    decklists,
  }: {
    cards: CardData[];
    dreamcallers: unknown[];
    dreamsigns: unknown[];
    decklists: string[][];
  }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (path === "/cards_v2-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cards) });
        }
        if (path === "/dreamcallers-v2-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamcallers),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamsigns),
          });
        }
        if (path === "/decklists-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(decklists),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch path: ${path}`));
      }),
    );
  }

  it("loads V2 cards, Dreamcallers, decklists and builds the run pool context", async () => {
    const cards = [
      makeCard(1, ["core"]),
      makeCard(2, ["core"]),
      makeCard(3, ["support"]),
    ];
    const v2Dreamcaller = {
      id: "dreamcaller-1",
      name: "Test Dreamcaller",
      title: "Speaker of Tests",
      renderedText: "Test rules text.",
      imageNumber: "0001",
      startingEssence: 235,
      signatureCards: ["Card 1", "Card 2"],
    };

    stubFetch({
      cards,
      dreamcallers: [v2Dreamcaller],
      dreamsigns: [],
      decklists: [["Card 1", "Card 2", "Card 3"]],
    });

    const content = await loadQuestContent();

    expect(content.cardDatabase.size).toBe(cards.length);
    expect(content.dreamcallers).toHaveLength(1);
    // The Dreamcaller mapping must carry the V2 signature cards through.
    expect(content.dreamcallers[0].signatureCards).toEqual(["Card 1", "Card 2"]);
    expect(content.dreamcallers[0].startingEssence).toBe(235);

    // Packages are no longer precomputed at load.
    expect(content.resolvedPackagesByDreamcallerId.size).toBe(0);

    // The pool context indexes every loaded card and carries the decklists.
    expect(content.poolContext).toBeDefined();
    const poolContext = content.poolContext!;
    for (const card of cards) {
      expect(poolContext.nameIndex.get(card.name)).toBe(card.cardNumber);
    }
    expect(poolContext.poolData.decklists).not.toHaveLength(0);
  });

  it("offers every Dreamcaller without a validation skip loop", async () => {
    const cards = [makeCard(1, ["core"]), makeCard(2, ["support"])];
    const dreamcallers = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 0,
        signatureCards: ["Card 1"],
      },
      {
        id: "dc-b",
        name: "Beta",
        title: "B",
        renderedText: "",
        imageNumber: "0002",
        startingEssence: 250,
        signatureCards: [],
      },
    ];

    stubFetch({ cards, dreamcallers, dreamsigns: [], decklists: [["Card 1"]] });

    const content = await loadQuestContent();

    expect(content.dreamcallers.map((dc) => dc.id)).toEqual(["dc-a", "dc-b"]);
    // A zero startingEssence falls back to the default rather than being dropped.
    expect(content.dreamcallers[0].startingEssence).toBe(250);
  });
});
