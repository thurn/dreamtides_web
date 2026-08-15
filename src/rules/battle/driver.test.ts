import { describe, expect, it } from "vitest";
import { testCardName } from "../../types/test-identities";
import type { EventContext } from "../../eventlog/types";
import type {
  BattleEngineEmissionContext,
  BattleMutableState,
  BattleSide,
} from "../../battle/types";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import { applyDebugEdit } from "./apply-debug-edit";
import type { ActivePrompt, PromptResolution } from "./effect-runner-core";
import { isoTimestampToMs } from "./timestamp";
import type { EffectStep } from "./effect-step";
import { DREAMWELL_EFFECTS } from "./dreamwell-effects-table";
import type { BattleFoldState, EffectRun, ScriptRef } from "./fold";
import { emptyDawnFired, newEffectRun, resolveScript } from "./fold";
import { advanceEffectQueue, resolvePendingPrompt } from "./driver";
import type { BattleCardId } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import { parseTutorialRunId } from "../../types/identifiers";
import { parseBattleEffectScriptId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

// ---------------------------------------------------------------------------
// Deterministic context + hashing
// ---------------------------------------------------------------------------

// A deterministic keyed rng standing in for the reducer's (seed, seq)-keyed
// stream. Pure function of drawIndex, so oracle and driver draw identically.
function makeRng(seq: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    const x = Math.sin((seq + 1) * 999 + drawIndex * 7.13) * 10000;
    return x - Math.floor(x);
  };
}

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 1,
    rng: makeRng(overrides.seq ?? 1),
    intervening: [],
    timestamp: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const EMISSION: BattleEngineEmissionContext = {
  sourceSurface: "auto-system",
  selectedCardId: null,
};

// Canonical hash of a fold state: JSON is byte-stable because every board is
// built through the same clone path, so equal edits in equal order stringify
// identically. Doubles as the closure-smuggling detector — a function in state
// would vanish from the string.
function hashState(state: BattleFoldState): string {
  return JSON.stringify(state);
}

function hashBoard(board: BattleMutableState): string {
  return JSON.stringify(board);
}

// ---------------------------------------------------------------------------
// Oracle: apply a sequence of edit-only step-lists directly, threading ONE
// draw counter across all of them exactly as the driver does. Independent of
// the driver's cursor-walking, so agreement proves the queue mechanics.
// ---------------------------------------------------------------------------

function applyEditsOracle(
  board: BattleMutableState,
  runs: EffectStep[][],
  side: BattleSide,
  context: EventContext,
): BattleMutableState {
  let b = board;
  let drawIndex = 0;
  const random = (): number => context.rng(drawIndex++);
  const nowMs = isoTimestampToMs(context.timestamp) ?? 0;
  for (const steps of runs) {
    for (const step of steps) {
      if (step.kind !== "edits")
        throw new Error("oracle: only edit-only scripts");
      for (const edit of step.build({ side, state: b, random, nowMs })) {
        b = applyDebugEdit(b, edit, EMISSION).state;
      }
    }
  }
  return b;
}

// ---------------------------------------------------------------------------
// Script discovery — resolve ids from the live tables at setup, by STRUCTURE
// (never by card name), so the tests survive card-data edits.
// ---------------------------------------------------------------------------

function editOnlyDreamwellRef(): ScriptRef {
  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    if (
      script.steps.length > 0 &&
      script.steps.every((s) => s.kind === "edits")
    ) {
      return { table: "dreamwell", id: parseBattleEffectScriptId(id) };
    }
  }
  throw new Error("no edit-only dreamwell script registered");
}

function twoEditOnlyDreamwellRefs(): [ScriptRef, ScriptRef] {
  const refs: ScriptRef[] = [];
  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    if (
      script.steps.length > 0 &&
      script.steps.every((s) => s.kind === "edits")
    ) {
      refs.push({ table: "dreamwell", id: parseBattleEffectScriptId(id) });
    }
    if (refs.length === 2) return [refs[0], refs[1]];
  }
  throw new Error("fewer than two edit-only dreamwell scripts registered");
}

// A script whose FIRST step is a top-level pick-cards prompt drawing candidates
// from a zone we can populate.
function topLevelPickCardsDreamwellRef(): ScriptRef {
  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    const first = script.steps[0];
    if (first?.kind === "prompt" && first.prompt.kind === "pick-cards") {
      return { table: "dreamwell", id: parseBattleEffectScriptId(id) };
    }
  }
  throw new Error("no top-level pick-cards dreamwell script registered");
}

// A script with a leading edit step THEN a top-level pick-cards prompt (proves
// pre-prompt edits apply before parking).
function leadingEditThenPromptDreamwellRef(): ScriptRef {
  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    const [first, second] = script.steps;
    if (first?.kind === "edits" && second?.kind === "prompt") {
      return { table: "dreamwell", id: parseBattleEffectScriptId(id) };
    }
  }
  throw new Error("no leading-edit-then-prompt dreamwell script registered");
}

// A confirm whose onYes branch itself contains a prompt step — the nested-prompt
// shape that a top-level stepIndex cursor could not address.
function nestedPromptDreamwellRef(): ScriptRef {
  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    const first = script.steps[0];
    if (
      first?.kind === "prompt" &&
      first.prompt.kind === "confirm" &&
      first.prompt.onYes.some((s) => s.kind === "prompt")
    ) {
      return { table: "dreamwell", id: parseBattleEffectScriptId(id) };
    }
  }
  throw new Error("no nested-prompt dreamwell script registered");
}

// ---------------------------------------------------------------------------
// Board fixture
// ---------------------------------------------------------------------------

function makeSide(
  overrides: Partial<{
    hand: BattleCardId[];
    void: BattleCardId[];
    deck: BattleCardId[];
  }> = {},
): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: overrides.deck ?? [],
    hand: overrides.hand ?? [],
    void: overrides.void ?? [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function makeInstance(
  battleCardId: BattleCardId,
  side: BattleSide,
  kind: "character" | "event",
): BattleMutableState["cardInstances"][BattleCardId] {
  return {
    battleCardId,
    owner: side,
    controller: side,
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedVengeful: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: 1,
      createdAtSide: side,
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardId: testCardId("fixture-card"),
      cardNumber: 1,
      name: testCardName(`${kind}-${battleCardId}`),
      battleCardKind: kind,
      subtype: "Warrior",
      energyCost: 1,
      printedEnergyCost: 1,
      printedSpark: 2,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 1,
      transfiguration: null,
      isBane: false,
    },
  };
}

// A board richly populated so pick-cards prompts always find candidates in
// hand / void / deck regardless of which script structure discovery selects.
function makeBoard(): BattleMutableState {
  const cardInstances: BattleMutableState["cardInstances"] = {};
  const handIds: BattleCardId[] = [];
  const voidIds: BattleCardId[] = [];
  const deckIds: BattleCardId[] = [];
  for (let i = 0; i < 4; i += 1) {
    const h = parseBattleCardId(`h${i}`);
    const v = parseBattleCardId(`v${i}`);
    const d = parseBattleCardId(`d${i}`);
    handIds.push(h);
    voidIds.push(v);
    deckIds.push(d);
    cardInstances[h] = makeInstance(
      h,
      "player",
      i % 2 === 0 ? "character" : "event",
    );
    cardInstances[v] = makeInstance(
      v,
      "player",
      i % 2 === 0 ? "character" : "event",
    );
    cardInstances[d] = makeInstance(
      d,
      "player",
      i % 2 === 0 ? "character" : "event",
    );
  }
  return {
    battleId: parseBattleId("test-battle"),
    activeSide: "player",
    turnNumber: 1,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: {
      player: makeSide({ hand: handIds, void: voidIds, deck: deckIds }),
      enemy: makeSide(),
    },
    cardInstances,
  };
}

// A minimal deterministic BattleInit. The driver never reads init fields — it
// only carries the value across advance/resolve — so a small pure-JSON fake is
// enough to prove preservation; it is cast because the full shape is irrelevant
// here (init construction is BEGIN_BATTLE's concern, tested in battle-events).
const TEST_INIT = {
  battleId: parseBattleId("test-battle"),
  siteId: parseSiteId("site-1"),
  dreamscapeId: null,
  scoreToWin: 30,
  turnLimit: 12,
  dreamwellDeck: [],
} as unknown as BattleFoldState["init"];

function foldState(runs: EffectRun[], board = makeBoard()): BattleFoldState {
  return {
    init: TEST_INIT,
    board,
    effectQueue: runs,
    pendingPrompt: null,
    dawnFired: emptyDawnFired(),
  };
}

// Drive an interactive script to completion, auto-answering every prompt the
// simplest legal way. Data-resilient: reads only the materialized options.
function autoResolve(options: ActivePrompt): PromptResolution {
  switch (options.kind) {
    case "pick-cards":
      return {
        kind: "pick-cards",
        chosenIds: options.candidateIds.slice(0, options.count),
      };
    case "choice":
      return { kind: "choice", optionIndex: 0 };
    case "foresee":
      return { kind: "foresee" };
  }
}

function driveToCompletion(
  state: BattleFoldState,
  seqStart: number,
): BattleFoldState {
  let current = state;
  let seq = seqStart;
  let guard = 0;
  while (current.pendingPrompt !== null) {
    if (guard++ > 20)
      throw new Error("driveToCompletion: prompt loop did not terminate");
    const resolution = autoResolve(current.pendingPrompt.options);
    current = resolvePendingPrompt(current, resolution, ctx({ seq }));
    seq += 1;
  }
  return current;
}

// ---------------------------------------------------------------------------
// queue stall — an edit-only run fully applies in one advance
// ---------------------------------------------------------------------------

describe("advanceEffectQueue — edit-only run", () => {
  it("applies all edits and drains the queue in one advance (no stall)", () => {
    const ref = editOnlyDreamwellRef();
    const run = newEffectRun(ref, "player");
    const context = ctx({ seq: 3 });

    const result = advanceEffectQueue(foldState([run]), context);

    expect(result.pendingPrompt).toBeNull();
    expect(result.effectQueue).toEqual([]);

    const expectedBoard = applyEditsOracle(
      makeBoard(),
      [resolveScript(ref)],
      "player",
      context,
    );
    expect(hashBoard(result.board)).toBe(hashBoard(expectedBoard));
  });

  it("does not mutate the input fold state", () => {
    const ref = editOnlyDreamwellRef();
    const input = foldState([newEffectRun(ref, "player")]);
    const before = hashState(input);
    advanceEffectQueue(input, ctx({ seq: 3 }));
    expect(hashState(input)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Nomad's Verge — end-to-end proof that the driver's `isTutorial` derivation
// (not just the builder in isolation) actually centers the tutorial figment.
// ---------------------------------------------------------------------------

describe("advanceEffectQueue — Nomad's Verge dreamwell placement", () => {
  const NOMADS_VERGE_REF: ScriptRef = {
    table: "dreamwell",
    id: parseBattleEffectScriptId("51caf26d-83bf-45a9-bc80-010d353277db"),
  };

  it("places the figment at the leftmost open back-rank slot in a journey battle", () => {
    const result = advanceEffectQueue(
      foldState([newEffectRun(NOMADS_VERGE_REF, "enemy")]),
      ctx({ seq: 1 }),
    );
    expect(result.board.sides.enemy.backRank.B0).not.toBeNull();
    expect(result.board.sides.enemy.backRank.B4).toBeNull();
  });

  it("places the figment at the center back-rank slot in a tutorial battle", () => {
    const tutorialFold: BattleFoldState = {
      ...foldState([newEffectRun(NOMADS_VERGE_REF, "enemy")]),
      mode: {
        kind: "tutorial",
        tutorialRunId: parseTutorialRunId("test-run"),
        restartNumber: 0,
        resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
      },
    };
    const result = advanceEffectQueue(tutorialFold, ctx({ seq: 1 }));
    expect(result.board.sides.enemy.backRank.B4).not.toBeNull();
    expect(result.board.sides.enemy.backRank.B0).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// prompt parking — interactive run stops with pendingPrompt set
// ---------------------------------------------------------------------------

describe("advanceEffectQueue — prompt parking", () => {
  it("drains 9954cede-8a16-4053-b6e9-da745f4540f5 when no enemy is in play", () => {
    const ref: ScriptRef = {
      table: "dreamwell",
      id: parseBattleEffectScriptId("9954cede-8a16-4053-b6e9-da745f4540f5"),
    };
    const result = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      ctx({ seq: 9 }),
    );

    expect(result.pendingPrompt).toBeNull();
    expect(result.effectQueue).toEqual([]);
  });

  it("parks on a top-level prompt, retaining the run, promptId = ctx.seq", () => {
    const ref = topLevelPickCardsDreamwellRef();
    const context = ctx({ seq: 9 });

    const result = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      context,
    );

    expect(result.pendingPrompt).not.toBeNull();
    const pending = result.pendingPrompt!;
    expect(pending.promptId).toBe(9);
    expect(pending.kind).toBe("pick-cards");
    expect(pending.options.kind).toBe("pick-cards");
    // Options are materialized plain data (candidate ids resolved).
    if (pending.options.kind === "pick-cards") {
      expect(pending.options.candidateIds.length).toBeGreaterThan(0);
    }
    // The paused run is retained at the head of the queue.
    expect(result.effectQueue.length).toBe(1);
    expect(result.effectQueue[0].scriptRef).toEqual(ref);
  });

  it("applies leading edits before parking on the prompt", () => {
    const ref = leadingEditThenPromptDreamwellRef();
    const steps = resolveScript(ref);
    const context = ctx({ seq: 5 });

    const result = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      context,
    );

    expect(result.pendingPrompt).not.toBeNull();
    // Board reflects the leading edit step only (not the prompt's resolution).
    const leadingOnly = applyEditsOracle(
      makeBoard(),
      [[steps[0]]],
      "player",
      context,
    );
    expect(hashBoard(result.board)).toBe(hashBoard(leadingOnly));
  });
});

// ---------------------------------------------------------------------------
// resume correctness — resolvePendingPrompt applies resolution then continues
// ---------------------------------------------------------------------------

describe("resolvePendingPrompt — resume", () => {
  it("applies the resolution edits and drains the queue", () => {
    const ref = topLevelPickCardsDreamwellRef();
    const parked = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      ctx({ seq: 9 }),
    );
    expect(parked.pendingPrompt).not.toBeNull();
    const parkedHash = hashBoard(parked.board);

    const resolution = autoResolve(parked.pendingPrompt!.options);
    const resumed = resolvePendingPrompt(parked, resolution, ctx({ seq: 10 }));

    expect(resumed.pendingPrompt).toBeNull();
    expect(resumed.effectQueue).toEqual([]);
    // A pick-cards resolution moves a card, so the board must have changed.
    expect(hashBoard(resumed.board)).not.toBe(parkedHash);
  });

  it("returns the input unchanged when no prompt is pending (defensive)", () => {
    const state = foldState([]);
    const before = hashState(state);
    const result = resolvePendingPrompt(
      state,
      { kind: "foresee" },
      ctx({ seq: 2 }),
    );
    expect(hashState(result)).toBe(before);
  });

  it("preserves the immutable init across advance and resolve", () => {
    const ref = topLevelPickCardsDreamwellRef();
    const parked = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      ctx({ seq: 9 }),
    );
    // advanceEffectQueue carries init through unchanged.
    expect(parked.init).toBe(TEST_INIT);

    const resumed = resolvePendingPrompt(
      parked,
      autoResolve(parked.pendingPrompt!.options),
      ctx({ seq: 10 }),
    );
    // resolvePendingPrompt (which threads through runQueue) preserves it too.
    expect(resumed.init).toBe(TEST_INIT);

    // An edit-only advance that drains without parking also preserves it.
    const drained = advanceEffectQueue(
      foldState([newEffectRun(editOnlyDreamwellRef(), "player")]),
      ctx({ seq: 3 }),
    );
    expect(drained.init).toBe(TEST_INIT);
  });
});

// ---------------------------------------------------------------------------
// cursor serialization — nested prompt survives JSON round-trip
// ---------------------------------------------------------------------------

describe("cursor serialization (closure-smuggling guard)", () => {
  it("a nested-prompt run parked mid-flight resumes identically after encode/decode", () => {
    const ref = nestedPromptDreamwellRef();
    const parked = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      ctx({ seq: 1 }),
    );
    expect(parked.pendingPrompt).not.toBeNull();
    // Parked on the top-level confirm.
    expect(parked.pendingPrompt!.kind).toBe("confirm");

    const roundTripped = JSON.parse(JSON.stringify(parked)) as BattleFoldState;
    // Round-trip preserves the cursor bytes exactly.
    expect(roundTripped.pendingPrompt!.run.cursor).toEqual(
      parked.pendingPrompt!.run.cursor,
    );

    const finalDirect = driveToCompletion(parked, 100);
    const finalRoundTripped = driveToCompletion(roundTripped, 100);

    expect(finalDirect.pendingPrompt).toBeNull();
    expect(finalRoundTripped.pendingPrompt).toBeNull();
    expect(hashState(finalRoundTripped)).toBe(hashState(finalDirect));
  });

  it("descends into a confirm.onYes branch — cursor grows a level", () => {
    const ref = nestedPromptDreamwellRef();
    const parked = advanceEffectQueue(
      foldState([newEffectRun(ref, "player")]),
      ctx({ seq: 1 }),
    );
    expect(parked.pendingPrompt!.run.cursor).toEqual([0]);

    // Confirm "Yes" (option 0) should descend into onYes, exposing the inner prompt.
    const afterYes = resolvePendingPrompt(
      parked,
      { kind: "choice", optionIndex: 0 },
      ctx({ seq: 2 }),
    );
    expect(afterYes.pendingPrompt).not.toBeNull();
    // Inner prompt cursor addresses a step inside the branch (depth 2).
    expect(afterYes.pendingPrompt!.run.cursor.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// multi-run FIFO — two queued runs execute in order
// ---------------------------------------------------------------------------

describe("advanceEffectQueue — multi-run FIFO", () => {
  it("executes two queued edit-only runs in queue order", () => {
    const [refA, refB] = twoEditOnlyDreamwellRefs();
    const context = ctx({ seq: 7 });

    const result = advanceEffectQueue(
      foldState([newEffectRun(refA, "player"), newEffectRun(refB, "player")]),
      context,
    );

    expect(result.pendingPrompt).toBeNull();
    expect(result.effectQueue).toEqual([]);

    const expected = applyEditsOracle(
      makeBoard(),
      [resolveScript(refA), resolveScript(refB)],
      "player",
      context,
    );
    expect(hashBoard(result.board)).toBe(hashBoard(expected));
  });
});
