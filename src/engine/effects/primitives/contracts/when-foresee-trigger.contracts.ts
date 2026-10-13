/** Completed positive Foresee operations, including an empty deck (RD-hv-umm2.230-1). */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { energy, event } from "../../../dsl/builders";
import { triggered, whenForesee } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { PolicyRandom } from "../../../policy/random";
import type { Answer } from "../../../prompts/types";
import { deserializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseDreamsignId } from "../../../../types/identifiers";
import { discover } from "../discover";
import { draw } from "../draw";
import { erode } from "../erode";
import { delayed, floating } from "../floating-trigger";
import { foresee } from "../foresee";
import { gainEnergy } from "../gain-energy";
import { materializeFigments } from "../materialize-figments";
import { optional } from "../optional";
import { sequence } from "../sequence";

function spell(index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return { id: syntheticId(0x23000 + index), cardType: "event", costs: [energy(0)], spark: null,
    subtype: "", speed: "standard", status: "authored", abilities };
}
const S = {
  two: spell(0, () => [event(foresee(2))]),
  zero: spell(1, () => [event(foresee(0))]),
  negative: spell(2, () => [event(foresee(-1))]),
  twice: spell(3, () => [event(sequence(foresee(2), foresee(2)))]),
  draw: spell(4, () => [event(draw(1))]),
  erode: spell(5, () => [event(erode(1))]),
  discover: spell(6, () => [event(discover({ cardType: "event" }))]),
  deferred: spell(7, () => [event(sequence(delayed(whenForesee(), gainEnergy(1)), floating(whenForesee(), gainEnergy(2))))]),
  fail: spell(8, () => [event(sequence(foresee(2), materializeFigments(parseFigmentId("00000000-0000-4000-8000-000000023099"))))]),
};
const emblem = (id: EngineDreamsignDefinition["id"], abilities: EngineDreamsignDefinition["abilities"]): EngineDreamsignDefinition => ({ id, status: "authored", abilities });
const D = {
  own: emblem(parseDreamsignId("00000000-0000-4000-8000-000000023001"), () => [triggered(whenForesee(), draw(1))]),
  other: emblem(parseDreamsignId("00000000-0000-4000-8000-000000023002"), () => [triggered(whenForesee("opponent"), gainEnergy(1))]),
  once: emblem(parseDreamsignId("00000000-0000-4000-8000-000000023003"), () => [triggered(whenForesee(), draw(1), { oncePerTurn: true })]),
  may: emblem(parseDreamsignId("00000000-0000-4000-8000-000000023004"), () => [triggered(whenForesee(), optional(draw(1)))]),
};
const E = createEngine(testCatalog(Object.values(S), { dreamsigns: Object.values(D) }));
const filler = Array.from({ length: 12 }, () => v.vanilla3.id);
function setup(board: Omit<BoardSetup, "phase">) { return boardState(E.catalog, { phase: "day", ...board }); }
function cast(state: BattleState, side: Side, id: InstanceId, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, { kind: "play", card: id, from: "hand" }, answers.length === 0 ? NO_PROMPTS : source);
  source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
const kept = (cards: readonly InstanceId[]) => cards.map((card) => ({ card, to: "top" as const }));
const queued = (events: readonly EngineEvent[]) => events.filter((entry) => entry.kind === "triggerQueued");
const foresaw = (events: readonly EngineEvent[]) => events.filter((entry) => entry.kind === "foresaw");
const startSlice = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent");
  return outcome;
}

describe("whenForesee", () => {
  for (const side of ["player", "enemy"] as const) {
    for (const arrangement of ["unchanged", "reversed", "mixed", "void"] as const) {
      it(`matches one completed ${arrangement} operation for ${side}, with the player relative to each listener`, () => {
        const other = opponent(side);
        const { state, ids } = setup({ active: side, [side]: { dreamsigns: [D.own.id, D.other.id], hand: [S.two.id], deck: filler },
          [other]: { dreamsigns: [D.own.id, D.other.id], deck: filler } });
        const [a, b, c] = ids[side].deck;
        const answer: Answer = arrangement === "unchanged" ? kept([a, b]) : arrangement === "reversed" ? kept([b, a]) :
          arrangement === "mixed" ? [{ card: b, to: "top" }, { card: a, to: "void" }] : [{ card: a, to: "void" }, { card: b, to: "void" }];
        const result = cast(state, side, ids[side].hand[0], [answer]);
        expect(foresaw(result.events)).toHaveLength(1);
        expect(queued(result.events).map(({ source, controller, subject }) => ({ source, controller, subject }))).toEqual(
          [side, other].map((listener) => ({ source: { kind: "dreamsign", side: listener, index: listener === side ? 0 : 1 }, controller: listener, subject: null })));
        const drawn = arrangement === "unchanged" ? a : arrangement === "void" ? c : b;
        expect(result.state.sides[side].hand).toEqual([drawn]);
        expect(result.state.sides[other].hand).toEqual([]);
        expect(result.state.sides[other].currentEnergy).toBe(1);
        expect(result.state.sides[side].currentEnergy).toBe(0);
        const completed = foresaw(result.events)[0];
        expect(eventSeenBy(completed, other, result.state)).toEqual({ ...completed, kept: completed.kept.map(() => null) });
        expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
      });
    }
  }

  it("completes positive Foresee on an empty deck without moving void cards or causing Fatigue, and ignores nonpositive instructions", () => {
    const { state, ids } = setup({ active: "player", player: { dreamsigns: [D.other.id], hand: [S.two.id, S.zero.id, S.negative.id], deck: [], void: [v.vanilla1.id] },
      enemy: { dreamsigns: [D.other.id], deck: filler } });
    const positive = cast(state, "player", ids.player.hand[0]);
    expect(foresaw(positive.events)).toEqual([{ kind: "foresaw", side: "player", kept: [], voided: [] }]);
    expect(queued(positive.events)).toHaveLength(1);
    expect(positive.state.sides.enemy.currentEnergy).toBe(1);
    expect(positive.state.sides.player.deck).toEqual([]);
    expect(positive.state.sides.player.void).toContain(ids.player.void[0]);
    expect(positive.events.some((entry) => entry.kind === "fatigue" || entry.kind === "shuffledIntoDeck")).toBe(false);
    for (const deck of [[], filler]) {
      const control = setup({ active: "player", player: { dreamsigns: [D.own.id], hand: [S.zero.id, S.negative.id], deck }, enemy: { deck: filler } });
      let next = control.state;
      for (const id of control.ids.player.hand) {
        const result = cast(next, "player", id);
        expect(foresaw(result.events)).toEqual([]);
        expect(queued(result.events)).toEqual([]);
        expect(result.state.sides.player.deck).toEqual(control.ids.player.deck);
        next = result.state;
      }
    }
  });

  it("ignores draws, erodes and discoveries", () => {
    const { state, ids } = setup({ active: "player", player: { dreamsigns: [D.own.id], hand: [S.draw.id, S.erode.id, S.discover.id], deck: filler }, enemy: { deck: filler } });
    let next = state;
    for (const id of ids.player.hand) {
      const result = cast(next, "player", id);
      expect(queued(result.events)).toEqual([]);
      expect(foresaw(result.events)).toEqual([]);
      next = result.state;
    }
  });

  it("allows each physical emblem once per turn across multiple operations and plays, then renews on the next turn", () => {
    const { state, ids } = setup({ active: "player", player: { dreamsigns: [D.once.id, D.once.id], hand: [S.twice.id, S.two.id, S.two.id], deck: filler }, enemy: { deck: filler } });
    const first = cast(state, "player", ids.player.hand[0], [kept(ids.player.deck.slice(0, 2)), kept(ids.player.deck.slice(0, 2))]);
    expect(foresaw(first.events)).toHaveLength(2);
    expect(queued(first.events).map((entry) => entry.source)).toEqual([{ kind: "dreamsign", side: "player", index: 0 }, { kind: "dreamsign", side: "player", index: 1 }]);
    expect(first.state.sides.player.hand).toEqual([ids.player.hand[1], ids.player.hand[2], ...ids.player.deck.slice(0, 2)]);
    const second = cast(first.state, "player", ids.player.hand[1], [kept(first.state.sides.player.deck.slice(0, 2))]);
    expect(queued(second.events)).toEqual([]);
    const nextTurn = passUntil(E, second.state, (next) => next.turn.turnNumber > second.state.turn.turnNumber && at(E, "player", "day")(next));
    const renewed = cast(nextTurn.state, "player", ids.player.hand[2], [kept(nextTurn.state.sides.player.deck.slice(0, 2))]);
    expect(queued(renewed.events)).toHaveLength(2);
  });

  it("uses the same matcher for persistent floating triggers and one-shot delayed triggers", () => {
    const { state, ids } = setup({ active: "player", player: { hand: [S.deferred.id, S.two.id, S.two.id], deck: filler }, enemy: { deck: filler } });
    const armed = cast(state, "player", ids.player.hand[0]);
    const first = cast(armed.state, "player", ids.player.hand[1], [kept(armed.state.sides.player.deck.slice(0, 2))]);
    expect(queued(first.events)).toHaveLength(2);
    expect(queued(first.events).every((entry) => entry.subject === null)).toBe(true);
    expect(first.state.sides.player.currentEnergy).toBe(3);
    const second = cast(first.state, "player", ids.player.hand[2], [kept(first.state.sides.player.deck.slice(0, 2))]);
    expect(queued(second.events)).toHaveLength(1);
    expect(second.state.sides.player.currentEnergy).toBe(5);
  });

  it("preserves a subject-null queued trigger across reload, views and determinization, with identical resumed events", () => {
    const { state, ids } = setup({ active: "player", player: { dreamsigns: [D.may.id, D.own.id], hand: [S.two.id], deck: filler }, enemy: { deck: filler } });
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    const answer = kept(ids.player.deck.slice(0, 2));
    const inline = E.apply(state, "player", action, new ScriptedSource([answer, true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(startSlice(state), { kind: "battleAction", side: "player", action }));
    const arrangement = fold.pending(opened.slice);
    if (arrangement === null) throw new Error("no arrangement prompt");
    const waiting = applied(fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: arrangement.prompt.id, value: answer }));
    const saved = JSON.parse(JSON.stringify(waiting.slice)) as BattleSlice;
    const reloaded = { ...saved, committed: deserializeState(JSON.stringify(saved.committed)) };
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded);
    if (pending === null) throw new Error("no optional trigger prompt");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: { kind: "dreamsign", side: "player", index: 0 } } });
    expect(pending.display.triggerQueue.map((entry) => entry.subject)).toEqual([null]);
    const decklists = { player: [S.two.id, ...filler].map((cardId) => ({ cardId })), enemy: filler.map((cardId) => ({ cardId })) };
    for (const viewer of ["player", "enemy"] as const) {
      const seen = E.view(pending.display, viewer);
      expect(seen.triggerQueue.map((entry) => entry.subject)).toEqual([null]);
      const random = new PolicyRandom(battleSeed(`foresee-${viewer}`));
      const sampled = E.determinize(seen, decklists, () => random.next());
      expect(sampled.triggerQueue.map((entry) => entry.subject)).toEqual([null]);
    }
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: arrangement.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const resolved = applied(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true }));
    expect(fresh.reduce(resolved.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(resolved.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...waiting.published, ...resolved.published]).toEqual(inline.events);
  });

  it("rolls back the Foresee completion and trigger queue when the same resolution fails after arrangement", () => {
    const { state, ids } = setup({ active: "player", player: { dreamsigns: [D.once.id], hand: [S.fail.id], deck: filler }, enemy: { deck: filler } });
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(startSlice(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("no arrangement");
    const outcome = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected unknown figment error");
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
    expect(outcome.slice.committed.oncePerTurn).toEqual([]);
    expect(outcome.published.some((entry) => entry.kind === "foresaw" || entry.kind === "triggerQueued")).toBe(false);
  });
});
