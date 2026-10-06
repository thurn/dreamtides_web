/**
 * Continuous effects (engine-design § Continuous effects): the layer order,
 * timestamp order and its ties, anthems and other static abilities,
 * base-spark setting, type changes, keyword grants and losses, cost
 * modifications with "next card" modifiers, values locked at resolution
 * (RD-hv-7x4l.7-1), "until the opponent pays" changes sharing one payable
 * effect, memoization, and the view.
 */
import { describe, expect, it } from "vitest";
import { printedCard, type EngineCardDefinition } from "../catalog";
import { additionalCost, all, characterYouControl, costPaid, enemyCharacter, energy, energyX, event, optionalCost, self, staticAbility } from "../dsl/builders";
import { untilOpponentPays } from "../dsl/triggers";
import type { AbilityList } from "../dsl/types";
import { matchingCharacters } from "../dsl/selectors";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { Answer } from "../prompts/types";
import { hasKeyword } from "../rules/keywords";
import { effectiveSpark } from "../rules/spark";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { serializeState, stateHash } from "../state/hash";
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState, ContinuousChange } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS, CONTINUOUS_EMBLEMS, CONTINUOUS_DREAMSIGN } from "../testing/continuous-cards";
import { DSL, DSL_CARDS } from "../testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { characteristics, characteristicsOf, rememberCharacteristics } from "./characteristics";
import { adjustedEnergy, costModifier } from "./costs";
import { Layers } from "./layers";

/** "Enemies have base ✦ 3": a second base-setting static, for ties between static abilities. */
const enemyBaseThree: EngineCardDefinition = {
  id: syntheticId(0xa81),
  cardType: "character",
  costs: [energy(3)],
  spark: 1,
  subtype: "Mage",
  speed: "standard",
  keywords: [],
  status: "authored",
  abilities: () => [staticAbility(p.setBaseSpark(all(enemyCharacter()), 3))],
};

/** "2 X: …" — a 2● event with an X part, to show cost modifications apply to the total. */
const twoPlusX: EngineCardDefinition = { ...DSL.fixedPlusXPoints, id: syntheticId(0xa82), costs: [energy(2), energyX()] };

function fixture(index: number, cardType: "character" | "event", cost: number, abilities: AbilityList): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    keywords: [],
    status: "authored",
    abilities,
  };
}

/** "Characters you control have Awakened." */
const awakenedBanner = fixture(0xa83, "character", 1, () => [staticAbility(p.grant(all(characterYouControl()), "awakened"))]);
/** "This character has Awakened.", from its own static ability. */
const selfAwakened = fixture(0xa84, "character", 1, () => [staticAbility(p.grant(self(), "awakened"))]);
/** "You may pay 2● to play this event. If you did, gain 2⍟." — a 0● event with an optional 2● additional cost. */
const kicker = fixture(0xa85, "event", 0, () => [additionalCost(optionalCost(energy(2))), event(p.ifThen(costPaid(), p.gainPoints(2)))]);
/** "Until the opponent pays 1●, enemies have −1✦ and have all character types." — two changes under one duration. */
const weakenUntilPays = fixture(0xa86, "event", 0, () => [
  event(p.forDuration(untilOpponentPays(1), p.sequence(p.sparkModifier(all(enemyCharacter()), -1), p.giveAllTypes(all(enemyCharacter()))))),
]);
/** "Until the opponent pays 1●, enemies have −1✦. Dissolve every enemy." — its changes are gone before it finishes resolving. */
const weakenThenDissolve = fixture(0xa87, "event", 0, () => [
  event(p.forDuration(untilOpponentPays(1), p.sequence(p.sparkModifier(all(enemyCharacter()), -1), p.dissolve(all(enemyCharacter()))))),
]);

const engine = createEngine(
  testCatalog([...CONTINUOUS_CARDS, ...DSL_CARDS, enemyBaseThree, twoPlusX, awakenedBanner, selfAwakened, kicker, weakenUntilPays, weakenThenDissolve], CONTINUOUS_EMBLEMS),
);
const catalog = engine.catalog;
const c = CONTINUOUS;
const v = SYNTHETIC;
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

function board(setup: Partial<BoardSetup>) {
  return boardState(catalog, { active: "player", phase: "day", ...setup });
}

function spark(state: BattleState, id: InstanceId | null | undefined): number {
  if (id === null || id === undefined) throw new Error("no character");
  return effectiveSpark(state, catalog, id);
}

/** Adds a floating change at `timestamp`, as a resolving effect would. */
function float(state: BattleState, change: ContinuousChange, timestamp: number): EffectId {
  const id: EffectId = `e${state.nextEffect}`;
  state.nextEffect += 1;
  state.floating.push({ id, controller: "player", source: { kind: "avatar", side: "player" }, timestamp, expiry: { at: "endOfTurn" }, change });
  return id;
}

function play(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return engine.apply(state, side, { kind: "play", card, from: "hand" }, new ScriptedSource(answers));
}

/** The energy `side` would pay to play `card` now, X counted as 0. */
function costOf(state: BattleState, card: InstanceId | undefined, side: Side = "player"): number {
  if (card === undefined) throw new Error("no card");
  const definition = printedCard(catalog, state.instances[card].printing);
  const fixed = definition.costs.reduce((total, cost) => total + (cost.cost === "energy" ? cost.amount : 0), 0);
  return adjustedEnergy(fixed, costModifier(state, catalog, card, side));
}

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

describe("cost modifications", () => {
  it("raise costs, then lower them, never below 0", () => {
    const { state, ids } = board({ player: { hand: [v.event1.id], energy: 0, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    float(state, { kind: "cost", player: "player", filter: {}, amount: -3, next: false }, 1);
    float(state, { kind: "cost", player: "player", filter: {}, amount: 1, next: false }, 2);
    // 1● + 1● − 3●, floored at 0 once the increase has applied.
    expect(costOf(state, card)).toBe(0);
    expect(engine.legalActions(state, "player")).toContainEqual({ kind: "play", card, from: "hand" });
    expect(engine.view(state, "player").instances[card]?.characteristics.cost).toBe(0);
  });

  it("apply static increases and reductions by player and card type, in legality and payment", () => {
    const { state, ids } = board({
      player: { back: [c.eventTax.id, c.opponentTax.id], hand: [v.event1.id, v.vanilla3.id], dreamsigns: [CONTINUOUS_DREAMSIGN.discount.id], energy: 2, deck },
      enemy: { hand: [v.vanilla1.id], deck },
    });
    expect(costOf(state, ids.player.hand[0])).toBe(2);
    expect(costOf(state, ids.player.hand[1])).toBe(2);
    expect(costOf(state, ids.enemy.hand[0], "enemy")).toBe(2);
    const played = play(state, "player", ids.player.hand[1]).state;
    expect(played.sides.player.currentEnergy).toBe(0);
  });

  it("apply to the whole energy cost of a card with an X part", () => {
    const { state, ids } = board({ player: { back: [c.characterDiscount.id], hand: [twoPlusX.id], energy: 3, deck }, enemy: { deck } });
    float(state, { kind: "cost", player: "player", filter: { cardType: "event" }, amount: -3, next: false }, 1);
    // 2● + X − 3●: X may go up to 4 with 3● available.
    const result = play(state, "player", ids.player.hand[0], [4]);
    expect(result.state.sides.player).toMatchObject({ currentEnergy: 0, score: 4 });
  });

  it("apply to the energy of a paid optional cost, which a reduction can make free", () => {
    for (const [energyAvailable, left] of [[0, 0], [1, 1]] as const) {
      const { state, ids } = board({ player: { hand: [kicker.id], energy: energyAvailable, deck }, enemy: { deck } });
      float(state, { kind: "cost", player: "player", filter: {}, amount: -2, next: false }, 1);
      // 0● plus the optional 2●, less 2●: the option is offered and costs nothing.
      const source = new ScriptedSource([true]);
      const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source);
      source.assertExhausted();
      expect(result.state.sides.player).toMatchObject({ currentEnergy: left, score: 2 });
    }
  });

  it("use up a 'next card' modifier on the next matching play only", () => {
    const { state, ids } = board({ player: { hand: [c.nextEventDiscount.id, v.vanilla1.id, v.event1.id, v.event1.id], energy: 2, deck }, enemy: { deck } });
    let next = play(state, "player", ids.player.hand[0]).state;
    expect(next.floating).toHaveLength(1);
    // A character does not match the filter and leaves it in place; legality and views never use it up.
    next = play(next, "player", ids.player.hand[1]).state;
    engine.legalActions(next, "player");
    engine.view(next, "player");
    expect(next.floating).toHaveLength(1);
    expect(next.sides.player.currentEnergy).toBe(1);
    const discounted = play(next, "player", ids.player.hand[2]);
    expect(discounted.state.floating).toEqual([]);
    expect(discounted.events).toContainEqual({ kind: "effectEnded", effect: next.floating[0].id });
    expect(discounted.state.sides.player.currentEnergy).toBe(1);
    expect(costOf(discounted.state, ids.player.hand[3])).toBe(1);
  });

  it("leave a 'next card' modifier in place when a play stops before its commit point", () => {
    const { state, ids } = board({ player: { hand: [DSL.pointsTimesX.id], energy: 3, deck }, enemy: { deck } });
    float(state, { kind: "cost", player: "player", filter: {}, amount: -1, next: true }, 1);
    const before = serializeState(state);
    // The X prompt has no answer: the step throws and its private copy is dropped.
    expect(() => runStep(state, { kind: "play", from: "hand", card: ids.player.hand[0] }, NO_PROMPTS, catalog)).toThrow();
    expect(serializeState(state)).toBe(before);
  });

  it("survive a reload while a discounted play waits at its X prompt, and use the modifier up once", () => {
    const { state, ids } = board({ player: { hand: [DSL.pointsTimesX.id], energy: 2, deck }, enemy: { deck } });
    const discount = float(state, { kind: "cost", player: "player", filter: {}, amount: -1, next: true }, 1);
    const card = ids.player.hand[0];
    const fold = createFoldAdapter(engine);
    const started: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = fold.reduce(started, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (suspended.kind !== "applied") throw new Error("bounced");
    const reloaded = JSON.parse(JSON.stringify(suspended.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine);
    const pending = fresh.pending(reloaded);
    // X goes up to 3: 2● available plus the 1● discount.
    expect(pending?.prompt).toMatchObject({ kind: "chooseNumber", min: 1, max: 3 });
    expect(reloaded.committed.floating.map((effect) => effect.id)).toEqual([discount]);
    const answered = fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending!.prompt.id, value: 3 });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    const inline = play(state, "player", card, [3]).state;
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline));
    expect(inline.floating).toEqual([]);
    expect(inline.sides.player).toMatchObject({ currentEnergy: 0, score: 3 });
  });

  it("tax the opponent's next card", () => {
    const { state, ids } = board({ player: { hand: [c.nextCardTax.id], deck }, enemy: { hand: [v.vanilla1.id], energy: 1, deck } });
    const taxed = play(state, "player", ids.player.hand[0]).state;
    expect(costOf(taxed, ids.enemy.hand[0], "enemy")).toBe(2);
    expect(costOf(taxed, ids.enemy.hand[0], "player")).toBe(1);
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
