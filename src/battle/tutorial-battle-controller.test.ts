import { describe, expect, it } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "./test-support";
import { planTutorialBattleController } from "./tutorial-battle-controller";
import type { FoldState } from "../rules/fold-state";
import type { BattleCardInstance, BattleInit, BattleMutableState } from "./types";

const DRIVER = "client-driver";
const OBSERVER = "client-observer";

function stateFor(
  boardOverrides: Partial<BattleMutableState> = {},
  extras: {
    driverClientId?: string;
    pendingPrompt?: unknown;
    aiDefenseTurn?: unknown;
  } = {},
): FoldState {
  const board = boardFor(boardOverrides);
  return {
    frontDoor: { phase: "tutorial", journeyId: "journey-uuid", tutorial: null },
    quest: {} as FoldState["quest"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: "tutorial-run-uuid",
        driverClientId: extras.driverClientId ?? DRIVER,
        restartNumber: 0,
        resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
      },
      init: {
        scoreToWin: 10,
        turnLimit: Number.MAX_SAFE_INTEGER,
        maxEnergyCap: 10,
        dreamwellDeck: [],
      } as unknown as BattleInit,
      board,
      effectQueue: [],
      pendingPrompt: (extras.pendingPrompt ?? null) as never,
      dawnFired: { player: null, enemy: null },
      ...(extras.aiDefenseTurn === undefined ? {} : { aiDefenseTurn: extras.aiDefenseTurn as never }),
    },
  };
}

function boardFor(overrides: Partial<BattleMutableState>): BattleMutableState {
  const enemyCardId = "enemy-card-uuid";
  return {
    battleId: "tutorial-battle-run-uuid",
    activeSide: "player",
    turnNumber: 4,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
    sides: {
      player: side(),
      enemy: side(),
    },
    cardInstances: {
      [enemyCardId]: card(enemyCardId, "enemy"),
    },
    ...overrides,
  };
}

function side(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 5,
    maxEnergy: 5,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function card(battleCardId: string, controller: "player" | "enemy"): BattleCardInstance {
  return {
    battleCardId,
    owner: controller,
    controller,
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
      grantedUnstoppable: false,
      grantedVengeful: false,
      grantedPreeminence: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: { kind: "quest-deck", sourceBattleCardId: null, chosenSpark: null, chosenSubtype: null, createdAtTurnNumber: 1, createdAtSide: controller, createdAtMs: 0 },
    definition: {
      sourceDeckEntryId: null,
      cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
      cardNumber: 512,
      name: "display-only",
      battleCardKind: "character" as const,
      subtype: "warrior",
      energyCost: 4,
      printedEnergyCost: 4,
      printedSpark: 4,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 512,
      transfiguration: null,
      isBane: false,
    },
  };
}

function plan(state: FoldState, clientId = DRIVER, connectedClientIds: readonly string[] | null = [DRIVER, OBSERVER]) {
  return planTutorialBattleController({ state, clientId, connectedClientIds });
}

describe("tutorial battle controller", () => {
  it("assigns automatic work exclusively to the persisted, present driver", () => {
    const state = stateFor({ phase: "dawn" });
    expect(plan(state).intent?.kind).toBe("battle-command");
    expect(plan(state, OBSERVER)).toMatchObject({ status: "observer", intent: null });
  });

  it("pauses while the driver is disconnected and resumes on reconnect", () => {
    const state = stateFor({ phase: "dawn" });
    expect(plan(state, OBSERVER, [OBSERVER])).toMatchObject({ status: "paused-driver-absent", intent: null });
    expect(plan(state, DRIVER, [DRIVER, OBSERVER]).intent?.kind).toBe("battle-command");
  });

  it("makes reload and StrictMode re-evaluation idempotent through the same key", () => {
    const state = stateFor({ phase: "dawn" });
    const first = plan(state).intent;
    const second = plan(JSON.parse(JSON.stringify(state)) as FoldState).intent;
    expect(first).toEqual(second);
    expect(first?.intentKey).toBe("tutorial-battle:tutorial-battle-run-uuid:player:4:dawn:dawn:triggers");
  });

  it("treats the claimant of a rebuilt tutorial snapshot as the new driver", () => {
    const state = stateFor({ phase: "dawn" }, { driverClientId: OBSERVER });
    expect(plan(state, DRIVER)).toMatchObject({ status: "observer", intent: null });
    expect(plan(state, OBSERVER).status).toBe("driver");
  });

  it("stops at player Day and advances player Dusk through enemy defense", () => {
    expect(plan(stateFor()).requiresHumanDecision).toBe(true);
    expect(plan(stateFor({ phase: "dusk" })).intent).toMatchObject({ kind: "battle-ai-defend" });
    expect(plan(stateFor({ phase: "dusk" }, {
      aiDefenseTurn: { activeSide: "player", turnNumber: 4 },
    })).intent).toMatchObject({
      kind: "battle-command",
      command: { edit: { kind: "SET_BATTLE_FLOW", activeSide: "enemy", phase: "dreamwell", turnNumber: 4 } },
    });
  });

  it("pauses for player blocking on an enemy attack and advances empty enemy Dusk", () => {
    const attackingEnemy = side();
    attackingEnemy.frontRank.F0 = "enemy-card-uuid";
    expect(plan(stateFor({ activeSide: "enemy", phase: "dusk", sides: { player: side(), enemy: attackingEnemy } }))).toMatchObject({
      requiresHumanDecision: true,
      intent: null,
    });
    expect(plan(stateFor({ activeSide: "enemy", phase: "dusk" })).intent).toMatchObject({
      kind: "battle-command",
      command: { edit: { kind: "SET_BATTLE_FLOW", activeSide: "player", phase: "dreamwell", turnNumber: 5 } },
    });
  });

  it("uses semantic BATTLE_PLAY_CARD planning for an enemy Day", () => {
    const enemyCardId = "enemy-card-uuid";
    const enemy = side();
    enemy.hand = [enemyCardId];
    const state = stateFor({ activeSide: "enemy", phase: "day", sides: { player: side(), enemy } });
    const result = plan(state);
    expect(result.intent).toMatchObject({
      kind: "battle-play-card",
      battleCardId: enemyCardId,
    });
    expect(result.intent?.intentKey).toContain("enemy-play");
  });

  it("resolves enemy prompts deterministically but leaves player prompts interactive", () => {
    const enemyPrompt = {
      promptId: 41,
      run: { scriptRef: { table: "battle", id: "card-uuid" }, cursor: [0], side: "enemy" },
      kind: "pick-cards",
      options: { kind: "pick-cards", label: "Discover", candidateIds: ["b-uuid", "a-uuid"], count: 1, optional: false, highlightCardIds: [] },
    };
    expect(plan(stateFor({}, { pendingPrompt: enemyPrompt })).intent).toMatchObject({
      kind: "resolve-prompt",
      promptId: 41,
      resolution: { kind: "pick-cards", chosenIds: ["a-uuid"] },
    });
    expect(plan(stateFor({}, { pendingPrompt: { ...enemyPrompt, run: { ...enemyPrompt.run, side: "player" } } }))).toMatchObject({
      requiresHumanDecision: true,
      intent: null,
    });
  });

  it("keeps deterministic choice and Foresee resolutions legal", () => {
    const base = {
      promptId: 44,
      run: { scriptRef: { table: "battle", id: "card-uuid" }, cursor: [0], side: "enemy" },
    };
    const choicePlan = plan(stateFor({}, { pendingPrompt: {
      ...base,
      kind: "choice",
      options: { kind: "choice", label: "Choose", options: [{ label: "first" }, { label: "second" }] },
    } }));
    expect(choicePlan.intent).toMatchObject({ resolution: { kind: "choice", optionIndex: 0 } });
    const foreseePlan = plan(stateFor({}, { pendingPrompt: {
      ...base,
      kind: "foresee",
      options: { kind: "foresee", count: 2, cardIds: ["deck-b-uuid", "deck-a-uuid"] },
    } }));
    expect(foreseePlan.intent).toMatchObject({
      resolution: { kind: "foresee", orderedCardIds: ["deck-b-uuid", "deck-a-uuid"], voidCardIds: [] },
    });
  });

  it("never emits a post-terminal intent", () => {
    expect(plan(stateFor({ result: "victory" }))).toMatchObject({ status: "terminal", intent: null });
  });

  it("keeps terminal authority with the present driver and exposes a departed driver", () => {
    const terminal = stateFor({ result: "victory" });
    expect(plan(terminal, DRIVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "terminal", isCurrentClientDriver: true, isDriverPresent: true,
    });
    expect(plan(terminal, OBSERVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "terminal", isCurrentClientDriver: false, isDriverPresent: true,
    });
    expect(plan(terminal, OBSERVER, [OBSERVER])).toMatchObject({
      status: "terminal", isCurrentClientDriver: false, isDriverPresent: false,
    });
  });
});
