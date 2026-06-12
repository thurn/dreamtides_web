import { describe, expect, it } from "vitest";
import type { BattleCommand, BattleDebugEdit } from "../debug/commands";
import type {
  BattleCardInstance,
  BattleCardKind,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BattleSideMutableState,
  FrontRankSlotId,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import { planBasicAutomationCommands } from "./basic-automation";

const CAPS = { maxEnergyCap: 10, scoreToWin: 25, dreamwellDeck: [] };

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
      cardId: "",
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
    figments: options.isFigment
      ? Array.from({ length: options.figmentCount ?? 1 }, () => options.printedSpark ?? 0)
      : undefined,
    sparkDelta: options.sparkDelta ?? 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
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
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
    ...overrides,
  };
}

function makeState(options: {
  activeSide?: BattleSide;
  turnNumber?: number;
  phase?: BattlePhase;
  player?: Partial<BattleSideMutableState>;
  enemy?: Partial<BattleSideMutableState>;
  instances?: BattleCardInstance[];
}): BattleMutableState {
  return {
    battleId: "battle-test",
    activeSide: options.activeSide ?? "player",
    turnNumber: options.turnNumber ?? 1,
    phase: options.phase ?? "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
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

// The Challenge resolver itself (spark comparison, the four combat keywords,
// figment dissolution) is unit-tested in `src/battle/engine/challenge.test.ts`,
// its canonical home. Here we exercise the automation path that routes through
// it (turn handoff and bookend advance), proving the resolver's edits are folded
// into the automation command stream.

describe("planBasicAutomationCommands — turn handoff", () => {
  it("resolves the challenge and draws for the incoming side (energy follows the Dreamwell reveal)", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { deck: ["d-enemy"] },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "dreamwell", activeSide: "enemy", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // Challenge scoring for the outgoing player.
    expect(result).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 4 });
    // The user's own flow edit is preserved.
    expect(result).toContainEqual({ kind: "SET_BATTLE_FLOW", phase: "dreamwell", activeSide: "enemy", turnNumber: 3 });
    // Incoming-side draw (turn > 1).
    expect(result).toContainEqual({ kind: "DRAW_CARD", side: "enemy" });
    // The handoff itself does not ramp energy; that follows the Dreamwell reveal.
    expect(result.some((edit) => edit.kind === "SET_MAX_ENERGY")).toBe(false);
  });

  it("does not re-resolve the challenge when the outgoing side already sits in the challenge phase", () => {
    // Reaching the challenge phase resolves the Challenge once (planChallengeOnly).
    // The subsequent handoff must not score or dissolve a second time.
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      phase: "challenge",
      player: { frontRank: frontRankSlots("F0", "p0") },
      enemy: { deck: ["d-enemy"] },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "dreamwell", activeSide: "enemy", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // No second scoring of the outgoing player's surviving challenger.
    expect(result.some((edit) => edit.kind === "ADJUST_SCORE")).toBe(false);
    // The handoff still flips the side and draws for the incoming side.
    expect(result).toContainEqual({ kind: "SET_BATTLE_FLOW", phase: "dreamwell", activeSide: "enemy", turnNumber: 3 });
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

  it("clears exhaustion for every in-play character of the incoming side", () => {
    const incomingFront = makeInstance("e-front", { owner: "enemy", printedSpark: 2 });
    const incomingBack = makeInstance("e-back", { owner: "enemy", printedSpark: 1 });
    const outgoingFront = makeInstance("p-front", { owner: "player", printedSpark: 3 });
    incomingFront.status.isExhausted = true;
    incomingBack.status.isExhausted = true;
    outgoingFront.status.isExhausted = true;

    const state = makeState({
      activeSide: "player",
      turnNumber: 5,
      player: { frontRank: frontRankSlots("F1", "p-front") },
      enemy: {
        deck: ["d-enemy"],
        frontRank: frontRankSlots("F0", "e-front"),
        backRank: {
          B0: "e-back",
          B1: null,
          B2: null,
          B3: null,
          B4: null,
        },
      },
      instances: [incomingFront, incomingBack, outgoingFront],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 5 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // Both the incoming side's front- and back-rank characters are cleared.
    expect(result).toContainEqual({
      kind: "SET_CARD_STATUS",
      battleCardId: "e-front",
      status: { isExhausted: false },
    });
    expect(result).toContainEqual({
      kind: "SET_CARD_STATUS",
      battleCardId: "e-back",
      status: { isExhausted: false },
    });
    // The outgoing side's exhaustion is untouched.
    expect(
      result.some(
        (edit) => edit.kind === "SET_CARD_STATUS" && edit.battleCardId === "p-front",
      ),
    ).toBe(false);
  });

  it("clears exhaustion before the incoming side's draw and energy ramp", () => {
    const incoming = makeInstance("e-front", { owner: "enemy", printedSpark: 2 });
    incoming.status.isExhausted = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      enemy: {
        deck: ["d-enemy"],
        frontRank: frontRankSlots("F0", "e-front"),
      },
      instances: [incoming],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 4 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    const clearIndex = result.findIndex(
      (edit) => edit.kind === "SET_CARD_STATUS" && edit.battleCardId === "e-front",
    );
    const flowIndex = result.findIndex((edit) => edit.kind === "SET_BATTLE_FLOW");
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    // The exhaust-clear is part of the incoming side's turn, so it follows the
    // side flip just like the ramp and draw.
    expect(clearIndex).toBeGreaterThan(flowIndex);
  });

  it("emits no status clear when the incoming side has no characters in play", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      enemy: { deck: ["d-enemy"] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(result.some((edit) => edit.kind === "SET_CARD_STATUS")).toBe(false);
  });

  it("banishes the outgoing side's ephemeral hand and offering in-play cards", () => {
    const ephemeral = makeInstance("p-eph", { owner: "player" });
    ephemeral.status.ephemeral = true;
    const offering = makeInstance("p-off", { owner: "player", printedSpark: 3 });
    offering.status.offering = true;
    const normalHand = makeInstance("p-keep", { owner: "player" });
    const normalPlay = makeInstance("p-stay", { owner: "player", printedSpark: 2 });

    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: {
        hand: ["p-eph", "p-keep"],
        frontRank: frontRankSlots("F0", "p-off"),
        backRank: {
          B0: "p-stay",
          B1: null,
          B2: null,
          B3: null,
          B4: null,
        },
      },
      enemy: { deck: ["d-enemy"] },
      instances: [ephemeral, offering, normalHand, normalPlay],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 4 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // The ephemeral hand card and the offering in-play card are banished.
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p-eph",
      destination: { side: "player", zone: "banished" },
    });
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p-off",
      destination: { side: "player", zone: "banished" },
    });
    // Normal cards (hand and in-play) are left alone.
    const banishedIds = result
      .filter(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" && edit.destination.zone === "banished",
      )
      .map((edit) => (edit.kind === "MOVE_CARD_TO_ZONE" ? edit.battleCardId : ""));
    expect(banishedIds).not.toContain("p-keep");
    expect(banishedIds).not.toContain("p-stay");
  });

  it("banishes the outgoing side after the hand-limit discard and before the side flip", () => {
    const ephemeral = makeInstance("p-eph", { owner: "player" });
    ephemeral.status.ephemeral = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { hand: ["p-eph"] },
      enemy: { deck: ["d-enemy"] },
      instances: [ephemeral],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 4 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    const banishIndex = result.findIndex(
      (edit) =>
        edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === "p-eph",
    );
    const flowIndex = result.findIndex((edit) => edit.kind === "SET_BATTLE_FLOW");
    expect(banishIndex).toBeGreaterThanOrEqual(0);
    // The Ending banish belongs to the outgoing player's turn, so it precedes
    // the side flip (rules §Turn Structure — Ending).
    expect(banishIndex).toBeLessThan(flowIndex);
  });

  it("does not banish the incoming side's ephemeral or offering cards", () => {
    const incomingEphemeral = makeInstance("e-eph", { owner: "enemy" });
    incomingEphemeral.status.ephemeral = true;
    const incomingOffering = makeInstance("e-off", { owner: "enemy", printedSpark: 2 });
    incomingOffering.status.offering = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      enemy: {
        deck: ["d-enemy"],
        hand: ["e-eph"],
        frontRank: frontRankSlots("F0", "e-off"),
      },
      instances: [incomingEphemeral, incomingOffering],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "day", activeSide: "enemy", turnNumber: 4 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(
      result.some(
        (edit) => edit.kind === "MOVE_CARD_TO_ZONE" && edit.destination.zone === "banished",
      ),
    ).toBe(false);
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

describe("planBasicAutomationCommands — Dreamwell reveal", () => {
  // The Dreamwell phase is a surfaced stop, not a bookend: a `SET_PHASE` into it
  // passes through unchanged (the reveal effect issues the `DRAW_DREAMWELL_CARD`
  // that the player clicks through). Revealing a Dreamwell card raises the
  // drawing side's maximum ● by the drawn card's `energyAdded`, uncapped.
  const DREAMWELL_DECK = [
    { id: "dw-0", name: "Opening", renderedText: "", energyAdded: 2, order: 0, cardNumber: 1, imageNumber: 0 },
    { id: "dw-1", name: "Bonus", renderedText: "", energyAdded: 1, order: 1, cardNumber: 2, imageNumber: 0 },
  ];

  it("passes a Dreamwell phase navigation through unchanged", () => {
    const state = makeState({ activeSide: "player", turnNumber: 3 });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dreamwell" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result).toEqual([{ kind: "SET_PHASE", phase: "dreamwell" }]);
  });

  it("raises max energy by the drawn card's energyAdded, uncapped, and refills current", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { maxEnergy: 9, currentEnergy: 1 },
    });
    const caps = { ...CAPS, dreamwellDeck: DREAMWELL_DECK };
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "DRAW_DREAMWELL_CARD", side: "player", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, caps));

    // The reveal itself is preserved as the first command.
    expect(result[0]).toEqual({
      kind: "DRAW_DREAMWELL_CARD",
      side: "player",
      turnNumber: 3,
    });
    // Uncapped: previous max (9) + the order-0 card's energyAdded (2) = 11,
    // above the cap of 10; current ● refills to the new maximum.
    expect(result).toContainEqual({ kind: "SET_MAX_ENERGY", side: "player", value: 11 });
    expect(result).toContainEqual({ kind: "SET_CURRENT_ENERGY", side: "player", value: 11 });
  });

  it("expands a draw gesture into draw + dawn landing in day", () => {
    const state = makeState({
      activeSide: "enemy",
      turnNumber: 2,
      enemy: { deck: ["d0"] },
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "draw" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "draw" });
    expect(result).toContainEqual({ kind: "DRAW_CARD", side: "enemy" });
    // A draw gesture does not re-apply the dreamwell ramp.
    expect(result.some((edit) => edit.kind === "SET_MAX_ENERGY")).toBe(false);
    expect(result[result.length - 1]).toEqual({ kind: "SET_PHASE", phase: "day" });
  });

  it("expands a dawn gesture into the exhaust-clear landing in day", () => {
    const exhausted = makeInstance("p0", { owner: "player", printedSpark: 2 });
    exhausted.status.isExhausted = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { frontRank: frontRankSlots("F0", "p0") },
      instances: [exhausted],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dawn" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "dawn" });
    expect(result).toContainEqual({
      kind: "SET_CARD_STATUS",
      battleCardId: "p0",
      status: { isExhausted: false },
    });
    // A dawn gesture does not re-draw or re-ramp.
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
    expect(result.some((edit) => edit.kind === "SET_MAX_ENERGY")).toBe(false);
    expect(result[result.length - 1]).toEqual({ kind: "SET_PHASE", phase: "day" });
  });

  it("expands an ending gesture into the hand-limit discard and banish", () => {
    const overfullHand = Array.from({ length: 12 }, (_, index) => `h${String(index)}`);
    const ephemeral = makeInstance("h11", { owner: "player" });
    ephemeral.status.ephemeral = true;
    const offering = makeInstance("p-off", { owner: "player", printedSpark: 3 });
    offering.status.offering = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: {
        hand: overfullHand,
        frontRank: frontRankSlots("F0", "p-off"),
      },
      instances: [ephemeral, offering],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "ending" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "ending" });
    // Hand-limit discard for the active side.
    expect(result).toContainEqual({ kind: "DISCARD_CARD", battleCardId: "h11" });
    expect(result).toContainEqual({ kind: "DISCARD_CARD", battleCardId: "h10" });
    // Offering in-play card is banished.
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "p-off",
      destination: { side: "player", zone: "banished" },
    });
    // An ending gesture does not flip the side (that is the handoff's job).
    expect(result.some((edit) => edit.kind === "SET_BATTLE_FLOW")).toBe(false);
  });

  it("stops at surfaced phases without expanding them", () => {
    const state = makeState({ activeSide: "player", turnNumber: 2, player: { deck: ["d0"] } });
    for (const phase of ["day", "dusk", "night"] as const) {
      const gesture: BattleCommand = {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase },
        sourceSurface: "phase-controls",
      };
      // Surfaced phases pass through untouched — the player drives them.
      expect(planBasicAutomationCommands(state, gesture, CAPS)).toEqual([gesture]);
    }
  });

  it("still resolves the challenge when navigating to the challenge phase", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { frontRank: frontRankSlots("F0", "p0") },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "challenge" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "challenge" });
    expect(result).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 4 });
    // The challenge navigation does not advance past challenge.
    expect(result.some((edit) => edit.kind === "SET_PHASE" && edit.phase !== "challenge")).toBe(false);
  });

  it("resolves the challenge when the phase float advances into challenge (same-side flow)", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      phase: "night",
      player: { frontRank: frontRankSlots("F0", "p0") },
      instances: [makeInstance("p0", { owner: "player", printedSpark: 4 })],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_BATTLE_FLOW", phase: "challenge", activeSide: "player", turnNumber: 3 },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    // Entering challenge resolves the outgoing side's Challenge exactly here.
    expect(result).toContainEqual({ kind: "ADJUST_SCORE", side: "player", amount: 4 });
    // The flow edit itself is preserved and there is no side flip.
    expect(result).toContainEqual({ kind: "SET_BATTLE_FLOW", phase: "challenge", activeSide: "player", turnNumber: 3 });
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
