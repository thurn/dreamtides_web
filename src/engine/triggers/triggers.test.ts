/**
 * The trigger queue (D14; rules § Ability Types → Triggered abilities): its
 * fixed order, floating, delayed, and disabled triggers and triggerAbility,
 * prompts raised by triggers through the fold, required targets with too few
 * candidates, and failure paths.
 */
import { describe, expect, it, vi } from "vitest";
import { eventVisibleTo, type EngineEvent } from "../events";
import { winConditionMet } from "../events/kinds/win-condition-met";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { deserializeState, stateHash } from "../state/hash";
import type { Side } from "../state/ids";
import { SIDES, opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS } from "../steps/sources";
import type { Answer, PromptPurpose } from "../prompts/types";
import { boardState } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { eventRedactionViolations } from "../testing/redaction";
import { STACK } from "../testing/stack-cards";
import { DSL } from "../testing/dsl-cards";
import { TRIGGER_AVATAR } from "../testing/trigger-cards";
import { at, passUntil } from "../testing/trigger-harness";
import {
  v,
  t,
  deck,
  L,
  WATCHER_AVATAR,
  WATCHER_SIGN,
  engine,
  board,
  play,
  resolvedSources,
  queuedCount,
  strings,
  seenBy,
} from "./triggers.fixtures";

describe("trigger order (D14)", () => {
  for (const active of ["player", "enemy"] as const) {
    it(`queues one event's matches with ${active} first: avatar, dreamsigns, B0→B9, F0→F8, then void, hand, deck`, () => {
      const other = opponent(active);
      const w = L.watcher.id;
      const { state, ids } = boardState(engine.catalog, {
        active,
        phase: "day",
        [active]: {
          avatar: WATCHER_AVATAR.id,
          dreamsigns: [WATCHER_SIGN.id, WATCHER_SIGN.id],
          front: [null, null, w],
          back: [w, null, null, null, null, w],
          hand: [v.event0.id, w, w],
          deck: [w],
          void: [w, w],
        },
        [other]: { avatar: WATCHER_AVATAR.id, dreamsigns: [WATCHER_SIGN.id], front: [w], back: [null, w], hand: [w], deck: [w], void: [w] },
      });
      const mine = ids[active];
      const theirs = ids[other];
      // Within a zone, cards go in the order they were created, not zone order.
      state.sides[active].void.reverse();
      const result = runStep(state, { kind: "play", from: "hand", card: mine.hand[0] }, NO_PROMPTS, engine.catalog);
      if (result.kind !== "done") throw new Error("suspended");
      const queue = result.state.triggerQueue.map((entry) => [entry.source, entry.ability]);
      expect(queue).toEqual([
        [{ kind: "avatar", side: active }, 0],
        [{ kind: "dreamsign", side: active, index: 0 }, 0],
        [{ kind: "dreamsign", side: active, index: 1 }, 0],
        [mine.back[0], 0],
        [mine.back[5], 0],
        [mine.front[2], 0],
        [mine.void[0], 0],
        [mine.void[1], 0],
        [mine.hand[1], 0],
        [mine.hand[2], 0],
        [mine.deck[0], 0],
        [{ kind: "avatar", side: other }, 1],
        [{ kind: "dreamsign", side: other, index: 0 }, 1],
        [theirs.back[1], 1],
        [theirs.front[0], 1],
        [theirs.void[0], 1],
        [theirs.hand[0], 1],
        [theirs.deck[0], 1],
      ]);
      // Nobody decides while triggers wait.
      expect(engine.decision(result.state)).toBeNull();
      expect(engine.legalActions(result.state, other)).toEqual([]);
    });
  }

  it("resolves separate events' triggers in event order, and appends triggers fired while resolving", () => {
    const { state, ids } = board({
      player: { back: [L.dissolvedDraw.id, L.dissolvedEnergy.id, L.drawPoints.id], hand: [L.sweep.id], deck },
      enemy: { deck },
    });
    const result = play(state, "player", ids.player.hand[0]);
    // ▸Dissolved fires from the void; the draw's trigger joins the end of the queue.
    expect(resolvedSources(result.events)).toEqual([ids.player.back[0], ids.player.back[1], ids.player.back[2]]);
    expect(result.state.sides.player.score).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(1);
  });

  it("orders a card that has just left play by the zone it went to, while its trigger sees it as it was", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.leavesPlayEnergy.id, t.leavesPlayEnergy.id], deck },
      enemy: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
    });
    const departing = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0], [[departing]]);
    expect(result.state.instances[departing]?.zone).toBe("void");
    // B1 is still in play; B0 went to the void, which comes after every character in play.
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
    expect(queued).toEqual([ids.player.back[1], departing]);
    expect(result.state.sides.player.currentEnergy).toBe(2);
  });

  it("orders a card banished from play after its controller's deck", () => {
    const { state, ids } = board({
      active: "enemy",
      player: { back: [t.leavesPlayEnergy.id, t.leavesPlayEnergy.id], void: [L.voidLeavesWatcher.id], deck },
      enemy: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck },
    });
    const departing = ids.player.back[0]!;
    const result = play(state, "enemy", ids.enemy.hand[0], [[departing]]);
    expect(result.state.instances[departing]?.zone).toBe("banished");
    const queued = result.events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
    expect(queued).toEqual([ids.player.back[1], ids.player.void[0], departing]);
  });

  it("waits until the effect finishes, then resolves one trigger per step before priority", () => {
    const { state, ids } = board({
      player: { avatar: TRIGGER_AVATAR.eventDraw.id, back: [t.secondDrawEnergy.id], hand: [DSL.drawTwo.id], energy: 1, deck },
      enemy: { hand: [v.interruptEvent.id], energy: 1, deck },
    });
    const steps: { kind: string; events: readonly EngineEvent[]; state: BattleState }[] = [];
    let current = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS, (next, step, events) => {
      steps.push({ kind: step.kind, events, state: next });
    }).state;
    // The avatar's "when you play an event" resolves before the enemy may respond.
    expect(steps.map((step) => step.kind)).toEqual(["play", "resolveTrigger"]);
    expect(steps[0]?.state.triggerQueue).toHaveLength(1);
    // The enemy could respond, but nobody decides while the trigger waits.
    expect(engine.decision(steps[0].state)).toBeNull();
    expect(engine.legalActions(steps[0].state, "enemy")).toEqual([]);
    expect(engine.decision(current)).toEqual({ kind: "respond", side: "enemy" });
    steps.length = 0;
    current = engine.apply(current, "enemy", { kind: "pass" }, NO_PROMPTS, (next, step, events) => {
      steps.push({ kind: step.kind, events, state: next });
    }).state;
    // The second draw triggers mid-effect, but resolves only after the event finishes.
    expect(steps.map((step) => step.kind)).toEqual(["resolveTop", "resolveTrigger"]);
    expect(steps[0]?.events.filter((entry) => entry.kind === "cardDrawn")).toHaveLength(2);
    expect(steps[0]?.state.sides.player.currentEnergy).toBe(0);
    expect(current.sides.player.currentEnergy).toBe(1);
  });
});

describe("floating, delayed, and disabled triggers", () => {
  it("triggers a floating trigger each time until end of turn", () => {
    const { state, ids } = board({ player: { hand: [t.floatingDraw.id, v.vanilla0.id, v.vanilla0.id, v.vanilla0.id], energy: 1, deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    current = play(current, "player", ids.player.hand[1]).state;
    current = play(current, "player", ids.player.hand[2]).state;
    expect(current.sides.player.hand).toHaveLength(3);
    const ended = passUntil(engine, current, at(engine, "enemy", "day"));
    expect(ended.state.floating).toEqual([]);
    expect(ended.events.some((entry) => entry.kind === "effectEnded")).toBe(true);
  });

  it("triggers a delayed trigger once, and ends an unfired one with its duration", () => {
    const { state, ids } = board({ player: { hand: [t.delayedPoints.id, v.event0.id, v.event0.id, t.delayedPoints.id], deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    current = play(current, "player", ids.player.hand[1]).state;
    expect(current.sides.player.score).toBe(2);
    expect(current.floating).toEqual([]);
    current = play(current, "player", ids.player.hand[2]).state;
    expect(current.sides.player.score).toBe(2);
    current = play(current, "player", ids.player.hand[3]).state;
    expect(current.floating).toHaveLength(1);
    expect(passUntil(engine, current, at(engine, "enemy", "day")).state.floating).toEqual([]);
  });

  it("creates a delayed trigger from a triggered ability's effect", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.delayedByTrigger.id, DSL.returnAnyToHand.id], energy: 2, deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.floating.map((effect) => effect.change.kind)).toEqual(["trigger"]);
    current = play(current, "player", ids.player.hand[1], [[ids.player.back[0]!]]).state;
    expect(current.sides.player.currentEnergy).toBe(2);
    expect(current.floating).toEqual([]);
  });

  it("keeps a delayed trigger made by a card in a hidden hand private to that hand's holder", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { hand: [t.handDelayed.id], deck } });
    const hidden = ids.enemy.hand[0];
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.floating.map((effect) => effect.source)).toEqual([hidden]);
    expect(result.events.some((entry) => entry.kind === "effectStarted")).toBe(true);
    const namedTo = (viewer: Side) => strings([seenBy(result.events, viewer, result.state), engine.view(result.state, viewer)]);
    const player = namedTo("player");
    expect(player.has(hidden)).toBe(false);
    expect(player.has(t.handDelayed.id)).toBe(false);
    const enemy = namedTo("enemy");
    expect(enemy.has(hidden)).toBe(true);
    expect(enemy.has(t.handDelayed.id)).toBe(true);
  });

  for (const zone of ["hand", "deck"] as const) {
    it(`keeps a win claimed by a trigger from a card in a hidden ${zone} private to its holder, naming the card only where it can identify it, while the win stays public`, () => {
      const winner = zone === "hand" ? L.handWin.id : L.anywhereWin.id;
      const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { [zone]: zone === "hand" ? [winner] : [winner, ...deck] } });
      const hidden = zone === "hand" ? ids.enemy.hand[0] : ids.enemy.deck[0];
      const result = play(state, "player", ids.player.hand[0]);
      const met = result.events.find((entry) => entry.kind === "winConditionMet");
      expect(met).toEqual({ kind: "winConditionMet", side: "enemy", sources: [hidden] });
      expect(result.state.result).toEqual({ kind: "victory", winner: "enemy", reason: "winCondition" });
      const ended = result.events.find((entry) => entry.kind === "battleEnded");
      for (const viewer of SIDES) expect(ended !== undefined && eventVisibleTo(ended, viewer, result.state)).toBe(true);
      const namedTo = (viewer: Side) => strings([seenBy(result.events, viewer, result.state), engine.view(result.state, viewer)]);
      const player = namedTo("player");
      expect(player.has(hidden)).toBe(false);
      expect(player.has(winner)).toBe(false);
      // Its holder identifies a card in its hand, but not one in its deck it has not learned.
      expect(namedTo("enemy").has(hidden)).toBe(zone === "hand");
      expect(seenBy(result.events, "enemy", result.state)).toContainEqual({ kind: "winConditionMet", side: "enemy", sources: [zone === "hand" ? hidden : null] });
      expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    });

    it(`fails the event-redaction invariant when a win claimed from a hidden ${zone} is public and unredacted`, () => {
      const winner = zone === "hand" ? L.handWin.id : L.anywhereWin.id;
      const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { [zone]: zone === "hand" ? [winner] : [winner, ...deck] } });
      const hidden = zone === "hand" ? ids.enemy.hand[0] : ids.enemy.deck[0];
      const publicWin = vi.spyOn(winConditionMet, "privateTo").mockReturnValue(null);
      const unredacted = vi.spyOn(winConditionMet, "redact").mockImplementation((event) => event);
      try {
        const result = play(state, "player", ids.player.hand[0]);
        const violations = eventRedactionViolations(result.events, state, result.state);
        // The opponent never identifies the card; its holder cannot identify an unlearned deck card.
        expect(violations).toHaveLength(zone === "hand" ? 1 : 2);
        for (const violation of violations) expect(violation).toContain(hidden);
      } finally {
        unredacted.mockRestore();
        publicWin.mockRestore();
      }
    });
  }

  it("shows a win condition met by a public source to both sides", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { back: [L.anywhereWin.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    const met = result.events.find((entry) => entry.kind === "winConditionMet");
    expect(met).toEqual({ kind: "winConditionMet", side: "enemy", sources: [ids.enemy.back[0]] });
    for (const viewer of SIDES) expect(met !== undefined && eventVisibleTo(met, viewer, result.state)).toBe(true);
  });

  it("suppresses a disabled character's triggers until the duration ends", () => {
    const { state, ids } = board({
      player: { hand: [t.silenceEnemy.id, DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { back: [t.dissolvedRevenge.id], deck },
    });
    let current = play(state, "player", ids.player.hand[0]).state;
    expect(current.floating.map((effect) => effect.change.kind)).toEqual(["disableTriggers"]);
    const dissolved = play(current, "player", ids.player.hand[1]);
    expect(queuedCount(dissolved.events, ids.enemy.back[0]!)).toBe(0);
    current = passUntil(engine, dissolved.state, at(engine, "enemy", "day")).state;
    expect(current.floating).toEqual([]);
  });
});

describe("prompts raised by triggers", () => {
  const setup = () =>
    board({
      player: { back: [t.dissolvedRevenge.id, t.dissolvedRevenge.id], hand: [L.sweep.id], deck },
      enemy: { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck },
    });

  it("suspend and resume through the fold, trigger by trigger, matching the inline run", () => {
    const { state, ids } = setup();
    const answers: Answer[] = [[ids.enemy.back[0]!], [ids.enemy.back[2]!]];
    const inline = play(state, "player", ids.player.hand[0], answers).state;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (opened.kind !== "applied") throw new Error("bounced");
    let slice = opened.slice;
    const sources: PromptPurpose["source"][] = [];
    const firstId = fold.pending(slice)?.prompt.id;
    for (const answer of answers) {
      // Reloading mid-sequence reaches the identical prompt.
      const reloaded: BattleSlice = { ...slice, committed: deserializeState(JSON.stringify(slice.committed)) };
      const pending = fold.pending(reloaded);
      if (pending === null) throw new Error("no prompt");
      expect(pending.prompt).toEqual(fold.pending(slice)?.prompt);
      expect(slice.inFlight?.step).toEqual({ kind: "resolveTrigger" });
      sources.push(pending.prompt.purpose.source);
      expect(pending.prompt.cancellable).toBe(false);
      expect(fold.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: answer })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      if (pending.prompt.id !== firstId && firstId !== undefined) {
        // An answer to the committed first trigger's prompt is stale.
        expect(fold.reduce(reloaded, { kind: "answer", side: "player", promptId: firstId, value: answer })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      }
      const outcome = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: answer });
      if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("answer failed");
      slice = outcome.slice;
    }
    // The first trigger committed before the second asked; each prompt names its own source.
    expect(sources).toEqual([ids.player.back[0], ids.player.back[1]]);
    expect(slice.inFlight).toBeNull();
    expect(stateHash(slice.committed)).toBe(stateHash(inline));
    expect(inline.sides.enemy.backRank.filter((id) => id !== null)).toEqual([ids.enemy.back[1]]);
  });

  it("does nothing when a trigger's required target has no candidates", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedRevenge.id], hand: [L.sweep.id], deck }, enemy: { deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(true);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });
});

describe("required trigger targets with too few candidates", () => {
  it("does nothing, without a prompt, when a required two-target trigger has one candidate", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedTwo.id], hand: [L.sweep.id], deck }, enemy: { back: [v.vanilla1.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(true);
    expect(result.events.some((entry) => entry.kind === "dissolved" && entry.instance === ids.enemy.back[0])).toBe(false);
    expect(result.state.sides.enemy.backRank[0]).toBe(ids.enemy.back[0]);
    expect(result.answers.filter((answer) => answer.auto === true)).toEqual([]);
  });

  it("does nothing, without a prompt, when a trigger's only candidate cannot be targeted", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedRevenge.id], hand: [L.sweep.id], deck }, enemy: { back: [DSL.untargetableCharacter.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events).toContainEqual({ kind: "noLegalTarget", source: ids.player.back[0] });
    expect(result.state.sides.enemy.backRank[0]).toBe(ids.enemy.back[0]);
    expect(result.answers).toEqual([]);
  });

  it("chooses both targets when a required two-target trigger has enough candidates", () => {
    const { state, ids } = board({ player: { back: [t.dissolvedTwo.id], hand: [L.sweep.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.events.some((entry) => entry.kind === "noLegalTarget")).toBe(false);
    expect(result.state.sides.enemy.backRank.filter((id) => id !== null)).toEqual([]);
  });
});

describe("trigger failure paths", () => {
  it("stops resolving queued triggers once the battle ends", () => {
    const { state } = board({ active: "player", phase: "day", scoreToWin: 25, player: { score: 24, back: [t.duskPoints.id, t.duskPoints.id], deck }, enemy: { deck } });
    const result = engine.apply(state, "player", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(result.events.filter((entry) => entry.kind === "triggerResolved")).toHaveLength(1);
    expect(result.state.triggerQueue).toHaveLength(1);
    expect(engine.decision(result.state)).toBeNull();
  });

  it("releases priority when a trigger prevents the last card on the stack", () => {
    const { state, ids } = board({ player: { hand: [v.event0.id], deck }, enemy: { back: [t.preventOnPlay.id], deck } });
    const steps: BattleState[] = [];
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS, (next) => {
      steps.push(next);
    });
    expect(result.events.some((entry) => entry.kind === "prevented")).toBe(true);
    expect(result.state.stack).toEqual([]);
    expect(result.state.priority).toBeNull();
    for (const step of steps) expect(invariantViolations(step, engine.catalog)).toEqual([]);
    expect(engine.decision(result.state)).toEqual({ kind: "main", side: "player" });
  });

  it("ends a trigger cycle nobody can stop, which repeats a state exactly, in a draw", () => {
    const { state, ids } = board({ player: { hand: [L.echo.id], deck }, enemy: { deck } });
    const result = play(state, "player", ids.player.hand[0]);
    expect(result.state.result).toEqual({ kind: "draw", reason: "mandatoryLoop" });
  });

  it("throws, leaving the committed state alone, for an empty queue or a queued ability that is not a trigger", () => {
    const { state, ids } = board({ player: { back: [STACK.fastPump.id], deck }, enemy: { deck } });
    const before = stateHash(state);
    expect(() => runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    const source = ids.player.back[0]!;
    const corrupt: BattleState = {
      ...state,
      triggerQueue: [{ source, controller: "player", origin: { kind: "card", cardId: STACK.fastPump.id, variant: { amplified: false } }, ability: 0, node: null, subject: null }],
    };
    expect(() => runStep(corrupt, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(state)).toBe(before);
  });
});
