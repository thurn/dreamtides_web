/**
 * Prompt structure and answer helpers on synthetic prompts: arrangement
 * cardinality, well-formedness, and fingerprints over destination counts.
 */
import { describe, expect, it } from "vitest";
import type { InstanceId } from "../state/ids";
import { firstLegalAnswer, forcedAnswer, hasLegalAnswer, isLegalAnswer, randomLegalAnswer } from "./answers";
import { promptFingerprint } from "./fingerprint";
import { isWellFormedPrompt } from "./structure";
import type { ArrangePrompt, ArrangeSlot, Prompt, PromptPurpose } from "./types";

const autoAnswer = { autoAnswerForcedPrompts: true };
const noAutoAnswer = { autoAnswerForcedPrompts: false };
const purpose: PromptPurpose = { source: null, cardId: null, ability: null, role: "discard" };
const [a, b, c, d, e] = ["i1", "i2", "i3", "i4", "i5"] as InstanceId[];

function arrange(cards: readonly (InstanceId | undefined)[], destinations: readonly ArrangeSlot[]): ArrangePrompt {
  return {
    kind: "arrange",
    side: "player",
    purpose,
    cancellable: false,
    cards: cards.filter((card): card is InstanceId => card !== undefined),
    destinations,
  };
}

const topAndBottom = arrange([a, b], [
  { to: "top", min: 1, max: 1 },
  { to: "bottom", min: 1, max: 1 },
]);

/** A deterministic `[0, 1)` sequence. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("arrangement cardinality", () => {
  it("accepts only arrangements that give each destination its count", () => {
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "top" }, { card: b, to: "top" }])).toBe(false);
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "bottom" }, { card: b, to: "bottom" }])).toBe(false);
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "top" }, { card: b, to: "bottom" }])).toBe(true);
    expect(isLegalAnswer(topAndBottom, [{ card: b, to: "top" }, { card: a, to: "bottom" }])).toBe(true);
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "top" }])).toBe(false);
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "top" }, { card: a, to: "bottom" }])).toBe(false);
    expect(isLegalAnswer(topAndBottom, [{ card: a, to: "top" }, { card: b, to: "void" }])).toBe(false);
  });

  it("has a legal answer only when the counts can hold every card", () => {
    expect(hasLegalAnswer(topAndBottom)).toBe(true);
    expect(hasLegalAnswer(arrange([a], topAndBottom.destinations))).toBe(false);
    expect(hasLegalAnswer(arrange([a, b, c], topAndBottom.destinations))).toBe(false);
    expect(hasLegalAnswer(arrange([], []))).toBe(true);
  });

  it("draws random and first answers that respect every destination's count", () => {
    const prompts = [
      topAndBottom,
      arrange([a, b], [{ to: "top", min: 0, max: 2 }, { to: "void", min: 0, max: 2 }]),
      arrange([a, b, c, d, e], [
        { to: "top", min: 2, max: 2 },
        { to: "void", min: 0, max: 3 },
        { to: "bottom", min: 1, max: 1 },
      ]),
    ];
    for (const prompt of prompts) {
      expect(isLegalAnswer(prompt, firstLegalAnswer(prompt))).toBe(true);
      const random = sequence(7);
      for (let draw = 0; draw < 40; draw++) {
        expect(isLegalAnswer(prompt, randomLegalAnswer(prompt, random))).toBe(true);
      }
    }
  });

  it("auto-answers only a single card with one destination that can take it", () => {
    const onlyBottom = arrange([a], [{ to: "top", min: 0, max: 0 }, { to: "bottom", min: 0, max: 1 }]);
    const either = arrange([a], [{ to: "top", min: 0, max: 1 }, { to: "bottom", min: 0, max: 1 }]);
    const forced = forcedAnswer(onlyBottom, autoAnswer);
    expect(forced).toEqual([{ card: a, to: "bottom" }]);
    expect(isLegalAnswer(onlyBottom, forced ?? [])).toBe(true);
    expect(forcedAnswer(either, autoAnswer)).toBeUndefined();
    expect(forcedAnswer(topAndBottom, autoAnswer)).toBeUndefined();
  });

  it("never auto-answers when the config disables auto-answers", () => {
    const onlyBottom = arrange([a], [{ to: "top", min: 0, max: 0 }, { to: "bottom", min: 0, max: 1 }]);
    expect(forcedAnswer(onlyBottom, noAutoAnswer)).toBeUndefined();
  });

  it("fingerprints destination counts", () => {
    const loose = arrange([a, b], [{ to: "top", min: 0, max: 2 }, { to: "bottom", min: 0, max: 2 }]);
    expect(promptFingerprint(loose)).not.toBe(promptFingerprint(topAndBottom));
  });
});

describe("prompt structure", () => {
  const base = { side: "player", purpose, cancellable: false } as const;

  it("rejects duplicates, negative or fractional bounds, and min above max", () => {
    const malformed: Prompt[] = [
      { ...base, kind: "chooseCards", candidates: [a, a], min: 2, max: 2 },
      { ...base, kind: "chooseTargets", candidates: [a], min: -1, max: 1 },
      { ...base, kind: "chooseCards", candidates: [a, b], min: 2, max: 1 },
      { ...base, kind: "chooseNumber", min: 0, max: 1.5 },
      { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 0, legal: true }] },
      arrange([a, a], topAndBottom.destinations),
      arrange([a, b], [{ to: "top", min: 1, max: 1 }, { to: "top", min: 1, max: 1 }]),
      arrange([a], [{ to: "top", min: 1, max: 0 }]),
      { ...base, kind: "payOrDecline", energy: -1, payable: true },
    ];
    for (const prompt of malformed) {
      expect(isWellFormedPrompt(prompt)).toBe(false);
    }
  });

  it("accepts well-formed prompts of every kind", () => {
    const wellFormed: Prompt[] = [
      { ...base, kind: "chooseCards", candidates: [a, b], min: 0, max: 2 },
      { ...base, kind: "chooseTargets", candidates: [], min: 0, max: 0 },
      { ...base, kind: "chooseNumber", min: 0, max: 3 },
      { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] },
      topAndBottom,
      { ...base, kind: "confirm" },
      { ...base, kind: "payOrDecline", energy: 1, payable: false },
    ];
    for (const prompt of wellFormed) {
      expect(isWellFormedPrompt(prompt)).toBe(true);
    }
  });
});
