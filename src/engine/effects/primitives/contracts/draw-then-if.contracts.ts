/** An ordinary draw's conditional branch binds only its returned physical card. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, characterYouControl, costPaid, energy, energyX, event, optionalCost, target, x } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { triggered, whenDraw } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ZONE } from "../../../testing/zone-cards";
import { resolveEffect } from "../../interpreter";
import type { ResolvingEffect } from "../../registry";
import { chooseOne } from "../choose-one";
import { drawThenIf } from "../draw-then-if";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { optional } from "../optional";
import { repeat } from "../repeat";
import { sequence } from "../sequence";

function fixture(index: number, effect: ResolvingEffect): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x21610 + index), status: "authored", abilities: () => [event(effect)] };
}
const source = DSL.drawThenIfCharacter;
const branch = drawThenIf({ cardType: "character" }, chooseOne(gainSpark(target(characterYouControl()), 2), gainPoints(4)));
const choices = fixture(0, branch);
const declined = fixture(1, drawThenIf({ cardType: "character" }, optional(gainPoints(4))));
const repeated = fixture(2, repeat(3, drawThenIf({ cardType: "character" }, gainEnergy(1))));
const sequential = fixture(3, sequence(drawThenIf({ cardType: "event" }, gainPoints(2)), drawThenIf({ cardType: "character" }, gainPoints(3))));
const filtered = fixture(4, drawThenIf({ cardType: "character", subtype: "Mage", costAtMost: 2, sparkAtLeast: 4 }, gainPoints(7)));
const targeted = fixture(5, drawThenIf({ cardType: "character" }, gainSpark(target(characterYouControl()), 2)));
const contextEffect = drawThenIf({ cardType: "character" }, sequence(
  optional(gainPoints(x())), ifThen(costPaid(), gainEnergy(1)),
), "opponent");
const context: EngineCardDefinition = { ...fixture(6, contextEffect), costs: [energyX()], abilities: () => [additionalCost(optionalCost(energy(1))), event(contextEffect)] };
const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x21618), status: "authored", abilities: () => [triggered(whenDraw(), gainPoints(3))] };
const errorEffect = drawThenIf({ cardType: "character" }, gainEnergy(3));
const failure: EngineCardDefinition = { ...fixture(9, errorEffect), synthetic: { resolve(ctx, item) {
  resolveEffect(ctx, errorEffect, { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
    ability: 0, controller: item.controller, x: item.x, optionalPaid: item.optionalPaid, choices: item.choices[0] });
  throw new Error("synthetic failure after conditional child");
} } };
const convertedType = fixture(10, drawThenIf({ cardType: "character", subtype: "Mage", costAtMost: 2 }, gainPoints(7)));
const engine = createEngine(testCatalog([...DSL_CARDS, choices, declined, repeated, sequential, filtered, targeted, context, watcher, failure, convertedType, ZONE.echo]));
const filler = [v.event0.id, v.event1.id];
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome) {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`unexpected fold outcome ${JSON.stringify(result)}`);
  return result;
}
const play = (card: InstanceId) => ({ kind: "play" as const, card, from: "hand" as const });
function board(side: Side, card: CardId, deck: readonly CardId[], retained: readonly CardId[] = []) {
  return boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card, ...retained], deck, energy: 5 }, [opponent(side)]: { deck: filler } });
}
function run(side: Side, card: CardId, deck: readonly CardId[], retained: readonly CardId[] = []) {
  const setup = board(side, card, deck, retained);
  const result = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), NO_PROMPTS);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, setup.state, result.state)).toEqual([]);
  return { ...setup, result };
}

describe("drawThenIf", () => {
  it.each(["player", "enemy"] as const)("%s binds the successful top card, ignores an opposite-type retained hand and preserves Fatigue", (side) => {
    for (const [deck, retained, bonus] of [
      [[v.vanilla1.id, v.event1.id], [v.event0.id], 1],
      [[v.event1.id, v.vanilla1.id], [v.vanilla1.id], 0],
      [[], [v.vanilla1.id], 0],
    ] as const) {
      const { state, ids, result } = run(side, source.id, deck, retained);
      expect(result.state.sides[side].currentEnergy - state.sides[side].currentEnergy).toBe(bonus);
      expect(result.state.sides[side].hand).toEqual([...ids[side].hand.slice(1), ...ids[side].deck.slice(0, 1)]);
      expect(result.state.sides[side].deck).toEqual(ids[side].deck.slice(1));
      expect(result.state.turnLog.drawn[side]).toBe(deck.length === 0 ? 0 : 1);
      expect(result.events.filter((e) => e.kind === "cardDrawn")).toEqual(deck.length === 0 ? [] : [{ kind: "cardDrawn", side, instance: ids[side].deck[0] }]);
      expect(result.events.filter((e) => e.kind === "fatigue")).toEqual(deck.length === 0 ? [{ kind: "fatigue", side, points: 1 }] : []);
      expect(result.state.sides[opponent(side)].score).toBe(deck.length === 0 ? 1 : 0);
      expect(result.state.rng).toEqual(state.rng);
    }
  });

  it.each(["player", "enemy"] as const)("%s reads effective type, subtype, spark and copiable cost on the exact physical card", (side) => {
    const setup = board(side, convertedType.id, [v.event1.id], [v.event1.id]);
    const converted = { amplified: false, deckMods: { ...NO_DECK_MODS, sparkBonus: 4, typeChange: { cardType: "character" as const, subtype: "Mage" as const } } };
    const drawn = setup.ids[side].deck[0];
    setup.state.instances[drawn] = { ...setup.state.instances[drawn], variant: converted };
    const result = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), NO_PROMPTS);
    expect(result.state.sides[side].score).toBe(7);
    expect(result.state.sides[side].hand).toEqual([setup.ids[side].hand[1], drawn]);
    const opposite = board(side, convertedType.id, [v.event1.id], [v.event1.id]);
    const old = opposite.ids[side].hand[1];
    opposite.state.instances[old] = { ...opposite.state.instances[old], variant: converted };
    expect(engine.apply(opposite.state, side, play(opposite.ids[side].hand[0]), NO_PROMPTS).state.sides[side].score).toBe(0);
    const costly = board(side, filtered.id, [v.vanilla5.id]);
    const top = costly.ids[side].deck[0];
    costly.state.instances[top] = { ...costly.state.instances[top], variant: { ...converted, deckMods: { ...converted.deckMods, costReduction: 3 } } };
    expect(engine.apply(costly.state, side, play(costly.ids[side].hand[0]), NO_PROMPTS).state.sides[side].score).toBe(7);
    const lowSpark = board(side, filtered.id, [v.vanilla1.id]);
    const low = lowSpark.ids[side].deck[0];
    lowSpark.state.instances[low] = { ...lowSpark.state.instances[low], variant: { ...converted, deckMods: { ...converted.deckMods, sparkBonus: 0 } } };
    expect(engine.apply(lowSpark.state, side, play(lowSpark.ids[side].hand[0]), NO_PROMPTS).state.sides[side].score).toBe(0);
  });

  it.each(["player", "enemy"] as const)("%s performs repeated, sequential and copied draws with independent bindings and replay", (side) => {
    const repetition = run(side, repeated.id, [v.vanilla1.id, v.event1.id, v.vanilla1.id]);
    expect(repetition.result.state.sides[side].currentEnergy).toBe(7);
    expect(repetition.result.state.turnLog.drawn[side]).toBe(3);
    const consecutive = run(side, sequential.id, [v.event1.id, v.vanilla1.id]);
    expect(consecutive.result.state.sides[side].score).toBe(5);
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [source.id], back: [ZONE.echo.id], deck: [v.event1.id, v.vanilla1.id] }, [opponent(side)]: { deck: filler } });
    const copied = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), NO_PROMPTS);
    expect(copied.state.sides[side].currentEnergy).toBe(1);
    expect(copied.events.filter((e) => e.kind === "cardCopied")).toHaveLength(1);
    expect(copied.events.filter((e) => e.kind === "cardPlayed")).toHaveLength(1);
    expect(copied.events.flatMap((e) => e.kind === "cardDrawn" ? [e.instance] : [])).toEqual(setup.ids[side].deck);
    const reloaded = JSON.parse(JSON.stringify(setup.state)) as BattleState;
    expect(stateHash(engine.apply(reloaded, side, play(setup.ids[side].hand[0]), NO_PROMPTS).state)).toBe(stateHash(copied.state));
  });

  it.each(["player", "enemy"] as const)("%s draws privately once, retains ordinary knowledge and resolves draw triggers after the child", (side) => {
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [source.id], back: [watcher.id], deck: [v.vanilla2.id, v.event1.id] }, [opponent(side)]: { deck: filler } });
    setup.state.knownTo[opponent(side)] = [setup.ids[side].deck[1]];
    const result = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), NO_PROMPTS);
    expect(result.state.turnLog.drawn[side]).toBe(1);
    expect(result.state.sides[side]).toMatchObject({ currentEnergy: 1, score: 3 });
    expect(result.events.filter((e) => e.kind === "triggerResolved")).toHaveLength(1);
    expect(result.events.findIndex((e) => e.kind === "energyChanged")).toBeLessThan(result.events.findIndex((e) => e.kind === "triggerResolved"));
    const drawn = result.events.find((e) => e.kind === "cardDrawn")!;
    expect(eventSeenBy(drawn, opponent(side), result.state)).toEqual({ kind: "cardDrawn", side, instance: null });
    expect(engine.view(result.state, opponent(side)).sides[side].hand).toEqual({ count: 1, known: [] });
    expect(engine.view(result.state, opponent(side)).sides[side].deck.known).toEqual([{ id: setup.ids[side].deck[1], index: 0 }]);
    expect(engine.view(result.state, side).sides[side].hand).toEqual({ count: 1, known: [{ id: setup.ids[side].deck[0], index: 0 }] });
  });

  it.each(["player", "enemy"] as const)("%s offers only a matching child, after drawing, and resumes the same mode and target after reload", (side) => {
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [choices.id], back: [v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla1.id] }, [opponent(side)]: { deck: filler } });
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const opened = applied(fold.reduce(slice(setup.state), { kind: "battleAction", side, action: play(setup.ids[side].hand[0]) }));
    const mode = fold.pending(opened.slice)!;
    expect(mode.prompt).toMatchObject({ kind: "chooseMode", side, cancellable: false, purpose: { source: setup.ids[side].hand[0], cardId: choices.id } });
    expect(mode.display.sides[side].hand).toEqual([setup.ids[side].deck[0]]);
    expect(mode.display.turnLog.drawn[side]).toBe(1);
    expect(fold.reduce(opened.slice, { kind: "cancel", side, promptId: mode.prompt.id }).kind).toBe("bounced");
    expect(fold.reduce(opened.slice, { kind: "answer", side: opponent(side), promptId: mode.prompt.id, value: 0 }).kind).toBe("bounced");
    const selected = applied(fold.reduce(opened.slice, { kind: "answer", side, promptId: mode.prompt.id, value: 0 }));
    const pending = fold.pending(selected.slice)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", candidates: setup.ids[side].back });
    const saved = JSON.parse(JSON.stringify(selected.slice)) as BattleSlice;
    const fresh = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    expect(fresh.reduce(saved, { kind: "answer", side, promptId: mode.prompt.id, value: 1 }).kind).toBe("bounced");
    expect(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: [setup.ids[side].deck[0]] }).kind).toBe("bounced");
    const intent = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [setup.ids[side].back[1]!] };
    const done = applied(fresh.reduce(saved, intent));
    expect(fresh.pending(done.slice)).toBeNull();
    expect(effectiveSpark(done.slice.committed, engine.catalog, setup.ids[side].back[1]!)).toBe(4);
    expect(done.slice.committed.turnLog.drawn[side]).toBe(1);
    expect(fresh.reduce(done.slice, { ...intent, value: [setup.ids[side].back[0]!] }).kind).toBe("bounced");
    const inline = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), new ScriptedSource([0, intent.value]));
    expect(stateHash(done.slice.committed)).toBe(stateHash(inline.state));
    expect(records.filter((record) => record.event === "engine.promptOpened").map((record) => record.cardId)).toEqual([choices.id, choices.id]);
    for (const deck of [[v.event1.id], []]) {
      const missed = run(side, choices.id, deck, [v.vanilla1.id]);
      expect(missed.result.answers).toEqual([]);
      expect(missed.result.events.filter((e) => e.kind === "noLegalTarget")).toEqual([]);
    }
  });

  it.each(["player", "enemy"] as const)("%s keeps a draw when the matching child is declined or has no legal target", (side) => {
    const setup = board(side, declined.id, [v.vanilla1.id]);
    const answers = new ScriptedSource([false]);
    const result = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), answers);
    answers.assertExhausted();
    expect(result.state.sides[side].hand).toEqual(setup.ids[side].deck);
    expect(result.state.sides[side].score).toBe(0);
    const unavailable = run(side, targeted.id, [v.vanilla1.id]);
    expect(unavailable.result.state.sides[side].hand).toEqual(unavailable.ids[side].deck);
    expect(unavailable.result.events.filter((e) => e.kind === "noLegalTarget")).toHaveLength(1);
  });

  it.each(["player", "enemy"] as const)("%s retains the original controller, X, optional payment and prompt source when the opponent draws", (side) => {
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [context.id], deck: filler, energy: 5 }, [opponent(side)]: { deck: [v.vanilla1.id] } });
    const answers = new ScriptedSource([2, true, true]);
    const prompts: Prompt[] = [];
    const result = engine.apply(setup.state, side, play(setup.ids[side].hand[0]), { answer(prompt) { prompts.push(prompt); return answers.answer(prompt); } });
    answers.assertExhausted();
    expect(result.state.sides[side]).toMatchObject({ currentEnergy: 3, score: 2, hand: [] });
    expect(result.state.sides[opponent(side)].hand).toEqual(setup.ids[opponent(side)].deck);
    expect(result.state.turnLog.drawn).toEqual({ [side]: 0, [opponent(side)]: 1 });
    expect(prompts[prompts.length - 1]).toMatchObject({ kind: "confirm", side, purpose: { source: setup.ids[side].hand[0], cardId: context.id, role: "youMay" } });
  });

  it("rolls back a mid-resolution failure's real draw and partial child writes without publishing them", () => {
    const setup = board("player", failure.id, [v.vanilla1.id, v.event1.id]);
    setup.state.knownTo.enemy = [setup.ids.player.deck[1]];
    const before = stateHash(setup.state);
    const fold = createFoldAdapter(engine);
    const result = fold.reduce(slice(setup.state), { kind: "battleAction", side: "player", action: play(setup.ids.player.hand[0]) });
    if (result.kind !== "applied" || result.error === null) throw new Error("expected synthetic resolution failure");
    expect(result.slice.committed.sides.player).toMatchObject({ currentEnergy: 5, deck: setup.ids.player.deck, hand: [] });
    expect(result.slice.committed.turnLog.drawn.player).toBe(0);
    expect(result.slice.committed.knownTo.enemy).toEqual(setup.state.knownTo.enemy);
    expect(result.slice.committed.stack).toHaveLength(1);
    expect(result.published.filter((e) => e.kind === "cardDrawn" || e.kind === "energyChanged")).toEqual([]);
    expect(fold.pending(result.slice)).toBeNull();
    expect(stateHash(setup.state)).toBe(before);
  });
});
