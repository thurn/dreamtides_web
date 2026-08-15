import { describe, expect, it } from "vitest";
import type { DreamsignTemplate } from "../types/content";
import {
  drawDreamsignOptions,
  readDreamsignPool,
  resolveDreamsignTemplates,
} from "./dreamsign-pool";
import { testDreamsignId } from "../types/test-identities";

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: testDreamsignId("embers-whisper"),
    name: "Ember's Whisper",
    effectDescription: "Fire.",
  },
  {
    id: testDreamsignId("glacial-insight"),
    name: "Glacial Insight",
    effectDescription: "Ice.",
  },
  {
    id: testDreamsignId("verdant-accord"),
    name: "Verdant Accord",
    effectDescription: "Growth.",
  },
];

describe("readDreamsignPool", () => {
  it("treats the pool as a unique set of stable template ids", () => {
    const pool = readDreamsignPool(
      [
        testDreamsignId("glacial-insight"),
        testDreamsignId("missing-id"),
        testDreamsignId("glacial-insight"),
        testDreamsignId("embers-whisper"),
      ],
      DREAMSIGN_TEMPLATES,
    );

    expect(pool.availableIds).toEqual([
      testDreamsignId("glacial-insight"),
      testDreamsignId("embers-whisper"),
    ]);
  });
});

describe("drawDreamsignOptions", () => {
  it("spends shown ids immediately from the shared pool", () => {
    const draw = drawDreamsignOptions(
      [
        testDreamsignId("embers-whisper"),
        testDreamsignId("glacial-insight"),
        testDreamsignId("verdant-accord"),
      ],
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect(draw.offeredDreamsigns).toHaveLength(2);
    expect(draw.remainingDreamsignPool).toHaveLength(1);
    expect(
      draw.offeredIds.every((id) => !draw.remainingDreamsignPool.includes(id)),
    ).toBe(true);
  });

  it("includes required available ids before filling the rest of the offer", () => {
    const draw = drawDreamsignOptions(
      [
        testDreamsignId("embers-whisper"),
        testDreamsignId("glacial-insight"),
        testDreamsignId("verdant-accord"),
      ],
      DREAMSIGN_TEMPLATES,
      2,
      undefined,
      () => 0,
      [testDreamsignId("verdant-accord")],
    );

    expect(draw.offeredIds).toHaveLength(2);
    expect(draw.offeredIds).toContain(testDreamsignId("verdant-accord"));
    expect(draw.remainingDreamsignPool).not.toContain(
      testDreamsignId("verdant-accord"),
    );
  });

  it("consumes the shared pool across sequential reveals without repeats", () => {
    const first = drawDreamsignOptions(
      [
        testDreamsignId("embers-whisper"),
        testDreamsignId("glacial-insight"),
        testDreamsignId("verdant-accord"),
      ],
      DREAMSIGN_TEMPLATES,
      2,
    );
    const second = drawDreamsignOptions(
      first.remainingDreamsignPool,
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect([...first.offeredIds, ...second.offeredIds].sort()).toEqual([
      testDreamsignId("glacial-insight"),
      testDreamsignId("embers-whisper"),
      testDreamsignId("verdant-accord"),
    ]);
    expect(second.remainingDreamsignPool).toEqual([]);
  });

  it("cleans up stale ids instead of preserving a fake non-empty pool", () => {
    const draw = drawDreamsignOptions(
      [testDreamsignId("missing-id"), testDreamsignId("glacial-insight")],
      DREAMSIGN_TEMPLATES,
      2,
    );

    expect(draw.offeredIds).toEqual([testDreamsignId("glacial-insight")]);
    expect(draw.remainingDreamsignPool).toEqual([]);
  });

  it("degrades to a clean no-offer path when the pool is exhausted", () => {
    expect(
      drawDreamsignOptions(
        [testDreamsignId("missing-id")],
        DREAMSIGN_TEMPLATES,
        3,
      ),
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
          testDreamsignId("glacial-insight"),
          testDreamsignId("missing-id"),
          testDreamsignId("embers-whisper"),
          testDreamsignId("glacial-insight"),
        ],
        DREAMSIGN_TEMPLATES,
      ).map((template) => template.id),
    ).toEqual([
      testDreamsignId("glacial-insight"),
      testDreamsignId("embers-whisper"),
    ]);
  });
});
