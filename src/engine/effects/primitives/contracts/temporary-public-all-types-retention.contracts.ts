/** Resolved public types retain their lifetime without disclosing private causal identities. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, controls, energy, event, everyIn, self, staticAbility, target } from "../../../dsl/builders";
import { triggered, triggeringCard, whenOpponentPlays, whenYouPlay } from "../../../dsl/triggers";
import type { Duration } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import type { Decklists } from "../../../view/determinize";
import type { BattleView } from "../../../view/view";
import * as p from "../index";

const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-00000057c001");
const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x57c000 + index), status: "authored", abilities: () => [event(effect)],
});
const give = (duration: Duration = "untilEndOfTurn") => p.giveAllTypes(all(characterYouControl()), duration);
const pump = spell(1, p.giveAllTypes(target(characterYouControl()), "untilEndOfTurn"));
const reducer: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57c002), subtype: "Mage", status: "authored",
  abilities: () => [staticAbility(p.costModifier("you", { cardType: "event" }, -2), { while: controls(characterYouControl({ subtype: "Explorer" }), 2) })] };
const probe: EngineCardDefinition = { ...spell(3, p.gainPoints(1)), costs: [energy(5)] };
const leaving: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57c004), status: "authored",
  abilities: () => [activated([], p.sequence(give("whileSourceInPlay"), p.returnToHand(self()), p.shuffleInto([everyIn("hand")])))] };
const resident: EngineCardDefinition = { ...leaving, id: syntheticId(0x57c005), abilities: () => [activated([], give("whileSourceInPlay"))] };
const hidden: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57c006), status: "authored",
  abilities: () => [triggered(whenOpponentPlays(), give(), { zone: "hand", oncePerTurn: true })] };
const decoy: EngineCardDefinition = { ...hidden, id: syntheticId(0x57c007), abilities: () => [] };
const lasting = spell(8, give("permanent"));
const idle = spell(9, p.gainPoints(1));
const hide = spell(10, p.sequence(p.returnToHand(target(characterYouControl())), p.shuffleInto([everyIn("hand")])));
const engine = createEngine(testCatalog([pump, reducer, probe, leaving, resident, hidden, decoy, lasting, idle, hide], { dreamsigns: [{
  id: sign, status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCardTimes(triggeringCard(), 2))],
}] }));
const deck = [v.vanilla3.id, v.vanilla5.id, v.vanilla3.id, v.vanilla5.id];
const starts = (events: readonly EngineEvent[]) => events.filter((entry): entry is Extract<EngineEvent, { kind: "effectStarted" }> => entry.kind === "effectStarted" && entry.change.kind === "allTypes");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function occupied(id: InstanceId | null | undefined): InstanceId {
  if (id == null) throw new Error("Expected synthetic public character");
  return id;
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful synthetic fold");
  return outcome.slice;
}
function decklists(state: BattleState): Decklists {
  const cards = (side: Side) => Object.values(state.instances).flatMap(instance => instance.owner === side && instance.printing.kind === "card"
    ? [{ cardId: instance.printing.cardId, ...instance.variant }] : []);
  return { player: cards("player"), enemy: cards("enemy") };
}
const play = (state: BattleState, side: Side, card: InstanceId, answers = NO_PROMPTS) => engine.apply(state, side, { kind: "play", card, from: "hand" }, answers);
const settle = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
function checkProjection(state: BattleState) {
  const before = stateHash(state);
  for (const viewer of SIDES) {
    const seen = engine.view(state, viewer);
    const sampled = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, decklists(state), () => 0.5);
    for (const id of Object.keys(seen.instances) as InstanceId[]) {
      expect(engine.view(sampled, viewer).instances[id].characteristics).toEqual(seen.instances[id].characteristics);
    }
    expect(engine.legalActions(sampled, viewer)).toEqual(engine.legalActions(state, viewer));
    for (const effect of seen.floating) expect(sampled.floating.find(record => record.id === effect.id))
      .toMatchObject({ id: effect.id, controller: effect.controller, timestamp: effect.timestamp, expiry: effect.expiry, change: effect.change });
    expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
  }
  expect(determinizationDivergences(engine, state, decklists(state), battleSeed("retained-public-all-types"), 0)).toEqual([]);
  expect(stateHash(state)).toBe(before);
}
function copied(side: Side) {
  const w = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    back: [reducer.id, v.vanilla1.id, v.vanilla3.id], hand: [pump.id, probe.id], dreamsigns: [sign], deck, energy: 3,
  }, [opponent(side)]: { deck } });
  const subject = occupied(w.ids[side].back[2]), ordinary = occupied(w.ids[side].back[1]);
  const before = stateHash(w.state), answers = new ScriptedSource([[ordinary], [subject], [subject]]);
  const first = play(w.state, side, w.ids[side].hand[0], answers);
  answers.assertExhausted();
  const rest = settle(first.state), copies = first.events.flatMap(entry => entry.kind === "cardCopied" ? [entry.copy] : []);
  expect(stateHash(w.state)).toBe(before);
  expect(copies).toHaveLength(2);
  expect(copies.every(id => rest.state.instances[id] === undefined)).toBe(true);
  return { ...w, state: rest.state, subject, ordinary, copies, events: [...first.events, ...rest.events] };
}

describe("temporary public all-types retention", () => {
  it.each(SIDES)("retains ceased copies, ordinary source and conditional cost legality for %s", side => {
    const w = copied(side);
    expect(w.state.floating).toHaveLength(3);
    expect(starts(w.events)).toHaveLength(3);
    const action = { kind: "play", card: w.ids[side].hand[1], from: "hand" } as const;
    expect(engine.legalActions(w.state, side)).toContainEqual(action);
    const sampled = engine.determinize(engine.view(w.state, side), decklists(w.state), () => 0.5);
    expect({ allTypes: engine.view(sampled, side).instances[w.subject].characteristics.allTypes,
      cost: engine.view(sampled, side).instances[action.card].characteristics.cost,
      legal: engine.legalActions(sampled, side).some(candidate => JSON.stringify(candidate) === JSON.stringify(action)),
    }).toEqual({ allTypes: true, cost: 3, legal: true });
    for (const viewer of SIDES) {
      const seen = engine.view(w.state, viewer);
      expect(seen.instances[w.subject].characteristics.allTypes).toBe(true);
      expect(seen.instances[w.ordinary].characteristics.allTypes).toBe(true);
      expect(seen.floating).toEqual(w.state.floating.map(effect => ({ ...effect,
        source: typeof effect.source === "string" && w.copies.includes(effect.source) ? null : effect.source })));
      for (const entry of starts(w.events)) expect(eventSeenBy(entry, viewer, w.state)).toEqual({ ...entry,
        source: typeof entry.source === "string" && w.copies.includes(entry.source) ? null : entry.source });
    }
    expect(engine.view(w.state, side).instances[action.card].characteristics.cost).toBe(3);
    checkProjection(w.state);
  });

  it.each(SIDES)("expires at Ending and restores the subtype-dependent cost for %s", side => {
    const w = copied(side);
    const ended = passUntil(engine, w.state, at(engine, opponent(side), "day")).state;
    expect(ended.floating).toEqual([]);
    for (const viewer of SIDES) {
      expect(engine.view(ended, viewer).instances[w.subject].characteristics.allTypes).toBe(false);
      expect(engine.view(ended, viewer).instances[w.subject].characteristics.subtype).toBe("Warrior");
    }
    expect(engine.view(ended, side).instances[w.ids[side].hand[1]].characteristics.cost).toBe(5);
    checkProjection(ended);
  });

  it.each(SIDES)("keeps unknown source identities private while retaining their public changes for %s", side => {
    const other = opponent(side);
    const w = boardState(engine.catalog, { active: other, phase: "day", [side]: {
      back: [reducer.id, v.vanilla1.id], hand: [hidden.id, decoy.id, probe.id], deck, energy: 3,
    }, [other]: { hand: [idle.id], deck } });
    const first = play(w.state, other, w.ids[other].hand[0]), rest = settle(first.state), state = rest.state;
    const source = w.ids[side].hand[0], seen = engine.view(state, other), events = starts([...first.events, ...rest.events]);
    expect(events).toHaveLength(2);
    expect(seen.floating).toHaveLength(2);
    expect(seen.floating.every(effect => effect.source === null)).toBe(true);
    for (const secret of [source, hidden.id, decoy.id]) expect(JSON.stringify(seen)).not.toContain(`"${secret}"`);
    for (const entry of events) {
      expect(eventSeenBy(entry, other, state)).toEqual({ ...entry, source: null });
      expect(eventSeenBy(entry, side, state)).toEqual(entry);
    }
    expect(engine.view(state, side).instances[w.ids[side].hand[2]].characteristics.cost).toBe(3);
    checkProjection(state);
    const altered = deserializeState(serializeState(state)), second = w.ids[side].hand[1];
    altered.instances[source] = { ...state.instances[source], printing: state.instances[second].printing };
    altered.instances[second] = { ...state.instances[second], printing: state.instances[source].printing };
    expect(engine.view(altered, other)).toEqual(seen);
    expect(stateHash(engine.determinize(engine.view(altered, other), decklists(state), () => 0.5)))
      .toBe(stateHash(engine.determinize(seen, decklists(state), () => 0.5)));
  });

  it.each(SIDES)("omits changes to a target actually shuffled into a hidden deck for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla1.id, v.vanilla3.id], hand: [pump.id, hide.id], deck } });
    const subject = occupied(w.ids[side].back[0]);
    const first = settle(play(w.state, side, w.ids[side].hand[0], new ScriptedSource([[subject]])).state);
    const hiddenState = settle(play(first.state, side, w.ids[side].hand[1], new ScriptedSource([[subject]])).state).state;
    expect(hiddenState.instances[subject].zone).toBe("deck");
    expect(hiddenState.floating).toHaveLength(1);
    for (const viewer of SIDES) {
      expect(engine.view(hiddenState, viewer).instances[subject]).toBeUndefined();
      expect(engine.view(hiddenState, viewer).floating).toEqual([]);
      for (const entry of starts(first.events)) expect(eventSeenBy(entry, viewer, hiddenState)).toBeNull();
    }
  });

  it.each(SIDES)("keeps source-dependent expiry private after departure and event JSON transport for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [leaving.id, v.vanilla1.id], deck } });
    const source = occupied(w.ids[side].back[0]);
    const done = engine.apply(w.state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(done.state.instances[source].zone).toBe("deck");
    expect(done.state.floating).toEqual([]);
    expect(starts(done.events)).toHaveLength(2);
    for (const raw of [done.events, JSON.parse(JSON.stringify(done.events)) as EngineEvent[]]) for (const viewer of SIDES) {
      expect(engine.view(done.state, viewer).instances[source]).toBeUndefined();
      expect(engine.view(done.state, viewer).floating).toEqual([]);
      // Absence is distinct from a present event carrying a null causal source and a private expiry ID.
      expect(starts(raw).map(entry => eventSeenBy(entry, viewer, done.state))).toEqual([null, null]);
    }
    const live = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [resident.id, v.vanilla1.id], deck } });
    const residentId = occupied(live.ids[side].back[0]);
    const visible = engine.apply(live.state, side, { kind: "activate", source: residentId, ability: 0 }, NO_PROMPTS);
    expect(starts(visible.events)).toHaveLength(2);
    for (const viewer of SIDES) {
      expect(engine.view(visible.state, viewer).floating).toEqual(visible.state.floating);
      for (const entry of starts(visible.events)) {
        expect(eventSeenBy(entry, viewer, visible.state)).toEqual(entry);
        expect(entry).toMatchObject({ kind: "effectStarted", source: residentId, expiry: { at: "sourceLeavesPlay", source: residentId }, change: { kind: "allTypes" } });
      }
    }
    checkProjection(visible.state);
  });

  it.each(SIDES)("retains permanent observations in the permanent snapshot model for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla1.id], hand: [lasting.id], deck } });
    const state = settle(play(w.state, side, w.ids[side].hand[0]).state).state;
    const ended = passUntil(engine, state, at(engine, opponent(side), "day")).state;
    expect(state.floating).toHaveLength(1);
    expect(state.floating[0].expiry).toEqual({ at: "never" });
    expect(ended.floating).toEqual(state.floating);
    for (const viewer of SIDES) expect(ended.rememberedCards?.[viewer].flatMap(record => record.effects).every(effect => effect.expiry.at === "never")).toBe(true);
    checkProjection(ended);
  });

  it.each(SIDES)("restarts retained effects through a serialized fold without mutating the original for %s", side => {
    const w = copied(side), input = { init: { seed: "retained-public-all-types", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(w.state) };
    const parsed = parseEngineBattleFold(JSON.parse(JSON.stringify(input)));
    if (parsed === null) throw new Error("Synthetic retained types failed save validation");
    const intent = { kind: "battleAction", side, action: { kind: "pass" } } as const, before = stateHash(w.state);
    const direct = createFoldAdapter(engine).reduce(input.slice, intent), restarted = createFoldAdapter(engine).reduce(parsed.slice, intent);
    expect(restarted).toEqual(direct);
    expect(stateHash(w.state)).toBe(before);
    checkProjection(applied(restarted).committed);
  });

  it.each(SIDES)("refuses illegal actions and answers and cancels an uncommitted target choice for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla1.id, v.vanilla3.id], hand: [pump.id], deck }, [opponent(side)]: { back: [v.vanilla1.id], deck } });
    const adapter = createFoldAdapter(engine), original = slice(w.state), before = stateHash(w.state);
    expect(adapter.reduce(original, { kind: "battleAction", side, action: { kind: "play", card: occupied(w.ids[side].back[0]), from: "hand" } }))
      .toEqual({ kind: "bounced", reason: "illegalAction" });
    const opened = applied(adapter.reduce(original, { kind: "battleAction", side, action: { kind: "play", card: w.ids[side].hand[0], from: "hand" } }));
    const pending = adapter.pending(opened);
    if (pending === null) throw new Error("Expected public target choice");
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", side, cancellable: true });
    const save = parseEngineBattleFold(JSON.parse(JSON.stringify({ init: {
      seed: "retained-public-all-types", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [],
    }, slice: opened })));
    if (save === null) throw new Error("Synthetic pending type choice failed save validation");
    const restarted = createFoldAdapter(engine);
    expect(restarted.pending(save.slice)?.prompt).toEqual(pending.prompt);
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: [occupied(w.ids[side].back[0])] } as const;
    expect(restarted.reduce(save.slice, answer)).toEqual(adapter.reduce(opened, answer));
    expect(adapter.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value: [occupied(w.ids[opponent(side)].back[0])] }))
      .toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(adapter.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.inFlight).toBeNull();
    expect(cancelled.committed.floating).toEqual([]);
    expect(stateHash(cancelled.committed)).toBe(before);
    expect(stateHash(w.state)).toBe(before);
    const empty = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [pump.id], deck } });
    expect(engine.legalActions(empty.state, side)).not.toContainEqual({ kind: "play", card: empty.ids[side].hand[0], from: "hand" });
  });
});
