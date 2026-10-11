/**
 * Continuous effects (engine-design § Continuous effects): the layer order,
 * timestamp order and its ties, static abilities, base-spark setting, type
 * changes, keyword grants and losses, values locked at resolution
 * (RD-hv-7x4l.7-1), "until the opponent pays" changes sharing one payable
 * effect, memoization, and the view.
 */
import { describe, expect, it } from "vitest";
import { matchingCharacters } from "../dsl/selectors";
import { hasKeyword } from "../rules/keywords";
import { serializeState } from "../state/hash";
import type { InstanceId } from "../state/ids";
import { NO_PROMPTS } from "../steps/sources";
import { placeFigment } from "../testing/board";
import { CONTINUOUS_EMBLEMS, CONTINUOUS_DREAMSIGN } from "../testing/continuous-cards";
import { DSL } from "../testing/dsl-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { characteristics, characteristicsOf, rememberCharacteristics } from "./characteristics";
import { Layers } from "./layers";
import {
  enemyBaseThree,
  awakenedBanner,
  selfAwakened,
  weakenUntilPays,
  weakenThenDissolve,
  engine,
  catalog,
  c,
  v,
  deck,
  board,
  spark,
  float,
  play,
} from "./continuous.fixtures";

describe("layer order", () => {
  it("sets base spark before every spark modification, whatever their timestamps", () => {
    for (const setAt of [1, 9]) {
      const { state, ids } = board({ player: { front: [v.vanilla3.id] } });
      const id = ids.player.front[0]!;
      state.instances[id].status.gainedSpark = 2;
      float(state, { kind: "spark", instance: id, amount: 1 }, 5);
      float(state, { kind: "baseSpark", instance: id, value: 7 }, setAt);
      expect(spark(state, id)).toBe(7 + 2 + 1);
      expect(characteristicsOf(state, catalog, id).baseSpark).toBe(7);
    }
  });

  it("changes types before an anthem reads them", () => {
    const { state, ids } = board({ player: { back: [c.warriorAnthem.id], front: [c.supporter.id] } });
    const mage = ids.player.front[0]!;
    expect(spark(state, mage)).toBe(0);
    float(state, { kind: "allTypes", instance: mage }, 99);
    expect(characteristicsOf(state, catalog, mage).allTypes).toBe(true);
    expect(spark(state, mage)).toBe(1);
    // A static type change applies before the anthem too, to the anthem's own Mage source as well.
    const statics = board({ player: { back: [c.warriorAnthem.id, c.everyType.id] } });
    expect(statics.ids.player.back.map((id) => spark(statics.state, id))).toEqual([2, 2]);
  });

  it("applies keyword gains and losses in timestamp order, the latest deciding", () => {
    const { state, ids } = board({ enemy: { front: [v.vengeful1.id] } });
    const id = ids.enemy.front[0]!;
    expect(hasKeyword(state, catalog, id, "vengeful")).toBe(true);
    float(state, { kind: "keyword", instance: id, keyword: "vengeful", gains: false }, 3);
    float(state, { kind: "keyword", instance: id, keyword: "vengeful", gains: true }, 2);
    expect(hasKeyword(state, catalog, id, "vengeful")).toBe(false);
    float(state, { kind: "keyword", instance: id, keyword: "vengeful", gains: true }, 4);
    expect(hasKeyword(state, catalog, id, "vengeful")).toBe(true);
  });

  it("breaks timestamp ties with floating effects in creation order", () => {
    const { state, ids } = board({ player: { front: [v.vanilla1.id] } });
    const id = ids.player.front[0]!;
    float(state, { kind: "baseSpark", instance: id, value: 1 }, 4);
    float(state, { kind: "baseSpark", instance: id, value: 6 }, 4);
    expect(spark(state, id)).toBe(6);
    state.floating.reverse();
    expect(spark(state, id)).toBe(1);
  });

  it("breaks timestamp ties with static abilities first, then floating effects", () => {
    const { state, ids } = board({ player: { back: [c.enemyBaseOne.id] }, enemy: { front: [v.vanilla5.id] } });
    const enemy = ids.enemy.front[0]!;
    state.instances[ids.player.back[0]!].enteredZoneAt = 5;
    expect(spark(state, enemy)).toBe(1);
    const tied = float(state, { kind: "baseSpark", instance: enemy, value: 6 }, 5);
    expect(spark(state, enemy)).toBe(6);
    state.floating = state.floating.map((effect) => (effect.id === tied ? { ...effect, timestamp: 4 } : effect));
    expect(spark(state, enemy)).toBe(1);
  });

  it("orders static abilities by timestamp, and ties between them by source order", () => {
    const { state, ids } = board({ player: { back: [enemyBaseThree.id, c.enemyBaseOne.id] }, enemy: { front: [v.vanilla5.id] } });
    const enemy = ids.enemy.front[0]!;
    // Both entered at the same moment: the later instance applies last.
    expect(spark(state, enemy)).toBe(1);
    state.instances[ids.player.back[0]!].enteredZoneAt = 2;
    state.instances[ids.player.back[1]!].enteredZoneAt = 1;
    expect(spark(state, enemy)).toBe(3);
  });

  it("clamps spark at 0 for comparisons, without clamping the modifications themselves", () => {
    const { state, ids } = board({ player: { front: [v.vanilla1.id] } });
    const id = ids.player.front[0]!;
    float(state, { kind: "spark", instance: id, amount: -3 }, 1);
    // 1✦ - 3 is below 0.
    expect(spark(state, id)).toBe(0);
    float(state, { kind: "spark", instance: id, amount: 2 }, 2);
    expect(spark(state, id)).toBe(0);
    expect(matchingCharacters(state, catalog, { controller: "you", sparkAtMost: 0 }, "player", { kind: "avatar", side: "player" })).toEqual([id]);
    float(state, { kind: "spark", instance: id, amount: 1 }, 3);
    expect(spark(state, id)).toBe(1);
  });
});

describe("static abilities", () => {
  it("apply while their source is in play, and an emblem's always", () => {
    const { state, ids } = board({ player: { back: [c.warriorAnthem.id], front: [v.vanilla1.id] }, enemy: { front: [v.vanilla1.id] } });
    const ally = ids.player.front[0]!;
    expect(spark(state, ally)).toBe(2);
    expect(spark(state, ids.enemy.front[0])).toBe(1);
    const anthem = ids.player.back[0]!;
    state.sides.player.backRank[0] = null;
    state.instances[anthem].zone = "void";
    state.sides.player.void.push(anthem);
    expect(spark(state, ally)).toBe(1);
    state.sides.player.avatar = { id: (CONTINUOUS_EMBLEMS.avatars ?? [])[0].id, exhausted: false };
    expect(spark(state, ally)).toBe(2);
  });

  it("read their values live", () => {
    const { state, ids } = board({ player: { back: [c.crowdStrength.id, v.vanilla1.id, v.vanilla1.id] } });
    expect(spark(state, ids.player.back[0])).toBe(2);
    state.sides.player.backRank[2] = null;
    state.instances[ids.player.back[2]!].zone = "void";
    state.sides.player.void.push(ids.player.back[2]!);
    expect(spark(state, ids.player.back[0])).toBe(1);
  });

  it("apply Awakened to a character as it enters play, from another source or its own", () => {
    const covered = board({ player: { back: [awakenedBanner.id], hand: [v.vanilla1.id], energy: 1, deck }, enemy: { deck } });
    const entering = covered.ids.player.hand[0];
    const entered = play(covered.state, "player", entering).state;
    expect(entered.instances[entering]).toMatchObject({ zone: "play", status: { exhausted: false } });

    const own = board({ player: { hand: [selfAwakened.id, v.vanilla1.id], energy: 2, deck }, enemy: { deck } });
    const [awakened, plain] = own.ids.player.hand;
    let next = play(own.state, "player", awakened).state;
    next = play(next, "player", plain).state;
    expect(next.instances[awakened]).toMatchObject({ zone: "play", status: { exhausted: false } });
    expect(next.instances[plain]).toMatchObject({ zone: "play", status: { exhausted: true } });
  });

  it("grant keywords that the rules read", () => {
    const { state, ids } = board({ player: { back: [c.vengefulBanner.id, v.vanilla1.id] } });
    expect(hasKeyword(state, catalog, ids.player.back[1]!, "vengeful")).toBe(true);
    expect(hasKeyword(state, catalog, ids.player.back[0]!, "vengeful")).toBe(false);
  });
});

describe("resolving continuous effects", () => {
  it("share one payable effect across every change of an 'until the opponent pays' node, ended by one payment", () => {
    const { state, ids } = board({ player: { hand: [weakenUntilPays.id], deck }, enemy: { front: [v.vanilla3.id, v.vanilla1.id], energy: 1, deck } });
    const enemies = ids.enemy.front.filter((id): id is InstanceId => id !== null);
    const result = play(state, "player", ids.player.hand[0]);
    let current = result.state;
    expect(current.payable).toHaveLength(1);
    const [payable] = current.payable;
    expect(payable).toMatchObject({ payer: "enemy", cost: 1, affects: enemies });
    expect(result.events.filter((entry) => entry.kind === "payableEffectRegistered")).toHaveLength(1);
    expect(current.floating).toHaveLength(4);
    expect(current.floating.every((effect) => effect.expiry.at === "paid" && effect.expiry.effect === payable.id)).toBe(true);
    expect(enemies.map((id) => spark(current, id))).toEqual([2, 0]);
    current = passUntil(engine, current, at(engine, "enemy", "day")).state;
    current = engine.apply(current, "enemy", { kind: "payToEnd", effect: payable.id }, NO_PROMPTS).state;
    expect(current.payable).toEqual([]);
    expect(current.floating).toEqual([]);
    expect(enemies.map((id) => spark(current, id))).toEqual([3, 1]);
    expect(characteristicsOf(current, catalog, enemies[0]).allTypes).toBe(false);
  });

  it("drop a created character that ceases to exist from a payable effect, ending the effect once it changes nothing", () => {
    const { state, ids } = board({ player: { hand: [weakenUntilPays.id, DSL.dissolveEnemy.id, DSL.dissolveEnemy.id], energy: 4, deck }, enemy: { deck } });
    const copies = [0, 1].map((index) => placeFigment(state, "enemy", { rank: "front", index }, { kind: "card", cardId: v.vanilla3.id }));
    const [, first, second] = ids.player.hand;
    let current = play(state, "player", ids.player.hand[0]).state;
    const [payable] = current.payable;
    expect(payable.affects).toEqual(copies);
    current = play(current, "player", first, [[copies[0]]]).state;
    expect(current.instances[copies[0]]).toBeUndefined();
    expect(current.payable).toEqual([{ ...payable, affects: [copies[1]] }]);
    const last = play(current, "player", second, [[copies[1]]]);
    expect(last.state.payable).toEqual([]);
    expect(last.state.floating).toEqual([]);
    expect(last.events).toContainEqual({ kind: "payableEffectEnded", effect: payable.id, payer: "enemy", paid: false });
  });

  it("register no payable effect when every change of the node ended before it finished resolving", () => {
    const { state, ids } = board({ player: { hand: [weakenThenDissolve.id], deck }, enemy: { deck } });
    const created = placeFigment(state, "enemy", { rank: "front", index: 0 }, { kind: "card", cardId: v.vanilla3.id });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.instances[created]).toBeUndefined();
    expect(result.state.payable).toEqual([]);
    expect(result.state.floating).toEqual([]);
    expect(result.events.some((entry) => entry.kind === "payableEffectRegistered")).toBe(false);
  });

  it("set base spark for a duration, and lose keywords and gain types until end of turn", () => {
    const { state, ids } = board({ player: { hand: [c.baseSevenThisTurn.id, c.disarm.id, c.shapeshift.id], back: [v.vanilla1.id], energy: 1, deck }, enemy: { front: [v.vengeful1.id], deck } });
    const mine = ids.player.back[0]!;
    const theirs = ids.enemy.front[0]!;
    let next = play(state, "player", ids.player.hand[0], [[mine]]).state;
    expect(spark(next, mine)).toBe(7);
    next = play(next, "player", ids.player.hand[1], [[theirs]]).state;
    expect(hasKeyword(next, catalog, theirs, "vengeful")).toBe(false);
    next = play(next, "player", ids.player.hand[2], [[mine]]).state;
    expect(characteristicsOf(next, catalog, mine).allTypes).toBe(true);
    expect(next.floating.map((effect) => effect.expiry)).toEqual([{ at: "endOfTurn" }, { at: "endOfTurn" }, { at: "endOfTurn" }]);
  });

  it("locks the characters and the value of '+X✦ where X is …' as the effect resolves (RD-hv-7x4l.7-1)", () => {
    const { state, ids } = board({ player: { hand: [c.spiritBond.id], back: [v.vanilla1.id, v.vanilla1.id], energy: 1, deck }, enemy: { deck } });
    const bonded = play(state, "player", ids.player.hand[0]).state;
    expect(ids.player.back.map((id) => spark(bonded, id))).toEqual([3, 3]);
    // A third character arrives: the value stays 2, and the newcomer gets nothing.
    const newcomer: InstanceId = `i${bonded.nextInstance}`;
    bonded.nextInstance += 1;
    bonded.instances[newcomer] = { ...bonded.instances[ids.player.back[0]!], id: newcomer, enteredZoneAt: bonded.clock + 1 };
    bonded.sides.player.backRank[2] = newcomer;
    expect([...ids.player.back, newcomer].map((id) => spark(bonded, id))).toEqual([3, 3, 1]);
  });
});

describe("memoization", () => {
  it("memoizes a committed state's evaluation per version, never across states", () => {
    const { state, ids } = board({ player: { back: [c.warriorAnthem.id], front: [v.vanilla1.id] } });
    const remembered = rememberCharacteristics(state, catalog);
    expect(characteristics(state, catalog)).toBe(remembered);
    // Another state at the same version computes its own characteristics.
    const other = structuredClone(state);
    other.sides.player.backRank[0] = null;
    other.instances[ids.player.back[0]!].zone = "void";
    other.sides.player.void.push(ids.player.back[0]!);
    expect(characteristics(other, catalog)).not.toBe(remembered);
    expect(spark(other, ids.player.front[0])).toBe(1);
    expect(spark(state, ids.player.front[0])).toBe(2);
    // A new version of the same object (as a step's work copy becomes when it commits) is evaluated afresh.
    state.version += 1;
    expect(characteristics(state, catalog)).not.toBe(remembered);
  });

  it("matches a fresh evaluation and never enters the serialized state", () => {
    const { state, ids } = board({ player: { back: [c.supporter.id], front: [v.vanilla1.id] } });
    const before = serializeState(state);
    const remembered = rememberCharacteristics(state, catalog);
    expect(remembered.of(ids.player.front[0]!)).toEqual(new Layers(state, catalog).of(ids.player.front[0]!));
    expect(serializeState(state)).toBe(before);
  });
});

describe("view", () => {
  it("shows effective spark, keywords, types, and cost", () => {
    const { state, ids } = board({
      player: { back: [c.vengefulBanner.id, c.everyType.id], front: [v.vanilla1.id], hand: [v.vanilla3.id], avatar: (CONTINUOUS_EMBLEMS.avatars ?? [])[0].id, dreamsigns: [CONTINUOUS_DREAMSIGN.discount.id] },
    });
    const seen = engine.view(state, "player");
    expect(seen.instances[ids.player.front[0]!]?.characteristics).toMatchObject({ spark: 2, keywords: ["vengeful"], allTypes: true });
    expect(seen.instances[ids.player.hand[0]]?.characteristics).toMatchObject({ cost: 2, spark: 3 });
  });
});
