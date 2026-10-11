/**
 * Intents against a slice: bounces and the hand limit, prompt ids across
 * cancelled and failed attempts, the event-prefix check, and corrupt
 * in-flight records.
 */
import { describe, expect, it } from "vitest";
import { promptFingerprint } from "../prompts/fingerprint";
import type { PromptId } from "../prompts/types";
import { stateHash } from "../state/hash";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { parsePromptId } from "../../types/identifiers";
import { createFoldAdapter, type BattleSlice } from "./slice";
import {
  v,
  p,
  deck,
  emitThenChoose,
  shiftDivergentPlay,
  divergentPlay,
  engine,
  fold,
  slice,
  applied,
  pendingOf,
  play,
} from "./fold.fixtures";

describe("intent bounces and the hand limit", () => {
  it("bounces stale, foreign, illegal, and out-of-turn intents", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.chooseOne.id, v.vanilla1.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    const answer = (side: "player" | "enemy", promptId: PromptId, value: number) =>
      fold.reduce(suspended, { kind: "answer", side, promptId, value });
    expect(answer("player", parsePromptId("0:0:9"), 0)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", pending.prompt.id, 0)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", pending.prompt.id, 7)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(play(suspended, ids.player.hand[1])).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(start, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "notYourDecision" });
  });

  it("has the active side choose its discards down to the hand limit during Ending", () => {
    const hand = Array.from({ length: 12 }, () => v.vanilla8.id);
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "night",
      player: { hand, deck },
      enemy: { deck },
    });
    const discards = [ids.player.hand[3], ids.player.hand[7]];
    const result = engine.apply(state, "player", { kind: "pass" }, new ScriptedSource([discards]));
    expect(result.state.sides.player.hand).toHaveLength(10);
    expect(result.state.sides.player.void).toEqual(expect.arrayContaining(discards));
    const suspended = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: { kind: "pass" } }));
    expect(pendingOf(suspended).prompt).toMatchObject({
      kind: "chooseCards",
      side: "player",
      min: 2,
      max: 2,
      cancellable: false,
      purpose: { role: "discardToHandLimit" },
    });
    const done: BattleState = applied(fold.reduce(suspended, { kind: "answer", side: "player", promptId: pendingOf(suspended).prompt.id, value: discards })).committed;
    expect(stateHash(done)).toBe(stateHash(result.state));
  });
});

describe("prompt ids across attempts", () => {
  it("bounces an answer to a cancelled attempt's prompt after a new attempt from the same state", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.drawX.id], energy: 2, deck },
      enemy: { deck },
    });
    const first = applied(play(start, ids.player.hand[0]));
    const stale = pendingOf(first).prompt.id;
    const cancelled = applied(fold.reduce(first, { kind: "cancel", side: "player", promptId: stale }));
    const second = applied(play(cancelled, ids.player.hand[0]));
    const current = pendingOf(second).prompt.id;
    expect(current).not.toBe(stale);
    expect(fold.reduce(second, { kind: "answer", side: "player", promptId: stale, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fold.reduce(second, { kind: "cancel", side: "player", promptId: stale })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const reloaded = JSON.parse(JSON.stringify(second)) as BattleSlice;
    expect(createFoldAdapter(engine).pending(reloaded)?.prompt.id).toBe(current);
    const done = applied(fold.reduce(second, { kind: "answer", side: "player", promptId: current, value: 1 }));
    expect(fold.pending(done)).toBeNull();
  });
});

describe("prompt ids after a failed attempt", () => {
  it("bounces an answer to a failed attempt's prompt after a new attempt from the same state", () => {
    shiftDivergentPlay(false);
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [divergentPlay.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
      enemy: { deck },
    });
    const first = applied(play(start, ids.player.hand[0]));
    const stale = pendingOf(first).prompt.id;
    // The re-run after the answer diverges.
    shiftDivergentPlay(true);
    const failed = fold.reduce(first, { kind: "answer", side: "player", promptId: stale, value: [ids.player.hand[2]] });
    // The next attempt runs deterministically.
    shiftDivergentPlay(false);
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected an engine error");
    expect(stateHash(failed.slice.committed)).toBe(stateHash(start.committed));
    const second = applied(play(failed.slice, ids.player.hand[0]));
    const current = pendingOf(second).prompt.id;
    expect(current).not.toBe(stale);
    expect(fold.reduce(second, { kind: "answer", side: "player", promptId: stale, value: [ids.player.hand[2]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
  });
});

describe("the event-prefix check", () => {
  it("compares a re-run only with the same step's previous run, never a cancelled attempt", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      // X=1 costs 1●, so both answers to the X prompt are payable.
      player: { hand: [emitThenChoose.id, emitThenChoose.id], energy: 1, deck },
      enemy: { deck },
    });
    const first = applied(play(start, ids.player.hand[0]));
    expect(first.publishedEvents).toBeGreaterThan(0);
    const cancelled = applied(fold.reduce(first, { kind: "cancel", side: "player", promptId: pendingOf(first).prompt.id }));
    const second = applied(play(cancelled, ids.player.hand[1]));
    const outcome = fold.reduce(second, { kind: "answer", side: "player", promptId: pendingOf(second).prompt.id, value: 0 });
    expect(outcome).toMatchObject({ kind: "applied", error: null });
  });
});

describe("corrupt in-flight records", () => {
  function suspendedAtSecondPrompt() {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.eachPlayerDiscards.id, v.vanilla1.id, v.vanilla2.id], energy: 1, deck },
      enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck },
    });
    const first = applied(play(start, ids.player.hand[0]));
    const second = applied(fold.reduce(first, { kind: "answer", side: "player", promptId: pendingOf(first).prompt.id, value: [ids.player.hand[1]] }));
    const { id, ...prompt } = pendingOf(second).prompt;
    const enemyAnswer = { fingerprint: promptFingerprint(prompt), value: [ids.enemy.hand[0]] };
    return { suspended: second, promptId: id, enemyAnswer, ids };
  }

  function corrupted(source: BattleSlice, edit: (answers: { fingerprint: string; value: unknown }[]) => void): BattleSlice {
    const copy = JSON.parse(JSON.stringify(source)) as { inFlight: { answers: { fingerprint: string; value: unknown }[] } };
    edit(copy.inFlight.answers);
    return copy as unknown as BattleSlice;
  }

  it("reports a reloaded divergent, illegal, complete, or overlong recorded prefix as an engine error", () => {
    const { suspended, promptId, enemyAnswer, ids } = suspendedAtSecondPrompt();
    const cases: [BattleSlice, RegExp][] = [
      [corrupted(suspended, (answers) => { answers[0].fingerprint = "corrupt"; }), /Replay diverged/],
      [corrupted(suspended, (answers) => { answers[0].value = [ids.enemy.hand[0]]; }), /Illegal answer/],
      [corrupted(suspended, (answers) => { answers.push(enemyAnswer); }), /does not suspend/],
      [corrupted(suspended, (answers) => { answers.push(enemyAnswer, enemyAnswer); }), /unused/],
    ];
    for (const [corrupt, message] of cases) {
      const reloaded = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(reloaded.pending(corrupt)).toBeNull();
      const intents = [
        { kind: "answer", side: "enemy", promptId, value: [ids.enemy.hand[0]] },
        { kind: "cancel", side: "enemy", promptId },
        { kind: "battleAction", side: "player", action: { kind: "pass" } },
      ] as const;
      for (const intent of intents) {
        const outcome = reloaded.reduce(corrupt, intent);
        expect(outcome.kind).toBe("applied");
        if (outcome.kind !== "applied") continue;
        expect(outcome.error?.kind).toBe("engine_error");
        expect(outcome.error?.message).toMatch(message);
        expect(outcome.slice.inFlight).toBeNull();
        expect(stateHash(outcome.slice.committed)).toBe(stateHash(suspended.committed));
      }
    }
  });
});
