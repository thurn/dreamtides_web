import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, countersCost, energy, event, highestSpark, keyword, self, staticAbility, supported } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { effectiveSpark } from "../../../rules/spark";
import { enterPlay, gainControl, moveInstance } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type CardId, type InstanceId, type Side, type Slot } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { runStep } from "../../../steps/runner";
import type { AnswerSource } from "../../../steps/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { createFigments } from "../../../rules/figments";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { triggerNamed } from "../../../triggers/matcher";
import { view } from "../../../view/view";
import * as p from "../index";

const pump: EngineCardDefinition = { ...v.event0, id: syntheticId(0x588001), abilities: () => [event(p.gainSpark(highestSpark(), 1))] };
const optional: EngineCardDefinition = { ...pump, id: syntheticId(0x588002), abilities: () => [event(p.sequence(p.gainSpark(highestSpark(), 1), p.optional(p.gainEnergy(1))))] };
const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x588003), abilities: () => [triggered(onDawn(), p.gainSpark(highestSpark(), 1))] };
const protectedCard: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(0x588004), abilities: () => [keyword("cannotBeTargeted")] };
const supporter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x588005), abilities: () => [staticAbility(p.sparkModifier(supported(), 3))] };
const modifier: EngineCardDefinition = { ...pump, id: syntheticId(0x588006), abilities: () => [event(p.sequence(p.sparkModifier(all(characterYouControl()), -9), p.gainSpark(highestSpark(), 1)))] };
const changed: EngineCardDefinition = { ...pump, id: syntheticId(0x588007), abilities: () => [event(p.sequence(p.setBaseSpark(all(characterYouControl()), 0), p.gainSpark(highestSpark(), 1)))] };
const invalidStatic: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x588008), abilities: () => [staticAbility(p.sparkModifier(highestSpark(), 1))] };
const variable: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x588009), spark: "x", costs: [energy(0)] };
const interrupt: EngineCardDefinition = { ...v.event0, id: syntheticId(0x58800a), speed: "interrupt", abilities: () => [event(p.gainEnergy(1))] };
const durationSource: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x58800b), abilities: () => [triggered(onDawn(), p.sequence(p.gainSpark(self(), 4, "untilEndOfTurn"), p.gainSpark(highestSpark(), 1)))] };
const remat: EngineCardDefinition = { ...pump, id: syntheticId(0x58800c), abilities: () => [event(p.sequence(p.rematerialize(highestSpark()), p.gainSpark(highestSpark(), 1)))] };
const counterSpark: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x58800d), abilities: () => [activated([countersCost(2)], p.gainSpark(self(), 4))] };
const engine = createEngine(testCatalog([pump, optional, source, protectedCard, supporter, modifier, changed, invalidStatic, variable, interrupt, durationSource, remat, counterSpark], {}, ZONE_FIGMENTS));
const gains = (events: readonly EngineEvent[]) => events.filter((e) => e.kind === "sparkGained");
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function setup(side: Side, cards: readonly CardId[], slots?: readonly Slot[], effect = pump.id) {
  const { state, ids } = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: [effect, ...cards], energy: 20, deck: [v.vanilla1.id] },
    [opponent(side)]: { hand: [interrupt.id, v.vanilla5.id], deck: [v.vanilla1.id] },
  });
  const characters = ids[side].hand.slice(1);
  const ctx = new Context(state, engine.catalog, NO_PROMPTS);
  characters.forEach((id, index) => enterPlay(ctx, id, side, slots?.[index] ?? { rank: "back", index }, true));
  enterPlay(ctx, ids[opponent(side)].hand[1], opponent(side), { rank: "back", index: 0 }, true);
  return { state, characters, card: ids[side].hand[0], ctx };
}
function cast(state: BattleState, side: Side, card: InstanceId, answers: AnswerSource = NO_PROMPTS) {
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, NO_PROMPTS);
  const done = engine.apply(played.state, opponent(side), { kind: "pass" }, answers);
  expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(done.events, played.state, done.state)).toEqual([]);
  return done;
}
function expectRecipient(result: ReturnType<typeof cast>, id: InstanceId | null) {
  expect(gains(result.events).map((e) => e.instance)).toEqual(id === null ? [] : [id]);
  expect(result.events.some((e) => e.kind === "noLegalTarget")).toBe(false);
  expect(result.answers).toEqual([]);
}

describe("highest-spark reference", () => {
  it.each(["player", "enemy"] as const)("%s selects the unique maximum in every front and back position, independent of enemy spark", (side) => {
    for (const rank of ["front", "back"] as const) for (let index = 0; index < (rank === "front" ? 9 : 10); index++) {
      const other = { rank: rank === "front" ? "back" : "front", index: 0 } as const;
      const { state, characters, card } = setup(side, [v.vanilla1.id, protectedCard.id], [other, { rank, index }]);
      const done = cast(state, side, card);
      expectRecipient(done, characters[1]);
      expect(effectiveSpark(done.state, engine.catalog, characters[1])).toBe(4);
    }
  });

  it.each(["player", "enemy"] as const)("%s resolves equal maxima by actual oldest entry, not position or all leaders", (side) => {
    for (const oldRank of ["front", "back"] as const) {
      const youngRank = oldRank === "front" ? "back" : "front";
      const { state, characters, card } = setup(side, [protectedCard.id, v.vanilla3.id, v.vanilla1.id], [{ rank: oldRank, index: 7 }, { rank: youngRank, index: 0 }, { rank: youngRank, index: 1 }]);
      expectRecipient(cast(state, side, card), characters[0]);
    }
  });

  it("does not reject lower duplicate ages or newer duplicate ages after evaluating the final maximum cohort", () => {
    const unique = setup("player", [v.vanilla1.id, v.vanilla1.id, v.vanilla3.id]);
    unique.state.instances[unique.characters[0]].enteredZoneAt = 0;
    unique.state.instances[unique.characters[1]].enteredZoneAt = 0;
    expectRecipient(cast(unique.state, "player", unique.card), unique.characters[2]);
    const tied = setup("player", [v.vanilla3.id, v.vanilla3.id, v.vanilla3.id]);
    tied.state.instances[tied.characters[2]].enteredZoneAt = tied.state.instances[tied.characters[1]].enteredZoneAt;
    expectRecipient(cast(tied.state, "player", tied.card), tied.characters[0]);
  });

  it.each(["player", "enemy"] as const)("%s keeps age after reposition, control changes and rematerialize, but reentry becomes youngest", (side) => {
    const initial = setup(side, [v.vanilla3.id, v.vanilla3.id], undefined, remat.id);
    const [older, younger] = initial.characters; const card = initial.card;
    const moved = runStep(initial.state, { kind: "reposition", card: older, to: { rank: "front", index: 6 } }, NO_PROMPTS, engine.catalog);
    if (moved.kind !== "done") throw new Error("Unexpected prompt");
    const state = moved.state; const ctx = new Context(state, engine.catalog, NO_PROMPTS);
    gainControl(ctx, older, opponent(side)); gainControl(ctx, older, side);
    expectRecipient(cast(state, side, card), older);
    // Actual departure and enterPlay create a new current play object.
    moveInstance(ctx, older, "hand"); enterPlay(ctx, older, side, { rank: "front", index: 8 }, true);
    expectRecipient(cast(state, side, card), younger);
  });

  it.each(["player", "enemy"] as const)("%s reads current effective gained/duration/Support/counter/X/figment values", (side) => {
    const gained = setup(side, [v.vanilla1.id, v.vanilla3.id]);
    gained.state.instances[gained.characters[0]].status.gainedSpark = 4;
    gained.state.instances[gained.characters[1]].status.counters = 20;
    expectRecipient(cast(gained.state, side, gained.card), gained.characters[0]);
    const duration = setup(side, [durationSource.id, v.vanilla3.id]);
    triggerNamed(duration.ctx, duration.characters[0], "dawn");
    const resolved = runStep(duration.state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    if (resolved.kind !== "done") throw new Error("Unexpected prompt");
    expect(gains(resolved.events).map((e) => e.instance)).toEqual([duration.characters[0], duration.characters[0]]);
    expect(effectiveSpark(resolved.state, engine.catalog, duration.characters[0])).toBe(6);
    const supportedState = setup(side, [v.vanilla1.id, supporter.id, v.vanilla3.id], [{ rank: "front", index: 0 }, { rank: "back", index: 0 }, { rank: "back", index: 2 }]);
    expectRecipient(cast(supportedState.state, side, supportedState.card), supportedState.characters[0]);
    const x = setup(side, [variable.id, v.vanilla3.id]);
    x.state.instances[x.characters[0]].status.x = 6;
    expectRecipient(cast(x.state, side, x.card), x.characters[0]);
    const fig = setup(side, [v.vanilla3.id]);
    const id = placeFigment(fig.state, side, { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla5.id, spark: null });
    expectRecipient(cast(fig.state, side, fig.card), id);
    const ordinary = setup(side, [v.vanilla3.id]);
    const [made] = createFigments(ordinary.ctx, side, { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 7 }, { amplified: false }, 1);
    expectRecipient(cast(ordinary.state, side, ordinary.card), made);
  });

  it.each(["player", "enemy"] as const)("%s ranks a real counter-paid spark gain, while unpaid counters grant no spark", (side) => {
    const unpaid = setup(side, [counterSpark.id, v.vanilla3.id]);
    expect(engine.legalActions(unpaid.state, side)).not.toContainEqual({ kind: "activate", source: unpaid.characters[0], ability: 0 });
    const funded = setup(side, [counterSpark.id, v.vanilla3.id]); const id = funded.characters[0];
    funded.state.instances[id].status.counters = 2;
    const activated = engine.apply(funded.state, side, { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    expect(activated.events).toContainEqual({ kind: "countersChanged", instance: id, counters: 0 });
    const gained = engine.apply(activated.state, opponent(side), { kind: "pass" }, NO_PROMPTS);
    expect(gains(gained.events).map((e) => [e.instance, e.amount])).toEqual([[id, 4]]);
    expectRecipient(cast(gained.state, side, funded.card), id);
  });

  it.each(["player", "enemy"] as const)("%s recomputes after preceding instructions and treats a clamped zero tie as oldest", (side) => {
    for (const effect of [modifier.id, changed.id]) {
      const { state, characters, card } = setup(side, [v.vanilla1.id, v.vanilla3.id], undefined, effect);
      expectRecipient(cast(state, side, card), characters[0]);
    }
    const empty = setup(side, []);
    expectRecipient(cast(empty.state, side, empty.card), null);
  });

  it.each(["player", "enemy"] as const)("%s queued abilities retain their controller and read rankings after source control/departure", (side) => {
    for (const departure of [false, true]) {
      const { state, characters: [origin, recipient, rival], ctx } = setup(side, [source.id, v.vanilla1.id, v.vanilla3.id]);
      triggerNamed(ctx, origin, "dawn");
      if (departure) moveInstance(ctx, origin, "hand"); else gainControl(ctx, origin, opponent(side));
      state.instances[recipient].status.gainedSpark = 5;
      const result = runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
      if (result.kind !== "done") throw new Error("Unexpected prompt");
      expect(gains(result.events).map((e) => e.instance)).toEqual([recipient]);
      expect(result.state.instances[rival].status.gainedSpark).toBe(0);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it("rejects static selection and ambiguous earliest chronology atomically; valid retry applies once", () => {
    const invalid = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [invalidStatic.id] } });
    expect(() => effectiveSpark(invalid.state, engine.catalog, invalid.ids.player.back[0]!)).toThrow();
    const ambiguous = setup("player", [v.vanilla3.id, v.vanilla3.id]);
    ambiguous.state.instances[ambiguous.characters[1]].enteredZoneAt = ambiguous.state.instances[ambiguous.characters[0]].enteredZoneAt;
    const played = engine.apply(ambiguous.state, "player", { kind: "play", card: ambiguous.card, from: "hand" }, NO_PROMPTS);
    const fold = createFoldAdapter(engine); const start = sliceOf(played.state); const hash = stateHash(start.committed);
    const failed = fold.reduce(start, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    expect(failed.kind).toBe("applied");
    if (failed.kind !== "applied") throw new Error("Expected failed step");
    expect(failed.error).not.toBeNull(); expect(stateHash(failed.slice.committed)).toBe(hash);
    const corrected = deserializeState(serializeState(start.committed));
    corrected.instances[ambiguous.characters[1]].enteredZoneAt = ++corrected.clock;
    const done = applied(fold.reduce(sliceOf(corrected), { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(done.committed.instances[ambiguous.characters[0]].status.gainedSpark).toBe(1);
  });

  it.each(["player", "enemy"] as const)("%s preserves UUID logs/public views/reload and partial-step error, malformed and stale-answer boundaries", (side) => {
    const records: EngineLogRecord[] = [];
    const { state, characters, card } = setup(side, [v.vanilla1.id, v.vanilla3.id], undefined, optional.id);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const played = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    const hash = stateHash(played.committed);
    const opening = fold.reduce(played, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } });
    const opened = applied(opening);
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "confirm", side, purpose: { role: "youMay", cardId: optional.id } });
    expect(pending.display.instances[characters[1]].status.gainedSpark).toBe(1);
    expect(stateHash(opened.committed)).toBe(hash);
    for (const [answerSide, value] of [[opponent(side), true], [side, 2]] as const) {
      expect(fold.reduce(opened, { kind: "answer", side: answerSide, promptId: pending.prompt.id, value }).kind).toBe("bounced");
      expect(stateHash(opened.committed)).toBe(hash);
    }
    expect(fold.reduce(opened, { kind: "battleAction", side, action: { kind: "pass" } }).kind).toBe("bounced");
    expect(stateHash(opened.committed)).toBe(hash);
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: false } as const;
    const outcome = fold.reduce(opened, answer); const done = applied(outcome);
    const restarted = applied(fold.reduce(JSON.parse(JSON.stringify(opened)) as BattleSlice, answer));
    expect(stateHash(done.committed)).toBe(stateHash(restarted.committed));
    if (outcome.kind !== "applied") throw new Error("Expected applied");
    if (opening.kind !== "applied") throw new Error("Expected opening");
    expect(gains([...opening.published, ...outcome.published]).map((e) => e.instance)).toEqual([characters[1]]);
    expect(gains(outcome.published)).toEqual([]);
    expect(fold.reduce(done, answer).kind).toBe("bounced");
    const replay = cast(deserializeState(serializeState(state)), side, card, new ScriptedSource([false]));
    expect(stateHash(replay.state)).toBe(stateHash(done.committed));
    expect(view(replay.state, side, engine.catalog)).toEqual(view(done.committed, side, engine.catalog));
    expect(view(replay.state, opponent(side), engine.catalog)).toEqual(view(done.committed, opponent(side), engine.catalog));
    expect(records).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", value: false }));
    const sourceError = { answer() { throw new Error("injected answer failure"); } };
    expect(() => engine.apply(played.committed, opponent(side), { kind: "pass" }, sourceError)).toThrow();
    expect(stateHash(played.committed)).toBe(hash);
  });
});
