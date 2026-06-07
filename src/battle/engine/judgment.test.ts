import { describe, expect, it } from "vitest";
import { resolveJudgment } from "./judgment";
import { allocateBattleCardInstance } from "../state/create-initial-state";
import type {
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";

function makeEmptySide(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    frontRank: { F0: null, F1: null, F2: null, F3: null },
    fatigueCount: 0,
  };
}

function makeBareState(): BattleMutableState {
  return {
    battleId: "battle-judgment-test",
    activeSide: "player",
    turnNumber: 1,
    phase: "challenge",
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      player: makeEmptySide(),
      enemy: makeEmptySide(),
    },
    cardInstances: {},
  };
}

function makeCharacterDefinition(
  name: string,
  printedSpark: number,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardNumber: 0,
    name,
    battleCardKind: "character",
    subtype: "Warrior",
    energyCost: 1,
    printedEnergyCost: 1,
    printedSpark,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
  };
}

function questDeckProvenance(): BattleCardProvenance {
  return {
    kind: "quest-deck",
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: null,
    createdAtSide: null,
    createdAtMs: null,
  };
}

function figmentProvenance(subtype: string, chosenSpark: number): BattleCardProvenance {
  return {
    kind: "generated-figment",
    sourceBattleCardId: null,
    chosenSpark,
    chosenSubtype: subtype,
    createdAtTurnNumber: 1,
    createdAtSide: "player",
    createdAtMs: 1,
  };
}

interface PlacementSpec {
  name: string;
  spark: number;
  slotId: FrontRankSlotId;
  figmentCount?: number;
  subtype?: string;
}

/**
 * Builds a minimal challenge-phase state placing the supplied character
 * instances into each side's deploy slots with the given printed spark, and
 * returns the allocated battleCardIds keyed by name for assertions.
 */
function makeJudgmentState(
  activeSide: BattleSide,
  placements: {
    player?: PlacementSpec[];
    enemy?: PlacementSpec[];
  },
): { state: BattleMutableState; ids: Record<string, string> } {
  const state = makeBareState();
  state.activeSide = activeSide;
  const ids: Record<string, string> = {};

  const place = (side: BattleSide, specs: PlacementSpec[] | undefined): void => {
    for (const spec of specs ?? []) {
      const isFigment = spec.figmentCount !== undefined;
      const subtype = spec.subtype ?? "Warrior";
      const battleCardId = allocateBattleCardInstance(state, {
        definition: {
          ...makeCharacterDefinition(spec.name, spec.spark),
          subtype,
        },
        owner: side,
        controller: side,
        isRevealedToPlayer: true,
        provenance: isFigment
          ? figmentProvenance(subtype, spec.spark)
          : questDeckProvenance(),
      });
      if (isFigment) {
        state.cardInstances[battleCardId].figments = Array.from(
          { length: spec.figmentCount ?? 1 },
          () => spec.spark,
        );
      }
      state.sides[side].frontRank[spec.slotId] = battleCardId;
      ids[spec.name] = battleCardId;
    }
  };

  place("player", placements.player);
  place("enemy", placements.enemy);
  return { state, ids };
}

describe("resolveJudgment", () => {
  it("dissolves the lower-spark defender without scoring when both are present", () => {
    // Catches incorrect combat math: a defended challenger does not score.
    const { state, ids } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 4, slotId: "F0" }],
      enemy: [{ name: "defender", spark: 3, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(proposal.resolution.playerScoreDelta).toBe(0);
    expect(proposal.resolution.enemyScoreDelta).toBe(0);
    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F0");
    expect(lane).toMatchObject({
      slotId: "F0",
      playerSpark: 4,
      enemySpark: 3,
      winner: "player",
      scoreDelta: 0,
    });
    // The defender dissolves into the enemy void; the challenger survives.
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.defender,
      destination: { side: "enemy", zone: "void" },
    });
    expect(
      proposal.edits.some(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === ids.challenger,
      ),
    ).toBe(false);
  });

  it("dissolves both characters on a spark tie", () => {
    const { state, ids } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 3, slotId: "F0" }],
      enemy: [{ name: "defender", spark: 3, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(proposal.resolution.playerScoreDelta).toBe(0);
    expect(proposal.resolution.enemyScoreDelta).toBe(0);
    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F0");
    expect(lane).toMatchObject({ winner: null, scoreDelta: 0 });
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.challenger,
      destination: { side: "player", zone: "void" },
    });
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.defender,
      destination: { side: "enemy", zone: "void" },
    });
  });

  it("scores an unpaired challenger's spark for the active side", () => {
    const { state, ids } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 4, slotId: "F1" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(proposal.resolution.playerScoreDelta).toBe(4);
    expect(proposal.resolution.enemyScoreDelta).toBe(0);
    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F1");
    expect(lane).toMatchObject({
      slotId: "F1",
      playerSpark: 4,
      enemySpark: 0,
      winner: null,
      scoreDelta: 4,
    });
    expect(proposal.edits).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 4,
    });
    // Nobody dissolves.
    expect(
      proposal.edits.some((edit) => edit.kind === "MOVE_CARD_TO_ZONE"),
    ).toBe(false);
    void ids;
  });

  it("does nothing in a lane where only the opposing defender is present", () => {
    const { state } = makeJudgmentState("player", {
      enemy: [{ name: "lonelyDefender", spark: 5, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(proposal.resolution.playerScoreDelta).toBe(0);
    expect(proposal.resolution.enemyScoreDelta).toBe(0);
    expect(proposal.edits).toHaveLength(0);
    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F0");
    expect(lane).toMatchObject({
      playerSpark: 0,
      enemySpark: 5,
      winner: null,
      scoreDelta: 0,
    });
  });

  it("adds support contribution before comparing sparks", () => {
    // Catches support not being added before the comparison: a base-3 challenger
    // with +2 support beats a 4-spark defender.
    const { state, ids } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 3, slotId: "F0" }],
      enemy: [{ name: "defender", spark: 4, slotId: "F0" }],
    });

    const proposal = resolveJudgment({
      state,
      activeSide: "player",
      supportContribution: new Map([[ids.challenger, 2]]),
    });

    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F0");
    expect(lane).toMatchObject({
      playerSpark: 5,
      enemySpark: 4,
      winner: "player",
      scoreDelta: 0,
    });
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.defender,
      destination: { side: "enemy", zone: "void" },
    });
    expect(
      proposal.edits.some(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === ids.challenger,
      ),
    ).toBe(false);
  });

  it("dissolves a whole figment stack only when the loss count covers the stack", () => {
    // Figment top-down resolution (rules §Figments). Five 1-spark figments
    // (total 5) against a 5-spark defender: selectFigmentChallengeLossCount
    // returns 5 (>= count), so the whole stack dissolves and the 5-spark
    // defender also dissolves on the tie.
    const { state, ids } = makeJudgmentState("player", {
      player: [
        { name: "stack", spark: 1, slotId: "F0", figmentCount: 5, subtype: "Shadow" },
      ],
      enemy: [{ name: "defender", spark: 5, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    const lane = proposal.resolution.lanes.find((entry) => entry.slotId === "F0");
    // Stack total spark = 5.
    expect(lane?.playerSpark).toBe(5);
    expect(lane?.enemySpark).toBe(5);
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.stack,
      destination: { side: "player", zone: "void" },
    });
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.defender,
      destination: { side: "enemy", zone: "void" },
    });
  });

  it("leaves a figment stack in place when the loss count is below its size", () => {
    // Three 2-spark figments (total 6) against a 3-spark defender:
    // selectFigmentChallengeLossCount returns 2 (< 3), so the stack survives;
    // the 3-spark defender dissolves because the stack total (6) exceeds it.
    const { state, ids } = makeJudgmentState("player", {
      player: [
        { name: "stack", spark: 2, slotId: "F0", figmentCount: 3, subtype: "Shadow" },
      ],
      enemy: [{ name: "defender", spark: 3, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(
      proposal.edits.some(
        (edit) =>
          edit.kind === "MOVE_CARD_TO_ZONE" && edit.battleCardId === ids.stack,
      ),
    ).toBe(false);
    expect(proposal.edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.defender,
      destination: { side: "enemy", zone: "void" },
    });
  });

  it("returns edits that exactly match the resolution", () => {
    // Catches display/state divergence: the edits must contain exactly the
    // dissolve moves plus one ADJUST_SCORE equal to the active score delta.
    const { state, ids } = makeJudgmentState("player", {
      player: [
        { name: "winner", spark: 4, slotId: "F0" },
        { name: "unpaired", spark: 2, slotId: "F2" },
      ],
      enemy: [{ name: "loser", spark: 3, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(proposal.resolution.playerScoreDelta).toBe(2);
    expect(proposal.resolution.enemyScoreDelta).toBe(0);

    const adjustScoreEdits = proposal.edits.filter(
      (edit) => edit.kind === "ADJUST_SCORE",
    );
    expect(adjustScoreEdits).toHaveLength(1);
    expect(adjustScoreEdits[0]).toEqual({
      kind: "ADJUST_SCORE",
      side: "player",
      amount: 2,
    });

    const moveEdits = proposal.edits.filter(
      (edit) => edit.kind === "MOVE_CARD_TO_ZONE",
    );
    expect(moveEdits).toHaveLength(1);
    expect(moveEdits[0]).toEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: ids.loser,
      destination: { side: "enemy", zone: "void" },
    });
    void ids.winner;
    void ids.unpaired;
  });

  it("does not emit an ADJUST_SCORE edit when nothing scores", () => {
    const { state } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 4, slotId: "F0" }],
      enemy: [{ name: "defender", spark: 3, slotId: "F0" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "player" });

    expect(
      proposal.edits.some((edit) => edit.kind === "ADJUST_SCORE"),
    ).toBe(false);
  });

  it("does not mutate the input state", () => {
    const { state } = makeJudgmentState("player", {
      player: [{ name: "challenger", spark: 4, slotId: "F0" }],
      enemy: [{ name: "defender", spark: 3, slotId: "F0" }],
    });
    const before = JSON.stringify(state);

    resolveJudgment({ state, activeSide: "player" });

    expect(JSON.stringify(state)).toBe(before);
  });

  it("scores for the enemy side when the enemy is the active side", () => {
    const { state } = makeJudgmentState("enemy", {
      enemy: [{ name: "challenger", spark: 5, slotId: "F1" }],
    });

    const proposal = resolveJudgment({ state, activeSide: "enemy" });

    expect(proposal.resolution.enemyScoreDelta).toBe(5);
    expect(proposal.resolution.playerScoreDelta).toBe(0);
    expect(proposal.edits).toContainEqual({
      kind: "ADJUST_SCORE",
      side: "enemy",
      amount: 5,
    });
  });
});
