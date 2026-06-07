import { describe, expect, it } from "vitest";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import type {
  BattleCardInstance,
  BattleCardKind,
  BattleMutableState,
  BattleSide,
  BattleSideMutableState,
  FrontRankSlotId,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import {
  planBasicAutomationCommands,
  resolveChallenge,
} from "./basic-automation";

const CAPS = { maxEnergyCap: 10, scoreToWin: 25 };

function makeInstance(
  battleCardId: string,
  options: {
    owner: BattleSide;
    kind?: BattleCardKind;
    energyCost?: number;
    printedSpark?: number;
    sparkDelta?: number;
    renderedText?: string;
    subtype?: string;
    isFigment?: boolean;
    figmentCount?: number;
  },
): BattleCardInstance {
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardNumber: 1,
      name: battleCardId,
      battleCardKind: options.kind ?? "character",
      subtype: options.subtype ?? "Warrior",
      energyCost: options.energyCost ?? 0,
      printedEnergyCost: options.energyCost ?? 0,
      printedSpark: options.printedSpark ?? 0,
      isFast: false,
      reclaimCost: null,
      renderedText: options.renderedText ?? "",
      imageNumber: 1,
      transfiguration: null,
      isBane: false,
    },
    owner: options.owner,
    controller: options.owner,
    figmentCount: options.isFigment ? options.figmentCount ?? 1 : undefined,
    sparkDelta: options.sparkDelta ?? 0,
    isRevealedToPlayer: true,
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: options.isFigment ? "generated-figment" : "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

function emptySide(overrides: Partial<BattleSideMutableState> = {}): BattleSideMutableState {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: Object.fromEntries(BACK_RANK_SLOT_IDS.map((slot) => [slot, null])) as BattleSideMutableState["backRank"],
    frontRank: Object.fromEntries(FRONT_RANK_SLOT_IDS.map((slot) => [slot, null])) as BattleSideMutableState["frontRank"],
    ...overrides,
  };
}

function makeState(options: {
  activeSide?: BattleSide;
  turnNumber?: number;
  player?: Partial<BattleSideMutableState>;
  enemy?: Partial<BattleSideMutableState>;
  instances?: BattleCardInstance[];
}): BattleMutableState {
  return {
    battleId: "battle-test",
    activeSide: options.activeSide ?? "player",
    turnNumber: options.turnNumber ?? 1,
    phase: "day",
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 100,
    sides: {
      player: emptySide(options.player),
      enemy: emptySide(options.enemy),
    },
    cardInstances: Object.fromEntries(
      (options.instances ?? []).map((instance) => [instance.battleCardId, instance]),
    ),
  };
}

function edits(commands: BattleCommand[]): BattleDebugEdit[] {
  return commands.flatMap((command) => (command.id === "DEBUG_EDIT" ? [command.edit] : []));
}

function frontRankSlots(slot: FrontRankSlotId, battleCardId: string | null): Record<FrontRankSlotId, string | null> {
  return {
    ...Object.fromEntries(FRONT_RANK_SLOT_IDS.map((id) => [id, null])),
    [slot]: battleCardId,
  } as Record<FrontRankSlotId, string | null>;
}

describe("planBasicAutomationCommands — playing cards", () => {
  it("spends energy equal to the cost when a character is played to a slot", () => {
    const state = makeState({
      player: {
        currentEnergy: 5,
        hand: ["c1"],
      },
      instances: [makeInstance("c1", { owner: "player", kind: "character", energyCost: 3 })],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "c1",
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      sourceSurface: "hand-tray",
    };

    const result = planBasicAutomationCommands(state, play, CAPS);

    expect(edits(result)).toEqual([
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "c1",
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -3 },
    ]);
  });

  it("routes a played event to the void and still spends its energy", () => {
    const state = makeState({
      player: { currentEnergy: 5, hand: ["e1"] },
      instances: [makeInstance("e1", { owner: "player", kind: "event", energyCost: 2 })],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "e1",
        destination: { side: "player", zone: "frontRank", slotId: "F0" },
      },
      sourceSurface: "hand-tray",
    };

    expect(edits(planBasicAutomationCommands(state, play, CAPS))).toEqual([
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "e1",
        destination: { side: "player", zone: "void" },
      },
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -2 },
    ]);
  });

  it("clamps energy spend so current energy never goes negative", () => {
    const state = makeState({
      player: { currentEnergy: 1, hand: ["c1"] },
      instances: [makeInstance("c1", { owner: "player", energyCost: 4 })],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "c1",
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      sourceSurface: "hand-tray",
    };

    const energyEdit = edits(planBasicAutomationCommands(state, play, CAPS)).find(
      (edit) => edit.kind === "ADJUST_CURRENT_ENERGY",
    );
    expect(energyEdit).toEqual({ kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -1 });
  });

  it("does not treat hand→void/deck moves as a play", () => {
    const state = makeState({
      player: { currentEnergy: 5, hand: ["c1"] },
      instances: [makeInstance("c1", { owner: "player", energyCost: 3 })],
    });
    const discardToVoid: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "c1",
        destination: { side: "player", zone: "void" },
      },
      sourceSurface: "hand-tray",
    };

    expect(planBasicAutomationCommands(state, discardToVoid, CAPS)).toEqual([discardToVoid]);
  });

  it("does not spend energy when moving a card already on the battlefield", () => {
    const state = makeState({
      player: { currentEnergy: 5, backRank: { B0: "c1", B1: null, B2: null, B3: null, B4: null } },
      instances: [makeInstance("c1", { owner: "player", energyCost: 3 })],
    });
    const reposition: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: "c1",
        destination: { side: "player", zone: "frontRank", slotId: "F0" },
      },
      sourceSurface: "battlefield",
    };

    expect(planBasicAutomationCommands(state, reposition, CAPS)).toEqual([reposition]);
  });
});

describe("resolveChallenge — spark comparison", () => {
  it("scores an unpaired challenger's spark for the active side", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });

    const resolution = resolveChallenge(state, "player");
    expect(resolution.playerScoreDelta).toBe(4);
    expect(resolution.edits).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 4 });
  });

  it("dissolves the lower-spark character in a defended lane", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", { owner: "player", printedSpark: 5 }),
        makeInstance("e0", { owner: "enemy", printedSpark: 3 }),
      ],
    });

    const resolution = resolveChallenge(state, "player");
    expect(resolution.playerScoreDelta).toBe(0);
    expect(resolution.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "e0",
      destination: { side: "enemy", zone: "void" },
    });
    expect(resolution.edits).not.toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p0",
      destination: { side: "player", zone: "void" },
    });
  });

  it("dissolves both characters on a spark tie", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", { owner: "player", printedSpark: 4 }),
        makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
      ],
    });

    const dissolves = resolveChallenge(state, "player").edits.filter(
      (edit) => edit.kind === "MOVE_CARD_TO_ZONE",
    );
    expect(dissolves).toHaveLength(2);
  });
});

describe("resolveChallenge — keyword awareness", () => {
  it("lets a Preeminence character win a spark tie", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", { owner: "player", printedSpark: 4, renderedText: "Preeminence" }),
        makeInstance("e0", { owner: "enemy", printedSpark: 4 }),
      ],
    });

    const resolution = resolveChallenge(state, "player");
    expect(resolution.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "e0",
      destination: { side: "enemy", zone: "void" },
    });
    expect(resolution.edits).not.toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p0",
      destination: { side: "player", zone: "void" },
    });
  });

  it("dissolves the winner too when the loser is Vengeful", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", { owner: "player", printedSpark: 5 }),
        makeInstance("e0", { owner: "enemy", printedSpark: 2, renderedText: "Vengeful" }),
      ],
    });

    const dissolves = resolveChallenge(state, "player").edits.filter(
      (edit) => edit.kind === "MOVE_CARD_TO_ZONE",
    );
    expect(dissolves).toHaveLength(2);
  });

  it("scores a defended Unstoppable challenger that survives", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", { owner: "player", printedSpark: 6, renderedText: "Unstoppable" }),
        makeInstance("e0", { owner: "enemy", printedSpark: 3 }),
      ],
    });

    const resolution = resolveChallenge(state, "player");
    expect(resolution.playerScoreDelta).toBe(6);
    expect(resolution.edits).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 6 });
  });

  it("recognizes the Celestial figment's implicit Preeminence keyword", () => {
    const state = makeState({
      activeSide: "player",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { frontRank: frontRankSlots("F0", "e0") },
      instances: [
        makeInstance("p0", {
          owner: "player",
          printedSpark: 2,
          subtype: "Celestial",
          isFigment: true,
        }),
        makeInstance("e0", { owner: "enemy", printedSpark: 2 }),
      ],
    });

    const resolution = resolveChallenge(state, "player");
    expect(resolution.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "e0",
      destination: { side: "enemy", zone: "void" },
    });
    expect(resolution.edits).not.toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p0",
      destination: { side: "player", zone: "void" },
    });
  });
});

describe("planBasicAutomationCommands — turn handoff", () => {
  it("resolves the challenge, ramps energy, and draws for the incoming side", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { deck: ["d-enemy"] },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // Challenge scoring for the outgoing player.
    expect(result).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 4 });
    // The user's own flow edit is preserved.
    expect(result).toContainEqual({ kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 3 });
    // Incoming-side energy ramp to min(turn + 1, cap) = 4.
    expect(result).toContainEqual({ kind: "SET_MAX_ENERGY", side: "enemy", value: 4 });
    expect(result).toContainEqual({ kind: "SET_CURRENT_ENERGY", side: "enemy", value: 4 });
    // Incoming-side draw (turn > 1).
    expect(result).toContainEqual({ kind: "DRAW_CARD", side: "enemy" });
  });

  it("skips the draw on the very first turn of the battle", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 1,
      enemy: { deck: ["d-enemy"] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 1 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
  });

  it("discards the outgoing side down to the hand limit", () => {
    const overfullHand = Array.from({ length: 12 }, (_, index) => `h${String(index)}`);
    const state = makeState({
      activeSide: "player",
      turnNumber: 2,
      player: { hand: overfullHand },
      enemy: { deck: ["d-enemy"] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 2 },
      sourceSurface: "phase-controls",
    };

    const discards = edits(planBasicAutomationCommands(state, handoff, CAPS)).filter(
      (edit) => edit.kind === "DISCARD_CARD",
    );
    expect(discards).toEqual([
      { kind: "DISCARD_CARD", battleCardId: "h11" },
      { kind: "DISCARD_CARD", battleCardId: "h10" },
    ]);
  });

  it("forces victory when the challenge pushes the player to the threshold", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { score: 22, frontRank: frontRankSlots("F0", "p0") },
      enemy: { deck: ["d-enemy"] },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 5 })],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 4 },
      sourceSurface: "phase-controls",
    };

    const result = planBasicAutomationCommands(state, handoff, CAPS);
    expect(result).toContainEqual({ id: "FORCE_RESULT", result: "victory", sourceSurface: "auto-system" });
  });

  it("leaves non-handoff flow edits unchanged", () => {
    const state = makeState({ activeSide: "player", turnNumber: 2 });
    const sameSideFlow: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "night", activeSide: "player", turnNumber: 2 },
      sourceSurface: "phase-controls",
    };

    expect(planBasicAutomationCommands(state, sameSideFlow, CAPS)).toEqual([sameSideFlow]);
  });
});

describe("planBasicAutomationCommands — passthrough", () => {
  it("returns non-automated commands unchanged", () => {
    const state = makeState({});
    const forceResult: BattleCommand = { id: "FORCE_RESULT", result: "defeat", sourceSurface: "inspector" };
    expect(planBasicAutomationCommands(state, forceResult, CAPS)).toEqual([forceResult]);

    const setEnergy: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CURRENT_ENERGY", side: "player", value: 3 },
      sourceSurface: "status-strip",
    };
    expect(planBasicAutomationCommands(state, setEnergy, CAPS)).toEqual([setEnergy]);
  });
});
