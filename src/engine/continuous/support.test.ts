/**
 * Support (rules § The Play Area; C9): the adjacency geometry and the
 * contracts of supported-character bonuses, ported from the prototype's
 * Support tests and rewritten against the layer evaluation with synthetic
 * fixtures.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { energy } from "../dsl/builders";
import { createEngine } from "../engine";
import { effectiveSpark } from "../rules/spark";
import { serializeState } from "../state/hash";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS } from "../steps/sources";
import { boardState, type SideSetup } from "../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS } from "../testing/continuous-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { supportedBy, supportedFrontIndices, supportersOf, supportingBackIndices } from "./support";

/** A vanilla 1✦ Mage. */
const mage: EngineCardDefinition = {
  id: syntheticId(0xa80),
  cardType: "character",
  costs: [energy(1)],
  spark: 1,
  subtype: "Mage",
  speed: "standard",
  status: "vanilla",
  abilities: () => [],
};

const engine = createEngine(testCatalog([...CONTINUOUS_CARDS, mage]));
const c = CONTINUOUS;
const v = SYNTHETIC;

function board(player: SideSetup) {
  return boardState(engine.catalog, { active: "player", phase: "day", player });
}

function spark(state: BattleState, id: InstanceId | null | undefined): number {
  if (id === null || id === undefined) throw new Error("no character");
  return effectiveSpark(state, engine.catalog, id);
}

describe("Support adjacency", () => {
  it("maps each back-rank position to the front-rank positions it supports (Bi supports F(i-1) and Fi)", () => {
    expect(supportedFrontIndices(0)).toEqual([0]);
    expect(supportedFrontIndices(1)).toEqual([0, 1]);
    expect(supportedFrontIndices(2)).toEqual([1, 2]);
    expect(supportedFrontIndices(5)).toEqual([4, 5]);
    expect(supportedFrontIndices(9)).toEqual([8]);
  });

  it("inverts to the back-rank positions supporting each front-rank position (Fj by Bj and B(j+1))", () => {
    expect(supportingBackIndices(0)).toEqual([0, 1]);
    expect(supportingBackIndices(3)).toEqual([3, 4]);
    expect(supportingBackIndices(8)).toEqual([8, 9]);
    for (let back = 0; back < 10; back++) {
      for (const front of supportedFrontIndices(back)) expect(supportingBackIndices(front)).toContain(back);
    }
  });

  it("counts the characters supporting a front-rank character, with or without Support, and none in the back rank (C9)", () => {
    const { state, ids } = board({ back: [null, v.vanilla1.id, v.vanilla2.id], front: [null, c.bolstered.id] });
    const bolstered = ids.player.front[1]!;
    expect(supportersOf(state, bolstered)).toEqual([ids.player.back[1], ids.player.back[2]]);
    expect(supportedBy(state, ids.player.back[1]!)).toEqual([bolstered]);
    expect(spark(state, bolstered)).toBe(1 + 2 * 2);
    state.sides.player.backRank[2] = null;
    state.instances[ids.player.back[2]!].zone = "void";
    state.sides.player.void.push(ids.player.back[2]!);
    expect(spark(state, bolstered)).toBe(1 + 2);
    // Moved to the back rank, nothing supports it.
    state.sides.player.frontRank[1] = null;
    state.sides.player.backRank[5] = bolstered;
    expect(supportersOf(state, bolstered)).toEqual([]);
    expect(spark(state, bolstered)).toBe(1);
  });
});

describe("Support benefits", () => {
  it("a B1 supporter gives +2✦ to F0 and F1 only, and nothing to itself", () => {
    const { state, ids } = board({ back: [null, c.supporter.id], front: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id, v.vanilla1.id] });
    expect(ids.player.front.map((id) => spark(state, id))).toEqual([3, 3, 1, 1]);
    expect(spark(state, ids.player.back[1])).toBe(0);
  });

  it("a supporter in the front rank supports nothing", () => {
    const { state, ids } = board({ front: [c.supporter.id, v.vanilla1.id] });
    expect(spark(state, ids.player.front[1])).toBe(1);
    expect(spark(state, ids.player.front[0])).toBe(0);
  });

  it("a supporter's selector filters the supported characters", () => {
    const { state, ids } = board({ back: [null, c.spiritSupporter.id], front: [c.spiritSupporter.id, v.vanilla1.id] });
    // F0 is a Spirit Animal (0✦, itself a front-rank supporter that supports nothing); F1 is a Warrior.
    expect(spark(state, ids.player.front[0])).toBe(1);
    expect(spark(state, ids.player.front[1])).toBe(1);
  });

  it("a supporter's benefit reads its value live: +1✦ for each warrior its controller has in play", () => {
    const { state, ids } = board({ back: [v.vanilla1.id, c.warbandSupporter.id, v.vanilla1.id, mage.id], front: [v.vanilla1.id] });
    // Warriors: B0, B1 (the supporter), B2, and F0.
    expect(spark(state, ids.player.front[0])).toBe(1 + 4);
    const gone = ids.player.back[0]!;
    state.sides.player.backRank[0] = null;
    state.instances[gone].zone = "void";
    state.sides.player.void.push(gone);
    expect(spark(state, ids.player.front[0])).toBe(1 + 3);
  });

  it("two supporters covering the same position stack", () => {
    const { state, ids } = board({ back: [null, c.supporter.id, c.supporter.id], front: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id] });
    expect(ids.player.front.map((id) => spark(state, id))).toEqual([3, 5, 3]);
  });

  it("drops the benefit as soon as the character or the supporter moves out of reach", () => {
    const { state, ids } = board({ back: [null, c.supporter.id], front: [v.vanilla1.id] });
    const ally = ids.player.front[0]!;
    expect(spark(state, ally)).toBe(3);
    state.sides.player.frontRank[0] = null;
    state.sides.player.frontRank[3] = ally;
    expect(spark(state, ally)).toBe(1);
    state.sides.player.frontRank[3] = null;
    state.sides.player.frontRank[1] = ally;
    expect(spark(state, ally)).toBe(3);
    // The supporter moves to the front rank.
    state.sides.player.backRank[1] = null;
    state.sides.player.frontRank[0] = ids.player.back[1]!;
    expect(spark(state, ally)).toBe(1);
  });

  it("follows a reposition made through the engine, and reading it never changes the state", () => {
    const { state, ids } = board({ back: [null, c.supporter.id, v.vanilla1.id] });
    const ally = ids.player.back[2]!;
    expect(spark(state, ally)).toBe(1);
    const before = serializeState(state);
    spark(state, ally);
    engine.view(state, "player");
    expect(serializeState(state)).toBe(before);
    const moved = engine.apply(state, "player", { kind: "reposition", card: ally, to: { rank: "front", index: 1 } }, NO_PROMPTS).state;
    expect(spark(moved, ally)).toBe(3);
    expect(engine.view(moved, "player").instances[ally]?.characteristics.spark).toBe(3);
  });
});
