import { describe, expect, it } from "vitest";
import { parsePromptId } from "../../../../types/identifiers";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, additionalCost, abandonCost, abandonSparkCapture, choiceCost, discardHandCost, energy, event, stackItem, target, optionalCost, revealCost, revealSourceCost, self, staticAbility, all, characterYouControl, x } from "../../../dsl/builders";
import type { Cost } from "../../../dsl/types";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { firstLegalAnswer } from "../../../prompts/answers";
import type { EngineEvent } from "../../../events";
import { abilitySources, canActivate, instanceOrigin } from "../../../rules/activation";
import type { Action } from "../../../rules/actions";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { payCosts, type CostPlan } from "../../../rules/costs";
import { moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import * as p from "../index";

const make = (index: number, costs: readonly Cost[], options: { zone?: "play" | "void" | "hand"; capture?: boolean } = {}): EngineCardDefinition => ({
  id: syntheticId(0x63100 + index), cardType: "character", costs: [energy(4)], spark: 2, subtype: "Warrior", speed: "standard", status: "authored",
  abilities: () => [activated(costs, options.capture ? p.sequence(p.gainPoints(x()), p.changeCardCost(self(), { reduce: 1 })) : p.changeCardCost(self(), { reduce: 1 }), { zone: options.zone ?? "hand" })],
});
const card = make(0, [abandonCost(), revealSourceCost()]);
const exact = make(1, [revealSourceCost()]);
const twice = make(2, [revealSourceCost(), revealSourceCost()]);
const discardThen = make(3, [discardHandCost(), revealSourceCost()]);
const revealThen = make(4, [revealSourceCost(), discardHandCost()]);
const optionalThen = make(5, [optionalCost(discardHandCost()), revealSourceCost()]);
const nestedThen = make(6, [choiceCost([discardHandCost(), revealSourceCost()])]);
const genericTwice = make(7, [revealCost(), revealSourceCost()]);
const generic = make(8, [revealCost()], { zone: "play" });
const captured = make(9, [abandonSparkCapture(), revealSourceCost()], { capture: true });
const ordinary = make(10, [], { zone: "play" });
const voidSource = make(11, [], { zone: "void" });
const support: EngineCardDefinition = { ...make(12, []), abilities: () => [staticAbility(p.sparkModifier(all(characterYouControl()), 2))] };
const playReserved: EngineCardDefinition = { ...make(13, []), abilities: () => [additionalCost(revealSourceCost())] };
const afterChoice = make(14, [discardHandCost(), choiceCost([revealSourceCost()], [energy(1)])]);
const afterOptional = make(15, [discardHandCost(), optionalCost(revealSourceCost())]);
const spell = (index: number, effect: Parameters<typeof event>[0], speed: "standard" | "interrupt" = "standard"): EngineCardDefinition => ({
  id: syntheticId(0x63100 + index), cardType: "event", costs: [energy(0)], spark: null, subtype: "", speed, status: "authored", abilities: () => [event(effect)],
});
const recall = spell(16, p.returnToHand(target(characterYouControl())));
const dissolve = spell(17, p.dissolve(target(characterYouControl())));
const interruption = spell(18, p.discard(1, "opponent"), "interrupt");
const prevention = spell(19, p.prevent(stackItem({})), "interrupt");
const failingInterrupt: EngineCardDefinition = { ...spell(20, p.discard(1, "opponent"), "interrupt"), synthetic: {
  resolve(ctx, item) {
    resolveEffect(ctx, p.discard(1, "opponent"), {
      source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, controller: item.controller,
      x: item.x, optionalPaid: item.optionalPaid, choices: item.choices[0],
    });
    throw new Error("synthetic failure after source discard");
  },
} };
const revealBeforeAbandon = make(21, [revealSourceCost(), abandonCost()]);
const unrevealed = make(22, []);
// These public fixture definitions match the retained eight-cell pre-repair continuation probe.
const restart = [false, true].map((first, index) => ({
  ...make(23 + index, first ? [revealSourceCost(), abandonCost()] : [abandonCost(), revealSourceCost()]),
  id: syntheticId(0x70700 + index),
}));
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, card, exact, twice, discardThen, revealThen, optionalThen, nestedThen, genericTwice, generic, captured, ordinary, voidSource, support, playReserved, afterChoice, afterOptional, recall, dissolve, interruption, prevention, failingInterrupt, revealBeforeAbandon, unrevealed, ...restart], []));
const fold = () => createFoldAdapter(engine);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const other = (side: Side): Side => side === "player" ? "enemy" : "player";
const action = (source: InstanceId): Action => ({ kind: "activate", source, ability: 0 });
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (out: IntentOutcome): Extract<IntentOutcome, { kind: "applied" }> => {
  if (out.kind !== "applied") throw new Error(`bounced ${out.reason}`);
  expect(out.error).toBeNull();
  return out;
};
const board = (side: Side, source = card, hand = [source.id, SYNTHETIC.event0.id], back = [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id]) => boardState(engine.catalog, {
  active: side, phase: "day", [side]: { hand, back, energy: 0, deck }, [other(side)]: { deck },
});
const legal = (state: BattleState, side: Side, source: InstanceId) => engine.legalActions(state, side).some(a => a.kind === "activate" && a.source === source);
const finish = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0).state;
const sourceNotices = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "promptAutoAnswered" && e.purpose.role === "revealCost");
const reduced = (state: BattleState, side: Side, source: InstanceId) => engine.view(state, side).instances[source]?.characteristics.cost;

for (const side of ["player", "enemy"] as const) describe(`physical hand activation: ${side}`, () => {
  it("reveals only the exact source once, abandons its distinct victim, and changes only its physical cost", () => {
    const { state, ids } = board(side, card, [card.id, card.id]);
    const [source, decoy] = ids[side].hand;
    const adapter = fold();
    const opened = applied(adapter.reduce(sliceOf(state), { kind: "battleAction", side, action: action(source) }));
    const pending = adapter.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(engine.view(pending.display, other(side)).instances[source]).toBeUndefined();
    const privatePrompt = promptView(pending.prompt, other(side), pending.display);
    expect(privatePrompt.purpose.source).toBeNull();
    expect(privatePrompt.purpose.cardId).toBeNull();
    const paid = applied(adapter.reduce(opened.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].back[0]!] }));
    expect(sourceNotices(paid.published)).toEqual([]);
    expect(paid.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
    expect(paid.slice.committed.instances[ids[side].back[0]!].zone).toBe("void");
    const settled = finish(paid.slice.committed);
    expect(settled.instances[source].zone).toBe("hand");
    expect(reduced(settled, side, source)).toBe(3);
    expect(reduced(settled, side, decoy)).toBe(4);
    expect(engine.view(settled, other(side)).instances[source]).toBeDefined();
    expect(engine.view(settled, other(side)).instances[decoy]).toBeUndefined();
    const saved = JSON.parse(JSON.stringify(settled)) as BattleState;
    expect(reduced(saved, side, source)).toBe(3);
  });

  it("keeps a source reveal private before a later cancellable abandon choice", () => {
    const b = board(side, revealBeforeAbandon);
    const source = b.ids[side].hand[0];
    const adapter = fold();
    const opened = applied(adapter.reduce(sliceOf(b.state), { kind: "battleAction", side, action: action(source) }));
    const pending = adapter.pending(opened.slice)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    expect(pending.prompt.purpose.role).toBe("abandonCost");
    expect(pending.prompt.cancellable).toBe(true);
    expect(engine.view(pending.display, other(side)).instances[source]).toBeUndefined();
    expect(promptView(pending.prompt, other(side), pending.display).purpose.source).toBeNull();
    expect(sourceNotices(opened.published)).toEqual([]);
    expect(opened.published.some(e => e.kind === "revealed" || e.kind === "abandoned")).toBe(false);
    const cancelled = applied(adapter.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.published.some(e => e.kind === "revealed" || e.kind === "abandoned")).toBe(false);
    expect(engine.view(cancelled.slice.committed, other(side)).instances[source]).toBeUndefined();
    expect(cancelled.slice.committed.sides[side].hand).toEqual(b.ids[side].hand);
    expect(cancelled.slice.committed.instances[b.ids[side].back[0]!].zone).toBe("play");
  });

  it("pays a known source again on a separate activation, without choosing an arbitrary hand card", () => {
    const { state, ids } = board(side, exact);
    const source = ids[side].hand[0];
    const adapter = fold();
    const withoutAuto = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
    const first = applied(adapter.reduce(sliceOf(withoutAuto), { kind: "battleAction", side, action: action(source) }));
    expect(sourceNotices(first.published)).toEqual([]);
    expect(first.slice.inFlight).toBeNull();
    expect(first.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
    const after = finish(first.slice.committed);
    const second = applied(adapter.reduce(sliceOf(after), { kind: "battleAction", side, action: action(source) }));
    expect(sourceNotices(second.published)).toEqual([]);
    expect(second.slice.inFlight).toBeNull();
    expect(second.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
    expect(reduced(finish(second.slice.committed), side, source)).toBe(2);
  });

  it("cancels and refuses malformed, foreign and stale answers atomically, including a reloaded pending slice", () => {
    const { state, ids } = board(side);
    const source = ids[side].hand[0];
    const adapter = fold();
    const opened = applied(adapter.reduce(sliceOf(state), { kind: "battleAction", side, action: action(source) }));
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const reloaded = fold();
    const pending = reloaded.pending(saved)!;
    const snapshot = stateHash(saved.committed);
    const wrong: BattleIntent[] = [
      { kind: "answer", side, promptId: pending.prompt.id, value: [source] },
      { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].back[0]!, ids[side].back[0]!] },
      { kind: "answer", side: other(side), promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) },
    ];
    for (const intent of wrong) {
      expect(reloaded.reduce(saved, intent).kind).toBe("bounced");
      expect(stateHash(saved.committed)).toBe(snapshot);
    }
    const duplicate = reloaded.reduce(saved, { kind: "battleAction", side, action: action(source) });
    expect(duplicate).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(reloaded.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(cancelled.published.some(e => e.kind === "revealed" || e.kind === "abandoned" || e.kind === "energyChanged")).toBe(false);
    expect(cancelled.slice.committed.sides[side].hand).toEqual(ids[side].hand);
    expect(engine.view(cancelled.slice.committed, other(side)).instances[source]).toBeUndefined();
    expect(reloaded.reduce(cancelled.slice, { kind: "answer", side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const reopen = applied(reloaded.reduce(cancelled.slice, { kind: "battleAction", side, action: action(source) }));
    expect(reloaded.reduce(reopen.slice, { kind: "answer", side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) })).toEqual({ kind: "bounced", reason: "stalePrompt" });
  });

  it("reserves the source distinctly and applies whole-hand payment order through flat and nested lists", () => {
    for (const sourceCard of [twice, discardThen, nestedThen, afterChoice]) {
      const { state, ids } = board(side, sourceCard);
      expect(legal(state, side, ids[side].hand[0])).toBe(false);
    }
    const { state, ids } = board(side, revealThen);
    const source = ids[side].hand[0];
    const out = applied(fold().reduce(sliceOf(state), { kind: "battleAction", side, action: action(source) }));
    expect(out.slice.committed.sides[side].hand).toEqual([source]);
    expect(out.slice.committed.sides[side].void).toContain(ids[side].hand[1]);
    expect(out.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
    const only = board(side, genericTwice, [genericTwice.id]);
    expect(legal(only.state, side, only.ids[side].hand[0])).toBe(false);
    const reserved = board(side, playReserved);
    const funded: BattleState = { ...reserved.state, sides: { ...reserved.state.sides, [side]: { ...reserved.state.sides[side], currentEnergy: 4 } } };
    expect(engine.legalActions(funded, side).some(a => a.kind === "play" && a.card === reserved.ids[side].hand[0])).toBe(false);
  });

  it("declines an optional whole-hand discard without blocking its later exact reveal", () => {
    const { state, ids } = board(side, optionalThen);
    const out = applied(fold().reduce(sliceOf(state), { kind: "battleAction", side, action: action(ids[side].hand[0]) }));
    expect(out.slice.inFlight).toBeNull();
    expect(out.slice.committed.sides[side].hand).toEqual(ids[side].hand);
    expect(out.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [ids[side].hand[0]] }]);
  });

  it("refuses hand abilities without one mandatory exact source reveal before any publication", () => {
    for (const definition of [unrevealed, afterOptional]) {
      const { state, ids } = board(side, definition);
      const source = ids[side].hand[0];
      const before = stateHash(state);
      expect(canActivate(state, engine.catalog, side, source, 0)).toBe(false);
      expect(legal(state, side, source)).toBe(false);
      expect(fold().reduce(sliceOf(state), { kind: "battleAction", side, action: action(source) }).kind).toBe("bounced");
      expect(stateHash(state)).toBe(before);
      expect(state.instances[source].zone).toBe("hand");
      expect(engine.view(state, other(side)).instances[source]).toBeUndefined();
    }
  });

  it("captures actual predeparture spark while the self effect concerns the hand source", () => {
    const { state, ids } = board(side, captured, [captured.id], [support.id, SYNTHETIC.vanilla1.id]);
    const adapter = fold();
    const out = applied(adapter.reduce(sliceOf(state), { kind: "battleAction", side, action: action(ids[side].hand[0]) }));
    const pending = adapter.pending(out.slice)!;
    const paid = applied(adapter.reduce(out.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].back[1]!] }));
    const after = finish(paid.slice.committed);
    expect(after.sides[side].score).toBe(3);
    expect(reduced(after, side, ids[side].hand[0])).toBe(3);
    expect(after.instances[ids[side].back[1]!].zone).toBe("void");
  });

  it("keeps the cost on the physical source through actual play, return and dissolve", () => {
    const b = board(side, exact, [exact.id, recall.id, dissolve.id], []);
    const source = b.ids[side].hand[0];
    const activated = applied(fold().reduce(sliceOf(b.state), { kind: "battleAction", side, action: action(source) }));
    const paid = finish(activated.slice.committed);
    const funded: BattleState = { ...paid, sides: { ...paid.sides, [side]: { ...paid.sides[side], currentEnergy: 3 } } };
    const played = engine.apply(funded, side, { kind: "play", card: source, from: "hand" }, NO_PROMPTS);
    const inPlay = finish(played.state);
    expect(inPlay.instances[source].zone).toBe("play");
    expect(inPlay.sides[side].currentEnergy).toBe(0);
    expect(reduced(inPlay, side, source)).toBe(3);
    const returned = finish(engine.apply(inPlay, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, NO_PROMPTS).state);
    expect(returned.instances[source].zone).toBe("hand");
    expect(reduced(returned, side, source)).toBe(3);
    const rich: BattleState = { ...returned, sides: { ...returned.sides, [side]: { ...returned.sides[side], currentEnergy: 3 } } };
    const again = finish(engine.apply(rich, side, { kind: "play", card: source, from: "hand" }, NO_PROMPTS).state);
    const gone = finish(engine.apply(again, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS).state);
    expect(gone.instances[source].zone).toBe("void");
    expect(reduced(gone, side, source)).toBe(3);
  });

  it("retains committed reveal payment through an Interrupt that discards the hand source", () => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [exact.id], deck }, [other(side)]: { hand: [interruption.id, prevention.id], deck } });
    const source = b.ids[side].hand[0];
    const activated = engine.apply(b.state, side, action(source), NO_PROMPTS);
    expect(activated.events.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
    // Prevent targets played cards, so an activated stack item is not a preventable card.
    expect(engine.legalActions(activated.state, other(side)).some(a => a.kind === "play" && a.card === b.ids[other(side)].hand[1])).toBe(false);
    const interrupted = engine.apply(activated.state, other(side), { kind: "play", card: b.ids[other(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const gone = finish(interrupted.state);
    expect(gone.instances[source].zone).toBe("void");
    expect(reduced(gone, side, source)).toBe(3);
    expect(engine.view(gone, other(side)).instances[source]).toBeDefined();
  });

  it("rolls back an actual failing Interrupt resolver while retaining the earlier committed source payment", () => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [exact.id], deck }, [other(side)]: { hand: [failingInterrupt.id], deck } });
    const adapter = fold();
    const source = b.ids[side].hand[0];
    const activated = applied(adapter.reduce(sliceOf(b.state), { kind: "battleAction", side, action: action(source) }));
    const before = stateHash(activated.slice.committed);
    const failed = adapter.reduce(activated.slice, { kind: "battleAction", side: other(side), action: { kind: "play", card: b.ids[other(side)].hand[0], from: "hand" } });
    if (failed.kind !== "applied") throw new Error(`bounced ${failed.reason}`);
    expect(failed.error?.message).toContain("synthetic failure after source discard");
    expect(failed.slice.committed.instances[source].zone).toBe("hand");
    expect(failed.slice.committed.sides[side].hand).toContain(source);
    expect(engine.view(failed.slice.committed, other(side)).instances[source]).toBeDefined();
    expect(reduced(failed.slice.committed, side, source)).toBe(4);
    expect(failed.published.some(e => e.kind === "discarded" || e.kind === "enteredVoid")).toBe(false);
    expect(stateHash(activated.slice.committed)).toBe(before);
    expect(activated.published.filter(e => e.kind === "revealed")).toHaveLength(1);
  });

  it("rejects malformed manual source-payment plans before spending or revealing", () => {
    const b = board(side, exact);
    const state: BattleState = { ...b.state, sides: { ...b.state.sides, [side]: { ...b.state.sides[side], currentEnergy: 2 } } };
    const source = b.ids[side].hand[0];
    // This is the defensive cost-plan API, not a payload reachable through valid public battle intents.
    for (const cards of [[], [b.ids[side].hand[1]], [source, source]]) {
      const plan: CostPlan = { x: null, energy: { fixed: 1, x: 0 }, payments: [{ cost: { cost: "revealSource", count: 1 }, cards }], optionalPaid: [] };
      const before = stateHash(state);
      expect(() => payCosts(new Context(state, engine.catalog, NO_PROMPTS), side, source, plan)).toThrow();
      expect(stateHash(state)).toBe(before);
      expect(engine.view(state, other(side)).instances[source]).toBeUndefined();
    }
  });

  it("reconstructs the committed and answered activation by replaying its public intents", () => {
    const b = board(side);
    const adapter = fold();
    const initial = sliceOf(b.state);
    const start: BattleIntent = { kind: "battleAction", side, action: action(b.ids[side].hand[0]) };
    const opened = applied(adapter.reduce(initial, start));
    const pending = adapter.pending(opened.slice)!;
    const answer: BattleIntent = { kind: "answer", side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) };
    const paid = applied(adapter.reduce(opened.slice, answer));
    const fresh = fold();
    let replay = JSON.parse(JSON.stringify(initial)) as BattleSlice;
    for (const intent of [start, answer]) replay = applied(fresh.reduce(replay, intent)).slice;
    expect(stateHash(replay.committed)).toBe(stateHash(paid.slice.committed));
    expect(replay.inFlight).toEqual(paid.slice.inFlight);
    expect(engine.view(replay.committed, other(side))).toEqual(engine.view(paid.slice.committed, other(side)));
  });

  it("restarts both printed orders and refuses the captured reveal-first continuation without changing private state", () => {
    for (const [index, definition] of restart.entries()) {
      const b = board(side, definition);
      const source = b.ids[side].hand[0];
      const adapter = fold();
      const start: BattleIntent = { kind: "battleAction", side, action: action(source) };
      const opened = applied(adapter.reduce(sliceOf(b.state), start));
      const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
      const fresh = fold();
      const pending = fresh.pending(saved)!;
      expect(pending.prompt.purpose.role).toBe("abandonCost");
      expect(pending.prompt.id).toBe("0:1:0");
      expect(saved.inFlight?.answers).toEqual([]);
      expect(sourceNotices(opened.published)).toEqual([]);
      expect(engine.view(pending.display, other(side)).instances[source]).toBeUndefined();
      const answer: BattleIntent = { kind: "answer", side, promptId: pending.prompt.id, value: [b.ids[side].back[0]!] };
      const paid = applied(fresh.reduce(saved, answer));
      expect(paid.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [source] }]);
      expect(sourceNotices(paid.published)).toEqual([]);
      const replay = fold();
      const replayed = applied(replay.reduce(applied(replay.reduce(sliceOf(b.state), start)).slice, answer));
      expect(stateHash(replayed.slice.committed)).toBe(stateHash(paid.slice.committed));
      expect(fresh.reduce(saved, start)).toEqual({ kind: "bounced", reason: "stepInFlight" });
      if (index === 0) {
        // Actual baseline abandon-first saved envelope: no reveal answer precedes this pending choice.
        const old = { committed: b.state, ...JSON.parse(side === "player"
          ? '{"inFlight":{"step":{"kind":"activate","source":"i3","ability":0},"automatic":false,"answers":[]},"publishedEvents":0,"attempt":1}'
          : '{"inFlight":{"step":{"kind":"activate","source":"i11","ability":0},"automatic":false,"answers":[]},"publishedEvents":0,"attempt":1}') } as BattleSlice;
        expect(fold().pending(old)?.prompt).toEqual(pending.prompt);
        expect(stateHash(applied(fold().reduce(old, answer)).slice.committed)).toBe(stateHash(paid.slice.committed));
      } else {
        // Actual pre-repair public probe prefix; this custom reveal-first catalog has a different saved prompt protocol.
        const old = { committed: b.state, ...JSON.parse(side === "player"
          ? '{"inFlight":{"step":{"kind":"activate","source":"i3","ability":0},"automatic":false,"answers":[{"fingerprint":"1a6ci4xzodw","value":["i3"],"auto":true}]},"publishedEvents":1,"attempt":1}'
          : '{"inFlight":{"step":{"kind":"activate","source":"i11","ability":0},"automatic":false,"answers":[{"fingerprint":"5brpe2hus4","value":["i11"],"auto":true}]},"publishedEvents":1,"attempt":1}') } as BattleSlice;
        const before = stateHash(old.committed);
        const stale: BattleIntent = { ...answer, promptId: parsePromptId("0:1:1") };
        expect(fresh.reduce(saved, stale)).toEqual({ kind: "bounced", reason: "stalePrompt" });
        expect(fold().pending(old)).toBeNull();
        const refused = fold().reduce(old, stale);
        if (refused.kind !== "applied") throw new Error(`bounced ${refused.reason}`);
        expect(refused.error?.kind).toBe("engine_error");
        expect(refused.slice.inFlight).toBeNull();
        expect(refused.published).toEqual([]);
        expect(stateHash(refused.slice.committed)).toBe(before);
        expect(stateHash(old.committed)).toBe(before);
        expect(engine.view(refused.slice.committed, other(side)).instances[source]).toBeUndefined();
      }
    }
  });

  it("keeps default in-play, explicit void activation and generic reveal as their separate public actions", () => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [SYNTHETIC.event0.id, SYNTHETIC.event0.id], back: [ordinary.id, generic.id], void: [voidSource.id], deck }, [other(side)]: { deck } });
    expect(canActivate(b.state, engine.catalog, side, b.ids[side].back[0]!, 0)).toBe(true);
    expect(canActivate(b.state, engine.catalog, side, b.ids[side].void[0], 0)).toBe(true);
    const out = applied(fold().reduce(sliceOf(b.state), { kind: "battleAction", side, action: action(b.ids[side].back[1]!) }));
    const adapter = fold();
    const pending = adapter.pending(out.slice)!;
    expect(pending.prompt.kind).toBe("chooseCards");
    const paid = applied(adapter.reduce(out.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [b.ids[side].hand[0]] }));
    expect(paid.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side, instances: [b.ids[side].hand[0]] }]);
    const singleton = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [SYNTHETIC.event0.id], back: [generic.id], deck }, [other(side)]: { deck } });
    const automatic = applied(fold().reduce(sliceOf(singleton.state), { kind: "battleAction", side, action: action(singleton.ids[side].back[0]!) }));
    expect(sourceNotices(automatic.published)).toHaveLength(1);
  });
});

for (const holder of ["player", "enemy"] as const) it(`pays a foreign-owned source for its actual ${holder} holder`, () => {
  const owner = other(holder);
  const b = boardState(engine.catalog, { active: holder, phase: "day", [owner]: { hand: [exact.id], deck }, [holder]: { deck } });
  const id = b.ids[owner].hand[0];
  // Synthetic ownership fixture uses the real relocation rule; activation and payment use the public fold.
  moveToHand(new Context(b.state, engine.catalog, NO_PROMPTS), id, holder);
  expect(b.state.instances[id].owner).toBe(owner);
  expect(abilitySources(b.state, engine.catalog, holder)).toContain(id);
  expect(canActivate(b.state, engine.catalog, holder, id, 0)).toBe(true);
  expect(canActivate(b.state, engine.catalog, owner, id, 0)).toBe(false);
  const out = applied(fold().reduce(sliceOf(b.state), { kind: "battleAction", side: holder, action: action(id) }));
  expect(sourceNotices(out.published)).toEqual([]);
  expect(out.published.filter(e => e.kind === "revealed")).toEqual([{ kind: "revealed", side: holder, instances: [id] }]);
  expect(reduced(finish(out.slice.committed), holder, id)).toBe(3);
  const missing: BattleState = { ...b.state, sides: { ...b.state.sides, [holder]: { ...b.state.sides[holder], hand: [] } } };
  expect(canActivate(missing, engine.catalog, holder, id, 0)).toBe(false);
  expect(abilitySources(missing, engine.catalog, holder)).not.toContain(id);
});
