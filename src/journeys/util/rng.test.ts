import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  type DrawContext,
  drawInt,
  drawUnit,
  deterministicTieJitter,
  shuffleDeterministic,
  weightedChoice,
} from "./rng";

/**
 * Reference implementation used by the cross-port byte-stability test.
 *
 * This mirrors the CLI's RNG exactly using Node's built-in `crypto.createHash`.
 * The ported `drawUnit` must produce the same float for the same context+label,
 * proving that swapping in `js-sha256` does not change byte output.
 */
function referenceDrawUnit(context: DrawContext, label: string): number {
  const material = [
    `seed:${context.seed}`,
    `content:${context.contentVersion}`,
    `root:${context.rootJourneyIndex}`,
    `step:${context.sequenceStep ?? "root"}`,
    ...(context.selectionAttempt === undefined
      ? []
      : [`attempt:${context.selectionAttempt}`]),
    `label:${label}`,
  ].join("\0");
  const digest = createHash("sha256").update(material).digest("hex");
  const value = Number.parseInt(digest.slice(0, 13), 16);
  return value / 0x10000000000000;
}

describe("drawUnit cross-port byte stability", () => {
  // Each tuple is independently computed against Node's `crypto` SHA-256.
  // The hard-coded expected values below were produced by running the
  // reference formula above with `crypto.createHash("sha256")`. If the ported
  // RNG diverges from them in any bit, the SHA-256 implementations have
  // drifted - which is exactly the bug class this test exists to catch.
  const cases: Array<{
    name: string;
    context: DrawContext;
    label: string;
    expected: number;
  }> = [
    {
      name: "root draw without sequenceStep or selectionAttempt",
      context: {
        seed: "random:abc",
        contentVersion: "content:v1",
        rootJourneyIndex: 1,
      },
      label: "test",
      expected: 0.555390585940541,
    },
    {
      name: "draw with sequenceStep but no selectionAttempt",
      context: {
        seed: "random:abc",
        contentVersion: "content:v1",
        rootJourneyIndex: 1,
        sequenceStep: 3,
      },
      label: "edge",
      expected: 0.08407741107589062,
    },
    {
      name: "draw with sequenceStep and selectionAttempt",
      context: {
        seed: "site-7::3",
        contentVersion: "content:v2",
        rootJourneyIndex: 0,
        sequenceStep: 0,
        selectionAttempt: 2,
      },
      label: "reward",
      expected: 0.8916019171521146,
    },
  ];

  for (const testCase of cases) {
    it(`matches Node crypto reference: ${testCase.name}`, () => {
      // Sanity-check that the hard-coded expected value still matches the
      // current Node `crypto` implementation. If this ever fails, the test
      // fixture itself is stale - which is a different bug than a SHA mismatch.
      const referenceValue = referenceDrawUnit(testCase.context, testCase.label);
      expect(referenceValue).toBe(testCase.expected);

      // The actual cross-port assertion: the ported `drawUnit` must match
      // the same byte sequence the CLI's `crypto`-backed RNG produces.
      const portedValue = drawUnit(testCase.context, testCase.label);
      expect(portedValue).toBe(testCase.expected);
    });
  }
});

describe("drawUnit", () => {
  it("returns a value in [0, 1)", () => {
    for (let index = 0; index < 16; index += 1) {
      const value = drawUnit(
        { seed: `seed-${index}`, contentVersion: "v", rootJourneyIndex: 0 },
        "label",
      );
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("treats omitted sequenceStep as the literal token 'root'", () => {
    const omitted = drawUnit(
      { seed: "s", contentVersion: "c", rootJourneyIndex: 0 },
      "label",
    );
    const explicit = referenceDrawUnit(
      { seed: "s", contentVersion: "c", rootJourneyIndex: 0 },
      "label",
    );
    expect(omitted).toBe(explicit);
  });

  it("omits the attempt segment entirely when selectionAttempt is undefined", () => {
    // If the attempt segment is accidentally included as `attempt:undefined`,
    // the digest differs from the one produced by skipping the segment.
    const withoutAttempt = drawUnit(
      { seed: "s", contentVersion: "c", rootJourneyIndex: 0, sequenceStep: 1 },
      "label",
    );
    const reference = referenceDrawUnit(
      { seed: "s", contentVersion: "c", rootJourneyIndex: 0, sequenceStep: 1 },
      "label",
    );
    expect(withoutAttempt).toBe(reference);
  });
});

describe("drawInt", () => {
  it("returns the only valid value when min === max", () => {
    const context: DrawContext = {
      seed: "s",
      contentVersion: "c",
      rootJourneyIndex: 0,
    };
    expect(drawInt(context, "label", 7, 7)).toBe(7);
  });

  it("returns integers in the inclusive range", () => {
    for (let index = 0; index < 64; index += 1) {
      const value = drawInt(
        { seed: `s-${index}`, contentVersion: "c", rootJourneyIndex: 0 },
        "label",
        -3,
        5,
      );
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it("throws when bounds are non-integer", () => {
    const context: DrawContext = {
      seed: "s",
      contentVersion: "c",
      rootJourneyIndex: 0,
    };
    expect(() => drawInt(context, "label", 0.5, 3)).toThrow();
    expect(() => drawInt(context, "label", 0, 3.5)).toThrow();
  });

  it("throws when max < min", () => {
    const context: DrawContext = {
      seed: "s",
      contentVersion: "c",
      rootJourneyIndex: 0,
    };
    expect(() => drawInt(context, "label", 3, 2)).toThrow();
  });
});

describe("weightedChoice", () => {
  const context: DrawContext = {
    seed: "weighted",
    contentVersion: "c",
    rootJourneyIndex: 0,
  };

  it("ignores zero-weight choices", () => {
    const chosen = weightedChoice(context, "label", [
      { item: "skip", weight: 0 },
      { item: "take", weight: 1 },
    ]);
    expect(chosen).toBe("take");
  });

  it("is deterministic for identical context and label", () => {
    const choices = [
      { item: "a", weight: 1 },
      { item: "b", weight: 1 },
      { item: "c", weight: 1 },
    ];
    const first = weightedChoice(context, "label", choices);
    const second = weightedChoice(context, "label", choices);
    expect(first).toBe(second);
  });

  it("throws when no choice has positive weight", () => {
    expect(() =>
      weightedChoice(context, "label", [
        { item: "x", weight: 0 },
        { item: "y", weight: 0 },
      ]),
    ).toThrow();
  });
});

describe("shuffleDeterministic", () => {
  const context: DrawContext = {
    seed: "shuffle",
    contentVersion: "c",
    rootJourneyIndex: 0,
  };
  const items = [1, 2, 3, 4, 5, 6, 7, 8];

  it("does not mutate the input array", () => {
    const original = [...items];
    shuffleDeterministic(context, "label", items);
    expect(items).toEqual(original);
  });

  it("preserves the multiset of items", () => {
    const shuffled = shuffleDeterministic(context, "label", items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
  });

  it("is deterministic across invocations", () => {
    const first = shuffleDeterministic(context, "label", items);
    const second = shuffleDeterministic(context, "label", items);
    expect(first).toEqual(second);
  });
});

describe("deterministicTieJitter", () => {
  const context: DrawContext = {
    seed: "jitter",
    contentVersion: "c",
    rootJourneyIndex: 0,
  };

  it("returns a value in [-magnitude, magnitude)", () => {
    for (let index = 0; index < 32; index += 1) {
      const value = deterministicTieJitter(
        { ...context, sequenceStep: index },
        "label",
        0.5,
      );
      expect(value).toBeGreaterThanOrEqual(-0.5);
      expect(value).toBeLessThan(0.5);
    }
  });

  it("returns zero for magnitude 0", () => {
    // The formula `(drawUnit * 2 - 1) * 0` can yield `-0` for draws below 0.5;
    // assert numeric magnitude rather than `Object.is(value, +0)` since the
    // sign of zero is irrelevant to every caller.
    expect(Math.abs(deterministicTieJitter(context, "label", 0))).toBe(0);
  });

  it("throws for negative magnitude", () => {
    expect(() => deterministicTieJitter(context, "label", -1)).toThrow();
  });
});
