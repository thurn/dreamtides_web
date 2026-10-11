/**
 * Prompt-protocol properties (engine-design § Testing layers), on synthetic
 * effects: inline/interactive equivalence, divergence, reload, alternating
 * sides, auto-answers, and cancellation.
 */
import { describe, expect, it } from "vitest";
import { promptFingerprint } from "../prompts/fingerprint";
import { stateHash } from "../state/hash";
import { battleSeed } from "../state/ids";
import { ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { DSL } from "../testing/dsl-cards";
import { playFuzzGame, replayInteractively, SYNTHETIC_FUZZ_POOL } from "../testing/fuzz";
import { createFoldAdapter, type BattleSlice } from "./slice";
import {
  v,
  p,
  deck,
  resetDivergentRuns,
  divergent,
  opponentChoosesAtPlay,
  lookAtPlay,
  drawThenDiscard,
  engine,
  fold,
  slice,
  applied,
  pendingOf,
  play,
} from "./fold.fixtures";

describe("inline and interactive equivalence", () => {
  it("reproduces final states, events, and fingerprints when suspending at every prompt", () => {
    let prompts = 0;
    for (let index = 0; index < 12; index++) {
      const game = playFuzzGame(engine, battleSeed(`fold-equivalence-${String(index)}`), SYNTHETIC_FUZZ_POOL);
      expect(game.failure).toBeNull();
      prompts += game.prompts;
      expect(replayInteractively(engine, game, () => 0).failure).toBeNull();
    }
    expect(prompts).toBeGreaterThan(0);
  });
});

describe("suspension", () => {
  it("detects a nondeterministic step on replay and leaves the committed state untouched", () => {
    resetDivergentRuns();
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [divergent.id, v.vanilla1.id, v.vanilla2.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    const before = stateHash(suspended.committed);
    const outcome = fold.reduce(suspended, {
      kind: "answer",
      side: "player",
      promptId: pending.prompt.id,
      value: [ids.player.hand[2]],
    });
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.error?.message).toMatch(/Replay diverged/);
    expect(outcome.slice.inFlight).toBeNull();
    expect(stateHash(outcome.slice.committed)).toBe(before);
  });

  it("reloads mid-prompt to the same pending prompt", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.chooseOne.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine).pending(reloaded);
    expect(fresh?.prompt.id).toBe(pending.prompt.id);
    const { id: _a, ...left } = pending.prompt;
    const { id: _b, ...right } = fresh!.prompt;
    expect(promptFingerprint(right)).toBe(promptFingerprint(left));
  });

  it("runs the victory check only when a suspended step completes, after a reload mid-prompt too", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { back: [DSL.winWithEmptyDeck.id], hand: [drawThenDiscard.id, v.vanilla1.id], deck: [v.vanilla1.id] },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    // The deck is empty mid-step, but the battle has no result until the step completes.
    expect(pending.display.sides.player.deck).toEqual([]);
    expect(pending.display.result).toBeNull();
    expect(suspended.committed.result).toBeNull();
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] } as const;
    const done = applied(createFoldAdapter(engine).reduce(reloaded, answer));
    expect(done.committed.result).toEqual({ kind: "victory", winner: "player", reason: "winCondition" });
    expect(stateHash(done.committed)).toBe(stateHash(applied(fold.reduce(suspended, answer)).committed));
  });

  it("alternates prompts between sides within one step", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.eachPlayerDiscards.id, v.vanilla1.id, v.vanilla2.id], energy: 1, deck },
      enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck },
    });
    let current = applied(play(start, ids.player.hand[0]));
    const first = pendingOf(current);
    expect(first.prompt.side).toBe("player");
    current = applied(fold.reduce(current, { kind: "answer", side: "player", promptId: first.prompt.id, value: [ids.player.hand[1]] }));
    const second = pendingOf(current);
    expect(second.prompt.side).toBe("enemy");
    expect(second.prompt.id).not.toBe(first.prompt.id);
    expect(current.committed.version).toBe(start.committed.version + 1);
    current = applied(fold.reduce(current, { kind: "answer", side: "enemy", promptId: second.prompt.id, value: [ids.enemy.hand[0]] }));
    expect(fold.pending(current)).toBeNull();
    expect(current.committed.sides.player.void).toContain(ids.player.hand[1]);
    expect(current.committed.sides.enemy.void).toEqual([ids.enemy.hand[0]]);
  });

  it("answers a forced prompt automatically and records it", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.opponentDiscards.id], energy: 1, deck },
      enemy: { hand: [v.vanilla2.id], deck },
    });
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(result.answers).toEqual([expect.objectContaining({ value: [ids.enemy.hand[0]], auto: true })]);
    expect(result.state.sides.enemy.void).toEqual([ids.enemy.hand[0]]);
    const interactive = applied(play({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, ids.player.hand[0]));
    expect(fold.pending(interactive)).toBeNull();
    expect(stateHash(interactive.committed)).toBe(stateHash(result.state));
  });
});

describe("cancellation", () => {
  it("restores the committed state when cancelled before the commit point", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.drawX.id], energy: 2, deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    expect(pending.prompt).toMatchObject({ kind: "chooseNumber", cancellable: true });
    expect(fold.reduce(suspended, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = applied(fold.reduce(suspended, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.inFlight).toBeNull();
    expect(stateHash(cancelled.committed)).toBe(stateHash(start.committed));
    expect(engine.decision(cancelled.committed)).toEqual({ kind: "main", side: "player" });
  });

  it("keeps only what the cancelled step's published private prompt showed its chooser", () => {
    const { slice: start, ids } = slice({ active: "player", phase: "day", player: { hand: [lookAtPlay.id], deck }, enemy: { deck } });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    expect(pending.prompt).toMatchObject({ privateTo: "player", cancellable: true });
    const cancelled = applied(fold.reduce(suspended, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.inFlight).toBeNull();
    const top = ids.player.deck.slice(0, 2);
    expect(cancelled.committed).toEqual({ ...start.committed, knownTo: { ...start.committed.knownTo, player: top } });
  });

  it("lets only the acting side cancel, never the opponent answering a prompt in its play", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [opponentChoosesAtPlay.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    expect(pending.prompt).toMatchObject({ kind: "chooseNumber", side: "enemy", cancellable: false });
    expect(fold.reduce(suspended, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(fold.reduce(suspended, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: 1 }));
    expect(fold.pending(done)).toBeNull();
    expect(done.committed.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("rejects a cancel after the commit point", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.chooseOne.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const pending = pendingOf(suspended);
    expect(pending.prompt.cancellable).toBe(false);
    expect(fold.reduce(suspended, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
  });
});
