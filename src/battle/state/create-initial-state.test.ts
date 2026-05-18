import { describe, expect, it } from "vitest";
import { prepareInitialBattleState } from "../engine/turn-flow";
import { createBattleInit } from "../integration/create-battle-init";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import type { BattleDeckCardDefinition } from "../types";
import {
  allocateBattleCardInstance,
  cloneBattleMutableState,
  createInitialBattleState,
} from "./create-initial-state";

describe("createInitialBattleState", () => {
  it("draws 4 cards for the starting side, 5 for the responder, and seeds both sides at 2/2", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });

    const state = createInitialBattleState(battleInit);

    expect(state.battleId).toBe(battleInit.battleId);
    expect(state.activeSide).toBe("player");
    expect(state.turnNumber).toBe(1);
    expect(state.result).toBeNull();
    expect(state.forcedResult).toBeNull();
    expect(state.sides.player.currentEnergy).toBe(2);
    expect(state.sides.player.maxEnergy).toBe(2);
    expect(state.sides.enemy.currentEnergy).toBe(2);
    expect(state.sides.enemy.maxEnergy).toBe(2);
    expect(state.sides.player.hand).toHaveLength(4);
    expect(state.sides.enemy.hand).toHaveLength(5);
    expect(state.sides.player.deck).toHaveLength(
      battleInit.playerDeckOrder.length - 4,
    );
    expect(state.sides.enemy.deck).toHaveLength(
      battleInit.enemyDeckDefinition.length - battleInit.openingHandSize,
    );
    expect(Object.keys(state.cardInstances).slice(0, 3)).toEqual([
      "bc_0001",
      "bc_0002",
      "bc_0003",
    ]);
    expect(state.sides.player.hand[0]).toBe("bc_0001");
    expect(
      state.cardInstances[state.sides.player.hand[0]].definition.sourceDeckEntryId,
    ).toBe(battleInit.playerDeckOrder[0].sourceDeckEntryId);
    expect(
      state.sides.enemy.hand.every((battleCardId) => state.cardInstances[battleCardId]?.isRevealedToPlayer),
    ).toBe(true);
  });

  it("runs the turn-1 start-of-turn composite via prepareInitialBattleState without changing the opening 2/2 energy", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const raw = createInitialBattleState(battleInit);
    const initialPlayerHand = [...raw.sides.player.hand];
    const initialPlayerDeck = [...raw.sides.player.deck];

    const prepared = prepareInitialBattleState(raw, battleInit);

    expect(prepared.state.activeSide).toBe("player");
    expect(prepared.state.phase).toBe("main");
    expect(prepared.state.turnNumber).toBe(1);
    expect(prepared.state.sides.player.currentEnergy).toBe(2);
    expect(prepared.state.sides.player.maxEnergy).toBe(2);
    expect(prepared.state.sides.enemy.currentEnergy).toBe(2);
    expect(prepared.state.sides.enemy.maxEnergy).toBe(2);
    // Turn 1 skips the actual draw but still passes through the draw phase.
    expect(prepared.state.sides.player.hand).toEqual(initialPlayerHand);
    expect(prepared.state.sides.player.deck).toEqual(initialPlayerDeck);

    const phaseChangedEvents = prepared.transition.logEvents.filter(
      (entry) => entry.event === "battle_proto_phase_changed",
    );
    expect(phaseChangedEvents.map((entry) => entry.fields.phase)).toEqual([
      "startOfTurn",
      "judgment",
      "draw",
      "main",
    ]);
    expect(
      prepared.transition.logEvents.some((entry) => entry.event === "battle_proto_energy_changed"),
    ).toBe(true);
    expect(
      prepared.transition.logEvents.some((entry) => entry.event === "battle_proto_judgment"),
    ).toBe(true);
  });

  it("initializes per-side pending extra turns and visibility flags required by the spec state model", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const state = createInitialBattleState(battleInit);

    expect(state.sides.player.pendingExtraTurns).toBe(0);
    expect(state.sides.enemy.pendingExtraTurns).toBe(0);
    expect(state.sides.player.visibility).toEqual({});
    expect(state.sides.enemy.visibility).toEqual({});
  });
});

describe("cloneBattleMutableState", () => {
  function makeBattleState() {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    return createInitialBattleState(battleInit);
  }

  it("produces a deep clone with independent top-level, per-side, and nested collections", () => {
    const state = makeBattleState();
    const clone = cloneBattleMutableState(state);

    expect(clone).not.toBe(state);
    expect(clone.sides).not.toBe(state.sides);
    expect(clone.sides.player).not.toBe(state.sides.player);
    expect(clone.sides.enemy).not.toBe(state.sides.enemy);
    expect(clone.sides.player.deck).not.toBe(state.sides.player.deck);
    expect(clone.sides.player.hand).not.toBe(state.sides.player.hand);
    expect(clone.sides.player.void).not.toBe(state.sides.player.void);
    expect(clone.sides.player.banished).not.toBe(state.sides.player.banished);
    expect(clone.sides.player.reserve).not.toBe(state.sides.player.reserve);
    expect(clone.sides.player.deployed).not.toBe(state.sides.player.deployed);
    expect(clone.sides.player.visibility).not.toBe(state.sides.player.visibility);
    expect(clone.cardInstances).not.toBe(state.cardInstances);
  });

  it("isolates per-card-instance mutable substructures so clones cannot leak back into the source", () => {
    const state = makeBattleState();
    const clone = cloneBattleMutableState(state);

    const firstId = Object.keys(state.cardInstances)[0];
    const sourceInstance = state.cardInstances[firstId];
    const clonedInstance = clone.cardInstances[firstId];

    expect(clonedInstance).not.toBe(sourceInstance);
    expect(clonedInstance.definition).not.toBe(sourceInstance.definition);
    expect(clonedInstance.definition.tides).not.toBe(sourceInstance.definition.tides);
    expect(clonedInstance.markers).not.toBe(sourceInstance.markers);
    expect(clonedInstance.notes).not.toBe(sourceInstance.notes);
    expect(clonedInstance.provenance).not.toBe(sourceInstance.provenance);

    // Mutating the clone must not affect the source.
    clonedInstance.sparkDelta = 7;
    clonedInstance.markers.isPrevented = true;
    (clonedInstance.definition.tides as string[]).push("mutated");
    expect(sourceInstance.sparkDelta).toBe(0);
    expect(sourceInstance.markers.isPrevented).toBe(false);
    expect(sourceInstance.definition.tides).not.toContain("mutated");
  });

  it("preserves scalar fields, activeSide, and nextBattleCardOrdinal exactly", () => {
    const state = makeBattleState();
    state.turnNumber = 5;
    state.phase = "main";
    state.activeSide = "enemy";
    state.nextBattleCardOrdinal = 42;
    const clone = cloneBattleMutableState(state);

    expect(clone.turnNumber).toBe(5);
    expect(clone.phase).toBe("main");
    expect(clone.activeSide).toBe("enemy");
    expect(clone.nextBattleCardOrdinal).toBe(42);
    expect(clone.battleId).toBe(state.battleId);
  });
});

describe("allocateBattleCardInstance", () => {
  function makeDefinition(cardNumber: number): BattleDeckCardDefinition {
    return {
      sourceDeckEntryId: null,
      cardNumber,
      name: `Phase 2 Figment ${String(cardNumber)}`,
      battleCardKind: "character",
      subtype: "Figment",
      energyCost: 2,
      printedEnergyCost: 2,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      tides: ["alpha"],
      renderedText: "",
      imageNumber: cardNumber,
      transfiguration: null,
      isBane: false,
    };
  }

  it("assigns zero-padded ordinal ids that increase monotonically across calls", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const state = createInitialBattleState(battleInit);
    const baseline = state.nextBattleCardOrdinal;

    const firstId = allocateBattleCardInstance(state, {
      definition: makeDefinition(901),
      owner: "player",
      controller: "player",
      isRevealedToPlayer: true,
      provenance: {
        kind: "generated-figment",
        sourceBattleCardId: "bc_0001",
        chosenSpark: 3,
        chosenSubtype: "Figment",
        createdAtTurnNumber: 4,
        createdAtSide: "player",
        createdAtMs: 1_000,
      },
    });
    const secondId = allocateBattleCardInstance(state, {
      definition: makeDefinition(902),
      owner: "enemy",
      controller: "enemy",
      isRevealedToPlayer: false,
      provenance: {
        kind: "generated-figment",
        sourceBattleCardId: "bc_0002",
        chosenSpark: null,
        chosenSubtype: null,
        createdAtTurnNumber: 4,
        createdAtSide: "enemy",
        createdAtMs: 1_001,
      },
    });

    expect(firstId).toBe(`bc_${String(baseline).padStart(4, "0")}`);
    expect(secondId).toBe(`bc_${String(baseline + 1).padStart(4, "0")}`);
    expect(state.nextBattleCardOrdinal).toBe(baseline + 2);
    expect(firstId).not.toBe(secondId);

    const firstInstance = state.cardInstances[firstId];
    const secondInstance = state.cardInstances[secondId];
    expect(firstInstance.battleCardId).toBe(firstId);
    expect(secondInstance.battleCardId).toBe(secondId);
    expect(firstInstance.owner).toBe("player");
    expect(secondInstance.owner).toBe("enemy");
    expect(firstInstance.controller).toBe("player");
    expect(firstInstance.isRevealedToPlayer).toBe(true);
    expect(secondInstance.isRevealedToPlayer).toBe(false);
    expect(firstInstance.sparkDelta).toBe(0);
    expect(firstInstance.markers).toEqual({ isPrevented: false, isCopied: false });
    expect(firstInstance.notes).toEqual([]);
    expect(firstInstance.provenance.kind).toBe("generated-figment");
    expect(firstInstance.provenance.sourceBattleCardId).toBe("bc_0001");
  });

  it("preserves caller-provided definition and provenance references instead of cloning them", () => {
    const battleInit = createBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
    });
    const state = createInitialBattleState(battleInit);
    const definition = makeDefinition(903);
    const provenance = {
      kind: "generated-figment" as const,
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    };

    const id = allocateBattleCardInstance(state, {
      definition,
      owner: "player",
      controller: "player",
      isRevealedToPlayer: true,
      provenance,
    });

    expect(state.cardInstances[id].definition).toBe(definition);
    expect(state.cardInstances[id].provenance).toBe(provenance);
  });
});
