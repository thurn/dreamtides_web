import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { createFoldAdapter, sidePending, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import type { Answer } from "../../../prompts/types";
import { addFloating } from "../../../rules/floating";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import { Context } from "../../../steps/context";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS } from "../../../steps/sources";
import { promptView } from "../../../view/view";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { costOptionLabel } from "../../../../runtime/battle-cost-messages";
import { cards, definitions, E, init, Payments, play, step, v, world } from "./offering-discard-support";

function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(result)}`);
  return result.slice;
}
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function opened(side: Side, costly = false) {
  const w = world(side, costly ? { hand: [definitions.costly.id, v.event0.id, v.event0.id, v.event0.id], score: 5 } : {});
  const logs: EngineLogRecord[] = [];
  const fold = createFoldAdapter(E, { checkEventPrefix: true, log: row => logs.push(row) });
  const action = { kind: "play", card: w.ids[side].hand[0], from: "hand" } as const;
  const start = sliceOf(w.state);
  const route = applied(fold.reduce(start, { kind: "battleAction", side, action }));
  const answer = (slice: BattleSlice, value: Answer) => applied(fold.reduce(slice, { kind: "answer", side, promptId: fold.pending(slice)!.prompt.id, value }));
  return { w, fold, action, start, route, answer, logs };
}

describe("offeringDiscardPayment recovery", () => {
  it.each(SIDES)("replays %s choice and physical-payment prompts cold, without partial payments", side => {
    for (const mode of [0, 1]) {
      const f = opened(side);
      const choice = f.answer(f.route, 1);
      expect(f.fold.pending(choice)?.prompt).toMatchObject({ kind: "chooseMode", purpose: { role: "chooseCost" } });
      const payer = f.answer(choice, mode);
      expect(f.fold.pending(payer)?.prompt).toMatchObject({ kind: "chooseCards", purpose: { role: mode === 0 ? "offeringCost" : "discardCost" } });
      const before = stateHash(f.w.state);
      for (const slice of [choice, payer]) {
        expect(stateHash(slice.committed)).toBe(before);
        expect(slice.committed.instances[f.action.card].status.offering).toBe(false);
        const saved = parseEngineBattleFold(JSON.parse(JSON.stringify({ init, slice })))!;
        expect(saved).not.toBeNull();
        const cold = createFoldAdapter(createEngine(E.catalog), { checkEventPrefix: true });
        expect(cold.pending(saved.slice)).toEqual(f.fold.pending(slice));
        expect(stateHash(cloneState(saved.slice.committed))).toBe(before);
        expect(sidePending(E, slice, f.fold.pending(slice), opponent(side)).kind).toBe("waiting");
      }
      const save = parseEngineBattleFold(JSON.parse(JSON.stringify({ init, slice: payer })))!;
      const cold = createFoldAdapter(createEngine(E.catalog), { checkEventPrefix: true });
      const pending = cold.pending(save.slice)!;
      const result = applied(cold.reduce(save.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [f.w.ids[side].hand[1]] }));
      const reference = f.answer(payer, [f.w.ids[side].hand[1]]);
      expect(result).toEqual(reference);
      expect(result.committed.instances[f.action.card].status.offering).toBe(true);
      expect(result.committed.instances[f.w.ids[side].hand[1]].zone).toBe(mode === 0 ? "banished" : "void");
      expect(result.committed.sides[side].currentEnergy).toBe(9);
    }
  });

  it.each(SIDES)("rejects %s self-payment, wrong side, stale, cancelled and competing answers", side => {
    const f = opened(side);
    const choice = f.answer(f.route, 1);
    const choices = f.fold.pending(choice)!.prompt;
    expect(choices.kind).toBe("chooseMode");
    const payer = f.answer(choice, 1);
    const pending = f.fold.pending(payer)!.prompt;
    if (pending.kind !== "chooseCards") throw new Error("Missing ordinary card choice");
    expect(pending.candidates).toEqual(f.w.ids[side].hand.slice(1));
    const answer = { kind: "answer", side, promptId: pending.id, value: [f.w.ids[side].hand[1]] } as const;
    const before = stateHash(payer.committed);
    expect(f.fold.reduce(payer, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(f.fold.reduce(payer, { ...answer, value: [f.action.card] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(f.fold.reduce(payer, { ...answer, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(f.fold.reduce(payer, { ...answer, promptId: choices.id })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(stateHash(payer.committed)).toBe(before);
    for (const slice of [choice, payer]) {
      const prompt = f.fold.pending(slice)!.prompt;
      const cancelled = applied(f.fold.reduce(slice, { kind: "cancel", side, promptId: prompt.id }));
      expect(stateHash(cancelled.committed)).toBe(before);
      expect(cancelled.inFlight).toBeNull();
      const restart = applied(f.fold.reduce(cancelled, { kind: "battleAction", side, action: f.action }));
      expect(f.fold.reduce(restart, { kind: "answer", side, promptId: prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    }
    const won = f.answer(payer, answer.value);
    const loser = { ...answer, value: [f.w.ids[side].hand[2]] };
    expect(f.fold.reduce(won, loser)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(won.committed.instances[f.w.ids[side].hand[2]].zone).toBe("hand");
    const recovery = f.answer(f.answer(f.route, 1), 0);
    expect(f.answer(recovery, [f.w.ids[side].hand[2]]).committed.instances[f.w.ids[side].hand[2]].zone).toBe("banished");
  });

  it.each(SIDES)("rejects %s already-reserved additional payer while a valid distinct payment succeeds", side => {
    const f = opened(side, true);
    const first = f.answer(f.answer(f.route, 1), 1);
    const later = f.answer(first, [f.w.ids[side].hand[1]]);
    const p = f.fold.pending(later)!.prompt;
    if (p.kind !== "chooseCards") throw new Error("Missing additional discard");
    expect(p.candidates).toEqual(f.w.ids[side].hand.slice(2));
    expect(f.fold.reduce(later, { kind: "answer", side, promptId: p.id, value: [f.w.ids[side].hand[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const optional = f.answer(later, [f.w.ids[side].hand[2]]);
    expect(stateHash(optional.committed)).toBe(stateHash(f.w.state));
    const completed = f.answer(optional, false);
    expect(completed.committed.sides[side].currentEnergy).toBe(8);
    expect(completed.committed.instances[f.w.ids[side].hand[1]].zone).toBe("void");
    expect(completed.committed.instances[f.w.ids[side].hand[2]].zone).toBe("void");
  });

  it.each(SIDES)("reserves the %s physical void target separately from Offering and additional payments", side => {
    const w = world(side, { hand: [definitions.targeted.id, v.event0.id, v.event0.id], void: [v.event0.id, v.event0.id] });
    const fold = createFoldAdapter(E);
    const action = { kind: "play", card: w.ids[side].hand[0], from: "hand" } as const;
    const answer = (slice: BattleSlice, value: Answer) => applied(fold.reduce(slice, { kind: "answer", side, promptId: fold.pending(slice)!.prompt.id, value }));
    const route = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action }));
    const target = answer(route, 1);
    expect(fold.pending(target)!.prompt.purpose.role).toBe("target");
    const choice = answer(target, [w.ids[side].void[0]]);
    const payHand = answer(choice, 1);
    const payVoid = answer(payHand, [w.ids[side].hand[1]]);
    const p = fold.pending(payVoid)!.prompt;
    expect(p).toMatchObject({ kind: "chooseCards", candidates: [w.ids[side].void[1]] });
    expect(fold.reduce(payVoid, { kind: "answer", side, promptId: p.id, value: [w.ids[side].void[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const completed = answer(payVoid, [w.ids[side].void[1]]);
    expect(completed.committed.instances[w.ids[side].void[0]].zone).toBe("hand");
    expect(completed.committed.instances[w.ids[side].void[1]].zone).toBe("banished");
    expect(completed.committed.instances[w.ids[side].hand[1]].zone).toBe("void");
  });

  it.each(SIDES)("keeps %s hidden-hand identities private and records reconstructible choices and UUIDs", side => {
    const f = opened(side);
    const choice = f.answer(f.route, 1);
    const p = f.fold.pending(choice)!;
    if (p.prompt.kind !== "chooseMode" || p.prompt.costOptions === undefined) throw new Error("Missing transported cost descriptors");
    const labels = p.prompt.costOptions.map(costOptionLabel);
    expect(new Set(labels).size).toBe(2);
    const payer = f.answer(choice, 1);
    const paying = f.fold.pending(payer)!;
    const other = opponent(side);
    expect(E.view(payer.committed, other).instances[f.w.ids[side].hand[1]]).toBeUndefined();
    const projected = promptView(paying.prompt, other, paying.display);
    expect(projected).toMatchObject({ kind: "chooseCards", candidates: [] });
    const completed = f.answer(payer, [f.w.ids[side].hand[1]]);
    expect(f.logs).toContainEqual(expect.objectContaining({ event: "engine.promptOpened", role: "chooseCost", cardId: cards.offered.id }));
    expect(f.logs).toContainEqual(expect.objectContaining({ event: "engine.promptAnswered", value: [f.w.ids[side].hand[1]] }));
    const actionLog = f.logs.find(row => row.event === "engine.action");
    expect(actionLog?.action).toEqual(f.action);
    expect(actionLog?.answers.some(answer => answer.value === 1)).toBe(true);
    expect(actionLog?.answers.some(answer => Array.isArray(answer.value) && answer.value.includes(f.w.ids[side].hand[1]))).toBe(true);
    expect(completed.committed.instances[f.w.ids[side].hand[1]].printing).toEqual(f.w.state.instances[f.w.ids[side].hand[1]].printing);
  });

  it.each(SIDES)("rolls %s interrupted planning back and preserves old saves without this permission", side => {
    const w = world(side);
    const hash = stateHash(w.state);
    expect(() => runStep(w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, {
      answer(prompt) { if (prompt.purpose.role === "chooseCost") throw new Error("synthetic interruption"); return 1; },
    }, E.catalog)).toThrow("synthetic interruption");
    expect(stateHash(w.state)).toBe(hash);
    expect(runStep(w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" }, INTERACTIVE, E.catalog).kind).toBe("suspended");
    expect(play(w.state, w.ids[side].hand[0]).state.instances[w.ids[side].hand[1]].zone).toBe("void");
    const legacy = world(side, { back: [] });
    expect(parseEngineBattleFold(JSON.parse(JSON.stringify({ init, slice: sliceOf(legacy.state) })))).not.toBeNull();
    expect(play(legacy.state, legacy.ids[side].hand[0]).state.instances[legacy.ids[side].hand[1]].zone).toBe("banished");
    const invalid = world(side, { hand: [definitions.invalid.id] });
    const pending = play(invalid.state, invalid.ids[side].hand[0], new Payments(0)).state;
    const before = stateHash(pending);
    expect(() => step(pending, { kind: "resolveTop" })).toThrow();
    expect(stateHash(pending)).toBe(before);
    const malformed = { init, slice: sliceOf(cloneState(w.state)) };
    addFloating(new Context(malformed.slice.committed, E.catalog, NO_PROMPTS), { source: w.ids[side].back[0]!, controller: side, expiry: { at: "never" }, change: { kind: "spark", instance: w.ids[side].back[0]!, amount: 1 } });
    malformed.slice.committed.floating[0] = { ...malformed.slice.committed.floating[0], change: { kind: "offeringDiscardPaymentOption", player: side } };
    expect(parseEngineBattleFold(malformed)).toBeNull();
    const fold = createFoldAdapter(E);
    expect(fold.reduce(sliceOf(legacy.state), { kind: "battleAction", side, action: { kind: "play", card: legacy.ids[side].hand[0], from: "void" } })).toEqual({ kind: "bounced", reason: "illegalAction" });
  });
});
