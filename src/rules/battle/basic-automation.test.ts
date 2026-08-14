import { describe, expect, it } from "vitest";
import type {
  BattleCommand,
  BattleDebugEdit,
} from "../../battle/debug/commands";
import type {
  BattleCardInstance,
  BattleCardKind,
  BattleMutableState,
  BattlePhase,
  BattleSide,
  BattleSideMutableState,
  FrontRankSlotId,
} from "../../battle/types";
import { createDefaultBattleCardStatus } from "../../battle/state/create-initial-state";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import { planBasicAutomationCommands } from "./basic-automation";
import { DREAMWELL_EFFECTS } from "./dreamwell-effects-table";
import type { BattleCardId, DreamwellCardId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import { asCardId } from "../../types/card-identity";
import { asBattleId } from "../../types/identifiers";
import { asBattleCardId } from "../../types/identifiers";
import { asDreamwellCardId } from "../../types/identifiers";

const CAPS = {
  maxEnergyCap: 10,
  scoreToWin: 25,
  handLimit: 10,
  dreamwellDeck: [],
};

function makeInstance(
  battleCardId: BattleCardId,
  options: {
    owner: BattleSide;
    kind?: BattleCardKind;
    cardId?: CardId;
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
      cardId: options.cardId ?? asCardId(""),
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
      ? Array.from(
          { length: options.figmentCount ?? 1 },
          () => options.printedSpark ?? 0,
        )
      : undefined,
    sparkDelta: options.sparkDelta ?? 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: options.isFigment ? "generated-figment" : "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

function emptySide(
  overrides: Partial<BattleSideMutableState> = {},
): BattleSideMutableState {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
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
    battleId: asBattleId("battle-test"),
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
      (options.instances ?? []).map((instance) => [
        instance.battleCardId,
        instance,
      ]),
    ),
  };
}

function edits(commands: BattleCommand[]): BattleDebugEdit[] {
  return commands.flatMap((command) =>
    command.id === "DEBUG_EDIT" ? [command.edit] : [],
  );
}

function frontRankSlots(
  slot: FrontRankSlotId,
  battleCardId: BattleCardId | null,
): Record<FrontRankSlotId, BattleCardId | null> {
  return {
    ...emptyFrontRankSlots(),
    [slot]: battleCardId,
  };
}

function firstPromptDreamwellEffectId(): DreamwellCardId {
  const id = Object.values(DREAMWELL_EFFECTS).find((script) =>
    script.steps.some((step) => step.kind === "prompt"),
  )?.id;
  if (id === undefined) {
    throw new Error("no prompt-bearing Dreamwell effect registered");
  }
  return asDreamwellCardId(id);
}

describe("planBasicAutomationCommands — playing cards", () => {
  it("spends energy and exhausts a character played to a slot", () => {
    const state = makeState({
      player: {
        currentEnergy: 5,
        hand: [asBattleCardId("c1")],
      },
      instances: [
        makeInstance(asBattleCardId("c1"), {
          owner: "player",
          kind: "character",
          energyCost: 3,
        }),
      ],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("c1"),
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      sourceSurface: "hand-tray",
    };

    const result = planBasicAutomationCommands(state, play, CAPS);

    expect(edits(result)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -3 },
      {
        kind: "SET_CARD_STATUS",
        battleCardId: asBattleCardId("c1"),
        status: { isExhausted: true },
      },
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("c1"),
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
    ]);
  });

  it("orders the deterministic cost spend before a cost-bearing interactive play", () => {
    const state = makeState({
      player: {
        currentEnergy: 5,
        hand: [asBattleCardId("interactive-c1")],
      },
      instances: [
        makeInstance(asBattleCardId("interactive-c1"), {
          owner: "player",
          kind: "character",
          cardId: asCardId("interactive-fixture"),
          energyCost: 3,
          renderedText: "Materialized: choose one.",
        }),
      ],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("interactive-c1"),
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      sourceSurface: "hand-tray",
    };

    expect(edits(planBasicAutomationCommands(state, play, CAPS))).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -3 },
      {
        kind: "SET_CARD_STATUS",
        battleCardId: asBattleCardId("interactive-c1"),
        status: { isExhausted: true },
      },
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("interactive-c1"),
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
    ]);
  });

  it("routes a played event to the void and still spends its energy", () => {
    const state = makeState({
      player: { currentEnergy: 5, hand: [asBattleCardId("e1")] },
      instances: [
        makeInstance(asBattleCardId("e1"), {
          owner: "player",
          kind: "event",
          energyCost: 2,
        }),
      ],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("e1"),
        destination: { side: "player", zone: "frontRank", slotId: "F0" },
      },
      sourceSurface: "hand-tray",
    };

    expect(edits(planBasicAutomationCommands(state, play, CAPS))).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: -2 },
      {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("e1"),
        destination: { side: "player", zone: "void" },
      },
    ]);
  });

  it("clamps energy spend so current energy never goes negative", () => {
    const state = makeState({
      player: { currentEnergy: 1, hand: [asBattleCardId("c1")] },
      instances: [
        makeInstance(asBattleCardId("c1"), { owner: "player", energyCost: 4 }),
      ],
    });
    const play: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("c1"),
        destination: { side: "player", zone: "backRank", slotId: "B0" },
      },
      sourceSurface: "hand-tray",
    };

    const energyEdit = edits(
      planBasicAutomationCommands(state, play, CAPS),
    ).find((edit) => edit.kind === "ADJUST_CURRENT_ENERGY");
    expect(energyEdit).toEqual({
      kind: "ADJUST_CURRENT_ENERGY",
      side: "player",
      amount: -1,
    });
  });

  it("does not treat hand→void/deck moves as a play", () => {
    const state = makeState({
      player: { currentEnergy: 5, hand: [asBattleCardId("c1")] },
      instances: [
        makeInstance(asBattleCardId("c1"), { owner: "player", energyCost: 3 }),
      ],
    });
    const discardToVoid: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("c1"),
        destination: { side: "player", zone: "void" },
      },
      sourceSurface: "hand-tray",
    };

    expect(planBasicAutomationCommands(state, discardToVoid, CAPS)).toEqual([
      discardToVoid,
    ]);
  });

  it("does not spend energy when moving a card already on the battlefield", () => {
    const state = makeState({
      player: {
        currentEnergy: 5,
        backRank: { ...emptyBackRankSlots(), B0: asBattleCardId("c1") },
      },
      instances: [
        makeInstance(asBattleCardId("c1"), { owner: "player", energyCost: 3 }),
      ],
    });
    const reposition: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: asBattleCardId("c1"),
        destination: { side: "player", zone: "frontRank", slotId: "F0" },
      },
      sourceSurface: "battlefield",
    };

    expect(planBasicAutomationCommands(state, reposition, CAPS)).toEqual([
      reposition,
    ]);
  });
});

// The Challenge resolver itself (spark comparison, combat keywords,
// figment dissolution) is unit-tested in `src/battle/engine/challenge.test.ts`,
// its canonical home. Here we exercise the automation path that routes through
// it (turn handoff and bookend advance), proving the resolver's edits are folded
// into the automation command stream.

describe("planBasicAutomationCommands — turn handoff", () => {
  it("resolves the challenge and leaves the incoming deck for the post-Dreamwell draw", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      enemy: { deck: [asBattleCardId("d-enemy")] },
      instances: [
        makeInstance(asBattleCardId("p0"), {
          owner: "player",
          printedSpark: 4,
        }),
      ],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
        activeSide: "enemy",
        turnNumber: 3,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // Challenge scoring for the outgoing player.
    expect(result).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 4,
    });
    // The user's own flow edit is preserved.
    expect(result).toContainEqual({
      kind: "SET_BATTLE_FLOW",
      phase: "dreamwell",
      activeSide: "enemy",
      turnNumber: 3,
    });
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
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
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      enemy: { deck: [asBattleCardId("d-enemy")] },
      instances: [
        makeInstance(asBattleCardId("p0"), {
          owner: "player",
          printedSpark: 4,
        }),
      ],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "dreamwell",
        activeSide: "enemy",
        turnNumber: 3,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // No second scoring of the outgoing player's surviving challenger.
    expect(result.some((edit) => edit.kind === "ADJUST_SCORE")).toBe(false);
    // The handoff still flips the side without drawing ahead of Dreamwell.
    expect(result).toContainEqual({
      kind: "SET_BATTLE_FLOW",
      phase: "dreamwell",
      activeSide: "enemy",
      turnNumber: 3,
    });
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
  });

  it("does not draw for the second player until their Dreamwell phase finishes", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 1,
      enemy: { deck: [asBattleCardId("d-enemy")] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 1,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
  });

  it("discards the outgoing side down to the hand limit", () => {
    const overfullHand = Array.from(
      { length: 12 },
      (_, index) => `h${String(index)}`,
    );
    const state = makeState({
      activeSide: "player",
      turnNumber: 2,
      player: { hand: overfullHand.map(asBattleCardId) },
      enemy: { deck: [asBattleCardId("d-enemy")] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 2,
      },
      sourceSurface: "phase-controls",
    };

    const discards = edits(
      planBasicAutomationCommands(state, handoff, { ...CAPS, handLimit: 7 }),
    ).filter((edit) => edit.kind === "DISCARD_CARD");
    expect(discards).toEqual([
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h11") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h10") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h9") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h8") },
      { kind: "DISCARD_CARD", battleCardId: asBattleCardId("h7") },
    ]);
  });

  it("forces victory when the challenge pushes the player to the threshold", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: {
        score: 22,
        frontRank: frontRankSlots("F0", asBattleCardId("p0")),
      },
      enemy: { deck: [asBattleCardId("d-enemy")] },
      instances: [
        makeInstance(asBattleCardId("p0"), {
          owner: "player",
          printedSpark: 5,
        }),
      ],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 4,
      },
      sourceSurface: "phase-controls",
    };

    const result = planBasicAutomationCommands(state, handoff, CAPS);
    expect(result).toContainEqual({
      id: "FORCE_RESULT",
      result: "victory",
      sourceSurface: "auto-system",
    });
  });

  it("delegates Ending exhaustion-clear to the reducer (emits no status clear)", () => {
    // The reducer's `BATTLE_COMMAND` owns the all-card exhaustion clear when it
    // folds the handoff flip edit. The client expansion emits no
    // duplicate status-clear edits.
    const incomingFront = makeInstance(asBattleCardId("e-front"), {
      owner: "enemy",
      printedSpark: 2,
    });
    const incomingBack = makeInstance(asBattleCardId("e-back"), {
      owner: "enemy",
      printedSpark: 1,
    });
    const outgoingFront = makeInstance(asBattleCardId("p-front"), {
      owner: "player",
      printedSpark: 3,
    });
    incomingFront.status.isExhausted = true;
    incomingBack.status.isExhausted = true;
    outgoingFront.status.isExhausted = true;

    const state = makeState({
      activeSide: "player",
      turnNumber: 5,
      player: { frontRank: frontRankSlots("F1", asBattleCardId("p-front")) },
      enemy: {
        deck: [asBattleCardId("d-enemy")],
        frontRank: frontRankSlots("F0", asBattleCardId("e-front")),
        backRank: { ...emptyBackRankSlots(), B0: asBattleCardId("e-back") },
      },
      instances: [incomingFront, incomingBack, outgoingFront],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 5,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // No explicit exhaustion-clear for either side; the reducer owns it.
    expect(result.some((edit) => edit.kind === "SET_CARD_STATUS")).toBe(false);
    // The side flip is preserved without an early incoming draw.
    expect(result).toContainEqual({
      kind: "SET_BATTLE_FLOW",
      phase: "day",
      activeSide: "enemy",
      turnNumber: 5,
    });
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
  });

  it("emits no explicit status clear when no characters are in play", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      enemy: { deck: [asBattleCardId("d-enemy")] },
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 3,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(result.some((edit) => edit.kind === "SET_CARD_STATUS")).toBe(false);
  });

  it("banishes the outgoing side's ephemeral hand and offering in-play cards", () => {
    const ephemeral = makeInstance(asBattleCardId("p-eph"), {
      owner: "player",
    });
    ephemeral.status.ephemeral = true;
    const offering = makeInstance(asBattleCardId("p-off"), {
      owner: "player",
      printedSpark: 3,
    });
    offering.status.offering = true;
    const normalHand = makeInstance(asBattleCardId("p-keep"), {
      owner: "player",
    });
    const normalPlay = makeInstance(asBattleCardId("p-stay"), {
      owner: "player",
      printedSpark: 2,
    });

    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: {
        hand: [asBattleCardId("p-eph"), asBattleCardId("p-keep")],
        frontRank: frontRankSlots("F0", asBattleCardId("p-off")),
        backRank: { ...emptyBackRankSlots(), B0: asBattleCardId("p-stay") },
      },
      enemy: { deck: [asBattleCardId("d-enemy")] },
      instances: [ephemeral, offering, normalHand, normalPlay],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 4,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));

    // The ephemeral hand card and the offering in-play card are banished.
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: asBattleCardId("p-eph"),
      destination: { side: "player", zone: "banished" },
    });
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: asBattleCardId("p-off"),
      destination: { side: "player", zone: "banished" },
    });
    // Normal cards (hand and in-play) are left alone.
    const banishedIds = result
      .filter(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" &&
          edit.destination.zone === "banished",
      )
      .map((edit) =>
        edit.kind === "MOVE_CARD_TO_ZONE"
          ? edit.battleCardId
          : asBattleCardId(""),
      );
    expect(banishedIds).not.toContain("p-keep");
    expect(banishedIds).not.toContain("p-stay");
  });

  it("banishes the outgoing side after the hand-limit discard and before the side flip", () => {
    const ephemeral = makeInstance(asBattleCardId("p-eph"), {
      owner: "player",
    });
    ephemeral.status.ephemeral = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { hand: [asBattleCardId("p-eph")] },
      enemy: { deck: [asBattleCardId("d-enemy")] },
      instances: [ephemeral],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 4,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    const banishIndex = result.findIndex(
      (edit) =>
        edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === "p-eph",
    );
    const flowIndex = result.findIndex(
      (edit) => edit.kind === "SET_BATTLE_FLOW",
    );
    expect(banishIndex).toBeGreaterThanOrEqual(0);
    // The Ending banish belongs to the outgoing player's turn, so it precedes
    // the side flip (rules §Turn Structure — Ending).
    expect(banishIndex).toBeLessThan(flowIndex);
  });

  it("does not banish the incoming side's ephemeral or offering cards", () => {
    const incomingEphemeral = makeInstance(asBattleCardId("e-eph"), {
      owner: "enemy",
    });
    incomingEphemeral.status.ephemeral = true;
    const incomingOffering = makeInstance(asBattleCardId("e-off"), {
      owner: "enemy",
      printedSpark: 2,
    });
    incomingOffering.status.offering = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      enemy: {
        deck: [asBattleCardId("d-enemy")],
        hand: [asBattleCardId("e-eph")],
        frontRank: frontRankSlots("F0", asBattleCardId("e-off")),
      },
      instances: [incomingEphemeral, incomingOffering],
    });
    const handoff: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "enemy",
        turnNumber: 4,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, handoff, CAPS));
    expect(
      result.some(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" &&
          edit.destination.zone === "banished",
      ),
    ).toBe(false);
  });

  it("leaves non-handoff flow edits unchanged", () => {
    const state = makeState({ activeSide: "player", turnNumber: 2 });
    const sameSideFlow: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "night",
        activeSide: "player",
        turnNumber: 2,
      },
      sourceSurface: "phase-controls",
    };

    expect(planBasicAutomationCommands(state, sameSideFlow, CAPS)).toEqual([
      sameSideFlow,
    ]);
  });
});

describe("planBasicAutomationCommands — Dreamwell reveal", () => {
  // The Dreamwell phase is a surfaced stop, not a bookend: a `SET_PHASE` into it
  // passes through unchanged (the reveal effect issues the `DRAW_DREAMWELL_CARD`
  // that the player clicks through). Revealing a Dreamwell card raises the
  // drawing side's maximum ● by the drawn card's `energyAdded`, uncapped.
  const DREAMWELL_DECK = [
    {
      id: firstPromptDreamwellEffectId(),
      name: "Opening",
      renderedText: "",
      energyAdded: 2,
      order: 0,
      cardNumber: 1,
      imageNumber: 0,
    },
    {
      id: asDreamwellCardId("dw-1"),
      name: "Bonus",
      renderedText: "",
      energyAdded: 1,
      order: 1,
      cardNumber: 2,
      imageNumber: 0,
    },
  ];

  it("draws before entering Day when a later turn leaves Dreamwell", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 2,
      phase: "dreamwell",
      player: { deck: [asBattleCardId("foreseen-top")] },
    });
    const advance: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "player",
        turnNumber: 2,
      },
      sourceSurface: "phase-controls",
    };

    expect(edits(planBasicAutomationCommands(state, advance, CAPS))).toEqual([
      { kind: "DRAW_CARD", side: "player" },
      {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "player",
        turnNumber: 2,
      },
    ]);
  });

  it("draws before the tutorial controller advances from Dreamwell through Dawn", () => {
    const state = makeState({
      activeSide: "enemy",
      turnNumber: 1,
      phase: "dreamwell",
      enemy: { deck: [asBattleCardId("foreseen-top")] },
    });
    const advance: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dawn" },
      sourceSurface: "auto-system",
    };

    expect(edits(planBasicAutomationCommands(state, advance, CAPS))).toEqual([
      { kind: "DRAW_CARD", side: "enemy" },
      { kind: "SET_PHASE", phase: "dawn" },
      { kind: "SET_PHASE", phase: "day" },
    ]);
  });

  it("skips the ordinary draw when the first player's opening turn leaves Dreamwell", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 1,
      phase: "dreamwell",
      player: { deck: [asBattleCardId("opening-top")] },
    });
    const advance: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "player",
        turnNumber: 1,
      },
      sourceSurface: "phase-controls",
    };

    expect(edits(planBasicAutomationCommands(state, advance, CAPS))).toEqual([
      {
        kind: "SET_BATTLE_FLOW",
        phase: "day",
        activeSide: "player",
        turnNumber: 1,
      },
    ]);
  });

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

    // Uncapped: previous max (9) + the order-0 card's energyAdded (2) = 11,
    // above the cap of 10; current ● refills to the new maximum before the
    // reveal command, which may park a prompt.
    expect(result).toEqual([
      { kind: "SET_MAX_ENERGY", side: "player", value: 11 },
      { kind: "SET_CURRENT_ENERGY", side: "player", value: 11 },
      {
        kind: "DRAW_DREAMWELL_CARD",
        side: "player",
        turnNumber: 3,
      },
    ]);
  });

  it("expands a draw gesture into draw + dawn landing in day", () => {
    const state = makeState({
      activeSide: "enemy",
      turnNumber: 2,
      enemy: { deck: [asBattleCardId("d0")] },
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
    expect(result[result.length - 1]).toEqual({
      kind: "SET_PHASE",
      phase: "day",
    });
  });

  it("skips the draw when the first player (player) enters their turn-1 draw phase", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 1,
      player: { deck: [asBattleCardId("d0")] },
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "draw" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "draw" });
    expect(result.some((edit) => edit.kind === "DRAW_CARD")).toBe(false);
  });

  it("expands a Dawn gesture into a bare crossing into Day", () => {
    // A `SET_PHASE dawn` navigation steps dawn → day without an exhaustion edit.
    const exhausted = makeInstance(asBattleCardId("p0"), {
      owner: "player",
      printedSpark: 2,
    });
    exhausted.status.isExhausted = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      instances: [exhausted],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dawn" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    // The expansion is just the dawn entry followed by the crossing into day.
    expect(result).toEqual([
      { kind: "SET_PHASE", phase: "dawn" },
      { kind: "SET_PHASE", phase: "day" },
    ]);
  });

  it("does not fold an in-play Driftcaller Sovereign's Dawn energy gain into the expansion", () => {
    // Driftcaller Sovereign — ▸Dawn: Gain 1●. The reducer (the sole Dawn owner)
    // applies this on the committed dawn edge; the client expansion emits neither
    // the exhaustion clear nor the energy gain, so the non-idempotent trigger
    // fires exactly once.
    const driftcaller = makeInstance(asBattleCardId("p0"), {
      owner: "player",
      cardId: asCardId("9b9c2743-75b3-499d-b5fb-c3429c92d420"),
      printedSpark: 2,
    });
    driftcaller.status.isExhausted = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      instances: [driftcaller],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dawn" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result.some((edit) => edit.kind === "SET_CARD_STATUS")).toBe(false);
    expect(result.some((edit) => edit.kind === "ADJUST_CURRENT_ENERGY")).toBe(
      false,
    );
  });

  it("expands an ending gesture into the hand-limit discard and banish", () => {
    const overfullHand = Array.from(
      { length: 12 },
      (_, index) => `h${String(index)}`,
    );
    const ephemeral = makeInstance(asBattleCardId("h11"), { owner: "player" });
    ephemeral.status.ephemeral = true;
    const offering = makeInstance(asBattleCardId("p-off"), {
      owner: "player",
      printedSpark: 3,
    });
    offering.status.offering = true;
    const state = makeState({
      activeSide: "player",
      turnNumber: 4,
      player: {
        hand: overfullHand.map(asBattleCardId),
        frontRank: frontRankSlots("F0", asBattleCardId("p-off")),
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
    expect(result).toContainEqual({
      kind: "DISCARD_CARD",
      battleCardId: asBattleCardId("h11"),
    });
    expect(result).toContainEqual({
      kind: "DISCARD_CARD",
      battleCardId: asBattleCardId("h10"),
    });
    // Offering in-play card is banished.
    expect(result).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: asBattleCardId("p-off"),
      destination: { side: "player", zone: "banished" },
    });
    // An ending gesture does not flip the side (that is the handoff's job).
    expect(result.some((edit) => edit.kind === "SET_BATTLE_FLOW")).toBe(false);
  });

  it("stops at surfaced phases without expanding them", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 2,
      player: { deck: [asBattleCardId("d0")] },
    });
    for (const phase of ["day", "dusk", "night"] as const) {
      const gesture: BattleCommand = {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase },
        sourceSurface: "phase-controls",
      };
      // Surfaced phases pass through untouched — the player drives them.
      expect(planBasicAutomationCommands(state, gesture, CAPS)).toEqual([
        gesture,
      ]);
    }
  });

  it("still resolves the challenge when navigating to the challenge phase", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      instances: [
        makeInstance(asBattleCardId("p0"), {
          owner: "player",
          printedSpark: 4,
        }),
      ],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "challenge" },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    expect(result[0]).toEqual({ kind: "SET_PHASE", phase: "challenge" });
    expect(result).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 4,
    });
    // The challenge navigation does not advance past challenge.
    expect(
      result.some(
        (edit) => edit.kind === "SET_PHASE" && edit.phase !== "challenge",
      ),
    ).toBe(false);
  });

  it("resolves the challenge when the phase float advances into challenge (same-side flow)", () => {
    const state = makeState({
      activeSide: "player",
      turnNumber: 3,
      phase: "night",
      player: { frontRank: frontRankSlots("F0", asBattleCardId("p0")) },
      instances: [
        makeInstance(asBattleCardId("p0"), {
          owner: "player",
          printedSpark: 4,
        }),
      ],
    });
    const gesture: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: {
        kind: "SET_BATTLE_FLOW",
        phase: "challenge",
        activeSide: "player",
        turnNumber: 3,
      },
      sourceSurface: "phase-controls",
    };

    const result = edits(planBasicAutomationCommands(state, gesture, CAPS));
    // Entering challenge resolves the outgoing side's Challenge exactly here.
    expect(result).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 4,
    });
    // The flow edit itself is preserved and there is no side flip.
    expect(result).toContainEqual({
      kind: "SET_BATTLE_FLOW",
      phase: "challenge",
      activeSide: "player",
      turnNumber: 3,
    });
  });
});

describe("planBasicAutomationCommands — passthrough", () => {
  it("returns non-automated commands unchanged", () => {
    const state = makeState({});
    const forceResult: BattleCommand = {
      id: "FORCE_RESULT",
      result: "defeat",
      sourceSurface: "inspector",
    };
    expect(planBasicAutomationCommands(state, forceResult, CAPS)).toEqual([
      forceResult,
    ]);

    const setEnergy: BattleCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_CURRENT_ENERGY", side: "player", value: 3 },
      sourceSurface: "status-strip",
    };
    expect(planBasicAutomationCommands(state, setEnergy, CAPS)).toEqual([
      setEnergy,
    ]);
  });
});
