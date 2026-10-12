/** Current replay provenance is descriptive; discard eligibility stays in the rules prompt. */
import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { activated, energy, energyX, event } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { drawCard } from "../../../rules/resources";
import { opponent, type Side } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, SYNTHETIC_CARDS, syntheticId } from "../../../testing/synthetic-cards";
import { parseDreamwellCardId, parsePromptId } from "../../../../types/identifiers";
import { discard } from "../discard";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { optional } from "../optional";
import { sequence } from "../sequence";

function card(index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x56600 + index), status: "authored", abilities: () => [event(effect)] };
}
const one = card(0, sequence(draw(1), discard(1)));
const many = card(1, sequence(draw(2), discard(1)));
const zero = card(2, sequence(draw(0), discard(1)));
const confirmation = card(3, sequence(draw(1), optional(gainPoints(1)), discard(1)));
const twice = card(4, sequence(draw(1), discard(1), discard(1)));
const renewed = card(5, sequence(draw(1), discard(1), draw(1), discard(1)));
const foreign = card(6, sequence(draw(1, "opponent"), discard(1)));
const multiple: EngineCardDefinition = { ...one, id: syntheticId(0x56607), abilities: () => [event(draw(1)), event(discard(1))] };
const custom: EngineCardDefinition = { ...zero, id: syntheticId(0x56608), synthetic: { resolve(ctx, item) { drawCard(ctx, item.controller); } } };
const activation: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x56609), status: "authored",
  abilities: () => [activated([energy(0)], sequence(draw(1), discard(1)))] };
const dawn: EngineCardDefinition = { ...activation, id: syntheticId(0x5660a), abilities: () => [triggered(onDawn(), sequence(draw(1), discard(1)))] };
const cancellable: EngineCardDefinition = { ...one, id: syntheticId(0x5660b), costs: [energyX(0)] };
const drawOnly = card(12, draw(1));
const well = { id: parseDreamwellCardId("00000000-0000-4000-8000-000000056600"), order: 1, energyAdded: 1,
  status: "authored" as const, abilities: () => [event(sequence(draw(1), discard(1)))] };
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, one, many, zero, confirmation, twice, renewed,
  foreign, multiple, custom, activation, dawn, cancellable, drawOnly], [well]));
const fold = createFoldAdapter(engine, { checkEventPrefix: true });
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(outcome)}`);
  return outcome;
}
function fixture(subject = one, side: Side = "player") {
  const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { hand: [subject.id, v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla1.id, v.vanilla1.id], back: [activation.id], energy: 2 },
    [opponent(side)]: { hand: [v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla2.id] } });
  const state = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
  return { ...board, state, side, slice: sliceOf(state) };
}
function opened(subject = one, side: Side = "player") {
  const f = fixture(subject, side);
  const outcome = applied(fold.reduce(f.slice, { kind: "battleAction", side, action: { kind: "play", card: f.ids[side].hand[0], from: "hand" } }));
  return { ...f, outcome, slice: outcome.slice };
}
function pending(slice: BattleSlice) {
  const result = fold.pending(slice);
  if (result === null) throw new Error("Missing public pending prompt");
  return result;
}
function answer(slice: BattleSlice, value: Answer) {
  const prompt = pending(slice).prompt;
  return applied(fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value }));
}

describe("drawn discard hints", () => {
  for (const side of ["player", "enemy"] as const) {
    it.each([one, many])(`${side} identifies current drawn physical instances without changing the whole hand`, (subject) => {
      const f = opened(subject, side);
      const p = pending(f.slice);
      const draws = f.outcome.published.flatMap(e => e.kind === "cardDrawn" && e.side === side && e.instance !== null ? [e.instance] : []);
      expect(draws).not.toHaveLength(0);
      expect(p.drawnForDiscard).toEqual(draws);
      expect(p.prompt).toMatchObject({ kind: "chooseCards", side, purpose: { role: "discard" }, min: 1, max: 1 });
      if (p.prompt.kind !== "chooseCards") throw new Error("Expected discard");
      expect(new Set(p.prompt.candidates)).toEqual(new Set([...f.ids[side].hand.slice(1), ...draws]));
      expect(p.drawnForDiscard).not.toContain(f.ids[side].hand[1]);
      const completed = answer(f.slice, [f.ids[side].hand[1]]);
      expect(completed.published.filter(e => e.kind === "discarded")).toEqual([{ kind: "discarded", side, instance: f.ids[side].hand[1] }]);
      expect(completed.slice.committed.sides[side].hand).toEqual(expect.arrayContaining(draws));
      expect(fold.pending(completed.slice)).toBeNull();
    });

    it(`${side} keeps preceding draws through a non-discard confirmation`, () => {
      const f = opened(confirmation, side);
      expect(pending(f.slice).prompt.kind).toBe("confirm");
      expect(pending(f.slice).drawnForDiscard).toBeUndefined();
      const continued = answer(f.slice, true);
      expect(pending(continued.slice).drawnForDiscard).toEqual(f.ids[side].deck.slice(0, 1));
    });

    it(`${side} resets after an answered discard and tracks only newly drawn cards afterward`, () => {
      for (const subject of [twice, renewed]) {
        const f = opened(subject, side);
        const continued = answer(f.slice, [f.ids[side].hand[1]]);
        expect(pending(continued.slice).drawnForDiscard).toEqual(subject === twice ? [] : f.ids[side].deck.slice(1, 2));
        expect(pending(continued.slice).display.sides[side].hand).toContain(f.ids[side].deck[0]);
      }
    });

    it(`${side} uses the captured activation body`, () => {
      const f = fixture(one, side);
      const source = f.ids[side].back[0];
      if (source === null) throw new Error("Missing activation source");
      const activated = applied(fold.reduce(f.slice, { kind: "battleAction", side, action: { kind: "activate", source, ability: 0 } }));
      expect(pending(activated.slice).drawnForDiscard).toEqual(f.ids[side].deck.slice(0, 1));
    });

    it(`${side} derives queued trigger and Dreamwell body hints, excluding other automatic steps`, () => {
      for (const dreamwell of [false, true]) {
        const b = boardState(engine.catalog, { active: opponent(side), phase: "night", scoreToWin: 100,
          [side]: { hand: [v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla1.id, v.vanilla2.id], back: dreamwell ? [] : [dawn.id] },
          [opponent(side)]: { deck: [v.vanilla1.id] } });
        const state = { ...b.state, config: { ...b.state.config, autoAnswerForcedPrompts: false },
          ...(dreamwell ? { dreamwell: { deck: [well.id], next: 0, catalog: [well.id] } } : {}) };
        const start = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
        expect(pending(start.slice).drawnForDiscard).toEqual(pending(start.slice).display.sides[side].hand.filter(id => !start.slice.committed.sides[side].hand.includes(id)));
      }
    });

    it(`${side} preserves undefined for ambiguous bodies and returns empty for proved zero/foreign draws`, () => {
      for (const subject of [zero, foreign, multiple, custom]) {
        const f = opened(subject, side);
        expect(pending(f.slice).drawnForDiscard).toEqual(subject === multiple || subject === custom ? undefined : []);
      }
    });
  }

  it("does not reuse draws from another resolved source or step", () => {
    const state = boardState(engine.catalog, { active: "player", phase: "day",
      player: { hand: [drawOnly.id, zero.id, v.vanilla1.id], deck: [v.vanilla2.id], energy: 2 } }).state;
    const first = engine.apply(state, "player", { kind: "play", card: state.sides.player.hand[0], from: "hand" }, NO_PROMPTS);
    const continued = applied(fold.reduce(sliceOf(first.state), { kind: "battleAction", side: "player", action: { kind: "play", card: first.state.sides.player.hand[0], from: "hand" } }));
    expect(pending(continued.slice).drawnForDiscard).toEqual([]);
    expect(pending(continued.slice).display.sides.player.hand).toContain(first.events.find(e => e.kind === "cardDrawn")?.instance);
  });

  it("reconstructs on JSON restart and does not change on rejected or competing intents", () => {
    const f = opened();
    const restored = JSON.parse(JSON.stringify(f.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(restored)).toEqual(pending(f.slice));
    const p = pending(restored).prompt;
    const before = JSON.stringify(restored);
    for (const intent of [
      { kind: "answer", side: "enemy", promptId: p.id, value: [f.ids.player.hand[1]] },
      { kind: "answer", side: "player", promptId: parsePromptId("0:0:9"), value: [f.ids.player.hand[1]] },
      { kind: "answer", side: "player", promptId: p.id, value: [] },
      { kind: "battleAction", side: "enemy", action: { kind: "pass" } },
      { kind: "cancel", side: "player", promptId: p.id },
    ] as const) expect(fresh.reduce(restored, intent).kind).toBe("bounced");
    expect(JSON.stringify(restored)).toBe(before);
    expect(fresh.pending(restored)?.drawnForDiscard).toEqual(f.ids.player.deck.slice(0, 1));
    const completed = applied(fresh.reduce(restored, { kind: "answer", side: "player", promptId: p.id, value: [f.ids.player.hand[1]] }));
    expect(fresh.pending(completed.slice)).toBeNull();
    expect(fresh.reduce(completed.slice, { kind: "answer", side: "player", promptId: p.id, value: [f.ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(answer(f.slice, [f.ids.player.hand[1]]).slice.committed).toEqual(completed.slice.committed);
  });

  it("offers no hint on a cancellable preparation or a failed replay", () => {
    const f = opened(cancellable);
    const p = pending(f.slice);
    expect(p.prompt.kind).toBe("chooseNumber");
    expect(p.drawnForDiscard).toBeUndefined();
    const cancelled = applied(fold.reduce(f.slice, { kind: "cancel", side: "player", promptId: p.prompt.id }));
    expect(fold.pending(cancelled.slice)).toBeNull();
    const current = opened();
    if (current.slice.inFlight === null) throw new Error("Expected in-flight resolution");
    const corrupt = { ...current.slice, inFlight: { ...current.slice.inFlight, answers: [{ fingerprint: promptFingerprint({ ...pending(current.slice).prompt, purpose: { ...pending(current.slice).prompt.purpose, role: "youMay" } }), value: false }] } };
    expect(fold.pending(corrupt)).toBeNull();
    const failed = fold.reduce(corrupt, { kind: "answer", side: "player", promptId: pending(current.slice).prompt.id, value: [] });
    expect(failed.kind === "applied" && failed.error?.kind).toBe("engine_error");
    if (failed.kind === "applied") expect(fold.pending(failed.slice)).toBeNull();
  });
});
