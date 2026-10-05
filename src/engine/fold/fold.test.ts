/**
 * Prompt-protocol properties (engine-design § Testing layers), on synthetic
 * effects: inline/interactive equivalence, divergence, reload, cancel, empty
 * candidate sets, alternating sides, auto-answers, and bounces.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { createEngine } from "../engine";
import { promptFingerprint } from "../prompts/fingerprint";
import type { ArrangePrompt, ChooseCardsPrompt, ChooseNumberPrompt, PromptId } from "../prompts/types";
import { stateHash } from "../state/hash";
import { battleSeed } from "../state/ids";
import type { InstanceId } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { fuzzEngineCatalog, playFuzzGame, replayInteractively } from "../testing/fuzz";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { PROMPTING } from "../testing/synthetic-effects";
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
  status: "authored",
  abilities: () => [],
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

// Emits an event before its cancellable play-time prompt, so its published
// event prefix is non-empty while it can still be cancelled.
const emitThenChoose: EngineCardDefinition = {
  ...divergent,
  id: syntheticId(903),
  synthetic: {
    play: (ctx, self) => {
      ctx.emit({ kind: "noLegalTarget", source: self });
      return {
        x: ctx.choose<ChooseNumberPrompt>({
          kind: "chooseNumber",
          side: ctx.state.instances[self]?.owner ?? "player",
          purpose: { source: self, cardId: null, ability: 0, role: "emitThenChoose" },
          min: 0,
          max: 1,
        }),
      };
    },
  },
};

// Malformed prompts, which rules code must never raise.
function malformed(index: number, raise: (ctx: StepContext, source: InstanceId) => void): EngineCardDefinition {
  return { ...divergent, id: syntheticId(index), synthetic: { resolve: (ctx, item) => raise(ctx, item.instance) } };
}
const malformedPurpose = (source: InstanceId) => ({ source, cardId: null, ability: 0, role: "malformed" });
const MALFORMED = [
  malformed(904, (ctx, source) =>
    ctx.choose<ChooseCardsPrompt>({ kind: "chooseCards", side: "player", purpose: malformedPurpose(source), candidates: [source, source], min: 2, max: 2 }),
  ),
  malformed(905, (ctx, source) =>
    ctx.choose<ChooseCardsPrompt>({ kind: "chooseCards", side: "player", purpose: malformedPurpose(source), candidates: [source], min: -1, max: 1 }),
  ),
  malformed(906, (ctx, source) =>
    ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: "player", purpose: malformedPurpose(source), min: 2, max: 1 }),
  ),
  malformed(907, (ctx, source) =>
    ctx.choose<ArrangePrompt>({
      kind: "arrange",
      side: "player",
      purpose: malformedPurpose(source),
      cards: [source],
      destinations: [{ to: "top", min: 0, max: 1 }, { to: "top", min: 0, max: 1 }],
    }),
  ),
];

const engine = createEngine(fuzzEngineCatalog([divergent, emptyPrompt, emitThenChoose, ...MALFORMED]));
const fold = createFoldAdapter(engine, { checkEventPrefix: true });

function slice(setup: BoardSetup): { slice: BattleSlice; ids: ReturnType<typeof boardState>["ids"] } {
  const { state, ids } = boardState(engine.catalog, setup);
  return { slice: { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, ids };
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

describe("the event-prefix check", () => {
  it("compares a re-run only with the same step's previous run, never a cancelled attempt", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [emitThenChoose.id, emitThenChoose.id], deck },
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

describe("prompt validation in the step context", () => {
  it("treats a malformed prompt, including duplicate candidates a forced answer would accept, as an engine error", () => {
    for (const card of MALFORMED) {
      const { slice: start, ids } = slice({
        active: "player",
        phase: "day",
        player: { hand: [card.id], deck },
        enemy: { deck },
      });
      const outcome = play(start, ids.player.hand[0]);
      expect(outcome.kind).toBe("applied");
      if (outcome.kind !== "applied") continue;
      expect(outcome.error?.message).toMatch(/malformed/);
      expect(outcome.slice.inFlight).toBeNull();
    }
  });
});

describe("constrained arrangements", () => {
  it("rejects both cards on top for one on top and one on the bottom, and applies a legal split", () => {
    const { slice: start, ids } = slice({
      active: "player",
      phase: "day",
      player: { hand: [p.topAndBottom.id], deck },
      enemy: { deck },
    });
    const suspended = applied(play(start, ids.player.hand[0]));
    const { prompt } = pendingOf(suspended);
    expect(prompt.kind).toBe("arrange");
    const [top, bottom] = ids.player.deck;
    if (top === undefined || bottom === undefined) throw new Error("deck too small");
    const answer = (value: { card: InstanceId; to: "top" | "bottom" }[]) =>
      fold.reduce(suspended, { kind: "answer", side: "player", promptId: prompt.id, value });
    expect(answer([{ card: top, to: "top" }, { card: bottom, to: "top" }])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer([{ card: top, to: "bottom" }, { card: bottom, to: "bottom" }])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const done = applied(answer([{ card: top, to: "bottom" }, { card: bottom, to: "top" }]));
    const finalDeck = done.committed.sides.player.deck;
    expect(finalDeck[0]).toBe(bottom);
    expect(finalDeck[finalDeck.length - 1]).toBe(top);
  });
});
