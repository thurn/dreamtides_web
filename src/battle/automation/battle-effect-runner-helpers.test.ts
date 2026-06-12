import { describe, expect, it } from "vitest";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import type { EffectPrompt, EffectStep, StepContext } from "./effect-step";
import { applyPromptResolution, planNextEffectStep } from "./effect-runner-core";
import {
  collectNewlyMaterializedRuns,
  inPlayInstanceIds,
  materializedScriptEdits,
} from "./use-battle-effect-runner";

// ---------------------------------------------------------------------------
// Registered materialized UUID (from BATTLE_CARD_EFFECTS).
// ---------------------------------------------------------------------------

/** Ashwalker — ▸Materialized: Erode 3. */
const ASHWALKER = "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40";
/** Driftcaller Sovereign — ▸Dawn (not materialized). */
const DRIFTCALLER_SOVEREIGN = "9b9c2743-75b3-499d-b5fb-c3429c92d420";
/** A card with no registered script. */
const UNREGISTERED = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Fixtures — only the fields these helpers read.
// ---------------------------------------------------------------------------

interface InstanceSpec {
  battleCardId: string;
  cardId: string;
  controller?: BattleSide;
  name?: string;
}

interface SideSpec {
  back?: Partial<Record<BackRankSlotId, InstanceSpec>>;
  front?: Partial<Record<FrontRankSlotId, InstanceSpec>>;
}

function makeInstance(spec: InstanceSpec): BattleCardInstance {
  return {
    battleCardId: spec.battleCardId,
    controller: spec.controller ?? "player",
    definition: { cardId: spec.cardId, name: spec.name ?? spec.cardId },
  } as unknown as BattleCardInstance;
}

function emptyBackRank(): Record<BackRankSlotId, string | null> {
  return Object.fromEntries(BACK_RANK_SLOT_IDS.map((s) => [s, null])) as Record<
    BackRankSlotId,
    string | null
  >;
}

function emptyFrontRank(): Record<FrontRankSlotId, string | null> {
  return Object.fromEntries(FRONT_RANK_SLOT_IDS.map((s) => [s, null])) as Record<
    FrontRankSlotId,
    string | null
  >;
}

function makeState(sides: Partial<Record<BattleSide, SideSpec>>): BattleMutableState {
  const cardInstances: Record<string, BattleCardInstance> = {};
  const sideStates: Record<
    BattleSide,
    { backRank: Record<BackRankSlotId, string | null>; frontRank: Record<FrontRankSlotId, string | null> }
  > = {
    player: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
    enemy: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
  };

  for (const side of ["player", "enemy"] as BattleSide[]) {
    const spec = sides[side];
    if (spec === undefined) continue;
    for (const [slot, inst] of Object.entries(spec.back ?? {})) {
      if (inst === undefined) continue;
      sideStates[side].backRank[slot as BackRankSlotId] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance({ controller: side, ...inst });
    }
    for (const [slot, inst] of Object.entries(spec.front ?? {})) {
      if (inst === undefined) continue;
      sideStates[side].frontRank[slot as FrontRankSlotId] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance({ controller: side, ...inst });
    }
  }

  return { sides: sideStates, cardInstances } as unknown as BattleMutableState;
}

describe("materializedScriptEdits", () => {
  it("returns the ▸Materialized edits for a registered materialized card", () => {
    const instance = makeInstance({
      battleCardId: "ash",
      cardId: ASHWALKER,
      controller: "enemy",
    });
    const state = makeState({});

    // Ashwalker — ▸Materialized: Erode 3, for the controller's side.
    expect(materializedScriptEdits(instance, state, 0)).toEqual([
      { kind: "ERODE", side: "enemy", count: 3 },
    ]);
  });

  it("returns [] for a card whose trigger is not materialized", () => {
    const instance = makeInstance({ battleCardId: "drift", cardId: DRIFTCALLER_SOVEREIGN });
    expect(materializedScriptEdits(instance, makeState({}), 0)).toEqual([]);
  });

  it("returns [] for an unregistered card", () => {
    const instance = makeInstance({ battleCardId: "plain", cardId: UNREGISTERED });
    expect(materializedScriptEdits(instance, makeState({}), 0)).toEqual([]);
  });
});

describe("inPlayInstanceIds", () => {
  it("collects all non-null front/back occupants of both sides", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "pb1", cardId: UNREGISTERED } },
        front: { F0: { battleCardId: "pf0", cardId: UNREGISTERED } },
      },
      enemy: {
        front: { F2: { battleCardId: "ef2", cardId: UNREGISTERED } },
      },
    });

    expect(new Set(inPlayInstanceIds(state))).toEqual(new Set(["pb1", "pf0", "ef2"]));
  });

  it("returns [] for an empty board", () => {
    expect(inPlayInstanceIds(makeState({}))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// collectNewlyMaterializedRuns — the board-diff that feeds the pending queue.
// ---------------------------------------------------------------------------

describe("collectNewlyMaterializedRuns", () => {
  it("enqueues a run only for a newly-appeared materialized card", () => {
    const state = makeState({
      player: {
        // Already-seen card with a materialized script — must NOT re-fire.
        front: { F0: { battleCardId: "old-ash", cardId: ASHWALKER } },
        // Newly-appeared card with a materialized script — must fire.
        back: { B0: { battleCardId: "new-ash", cardId: ASHWALKER, controller: "player" } },
      },
    });
    const previous = new Set(["old-ash"]);

    const runs = collectNewlyMaterializedRuns(["old-ash", "new-ash"], previous, state);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.battleCardId).toBe("new-ash");
    expect(runs[0]?.cardId).toBe(ASHWALKER);
    expect(runs[0]?.side).toBe("player");
    // A fresh copy of the script's steps is carried.
    expect(runs[0]?.steps.length).toBeGreaterThan(0);
  });

  it("skips newly-appeared cards with no materialized script (Dawn / unregistered)", () => {
    const state = makeState({
      player: {
        front: {
          F0: { battleCardId: "drift", cardId: DRIFTCALLER_SOVEREIGN },
          F1: { battleCardId: "plain", cardId: UNREGISTERED },
        },
      },
    });
    const runs = collectNewlyMaterializedRuns(["drift", "plain"], new Set(), state);
    expect(runs).toEqual([]);
  });

  it("returns multiple runs in inPlayIds order when several materialize at once", () => {
    const state = makeState({
      player: {
        front: { F0: { battleCardId: "ash-a", cardId: ASHWALKER } },
        back: { B0: { battleCardId: "ash-b", cardId: ASHWALKER } },
      },
    });
    const runs = collectNewlyMaterializedRuns(["ash-a", "ash-b"], new Set(), state);
    expect(runs.map((r) => r.battleCardId)).toEqual(["ash-a", "ash-b"]);
  });
});

// ---------------------------------------------------------------------------
// Materialized step-queue walk — proving the shared engine pauses on a prompt
// step from a materialized trigger and never advances past it, and that
// post-prompt steps survive resolution. These mirror the runner's internal walk
// using planNextEffectStep / applyPromptResolution directly (the React hook +
// overlay precedence are validated separately in browser QA).
// ---------------------------------------------------------------------------

const SENTINEL_EDIT = { kind: "DRAW_CARD" as const, side: "player" as const };
const SENTINEL_EDIT_2 = { kind: "ADJUST_SCORE" as const, side: "player" as const, amount: 1 };

function makeStepCtx(): StepContext {
  return { side: "player", state: {} as BattleMutableState, random: () => 0, nowMs: 0 };
}

describe("materialized step-queue walk", () => {
  it("pauses on a foresee prompt step and does not advance past the unresolved prompt", () => {
    // A materialized script: [edits, foresee(2)]. Walking it should dispatch the
    // edits first, then surface the foresee prompt with rest === [] (the prompt
    // is consumed from the head but its resolution is awaited).
    const foreseePrompt: EffectPrompt = { kind: "foresee", count: 2 };
    const steps: EffectStep[] = [
      { kind: "edits", build: () => [SENTINEL_EDIT] },
      { kind: "prompt", prompt: foreseePrompt },
    ];
    const ctx = makeStepCtx();

    const first = planNextEffectStep(steps, ctx);
    expect(first.type).toBe("dispatch");
    if (first.type !== "dispatch") throw new Error("expected dispatch");
    expect(first.edits).toEqual([SENTINEL_EDIT]);

    const second = planNextEffectStep(first.rest, ctx);
    // Bug class: a prompt step from a materialized trigger silently dropped, or
    // the queue advancing past an unresolved prompt.
    expect(second.type).toBe("prompt");
    if (second.type !== "prompt") throw new Error("expected prompt");
    expect(second.active).toEqual({ kind: "foresee", count: 2 });
    // The rest excludes the prompt — nothing queued after it — proving the walk
    // stopped AT the prompt rather than running past it.
    expect(second.rest).toEqual([]);
  });

  it("preserves post-prompt edits across a pick-cards resolution", () => {
    // Materialized script: [edits, prompt(pick-cards), edits]. The trailing edits
    // must survive the prompt resolution (bug class: post-prompt steps lost).
    const postPromptStep: EffectStep = { kind: "edits", build: () => [SENTINEL_EDIT_2] };
    const pickPrompt: EffectPrompt = {
      kind: "pick-cards",
      label: "Pick",
      count: 1,
      optional: false,
      candidates: () => ["chosen"],
      resolve: (ids) => ids.map(() => SENTINEL_EDIT),
    };
    const steps: EffectStep[] = [
      { kind: "edits", build: () => [SENTINEL_EDIT] },
      { kind: "prompt", prompt: pickPrompt },
      postPromptStep,
    ];
    const ctx = makeStepCtx();

    // 1. First step dispatches the leading edits and returns the rest.
    const first = planNextEffectStep(steps, ctx);
    expect(first.type).toBe("dispatch");
    if (first.type !== "dispatch") throw new Error("expected dispatch");
    expect(first.edits).toEqual([SENTINEL_EDIT]);

    // 2. Next step yields the pick-cards prompt; its rest still holds the trailing edits.
    const second = planNextEffectStep(first.rest, ctx);
    expect(second.type).toBe("prompt");
    if (second.type !== "prompt") throw new Error("expected prompt");
    expect(second.rest).toEqual([postPromptStep]);

    // 3. Resolving the prompt returns the resolved edits + the still-queued trailing edits.
    const resolved = applyPromptResolution(
      second.prompt,
      { kind: "pick-cards", chosenIds: ["chosen"] },
      second.rest,
      ctx,
    );
    expect(resolved.edits).toEqual([SENTINEL_EDIT]);
    // Bug class: post-prompt steps lost.
    expect(resolved.rest).toEqual([postPromptStep]);

    // 4. Walking the surviving queue dispatches the trailing edits, then completes.
    const third = planNextEffectStep(resolved.rest, ctx);
    expect(third.type).toBe("dispatch");
    if (third.type !== "dispatch") throw new Error("expected dispatch");
    expect(third.edits).toEqual([SENTINEL_EDIT_2]);
    expect(planNextEffectStep(third.rest, ctx)).toEqual({ type: "done" });
  });
});
