import { describe, expect, it } from "vitest";
import { createTestBattleInit } from "../../testing/create-battle-init";
import { makeBattleTestCardDatabase, makeBattleTestDreamAvatars, makeBattleTestSite, makeBattleTestState } from "../test-support";
import type { BattleDeckCardDefinition } from "../types";
import {
  allocateBattleCardInstance,
  cloneBattleMutableState,
  createDefaultBattleCardStatus,
  createInitialBattleState,
} from "./create-initial-state";

describe("createInitialBattleState", () => {
  it("draws the configured opening hand size for both sides and seeds both sides at 2/2", () => {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    });

    const state = createInitialBattleState(battleInit);

    expect(state.battleId).toBe(battleInit.battleId);
    expect(state.activeSide).toBe("player");
    expect(state.turnNumber).toBe(1);
    expect(state.result).toBeNull();
    expect(state.forcedResult).toBeNull();
    // Energy starts at 0 for both sides; the active player's maximum ● is raised
    // by the Dreamwell card revealed when its Dreamwell phase resolves.
    expect(state.sides.player.currentEnergy).toBe(0);
    expect(state.sides.player.maxEnergy).toBe(0);
    expect(state.sides.enemy.currentEnergy).toBe(0);
    expect(state.sides.enemy.maxEnergy).toBe(0);
    expect(state.sides.player.hand).toHaveLength(battleInit.openingHandSize);
    expect(state.sides.enemy.hand).toHaveLength(battleInit.openingHandSize);
    expect(state.sides.player.deck).toHaveLength(
      battleInit.playerDeckOrder.length - battleInit.openingHandSize,
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
      state.sides.enemy.hand.every((battleCardId) => state.cardInstances[battleCardId]?.revealedTo?.player),
    ).toBe(false);
  });

  it("seeds the raw initial state with empty board and no automatic draw or refresh", () => {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    });

    const state = createInitialBattleState(battleInit);

    expect(state.activeSide).toBe("player");
    // The battle opens on the active player's Dreamwell phase (a surfaced stop).
    expect(state.phase).toBe("dreamwell");
    expect(state.turnNumber).toBe(1);
    // Energy starts at 0; the Dreamwell card raises maximum ● when revealed.
    expect(state.sides.player.currentEnergy).toBe(0);
    expect(state.sides.player.maxEnergy).toBe(0);
    expect(state.sides.enemy.currentEnergy).toBe(0);
    expect(state.sides.enemy.maxEnergy).toBe(0);
    expect(state.sides.player.hand).toHaveLength(battleInit.openingHandSize);
    expect(state.sides.enemy.hand).toHaveLength(battleInit.openingHandSize);
    // Empty board on both sides.
    for (const side of ["player", "enemy"] as const) {
      expect(state.sides[side].void).toEqual([]);
      expect(state.sides[side].banished).toEqual([]);
      expect(Object.values(state.sides[side].backRank).every((slot) => slot === null)).toBe(true);
      expect(Object.values(state.sides[side].frontRank).every((slot) => slot === null)).toBe(true);
    }
    expect(state).not.toHaveProperty("stack");
  });

  it("applies player-only Exploration opening-hand and starting-energy bonuses", () => {
    const baseInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    });
    const battleInit = {
      ...baseInit,
      openingHandSize: 7,
      enemyOpeningHandSize: 5,
      playerStartingEnergy: 2,
    };

    const state = createInitialBattleState(battleInit);

    expect(state.sides.player.hand).toHaveLength(7);
    expect(state.sides.enemy.hand).toHaveLength(5);
    expect(state.sides.player.currentEnergy).toBe(2);
    expect(state.sides.player.maxEnergy).toBe(2);
    expect(state.sides.enemy.currentEnergy).toBe(0);
    expect(state.sides.enemy.maxEnergy).toBe(0);
  });

  it("initializes per-side visibility flags required by the spec state model", () => {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    });
    const state = createInitialBattleState(battleInit);

    expect(state.sides.player.visibility).toEqual({});
    expect(state.sides.enemy.visibility).toEqual({});
  });
});

describe("cloneBattleMutableState", () => {
  function makeBattleState() {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
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
    expect(clone.sides.player.backRank).not.toBe(state.sides.player.backRank);
    expect(clone.sides.player.frontRank).not.toBe(state.sides.player.frontRank);
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
    expect(clonedInstance.status).not.toBe(sourceInstance.status);
    expect(clonedInstance.markers).not.toBe(sourceInstance.markers);
    expect(clonedInstance.notes).not.toBe(sourceInstance.notes);
    expect(clonedInstance.provenance).not.toBe(sourceInstance.provenance);

    // Mutating the clone must not affect the source.
    clonedInstance.sparkDelta = 7;
    clonedInstance.markers.isPrevented = true;
    clonedInstance.status.counters = 3;
    clonedInstance.status.isExhausted = true;
    expect(sourceInstance.sparkDelta).toBe(0);
    expect(sourceInstance.markers.isPrevented).toBe(false);
    expect(sourceInstance.status.counters).toBe(0);
    expect(sourceInstance.status.isExhausted).toBe(false);
  });

  it("preserves scalar fields, activeSide, and nextBattleCardOrdinal exactly", () => {
    const state = makeBattleState();
    state.turnNumber = 5;
    state.phase = "day";
    state.activeSide = "enemy";
    state.nextBattleCardOrdinal = 42;
    const clone = cloneBattleMutableState(state);

    expect(clone.turnNumber).toBe(5);
    expect(clone.phase).toBe("day");
    expect(clone.activeSide).toBe("enemy");
    expect(clone.nextBattleCardOrdinal).toBe(42);
    expect(clone.battleId).toBe(state.battleId);
  });
});

describe("allocateBattleCardInstance", () => {
  function makeDefinition(cardNumber: number): BattleDeckCardDefinition {
    return {
      sourceDeckEntryId: null,
      cardId: "",
      cardNumber,
      name: `Phase 2 Figment ${String(cardNumber)}`,
      battleCardKind: "character",
      subtype: "Figment",
      energyCost: 2,
      printedEnergyCost: 2,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: cardNumber,
      transfiguration: null,
      isBane: false,
    };
  }

  it("assigns zero-padded ordinal ids that increase monotonically across calls", () => {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
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
    expect(firstInstance.revealedTo).toEqual({ player: true, enemy: false });
    expect(secondInstance.revealedTo).toEqual({ player: false, enemy: true });
    expect(firstInstance.sparkDelta).toBe(0);
    expect(firstInstance.status).toEqual({
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedVengeful: false,
      grantedAwakened: false,
      temporaryReclaimUntilEnding: null,
      temporaryBanishUntilEnding: null,
    });
    // Each allocated instance must own a fresh status object (no shared aliasing
    // that would corrupt undo via history snapshots).
    expect(firstInstance.status).not.toBe(secondInstance.status);
    expect(firstInstance.markers).toEqual({ isPrevented: false, isCopied: false });
    expect(firstInstance.notes).toEqual([]);
    expect(firstInstance.provenance.kind).toBe("generated-figment");
    expect(firstInstance.provenance.sourceBattleCardId).toBe("bc_0001");
  });

  it("preserves caller-provided definition and provenance references instead of cloning them", () => {
    const battleInit = createTestBattleInit({
      battleEntryKey: "site-7::2::dreamscape-2",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
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

describe("createDefaultBattleCardStatus", () => {
  it("returns an all-false / zero status with every documented field", () => {
    expect(createDefaultBattleCardStatus()).toEqual({
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedVengeful: false,
      grantedAwakened: false,
      temporaryReclaimUntilEnding: null,
      temporaryBanishUntilEnding: null,
    });
  });

  it("returns a fresh object on each call so instances never alias a shared status", () => {
    const first = createDefaultBattleCardStatus();
    const second = createDefaultBattleCardStatus();
    expect(first).not.toBe(second);
    first.counters = 5;
    expect(second.counters).toBe(0);
  });
});
