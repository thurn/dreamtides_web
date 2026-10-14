/** Live pairwise character types through public selectors, static spark and the fold. */
import { describe, expect, it } from "vitest";
import { parseCardSubtype } from "../../../../types/card-identity";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristics } from "../../../continuous/characteristics";
import { activated, all, anyCharacter, characterYouControl, enemyCharacter, event, keyword, self, staticAbility, target } from "../../../dsl/builders";
import { matchesCharacter, matchesCharacterWith, matchingCharacters } from "../../../dsl/selectors";
import type { StaticCharacterSelector } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { chooseSubtype } from "../choose-subtype";
import { gainControl } from "../gain-control";
import { gainSpark } from "../gain-spark";
import { giveAllTypes } from "../give-all-types";
import { move } from "../move";
import { sparkModifier } from "../spark-modifier";

const shared = { sharesTypeWithAnotherChallenger: true } as const;
const selector = characterYouControl(shared);
const staticSelector: StaticCharacterSelector = selector;
const mage: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x61401), subtype: "Mage" };
const allTypes: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x61402), subtype: parseCardSubtype("*"),
  status: "authored", abilities: () => [staticAbility(giveAllTypes(self()))] };
const untyped = ["", "*", "X"].map((subtype, index): EngineCardDefinition => ({
  ...v.vanilla1, id: syntheticId(0x61403 + index), subtype: parseCardSubtype(subtype),
}));
const protectedCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x61406), status: "authored",
  abilities: () => [keyword("cannotBeTargeted")] };
const anthem: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x61407), status: "authored",
  abilities: () => [staticAbility(sparkModifier(all(staticSelector), 2))] };
const boundedAnthem: EngineCardDefinition = { ...anthem, id: syntheticId(0x61408),
  abilities: () => [staticAbility(sparkModifier(all(characterYouControl({ ...shared, sparkAtMost: 1 })), 2))] };
const chooser: EngineCardDefinition = { ...mage, id: syntheticId(0x61409), status: "authored",
  abilities: () => [activated([], chooseSubtype({ self: true }), { speed: "fast" })] };
const typeSpell: EngineCardDefinition = { ...v.event0, id: syntheticId(0x6140a), speed: "fast", status: "authored",
  abilities: () => [event(giveAllTypes(all(characterYouControl())))] };
const mover: EngineCardDefinition = { ...v.event0, id: syntheticId(0x6140b), speed: "fast", status: "authored",
  abilities: () => [event(move(target(characterYouControl())))] };
const thief: EngineCardDefinition = { ...v.event0, id: syntheticId(0x6140c), speed: "interrupt", status: "authored",
  abilities: () => [event(gainControl(target(enemyCharacter())))] };
const grant: EngineCardDefinition = { ...v.event0, id: syntheticId(0x6140d), speed: "fast", status: "authored",
  abilities: () => [event(gainSpark(target(selector), 1))] };
const engine = createEngine(testCatalog([mage, allTypes, ...untyped, protectedCard, anthem, boundedAnthem, chooser, typeSpell, mover, thief, grant]));
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

function night(side: Side, own: SideSetup, other: SideSetup = {}, e: Engine = engine) {
  const placed = boardState(e.catalog, { active: side, phase: "day",
    [side]: { deck, back: [anthem.id], ...own }, [opponent(side)]: { deck, ...other } });
  const state = passUntil(e, placed.state, at(e, side, "night")).state;
  return { ...placed, state };
}
function sparks(state: BattleState, ids: readonly (InstanceId | null)[], e: Engine = engine) {
  return ids.map(id => id === null ? null : effectiveSpark(state, e.catalog, id));
}
function settled(state: BattleState, e: Engine = engine, source = NO_PROMPTS) {
  return passUntil(e, state, next => next.stack.length === 0, source).state;
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function slice(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

for (const side of ["player", "enemy"] as const) describe(`${side} shared-type challenger`, () => {
  const other = opponent(side);
  it("requires a distinct live same-controller challenger, with equal effective types", () => {
    for (const [front, expected] of [
      [[v.vanilla1.id], [1]],
      [[v.vanilla1.id, v.vanilla1.id], [3, 3]],
      [[v.vanilla1.id, mage.id], [1, 1]],
    ] as const) {
      const { state, ids } = night(side, { front, back: [anthem.id, v.vanilla1.id] }, { front: [v.vanilla1.id] });
      expect(sparks(state, ids[side].front)).toEqual(expected);
      expect(sparks(state, ids[side].back)).toEqual([1, 1]);
      expect(sparks(state, ids[other].front)).toEqual([1]);
    }
    const { state, ids } = night(side, { front: [v.vanilla1.id, v.vanilla1.id] });
    const subject = ids[side].front[0]!;
    expect(matchesCharacter(state, engine.catalog, selector, ids[side].hand[0] ?? "i9999", side, subject)).toBe(false);
    expect(matchingCharacters(state, engine.catalog, anyCharacter(shared), other, subject)).toEqual(ids[side].front);
    expect(matchingCharacters(state, engine.catalog, enemyCharacter(shared), other, subject)).toEqual(ids[side].front);
    expect(matchingCharacters(state, engine.catalog, characterYouControl(shared), other, subject)).toEqual([]);
    expect(matchingCharacters(state, engine.catalog, characterYouControl({ ...shared, anyOf: [{ subtype: "Mage" }, shared] }), side, subject)).toEqual(ids[side].front);
    expect(matchingCharacters(state, engine.catalog, characterYouControl({ ...shared, subtype: "Mage" }), side, subject)).toEqual([]);
    expect(matchingCharacters(state, engine.catalog, characterYouControl({ ...shared, anyOf: [] }), side, subject)).toEqual([]);
  });

  it("gives AllTypes exactly one bonus per physical source despite several shared types and partners", () => {
    for (const copies of [1, 2]) {
      const { state, ids } = night(side, { front: [v.vanilla1.id, mage.id, allTypes.id, allTypes.id], back: Array.from({ length: copies }, () => anthem.id) });
      expect(sparks(state, ids[side].front)).toEqual(Array.from({ length: 4 }, () => 1 + copies * 2));
      expect(sparks(state, ids[side].back)).toEqual(Array.from({ length: copies }, () => 1));
    }
    const pair = night(side, { front: [allTypes.id, allTypes.id] });
    expect(sparks(pair.state, pair.ids[side].front)).toEqual([3, 3]);
    for (const blank of untyped) {
      for (const partner of [blank, allTypes]) {
        const { state, ids } = night(side, { front: [blank.id, partner.id] });
        expect(sparks(state, ids[side].front)).toEqual([1, 1]);
      }
    }
  });

  it("recalculates roles before designation, after Night movement and on the next turn", () => {
    const placed = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { front: [v.vanilla1.id, v.vanilla1.id], back: [anthem.id], hand: [mover.id], deck }, [other]: { deck } });
    expect(sparks(placed.state, placed.ids[side].front)).toEqual([1, 1]);
    const state = passUntil(engine, placed.state, at(engine, side, "night")).state;
    const first = placed.ids[side].front[0]!;
    const second = placed.ids[side].front[1]!;
    expect(sparks(state, [first, second])).toEqual([3, 3]);
    const moveSource = new ScriptedSource([[second], 0]);
    const played = engine.apply(state, side, { kind: "play", card: placed.ids[side].hand[0], from: "hand" }, moveSource);
    const benched = passUntil(engine, played.state, next => next.stack.length === 0, moveSource).state;
    moveSource.assertExhausted();
    expect(benched.sides[side].backRank).toContain(second);
    expect(sparks(benched, [first, second])).toEqual([1, 1]);
    const relocated = structuredClone(state);
    relocated.sides[side].frontRank[1] = null;
    relocated.sides[side].frontRank[4] = second;
    expect(sparks(relocated, [first, second])).toEqual([3, 3]);
    const next = passUntil(engine, state, at(engine, other, "day")).state;
    expect(sparks(next, [first, second])).toEqual([1, 1]);
  });

  it("uses live layer-two type choices and loses the pair when a challenger changes controller", () => {
    const { state, ids } = night(side, { front: [v.vanilla1.id, chooser.id], hand: [typeSpell.id] }, { hand: [thief.id] });
    const first = ids[side].front[0]!;
    const second = ids[side].front[1]!;
    expect(sparks(state, [first, second])).toEqual([1, 1]);
    const warriorMode = engine.catalog.characterTypes.indexOf("Warrior");
    const chooseSource = new ScriptedSource([warriorMode]);
    const activated = engine.apply(state, side, { kind: "activate", source: second, ability: 0 }, chooseSource);
    const changed = passUntil(engine, activated.state, next => next.stack.length === 0, chooseSource).state;
    chooseSource.assertExhausted();
    expect(sparks(changed, [first, second])).toEqual([3, 3]);
    const played = engine.apply(changed, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const takeSource = new ScriptedSource([[second]]);
    const responded = engine.apply(played.state, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, takeSource);
    const taken = passUntil(engine, responded.state, next => next.stack.length === 0, takeSource).state;
    takeSource.assertExhausted();
    expect(taken.instances[second].controller).toBe(other);
    expect(taken.sides[other].backRank).toContain(second);
    expect(sparks(taken, [first, second])).toEqual([1, 1]);
    expect(invariantViolations(taken, engine.catalog)).toEqual([]);
  });

  it("includes protected characters and distinct figment copies without targeting them", () => {
    const { state, ids } = night(side, { front: [protectedCard.id], figments: [{ slot: { rank: "front", index: 1 },
      printing: { kind: "figmentCopy", cardId: protectedCard.id, spark: 1 } }] });
    expect(sparks(state, ids[side].front)).toEqual([3, 3]);
    expect(matchingCharacters(state, engine.catalog, characterYouControl({ ...shared, figment: true }), side, ids[side].front[0]!)).toEqual([ids[side].front[1]]);
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
  });

  it("reads supplied earlier layers and preserves save, hash, RNG and both views during repeated static reads", () => {
    const { state, ids } = night(side, { front: [v.vanilla1.id, allTypes.id], back: [boundedAnthem.id] });
    const subject = ids[side].front[0]!;
    const layers = characteristics(state, engine.catalog);
    expect(matchesCharacterWith(state, engine.catalog, layers.reader(1), selector, subject, side, subject)).toBe(false);
    expect(matchesCharacterWith(state, engine.catalog, layers.reader(4), selector, subject, side, subject)).toBe(true);
    expect(sparks(state, ids[side].front)).toEqual([3, 3]);
    const saved = serializeState(state);
    const hash = stateHash(state);
    for (let read = 0; read < 3; read++) {
      expect(matchingCharacters(state, engine.catalog, selector, side, subject)).toEqual(ids[side].front);
      for (const viewer of [side, other]) {
        const seen = engine.view(state, viewer);
        expect(ids[side].front.map(id => seen.instances[id!]?.characteristics.spark)).toEqual([3, 3]);
      }
    }
    expect(serializeState(state)).toBe(saved);
    expect(stateHash(state)).toBe(hash);
    const cold = createEngine(engine.catalog);
    const reloaded = deserializeState(saved);
    expect(sparks(reloaded, ids[side].front, cold)).toEqual([3, 3]);
    expect(stateHash(reloaded)).toBe(hash);
  });

  it("reloads a public selector target prompt, refuses invalid, stale and concurrent input, cancels and replays once", () => {
    const placed = night(side, { front: [v.vanilla1.id, v.vanilla1.id, mage.id], hand: [grant.id] });
    const state = { ...placed.state, config: { ...placed.state.config, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = { kind: "play" as const, card: placed.ids[side].hand[0], from: "hand" as const };
    const opened = applied(fold.reduce(slice(state), { kind: "battleAction", side, action }));
    const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = cold.pending(reloaded)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", candidates: placed.ids[side].front.slice(0, 2) });
    expect(pending).toEqual(fold.pending(opened));
    const before = serializeState(reloaded.committed);
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [placed.ids[side].front[0]!] };
    expect(cold.reduce(reloaded, { ...answer, value: [placed.ids[side].front[2]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(reloaded, { ...answer, side: other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(cold.reduce(reloaded, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(serializeState(reloaded.committed)).toBe(before);
    const cancelled = applied(cold.reduce(reloaded, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(state));
    expect(cancelled.inFlight).toBeNull();
    expect(cold.reduce(cancelled, answer).kind).toBe("bounced");
    const committed = applied(cold.reduce(reloaded, answer));
    expect(committed).toEqual(applied(fold.reduce(opened, answer)));
    expect(cold.reduce(committed, answer).kind).toBe("bounced");
    const final = settled(committed.committed);
    expect(sparks(final, placed.ids[side].front)).toEqual([4, 3, 1]);
    expect(invariantViolations(final, engine.catalog)).toEqual([]);
  });

  it("propagates a supplied reader error without a partial state write", () => {
    const { state, ids } = night(side, { front: [v.vanilla1.id, v.vanilla1.id] });
    const saved = serializeState(state);
    const hash = stateHash(state);
    expect(() => matchesCharacterWith(state, engine.catalog, () => { throw new Error("reader failure"); }, selector,
      ids[side].front[0]!, side, ids[side].front[0]!)).toThrow("reader failure");
    expect(serializeState(state)).toBe(saved);
    expect(stateHash(state)).toBe(hash);
  });
});
