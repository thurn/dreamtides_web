/**
 * `atEndOfTurn` triggers as the Ending phase begins, and the Ending cleanup
 * waits for those triggers (RD-hv-umm2.86-1): before the hand-limit discard,
 * the Ephemeral and Offering banishes, and "until end of turn" expiry, in
 * every turn including extra turns, and a trigger created after that moment
 * waits for the next end of turn.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { passUntil } from "../../../testing/trigger-harness";
import { Answers, banished, endTurn, engine, F, handCard, indexOf, play, setup, v, waiting, zone } from "./at-end-of-turn-trigger-support";

const filler = Array<string>(12).fill(v.event0.id) as (typeof v.event0.id)[];
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
const isEnding = (entry: EngineEvent) => entry.kind === "phaseChanged" && entry.phase === "ending";

/** Borrowed Minutes for X = 2 over a void of 2●, 0●, 5● characters and an event, with a pumped resident and 12 hand cards. */
function borrowed() {
  const { state, ids } = setup({ hand: [F.borrow.id, F.pump.id, ...filler], back: [v.vanilla3.id], void: [v.vanilla2.id, v.vanilla0.id, v.vanilla5.id, v.event0.id] });
  const [two, zero, five, spellCard] = ids.player.void;
  const resident = ids.player.back[0]!;
  let current = play(state, handCard(state, F.borrow), new Answers([2])).state;
  current = play(current, handCard(current, F.pump), new Answers([], [[resident]])).state;
  return { state: current, cohort: [two, zero], five: five, spellCard: spellCard, resident };
}

describe("atEndOfTurn", () => {
  it("triggers as Ending begins and resolves before the hand-limit discard and the end of 'until end of turn'", () => {
    const { state, cohort, five, spellCard, resident } = borrowed();
    for (const id of cohort) expect(zone(state, id)).toBe("play");
    const pumped = state.floating.find((effect) => effect.change.kind !== "trigger")!;
    const ended = endTurn(state);
    const paused = waiting(ended.steps);
    expect(paused.turn.phase).toBe("ending");
    expect(paused.triggerQueue).toHaveLength(1);
    expect(paused.sides.player.hand).toHaveLength(12);
    expect(paused.floating.some((effect) => effect.id === pumped.id)).toBe(true);
    expect(invariantViolations(paused, engine.catalog)).toEqual([]);

    const { events } = ended;
    const ending = indexOf(events, isEnding);
    const banish = indexOf(events, (entry) => entry.kind === "banished");
    const discard = indexOf(events, (entry) => entry.kind === "discarded");
    const expiry = indexOf(events, (entry) => entry.kind === "effectEnded" && entry.effect === pumped.id);
    const next = indexOf(events, (entry) => entry.kind === "turnStarted");
    expect([ending < banish, banish < discard, discard < expiry, expiry < next]).toEqual([true, true, true, true]);
    expect(banished(events)).toEqual(cohort);
    for (const id of cohort) expect(zone(ended.state, id)).toBe("banished");
    expect([zone(ended.state, resident), zone(ended.state, five), zone(ended.state, spellCard)]).toEqual(["play", "void", "void"]);
    expect(ended.state.floating).toEqual([]);
    expect(ended.state.turn.endingCleanup).toBeUndefined();
    expect(ended.state.turn.active).toBe("enemy");
  });

  it("runs the Ending cleanup in the step that enters Ending when nothing triggers at end of turn", () => {
    const { state, ids } = setup({ hand: [F.pump.id, ...filler], back: [v.vanilla3.id] });
    const pumped = play(state, handCard(state, F.pump), new Answers([], [[ids.player.back[0]!]])).state;
    const ended = endTurn(pumped);
    expect(ended.steps.some((step) => step.state.turn.endingCleanup !== undefined)).toBe(false);
    const entering = ended.steps.find((step) => step.events.some(isEnding))!;
    expect(entering.events.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["discarded", "effectEnded"]));
  });

  it("matches the end of any turn, or with a player only that player's turns, active side first", () => {
    const { state, ids } = setup({ back: [v.vanilla1.id, F.yourEnd.id, F.anyEnd.id] }, { back: [F.yourEnd.id, F.anyEnd.id] });
    const [, mineYours, mineAny] = ids.player.back;
    const [theirsYours, theirsAny] = ids.enemy.back;
    const queued = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
    const first = endTurn(state);
    expect(queued(first.events)).toEqual([mineYours, mineAny, theirsAny]);
    expect([first.state.sides.player.score, first.state.sides.enemy.score]).toEqual([2, 1]);
    const second = endTurn(first.state);
    expect(queued(second.events.slice(indexOf(second.events, isEnding)))).toEqual([theirsYours, theirsAny, mineAny]);
    expect(theirsYours).not.toBeNull();
  });

  it("ends each extra turn by itself: a cohort is banished at the end of the turn it entered, extra or not (C8)", () => {
    const { state, ids } = setup({ hand: [F.extraTurn.id, F.borrow.id, F.borrow.id], back: [F.yourEnd.id], void: [v.vanilla1.id, v.vanilla3.id] });
    const [early, later] = ids.player.void;
    let current = play(state, handCard(state, F.extraTurn)).state;
    current = play(current, handCard(current, F.borrow), new Answers([1])).state;
    const first = endTurn(current);
    expect(banished(first.events)).toEqual([early]);
    expect([first.state.turn.active, first.state.turn.extra, first.state.sides.player.score]).toEqual(["player", true, 1]);
    current = play(first.state, handCard(first.state, F.borrow), new Answers([3])).state;
    expect(zone(current, later)).toBe("play");
    const second = endTurn(current);
    expect(banished(second.events)).toEqual([later]);
    expect([second.state.turn.active, second.state.turn.extra, second.state.sides.player.score]).toEqual(["enemy", false, 2]);
  });

  it("makes a trigger created during Ending, after its end-of-turn moment, wait for the next end of turn", () => {
    const { state, ids } = setup({ hand: [F.lateBorrow.id], void: [v.vanilla2.id] });
    const [late] = ids.player.void;
    const own = endTurn(play(state, handCard(state, F.lateBorrow)).state);
    // The delayed trigger materialized the character during the player's Ending; "at end of turn" is now the enemy's.
    expect(zone(own.state, late)).toBe("play");
    expect(banished(own.events)).toEqual([]);
    expect(own.state.floating.map((effect) => effect.change.kind === "trigger" && effect.change.captured)).toEqual([[late]]);
    const theirs = endTurn(own.state);
    expect(banished(theirs.events)).toEqual([late]);
    expect(theirs.events.findIndex((entry) => entry.kind === "banished")).toBeGreaterThan(theirs.events.findIndex(isEnding));
  });

  it("keeps the waiting cleanup through JSON saves between materialize and end of turn, and mid-Ending", () => {
    const { state } = borrowed();
    const direct = endTurn(state);
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(endTurn(reloaded).state)).toBe(stateHash(direct.state));
    const paused = waiting(direct.steps);
    const pausedSave = JSON.parse(JSON.stringify(paused)) as BattleState;
    expect(stateHash(pausedSave)).toBe(stateHash(paused));
    expect(stateHash(endTurn(pausedSave).state)).toBe(stateHash(direct.state));
  });

  it("suspends the waiting cleanup's hand-limit prompt through a cold fold reload, rejecting stale and foreign answers", () => {
    const { state } = borrowed();
    const direct = endTurn(state);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice = sliceOf(state);
    while (fold.pending(slice) === null) {
      const decision = engine.decision(slice.committed)!;
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    // The cohort is gone and the cleanup's discard is asked from a committed state still marked as waiting.
    expect(slice.committed.turn.endingCleanup).toBe(true);
    expect(slice.committed.triggerQueue).toEqual([]);
    expect(slice.committed.sides.player.banished).toHaveLength(2);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    expect(pending).toEqual(fold.pending(slice));
    if (pending.prompt.kind !== "chooseCards") throw new Error("expected the hand-limit discard");
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: pending.prompt.candidates.slice(0, 2) } as const;
    expect(cold.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const answered = applied(cold.reduce(saved, answer));
    expect(answered.committed.turn.endingCleanup).toBeUndefined();
    expect(cold.reduce(answered, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const settled = passUntil(engine, answered.committed, (next) => next.turn.active === "enemy" && next.turn.phase === "day" && engine.decision(next) !== null).state;
    expect(stateHash(settled)).toBe(stateHash(direct.state));
  });

  it("commits nothing from an end-of-turn trigger step that fails after its banish", () => {
    const { state, ids } = setup({ hand: [F.banishThenChoose.id], back: [v.vanilla3.id, v.vanilla3.id], void: [v.vanilla1.id] });
    const borrowedCard = ids.player.void[0];
    const raised = play(state, handCard(state, F.banishThenChoose)).state;
    const paused = waiting(endTurn(raised, new Answers([], [[ids.player.back[0]!]])).steps);
    const before = stateHash(paused);
    const failing = { answer: () => { throw new Error("interrupted mid-step"); } };
    expect(() => runStep(paused, { kind: "resolveTrigger" }, failing, engine.catalog)).toThrow("interrupted mid-step");
    expect(stateHash(paused)).toBe(before);
    expect([zone(paused, borrowedCard), paused.turn.endingCleanup, paused.triggerQueue.length]).toEqual(["play", true, 1]);
    const resumed = runStep(paused, { kind: "resolveTrigger" }, new ScriptedSource([[ids.player.back[1]!]]), engine.catalog);
    if (resumed.kind !== "done") throw new Error("expected the trigger to resolve");
    expect([zone(resumed.state, borrowedCard), zone(resumed.state, ids.player.back[1]!)]).toEqual(["banished", "hand"]);
  });

  it("flags an Ending cleanup marker outside the Ending phase", () => {
    const { state } = setup({});
    expect(invariantViolations({ ...state, turn: { ...state.turn, endingCleanup: true } }, engine.catalog)).toHaveLength(1);
  });
});
