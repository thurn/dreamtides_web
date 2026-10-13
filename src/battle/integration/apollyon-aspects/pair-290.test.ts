/** Unregistered provisional Aspects exercised as permanent engine emblems, using synthetic cards. */
import { describe, expect, it } from "vitest";
import { spiritAnimalAspectAbilities } from "../../../content/apollyon/aspects/aspect-1380edc9-09ed-44df-ad09-ab4cbfc081b5";
import { secondEventAspectAbilities } from "../../../content/apollyon/aspects/aspect-3fe26475-8023-46d3-b13b-86673b92e3d0";
import type { EngineAvatarDefinition, EngineCardDefinition, EngineFigmentDefinition } from "../../../engine/catalog";
import { additionalCost, costPaid, energy, energyX, enemyCharacter, event, everyIn, optionalCost, target, x } from "../../../engine/dsl/builders";
import { NO_DECK_MODS } from "../../../engine/dsl/types";
import { createEngine } from "../../../engine/engine";
import { eventSeenBy, type EngineEvent } from "../../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import { dissolve } from "../../../engine/effects/primitives/dissolve";
import { chooseOne } from "../../../engine/effects/primitives/choose-one";
import { gainPoints } from "../../../engine/effects/primitives/gain-points";
import { ifThen } from "../../../engine/effects/primitives/if-then";
import { materialize } from "../../../engine/effects/primitives/materialize";
import { materializeFigments } from "../../../engine/effects/primitives/materialize-figments";
import { sequence } from "../../../engine/effects/primitives/sequence";
import type { Answer } from "../../../engine/prompts/types";
import { stateHash } from "../../../engine/state/hash";
import { opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../../../engine/state/ids";
import { parseAvatarId } from "../../../types/identifiers";
import type { BattleState } from "../../../engine/state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../engine/steps/sources";
import { boardState, type SideSetup } from "../../../engine/testing/board";
import { invariantViolations } from "../../../engine/testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";

const spiritId = parseFigmentId("1745ab81-c8a9-4601-a3db-7dbcfa138c11");
const spirit: EngineFigmentDefinition = { id: spiritId, subtype: "Spirit Animal", spark: 7, status: "vanilla", abilities: () => [] };
const aspects = {
  spirit: { id: parseAvatarId("395f7a98-d40a-4b42-a4c6-6f38648255f7"), status: "authored", abilities: spiritAnimalAspectAbilities },
  second: { id: parseAvatarId("5caf07f1-9bfb-4696-9b5b-6b57fe49e7ef"), status: "authored", abilities: secondEventAspectAbilities },
} as const satisfies Record<string, EngineAvatarDefinition>;
function card(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { id: syntheticId(0x64000 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities, ...extra };
}
const cards = {
  spirit: card(0, "character", () => [], { subtype: "Spirit Animal", status: "vanilla" }),
  quickSpirit: card(1, "character", () => [], { subtype: "Spirit Animal", status: "vanilla", speed: "interrupt" }),
  warrior: card(2, "character", () => [], { status: "vanilla" }),
  points: card(3, "event", () => [event(gainPoints(1))]),
  quickPoints: card(4, "event", () => [event(gainPoints(1))], { speed: "interrupt" }),
  direct: card(5, "event", () => [event(materialize(everyIn("hand", { cardType: "character" })))]),
  figments: card(6, "event", () => [event(materializeFigments(spiritId, 1, { spark: 1 }))]),
  choice: card(7, "event", () => [additionalCost(optionalCost(energy(1))), event(sequence(
    chooseOne(dissolve(target(enemyCharacter({ sparkAtMost: x() }))), gainPoints(x())),
    ifThen(costPaid(), gainPoints(2)),
  ))], { costs: [energyX()] }),
  targeted: card(8, "event", () => [event(dissolve(target(enemyCharacter())))]),
  fault: card(9, "event", () => [event(gainPoints(1))], { synthetic: { resolve() { throw new Error("synthetic resolution fault"); } } }),
} as const;
const E = createEngine(testCatalog(Object.values(cards), { avatars: Object.values(aspects) }, [spirit]));
const deck = Array.from({ length: 8 }, () => cards.warrior.id);
function setup(kind: keyof typeof aspects, side: Side, own: SideSetup, other: SideSetup = {}) {
  return boardState(E.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { avatar: aspects[kind].id, energy: 10, deck, ...own }, [opponent(side)]: { energy: 10, deck, ...other } });
}
function act(state: BattleState, side: Side, instance: InstanceId, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const steps: BattleState[] = [];
  const played = E.apply(state, side, { kind: "play", card: instance, from: "hand" }, source, next => steps.push(next));
  const rest = passUntil(E, played.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...played.events, ...rest.events], steps, answers: played.answers };
}
function queued(events: readonly EngineEvent[], side: Side) {
  return events.filter(entry => entry.kind === "triggerQueued" && typeof entry.source === "object" && entry.source?.kind === "avatar" && entry.controller === side);
}
function figments(state: BattleState, side: Side) {
  return Object.values(state.instances).filter(instance => instance.controller === side && instance.zone === "play" && instance.printing.kind === "figment");
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

for (const side of SIDES) describe(`${side} pair-290 permanent Aspects`, () => {
  const other = opponent(side);
  it("rewards an actual Spirit Animal play once per turn and resets on the next turn", () => {
    const f = setup("spirit", side, { hand: [cards.spirit.id, cards.spirit.id, cards.spirit.id] });
    const first = act(f.state, side, f.ids[side].hand[0]);
    expect(queued(first.events, side)).toEqual([expect.objectContaining({ source: { kind: "avatar", side }, subject: f.ids[side].hand[0] })]);
    expect(figments(first.state, side)).toHaveLength(1);
    const created = figments(first.state, side)[0];
    for (const viewer of SIDES) expect(E.view(first.state, viewer).instances[created.id]).toMatchObject({ controller: side, printing: { kind: "figment", figment: spiritId, spark: 1 }, characteristics: { spark: 1, subtype: "Spirit Animal", cost: 0 } });
    const second = act(first.state, side, f.ids[side].hand[1]);
    expect(queued(second.events, side)).toEqual([]);
    expect(figments(second.state, side)).toHaveLength(1);
    const opposingDay = passUntil(E, second.state, at(E, other, "day"), NO_PROMPTS, 100).state;
    const nextDay = passUntil(E, opposingDay, at(E, side, "day"), NO_PROMPTS, 100).state;
    const again = act(nextDay, side, f.ids[side].hand[2]);
    expect(queued(again.events, side)).toHaveLength(1);
    expect(figments(again.state, side)).toHaveLength(2);
  });

  it("ignores a Warrior, opposing Spirit Animal response and direct Spirit Animal materializations", () => {
    const f = setup("spirit", side, { hand: [cards.warrior.id, cards.direct.id, cards.spirit.id, cards.figments.id] }, { hand: [cards.quickSpirit.id] });
    const mine = E.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(E.decision(mine.state)).toEqual({ kind: "respond", side: other });
    const response = E.apply(mine.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(E, response.state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
    expect(queued([...mine.events, ...response.events], side)).toEqual([]);
    expect(figments(resolved, side)).toEqual([]);
    const materialized = act(resolved, side, f.ids[side].hand[1]);
    expect(materialized.state.instances[f.ids[side].hand[2]].zone).toBe("play");
    expect(queued(materialized.events, side)).toEqual([]);
    const created = act(materialized.state, side, f.ids[side].hand[3]);
    expect(figments(created.state, side)).toHaveLength(1);
    expect(queued(created.events, side)).toEqual([]);
  });

  it("uses the Spirit Animal's effective play type and normal full-capacity handling", () => {
    const typed = setup("spirit", side, { hand: [{ cardId: cards.warrior.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Spirit Animal" } } }] });
    const played = act(typed.state, side, typed.ids[side].hand[0]);
    expect(queued(played.events, side)).toHaveLength(1);
    expect(figments(played.state, side)).toHaveLength(1);
    const full = setup("spirit", side, { back: Array.from({ length: fBack(typed.state, side) - 1 }, () => cards.warrior.id), hand: [cards.spirit.id, cards.points.id] });
    const result = act(full.state, side, full.ids[side].hand[0]);
    expect({ createdFigments: figments(result.state, side).length, playedSourceZone: result.state.instances[full.ids[side].hand[0]].zone }).toEqual({ createdFigments: 0, playedSourceZone: "play" });
    expect(result.events).toContainEqual({ kind: "capacityReached", side, instance: null, missing: 1 });
    expect(queued(result.events, side)).toHaveLength(1);
  });

  it("copies only the second own actual event, excluding characters and an opposing response", () => {
    const f = setup("second", side, { hand: [cards.points.id, cards.warrior.id, cards.points.id, cards.points.id, cards.points.id, cards.points.id] }, { hand: [cards.quickPoints.id] });
    const mine = E.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const reply = E.apply(mine.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(E, reply.state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
    const warrior = act(resolved, side, f.ids[side].hand[1]);
    const second = act(warrior.state, side, f.ids[side].hand[2]);
    const copies = second.events.filter(entry => entry.kind === "cardCopied");
    expect(copies).toEqual([expect.objectContaining({ side, original: f.ids[side].hand[2] })]);
    expect(queued(second.events, side)).toEqual([expect.objectContaining({ source: { kind: "avatar", side }, subject: f.ids[side].hand[2] })]);
    for (const viewer of SIDES) {
      expect(E.view(second.state, viewer).sides[side].avatar?.id).toBe(aspects.second.id);
      for (const entry of queued(second.events, side)) expect(eventSeenBy(entry, viewer, second.state)).toMatchObject({ source: { kind: "avatar", side }, subject: f.ids[side].hand[2] });
    }
    if (copies[0]?.kind !== "cardCopied") throw new Error("Missing copy");
    expect(second.events.filter(entry => entry.kind === "resolved").map(entry => entry.instance)).toEqual([copies[0].copy, f.ids[side].hand[2]]);
    expect(second.state.instances[copies[0].copy]).toBeUndefined();
    expect(second.state.turnLog.played[side].map(entry => entry.instance)).toEqual(f.ids[side].hand.slice(0, 3));
    expect(second.state.sides[side].score).toBe(3);
    expect(second.state.sides[other].score).toBe(1);
    const third = act(second.state, side, f.ids[side].hand[3]);
    expect(third.events.filter(entry => entry.kind === "cardCopied")).toEqual([]);
    expect(third.state.sides[side].score).toBe(4);
    const opposingDay = passUntil(E, third.state, at(E, other, "day"), NO_PROMPTS, 100).state;
    const nextDay = passUntil(E, opposingDay, at(E, side, "day"), NO_PROMPTS, 100).state;
    expect(nextDay.turnLog.played[side]).toEqual([]);
    const freshFirst = act(nextDay, side, f.ids[side].hand[4]);
    expect(freshFirst.events.filter(entry => entry.kind === "cardCopied")).toEqual([]);
    const freshSecond = act(freshFirst.state, side, f.ids[side].hand[5]);
    expect(freshSecond.events.filter(entry => entry.kind === "cardCopied")).toEqual([expect.objectContaining({ side, original: f.ids[side].hand[5] })]);
  });

  it("keeps its variant, X and optional-payment decision while its copy chooses a new mode without repayment", () => {
    for (const paid of [true, false]) {
    const f = setup("second", side, { hand: [cards.points.id, { cardId: cards.choice.id, amplified: true }] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    const first = act(f.state, side, f.ids[side].hand[0]);
    const original = f.ids[side].hand[1];
    const result = act(first.state, side, original, [2, 0, [f.ids[other].back[0]!], paid, 1]);
    const copied = result.events.find(entry => entry.kind === "cardCopied");
    if (copied?.kind !== "cardCopied") throw new Error("Missing copy");
    const during = result.steps.find(state => state.stack.some(item => item.kind === "card" && item.instance === copied.copy));
    if (during === undefined) throw new Error("Missing public copy step");
    expect(during.stack).toEqual([expect.objectContaining({ kind: "card", instance: original, x: 2, optionalPaid: [paid], choices: [{ modes: [0], targets: [[f.ids[other].back[0]]] }] }),
      expect.objectContaining({ kind: "card", instance: copied.copy, x: 2, optionalPaid: [paid], choices: [{ modes: [1], targets: [] }] })]);
    for (const viewer of SIDES) expect(E.view(during, viewer).instances[copied.copy]).toMatchObject({ printing: { kind: "card", cardId: cards.choice.id }, controller: side, variant: { amplified: true } });
    expect(result.state.sides[side].currentEnergy).toBe(8 - Number(paid));
    expect(result.state.sides[side].score).toBe(3 + 4 * Number(paid));
    expect(result.state.instances[f.ids[other].back[0]!].zone).toBe("void");
    expect(result.state.instances[f.ids[other].back[1]!].zone).toBe("play");
    expect(result.events.filter(entry => entry.kind === "cardPlayed")).toHaveLength(1);
    }
  });

  it("counts effective event types and excludes an event transformed into a character", () => {
    const f = setup("second", side, { hand: [
      { cardId: cards.points.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } },
      cards.points.id,
      { cardId: cards.warrior.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
    ] });
    const character = act(f.state, side, f.ids[side].hand[0]);
    expect(character.events.filter(entry => entry.kind === "cardCopied")).toEqual([]);
    const first = act(character.state, side, f.ids[side].hand[1]);
    expect(first.events.filter(entry => entry.kind === "cardCopied")).toEqual([]);
    const second = act(first.state, side, f.ids[side].hand[2]);
    expect(second.events.filter(entry => entry.kind === "cardCopied")).toEqual([expect.objectContaining({ side, original: f.ids[side].hand[2] })]);
  });

  it("replays actual copy-target choices after reload and rejects cancellation, stale, foreign and competing inputs", () => {
    const f = setup("second", side, { hand: [cards.points.id, cards.targeted.id, cards.points.id] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    const first = act(f.state, side, f.ids[side].hand[0]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const initial = slice(first.state);
    const opened = applied(fold.reduce(initial, { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } }));
    const before = fold.pending(opened);
    if (before?.prompt.kind !== "chooseTargets") throw new Error("Missing original target choice");
    expect(before.prompt.cancellable).toBe(true);
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: before.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(initial.committed));
    expect(cancelled.committed.sides[side].avatar?.id).toBe(aspects.second.id);
    const restarted = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } }));
    const fresh = fold.pending(restarted);
    if (fresh === null) throw new Error("Missing restarted prompt");
    expect(fold.reduce(restarted, { kind: "answer", side, promptId: before.prompt.id, value: [f.ids[other].back[0]!] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const copying = applied(fold.reduce(restarted, { kind: "answer", side, promptId: fresh.prompt.id, value: [f.ids[other].back[0]!] }));
    const pending = fold.pending(copying);
    if (pending?.prompt.kind !== "chooseTargets") throw new Error("Missing copy target choice");
    expect(pending.prompt.cancellable).toBe(false);
    expect(pending.prompt.purpose.source).not.toBe(f.ids[side].hand[1]);
    expect(fold.reduce(copying, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(fold.reduce(copying, { kind: "answer", side: other, promptId: pending.prompt.id, value: [f.ids[other].back[1]!] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(copying, { kind: "answer", side, promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(copying, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const saved = clone(copying);
    const reload = createFoldAdapter(E, { checkEventPrefix: true });
    expect(reload.pending(saved)?.prompt).toEqual(pending.prompt);
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: [f.ids[other].back[1]!] } as const;
    const done = fold.reduce(copying, answer);
    const replayed = reload.reduce(saved, answer);
    expect(replayed).toEqual(done);
    const committed = applied(replayed);
    expect(committed.committed.sides[side].void).toContain(f.ids[side].hand[1]);
    expect(committed.committed.instances[f.ids[other].back[0]!].zone).toBe("void");
    expect(committed.committed.instances[f.ids[other].back[1]!].zone).toBe("void");
    expect(reload.reduce(committed, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(E.view(first.state, other).instances[f.ids[side].hand[2]]).toBeUndefined();
  });

  it("retains the committed emblem copy while a later synthetic resolution failure rolls back its step", () => {
    const f = setup("second", side, { hand: [cards.points.id, cards.fault.id] }, { hand: [cards.quickPoints.id] });
    const first = act(f.state, side, f.ids[side].hand[0]);
    const fold = createFoldAdapter(E);
    const cast = applied(fold.reduce(slice(first.state), { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[1], from: "hand" } }));
    expect(cast.committed.stack).toHaveLength(2);
    const failed = fold.reduce(cast, { kind: "battleAction", side: other, action: { kind: "pass" } });
    if (failed.kind !== "applied") throw new Error("Expected resolution error");
    expect(failed.error).not.toBeNull();
    expect(failed.published).toEqual([]);
    expect(failed.slice.committed).toEqual(cast.committed);
    expect(failed.slice.committed.sides[side].score).toBe(1);
    expect(failed.slice.committed.turnLog.played[side]).toHaveLength(2);
  });
});
function fBack(state: BattleState, side: Side): number { return state.sides[side].backRank.length; }
