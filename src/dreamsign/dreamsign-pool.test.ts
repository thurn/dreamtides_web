import { describe, expect, it } from "vitest";
import type { DreamsignTemplate } from "../types/content";
import {
  drawDreamsignOptions,
  readDreamsignPool,
  resolveDreamsignTemplates,
} from "./dreamsign-pool";

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "embers-whisper",
    name: "Ember's Whisper",
    packageTides: ["alpha"],
    effectDescription: "Fire.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    packageTides: ["beta"],
    effectDescription: "Ice.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
    packageTides: ["gamma"],
    effectDescription: "Growth.",
  },
];

describe("readDreamsignPool", () => {
  it("treats the pool as a unique set of stable template ids", () => {
    const pool = readDreamsignPool(
      [
        "glacial-insight",
        "missing-id",
        "glacial-insight",
        "embers-whisper",
      ],
      DREAMSIGN_TEMPLATES,
    );

    expect(pool.availableIds).toEqual([
      "glacial-insight",
      "embers-whisper",
    ]);
  });
});

describe("drawDreamsignOptions", () => {
  it("spends shown ids immediately from the shared pool", () => {
    const draw = drawDreamsignOptions(
      ["embers-whisper", "glacial-insight", "verdant-accord"],
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect(draw.offeredDreamsigns).toHaveLength(2);
    expect(draw.remainingDreamsignPool).toHaveLength(1);
    expect(draw.offeredIds.every((id) => !draw.remainingDreamsignPool.includes(id))).toBe(true);
  });

  it("consumes the shared pool across sequential reveals without repeats", () => {
    const first = drawDreamsignOptions(
      ["embers-whisper", "glacial-insight", "verdant-accord"],
      DREAMSIGN_TEMPLATES,
      2,
    );
    const second = drawDreamsignOptions(
      first.remainingDreamsignPool,
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect([...first.offeredIds, ...second.offeredIds].sort()).toEqual([
      "embers-whisper",
      "glacial-insight",
      "verdant-accord",
    ]);
    expect(second.remainingDreamsignPool).toEqual([]);
  });

  it("cleans up stale ids instead of preserving a fake non-empty pool", () => {
    const draw = drawDreamsignOptions(
      ["missing-id", "glacial-insight"],
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect(draw.offeredIds).toEqual(["glacial-insight"]);
    expect(draw.remainingDreamsignPool).toEqual([]);
  });

  it("degrades to a clean no-offer path when the pool is exhausted", () => {
    expect(
      drawDreamsignOptions(["missing-id"], DREAMSIGN_TEMPLATES, 3),
    ).toEqual({
      offeredIds: [],
      offeredDreamsigns: [],
      remainingDreamsignPool: [],
    });
  });
});

describe("drawDreamsignOptions required-tide guarantee", () => {
  // Realistic-shaped pool: 2 required-tide dreamsigns, 6 optional-tide,
  // 12 utility dreamsigns -- mirrors how `dreamsignPoolIds` skews in
  // production. Without the guarantee, ~70%+ of 3-card draws miss every
  // required tide; this test asserts the guarantee holds for every draw.
  const REQUIRED_TIDES = ["alpha", "beta"];
  const OPTIONAL_TIDES = ["delta", "gamma"];
  const UTILITY_TIDE = "utility";

  function buildRealisticPool(): {
    templates: DreamsignTemplate[];
    poolIds: string[];
  } {
    const templates: DreamsignTemplate[] = [];
    for (let i = 0; i < 2; i += 1) {
      templates.push({
        id: `req-${String(i)}`,
        name: `Required ${String(i)}`,
        packageTides: [REQUIRED_TIDES[i % REQUIRED_TIDES.length]],
        effectDescription: "req",
      });
    }
    for (let i = 0; i < 6; i += 1) {
      templates.push({
        id: `opt-${String(i)}`,
        name: `Optional ${String(i)}`,
        packageTides: [OPTIONAL_TIDES[i % OPTIONAL_TIDES.length]],
        effectDescription: "opt",
      });
    }
    for (let i = 0; i < 12; i += 1) {
      templates.push({
        id: `util-${String(i)}`,
        name: `Utility ${String(i)}`,
        packageTides: [UTILITY_TIDE],
        effectDescription: "util",
      });
    }
    return { templates, poolIds: templates.map((t) => t.id) };
  }

  function structuralCount(
    offeredIds: readonly string[],
    templates: readonly DreamsignTemplate[],
  ): number {
    const templatesById = new Map(templates.map((t) => [t.id, t]));
    const requiredSet = new Set(REQUIRED_TIDES);
    return offeredIds.filter((id) =>
      templatesById.get(id)?.packageTides.some((tide) => requiredSet.has(tide)),
    ).length;
  }

  it("guarantees at least one required-tide dreamsign across many trials", () => {
    const { templates, poolIds } = buildRealisticPool();
    const trials = 500;
    for (let trial = 0; trial < trials; trial += 1) {
      const draw = drawDreamsignOptions(
        poolIds,
        templates,
        3,
        poolIds,
        REQUIRED_TIDES,
      );
      expect(draw.offeredIds).toHaveLength(3);
      expect(new Set(draw.offeredIds).size).toBe(3);
      expect(structuralCount(draw.offeredIds, templates)).toBeGreaterThanOrEqual(1);
    }
  });

  it("never produces duplicate offered ids when applying the guarantee", () => {
    const { templates, poolIds } = buildRealisticPool();
    for (let trial = 0; trial < 200; trial += 1) {
      const draw = drawDreamsignOptions(
        poolIds,
        templates,
        4,
        poolIds,
        REQUIRED_TIDES,
      );
      expect(new Set(draw.offeredIds).size).toBe(draw.offeredIds.length);
    }
  });

  it("places the guaranteed slot at random positions in the offer", () => {
    const { templates, poolIds } = buildRealisticPool();
    const positionsWithStructural = new Set<number>();
    for (let trial = 0; trial < 400; trial += 1) {
      const draw = drawDreamsignOptions(
        poolIds,
        templates,
        3,
        poolIds,
        REQUIRED_TIDES,
      );
      const templatesById = new Map(templates.map((t) => [t.id, t]));
      const requiredSet = new Set(REQUIRED_TIDES);
      draw.offeredIds.forEach((id, index) => {
        const tides = templatesById.get(id)?.packageTides ?? [];
        if (tides.some((tide) => requiredSet.has(tide))) {
          positionsWithStructural.add(index);
        }
      });
      if (positionsWithStructural.size >= 3) break;
    }
    // The structural slot should land at all three positions across many
    // trials, demonstrating the constraint is not pinned to a fixed index.
    expect(positionsWithStructural.size).toBe(3);
  });

  it("falls back gracefully when the pool has no required-tide template", () => {
    const templates: DreamsignTemplate[] = [
      {
        id: "u1",
        name: "U1",
        packageTides: ["utility"],
        effectDescription: "",
      },
      {
        id: "u2",
        name: "U2",
        packageTides: ["utility"],
        effectDescription: "",
      },
      {
        id: "u3",
        name: "U3",
        packageTides: ["utility"],
        effectDescription: "",
      },
    ];
    const poolIds = templates.map((t) => t.id);
    const draw = drawDreamsignOptions(
      poolIds,
      templates,
      3,
      poolIds,
      ["alpha"],
    );
    // No required-tide template exists -- the draw must still complete with
    // 3 unique, valid dreamsigns rather than crashing or returning empty.
    expect(draw.offeredIds).toHaveLength(3);
    expect(new Set(draw.offeredIds).size).toBe(3);
  });

  it("leaves draws unchanged when the unbiased shuffle already covers a required tide", () => {
    const templates: DreamsignTemplate[] = [
      {
        id: "r1",
        name: "R1",
        packageTides: ["alpha"],
        effectDescription: "",
      },
      {
        id: "r2",
        name: "R2",
        packageTides: ["beta"],
        effectDescription: "",
      },
      {
        id: "r3",
        name: "R3",
        packageTides: ["alpha"],
        effectDescription: "",
      },
    ];
    const poolIds = templates.map((t) => t.id);
    // Every template in the pool already covers a required tide, so the
    // guarantee should never swap.
    for (let trial = 0; trial < 50; trial += 1) {
      const draw = drawDreamsignOptions(
        poolIds,
        templates,
        3,
        poolIds,
        ["alpha", "beta"],
      );
      expect(new Set(draw.offeredIds)).toEqual(new Set(["r1", "r2", "r3"]));
    }
  });
});

describe("resolveDreamsignTemplates", () => {
  it("returns templates in canonical pool order without duplicates", () => {
    expect(
      resolveDreamsignTemplates(
        [
          "glacial-insight",
          "missing-id",
          "embers-whisper",
          "glacial-insight",
        ],
        DREAMSIGN_TEMPLATES,
      ).map((template) => template.id),
    ).toEqual(["glacial-insight", "embers-whisper"]);
  });
});
