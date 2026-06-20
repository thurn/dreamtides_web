import { describe, it, expect } from "vitest";

import { createDefaultState } from "./quest-context";
import { findQuestStateInvariantViolations } from "./quest-state-invariants";
import type { PoolDraftState } from "../types/draft";
import type { QuestState } from "../types/quest";

function makePoolDraftState(): PoolDraftState {
  return {
    mode: "pool",
    draftPoolCopiesByCard: { "1": 1, "2": 1 },
    remainingCopiesByCard: { "1": 1, "2": 1 },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

function withDraftState(draftState: QuestState["draftState"]): QuestState {
  return { ...createDefaultState(), draftState };
}

describe("findQuestStateInvariantViolations", () => {
  it("flags a draft state reverting to null mid-run", () => {
    const prev = withDraftState(makePoolDraftState());
    const next = withDraftState(null);
    const violations = findQuestStateInvariantViolations(prev, next);
    expect(violations.map((violation) => violation.invariant)).toContain(
      "draftState_must_not_revert_to_null",
    );
  });

  it("allows a draft state changing from one value to another", () => {
    const prev = withDraftState(makePoolDraftState());
    const spent = makePoolDraftState();
    spent.remainingCopiesByCard = { "2": 1 };
    const next = withDraftState(spent);
    expect(findQuestStateInvariantViolations(prev, next)).toEqual([]);
  });

  it("allows a draft state that was already null staying null", () => {
    const prev = withDraftState(null);
    const next = withDraftState(null);
    expect(findQuestStateInvariantViolations(prev, next)).toEqual([]);
  });

  it("does not flag run creation or teardown", () => {
    const populated = withDraftState(makePoolDraftState());
    expect(findQuestStateInvariantViolations(null, populated)).toEqual([]);
    expect(findQuestStateInvariantViolations(populated, null)).toEqual([]);
  });
});
