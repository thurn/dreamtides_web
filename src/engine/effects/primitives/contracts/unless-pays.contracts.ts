import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, costPaid, energy, energyX, event, optionalCost, target, x } from "../../../dsl/builders";
import { triggered, whenOpponentScores } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { opponent, type CardId, type Side } from "../../../state/ids";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseAvatarId } from "../../../../types/identifiers";
import { resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { discard } from "../discard";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { reveal } from "../reveal";
import { sequence } from "../sequence";
import { unlessPays } from "../unless-pays";

const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
const card = (n: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0xa9d00 + n), costs: [], status: "authored", abilities: () => [event(effect)],
});
const toll = card(0, unlessPays(1, draw(1)));
const deferred = card(1, unlessPays(1, chooseOne(gainSpark(target({ controller: "you" }), 2), draw(1))));
const unavailableTarget = card(2, unlessPays(1, gainSpark(target({ controller: "you" }), 2)));
const sharedTarget = target({ controller: "you" });
const sharedMode = chooseOne(gainSpark(sharedTarget, 1), draw(1));
const inherited: EngineCardDefinition = {
  ...card(3, sequence(sharedMode, unlessPays(1, sequence(sharedMode, ifThen(costPaid(), gainPoints(x()), gainPoints(9)))))),
  costs: [energyX(0)],
  abilities: () => [additionalCost(optionalCost(energy(1))), event(sequence(sharedMode, unlessPays(1, sequence(sharedMode, ifThen(costPaid(), gainPoints(x()), gainPoints(9))))))],
};
const free = card(4, unlessPays(0, draw(1)));
const flat = card(5, gainPoints(3));
const fatigue = card(6, draw(1, "opponent"));
const malformed = card(7, { ...unlessPays(1, draw(1)), energy: -1 });
const unsafeAmount = card(9, { ...unlessPays(1, draw(1)), energy: Number.MAX_SAFE_INTEGER + 1 });
const avatarId = parseAvatarId("5e5e5e5e-0000-4000-8000-0000000a9d10");
const failing: EngineCardDefinition = {
  ...card(8, sequence()), synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, unlessPays(1, sequence(draw(1), reveal(), reveal("opponent"), discard(1, "opponent"), draw(1))), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic unpaid branch failure");
    },
  },
};
const engine = createEngine(testCatalog([toll, deferred, unavailableTarget, inherited, free, flat, fatigue, malformed, unsafeAmount, failing], {
  avatars: [{ id: avatarId, status: "authored", abilities: () => [triggered(whenOpponentScores(), unlessPays(1, draw(1)), { oncePerTurn: true })] }],
}));
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const reload = (slice: BattleSlice): BattleSlice => JSON.parse(JSON.stringify(slice)) as BattleSlice;
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected intent outcome: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function setup(side: Side, subject: CardId = toll.id, payerEnergy = 3): BoardSetup {
  return { active: side, phase: "day", [side]: { hand: [subject], back: [v.vanilla1.id, v.vanilla2.id], energy: 6, deck },
    [opponent(side)]: { hand: [v.vanilla1.id, v.vanilla2.id], energy: payerEnergy, deck } };
}
function opened(side: Side, subject: CardId = toll.id, payerEnergy = 3, records: EngineLogRecord[] = [], board = setup(side, subject, payerEnergy)) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true, log: record => records.push(record) });
  const { state, ids } = boardState(engine.catalog, board);
  const start = sliceOf(state);
  const slice = applied(fold.reduce(start, { kind: "battleAction", side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }));
  return { fold, slice, start, ids };
}
function answer(fold: ReturnType<typeof createFoldAdapter>, slice: BattleSlice, value: Answer): IntentOutcome {
  const prompt = fold.pending(slice)?.prompt;
  if (prompt === undefined) throw new Error("Missing pending prompt");
  return fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value });
}

describe("unlessPays opposing resolving payment", () => {
  it.each(["player", "enemy"] as const)("%s preserves its ability provenance and beneficiary on pay, decline and unaffordable payment", side => {
    const payer = opponent(side);
    for (const payment of ["pay", "decline", "unaffordable"] as const) {
      const records: EngineLogRecord[] = [];
      const { fold, slice, ids } = opened(side, toll.id, payment === "unaffordable" ? 0 : 3, records);
      const pending = fold.pending(slice);
      if (payment !== "unaffordable") expect(pending?.prompt).toMatchObject({ kind: "payOrDecline", side: payer, energy: 1, payable: true, cancellable: false,
        purpose: { role: "opponentUnlessPays", source: ids[side].hand[0], cardId: toll.id, ability: 0 } });
      const outcome = payment === "unaffordable" ? null : answer(fold, slice, payment === "pay");
      const done = outcome === null ? slice : applied(outcome);
      expect(fold.pending(done)).toBeNull();
      expect(done.committed.sides[side].currentEnergy).toBe(6);
      expect(done.committed.sides[payer].currentEnergy).toBe(payment === "pay" ? 2 : payment === "unaffordable" ? 0 : 3);
      expect(done.committed.sides[side].hand).toHaveLength(payment === "pay" ? 0 : 1);
      expect(done.committed.sides[side].deck).toHaveLength(payment === "pay" ? 12 : 11);
      expect(done.committed.sides[payer].hand).toEqual(ids[payer].hand);
      expect(done.committed.sides[payer].deck).toEqual(ids[payer].deck);
      if (outcome?.kind === "applied") {
        const payments = outcome.published.filter(e => e.kind === "energyChanged" && e.cause === "payment");
        expect(payments).toEqual(payment === "pay" ? [expect.objectContaining({ side: payer, change: -1, current: 2 })] : []);
        expect(unannouncedChanges(outcome.published, pending!.display, done.committed)).toEqual([]);
      }
      expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
      expect(records.filter(r => r.event === "engine.promptAnswered")).toEqual(payment === "unaffordable" ? [] : [expect.objectContaining({ side: payer, value: payment === "pay" })]);
      if (payment !== "unaffordable") expect(records.filter(r => r.event === "engine.promptOpened")).toContainEqual(expect.objectContaining({ side: payer, role: "opponentUnlessPays", source: ids[side].hand[0], cardId: toll.id }));
    }
  });

  it.each(["player", "enemy"] as const)("%s offers zero energy as a real pay or decline choice", side => {
    for (const accepted of [true, false]) {
      const { fold, slice } = opened(side, free.id, 0);
      expect(fold.pending(slice)?.prompt).toMatchObject({ kind: "payOrDecline", side: opponent(side), energy: 0, payable: true });
      const outcome = answer(fold, slice, accepted);
      const done = applied(outcome);
      expect(done.committed.sides[opponent(side)].currentEnergy).toBe(0);
      expect(done.committed.sides[side].hand).toHaveLength(accepted ? 0 : 1);
      if (outcome.kind !== "applied") throw new Error("Missing outcome");
      expect(outcome.published.some(e => e.kind === "energyChanged")).toBe(false);
    }
  });

  it.each(["player", "enemy"] as const)("%s defers unpaid modes and targets and keeps choices with the original controller", side => {
    const { fold, slice, ids } = opened(side, deferred.id);
    expect(fold.pending(slice)?.prompt.purpose.role).toBe("opponentUnlessPays");
    expect(fold.pending(applied(answer(fold, slice, true)))).toBeNull();
    const declined = applied(answer(fold, slice, false));
    expect(fold.pending(declined)?.prompt).toMatchObject({ kind: "chooseMode", side, purpose: { role: "chooseOne", source: ids[side].hand[0], cardId: deferred.id } });
    const selected = applied(answer(fold, declined, 0));
    const prompt = fold.pending(selected)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets", side, purpose: { role: "target", source: ids[side].hand[0], cardId: deferred.id } });
    if (prompt.kind !== "chooseTargets") throw new Error("Expected deferred targets");
    expect(prompt.candidates).toEqual(ids[side].back);
    const done = applied(answer(fold, selected, [ids[side].back[1]!]));
    expect(effectiveSpark(done.committed, engine.catalog, ids[side].back[1]!)).toBe(4);
    expect(done.committed.sides[opponent(side)].currentEnergy).toBe(3);
  });

  it.each(["player", "enemy"] as const)("%s may pay before an unpaid branch with no legal target is prepared", side => {
    const { fold, slice } = opened(side, unavailableTarget.id, 3, [], { ...setup(side, unavailableTarget.id), [side]: { hand: [unavailableTarget.id], energy: 6, deck } });
    const paid = answer(fold, slice, true);
    expect(applied(paid).committed.sides[opponent(side)].currentEnergy).toBe(2);
    const declined = answer(fold, slice, false);
    expect(fold.pending(applied(declined))).toBeNull();
    if (declined.kind !== "applied") throw new Error("Missing outcome");
    expect(declined.published.some(e => e.kind === "noLegalTarget")).toBe(true);
  });

  it.each(["player", "enemy"] as const)("%s retains enclosing shared choices, X and optional payment bindings", side => {
    for (const outerPaid of [true, false]) {
      const { fold, slice, ids } = opened(side, inherited.id);
      let done = slice;
      for (const value of [2, 0, [ids[side].back[0]!], outerPaid, false] as Answer[]) done = applied(answer(fold, done, value));
      expect(fold.pending(done)).toBeNull();
      expect(effectiveSpark(done.committed, engine.catalog, ids[side].back[0]!)).toBe(3);
      expect(done.committed.sides[side].score).toBe(outerPaid ? 2 : 9);
      expect(done.committed.sides[side].currentEnergy).toBe(outerPaid ? 3 : 4);
      expect(done.committed.sides[opponent(side)].currentEnergy).toBe(3);
    }
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects malformed fixed energy %s", amount => {
    expect(() => unlessPays(amount, draw(1))).toThrow();
  });

  it.each([malformed, unsafeAmount])("contains a malformed node at resolution without a payment or unpaid effect: $id", subject => {
    const { state, ids } = boardState(engine.catalog, setup("player", subject.id));
    const before = JSON.stringify(state);
    const outcome = createFoldAdapter(engine).reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected contained malformed node");
    expect(outcome.error.kind).toBe("engine_error");
    expect(outcome.slice.committed.sides.enemy.currentEnergy).toBe(3);
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.inFlight).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(["player", "enemy"] as const)("%s reloads payment and unpaid choices, rejects conflicting actors and commits once", side => {
    const { fold, slice, ids } = opened(side, deferred.id);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    let normal = slice, resumed = reload(slice);
    const normalEvents: EngineEvent[] = [], resumedEvents: EngineEvent[] = [];
    for (const value of [false, 0, [ids[side].back[1]!]] as Answer[]) {
      const prompt = fold.pending(normal)!.prompt;
      expect(fresh.pending(resumed)?.prompt).toEqual(prompt);
      const before = JSON.stringify(resumed);
      for (let i = 0; i < 3; i++) expect(fresh.pending(resumed)?.prompt).toEqual(prompt);
      expect(JSON.stringify(resumed)).toBe(before);
      expect(fresh.reduce(resumed, { kind: "battleAction", side: prompt.side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      expect(fresh.reduce(resumed, { kind: "answer", side: opponent(prompt.side), promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fresh.reduce(resumed, { kind: "cancel", side: prompt.side, promptId: prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      expect(fresh.reduce({ ...resumed, attempt: resumed.attempt + 1 }, { kind: "answer", side: prompt.side, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const n = answer(fold, normal, value), r = answer(fresh, resumed, value);
      normal = applied(n); resumed = reload(applied(r));
      if (n.kind !== "applied" || r.kind !== "applied") throw new Error("Missing applied outcome");
      normalEvents.push(...n.published); resumedEvents.push(...r.published);
      expect(fresh.reduce(resumed, { kind: "answer", side: prompt.side, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: fresh.pending(resumed) === null ? "noPendingPrompt" : "stalePrompt" });
    }
    expect(resumed.committed).toEqual(normal.committed);
    expect(resumedEvents).toEqual(normalEvents);
    expect(resumedEvents.filter(e => e.kind === "energyChanged")).toEqual([]);
    const paid = applied(answer(createFoldAdapter(engine), reload(slice), true));
    expect(paid.committed.sides[opponent(side)].currentEnergy).toBe(2);
    expect(paid.committed.sides[side].hand).toHaveLength(0);
  });

  it("rejects malformed payment answers and altered recorded purposes or partial event prefixes without mutation", () => {
    const { fold, slice } = opened("player", deferred.id);
    const prompt = fold.pending(slice)!.prompt;
    for (const value of [0, "yes", [], null] as unknown as Answer[]) {
      const before = JSON.stringify(slice);
      expect(fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(JSON.stringify(slice)).toBe(before);
    }
    const declined = applied(answer(fold, slice, false));
    const original = reload(declined);
    if (original.inFlight === null) throw new Error("Missing recorded answer");
    for (const changed of [
      { ...prompt, purpose: { ...prompt.purpose, role: "optionalPayment" } },
      { ...prompt, purpose: { ...prompt.purpose, cardId: free.id } },
      { ...prompt, energy: 2 },
    ] as Prompt[]) {
      const bad = { ...original, inFlight: { ...original.inFlight, answers: original.inFlight.answers.map((a, i) => i === 0 ? { ...a, fingerprint: promptFingerprint(changed) } : a) } };
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(fresh.pending(bad)).toBeNull();
      const failed = fresh.reduce(bad, { kind: "answer", side: "player", promptId: fold.pending(declined)!.prompt.id, value: 0 });
      if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected replay recovery");
      expect(failed.error.kind).toBe("engine_error");
      expect(failed.slice.inFlight).toBeNull();
      expect(failed.slice.committed).toEqual(original.committed);
      expect(failed.published).toEqual([]);
    }
    const bad = { ...declined, publishedEvents: declined.publishedEvents + 100 };
    const failed = answer(createFoldAdapter(engine, { checkEventPrefix: true }), bad, 0);
    if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected partial-prefix recovery");
    expect(failed.error.kind).toBe("engine_error");
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed).toEqual(declined.committed);
    expect(failed.published).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("%s contains unpaid mid-step errors and retains only disclosed knowledge after reload", side => {
    const { fold, slice, ids } = opened(side, failing.id);
    const prefix = answer(fold, slice, false);
    const suspended = applied(prefix);
    if (prefix.kind !== "applied") throw new Error("Missing prefix");
    expect(prefix.published.filter(e => e.kind === "cardDrawn")).toHaveLength(1);
    expect(prefix.published.filter(e => e.kind === "energyChanged")).toHaveLength(0);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const saved = reload(suspended);
    expect(fresh.pending(saved)?.prompt).toEqual(fold.pending(suspended)?.prompt);
    const failed = answer(fresh, saved, [ids[opponent(side)].hand[0]]);
    if (failed.kind !== "applied" || failed.error === null) throw new Error("Expected child failure");
    expect(failed.error.kind).toBe("engine_error");
    expect(failed.published).toEqual([]);
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.sides).toEqual(saved.committed.sides);
    expect(failed.slice.committed.instances).toEqual(saved.committed.instances);
    expect(saved.committed.knownTo[side]).not.toEqual(expect.arrayContaining(ids[opponent(side)].hand));
    expect(failed.slice.committed.knownTo[side]).toEqual(expect.arrayContaining(ids[opponent(side)].hand));
    expect(failed.slice.committed.knownTo[opponent(side)]).not.toContain(ids[side].deck[0]);
    expect(failed.slice.committed.knownTo[opponent(side)]).not.toContain(ids[side].deck[1]);
    const paid = answer(fold, slice, true);
    if (paid.kind !== "applied" || paid.error === null) throw new Error("Expected paid step failure");
    expect(paid.slice.committed.sides[opponent(side)].currentEnergy).toBe(3);
    expect(paid.published).toEqual([]);
  });
});

describe("opposing score payment composition", () => {
  it.each(["player", "enemy"] as const)("%s consumes its first positive score match for paid, declined and unaffordable effects, then resets next turn", controller => {
    const payer = opponent(controller);
    for (const mode of ["pay", "decline", "unaffordable"] as const) {
      const { state } = boardState(engine.catalog, { active: payer, phase: "day", scoreToWin: 100,
        [payer]: { front: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], energy: mode === "unaffordable" ? 0 : 2, deck },
        [controller]: { avatar: avatarId, deck, energy: 4 } });
      const fold = createFoldAdapter(engine);
      let slice = sliceOf(state);
      const events: EngineEvent[] = [];
      const payments: Prompt[] = [];
      let sawSecond = false;
      for (let intents = 0; intents < 60 && !sawSecond; intents++) {
        const pending = fold.pending(slice)?.prompt;
        let outcome: IntentOutcome;
        if (pending !== undefined) {
          expect(pending).toMatchObject({ kind: "payOrDecline", side: payer, purpose: { role: "opponentUnlessPays", source: { kind: "avatar", side: controller, id: avatarId } } });
          payments.push(pending);
          expect(fold.pending(slice)!.display.oncePerTurn).toHaveLength(1);
          outcome = answer(fold, slice, mode === "pay");
        } else {
          const decision = engine.decision(slice.committed);
          if (decision === null) throw new Error("Missing score workflow decision");
          outcome = fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
        }
        slice = applied(outcome);
        if (outcome.kind !== "applied") throw new Error("Missing score outcome");
        events.push(...outcome.published);
        sawSecond = events.filter(e => e.kind === "laneResolved" && e.lane === 2 && e.scored > 0).length === 2;
      }
      expect(sawSecond).toBe(true);
      expect(events.filter(e => e.kind === "triggerQueued")).toHaveLength(2);
      expect(events.filter(e => e.kind === "laneResolved" && e.scored === 0).length).toBeGreaterThanOrEqual(2);
      expect(payments).toHaveLength(mode === "unaffordable" ? 0 : 2);
      expect(events.filter(e => e.kind === "energyChanged" && e.cause === "payment")).toEqual(mode === "pay" ? [expect.objectContaining({ side: payer, change: -1 }), expect.objectContaining({ side: payer, change: -1 })] : []);
      const ordinaryDraws = events.filter(e => e.kind === "phaseChanged" && e.phase === "draw" && e.active === controller).length;
      expect(events.filter(e => e.kind === "cardDrawn" && e.side === controller)).toHaveLength(ordinaryDraws + (mode === "pay" ? 0 : 2));
      expect(invariantViolations(slice.committed, engine.catalog)).toEqual([]);
    }
  });

  it.each(["player", "enemy"] as const)("%s excludes flat point gains, fatigue and zero challenge awards", controller => {
    const payer = opponent(controller);
    for (const subject of [flat, fatigue]) {
      const { fold, slice } = opened(payer, subject.id, 0, [], { active: payer, phase: "day",
        [payer]: { hand: [subject.id], energy: 4, deck }, [controller]: { avatar: avatarId, deck: subject === fatigue ? [] : deck } });
      expect(fold.pending(slice)).toBeNull();
      expect(slice.committed.oncePerTurn).toEqual([]);
      expect(slice.committed.triggerQueue).toEqual([]);
    }
    const { state } = boardState(engine.catalog, { active: payer, phase: "day", [payer]: { front: [v.vanilla0.id], deck }, [controller]: { avatar: avatarId, deck } });
    const fold = createFoldAdapter(engine);
    let slice = sliceOf(state);
    const events: EngineEvent[] = [];
    for (let intents = 0; intents < 10 && !events.some(e => e.kind === "laneResolved"); intents++) {
      const decision = engine.decision(slice.committed)!;
      const outcome = fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } });
      slice = applied(outcome);
      if (outcome.kind === "applied") events.push(...outcome.published);
    }
    expect(events).toContainEqual(expect.objectContaining({ kind: "laneResolved", scored: 0 }));
    expect(events.filter(e => e.kind === "triggerQueued")).toEqual([]);
    expect(slice.committed.oncePerTurn).toEqual([]);
  });
});
