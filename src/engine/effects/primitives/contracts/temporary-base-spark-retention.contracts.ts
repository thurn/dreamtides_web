/** Resolved public base spark survives source departure without exposing private identities. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, enemyCharacter, event, everyIn, self, target } from "../../../dsl/builders";
import { triggered, triggeringCard, whenOpponentPlays, whenYouPlay } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
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

const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-00000057a001");
const set = (duration: Parameters<typeof p.setBaseSpark>[2] = "untilEndOfTurn") => p.setBaseSpark(all(characterYouControl()), 7, duration);
const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x57a000 + index), status: "authored", abilities: () => [event(effect)],
});
const pump = spell(1, p.setBaseSpark(target(characterYouControl()), 7, "untilEndOfTurn"));
const remove: EngineCardDefinition = { ...spell(2, p.dissolve(target(enemyCharacter({ sparkAtMost: 2 })))), speed: "interrupt" };
const idle = spell(3, p.gainPoints(1));
const hidden: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57a004), status: "authored",
  abilities: () => [triggered(whenOpponentPlays(), set(), { zone: "hand", oncePerTurn: true })] };
const decoy: EngineCardDefinition = { ...hidden, id: syntheticId(0x57a005), abilities: () => [] };
const lasting = spell(6, set("permanent"));
const leaving: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x57a007), status: "authored",
  abilities: () => [activated([], p.sequence(set("whileSourceInPlay"), p.returnToHand(self()), p.shuffleInto([everyIn("hand")])))] };
const resident: EngineCardDefinition = { ...leaving, id: syntheticId(0x57a008), abilities: () => [activated([], set("whileSourceInPlay"))] };
const engine = createEngine(testCatalog([pump, remove, idle, hidden, decoy, lasting, leaving, resident], { dreamsigns: [{
  id: sign, status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCardTimes(triggeringCard(), 2))],
}] }));
const deck = [v.vanilla3.id, v.vanilla5.id, v.vanilla3.id, v.vanilla5.id];
const starts = (events: readonly EngineEvent[]) => events.filter((event): event is Extract<EngineEvent, { kind: "effectStarted" }> => event.kind === "effectStarted" && event.change.kind === "baseSpark");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function occupied(id: InstanceId | null | undefined): InstanceId {
  if (id == null) throw new Error("Expected synthetic character");
  return id;
}
function play(state: BattleState, side: Side, card: InstanceId) {
  return engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
}
function settle(state: BattleState) {
  return passUntil(engine, state, current => current.stack.length === 0 && current.triggerQueue.length === 0);
}
function checkProjection(state: BattleState, subject: InstanceId, current: Engine = engine) {
  const before = stateHash(state);
  for (const viewer of SIDES) {
    const seen = current.view(state, viewer);
    const sampled = current.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, decklists(state), () => 0.5);
    expect(current.view(sampled, viewer).instances[subject].characteristics).toEqual(seen.instances[subject].characteristics);
    expect(current.legalActions(sampled, viewer)).toEqual(current.legalActions(state, viewer));
    for (const record of seen.floating) {
      const actual = sampled.floating.find(effect => effect.id === record.id);
      expect(actual).toMatchObject({ id: record.id, controller: record.controller, timestamp: record.timestamp, expiry: record.expiry, change: record.change });
    }
    expect(invariantViolations(sampled, current.catalog)).toEqual([]);
  }
  expect(determinizationDivergences(current, state, decklists(state), battleSeed("retained-base-spark"), 0)).toEqual([]);
  expect(stateHash(state)).toBe(before);
}
function copied(side: Side) {
  const w = boardState(engine.catalog, { active: side, phase: "day", [side]: {
    back: [v.vanilla1.id, v.vanilla3.id], hand: [pump.id, idle.id], dreamsigns: [sign], deck, energy: 8,
  }, [opponent(side)]: { hand: [remove.id, v.interruptEvent.id], deck, energy: 8 } });
  const subject = occupied(w.ids[side].back[0]), originalTarget = occupied(w.ids[side].back[1]);
  const answers = new ScriptedSource([[originalTarget], [subject], [subject]]);
  const played = engine.apply(w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, answers);
  answers.assertExhausted();
  const copies = played.events.flatMap(event => event.kind === "cardCopied" ? [event.copy] : []);
  expect(copies).toHaveLength(2);
  const partial = settle(played.state);
  expect(copies.every(id => partial.state.instances[id] === undefined)).toBe(true);
  // A later real play offers the opponent an Interrupt response while the copied setters persist.
  const state = play(partial.state, side, w.ids[side].hand[1]).state;
  expect(engine.decision(state)?.side).toBe(opponent(side));
  return { ...w, state, copies, subject, events: [...played.events, ...partial.events] };
}

describe("temporary public base spark retention", () => {
  it.each(SIDES)("keeps two ceased copies and opposing Interrupt target legality for %s", side => {
    const w = copied(side), other = opponent(side);
    const sampled = engine.determinize(engine.view(w.state, other), decklists(w.state), () => 0.5);
    expect(engine.legalActions(sampled, other)).not.toContainEqual({ kind: "play", card: w.ids[other].hand[0], from: "hand" });
    expect(w.state.floating).toHaveLength(3);
    for (const viewer of SIDES) {
      expect(engine.view(w.state, viewer).instances[w.subject].characteristics.spark).toBe(7);
      expect(engine.view(w.state, viewer).floating).toEqual(w.state.floating.map(effect => ({ ...effect, source: typeof effect.source === "string" && w.copies.includes(effect.source) ? null : effect.source })));
      for (const event of starts(w.events)) expect(eventSeenBy(event, viewer, w.state)).toEqual({ ...event, source: typeof event.source === "string" && w.copies.includes(event.source) ? null : event.source });
    }
    expect(engine.legalActions(w.state, other)).not.toContainEqual({ kind: "play", card: w.ids[other].hand[0], from: "hand" });
    checkProjection(w.state, w.subject);
    const settled = settle(w.state).state;
    expect(settled.floating).toHaveLength(3);
    for (const viewer of SIDES) expect(engine.view(settled, viewer).floating.find(effect => effect.source === w.ids[side].hand[0])).toBeDefined();
    checkProjection(settled, w.subject);
  });

  it.each(SIDES)("expires through Ending and restores target availability for %s", side => {
    const w = copied(side), current = settle(w.state).state;
    const ended = passUntil(engine, current, at(engine, opponent(side), "day")).state;
    expect(ended.floating).toEqual([]);
    expect(engine.view(ended, side).instances[w.subject].characteristics.spark).toBe(1);
    expect(engine.legalActions(ended, opponent(side))).toContainEqual({ kind: "play", card: w.ids[opponent(side)].hand[0], from: "hand" });
    checkProjection(ended, w.subject);
  });

  it.each(SIDES)("keeps unknown hand-source printing and physical identity private for %s", side => {
    const other = opponent(side);
    const w = boardState(engine.catalog, { active: other, phase: "day", [side]: {
      back: [v.vanilla1.id], hand: [hidden.id, decoy.id], deck,
    }, [other]: { hand: [idle.id], deck } });
    const finished = settle(play(w.state, other, w.ids[other].hand[0]).state);
    const state = finished.state, subject = occupied(w.ids[side].back[0]), source = w.ids[side].hand[0];
    const seen = engine.view(state, other);
    expect(seen.floating).toHaveLength(1);
    expect(seen.floating[0].source).toBeNull();
    expect(seen.instances[source]).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain(`"${source}"`);
    expect(JSON.stringify(seen)).not.toContain(hidden.id);
    expect(JSON.stringify(seen)).not.toContain(decoy.id);
    for (const event of starts(finished.events)) expect(eventSeenBy(event, other, state)).toEqual({ ...event, source: null });
    checkProjection(state, subject);
    const altered = deserializeState(serializeState(state)), second = w.ids[side].hand[1];
    altered.instances[source] = { ...state.instances[source], printing: state.instances[second].printing };
    altered.instances[second] = { ...state.instances[second], printing: state.instances[source].printing };
    expect(engine.view(altered, other)).toEqual(seen);
    expect(stateHash(engine.determinize(engine.view(altered, other), decklists(state), () => 0.5)))
      .toBe(stateHash(engine.determinize(seen, decklists(state), () => 0.5)));
    const hiddenTarget = deserializeState(serializeState(state));
    hiddenTarget.floating = hiddenTarget.floating.map(effect => ({ ...effect, change: { kind: "baseSpark", instance: source, value: 7 } }));
    expect(engine.view(hiddenTarget, other).floating).toEqual([]);
  });

  it.each(SIDES)("redacts source-dependent expiry after real departure and JSON event transport for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [leaving.id, v.vanilla1.id], deck } });
    const source = occupied(w.ids[side].back[0]);
    const departed = engine.apply(w.state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(departed.state.instances[source]?.zone).toBe("deck");
    expect(departed.state.floating).toEqual([]);
    expect(starts(departed.events)).toHaveLength(2);
    for (const raw of [departed.events, JSON.parse(JSON.stringify(departed.events)) as EngineEvent[]]) for (const viewer of SIDES) {
      expect(engine.view(departed.state, viewer).instances[source]).toBeUndefined();
      for (const event of starts(raw)) expect(eventSeenBy(event, viewer, departed.state)).toBeNull();
      expect(engine.view(departed.state, viewer).floating).toEqual([]);
    }
    const live = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [resident.id, v.vanilla1.id], deck } });
    const visible = engine.apply(live.state, side, { kind: "activate", source: occupied(live.ids[side].back[0]), ability: 0 }, NO_PROMPTS);
    for (const viewer of SIDES) {
      expect(engine.view(visible.state, viewer).floating).toHaveLength(2);
      for (const event of starts(visible.events)) expect(eventSeenBy(event, viewer, visible.state)).toEqual(event);
    }
    checkProjection(visible.state, occupied(live.ids[side].back[1]));
  });

  it.each(SIDES)("keeps permanent observations within the permanent snapshot model for %s", side => {
    const w = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [v.vanilla1.id], hand: [lasting.id], deck } });
    const state = settle(play(w.state, side, w.ids[side].hand[0]).state).state;
    expect(state.floating).toHaveLength(1);
    expect(state.floating[0].expiry).toEqual({ at: "never" });
    const next = passUntil(engine, state, at(engine, opponent(side), "day")).state;
    expect(next.floating).toEqual(state.floating);
    checkProjection(next, occupied(w.ids[side].back[0]));
    for (const viewer of SIDES) expect(next.rememberedCards?.[viewer].flatMap(record => record.effects).every(effect => effect.expiry.at === "never")).toBe(true);
  });

  it.each(SIDES)("restarts the fold with the same public obligations and expiry for %s", side => {
    const w = copied(side), committed = settle(w.state).state;
    const input = { init: { seed: "retained-base-spark", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(committed) };
    const parsed = parseEngineBattleFold(JSON.parse(JSON.stringify(input)));
    if (parsed === null) throw new Error("Synthetic retained effect save failed validation");
    const direct = createFoldAdapter(engine), restarted = createFoldAdapter(engine);
    const intent = { kind: "battleAction", side, action: { kind: "pass" } } as const;
    const before = stateHash(committed);
    const original = direct.reduce(input.slice, intent), loaded = restarted.reduce(parsed.slice, intent);
    expect(loaded).toEqual(original);
    expect(stateHash(committed)).toBe(before);
    if (loaded.kind !== "applied" || loaded.error !== null) throw new Error("Expected resumed fold");
    checkProjection(loaded.slice.committed, w.subject);
    const end = passUntil(engine, loaded.slice.committed, at(engine, opponent(side), "day")).state;
    expect(end.floating).toEqual([]);
    expect(engine.view(end, side).instances[w.subject].characteristics.spark).toBe(1);
  });
});
