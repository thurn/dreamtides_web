/**
 * Prompt structure and answer helpers on synthetic prompts: arrangement
 * cardinality, answer validation, well-formedness, the fields each
 * fingerprint identifies, answer enumeration, and narrowing to feasible
 * answers.
 */
import { describe, expect, it } from "vitest";
import type { InstanceId } from "../state/ids";
import { canonicalAnswer, firstLegalAnswer, forcedAnswer, hasLegalAnswer, isLegalAnswer, legalAnswers, randomLegalAnswer } from "./answers";
import { promptFingerprint } from "./fingerprint";
import { narrowPrompt } from "./narrow";
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

describe("answer validation", () => {
  const base = { side: "player", purpose, cancellable: false } as const;

  it("rejects a repeated selection, an illegal mode, a number out of bounds, and paying an unpayable cost", () => {
    const upToTwo: Prompt = { ...base, kind: "chooseTargets", candidates: [a, b, c], min: 1, max: 2 };
    expect(isLegalAnswer(upToTwo, [a, b])).toBe(true);
    expect(isLegalAnswer(upToTwo, [a, a])).toBe(false);
    const modes: Prompt = { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] };
    expect(isLegalAnswer(modes, 0)).toBe(true);
    expect(isLegalAnswer(modes, 1)).toBe(false);
    const number: Prompt = { ...base, kind: "chooseNumber", min: 1, max: 3 };
    expect(isLegalAnswer(number, 3)).toBe(true);
    expect(isLegalAnswer(number, 4)).toBe(false);
    expect(isLegalAnswer(number, 0)).toBe(false);
    const unpayable: Prompt = { ...base, kind: "payOrDecline", energy: 2, payable: false };
    expect(isLegalAnswer(unpayable, false)).toBe(true);
    expect(isLegalAnswer(unpayable, true)).toBe(false);
  });

  it("fingerprints each identifying field: side, privacy, bounds, options, and payability", () => {
    const pairs: [Prompt, Prompt][] = [
      [
        { ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1 },
        { ...base, side: "enemy", kind: "chooseCards", candidates: [a, b], min: 1, max: 1 },
      ],
      [
        { ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1 },
        { ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1, privateTo: "player" },
      ],
      [
        { ...base, kind: "chooseTargets", candidates: [a, b], min: 1, max: 1 },
        { ...base, kind: "chooseTargets", candidates: [a, b], min: 0, max: 1 },
      ],
      [
        { ...base, kind: "chooseTargets", candidates: [a, b], min: 1, max: 1 },
        { ...base, kind: "chooseTargets", candidates: [a, b], min: 1, max: 2 },
      ],
      [
        { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] },
        { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] },
      ],
      [
        { ...base, kind: "chooseNumber", min: 0, max: 2 },
        { ...base, kind: "chooseNumber", min: 0, max: 3 },
      ],
      [
        { ...base, kind: "payOrDecline", energy: 2, payable: false },
        { ...base, kind: "payOrDecline", energy: 2, payable: true },
      ],
    ];
    for (const [left, right] of pairs) {
      expect(promptFingerprint(left)).not.toBe(promptFingerprint(right));
    }
    // Candidate order is not identifying.
    expect(promptFingerprint({ ...base, kind: "chooseCards", candidates: [b, a], min: 1, max: 1 })).toBe(
      promptFingerprint({ ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1 }),
    );
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

describe("answer enumeration and narrowing", () => {
  const base = { side: "player", purpose, cancellable: false } as const;
  const prompts: Prompt[] = [
    { ...base, kind: "chooseCards", candidates: [a, b, c, d], min: 1, max: 2 },
    { ...base, kind: "chooseTargets", candidates: [a, b], min: 0, max: 2 },
    { ...base, kind: "chooseMode", options: [{ mode: 0, legal: false }, { mode: 1, legal: true }, { mode: 2, legal: true }] },
    { ...base, kind: "chooseNumber", min: 1, max: 4 },
    { ...base, kind: "confirm" },
    { ...base, kind: "payOrDecline", energy: 1, payable: true },
    { ...base, kind: "payOrDecline", energy: 1, payable: false },
    arrange([a, b, c], [{ to: "top", min: 1, max: 2 }, { to: "void", min: 0, max: 3 }]),
  ];
  const counts = [4 + 6, 1 + 2 + 1, 2, 4, 2, 2, 1, 6 * 2];

  it("lists every legal answer once, the first legal answer first", () => {
    prompts.forEach((prompt, index) => {
      const answers = [...legalAnswers(prompt)];
      expect(answers).toHaveLength(counts[index]);
      expect(new Set(answers.map((answer) => canonicalAnswer(prompt, answer))).size).toBe(answers.length);
      expect(answers.every((answer) => isLegalAnswer(prompt, answer))).toBe(true);
      expect(answers[0]).toEqual(firstLegalAnswer(prompt));
    });
  });

  it("leaves a prompt unchanged when every answer is feasible", () => {
    for (const prompt of prompts) expect(narrowPrompt(prompt, [...legalAnswers(prompt)])).toBe(prompt);
  });

  it("narrows candidates, bounds, and modes where they state the feasible answers exactly", () => {
    const cards: Prompt = { ...base, kind: "chooseCards", candidates: [a, b, c], min: 1, max: 1 };
    expect(narrowPrompt(cards, [[a], [c]])).toEqual({ ...cards, candidates: [a, c] });
    const number: Prompt = { ...base, kind: "chooseNumber", min: 0, max: 3 };
    expect(narrowPrompt(number, [0, 1])).toEqual({ ...number, max: 1 });
    const modes: Prompt = { ...base, kind: "chooseMode", options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] };
    expect(narrowPrompt(modes, [1])).toEqual({ ...modes, options: [{ mode: 0, legal: false }, { mode: 1, legal: true }] });
    expect(hasLegalAnswer(narrowPrompt(number, []))).toBe(false);
  });

  it("lists the allowed answers otherwise, and every answer helper keeps to them", () => {
    const pairs: Prompt = { ...base, kind: "chooseCards", candidates: [a, b, c], min: 2, max: 2 };
    const narrowed = narrowPrompt(pairs, [[a, c], [b, c]]);
    expect(narrowed).toEqual({ ...pairs, allowed: [[a, c], [b, c]] });
    expect(isWellFormedPrompt(narrowed)).toBe(true);
    expect(isLegalAnswer(narrowed, [c, b])).toBe(true);
    expect(isLegalAnswer(narrowed, [a, b])).toBe(false);
    expect([...legalAnswers(narrowed)]).toEqual([[a, c], [b, c]]);
    expect(forcedAnswer(narrowed, autoAnswer)).toBeUndefined();
    const random = sequence(3);
    for (let draw = 0; draw < 20; draw++) expect(isLegalAnswer(narrowed, randomLegalAnswer(narrowed, random))).toBe(true);
    expect(promptFingerprint(narrowed)).not.toBe(promptFingerprint(pairs));

    const confirm = narrowPrompt({ ...base, kind: "confirm" }, [false]);
    expect(confirm).toEqual({ ...base, kind: "confirm", allowed: [false] });
    expect(forcedAnswer(confirm, autoAnswer)).toBe(false);
    expect(forcedAnswer(confirm, noAutoAnswer)).toBeUndefined();
    expect(isLegalAnswer(confirm, true)).toBe(false);

    const gap = narrowPrompt({ ...base, kind: "chooseNumber", min: 0, max: 3 }, [0, 2]);
    expect(gap).toEqual({ ...base, kind: "chooseNumber", min: 0, max: 2, allowed: [0, 2] });
    expect(isLegalAnswer(gap, 1)).toBe(false);
  });

  it("rejects allowed answers that repeat or that the prompt's fields do not allow", () => {
    expect(isWellFormedPrompt({ ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1, allowed: [[a], [a]] })).toBe(false);
    expect(isWellFormedPrompt({ ...base, kind: "chooseCards", candidates: [a, b], min: 1, max: 1, allowed: [[c]] })).toBe(false);
    expect(isWellFormedPrompt({ ...base, kind: "chooseNumber", min: 0, max: 1, allowed: [2] })).toBe(false);
  });
});
