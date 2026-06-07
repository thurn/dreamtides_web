import { describe, expect, it } from "vitest";

import { actionToCommands } from "./driver";
import { buildTrace } from "./trace";
import type { PlannedAction } from "./planner";
import type { AiCard } from "./forward-model";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import type { BattleAiChoiceTrace, BattleSide } from "../types";

// --- Fixtures -------------------------------------------------------------

function aiCard(overrides: Partial<AiCard> = {}): AiCard {
  return {
    battleCardId: "ai-card-1",
    cardNumber: 510,
    name: "Nocturne Strummer",
    energyCost: 2,
    basePrintedSpark: 2,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: false,
    ...overrides,
  };
}

function baseTrace(overrides: Partial<BattleAiChoiceTrace> = {}): BattleAiChoiceTrace {
  return {
    stage: "character",
    choice: "PLAY_CARD",
    battleCardId: "ai-card-1",
    cardName: "Nocturne Strummer",
    sourceHandIndex: 0,
    sourceSlotId: null,
    targetSlotId: null,
    heuristicScoreBefore: 1,
    heuristicScoreAfter: 2,
    ...overrides,
  };
}

/** Narrows a command to its DEBUG_EDIT edit, asserting the envelope shape. */
function editOf(command: BattleCommand, actor: BattleSide = "enemy"): BattleDebugEdit {
  expect(command.id).toBe("DEBUG_EDIT");
  expect(command.actor).toBe(actor);
  expect(command.sourceSurface).toBe("auto-system");
  if (command.id !== "DEBUG_EDIT") {
    throw new Error("expected DEBUG_EDIT");
  }
  return command.edit;
}

// --- PLAY_CARD character ---------------------------------------------------

describe("actionToCommands — character play", () => {
  it("emits a reserve placement and pays the energy cost", () => {
    const self = aiCard({ battleCardId: "minstrel-1", cardNumber: 510, energyCost: 2 });
    const action: PlannedAction = {
      stage: "character",
      kind: "PLAY_CARD",
      self,
      targets: null,
      toSlot: "B2",
      trace: baseTrace({ battleCardId: "minstrel-1", targetSlotId: "B2" }),
    };

    const commands = actionToCommands(action, "enemy");
    expect(commands).toHaveLength(2);

    const move = editOf(commands[0]);
    expect(move.kind).toBe("MOVE_CARD_TO_ZONE");
    if (move.kind !== "MOVE_CARD_TO_ZONE") throw new Error("expected move");
    expect(move.battleCardId).toBe("minstrel-1");
    expect(move.destination).toEqual({ side: "enemy", zone: "reserve", slotId: "B2" });

    const energy = editOf(commands[1]);
    expect(energy.kind).toBe("ADJUST_CURRENT_ENERGY");
    if (energy.kind !== "ADJUST_CURRENT_ENERGY") throw new Error("expected energy");
    expect(energy.side).toBe("enemy");
    expect(energy.amount).toBe(-2);
  });
});

// --- MOVE_CARD -------------------------------------------------------------

describe("actionToCommands — reposition", () => {
  it("moves the card by id into the deployed toSlot", () => {
    const self = aiCard({ battleCardId: "colossus-1", cardNumber: 515 });
    const action: PlannedAction = {
      stage: "reposition",
      kind: "MOVE_CARD",
      self,
      targets: null,
      toSlot: "F1",
      trace: baseTrace({
        stage: "reposition",
        choice: "MOVE_CARD",
        battleCardId: "colossus-1",
        sourceSlotId: "B0",
        targetSlotId: "F1",
      }),
    };

    const commands = actionToCommands(action, "enemy");
    expect(commands).toHaveLength(1);

    const move = editOf(commands[0]);
    expect(move.kind).toBe("MOVE_CARD_TO_ZONE");
    if (move.kind !== "MOVE_CARD_TO_ZONE") throw new Error("expected move");
    expect(move.battleCardId).toBe("colossus-1");
    expect(move.destination).toEqual({ side: "enemy", zone: "deployed", slotId: "F1" });
  });
});

// --- PLAY_CARD event: Flashpoint Detonation ------------------------------------

describe("actionToCommands — Flashpoint Detonation", () => {
  it("pays energy, dissolves the enemy target to the opponent void, and voids itself", () => {
    const self = aiCard({
      battleCardId: "flash-1",
      cardNumber: 516,
      name: "Flashpoint Detonation",
      energyCost: 3,
    });
    const action: PlannedAction = {
      stage: "nonCharacter",
      kind: "PLAY_CARD",
      self,
      targets: { targetBattleCardId: "enemy-body-9" },
      toSlot: undefined,
      trace: baseTrace({
        stage: "nonCharacter",
        battleCardId: "flash-1",
        cardName: "Flashpoint Detonation",
      }),
    };

    const commands = actionToCommands(action, "enemy");
    const edits = commands.map((c) => editOf(c));

    // Energy paid.
    const energy = edits.find((e) => e.kind === "ADJUST_CURRENT_ENERGY");
    expect(energy).toBeDefined();
    if (energy?.kind === "ADJUST_CURRENT_ENERGY") {
      expect(energy.side).toBe("enemy");
      expect(energy.amount).toBe(-3);
    }

    // Dissolve: target moved to the OPPONENT (player) void.
    const dissolve = edits.find(
      (e) => e.kind === "MOVE_CARD_TO_ZONE" && e.battleCardId === "enemy-body-9",
    );
    expect(dissolve).toBeDefined();
    if (dissolve?.kind === "MOVE_CARD_TO_ZONE") {
      expect(dissolve.destination).toEqual({ side: "player", zone: "void" });
    }

    // Self goes to the AI's own void.
    const selfVoid = edits.find(
      (e) => e.kind === "MOVE_CARD_TO_ZONE" && e.battleCardId === "flash-1",
    );
    expect(selfVoid).toBeDefined();
    if (selfVoid?.kind === "MOVE_CARD_TO_ZONE") {
      expect(selfVoid.destination).toEqual({ side: "enemy", zone: "void" });
    }
  });
});

// --- END_TURN --------------------------------------------------------------

describe("actionToCommands — END_TURN", () => {
  it("returns an empty array (the hook composes challenge + handoff)", () => {
    const action: PlannedAction = {
      stage: "endTurn",
      kind: "END_TURN",
      targets: null,
      trace: baseTrace({
        stage: "endTurn",
        choice: "END_TURN",
        battleCardId: null,
        cardName: null,
        sourceHandIndex: null,
      }),
    };

    expect(actionToCommands(action, "enemy")).toEqual([]);
  });
});

// --- Envelope correctness across kinds ------------------------------------

describe("actionToCommands — envelope", () => {
  it("threads the aiSide through energy/void edits when the AI is the player side", () => {
    const self = aiCard({ battleCardId: "minstrel-2", cardNumber: 510, energyCost: 2 });
    const action: PlannedAction = {
      stage: "character",
      kind: "PLAY_CARD",
      self,
      targets: null,
      toSlot: "B0",
      trace: baseTrace({ battleCardId: "minstrel-2", targetSlotId: "B0" }),
    };

    const side: BattleSide = "player";
    const commands = actionToCommands(action, side);
    for (const command of commands) {
      expect(command.id).toBe("DEBUG_EDIT");
      // The DEBUG_EDIT envelope's `actor` is the AI's side, so a player-side AI
      // authors edits as `actor: "player"`.
      expect(command.actor).toBe("player");
      expect(command.sourceSurface).toBe("auto-system");
    }
    const move = editOf(commands[0], side);
    if (move.kind !== "MOVE_CARD_TO_ZONE") throw new Error("expected move");
    expect(move.destination).toEqual({ side: "player", zone: "reserve", slotId: "B0" });
    const energy = editOf(commands[1], side);
    if (energy.kind !== "ADJUST_CURRENT_ENERGY") throw new Error("expected energy");
    expect(energy.side).toBe("player");
  });
});

// --- buildTrace ------------------------------------------------------------

describe("buildTrace", () => {
  it("enriches the planner trace with a rationale and targetBattleCardId", () => {
    const self = aiCard({
      battleCardId: "flash-1",
      cardNumber: 516,
      name: "Flashpoint Detonation",
    });
    const action: PlannedAction = {
      stage: "nonCharacter",
      kind: "PLAY_CARD",
      self,
      targets: { targetBattleCardId: "enemy-body-9" },
      trace: baseTrace({
        stage: "nonCharacter",
        battleCardId: "flash-1",
        cardName: "Flashpoint Detonation",
        heuristicScoreBefore: 4,
        heuristicScoreAfter: 7,
      }),
    };

    const trace = buildTrace(action);

    // Existing planner fields preserved.
    expect(trace.stage).toBe("nonCharacter");
    expect(trace.choice).toBe("PLAY_CARD");
    expect(trace.battleCardId).toBe("flash-1");
    expect(trace.cardName).toBe("Flashpoint Detonation");
    expect(trace.heuristicScoreBefore).toBe(4);
    expect(trace.heuristicScoreAfter).toBe(7);

    // Enriched fields.
    expect(typeof trace.rationale).toBe("string");
    expect((trace.rationale ?? "").length).toBeGreaterThan(0);
    expect(trace.rationale).toContain("Flashpoint Detonation");
    expect(trace.targetBattleCardId).toBe("enemy-body-9");

    // Does not mutate the planner trace.
    expect(action.trace.rationale).toBeUndefined();
    expect(action.trace).not.toBe(trace);
  });

  it("describes a character play and a reposition", () => {
    const playTrace = buildTrace({
      stage: "character",
      kind: "PLAY_CARD",
      self: aiCard({ battleCardId: "minstrel-1", cardNumber: 510, name: "Nocturne Strummer" }),
      targets: null,
      toSlot: "B2",
      trace: baseTrace({ battleCardId: "minstrel-1", cardName: "Nocturne Strummer" }),
    });
    expect(playTrace.rationale).toContain("Nocturne Strummer");
    expect(playTrace.targetBattleCardId).toBeNull();

    const moveTrace = buildTrace({
      stage: "reposition",
      kind: "MOVE_CARD",
      self: aiCard({ battleCardId: "colossus-1", cardNumber: 515, name: "Wildflower Colossus" }),
      targets: null,
      toSlot: "F1",
      trace: baseTrace({
        stage: "reposition",
        choice: "MOVE_CARD",
        battleCardId: "colossus-1",
        cardName: "Wildflower Colossus",
        targetSlotId: "F1",
      }),
    });
    expect(moveTrace.rationale).toContain("Wildflower Colossus");
  });

  it("describes ending the turn", () => {
    const trace = buildTrace({
      stage: "endTurn",
      kind: "END_TURN",
      targets: null,
      trace: baseTrace({
        stage: "endTurn",
        choice: "END_TURN",
        battleCardId: null,
        cardName: null,
        sourceHandIndex: null,
      }),
    });
    expect(trace.rationale?.toLowerCase()).toContain("end turn");
    expect(trace.targetBattleCardId).toBeNull();
  });
});
