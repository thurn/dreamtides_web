/** Actual phase draws compose with static copies, ordinary draw events and transactional trigger recovery. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId, parsePromptId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { EngineDreamsignDefinition } from "../../../catalog";
import { energy, event, noCardsIn, staticAbility } from "../../../dsl/builders";
import { triggered, triggeringCard, whenCopyTrigger, whenDraw, whenYouPlay } from "../../../dsl/triggers";
import type { Ability, PlayerRef, StaticCondition } from "../../../dsl/types";
import { randomLegalAnswer } from "../../../prompts/answers";
import type { AnswerSource } from "../../../steps/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { initialState } from "../../../state/create";
import { runToDecision } from "../../../steps/driver";
import { beginBattleStep } from "../../../steps/kinds/begin-battle";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { additionalDrawPhaseCards } from "../additional-draw-phase";
import { copyCard } from "../copy-card";
import { chooseOne } from "../choose-one";
import { gainEnergy } from "../gain-energy";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { takeExtraTurn } from "../take-extra-turn";
import { restored, saved } from "./rule-modifier-support";

const signId = parseDreamsignId("00000000-0000-4000-8000-000000617001");
const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
const spell = { ...v.event0, id: syntheticId(0x617002), status: "authored" as const, costs: [energy(0)], abilities: () => [event(draw(2))] };
const extraTurn = { ...spell, id: syntheticId(0x617003), abilities: () => [event(takeExtraTurn())] };
interface Options {
  readonly owner?: Side;
  readonly player?: PlayerRef;
  readonly count?: number;
  readonly copies?: number;
  readonly counts?: readonly number[];
  readonly while?: StaticCondition;
  readonly abilities?: readonly Ability[];
  readonly hand?: boolean;
  readonly deckSize?: number;
  readonly phase?: "dreamwell" | "day";
}
function world(active: Side, options: Options = {}) {
  const owner = options.owner ?? active;
  const sign: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => [
    ...(options.counts ?? [options.count ?? 2]).map(count => staticAbility(additionalDrawPhaseCards(options.player ?? "you", count), options.while === undefined ? {} : { while: options.while })),
    ...(options.abilities ?? []),
  ] };
  const engine = createEngine(testCatalog([spell, extraTurn], { dreamsigns: [sign] }));
  const board = boardState(engine.catalog, { active, phase: options.phase ?? "dreamwell", scoreToWin: 1000,
    player: { deck: deck.slice(0, options.deckSize ?? 12), energy: 4 },
    enemy: { deck: deck.slice(0, options.deckSize ?? 12), energy: 4 },
    [owner]: { deck: deck.slice(0, options.deckSize ?? 12), energy: 4,
      dreamsigns: Array.from({ length: options.copies ?? 1 }, () => signId), hand: options.hand ? [spell.id] : [] },
  });
  return { ...board, engine };
}
function boundary(w: ReturnType<typeof world>, state = w.state) {
  const before = stateHash(state);
  const result = runStep(state, { kind: "advancePhase" }, NO_PROMPTS, w.engine.catalog);
  if (result.kind !== "done") throw new Error("Draw boundary unexpectedly suspended");
  expect(stateHash(state)).toBe(before);
  expect(invariantViolations(result.state, w.engine.catalog)).toEqual([]);
  return result;
}
const drawn = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "cardDrawn" ? [e.instance] : []);
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(value: IntentOutcome) {
  if (value.kind !== "applied" || value.error !== null) throw new Error(JSON.stringify(value));
  return value;
}

describe("additional Draw-phase cards", () => {
  it.each(SIDES.flatMap(owner => (["you", "opponent"] as const).map(player => ({ owner, player })) ))("adds distinct held copies only on the beneficiary's phase: $owner/$player", ({ owner, player }) => {
    const beneficiary = player === "you" ? owner : opponent(owner);
    const w = world(beneficiary, { owner, player, counts: [1, 0, 2], copies: 2 });
    const result = boundary(w);
    expect(drawn(result.events)).toEqual(w.ids[beneficiary].deck.slice(0, 7));
    expect(result.state.sides[beneficiary].hand).toEqual(w.ids[beneficiary].deck.slice(0, 7));
    expect(result.state.turnLog.drawn[beneficiary]).toBe(7);
    expect(result.state.sides[opponent(beneficiary)].hand).toEqual([]);
    const wrong = world(opponent(beneficiary), { owner, player, counts: [1, 0, 2], copies: 2 });
    expect(drawn(boundary(wrong).events)).toEqual(wrong.ids[opponent(beneficiary)].deck.slice(0, 1));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid count %s before constructing a rule", count => {
    expect(() => additionalDrawPhaseCards("you", count)).toThrow(RangeError);
  });
  it("zero adds no card requests", () => {
    const w = world("player", { count: 0 });
    expect(drawn(boundary(w).events)).toEqual(w.ids.player.deck.slice(0, 1));
  });

  it.each(SIDES.flatMap(side => [false, true].map(skip => ({ side, skip }))))("uses the explicit whole first-Draw skip for $side, skip=$skip", ({ side, skip }) => {
    const w = world(side, { deckSize: 0 });
    const start = { ...w.state, config: { ...w.state.config, startingSide: side, skipFirstDraw: skip },
      turn: { ...w.state.turn, turnNumber: 1 } };
    const result = boundary(w, start);
    expect(drawn(result.events)).toEqual([]);
    expect(result.events.filter(e => e.kind === "fatigue").map(e => e.points)).toEqual(skip ? [] : [1, 2, 4]);
    expect(result.state.turnLog.drawn[side]).toBe(0);
    expect(result.state.sides[side].hand).toEqual([]);
    expect(result.state.sides[opponent(side)].score).toBe(skip ? 0 : 7);
    const stocked = world(side);
    const first = { ...stocked.state, config: { ...stocked.state.config, startingSide: side, skipFirstDraw: skip },
      turn: { ...stocked.state.turn, turnNumber: 1 } };
    expect(drawn(boundary(stocked, first).events)).toEqual(skip ? [] : stocked.ids[side].deck.slice(0, 3));
  });

  it.each(SIDES)("keeps opening hands separate and draws extras on the next player's first turn: %s", startingSide => {
    const w = world(startingSide);
    const init = { seed: battleSeed("additional-opening"), startingSide, scoreToWin: 1000,
      decks: { player: deck.map(cardId => ({ cardId })), enemy: deck.map(cardId => ({ cardId })) },
      dreamwell: [], dreamsigns: { player: [signId], enemy: [signId] } };
    const initial = initialState(init, w.engine.catalog);
    const openingHandSize = { player: 2, enemy: 3 };
    const fixture = { ...initial, config: { ...initial.config,
      openingHandSize, skipFirstDraw: true, handLimit: 10, turnLimit: null,
      resolutionCap: 64, mandatoryLoopCheckFrom: 32, mandatoryLoopWindow: 32,
    } };
    const start = runToDecision(fixture, beginBattleStep(init), NO_PROMPTS, w.engine.catalog, w.engine.memo, undefined, true);
    for (const side of SIDES) expect(start.state.sides[side].hand).toHaveLength(openingHandSize[side]);
    expect(start.state.turn.phase).toBe("day");
    const next = passUntil(w.engine, start.state, at(w.engine, opponent(startingSide), "day"));
    expect(next.state.sides[opponent(startingSide)].hand).toHaveLength(openingHandSize[opponent(startingSide)] + 3);
    expect(drawn(next.events)).toHaveLength(3);
  });

  it.each(SIDES)("snapshots applicable count before its ordinary draw fills an empty hand: %s", side => {
    const empty = world(side, { while: noCardsIn("hand") });
    expect(drawn(boundary(empty).events)).toEqual(empty.ids[side].deck.slice(0, 3));
    const held = world(side, { while: noCardsIn("hand"), hand: true });
    expect(drawn(boundary(held).events)).toEqual(held.ids[side].deck.slice(0, 1));
  });

  it.each(SIDES)("counts each ordinary draw and lets its numbered trigger draw without recursion: %s", side => {
    const w = world(side, { abilities: [triggered(whenDraw("you", 2), draw(1)), triggered(whenDraw("you", 3), gainPoints(1))] });
    const phase = boundary(w);
    expect(drawn(phase.events)).toEqual(w.ids[side].deck.slice(0, 3));
    expect(phase.state.turnLog.drawn[side]).toBe(3);
    expect(phase.state.triggerQueue).toHaveLength(2);
    expect(phase.state.sides[side].score).toBe(0);
    let state = phase.state;
    const events: EngineEvent[] = [];
    while (state.triggerQueue.length > 0) {
      const result = runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
      if (result.kind !== "done") throw new Error("Numbered draw trigger unexpectedly suspended");
      state = result.state;
      events.push(...result.events);
    }
    expect(drawn(events)).toEqual(w.ids[side].deck.slice(3, 4));
    expect(state.turnLog.drawn[side]).toBe(4);
    expect(state.sides[side].score).toBe(1);
    expect(events.filter(e => e.kind === "triggerResolved")).toHaveLength(2);
  });

  it.each(SIDES)("ordinary event draws use their own count while the rule is held: %s", side => {
    const w = world(side, { phase: "day", hand: true });
    const cast = w.engine.apply(w.state, side, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const resolved = passUntil(w.engine, cast.state, state => state.stack.length === 0);
    expect(drawn([...cast.events, ...resolved.events])).toEqual(w.ids[side].deck.slice(0, 2));
    expect(resolved.state.turnLog.drawn[side]).toBe(2);
  });

  it.each(SIDES)("an actual extra turn has its ordinary and additional Draw cards: %s", side => {
    const w = world(side, { phase: "day" });
    const placed = boardState(w.engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
      [side]: { hand: [extraTurn.id], deck, energy: 1, dreamsigns: [signId] }, [opponent(side)]: { deck } });
    const cast = w.engine.apply(placed.state, side, { kind: "play", card: placed.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const next = passUntil(w.engine, cast.state, state => state.turn.turnNumber > placed.state.turn.turnNumber && at(w.engine, side, "day")(state));
    expect(next.state.turn.extra).toBe(true);
    expect(next.state.turn.round).toBe(placed.state.turn.round);
    expect(drawn([...cast.events, ...next.events])).toEqual(placed.ids[side].deck.slice(0, 3));
    expect(next.state.sides[opponent(side)].hand).toEqual([]);
  });

  it.each(SIDES.flatMap(side => [0, 1].map(size => ({ side, size }))))("ordinary Fatigue follows every missing request: $side/$size", ({ side, size }) => {
    const w = world(side, { deckSize: size, abilities: [triggered(whenDraw("you", 1), gainPoints(1))] });
    const result = boundary(w);
    expect(drawn(result.events)).toEqual(w.ids[side].deck);
    expect(result.state.turnLog.drawn[side]).toBe(size);
    expect(result.state.triggerQueue).toHaveLength(size);
    expect(result.events.filter(e => e.kind === "fatigue").map(e => e.points)).toEqual(size === 0 ? [1, 2, 4] : [1, 2]);
    expect(result.state.sides[opponent(side)].score).toBe(size === 0 ? 7 : 3);
  });

  it.each(SIDES)("P5 ends after the complete draw action and stops subsequent phases: %s", side => {
    const w = world(side, { deckSize: 0 });
    const result = boundary(w, { ...w.state, config: { ...w.state.config, scoreToWin: 1 } });
    expect(result.events.filter(e => e.kind === "fatigue").map(e => e.points)).toEqual([1, 2, 4]);
    expect(result.events[result.events.length - 1]).toMatchObject({ kind: "battleEnded" });
    expect(result.state.result).toEqual({ kind: "victory", winner: opponent(side), reason: "score" });
    expect(w.engine.decision(result.state)).toBeNull();
    expect(createFoldAdapter(w.engine).reduce(slice(result.state), { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "battleOver" });
  });

  it.each(SIDES)("replays immutable boundaries and preserves ordinary draw privacy: %s", side => {
    const w = world(side), phase = boundary(w), replayed = boundary(w, deserializeState(serializeState(w.state)));
    expect(stateHash(replayed.state)).toBe(stateHash(phase.state));
    expect(replayed.events).toEqual(phase.events);
    expect(stateHash(restored(slice(phase.state)).committed)).toBe(stateHash(phase.state));
    for (const viewer of SIDES) {
      const seen = w.engine.view(phase.state, viewer);
      const sampled = w.engine.determinize(w.engine.view(w.state, viewer), {
        player: deck.map(cardId => ({ cardId })), enemy: deck.map(cardId => ({ cardId })),
      }, () => 0.5);
      const sampledPhase = boundary(w, sampled);
      expect(sampledPhase.state.sides[side].hand).toHaveLength(3);
      expect(sampledPhase.state.turnLog.drawn[side]).toBe(3);
      expect(seen.sides[side].hand.count).toBe(3);
      expect(seen.sides[side].deck.count).toBe(9);
      for (const e of phase.events.filter(e => e.kind === "cardDrawn")) {
        expect(eventSeenBy(e, viewer, phase.state)).toEqual(viewer === side ? e : { ...e, instance: null });
      }
    }
    const corrupt = deserializeState(serializeState(phase.state));
    corrupt.floating.push({ id: "e1", timestamp: 1, source: { kind: "dreamsign", side, index: 0 }, controller: side,
      expiry: { at: "never" }, change: { kind: "additionalDrawPhaseCards", player: side, count: 2 } });
    expect(parseJourneyBattleFoldState(saved(slice(corrupt)))).toBeNull();
  });
});

describe("additional Draw-phase trigger recovery", () => {
  function pending(side: Side) {
    const w = world(opponent(side), { owner: side, abilities: [triggered(whenDraw("you", 2), optional(draw(1)))] });
    const beforeTurn = { ...w.state, turn: { ...w.state.turn, phase: "night" as const } };
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(beforeTurn), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("Expected real optional draw trigger prompt");
    return { ...w, fold, opened, pending };
  }
  it.each(SIDES)("reloads, refuses and accepts the ordinary trigger without repeating phase draws: %s", side => {
    const w = pending(side), before = stateHash(w.opened.slice.committed);
    expect(w.pending.prompt.kind).toBe("confirm");
    expect(w.opened.slice.committed.sides[side].hand).toEqual(w.ids[side].deck.slice(0, 3));
    expect(w.fold.reduce(w.opened.slice, { kind: "answer", side: opponent(side), promptId: w.pending.prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(w.fold.reduce(w.opened.slice, { kind: "answer", side, promptId: parsePromptId("0:0:0"), value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(w.fold.reduce(w.opened.slice, { kind: "answer", side, promptId: w.pending.prompt.id, value: 99 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(w.fold.reduce(w.opened.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(w.fold.reduce(w.opened.slice, { kind: "cancel", side, promptId: w.pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(w.opened.slice.committed)).toBe(before);
    const refusal = applied(w.fold.reduce(restored(w.opened.slice), { kind: "answer", side, promptId: w.pending.prompt.id, value: false }));
    expect(refusal.slice.committed.sides[side].hand).toEqual(w.ids[side].deck.slice(0, 3));
    expect(drawn(refusal.published)).toEqual([]);
    const answer = { kind: "answer", side, promptId: w.pending.prompt.id, value: true } as const;
    const direct = applied(w.fold.reduce(w.opened.slice, answer));
    const resumed = applied(createFoldAdapter(w.engine, { checkEventPrefix: true }).reduce(restored(w.opened.slice), answer));
    expect(stateHash(resumed.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(resumed.slice.committed.sides[side].hand).toEqual(w.ids[side].deck.slice(0, 4));
    expect(drawn(resumed.published)).toEqual(w.ids[side].deck.slice(3, 4));
    expect(w.fold.reduce(direct.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
});


describe("additional Draw-phase copy-continuation background", () => {
  function witness(side: Side, count: number | null) {
    const modal = { ...spell, id: syntheticId(0x617004), abilities: () => [event(chooseOne(gainPoints(0), gainEnergy(0)))] };
    const sign: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => [
      triggered(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard())),
      triggered(whenCopyTrigger("you", { cardType: "event" }), copyCard(triggeringCard())),
      ...(count === null ? [] : [staticAbility(additionalDrawPhaseCards("you", count))]),
    ] };
    const engine = createEngine(testCatalog([modal], { dreamsigns: [sign] }));
    const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
      [side]: { hand: [modal.id], deck, dreamsigns: [signId] }, [opponent(side)]: { deck } });
    const state = { ...board.state, config: { ...board.state.config, mandatoryLoopCheckFrom: 8, mandatoryLoopWindow: 16, resolutionCap: 32 } };
    let answers = 0;
    const source: AnswerSource = { answer(prompt) {
      if (++answers > 64) throw new Error("Public modal-copy witness exceeded its finite answer budget");
      return randomLegalAnswer(prompt, () => 0.25);
    } };
    return engine.apply(state, side, { kind: "play", card: board.ids[side].hand[0], from: "hand" }, source);
  }
  it.each(SIDES.flatMap(side => [0, 2].map(count => ({ side, count }))))("keeps a harmless static count $count through $side's mandatory modal-copy renewal", ({ side, count }) => {
    const baseline = witness(side, null);
    expect(baseline.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
    expect(baseline.answers.some(answer => answer.auto !== true)).toBe(true);
    const held = witness(side, count);
    expect(held.state.result).toEqual(baseline.state.result);
    expect(held.answers.some(answer => answer.auto !== true)).toBe(true);
    expect(drawn(held.events)).toEqual([]);
  });
});
