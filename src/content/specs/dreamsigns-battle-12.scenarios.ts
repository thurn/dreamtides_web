/** D20: live discard counts and opponent-turn matching-play payments. */
import { expect } from "vitest";
import { activated, additionalCost, anyCharacter, discardCost, energy, event, self, target } from "../../engine/dsl/builders";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { createCopyInHand } from "../../engine/effects/primitives/create-copy-in-hand";
import { discard } from "../../engine/effects/primitives/discard";
import { dissolve } from "../../engine/effects/primitives/dissolve";
import { sequence } from "../../engine/effects/primitives/sequence";
import { createEngine } from "../../engine/engine";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import { runScenario, playFromHand, type NamedScenario, type ScenarioModule, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseDreamsignId } from "../../types/identifiers";

const SPICE = parseDreamsignId("86f64a29-7338-4759-81da-4c7656e543d2");
const EGG = parseDreamsignId("553d2317-32f9-47bc-bae0-5018ca26d56a");
const priced = { ...v.event1, id: syntheticId(0x24901), costs: [energy(3)] };
const paidDiscard = { ...priced, id: syntheticId(0x24902), status: "authored" as const,
  abilities: () => [additionalCost(discardCost()), event(sequence())] };
const discardTwo = { ...v.event0, id: syntheticId(0x24903), status: "authored" as const,
  abilities: () => [event(discard(2))] };
const targeted = { ...priced, id: syntheticId(0x24904), speed: "interrupt" as const, status: "authored" as const,
  abilities: () => [event(dissolve(target(anyCharacter())))] };
const fastDiscard = { ...v.discardOne, id: syntheticId(0x24905),
  abilities: () => [activated([discardCost()], sequence(), { speed: "fast" })] };
const copier = { ...v.vanilla0, id: syntheticId(0x24906), status: "authored" as const,
  abilities: () => [activated([], createCopyInHand(self()))] };
const engine = createEngine(testCatalog([priced, paidDiscard, discardTwo, targeted, fastDiscard, copier], { dreamsigns: contentDreamsignDefinitions() }));
const deck = Array.from({ length: 12 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
function witness(side: Side, egg: boolean): ScenarioSpec {
  return { board: { active: egg ? opponent(side) : side, phase: egg ? "dusk" : "day",
    [side]: { dreamsigns: [egg ? EGG : SPICE], hand: [egg ? v.fastEvent.id : v.event1.id], energy: 10, deck },
    [opponent(side)]: { deck } }, steps: (ids) => [playFromHand(ids, side)] };
}
for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({ name: `${SPICE} ${side} completed batch discards change live event payment only`, spec: witness(side, false), check: (w) => {
    expect(w.state.sides[side].currentEnergy).toBe(9);
    const b = runScenario(engine, { board: { active: side, phase: "day", [side]: { dreamsigns: [SPICE],
      hand: [priced.id, discardTwo.id, v.vanilla0.id, v.vanilla0.id, priced.id, v.vanilla1.id, v.event1.id], energy: 10, deck }, [other]: { deck } },
      steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1), playFromHand(ids, side, 4),
        { side, action: { kind: "play", card: ids[side].hand[5], from: "hand", slot: { rank: "back", index: 0 } } }, playFromHand(ids, side, 6)],
      answers: (ids) => [[ids[side].hand[2], ids[side].hand[3]]] });
    expect(b.state.turnLog.discarded?.[side]).toBe(2);
    expect(b.events.filter((e) => e.kind === "discarded")).toHaveLength(2);
    expect(b.state.sides[side].currentEnergy).toBe(5);
    expect(b.state.turnLog.played[side].map((p) => p.instance)).toEqual([0, 1, 4, 5, 6].map((i) => b.ids[side].hand[i]));
  } });
  scenarios.push({ name: `${SPICE} ${side} payment discards and created cessation affect subsequent payments`, spec: witness(side, false), check: () => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [SPICE], back: [copier.id, v.discardOne.id],
      hand: [paidDiscard.id, v.vanilla0.id, priced.id], energy: 10, deck }, [other]: { deck } });
    const paid = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, new ScriptedSource([[b.ids[side].hand[1]]]));
    expect(paid.state.sides[side].currentEnergy).toBe(7);
    const made = engine.apply(paid.state, side, { kind: "activate", source: b.ids[side].back[0]!, ability: 0 }, NO_PROMPTS);
    const created = made.state.sides[side].hand.find((id) => !b.ids[side].hand.includes(id));
    if (created === undefined) throw new Error("physical created hand card missing");
    const gone = engine.apply(made.state, side, { kind: "activate", source: b.ids[side].back[1]!, ability: 0 }, new ScriptedSource([[created]]));
    expect(gone.state.instances[created]).toBeUndefined();
    expect(gone.state.turnLog.discarded?.[side]).toBe(2);
    const next = engine.apply(gone.state, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS);
    expect(next.state.sides[side].currentEnergy).toBe(6);
  } });
  scenarios.push({ name: `${SPICE} ${side} opposing discard isolation and loaded cancellation survive turn reset`, spec: witness(side, false), check: () => {
    const b = boardState(engine.catalog, { active: other, phase: "day", [side]: { dreamsigns: [SPICE], back: [fastDiscard.id], hand: [v.event0.id, targeted.id, priced.id], energy: 10, deck },
      [other]: { back: [fastDiscard.id, v.vanilla0.id], hand: [v.event0.id], deck } });
    const theirs = engine.apply(b.state, other, { kind: "activate", source: b.ids[other].back[0]!, ability: 0 }, new ScriptedSource([[b.ids[other].hand[0]]]));
    const dusk = passUntil(engine, theirs.state, at(engine, other, "dusk"));
    const mine = engine.apply(dusk.state, side, { kind: "activate", source: b.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[b.ids[side].hand[0]]]));
    const fold = createFoldAdapter(engine);
    const opened = fold.reduce({ committed: mine.state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[1], from: "hand" } });
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("targeted cost play did not open");
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const prompt = fold.pending(saved)?.prompt;
    if (prompt?.kind !== "chooseTargets") throw new Error("target prompt missing");
    const cancelled = fold.reduce(saved, { kind: "cancel", side, promptId: prompt.id });
    if (cancelled.kind !== "applied" || cancelled.error !== null) throw new Error("loaded cancellation failed");
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(mine.state));
    const played = engine.apply(cancelled.slice.committed, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, new ScriptedSource([[b.ids[other].back[1]!] ]));
    expect(played.state.sides[side].currentEnergy).toBe(8);
    const next = passUntil(engine, deserializeState(serializeState(played.state)), at(engine, side, "day"));
    expect(next.state.turnLog.discarded?.[side] ?? 0).toBe(0);
    expect(next.state.turnLog.discarded?.[other] ?? 0).toBe(0);
    const fresh = engine.apply(next.state, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS);
    expect(fresh.state.sides[side].currentEnergy).toBe(next.state.sides[side].currentEnergy - 3);
  } });
  scenarios.push({ name: `${EGG} ${side} first matching interrupt and fast payments use opponent turn only`, spec: witness(side, true), check: (w) => {
    expect(w.state.sides[side].currentEnergy).toBe(10);
    const own = runScenario(engine, { board: { active: side, phase: "day", [side]: { dreamsigns: [EGG], hand: [v.fastEvent.id, v.interruptEvent.id], energy: 10, deck }, [other]: { deck } },
      steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1)] });
    expect(own.state.sides[side].currentEnergy).toBe(8);
    const b = runScenario(engine, { board: { active: other, phase: "dusk", [side]: { dreamsigns: [EGG], back: [fastDiscard.id],
      hand: [v.event0.id, v.interruptEvent.id, v.fastEvent.id], energy: 10, deck }, [other]: { deck } },
      steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }, playFromHand(ids, side, 1), playFromHand(ids, side, 2)], answers: (ids) => [[ids[side].hand[0]]] });
    expect(b.state.sides[side].currentEnergy).toBe(9);
    expect(b.state.turnLog.played[side].map((p) => p.instance)).toEqual([b.ids[side].hand[1], b.ids[side].hand[2]]);
    expect(b.state.sides[other].currentEnergy).toBe(0);
  } });
  scenarios.push({ name: `${EGG} ${side} loaded target cancellation leaves first matching payment available`, spec: witness(side, true), check: (w) => {
    expect(w.state.sides[side].currentEnergy).toBe(10);
    const b = boardState(engine.catalog, { active: other, phase: "dusk", [side]: { dreamsigns: [EGG], hand: [targeted.id, v.fastEvent.id], energy: 10, deck }, [other]: { back: [v.vanilla0.id, v.vanilla0.id], deck } });
    const fold = createFoldAdapter(engine);
    const opened = fold.reduce({ committed: b.state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    if (opened.kind !== "applied" || opened.error !== null) throw new Error("first interrupt did not open");
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const prompt = fold.pending(saved)?.prompt;
    if (prompt?.kind !== "chooseTargets") throw new Error("first interrupt target missing");
    const cancelled = fold.reduce(saved, { kind: "cancel", side, promptId: prompt.id });
    if (cancelled.kind !== "applied" || cancelled.error !== null) throw new Error("first interrupt cancellation failed");
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(b.state));
    const first = engine.apply(cancelled.slice.committed, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, new ScriptedSource([[b.ids[other].back[0]!] ]));
    expect(first.state.sides[side].currentEnergy).toBe(8);
    const second = engine.apply(first.state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, NO_PROMPTS);
    expect(second.state.sides[side].currentEnergy).toBe(7);
  } });
  scenarios.push({ name: `${EGG} ${side} first-match allowance refreshes across actual opponent turns`, spec: witness(side, true), check: (w) => {
    expect(w.state.sides[side].currentEnergy).toBe(10);
    const b = runScenario(engine, { board: { active: other, phase: "dusk", [side]: { dreamsigns: [EGG], hand: [v.interruptEvent.id, v.interruptEvent.id, v.interruptEvent.id], energy: 10, deck }, [other]: { deck } },
      steps: (ids) => [playFromHand(ids, side)] });
    const own = passUntil(engine, deserializeState(serializeState(b.state)), at(engine, side, "day"));
    expect(own.state.turnLog.played[side]).toEqual([]);
    const ownPlay = engine.apply(own.state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, NO_PROMPTS);
    expect(ownPlay.state.sides[side].currentEnergy).toBe(9);
    const next = passUntil(engine, ownPlay.state, at(engine, other, "dusk"));
    expect(next.state.turnLog.played[side]).toEqual([]);
    const first = engine.apply(next.state, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS);
    expect(first.state.sides[side].currentEnergy).toBe(9);
    expect(first.state.turnLog.played[side].map((p) => p.instance)).toEqual([b.ids[side].hand[2]]);
  } });
}
export default { slug: "dreamsigns-battle-12", scenarios } satisfies ScenarioModule;
