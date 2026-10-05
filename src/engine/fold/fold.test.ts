/**
 * Prompt-protocol properties (engine-design § Testing layers), on synthetic
 * effects: inline/interactive equivalence, divergence, reload, cancel, empty
 * candidate sets, alternating sides, auto-answers, and bounces.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { promptFingerprint } from "../prompts/fingerprint";
import type { ChooseCardsPrompt, PromptId } from "../prompts/types";
import { stateHash } from "../state/hash";
import { battleSeed } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { playFuzzGame, replayInteractively } from "../testing/fuzz";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { PROMPTING, PROMPTING_CARDS } from "../testing/synthetic-effects";
import { parsePromptId } from "../../types/identifiers";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "./slice";

const v = SYNTHETIC;
const p = PROMPTING;
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

// A deliberately nondeterministic effect: its prompt's candidates change on
// every run of the step, which replay must detect.
// eslint-disable-next-line dreamtides/engine-purity -- the fixture must be nondeterministic
let divergentRuns = 0;
const divergent: EngineCardDefinition = {
  id: syntheticId(901),
  cardType: "event",
  cost: 0,
  spark: null,
  subtype: "",
  speed: "standard",
  keywords: [],
  synthetic: {
    resolve: (ctx, item) => {
      // eslint-disable-next-line dreamtides/engine-purity -- the fixture must be nondeterministic
      divergentRuns += 1;
      const run = divergentRuns;
      const hand = ctx.state.sides[item.controller].hand;
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side: item.controller,
        purpose: { source: item.instance, cardId: null, ability: 0, role: "divergent" },
        candidates: run % 2 === 1 ? hand : hand.slice(1),
        min: 1,
        max: 1,
      });
    },
  },
};

// Raises a prompt with no legal answer, which rules code must never do.
const emptyPrompt: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(902),
  synthetic: {
    resolve: (ctx, item) => {
      ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side: item.controller,
        purpose: { source: item.instance, cardId: null, ability: 0, role: "empty" },
        candidates: [],
        min: 1,
        max: 1,
      });
    },
  },
};

const engine = createEngine(testCatalog([...PROMPTING_CARDS, divergent, emptyPrompt]));
const fold = createFoldAdapter(engine, { checkEventPrefix: true });

function slice(setup: BoardSetup): { slice: BattleSlice; ids: ReturnType<typeof boardState>["ids"] } {
  const { state, ids } = boardState(engine.catalog, setup);
  return { slice: { committed: state, inFlight: null, publishedEvents: 0 }, ids };
}

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

function pendingOf(current: BattleSlice) {
  const pending = fold.pending(current);
  if (pending === null) throw new Error("no pending prompt");
  return pending;
}

function play(current: BattleSlice, card: string): IntentOutcome {
  return fold.reduce(current, {
    kind: "battleAction",
    side: "player",
    action: { kind: "play", card: card as `i${number}`, from: "hand" },
  });
}

describe("inline and interactive equivalence", () => {
  it("reproduces final states, events, and fingerprints when suspending at every prompt", () => {
    let prompts = 0;
    for (let index = 0; index < 12; index++) {
      const game = playFuzzGame(engine, battleSeed(`fold-equivalence-${String(index)}`));
      expect(game.failure).toBeNull();
      prompts += game.prompts;
      expect(replayInteractively(engine, game, () => 0).failure).toBeNull();
    }
    expect(prompts).toBeGreaterThan(0);
  });
});

describe("suspension", () => {
  it("detects a nondeterministic step on replay and leaves the committed state untouched", () => {
    // eslint-disable-next-line dreamtides/engine-purity -- reset the nondeterministic fixture
    divergentRuns = 0;
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
    const interactive = applied(play({ committed: state, inFlight: null, publishedEvents: 0 }, ids.player.hand[0]));
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

describe("empty candidate sets", () => {
  it("makes a play illegal when a required play-time choice has no legal answer", () => {
    const empty = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.dissolveEnemy.id], energy: 1, deck },
      enemy: { deck },
    });
    expect(engine.legalActions(empty.state, "player").some((action) => action.kind === "play")).toBe(false);
    const withTarget = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.dissolveEnemy.id], energy: 1, deck },
      enemy: { back: [v.vanilla3.id], deck },
    });
    expect(engine.legalActions(withTarget.state, "player").some((action) => action.kind === "play")).toBe(true);
  });

  it("does nothing and reports noLegalTarget for a resolution-time choice with no option", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.discard.id], deck },
      enemy: { deck },
    });
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(result.events.some((event) => event.kind === "noLegalTarget")).toBe(true);
    expect(result.answers).toEqual([]);
  });

  it("treats raising a prompt with no legal answer as an engine error", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [emptyPrompt.id], deck },
      enemy: { deck },
    });
    const outcome = play(start, ids.player.hand[0]);
    expect(outcome.kind === "applied" && outcome.error?.message).toMatch(/no legal answer/);
  });
});

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
    expect(answer("player", parsePromptId("0:9"), 0)).toEqual({ kind: "bounced", reason: "stalePrompt" });
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
    const suspended = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0 }, { kind: "battleAction", side: "player", action: { kind: "pass" } }));
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
