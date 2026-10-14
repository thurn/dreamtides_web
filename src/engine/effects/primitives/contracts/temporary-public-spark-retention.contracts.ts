/** Public resolved Spark survives private and ceased sources with its exact lifetime. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, enemyCharacter, event, everyIn, self, target } from "../../../dsl/builders";
import { triggered, triggeringCard, whenOpponentPlays, whenYouPlay } from "../../../dsl/triggers";
import type { CharacterRef, Duration } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import type { BattleView } from "../../../view/view";
import * as p from "../index";
import { decklists } from "./with-materialized-support";

const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-00000057b001");
const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x57b000 + index), status: "authored", abilities: () => [event(effect)],
});
const forms = ["gain", "modifier"] as const;
type Form = typeof forms[number];
const change = (form: Form, subject: CharacterRef, duration: Duration = "untilEndOfTurn") => form === "gain"
  ? p.gainSpark(subject, 3, duration) : p.forDuration(duration, p.sparkModifier(subject, 3));
const pump = forms.map((form, index) => spell(1 + index, change(form, target(characterYouControl()))));
const remove: EngineCardDefinition = { ...spell(3, p.dissolve(target(enemyCharacter({ sparkAtMost: 2 })))), speed: "interrupt" };
const idle = spell(4, p.gainPoints(1));
const hidden = forms.map((form, index): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x57b005 + index), status: "authored",
  abilities: () => [triggered(whenOpponentPlays(), change(form, all(characterYouControl())), { zone: "hand", oncePerTurn: true })] }));
const decoy: EngineCardDefinition = { ...hidden[0], id: syntheticId(0x57b007), abilities: () => [] };
const lasting = forms.map((form, index) => spell(8 + index, change(form, all(characterYouControl()), "permanent")));
const leaving = forms.map((form, index): EngineCardDefinition => ({ ...v.vanilla1, id: syntheticId(0x57b00a + index), status: "authored",
  abilities: () => [activated([], p.sequence(change(form, all(characterYouControl()), "whileSourceInPlay"), p.returnToHand(self()), p.shuffleInto([everyIn("hand")])))] }));
const resident: EngineCardDefinition = { ...leaving[0], id: syntheticId(0x57b00c),
  abilities: () => [activated([], change("modifier", all(characterYouControl()), "whileSourceInPlay"))] };
const engine = createEngine(testCatalog([...pump, remove, idle, ...hidden, decoy, ...lasting, ...leaving, resident], { dreamsigns: [{
  id: sign, status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCardTimes(triggeringCard(), 2))],
}] }));
const cases = SIDES.flatMap(side => forms.map((form, index) => ({ side, form, index })));
const deck = [v.vanilla3.id, v.vanilla5.id, v.vanilla3.id, v.vanilla5.id];
const starts = (events: readonly EngineEvent[]) => events.filter((entry): entry is Extract<EngineEvent, { kind: "effectStarted" }> => entry.kind === "effectStarted" && entry.change.kind === "spark");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function occupied(id: InstanceId | null | undefined): InstanceId {
  if (id == null) throw new Error("Expected synthetic character");
  return id;
}
const play = (state: BattleState, side: Side, card: InstanceId) => engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
const settle = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
function checkProjection(state: BattleState, subject: InstanceId) {
  const before = stateHash(state);
  for (const viewer of SIDES) {
    const seen = engine.view(state, viewer);
    const sampled = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, decklists(state), () => 0.5);
    expect(engine.view(sampled, viewer).instances[subject].characteristics).toEqual(seen.instances[subject].characteristics);
    expect(engine.legalActions(sampled, viewer)).toEqual(engine.legalActions(state, viewer));
    for (const record of seen.floating) expect(sampled.floating.find(effect => effect.id === record.id))
      .toMatchObject({ id: record.id, controller: record.controller, timestamp: record.timestamp, expiry: record.expiry, change: record.change });
    expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
  }
  expect(determinizationDivergences(engine, state, decklists(state), battleSeed("retained-public-spark"), 0)).toEqual([]);
  expect(stateHash(state)).toBe(before);
}
function copied(side: Side, index: number) {
  const other = opponent(side);
  const w = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    back: [v.vanilla1.id, v.vanilla3.id], hand: [pump[index].id, idle.id], dreamsigns: [sign], deck, energy: 8,
  }, [other]: { hand: [remove.id, v.interruptEvent.id], deck, energy: 8 } });
  const subject = occupied(w.ids[side].back[0]), original = occupied(w.ids[side].back[1]);
  const answers = new ScriptedSource([[original], [subject], [subject]]);
  const played = engine.apply(w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, answers);
  answers.assertExhausted();
  const copies = played.events.flatMap(entry => entry.kind === "cardCopied" ? [entry.copy] : []);
  expect(copies).toHaveLength(2);
  const rest = settle(played.state);
  expect(copies.every(id => rest.state.instances[id] === undefined)).toBe(true);
  // A later ordinary play opens the real opposing response; copies grant no extra window.
  const state = play(rest.state, side, w.ids[side].hand[1]).state;
  expect(engine.decision(state)?.side).toBe(other);
  return { ...w, state, subject, copies, events: [...played.events, ...rest.events] };
}

describe("temporary public Spark retention", () => {
  it.each(cases)("keeps ceased $form copies and opposing Interrupt legality for $side", ({ side, form, index }) => {
    const w = copied(side, index), other = opponent(side);
    const sampled = engine.determinize(engine.view(w.state, other), decklists(w.state), () => 0.5);
    expect(engine.legalActions(sampled, other)).not.toContainEqual({ kind: "play", card: w.ids[other].hand[0], from: "hand" });
    expect(engine.legalActions(w.state, other)).not.toContainEqual({ kind: "play", card: w.ids[other].hand[0], from: "hand" });
    expect(w.state.floating).toHaveLength(3);
    for (const viewer of SIDES) {
      expect(engine.view(w.state, viewer).instances[w.subject].characteristics.spark).toBe(7);
      expect(engine.view(w.state, viewer).floating).toEqual(w.state.floating.map(effect => ({ ...effect,
        source: typeof effect.source === "string" && w.copies.includes(effect.source) ? null : effect.source })));
      for (const entry of starts(w.events)) expect(eventSeenBy(entry, viewer, w.state)).toEqual(form === "gain" ? entry : { ...entry,
        source: typeof entry.source === "string" && w.copies.includes(entry.source) ? null : entry.source });
    }
    checkProjection(w.state, w.subject);
    const settled = settle(w.state).state;
    for (const viewer of SIDES) expect(engine.view(settled, viewer).floating.find(effect => effect.source === w.ids[side].hand[0])).toBeDefined();
    checkProjection(settled, w.subject);
  });

  it.each(cases)("ends copied $form modifications at Ending for $side", ({ side, index }) => {
    const w = copied(side, index);
    const ended = passUntil(engine, settle(w.state).state, at(engine, opponent(side), "day")).state;
    expect(ended.floating).toEqual([]);
    expect(engine.view(ended, side).instances[w.subject].characteristics.spark).toBe(1);
    expect(engine.legalActions(ended, opponent(side))).toContainEqual({ kind: "play", card: w.ids[opponent(side)].hand[0], from: "hand" });
    checkProjection(ended, w.subject);
  });

  it.each(cases)("keeps unknown $form source printing and hidden targets private for $side", ({ side, form, index }) => {
    const other = opponent(side);
    const w = boardState(engine.catalog, { active: other, phase: "day", [side]: {
      back: [v.vanilla1.id], hand: [hidden[index].id, decoy.id], deck,
    }, [other]: { hand: [idle.id], deck } });
    const first = play(w.state, other, w.ids[other].hand[0]), rest = settle(first.state);
    const state = rest.state, subject = occupied(w.ids[side].back[0]), source = w.ids[side].hand[0];
    const seen = engine.view(state, other);
    expect(seen.instances[subject].characteristics.spark).toBe(4);
    expect(seen.floating).toHaveLength(1);
    expect(seen.floating[0].source).toBeNull();
    for (const privateId of [source, hidden[index].id, decoy.id]) expect(JSON.stringify(seen)).not.toContain(`"${privateId}"`);
    for (const entry of starts([...first.events, ...rest.events])) expect(eventSeenBy(entry, other, state))
      .toEqual(form === "gain" ? null : { ...entry, source: null });
    checkProjection(state, subject);
    const altered = deserializeState(serializeState(state)), second = w.ids[side].hand[1];
    altered.instances[source] = { ...state.instances[source], printing: state.instances[second].printing };
    altered.instances[second] = { ...state.instances[second], printing: state.instances[source].printing };
    expect(engine.view(altered, other)).toEqual(seen);
    expect(stateHash(engine.determinize(engine.view(altered, other), decklists(state), () => 0.5)))
      .toBe(stateHash(engine.determinize(seen, decklists(state), () => 0.5)));
    const hiddenTarget = deserializeState(serializeState(state));
    hiddenTarget.floating = hiddenTarget.floating.map(effect => ({ ...effect, change: { kind: "spark", instance: source, amount: 3 } }));
    expect(engine.view(hiddenTarget, other).floating).toEqual([]);
  });

  it.each(cases)("keeps departed $form source expiry identity private for $side", ({ side, form, index }) => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [leaving[index].id, v.vanilla1.id], deck } });
    const source = occupied(w.ids[side].back[0]);
    const done = engine.apply(w.state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(done.state.instances[source]?.zone).toBe("deck");
    expect(done.state.floating).toEqual([]);
    expect(starts(done.events)).toHaveLength(2);
    for (const raw of [done.events, JSON.parse(JSON.stringify(done.events)) as EngineEvent[]]) for (const viewer of SIDES) {
      expect(engine.view(done.state, viewer).instances[source]).toBeUndefined();
      for (const entry of starts(raw)) expect(eventSeenBy(entry, viewer, done.state)).toEqual(form === "gain" ? entry : null);
    }
  });

  it.each(SIDES)("retains a visible source-bound modifier for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [resident.id, v.vanilla1.id], deck } });
    const done = engine.apply(w.state, side, { kind: "activate", source: occupied(w.ids[side].back[0]), ability: 0 }, NO_PROMPTS);
    for (const viewer of SIDES) {
      expect(engine.view(done.state, viewer).floating).toEqual(done.state.floating);
      for (const entry of starts(done.events)) expect(eventSeenBy(entry, viewer, done.state)).toEqual(entry);
    }
    checkProjection(done.state, occupied(w.ids[side].back[1]));
  });

  it.each(cases)("retains permanent $form storage and permanent snapshots for $side", ({ side, form, index }) => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla1.id], hand: [lasting[index].id], deck } });
    const state = settle(play(w.state, side, w.ids[side].hand[0]).state).state;
    const ended = passUntil(engine, state, at(engine, opponent(side), "day")).state;
    const subject = occupied(w.ids[side].back[0]);
    expect(ended.instances[subject].status.gainedSpark).toBe(form === "gain" ? 3 : 0);
    expect(ended.floating).toEqual(state.floating);
    expect(ended.floating.every(effect => effect.expiry.at === "never")).toBe(true);
    for (const viewer of SIDES) expect(ended.rememberedCards?.[viewer].flatMap(record => record.effects).every(effect => effect.expiry.at === "never")).toBe(true);
    expect(engine.view(ended, side).instances[subject].characteristics.spark).toBe(4);
    checkProjection(ended, subject);
  });

  it.each(cases)("restarts the $form fold with the same obligations and expiry for $side", ({ side, index }) => {
    const w = copied(side, index), committed = settle(w.state).state;
    const input = { init: { seed: "retained-public-spark", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(committed) };
    const parsed = parseEngineBattleFold(JSON.parse(JSON.stringify(input)));
    if (parsed === null) throw new Error("Retained Spark fold failed parsing");
    const intent = { kind: "battleAction", side, action: { kind: "pass" } } as const;
    const before = stateHash(committed);
    const direct = createFoldAdapter(engine).reduce(input.slice, intent), restarted = createFoldAdapter(engine).reduce(parsed.slice, intent);
    expect(restarted).toEqual(direct);
    expect(stateHash(committed)).toBe(before);
    if (restarted.kind !== "applied" || restarted.error !== null) throw new Error("Expected resumed fold");
    checkProjection(restarted.slice.committed, w.subject);
    const ended = passUntil(engine, restarted.slice.committed, at(engine, opponent(side), "day")).state;
    expect(ended.floating).toEqual([]);
    expect(engine.view(ended, side).instances[w.subject].characteristics.spark).toBe(1);
  });
});
