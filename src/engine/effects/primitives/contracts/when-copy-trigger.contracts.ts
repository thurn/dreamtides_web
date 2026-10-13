/** Copy occasions and captured hand-copy actions through public synthetic engine steps. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { activated, additionalCost, anyCharacter, costPaid, energy, energyX, event, everyIn, noCardsIn, optionalCost, self, stackItem, target, targetWhen, triggerSubjectCost, x, staticAbility, winCondition } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type CardFilter, type PlayerRef } from "../../../dsl/types";
import { triggered, triggeringCard, whenCopyTrigger, whenYouPlay } from "../../../dsl/triggers";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { randomLegalAnswer } from "../../../prompts/answers";
import type { AnswerSource } from "../../../steps/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { determinize } from "../../../view/determinize";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import type { Effect } from "../../registry";
import * as p from "../index";
import { decklists } from "./with-materialized-support";

const id = (n: number) => syntheticId(0x233000 + n);
const sign = (n: number, abilities: readonly Ability[]): EngineDreamsignDefinition => ({
  id: parseDreamsignId(`5e5e5e5e-0000-4000-8000-${(0x233100 + n).toString(16).padStart(12, "0")}`), status: "authored", abilities: () => abilities,
});
const watcher = (n: number, effect: Effect = p.gainPoints(1), options: { player?: "you" | "opponent"; filter?: CardFilter; once?: boolean } = {}) =>
  sign(n, [triggered(whenCopyTrigger(options.player ?? "you", options.filter ?? { cardType: "event" }), effect, { oncePerTurn: options.once })]);
const spell = (n: number, effect: Effect, extras: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({ ...v.event0, id: id(n), status: "authored", abilities: () => [event(effect)], ...extras });
const points = spell(1, p.gainPoints(1));
const handSelf = spell(2, p.modifyCardCost(p.createCopyInHand(self(), { ephemeral: true }), { set: 0 }), { costs: [energy(2)] });
const echo: EngineCardDefinition = { ...v.vanilla1, id: id(3), status: "authored", abilities: () => [triggered(whenYouPlay(), p.copyCard(triggeringCard()))] };
const mirror = spell(4, p.copyCard({ kind: "stackTarget", selector: stackItem({}) }), { speed: "interrupt" });
const plainCreation = spell(5, p.createCard(points.id));
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function world(signs: readonly EngineDreamsignDefinition[], side: Side, mine: SideSetup = {}, theirs: SideSetup = {}, extra: readonly EngineCardDefinition[] = []) {
  const engine = createEngine(testCatalog([points, handSelf, echo, mirror, plainCreation, ...extra], { dreamsigns: signs }));
  const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100, [side]: { hand: [points.id], energy: 20, deck, dreamsigns: signs.map(s => s.id), ...mine }, [opponent(side)]: { energy: 20, deck, ...theirs } });
  return { engine, ...board, side, other: opponent(side) };
}
function step(engine: Engine, state: BattleState, action: Step, answers: readonly Answer[] = [], automatic = false) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog, { automatic });
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
const play = (card: InstanceId): Step => ({ kind: "play", card, from: "hand" });
const copied = (events: readonly EngineEvent[]) => events.filter(event => event.kind === "cardCopied");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function handOccasion(side: Side, times = 1, effect: Effect = p.copyCardTimes(triggeringCard(), times)) {
  // Initial stack copies see an empty hand. A resolving copied event creates a
  // hand copy and ceases before FIFO drains; its new hand enables the watcher.
  const gem = sign(1, [triggered(whenCopyTrigger("you", { cardType: "event" }), effect,
    { condition: { cond: "cardsIn", zone: "hand", player: "you", atLeast: 1 } })]);
  const f = world([gem], side, { hand: [handSelf.id], back: [echo.id] });
  const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
  const made = step(f.engine, played.state, { kind: "resolveTrigger" });
  const original = copied(made.events)[0]?.copy;
  if (original === undefined) throw new Error("Expected real created original");
  const result = step(f.engine, made.state, { kind: "resolveTop" });
  expect(result.state.instances[original]).toBeUndefined();
  expect(result.state.triggerQueue).toHaveLength(1);
  return { ...f, ...result, original };
}

for (const side of SIDES) describe(`${side} copy triggers`, () => {
  it("matches the copier rather than the original owner and retains distinct physical subjects", () => {
    const own = watcher(1); const opposing = watcher(2, p.gainPoints(10), { player: "opponent" });
    const f = world([own, opposing], side, { hand: [points.id, points.id] }, { hand: [mirror.id] });
    const played = step(f.engine, f.state, play(f.ids[side].hand[0]));
    const response = step(f.engine, played.state, play(f.ids[f.other].hand[0]));
    const made = step(f.engine, response.state, { kind: "resolveTop" });
    expect(copied(made.events)).toEqual([{ kind: "cardCopied", side: f.other, original: f.ids[side].hand[0], copy: copied(made.events)[0].copy }]);
    expect(made.state.triggerQueue).toMatchObject([{ controller: side, subject: f.ids[side].hand[0], ability: 0 }]);
    expect(made.state.triggerQueue[0].source).toEqual({ kind: "dreamsign", side, index: 1 });
    const settled = step(f.engine, made.state, { kind: "resolveTrigger" });
    expect(settled.state.sides[side].score).toBe(10);
    expect(f.ids[side].hand[1]).not.toBe(f.ids[side].hand[0]);
  });

  it("matches copied copiable values before a later addressed cost modifier and rejects other creation", () => {
    const small = watcher(1, p.gainEnergy(1), { filter: { cardType: "event", costAtMost: 0 } });
    const large = watcher(2, p.gainEnergy(2), { filter: { cardType: "event", costAtLeast: 2 } });
    const f = world([small, large], side, { hand: [handSelf.id] });
    const result = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
    expect(result.state.triggerQueue).toHaveLength(1);
    expect(result.state.triggerQueue[0].source).toEqual({ kind: "dreamsign", side, index: 1 });
    expect(result.state.triggerQueue[0].handCopy).toBeUndefined();
    expect(f.engine.view(result.state, side).instances[result.state.sides[side].hand[0]].characteristics.cost).toBe(0);
    const ordinary = world([small], side, { hand: [plainCreation.id] });
    const created = step(ordinary.engine, step(ordinary.engine, ordinary.state, play(ordinary.ids[side].hand[0])).state, { kind: "resolveTop" });
    expect(created.state.triggerQueue).toEqual([]);
    expect(copied(created.events)).toEqual([]);
  });

  it("filters copied type, speed and variant while capacity failures create no occasion", () => {
    const fast = watcher(1, p.gainPoints(1), { filter: { cardType: "event", fast: true, costAtMost: 0 } });
    const f = world([fast], side, { back: [echo.id], hand: [{ cardId: points.id, deckMods: { ...NO_DECK_MODS, fast: true } }] });
    const result = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTrigger" });
    expect(result.state.triggerQueue).toHaveLength(1);
    const full = world([fast], side, { back: [echo.id, ...Array.from({ length: 8 }, () => v.vanilla1.id)], hand: [v.vanilla0.id] });
    const played = step(full.engine, full.state, play(full.ids[side].hand[0]));
    const failed = step(full.engine, played.state, { kind: "resolveTrigger" });
    expect(failed.events.some(e => e.kind === "capacityReached")).toBe(true);
    expect(copied(failed.events)).toEqual([]);
    expect(failed.state.triggerQueue).toEqual([]);
  });

  it("queues per copy after the whole instruction and enforces once per turn, resetting next turn", () => {
    const many = { ...echo, id: id(7), abilities: () => [triggered(whenYouPlay(), p.copyCardTimes(triggeringCard(), 2))] } satisfies EngineCardDefinition;
    const once = watcher(1, p.gainEnergy(1), { once: true });
    const f = world([once], side, { back: [many.id], hand: [points.id, points.id, points.id] }, {}, [many]);
    const first = f.engine.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(copied(first.events)).toHaveLength(2);
    expect(first.events.filter(e => e.kind === "triggerResolved")).toHaveLength(2);
    expect(first.state.sides[side].currentEnergy).toBe(21);
    expect(first.events.findIndex(e => e.kind === "triggerResolved" && typeof e.source === "object")).toBeGreaterThan(first.events.map(e => e.kind).lastIndexOf("cardCopied"));
    const empty = passUntil(f.engine, first.state, state => state.stack.length === 0).state;
    const second = f.engine.apply(empty, side, { kind: "play", card: f.ids[side].hand[1], from: "hand" }, NO_PROMPTS);
    expect(second.state.sides[side].currentEnergy).toBe(21);
    const otherTurn = passUntil(f.engine, second.state, at(f.engine, f.other, "day"), NO_PROMPTS, 100).state;
    const next = passUntil(f.engine, otherTurn, at(f.engine, side, "day"), NO_PROMPTS, 100).state;
    expect(next.oncePerTurn).toEqual([]);
    const third = f.engine.apply(next, side, { kind: "play", card: f.ids[side].hand[2], from: "hand" }, NO_PROMPTS);
    expect(third.events.filter(e => e.kind === "energyChanged" && e.change === 1)).toHaveLength(1);
  });

  it.each([0, 1, 2])("repeats a captured hand-copy action %i times after its original ceases", times => {
    const f = handOccasion(side, times);
    const queued = f.state.triggerQueue[0];
    expect(queued.subject).toBe(f.original);
    expect(queued.handCopy).toMatchObject({ printing: { kind: "card", cardId: handSelf.id }, variant: { amplified: false }, ephemeral: true, copier: side, originalHiddenFrom: [] });
    const result = step(f.engine, f.state, { kind: "resolveTrigger" });
    expect(result.state.sides[side].hand).toHaveLength(times + 1);
    expect(copied(result.events)).toHaveLength(times);
    for (const copy of copied(result.events)) {
      expect(copy).toMatchObject({ original: f.original, side, zone: "hand" });
      expect(result.state.instances[copy.copy].status.ephemeral).toBe(true);
      expect(f.engine.view(result.state, side).instances[copy.copy].characteristics.cost).toBe(2);
    }
    expect(result.state.triggerQueue).toHaveLength(times);
  });

  it("preserves actual owner knowledge, historical identity and hidden-context constraints across views and saves", () => {
    const f = handOccasion(side);
    const saved = deserializeState(serializeState(f.state));
    expect(stateHash(saved)).toBe(stateHash(cloneState(f.state)));
    for (const viewer of SIDES) {
      const view = f.engine.view(saved, viewer);
      const queued = view.triggerQueue[0];
      expect(queued.subject).toBe(f.original);
      if (viewer === side) expect(queued.handCopy).toEqual(saved.triggerQueue[0].handCopy);
      else { expect(queued.handCopy).toBeUndefined(); expect(queued.handCopyHidden).toBe(true); expect(queued.handCopyOriginal).toEqual({ printing: { kind: "card", cardId: handSelf.id }, variant: { amplified: false } }); }
      const sampled = determinize(view, decklists(f.state), () => 0.25, f.engine.catalog);
      expect(comparableView(f.engine.view(sampled, viewer))).toEqual(comparableView(view));
    }
    const handEvent = copied(f.events)[0];
    expect(handEvent).toBeDefined();
    if (handEvent === undefined) return;
    expect(eventSeenBy(handEvent, side, f.state)).toEqual(handEvent);
    expect(eventSeenBy(handEvent, f.other, f.state)).toBeNull();
  });

  it("keeps the copier's tuple when the original alias was hidden", () => {
    const fromHidden = spell(9, p.createCopyInHand(everyIn("hand", {}, { player: "opponent" }), { ephemeral: true }));
    const f = world([watcher(1, p.copyCard(triggeringCard()), { once: true })], side, { hand: [fromHidden.id] }, { hand: [points.id] }, [fromHidden]);
    const result = step(f.engine, step(f.engine, f.state, play(f.ids[side].hand[0])).state, { kind: "resolveTop" });
    const state = result.state;
    const view = f.engine.view(state, side);
    expect(view.triggerQueue[0].subject).toBeNull();
    expect(view.triggerQueue[0].handCopy).toEqual(state.triggerQueue[0].handCopy);
    const copyEvent = copied(result.events)[0];
    expect(eventSeenBy(copyEvent, side, state)).toMatchObject({ original: null, copy: state.sides[side].hand[0] });
    const sampled = determinize(view, decklists(state), () => 0.5, f.engine.catalog);
    expect(comparableView(f.engine.view(sampled, side))).toEqual(comparableView(view));
    expect(step(f.engine, sampled, { kind: "resolveTrigger" }).state.sides[side].hand).toHaveLength(2);
  });

  it("rejects malformed captured actions at the public saved-fold boundary", () => {
    const f = handOccasion(side);
    const init = { seed: battleSeed("board"), scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] };
    const value = { init, slice: slice(f.state) };
    expect(parseEngineBattleFold(value)).not.toBeNull();
    for (const patch of [{ extra: true }, { printing: { kind: "card", cardId: "bad" } }, { printing: { kind: "figment", figmentId: "bad" } }, { variant: { amplified: false, extra: true } }, { ephemeral: 1 }, { copier: "bad" }, { originalHiddenFrom: [side, side] }]) {
      const invalid = structuredClone(value);
      Object.assign(invalid.slice.committed.triggerQueue[0].handCopy!, patch);
      expect(parseEngineBattleFold(invalid), JSON.stringify(patch)).toBeNull();
    }
    const invalid = structuredClone(value); invalid.slice.committed.triggerQueue[0] = { ...invalid.slice.committed.triggerQueue[0], subject: null };
    expect(parseEngineBattleFold(invalid)).toBeNull();
  });

  it("captures copied cost on follow-on occasions whose original has ceased", () => {
    const counter = watcher(2, p.gainEnergy(triggerSubjectCost()));
    const base = handOccasion(side);
    const engine = createEngine(testCatalog([points, handSelf, echo, mirror, plainCreation], { dreamsigns: [watcher(1, p.copyCard(triggeringCard())), counter] }));
    const state = { ...base.state, sides: { ...base.state.sides, [side]: { ...base.state.sides[side], dreamsigns: [{ id: watcher(1).id }, { id: counter.id }] } } };
    const repeated = step(engine, state, { kind: "resolveTrigger" });
    expect(repeated.state.triggerQueue[1].lastKnownSubjectCost).toBe(2);
    expect(repeated.state.triggerQueue[1].handCopy).toBeUndefined();
  });

  it("leaves stack targets and future-trigger subjects outside captured hand semantics", () => {
    const stack = handOccasion(side, 1, p.copyCard({ kind: "stackTarget", selector: stackItem({}) }));
    expect(stack.state.triggerQueue[0].handCopy).toBeUndefined();
    const result = step(stack.engine, stack.state, { kind: "resolveTrigger" });
    expect(copied(result.events)).toHaveLength(1);
    expect(copied(result.events)[0].zone).toBeUndefined();
    expect(result.state.sides[side].hand).toHaveLength(1);
    const future = handOccasion(side, 1, p.delayed(whenYouPlay(), p.copyCard(triggeringCard())));
    expect(future.state.triggerQueue[0].handCopy).toBeUndefined();
  });

  it("contains a mid-trigger partial hand copy and permits recovery from the saved committed boundary", () => {
    const malformed: import("../copy-card").CopyCardTimesNode = { op: "copyCardTimes", card: triggeringCard(), times: -1 };
    const bad = watcher(1, p.sequence(p.copyCard(triggeringCard()), malformed), { once: true });
    const f = world([bad], side, { hand: [handSelf.id] });
    const fold = createFoldAdapter(f.engine);
    const before = stateHash(f.state);
    const failed = fold.reduce(slice(f.state), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } });
    if (failed.kind !== "applied") throw new Error("Expected contained failure");
    expect(failed.error).not.toBeNull();
    expect(failed.slice.committed.sides[side].hand).toHaveLength(1);
    expect(failed.slice.committed.triggerQueue).toHaveLength(1);
    expect(copied(failed.published)).toHaveLength(1);
    expect(stateHash(f.state)).toBe(before);
    const good = watcher(1, p.copyCardTimes(triggeringCard(), 0), { once: true });
    const repaired = createEngine({ ...f.engine.catalog, dreamsign: candidate => candidate === good.id ? good : f.engine.catalog.dreamsign(candidate) });
    const loaded = deserializeState(serializeState(failed.slice.committed));
    const recovery = step(repaired, loaded, { kind: "resolveTrigger" });
    expect(recovery.state.sides[side].hand).toHaveLength(1);
    expect(recovery.state.triggerQueue).toEqual([]);
  });

  it("preserves intentional self-retriggering and lets the existing mandatory growing-loop rule draw", () => {
    const f = handOccasion(side);
    const initial = { ...f.state, config: { ...f.state.config, resolutionCap: 8, mandatoryLoopCheckFrom: 1 } };
    let state = initial;
    let occasions = 0;
    while (state.result === null) {
      const result = step(f.engine, state, { kind: "resolveTrigger" }, [], true);
      state = result.state; occasions += copied(result.events).length;
    }
    expect(occasions).toBeGreaterThan(1);
    expect(state.sides[side].hand.length).toBe(occasions + 1);
    expect(state.result).toEqual({ kind: "draw", reason: "resolutionCap" });
  });
});

it("replays a copied-card target prompt, rejects stale/cancel input, and rolls back an invalid answer", () => {
  const targeted = spell(8, p.gainSpark(target(anyCharacter()), 1), { costs: [energyX()], abilities: () => [additionalCost(optionalCost(energy(1))), event(p.gainSpark(targetWhen(costPaid(0), anyCharacter({ costAtMost: x() }), anyCharacter({ costAtMost: 0 })), 1))] });
  const f = world([watcher(1, p.copyCard(triggeringCard()), { once: true })], "player", { hand: [targeted.id], back: [echo.id, v.vanilla1.id, v.vanilla0.id] }, { back: [v.vanilla2.id], hand: [v.interruptEvent.id] }, [targeted]);
  const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
  let current = slice(f.state);
  const apply = (intent: Parameters<typeof fold.reduce>[1]) => {
    const result = fold.reduce(current, intent);
    if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify({ result, intent, prompt: fold.pending(current)?.prompt }));
    current = result.slice; return result;
  };
  apply({ kind: "battleAction", side: "player", action: { kind: "play", card: f.ids.player.hand[0], from: "hand" } });
  for (const answer of [2, true, [f.ids.player.back[1]!], [f.ids.enemy.back[0]!]] satisfies Answer[]) {
    const pending = fold.pending(current); if (pending === null) throw new Error("Expected choice");
    apply({ kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: answer });
  }
  const pending = fold.pending(current); if (pending === null) throw new Error("Expected extra-copy target");
  expect(pending.prompt.kind).toBe("chooseTargets");
  const committed = stateHash(current.committed);
  const reloaded = JSON.parse(JSON.stringify(current)) as BattleSlice;
  expect(fold.pending(reloaded)).toEqual(pending);
  expect(fold.reduce(current, { kind: "cancel", side: "player", promptId: pending.prompt.id }).kind).toBe("bounced");
  const invalid = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: ["i999999"] });
  expect(invalid.kind).toBe("bounced"); expect(stateHash(reloaded.committed)).toBe(committed);
  apply({ kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.ids.player.back[1]!] });
  expect(fold.reduce(current, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [f.ids.player.back[1]!] }).kind).toBe("bounced");
  expect(current.committed.stack).toHaveLength(3);
  expect(current.committed.stack.every(item => item.kind === "card" && item.x === 2 && item.optionalPaid[0] === true)).toBe(true);
  expect(current.committed.turnLog.played.player).toHaveLength(1);
});

/** Real public copy occasions, with synthetic permanent emblems and passive backgrounds. */
function continuation(side: Side, hand: boolean, ephemeral = false, options: {
  body?: (copy: Effect) => Effect; extra?: readonly Ability[]; created?: boolean; temporary?: boolean; banished?: boolean;
  deckGuard?: { player: PlayerRef; cards: readonly EngineCardDefinition["id"][] };
} = {}) {
  const repeated = p.copyCard(triggeringCard());
  const gem = watcher(10, options.body?.(repeated) ?? repeated);
  const button = watcher(11, p.gainEnergy(1), { once: true });
  const background = sign(12, [
    staticAbility(p.grantCardKeyword(p.cardsIn("hand", { cardType: "event" }), "offering")),
    staticAbility(p.grantCardKeyword(p.cardsIn("void", { cardType: "event" }), "reclaim")),
    staticAbility(p.costModifier("you", { cardType: "event" }, -1)), ...(options.extra ?? []),
  ]);
  const subject = spell(10, hand ? p.createCopyInHand(self(), { ephemeral }) : p.chooseOne(
    p.gainSpark(target(anyCharacter()), 1), p.gainSpark(target(anyCharacter()), 2)));
  const maker = spell(11, p.createCard(subject.id));
  const temporary: EngineCardDefinition = { ...v.vanilla0, id: id(20), status: "authored",
    abilities: () => [activated([], p.materializeFigmentCopy(self(), { untilEndOfTurn: true }))] };
  const jailer: EngineCardDefinition = { ...v.vanilla0, id: id(22), status: "authored",
    abilities: () => [activated([], p.banishChosen({ cardType: "character" }, "whileSourceInPlay"))] };
  const guardPlayer = options.deckGuard?.player ?? "you";
  const guard: EngineCardDefinition = { ...v.vanilla0, id: id(21), status: "authored", abilities: () => [winCondition(noCardsIn("deck", guardPlayer))] };
  const f = world([gem, button, background], side,
    { hand: [options.created ? maker.id : subject.id], back: [
      ...(hand ? [v.vanilla0.id] : [echo.id, v.vanilla0.id]), ...(options.temporary ? [temporary.id] : []), ...(options.banished ? [jailer.id] : []),
    ], void: [subject.id], ...(options.deckGuard?.player === "opponent" ? { deck: options.deckGuard.cards } : {}) },
    { back: [v.vanilla1.id, v.vanilla2.id, ...(options.deckGuard ? [guard.id] : [])], ...(options.banished ? { hand: [v.vanilla1.id] } : {}),
      ...(options.deckGuard?.player === "you" ? { deck: options.deckGuard.cards } : {}) }, [subject, maker, temporary, guard, jailer]);
  let state = f.state;
  if (options.banished) {
    const source = f.ids[side].back[f.ids[side].back.length - 1]; if (source == null) throw new Error("Expected live banishment source");
    const made = f.engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(made.events.some(e => e.kind === "effectStarted" && e.change.kind === "banishedToHandUntil")).toBe(true);
    expect(made.state.floating).toMatchObject([{ source, expiry: { at: "sourceLeavesPlay", source },
      change: { kind: "banishedToHandUntil", instance: f.ids[f.other].hand[0], banishedAt: made.state.instances[f.ids[f.other].hand[0]].enteredZoneAt } }]);
    state = made.state;
  }
  if (options.temporary) {
    const source = f.ids[side].back[f.ids[side].back.length - 1]; if (source == null) throw new Error("Expected temporary-copy source");
    const made = f.engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    expect(made.events.some(e => e.kind === "effectStarted" && e.change.kind === "temporary")).toBe(true);
    state = made.state;
  }
  if (options.created) {
    const played = step(f.engine, state, play(f.ids[side].hand[0]));
    state = step(f.engine, played.state, { kind: "resolveTop" }).state;
  }
  const card = state.sides[side].hand[0];
  return { ...f, state, subject, card, action: play(card) };
}
function witnessAnswers(state: BattleState, choose?: (prompt: Prompt, state: BattleState) => Answer | undefined): AnswerSource {
  let count = 0;
  return { answer(prompt, current) {
    if (++count > state.config.mandatoryLoopCheckFrom * 12 + 100) throw new Error("Public copy witness did not terminate");
    return choose?.(prompt, current) ?? randomLegalAnswer(prompt, () => Math.floor(count / 2) % 2 === 0 ? 0 : 0.999999);
  } };
}
for (const side of SIDES) describe(`${side} closed event-copy continuations`, () => {
  it.each([[false, false, false], [true, false, false], [true, true, false], [true, true, true]] as const)(
    "draws at the configured threshold with passive hand/void backgrounds hand=%s ephemeral=%s ceased=%s", (hand, ephemeral, created) => {
      const f = continuation(side, hand, ephemeral, { created });
      const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
      expect(result.state.config).toEqual(f.state.config);
      expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
      expect(result.state.automaticSteps).toBe(result.state.config.mandatoryLoopCheckFrom);
      expect(f.engine.decision(result.state)).toBeNull();
      expect(new Set(copied(result.events).map(e => e.copy)).size).toBe(copied(result.events).length);
      expect(result.events.filter(e => e.kind === "energyChanged" && e.change === 1)).toHaveLength(1);
      if (hand) {
        expect(result.state.sides[side].hand.length).toBeGreaterThan(1);
        for (const id of result.state.sides[side].hand) {
          expect(result.state.instances[id].status.ephemeral).toBe(ephemeral);
          expect(f.engine.view(result.state, side).instances[id].characteristics.keywords).toContain("offering");
        }
        if (created) { expect(result.state.instances[f.card]).toBeUndefined(); expect(copied(result.events).every(e => e.original === f.card)).toBe(true); }
      } else {
        expect(result.answers.some(answer => answer.auto !== true)).toBe(true);
        expect(result.state.automaticChoices).toBeGreaterThan(0);
        expect(new Set(result.state.stack.flatMap(item => item.kind === "card" ? [item.choices[0]?.modes[0]] : [])).size).toBeGreaterThan(1);
      }
      expect(f.engine.view(result.state, side).instances[f.ids[side].void[0]].characteristics.keywords).toContain("reclaim");
    });

  it("draws with an actually created temporary background", () => {
    const f = continuation(side, false, false, { temporary: true });
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(result.state.config).toEqual(f.state.config);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBe(result.state.config.mandatoryLoopCheckFrom);
    expect(result.answers.some(answer => answer.auto !== true)).toBe(true);
    expect(new Set(copied(result.events).map(e => e.copy)).size).toBe(copied(result.events).length);
  });

  it("draws with an actual live-source banishment background", () => {
    const f = continuation(side, false, false, { banished: true });
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBe(result.state.config.mandatoryLoopCheckFrom);
    expect(result.state.floating).toEqual(f.state.floating);
    expect(result.state.instances[f.ids[f.other].hand[0]].zone).toBe("banished");
    expect(result.state.instances[f.ids[side].back[f.ids[side].back.length - 1]!].zone).toBe("play");
  });

  it.each(["you", "opponent"] as const)("handles an unchanging empty-deck victory predicate ref=%s", player => {
    const f = continuation(side, false, false, { deckGuard: { player, cards: deck } });
    const addressed = player === "you" ? f.other : side;
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(result.state.automaticSteps).toBe(result.state.config.mandatoryLoopCheckFrom);
    expect(result.state.config).toEqual(f.state.config); expect(result.answers.some(a => a.auto !== true)).toBe(true);
    expect(result.state.sides[addressed].deck).toEqual(f.state.sides[addressed].deck);
  });
  it.each(["you", "opponent"] as const)("honors an already satisfied empty-deck victory predicate ref=%s", player => {
    const f = continuation(side, false, false, { deckGuard: { player, cards: [] } });
    const guard = f.ids[f.other].back[2]; if (guard == null) throw new Error("Expected physical victory source");
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(result.state.result).toEqual({ kind: "victory", winner: f.other, reason: "winCondition" });
    expect(result.events.some(e => e.kind === "winConditionMet" && e.side === f.other && e.sources.includes(guard))).toBe(true);
  });
  it.each(["you", "opponent"] as const)("preserves an empty-deck victory reached by real copy draws beyond the threshold ref=%s", player => {
    const limit = continuation(side, false).state.config.mandatoryLoopCheckFrom + 5;
    const addressed = player === "you" ? opponent(side) : side;
    const f = continuation(side, false, false, { deckGuard: { player, cards: Array.from({ length: limit }, () => v.vanilla1.id) },
      extra: [triggered(whenCopyTrigger(), p.draw(1, player === "you" ? "opponent" : "you"))] });
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(result.state.result).toEqual({ kind: "victory", winner: f.other, reason: "winCondition" });
    expect(result.state.sides[addressed].deck).toEqual([]);
    expect(result.events.filter(e => e.kind === "cardDrawn" && e.side === addressed).length).toBeGreaterThan(result.state.config.mandatoryLoopCheckFrom);
  });

  it("keeps genuine prompts, partial-copy rollback and competing input stable through terminal reload", () => {
    const f = continuation(side, false); const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = slice(f.state); const published: EngineEvent[] = []; const answers = witnessAnswers(f.state);
    const apply = (intent: Parameters<typeof fold.reduce>[1]) => {
      const result = fold.reduce(current, intent);
      if (result.kind !== "applied" || result.error !== null) throw new Error("Public continuation intent failed");
      current = result.slice; published.push(...result.published);
    };
    apply({ kind: "battleAction", side, action: { kind: "play", card: f.card, from: "hand" } });
    let checked = false;
    for (;;) {
      const pending = fold.pending(current); if (pending === null) break;
      const restored = JSON.parse(JSON.stringify(current)) as BattleSlice;
      expect(fold.pending(restored)).toEqual(pending); current = restored;
      if (!checked && current.committed.triggerQueue.length > 0) {
        const hash = stateHash(current.committed);
        const partial = runStep(current.committed, { kind: "resolveTrigger" }, INTERACTIVE, f.engine.catalog, { automatic: true });
        expect(partial.kind).toBe("suspended"); expect(partial.events.some(e => e.kind === "cardCreated")).toBe(true);
        expect(() => runStep(current.committed, { kind: "resolveTrigger" }, { answer() { throw new Error("copy answer failed"); } }, f.engine.catalog, { automatic: true })).toThrow("copy answer failed");
        expect(stateHash(current.committed)).toBe(hash); checked = true;
      }
      const intent = { kind: "answer", side, promptId: pending.prompt.id, value: answers.answer(pending.prompt, pending.display) } as const;
      expect(fold.reduce(current, { ...intent, side: f.other }).kind).toBe("bounced");
      expect(fold.reduce(current, { ...intent, value: -1 }).kind).toBe("bounced");
      if (checked) expect(fold.reduce(current, { kind: "cancel", side, promptId: pending.prompt.id }).kind).toBe("bounced");
      apply(intent); expect(fold.reduce(current, intent).kind).toBe("bounced");
    }
    expect(checked).toBe(true); expect(current.committed.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    const whole = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state));
    expect(stateHash(current.committed)).toBe(stateHash(whole.state)); expect(published).toEqual(whole.events);
    for (const viewer of SIDES) expect(comparableView(f.engine.view(determinize(f.engine.view(current.committed, viewer), decklists(current.committed), () => 0.25, f.engine.catalog), viewer))).toEqual(comparableView(f.engine.view(current.committed, viewer)));
  });

  it.each([false, true])("preserves a dormant hand-count victory beyond the mandatory threshold temporary=%s", temporary => {
    const initial = continuation(side, true); const count = initial.state.config.mandatoryLoopCheckFrom + 5;
    const f = continuation(side, true, true, { temporary, extra: [winCondition({ cond: "cardsIn", player: "you", zone: "hand", atLeast: count })] });
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "victory", winner: side, reason: "winCondition" });
    expect(result.state.sides[side].hand).toHaveLength(count);
  });

  it("lets a real stopping mode finish after the mandatory threshold", () => {
    const f = continuation(side, false, false, { body: copy => p.chooseOne(copy, p.sequence()) });
    const limit = f.state.config.mandatoryLoopCheckFrom + 3;
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state, (prompt, state) =>
      prompt.kind === "chooseMode" && typeof prompt.purpose.source === "object" ? (state.stack.length < limit ? 0 : 1) : undefined));
    expect(result.state.result).toBeNull(); expect(result.state.triggerQueue).toEqual([]); expect(copied(result.events).length).toBeGreaterThan(f.state.config.mandatoryLoopCheckFrom);
  });

  it.each([false, true, "banished"] as const)("lets a dormant interfering copy listener prevent the original and finish background=%s", temporary => {
    const base = continuation(side, false); const limit = 20 + base.state.config.mandatoryLoopCheckFrom * 2;
    const stop = p.prevent(stackItem({ cardType: "event" }));
    const f = continuation(side, false, false, { temporary: temporary === true, banished: temporary === "banished", extra: [
      triggered(whenCopyTrigger(), p.gainEnergy(1)),
      triggered(whenCopyTrigger(), temporary === "banished" ? p.sequence(p.returnToHand({ kind: "all", selector: { controller: "you" } }), stop) : stop,
        { oncePerTurn: true, condition: { cond: "energyAtLeast", amount: limit } }),
    ] });
    const result = f.engine.apply(f.state, side, { kind: "play", card: f.card, from: "hand" }, witnessAnswers(f.state, prompt =>
      prompt.kind === "chooseTargets" && typeof prompt.purpose.source === "object" && prompt.candidates.includes(f.card) ? [f.card] : undefined));
    expect(result.state.result).toBeNull(); expect(result.state.triggerQueue).toEqual([]);
    expect(result.events.some(e => e.kind === "prevented" && e.instance === f.card)).toBe(true);
    if (temporary === "banished") expect(result.events.some(e => e.kind === "returnedToHand" && e.instance === f.ids[f.other].hand[0])).toBe(true);
    if (temporary === "banished") expect(result.state.floating.some(e => e.change.kind === "banishedToHandUntil")).toBe(false);
    if (temporary === "banished") expect(copied(result.events).length).toBeGreaterThan(result.state.config.mandatoryLoopCheckFrom);
  });

  it("starts accounting at zero when a stopping copy choice enters a closed continuation", () => {
    const closed = watcher(10, p.copyCard(triggeringCard()));
    const starter = sign(13, [triggered(whenYouPlay(), p.chooseOne(p.sequence(), p.copyCard(triggeringCard())), { oncePerTurn: true })]);
    const engine = createEngine(testCatalog([points], { dreamsigns: [closed, starter] }));
    const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [points.id], dreamsigns: [closed.id, starter.id], deck }, [opponent(side)]: { deck } });
    const played = step(engine, setup.state, play(setup.ids[side].hand[0]));
    const start = { ...played.state, automaticSteps: played.state.config.mandatoryLoopCheckFrom - 1 };
    const entered = step(engine, start, { kind: "resolveTrigger" }, [1], true);
    expect(entered.state.result).toBeNull(); expect(entered.state.automaticSteps).toBe(0); expect(entered.state.loops.cycle).toBeNull();
  });
});
