import { describe, expect, it } from "vitest";
import type { BattleMutableState } from "../types";
import type { DreamwellEffectStep, DreamwellPrompt, StepContext } from "./dreamwell-effects";
import {
  applyPromptResolution,
  planNextDreamwellStep,
} from "./dreamwell-runner-core";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

const SENTINEL_EDIT = { kind: "DRAW_CARD" as const, side: "player" as const };
const SENTINEL_EDIT_2 = { kind: "ADJUST_SCORE" as const, side: "player" as const, amount: 1 };

function makeCtx(): StepContext {
  return {
    side: "player",
    state: {} as BattleMutableState,
    random: () => 0,
    nowMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — empty queue terminates (bug: forgetting to
// handle the base case, looping forever or throwing)
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — empty queue", () => {
  it('returns { type: "done" } for an empty step array', () => {
    const result = planNextDreamwellStep([], makeCtx());
    expect(result).toEqual({ type: "done" });
  });
});

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — edits step (bug: dropping the tail or
// not calling the builder function at all)
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — edits head", () => {
  it("returns dispatch with edits === build(ctx) and rest === tail", () => {
    let builderCalled = false;
    const editsStep: DreamwellEffectStep = {
      kind: "edits",
      build: (ctx) => {
        builderCalled = true;
        void ctx;
        return [SENTINEL_EDIT];
      },
    };
    const tailStep: DreamwellEffectStep = {
      kind: "edits",
      build: () => [SENTINEL_EDIT_2],
    };
    const ctx = makeCtx();
    const result = planNextDreamwellStep([editsStep, tailStep], ctx);

    expect(result.type).toBe("dispatch");
    if (result.type !== "dispatch") throw new Error("wrong type");

    // Bug class: builder not called
    expect(builderCalled).toBe(true);

    // Bug class: edits is wrong
    expect(result.edits).toEqual([SENTINEL_EDIT]);

    // Bug class: tail dropped
    expect(result.rest).toHaveLength(1);
    expect(result.rest[0]).toBe(tailStep);
  });

  it("rest is empty when edits step is the only element", () => {
    const step: DreamwellEffectStep = { kind: "edits", build: () => [] };
    const result = planNextDreamwellStep([step], makeCtx());
    expect(result.type).toBe("dispatch");
    if (result.type !== "dispatch") throw new Error();
    expect(result.rest).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — pick-cards prompt (bug: forgetting to resolve
// candidates from live state — just storing the builder instead of the ids)
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — pick-cards prompt head", () => {
  it("resolves candidateIds eagerly from ctx, not just stores the builder", () => {
    const expectedCandidates = ["card-a", "card-b"];
    let candidatesFnCalled = false;

    const pickPrompt: DreamwellPrompt = {
      kind: "pick-cards",
      label: "Choose a card",
      count: 1,
      optional: false,
      candidates: (ctx) => {
        candidatesFnCalled = true;
        void ctx;
        return expectedCandidates;
      },
      resolve: (ids, _ctx) => ids.map(() => SENTINEL_EDIT),
    };

    const promptStep: DreamwellEffectStep = { kind: "prompt", prompt: pickPrompt };
    const tailStep: DreamwellEffectStep = { kind: "edits", build: () => [] };

    const result = planNextDreamwellStep([promptStep, tailStep], makeCtx());

    expect(result.type).toBe("prompt");
    if (result.type !== "prompt") throw new Error();

    // Bug class: candidates not resolved (builder stored instead of ids)
    expect(candidatesFnCalled).toBe(true);
    expect(result.active.kind).toBe("pick-cards");
    if (result.active.kind !== "pick-cards") throw new Error();
    expect(result.active.candidateIds).toEqual(expectedCandidates);

    // Bug class: count/optional not mirrored
    expect(result.active.count).toBe(1);
    expect(result.active.optional).toBe(false);

    // Bug class: label not mirrored
    expect(result.active.label).toBe("Choose a card");

    // Bug class: original prompt not carried through
    expect(result.prompt).toBe(pickPrompt);

    // Bug class: tail dropped
    expect(result.rest).toHaveLength(1);
    expect(result.rest[0]).toBe(tailStep);
  });

  it("optional=true is mirrored correctly", () => {
    const prompt: DreamwellPrompt = {
      kind: "pick-cards",
      label: "Optional pick",
      count: 2,
      optional: true,
      candidates: () => ["x", "y"],
      resolve: () => [],
    };
    const result = planNextDreamwellStep([{ kind: "prompt", prompt }], makeCtx());
    expect(result.type).toBe("prompt");
    if (result.type !== "prompt") throw new Error();
    if (result.active.kind !== "pick-cards") throw new Error();
    expect(result.active.optional).toBe(true);
    expect(result.active.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — choice prompt
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — choice prompt head", () => {
  it("maps options to label-only objects and carries prompt and rest", () => {
    const choicePrompt: DreamwellPrompt = {
      kind: "choice",
      label: "Pick one",
      options: [
        { label: "Draw a card", build: () => [SENTINEL_EDIT] },
        { label: "Gain energy", build: () => [SENTINEL_EDIT_2] },
      ],
    };
    const promptStep: DreamwellEffectStep = { kind: "prompt", prompt: choicePrompt };
    const result = planNextDreamwellStep([promptStep], makeCtx());

    expect(result.type).toBe("prompt");
    if (result.type !== "prompt") throw new Error();
    expect(result.active.kind).toBe("choice");
    if (result.active.kind !== "choice") throw new Error();
    expect(result.active.label).toBe("Pick one");
    expect(result.active.options).toEqual([{ label: "Draw a card" }, { label: "Gain energy" }]);
    expect(result.prompt).toBe(choicePrompt);
    expect(result.rest).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — confirm prompt presented as two-option choice
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — confirm prompt head", () => {
  it('presents confirm as a choice with "Yes" and "Skip" options', () => {
    const confirmPrompt: DreamwellPrompt = {
      kind: "confirm",
      label: "Abandon an ally?",
      onYes: [{ kind: "edits", build: () => [SENTINEL_EDIT] }],
    };
    const promptStep: DreamwellEffectStep = { kind: "prompt", prompt: confirmPrompt };
    const result = planNextDreamwellStep([promptStep], makeCtx());

    expect(result.type).toBe("prompt");
    if (result.type !== "prompt") throw new Error();
    expect(result.active.kind).toBe("choice");
    if (result.active.kind !== "choice") throw new Error();
    expect(result.active.label).toBe("Abandon an ally?");
    expect(result.active.options).toHaveLength(2);
    expect(result.active.options[0]?.label).toBe("Yes");
    expect(result.active.options[1]?.label).toBe("Skip");
    expect(result.prompt).toBe(confirmPrompt);
  });
});

// ---------------------------------------------------------------------------
// Tests: planNextDreamwellStep — foresee prompt
// ---------------------------------------------------------------------------

describe("planNextDreamwellStep — foresee prompt head", () => {
  it("returns a foresee active prompt with correct count", () => {
    const foreseePrompt: DreamwellPrompt = { kind: "foresee", count: 3 };
    const promptStep: DreamwellEffectStep = { kind: "prompt", prompt: foreseePrompt };
    const tailStep: DreamwellEffectStep = { kind: "edits", build: () => [] };

    const result = planNextDreamwellStep([promptStep, tailStep], makeCtx());

    expect(result.type).toBe("prompt");
    if (result.type !== "prompt") throw new Error();
    expect(result.active.kind).toBe("foresee");
    if (result.active.kind !== "foresee") throw new Error();
    expect(result.active.count).toBe(3);
    expect(result.prompt).toBe(foreseePrompt);
    expect(result.rest).toHaveLength(1);
    expect(result.rest[0]).toBe(tailStep);
  });
});

// ---------------------------------------------------------------------------
// Tests: applyPromptResolution — pick-cards (bug: wrong resolve arguments or
// not passing ctx through)
// ---------------------------------------------------------------------------

describe("applyPromptResolution — pick-cards", () => {
  it("edits === prompt.resolve(chosenIds, ctx) and rest is unchanged", () => {
    const chosenIds = ["card-x", "card-y"];
    const resolvedEdits = [SENTINEL_EDIT, SENTINEL_EDIT_2];
    let resolveCalled = false;
    let capturedIds: string[] | null = null;

    const prompt: DreamwellPrompt = {
      kind: "pick-cards",
      label: "Pick",
      count: 2,
      optional: false,
      candidates: () => [],
      resolve: (ids, _ctx) => {
        resolveCalled = true;
        capturedIds = ids;
        return resolvedEdits;
      },
    };

    const tailStep: DreamwellEffectStep = { kind: "edits", build: () => [] };
    const ctx = makeCtx();

    const { edits, rest } = applyPromptResolution(
      prompt,
      { kind: "pick-cards", chosenIds },
      [tailStep],
      ctx,
    );

    // Bug class: resolve not called
    expect(resolveCalled).toBe(true);
    // Bug class: wrong ids passed
    expect(capturedIds).toEqual(chosenIds);
    // Bug class: wrong edits returned
    expect(edits).toEqual(resolvedEdits);
    // Bug class: rest mutated or dropped
    expect(rest).toHaveLength(1);
    expect(rest[0]).toBe(tailStep);
  });
});

// ---------------------------------------------------------------------------
// Tests: applyPromptResolution — choice (bug: off-by-one option indexing)
// ---------------------------------------------------------------------------

describe("applyPromptResolution — choice", () => {
  it("edits === options[optionIndex].build(ctx) — index 0 picks first option", () => {
    const prompt: DreamwellPrompt = {
      kind: "choice",
      label: "Choose",
      options: [
        { label: "A", build: () => [SENTINEL_EDIT] },
        { label: "B", build: () => [SENTINEL_EDIT_2] },
      ],
    };
    const { edits, rest } = applyPromptResolution(
      prompt,
      { kind: "choice", optionIndex: 0 },
      [],
      makeCtx(),
    );
    // Bug class: returned option 1 instead of option 0
    expect(edits).toEqual([SENTINEL_EDIT]);
    expect(rest).toHaveLength(0);
  });

  it("edits === options[1].build(ctx) — index 1 picks second option", () => {
    const prompt: DreamwellPrompt = {
      kind: "choice",
      label: "Choose",
      options: [
        { label: "A", build: () => [SENTINEL_EDIT] },
        { label: "B", build: () => [SENTINEL_EDIT_2] },
      ],
    };
    const { edits } = applyPromptResolution(
      prompt,
      { kind: "choice", optionIndex: 1 },
      [],
      makeCtx(),
    );
    // Bug class: returned option 0 instead of option 1
    expect(edits).toEqual([SENTINEL_EDIT_2]);
  });
});

// ---------------------------------------------------------------------------
// Tests: applyPromptResolution — confirm (CRITICAL — confirm-yes prepend order)
// Bug classes: dropping onYes, dropping the queue tail, wrong prepend order
// ---------------------------------------------------------------------------

describe("applyPromptResolution — confirm (CRITICAL)", () => {
  const onYesStep: DreamwellEffectStep = { kind: "edits", build: () => [SENTINEL_EDIT] };
  const tailStep: DreamwellEffectStep = { kind: "edits", build: () => [SENTINEL_EDIT_2] };

  const confirmPrompt: DreamwellPrompt = {
    kind: "confirm",
    label: "Are you sure?",
    onYes: [onYesStep],
  };

  it('optionIndex=0 (Yes): rest === [...onYes, ...originalRest] in that order, edits === []', () => {
    const originalRest = [tailStep];
    const { edits, rest } = applyPromptResolution(
      confirmPrompt,
      { kind: "choice", optionIndex: 0 },
      originalRest,
      makeCtx(),
    );

    // Bug class: edits not empty for confirm
    expect(edits).toEqual([]);

    // Bug class: onYes dropped entirely
    expect(rest).toContain(onYesStep);

    // Bug class: tail dropped
    expect(rest).toContain(tailStep);

    // Bug class: wrong order — onYes must come BEFORE the tail
    expect(rest).toHaveLength(2);
    expect(rest[0]).toBe(onYesStep);
    expect(rest[1]).toBe(tailStep);
  });

  it('optionIndex=1 (Skip): rest === originalRest unchanged, edits === []', () => {
    const originalRest = [tailStep];
    const { edits, rest } = applyPromptResolution(
      confirmPrompt,
      { kind: "choice", optionIndex: 1 },
      originalRest,
      makeCtx(),
    );

    // Bug class: edits not empty for skip
    expect(edits).toEqual([]);

    // Bug class: original rest dropped or onYes incorrectly prepended
    expect(rest).toHaveLength(1);
    expect(rest[0]).toBe(tailStep);
  });

  it("multi-step onYes: all onYes steps appear before tail, in order", () => {
    const onYes1: DreamwellEffectStep = { kind: "edits", build: () => [] };
    const onYes2: DreamwellEffectStep = { kind: "edits", build: () => [] };
    const prompt: DreamwellPrompt = {
      kind: "confirm",
      label: "Multi-step",
      onYes: [onYes1, onYes2],
    };
    const tail1: DreamwellEffectStep = { kind: "edits", build: () => [] };
    const { rest } = applyPromptResolution(
      prompt,
      { kind: "choice", optionIndex: 0 },
      [tail1],
      makeCtx(),
    );
    // Bug class: order wrong (tail before onYes, or onYes reversed)
    expect(rest).toHaveLength(3);
    expect(rest[0]).toBe(onYes1);
    expect(rest[1]).toBe(onYes2);
    expect(rest[2]).toBe(tail1);
  });
});

// ---------------------------------------------------------------------------
// Tests: applyPromptResolution — foresee (bug: returning edits instead of
// delegating to the foresee overlay)
// ---------------------------------------------------------------------------

describe("applyPromptResolution — foresee", () => {
  it("returns no edits and rest unchanged (foresee overlay handles its own edits)", () => {
    const foreseePrompt: DreamwellPrompt = { kind: "foresee", count: 2 };
    const tailStep: DreamwellEffectStep = { kind: "edits", build: () => [SENTINEL_EDIT] };

    const { edits, rest } = applyPromptResolution(
      foreseePrompt,
      { kind: "foresee" },
      [tailStep],
      makeCtx(),
    );

    // Bug class: emitting edits from the runner instead of the overlay
    expect(edits).toEqual([]);

    // Bug class: rest dropped
    expect(rest).toHaveLength(1);
    expect(rest[0]).toBe(tailStep);
  });
});
