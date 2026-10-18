/** Completed opening setup uses ordinary trigger FIFO, prompts and saved replay before turn one. */
import { describe, expect, it } from "vitest";
import { BATTLE } from "../../../../content/battle";
import { parseCardSubtype } from "../../../../types/card-identity";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { parseAvatarId, parseDreamsignId, parsePromptId } from "../../../../types/identifiers";
import type { EngineDreamsignDefinition } from "../../../catalog";
import { conditionCardCounts, self } from "../../../dsl/builders";
import { afterOpeningHand, atStartOfFirstTurn, atStartOfTurn, either, onDawn, triggered, whenDiscard, whenDraw } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords } from "../../../log";
import type { Answer } from "../../../prompts/types";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, sourceKey, type DreamsignId, type Side } from "../../../state/ids";
import type { BattleInit, BattleSetup, NextBattleEffects, OpeningHandDraw } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations, promptRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { promptView } from "../../../view/view";
import { gainAdditionalSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { redrawChosenHand } from "../partial-redraw-hand";
import { sequence } from "../sequence";

const signId = (suffix: number) => parseDreamsignId(`5e5e5e5e-0000-4000-8000-${suffix.toString(16).padStart(12, "0")}`);
const ids = { plain: signId(0x618001), redraw: signId(0x618002), paused: signId(0x618003), fail: signId(0x618004),
  watchers: signId(0x618005), first: signId(0x618006), condition: signId(0x618007), prefixFail: signId(0x618008), combined: signId(0x618009) };
const sign = (id: DreamsignId, abilities: EngineDreamsignDefinition["abilities"]): EngineDreamsignDefinition => ({ id, status: "authored", abilities });
const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000618020"), status: "authored" as const,
  abilities: () => [triggered(afterOpeningHand(), gainPoints(10))] };
const held = { ...v.vanilla1, id: syntheticId(0x618100), status: "authored" as const, subtype: parseCardSubtype("OpeningSource"),
  abilities: () => [triggered(afterOpeningHand(), redrawChosenHand(), { zone: "hand" })] };
const filtered = { ...v.vanilla2, id: syntheticId(0x618101), status: "authored" as const, subtype: parseCardSubtype("Opening"),
  abilities: () => [triggered(afterOpeningHand(), gainPoints(3), { zone: "hand" })] };
const definitions = [
  sign(ids.plain, () => [triggered(afterOpeningHand(), gainPoints(1))]),
  sign(ids.redraw, () => [triggered(afterOpeningHand(), optional(redrawChosenHand()))]),
  sign(ids.paused, () => [triggered(afterOpeningHand(), sequence(redrawChosenHand(), optional(gainPoints(2))))]),
  sign(ids.fail, () => [triggered(afterOpeningHand(), sequence(redrawChosenHand(), gainAdditionalSpark(self(), 1)))]),
  sign(ids.watchers, () => [triggered(whenDraw(), gainPoints(100)), triggered(whenDiscard(), gainPoints(100))]),
  sign(ids.first, () => [triggered(atStartOfFirstTurn(), gainPoints(2)), triggered(atStartOfTurn(), gainPoints(3))]),
  sign(ids.condition, () => [triggered(afterOpeningHand(), gainPoints(5), { condition: conditionCardCounts("hand", 2, { player: "opponent" }) })]),
  sign(ids.prefixFail, () => [triggered(afterOpeningHand(), sequence(redrawChosenHand(), optional(gainAdditionalSpark(self(), 1))))]),
  sign(ids.combined, () => [triggered(either(afterOpeningHand(), onDawn()), gainPoints(1), { oncePerTurn: true })]),
];
const engine = createEngine(testCatalog([held, filtered], { avatars: [avatar], dreamsigns: definitions }));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const effects = (openingHand: readonly OpeningHandDraw[] = [{ count: 2, filter: null }], startingEnergy = 3): NextBattleEffects => ({
  openingHand, startingEnergy, smallerHandAndCostDiscount: [{ openingHandDelta: -Number.MAX_SAFE_INTEGER, costReduction: 0 }],
});
function init(startingSide: Side, dreamsigns: BattleInit["dreamsigns"] = { player: [ids.plain], enemy: [ids.plain] }): BattleInit {
  const deck = Array.from({ length: 20 }, () => ({ cardId: v.vanilla1.id }));
  return { seed: battleSeed("completed-opening"), scoreToWin: 1000, startingSide, decks: { player: deck, enemy: deck }, dreamwell: [], dreamsigns,
    nextBattle: { player: effects(), enemy: effects(undefined, 4) } };
}
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error("Opening intent failed");
  return out;
}
function world(startingSide: Side, dreamsigns: BattleInit["dreamsigns"] = { [startingSide]: [ids.redraw] }) {
  const input = init(startingSide, dreamsigns), fold = createFoldAdapter(engine, { checkEventPrefix: true });
  return { input, fold, opened: applied(fold.start(input)) };
}
function pending(w: ReturnType<typeof world>, slice = w.opened.slice) {
  const out = w.fold.pending(slice);
  if (out === null) throw new Error("Expected an opening prompt");
  return out;
}
function answer(w: ReturnType<typeof world>, value: Answer, slice = w.opened.slice) {
  const { prompt } = pending(w, slice);
  return applied(w.fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value }));
}
const completed = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "openingHandCompleted");
const queued = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerQueued");
const resolved = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerResolved");
const draws = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "cardDrawn");
function loaded(input: BattleInit, slice: BattleSlice): BattleSlice {
  const parsed = parseEngineBattleFold(copy({ init: input, slice }), engine.catalog);
  if (parsed === null) throw new Error("Opening save rejected");
  return parsed.slice;
}

describe("completed opening hand", () => {
  it.each(SIDES)("settles both hands and energies before starter-first occasions and genuine first turn: %s", startingSide => {
    const input = { ...init(startingSide, { player: [ids.condition, ids.plain, ids.plain], enemy: [ids.condition, ids.plain, ids.plain] }),
      avatars: { player: avatar.id, enemy: avatar.id } };
    const out = engine.createBattle(input, NO_PROMPTS);
    expect(completed(out.events)).toEqual([startingSide, opponent(startingSide)].map(side => ({ kind: "openingHandCompleted", side })));
    const first = out.events.findIndex(e => e.kind === "openingHandCompleted");
    expect(draws(out.events.slice(0, first))).toHaveLength(4);
    expect(out.events.slice(0, first).flatMap(e => e.kind === "energyChanged" && e.cause === "refresh" ? [e.side] : [])).toEqual(SIDES);
    const sources = [startingSide, opponent(startingSide)].flatMap(side => [`avatar:${side}`, ...[0, 1, 2].map(index => `dreamsign:${side}:${index}`)]);
    expect(queued(out.events).map(e => e.source === null ? null : sourceKey(e.source))).toEqual(sources);
    expect(resolved(out.events).map(e => e.controller)).toEqual([startingSide, startingSide, startingSide, startingSide, opponent(startingSide), opponent(startingSide), opponent(startingSide), opponent(startingSide)]);
    for (const side of SIDES) {
      expect(out.state.sides[side].hand).toHaveLength(2);
      expect(out.state.sides[side].score).toBe(17);
      expect(out.state.sides[side].currentEnergy).toBe(BATTLE.startingEnergy + (side === "player" ? 3 : 4));
    }
    const begun = out.events.findIndex(e => e.kind === "turnStarted");
    expect(out.events.slice(begun).some(e => e.kind === "triggerResolved")).toBe(false);
    expect(out.state.turn.turnNumber).toBe(1);
    expect(engine.decision(out.state)?.side).toBe(startingSide);
    expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("completes ordinary and every extra filtered group before admitting held sources: %s", startingSide => {
    const input = init(startingSide, {}), other = opponent(startingSide);
    const deck = [...input.decks[startingSide], { cardId: filtered.id }];
    const out = engine.createBattle({ ...input, decks: { ...input.decks, [startingSide]: deck }, nextBattle: {
      [startingSide]: effects([{ count: 1, filter: null }, { count: 0, filter: null }, { count: 2, filter: { subtype: parseCardSubtype("Opening") } }, { count: 5, filter: { subtype: parseCardSubtype("Absent") } }]),
      [other]: { ...effects([{ count: 1, filter: null }]), smallerHandAndCostDiscount: [] },
    } }, NO_PROMPTS);
    expect(out.state.sides[startingSide].hand).toHaveLength(2);
    expect(out.state.sides[other].hand).toHaveLength(out.state.config.openingHandSize[other] + 1);
    expect(out.state.sides[startingSide].score).toBe(3);
    const boundary = out.events.findIndex(e => e.kind === "openingHandCompleted");
    expect(draws(out.events.slice(0, boundary))).toHaveLength(out.state.sides.player.hand.length + out.state.sides.enemy.hand.length);
    const source = out.state.sides[startingSide].hand.find(id => out.state.instances[id].printing.kind === "card" && out.state.instances[id].printing.cardId === filtered.id);
    expect(queued(out.events)).toMatchObject([{ source, controller: startingSide, subject: null }]);
  });

  it.each(SIDES.flatMap(side => ["absent", "zero", "nonmatching", "fatigue"].map(mode => ({ side, mode }))))("completes zero or missing draws once: $side/$mode", ({ side, mode }) => {
    const input = init(side);
    const group: readonly OpeningHandDraw[] = mode === "zero" ? [{ count: 0, filter: null }] : mode === "nonmatching" ? [{ count: 2, filter: { subtype: parseCardSubtype("Absent") } }] : [];
    const out = engine.createBattle({ ...input, ...(mode === "fatigue" ? { decks: { ...input.decks, [side]: [] } } : {}), nextBattle: {
      ...input.nextBattle, [side]: effects(mode === "fatigue" ? [{ count: 2, filter: null }] : group),
    } }, NO_PROMPTS);
    expect(out.state.sides[side].hand).toEqual([]);
    expect(completed(out.events).filter(e => e.side === side)).toEqual([{ kind: "openingHandCompleted", side }]);
    expect(resolved(out.events).filter(e => e.controller === side)).toHaveLength(1);
    expect(out.events.filter(e => e.kind === "fatigue" && e.side === side)).toHaveLength(mode === "fatigue" ? 2 : 0);
  });

  it.each(SIDES)("keeps completion before every opening prompt, gameplay and real first-turn/Dreamwell boundary: %s", side => {
    const w = world(side, { player: [ids.redraw, ids.watchers, ids.first], enemy: [ids.redraw, ids.watchers, ids.first] });
    const opened = pending(w);
    expect(opened.prompt).toMatchObject({ side, kind: "confirm", cancellable: false });
    expect(w.opened.slice.committed.turn).toMatchObject({ turnNumber: 0, beginning: true, phase: "dreamwell", sideTurns: { player: 0, enemy: 0 } });
    expect(engine.decision(w.opened.slice.committed)).toBeNull();
    expect(w.opened.published.some(e => e.kind === "turnStarted" || e.kind === "phaseChanged" || e.kind === "dreamwellDrawn")).toBe(false);
    const subset = answer(w, true), choice = pending(w, subset.slice);
    if (choice.prompt.kind !== "chooseCards") throw new Error("Missing real redraw subset");
    const redrawn = answer(w, choice.prompt.candidates, subset.slice);
    expect(draws(redrawn.published)).toHaveLength(2);
    expect(completed(redrawn.published)).toEqual([]);
    expect(queued(redrawn.published)).toEqual([]);
    expect(redrawn.slice.committed.sides[side].score).toBe(0);
    expect(pending(w, redrawn.slice).prompt.side).toBe(opponent(side));
    expect(redrawn.published.some(e => e.kind === "turnStarted")).toBe(false);
    const done = answer(w, false, redrawn.slice);
    expect(done.slice.committed.turn.turnNumber).toBe(1);
    expect(done.slice.committed.sides[side].score).toBe(5);
    expect(done.slice.committed.turnLog.drawn).toEqual({ player: 0, enemy: 0 });
    const started = done.published.findIndex(e => e.kind === "turnStarted");
    const phase = done.published.findIndex(e => e.kind === "phaseChanged" && e.phase === "dreamwell");
    expect(started).toBeGreaterThanOrEqual(0);
    expect(phase).toBeGreaterThan(started);
    expect(resolved(done.published.slice(started, phase))).toHaveLength(2);
    expect(done.published.some(e => e.kind === "dreamwellDrawn")).toBe(false);
    const next = passUntil(engine, done.slice.committed, at(engine, opponent(side), "day"));
    expect(next.state.sides[opponent(side)].score).toBe(105);
    expect(completed(next.events)).toEqual([]);
    expect(draws(next.events)).toHaveLength(1);
  });

  it.each(SIDES)("resolves duplicate held sources FIFO and retains a captured self-discarded hand source: %s", side => {
    const input = init(side, { [side]: [ids.redraw, ids.redraw] });
    const fold = createFoldAdapter(engine), w = { input, fold, opened: applied(fold.start(input)) };
    const one = answer(w, false);
    expect(pending(w, one.slice).prompt.purpose.source).toMatchObject({ kind: "dreamsign", side, index: 1 });
    const two = answer(w, true, one.slice), subset = pending(w, two.slice);
    if (subset.prompt.kind !== "chooseCards") throw new Error("No duplicate-source subset");
    const done = answer(w, [], two.slice);
    expect(draws(done.published)).toEqual([]);
    expect(done.slice.committed.turn.turnNumber).toBe(1);
    const heldInit = { ...init(side, {}), decks: { ...input.decks, [side]: [...input.decks[side], { cardId: held.id }, { cardId: held.id }] },
      nextBattle: { ...input.nextBattle, [side]: effects([{ count: 2, filter: { subtype: parseCardSubtype("OpeningSource") } }]) } };
    const heldFold = createFoldAdapter(engine), hw = { input: heldInit, fold: heldFold, opened: applied(heldFold.start(heldInit)) };
    const p = pending(hw);
    if (p.prompt.kind !== "chooseCards") throw new Error("No held-source subset");
    const source = hw.opened.slice.committed.triggerQueue[0].source;
    if (typeof source !== "string") throw new Error("Expected physical held source");
    expect(p.prompt.candidates).toContain(source);
    const changed = answer(hw, p.prompt.candidates);
    expect(changed.slice.committed.sides[side].void).toContain(source);
    expect(pending(hw, changed.slice).prompt.purpose.source).not.toBe(source);
    const finish = answer(hw, [], changed.slice);
    expect(finish.slice.committed.turn.turnNumber).toBe(1);
    expect(resolved([...hw.opened.published, ...changed.published, ...finish.published])).toHaveLength(2);
  });

  it.each(SIDES)("keeps setup-only once uses separate from the genuine first turn: %s", side => {
    const out = engine.createBattle(init(side, { [side]: [ids.combined] }), NO_PROMPTS);
    expect(resolved(out.events)).toHaveLength(2);
    expect(out.state.sides[side].score).toBe(2);
    expect(resolved(out.events).map(e => e.ability)).toEqual([0, 0]);
  });

  it.each(SIDES)("publishes and logs only the side while keeping hands and subsets private: %s", side => {
    const w = world(side), next = answer(w, true), p = pending(w, next.slice);
    const transported = copy(completed(w.opened.published));
    for (const viewer of SIDES) for (const event of transported) expect(eventSeenBy(event, viewer, p.display)).toEqual({ kind: "openingHandCompleted", side: event.side });
    expect(transported).toEqual([side, opponent(side)].map(holder => ({ kind: "openingHandCompleted", side: holder })));
    expect(queued(w.opened.published).every(e => e.subject === null)).toBe(true);
    expect(eventLogRecords(w.opened.published, 0).filter(e => e.event === "engine.openingHandCompleted")).toEqual(transported.map(detail => ({ event: "engine.openingHandCompleted", version: 0, detail })));
    expect(promptView(p.prompt, opponent(side), p.display)).toMatchObject({ candidates: [] });
    expect(promptRedactionViolations(p.prompt, p.display, engine.catalog)).toEqual([]);
    expect(eventRedactionViolations(w.opened.published, w.opened.slice.committed, p.display)).toEqual([]);
    for (const id of p.display.sides[side].hand) expect(engine.view(p.display, opponent(side)).instances[id]).toBeUndefined();
    const noListeners = engine.createBattle(init(side, {}), NO_PROMPTS);
    expect(eventLogRecords(noListeners.events, 0).filter(e => e.event === "engine.openingHandCompleted")).toHaveLength(2);
  });

  it.each(SIDES)("refuses invalid stale foreign cancelled and competing answers without partial setup: %s", side => {
    const w = world(side), p = pending(w), original = copy(w.opened.slice), before = stateHash(original.committed);
    const intent: BattleIntent = { kind: "answer", side, promptId: p.prompt.id, value: true };
    expect(w.fold.reduce(w.opened.slice, { ...intent, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(w.fold.reduce(w.opened.slice, { ...intent, promptId: parsePromptId("0:0:0") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(w.fold.reduce(w.opened.slice, { ...intent, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(w.fold.reduce(w.opened.slice, { kind: "cancel", side, promptId: p.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(w.fold.reduce(w.opened.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(w.opened.slice).toEqual(original);
    const chosen = answer(w, true), subset = pending(w, chosen.slice);
    if (subset.prompt.kind !== "chooseCards") throw new Error("No subset");
    const foreign = chosen.slice.committed.sides[opponent(side)].hand[0], one = subset.prompt.candidates[0];
    for (const value of [[foreign], [one, one], [...subset.prompt.candidates, foreign]]) expect(w.fold.reduce(chosen.slice, { kind: "answer", side, promptId: subset.prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const done = answer(w, [one], chosen.slice);
    expect(w.fold.reduce(done.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(original.committed)).toBe(before);
    expect(applied(w.fold.reduce(original, intent))).toEqual(chosen);
  });

  it.each(SIDES)("cold-replays pending and partial-prefix prompts without repeated completion or redraw: %s", side => {
    const w = world(side, { [side]: [ids.paused] }), p = pending(w);
    if (p.prompt.kind !== "chooseCards") throw new Error("No initial subset");
    const cold = createFoldAdapter(engine, { checkEventPrefix: true }), restored = loaded(w.input, w.opened.slice);
    expect(cold.pending(restored)).toEqual(p);
    expect(cloneState(restored.committed)).toEqual(restored.committed);
    expect(stateHash(cloneState(restored.committed))).toBe(stateHash(restored.committed));
    expect(stateHash(deserializeState(serializeState(restored.committed)))).toBe(stateHash(restored.committed));
    const intent: BattleIntent = { kind: "answer", side, promptId: p.prompt.id, value: [p.prompt.candidates[0]] };
    const warm = applied(w.fold.reduce(w.opened.slice, intent)), again = applied(cold.reduce(restored, intent));
    expect(again).toEqual(warm);
    expect(draws(warm.published)).toHaveLength(1);
    expect(completed(warm.published)).toEqual([]);
    const tail = loaded(w.input, warm.slice), trailing = cold.pending(tail);
    if (trailing === null) throw new Error("No trailing confirm");
    const done = applied(cold.reduce(tail, { kind: "answer", side, promptId: trailing.prompt.id, value: false }));
    expect(draws(done.published)).toEqual([]);
    expect(completed(done.published)).toEqual([]);
    expect(done.published.filter(e => e.kind === "turnStarted")).toHaveLength(1);
    expect(done.slice.committed.sides[side].hand).toHaveLength(2);
    const history: BattleSlice = { ...warm.slice, history: { base: copy(w.opened.slice), entries: [{ intent }] } };
    expect(loaded(w.input, history)).toEqual(history);
    for (const location of ["current", "history"] as const) {
      const malformed = copy({ init: w.input, slice: history });
      const target = location === "current" ? malformed.slice.committed : malformed.slice.history!.base.committed;
      Object.assign(target.turn, { beginning: "invalid" });
      expect(parseEngineBattleFold(malformed, engine.catalog)).toBeNull();
    }
    for (const viewer of SIDES) {
      const view = engine.view(restored.committed, viewer), sampled = engine.determinize(view, w.input.decks, () => 0.5);
      expect(sampled.turn).toEqual(restored.committed.turn);
      expect(engine.view(sampled, viewer)).toEqual(view);
      expect(invariantViolations(sampled, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("rolls back definition failures and failed published suffixes at the opening boundary: %s", side => {
    for (const id of [ids.fail, ids.prefixFail]) {
      const w = world(side, { [side]: [id] }), p = pending(w);
      if (p.prompt.kind !== "chooseCards") throw new Error("No failing subset");
      const first = w.fold.reduce(w.opened.slice, { kind: "answer", side, promptId: p.prompt.id, value: p.prompt.candidates });
      if (first.kind !== "applied") throw new Error("Failure intent bounced");
      const out = id === ids.fail ? first : (() => {
        const tail = pending(w, first.slice);
        return w.fold.reduce(first.slice, { kind: "answer", side, promptId: tail.prompt.id, value: true });
      })();
      if (out.kind !== "applied" || out.error === null) throw new Error("Expected real definition error");
      for (const holder of SIDES) {
        expect(out.slice.committed.sides[holder].hand).toEqual(w.opened.slice.committed.sides[holder].hand);
        expect(out.slice.committed.sides[holder].deck).toEqual(w.opened.slice.committed.sides[holder].deck);
      }
      expect(out.slice.committed.turn).toEqual(w.opened.slice.committed.turn);
      expect(out.slice.committed.triggerQueue).toEqual(w.opened.slice.committed.triggerQueue);
      expect(out.published.some(e => e.kind === "cardDrawn" || e.kind === "discarded" || e.kind === "turnStarted")).toBe(false);
      expect(out.slice.inFlight).toBeNull();
    }
    const input = init(side, { [side]: [ids.redraw] }), frozen = copy(input);
    expect(() => engine.createBattle(input, { answer() { throw new Error("Source refused"); } })).toThrow("Source refused");
    expect(input).toEqual(frozen);
    const healthy = engine.createBattle(input, new ScriptedSource([false]));
    expect(healthy).toEqual(engine.createBattle(copy(input), new ScriptedSource([false])));
    expect(completed(healthy.events)).toHaveLength(2);
  });

  it.each(SIDES.flatMap(side => ["draw", "dawn", "day"].map(phase => ({ side, phase: phase as BattleSetup["turn"]["phase"] }))))("prepared $phase entry bypasses opening completion: $side", ({ side, phase }) => {
    const setup: BattleSetup = { placements: [{ side, deckIndex: 0, zone: "hand" }],
      sides: { player: { currentEnergy: 3, maxEnergy: 3, score: 0 }, enemy: { currentEnergy: 3, maxEnergy: 3, score: 0 } },
      turn: { active: side, phase, round: 2, turnNumber: 3, sideTurns: { [side]: 2, [opponent(side)]: 1 } as Record<Side, number>, lastNormal: side },
      dreamwell: { deck: [], next: 0 } };
    const input = { ...init(side, { [side]: [ids.redraw, ids.first] }), nextBattle: undefined, setup };
    const out = engine.createBattle(input, NO_PROMPTS);
    expect(completed(out.events)).toEqual([]);
    expect(resolved(out.events)).toEqual([]);
    expect(out.state.turn.turnNumber).toBe(3);
    expect(out.state.sides[side].hand).toHaveLength(phase === "draw" ? 2 : 1);
    const next = passUntil(engine, out.state, at(engine, opponent(side), "day"));
    expect(completed(next.events)).toEqual([]);
  });
});
