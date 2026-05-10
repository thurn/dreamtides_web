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

  it("selects the highest-size preferred subset and caps overlap copies at 2", () => {
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

    expect(resolved.mandatoryOnlyPoolSize).toBe(121);
    expect(resolved.optionalSubset).toEqual(["o2", "o3", "o4"]);
    expect(resolved.draftPoolSize).toBe(210);
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
  it("loads normalized assets and resolves packages once at runtime", async () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 20,
      o2: 25,
      o3: 30,
      o4: 33,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (path === "/card-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(cards),
          });
        }
        if (path === "/dreamcaller-data.json") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([makeDreamcaller(["o1", "o2", "o3", "o4"])]),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch path: ${path}`));
      }),
    );

    const content = await loadQuestContent();

    expect(content.cardDatabase.size).toBe(cards.length);
    expect(content.cardsByPackageTide.get("m1")).toHaveLength(40);
    expect(content.dreamcallers).toHaveLength(1);
    expect(content.resolvedPackagesByDreamcallerId.get("dreamcaller-1"))
      .toMatchObject({
        selectedTides: ["m1", "m2", "m3", "o2", "o3", "o4"],
        draftPoolSize: 208,
      });
  });

  it("skips invalid Dreamcaller packages with a warning instead of failing the load", async () => {
    const cards = buildCards({
      m1: 40,
      m2: 40,
      m3: 40,
      o1: 5,
      o2: 5,
      o3: 5,
      o4: 5,
      x1: 5,
      x2: 5,
      x3: 5,
      x4: 5,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (path === "/card-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(cards),
          });
        }
        if (path === "/dreamcaller-data.json") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { ...makeDreamcaller(["o1", "o2", "o3", "o4"]), id: "bad-1", name: "Bad One" },
                { ...makeDreamcaller(["x1", "x2", "x3", "x4"]), id: "bad-2", name: "Bad Two" },
              ]),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch path: ${path}`));
      }),
    );

    const { resetLog, getLogEntries } = await import("../logging");
    resetLog();

    const content = await loadQuestContent();

    expect(content.dreamcallers).toHaveLength(0);
    expect(content.resolvedPackagesByDreamcallerId.size).toBe(0);

    const skippedEvents = getLogEntries().filter(
      (entry) => entry.event === "dreamcaller_package_skipped",
    );
    expect(skippedEvents.map((entry) => entry.dreamcallerId).sort()).toEqual([
      "bad-1",
      "bad-2",
    ]);
    for (const event of skippedEvents) {
      expect(String(event.reason)).toMatch(/no legal optional subset/);
    }
  });
});
