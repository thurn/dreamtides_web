import type { ResolvingEffect } from "../effects/registry";
import { describe, expect, it } from "vitest";
import { parseCardSubtype, type CardSubtype } from "../../types/card-identity";
import { parsePromptId } from "../../types/identifiers";
import { parseEngineBattleFold } from "../../rules/battle/fold";
import { createCatalog, type EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { activated, characterYouControl, count, energy, event, self, target } from "./builders";
import type { AbilityList } from "./types";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import * as p from "../effects/primitives";
import { cloneState } from "../state/clone";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import { battleSeed, opponent, SIDES, type Side } from "../state/ids";
import type { BattleInit, BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS } from "../steps/sources";
import { syntheticId } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import { comparableView } from "../testing/determinization-fidelity";

const MAGE = parseCardSubtype("Mage"), WARRIOR = parseCardSubtype("Warrior");
const ID = syntheticId(0x72310);
const fixture = (n: number, subtype: CardSubtype, abilities: AbilityList = () => [], isEvent = false): EngineCardDefinition => ({
  id: syntheticId(0x72310 + n), cardType: isEvent ? "event" : "character", costs: [energy(1)], spark: isEvent ? null : 3,
  subtype: isEvent ? parseCardSubtype("") : subtype, speed: "standard", status: "authored", abilities,
});
const mage = fixture(1, MAGE), warrior = fixture(2, WARRIOR);
function world(side: Side, abilities: AbilityList, isEvent = false) {
  const source = fixture(0, WARRIOR, abilities, isEvent);
  const engine = createEngine(createCatalog([source, mage, warrior], []));
  const own = [{ cardId: ID, typeRemap: MAGE }, { cardId: mage.id }, { cardId: mage.id }, { cardId: ID }];
  const other = [{ cardId: warrior.id }];
  const init: BattleInit = { seed: battleSeed(`remap-${side}`), scoreToWin: 1000, startingSide: side, dreamwell: [],
    decks: { player: side === "player" ? own : other, enemy: side === "enemy" ? own : other },
    setup: { placements: [{ side, deckIndex: 0, zone: "hand" }, { side, deckIndex: 1, zone: "play", slot: { rank: "back", index: 0 } },
      { side, deckIndex: 2, zone: "play", slot: { rank: "back", index: 1 } }],
      sides: { player: { currentEnergy: 20, maxEnergy: 20, score: 0 }, enemy: { currentEnergy: 20, maxEnergy: 20, score: 0 } },
      turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side }, dreamwell: { deck: [], next: 0 } } };
  return { engine, init, state: engine.createBattle(init, NO_PROMPTS).state };
}
type World = ReturnType<typeof world>;
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) { if (out.kind !== "applied") throw new Error("Rejected public intent"); return out; }
function play(w: World, side: Side, state = w.state) {
  const card = state.sides[side].hand[0];
  const start = w.engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  return { card, ...passUntil(w.engine, start.state, next => next.stack.length === 0 && next.triggerQueue.length === 0) };
}

for (const side of SIDES) describe(`${side} remap transport`, () => {
  it("preserves both same-UUID variants through clone/hash, known and blind sampling and replay", () => {
    const w = world(side, () => [event(p.gainPoints(count(characterYouControl({ subtype: WARRIOR }))))], true);
    const before = serializeState(w.state), cloned = cloneState(w.state), saved = deserializeState(before);
    expect(cloned).toEqual(w.state); expect(stateHash(cloned)).toBe(stateHash(w.state));
    expect(parseEngineBattleFold({ init: w.init, slice: slice(saved) }, w.engine.catalog)).not.toBeNull();
    for (const viewer of SIDES) {
      const view = w.engine.view(w.state, viewer), sampled = w.engine.determinize(view, w.init.decks, () => 0.75);
      expect(comparableView(w.engine.view(sampled, viewer))).toEqual(comparableView(view));
      const remapped = Object.values(sampled.instances).filter(instance => instance.owner === side && instance.variant.typeRemap === MAGE);
      expect(remapped).toHaveLength(1);
      if (viewer === side) expect(sampled.instances[remapped[0].id].zone).toBe("hand");
    }
    const first = play(w, side, cloned), replay = play(w, side, saved);
    expect(first.state.sides[side].score).toBe(2);
    expect(first.events).toEqual(replay.events); expect(stateHash(first.state)).toBe(stateHash(replay.state));
    expect(serializeState(w.state)).toBe(before);
  });

  it("keeps physical copies remapped and same-UUID independent creations plain", () => {
    const w = world(side, () => [activated([], p.createCopyInHand(self())), activated([], p.materializeFigmentCopy(self())), activated([], p.createCard(ID))]);
    const entered = play(w, side), source = entered.card;
    let state = entered.state;
    for (const ability of [0, 1, 2]) {
      const paid = w.engine.apply(state, side, { kind: "activate", source, ability }, NO_PROMPTS);
      state = passUntil(w.engine, paid.state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
    }
    const copies = Object.values(state.instances).filter(instance => instance.status.created);
    expect(copies).toHaveLength(3);
    expect(copies.filter(instance => instance.variant.typeRemap === MAGE)).toHaveLength(2);
    const independent = copies.find(instance => instance.printing.kind === "card" && instance.variant.typeRemap === undefined);
    expect(independent?.printing).toEqual({ kind: "card", cardId: ID });
    for (const instance of copies) expect(w.engine.view(state, side).instances[instance.id]?.characteristics.subtype).toBe(WARRIOR);
    const cloned = cloneState(state);
    expect(cloned).toEqual(state);
    expect(parseEngineBattleFold({ init: w.init, slice: slice(cloned) }, w.engine.catalog)).not.toBeNull();
  });

  it("replays a pending remapped choice and refuses foreign/stale/concurrent answers atomically", () => {
    const w = world(side, () => [event(p.dissolve(target(characterYouControl({ subtype: WARRIOR }))))], true);
    const adapter = createFoldAdapter(w.engine), original = slice(w.state), before = serializeState(w.state);
    const card = w.state.sides[side].hand[0], intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card, from: "hand" as const } };
    const pending = applied(adapter.reduce(original, intent)), prompt = adapter.pending(pending.slice);
    if (prompt === null || prompt.prompt.kind !== "chooseTargets") throw new Error("Expected public targets");
    expect(prompt.prompt.candidates).toEqual(w.state.sides[side].backRank.filter(id => id !== null));
    const cold = JSON.parse(JSON.stringify(pending.slice)) as BattleSlice;
    expect(parseEngineBattleFold({ init: w.init, slice: cold }, w.engine.catalog)).not.toBeNull();
    expect(adapter.pending(cold)?.prompt).toEqual(prompt.prompt);
    expect(adapter.reduce(cold, { kind: "answer", side: opponent(side), promptId: prompt.prompt.id, value: [prompt.prompt.candidates[0]] }).kind).toBe("bounced");
    expect(adapter.reduce(cold, { kind: "answer", side, promptId: parsePromptId("999:0:0"), value: [] }).kind).toBe("bounced");
    expect(adapter.reduce(cold, { kind: "battleAction", side, action: { kind: "pass" } }).kind).toBe("bounced");
    const cancel = applied(adapter.reduce(cold, { kind: "cancel", side, promptId: prompt.prompt.id }));
    expect(serializeState(cancel.slice.committed)).toBe(before);
    const answer = { kind: "answer" as const, side, promptId: prompt.prompt.id, value: [prompt.prompt.candidates[0]] };
    const completed = applied(adapter.reduce(cold, answer));
    expect(completed.error).toBeNull(); expect(completed.slice.inFlight).toBeNull();
    expect(adapter.reduce(completed.slice, answer).kind).toBe("bounced");
    expect(stateHash(completed.slice.committed)).toBe(stateHash(applied(adapter.reduce(pending.slice, answer)).slice.committed));
    expect(serializeState(original.committed)).toBe(before);
  });

  it("rolls back a failing resolution while retaining the earlier committed remapped play", () => {
  // Deliberately malformed runtime ingress: resolution must fail after the play commits.
    const w = world(side, () => [event(p.sequence(p.gainPoints(9), p.costSetter("you", {}, 0) as unknown as ResolvingEffect))], true);
    const adapter = createFoldAdapter(w.engine), card = w.state.sides[side].hand[0];
    const played = applied(adapter.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    const committed = played.slice.committed, before = serializeState(committed);
    expect(() => runStep(committed, { kind: "resolveTop" }, NO_PROMPTS, w.engine.catalog)).toThrow();
    expect(serializeState(committed)).toBe(before);
    expect(committed.instances[card].variant.typeRemap).toBe(MAGE);
    expect(committed.sides[side].currentEnergy).toBe(19);
    expect(committed.sides[side].score).toBe(0);
    const control = world(side, () => [event(p.gainPoints(9))], true);
    expect(play(control, side).state.sides[side].score).toBe(9);
  });

  for (const invalid of ["", "*", "X", "{chosen character type}", 3, null, {}]) it(`refuses malformed own scalar ${JSON.stringify(invalid)} before setup or allocation`, () => {
    const w = world(side, () => []);
    const deck = w.init.decks[side].map((entry, index) => index === 0 ? { ...entry, typeRemap: invalid as CardSubtype } : entry);
    const init = { ...w.init, setup: undefined, decks: { ...w.init.decks, [side]: deck } };
    expect(() => w.engine.createBattle(init, NO_PROMPTS)).toThrow();
    const saved = JSON.parse(serializeState(w.state)) as BattleState;
    const id = saved.sides[side].hand[0];
    Object.assign(saved.instances[id], { variant: { amplified: false, typeRemap: invalid } });
    expect(parseEngineBattleFold({ init: w.init, slice: slice(saved) }, w.engine.catalog)).toBeNull();
  });
});
