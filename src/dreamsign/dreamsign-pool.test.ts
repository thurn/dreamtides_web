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
    effectDescription: "Fire.",
  },
  {
    id: "glacial-insight",
    name: "Glacial Insight",
    effectDescription: "Ice.",
  },
  {
    id: "verdant-accord",
    name: "Verdant Accord",
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

  it("includes required available ids before filling the rest of the offer", () => {
    const draw = drawDreamsignOptions(
      ["embers-whisper", "glacial-insight", "verdant-accord"],
      DREAMSIGN_TEMPLATES,
      2,
      undefined,
      () => 0,
      ["verdant-accord"],
    );

    expect(draw.offeredIds).toHaveLength(2);
    expect(draw.offeredIds).toContain("verdant-accord");
    expect(draw.remainingDreamsignPool).not.toContain("verdant-accord");
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
