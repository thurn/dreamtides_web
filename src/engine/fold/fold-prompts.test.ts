/**
 * Prompts and their answers: empty candidate sets, the step context's
 * validation of prompts, answers, and cancellability, and constrained
 * arrangements.
 */
import { describe, expect, it } from "vitest";
import { firstLegalAnswer } from "../prompts/answers";
import type { ChooseNumberPrompt, Prompt } from "../prompts/types";
import { stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import { Context } from "../steps/context";
import { IllegalAnswer } from "../steps/errors";
import { ScriptedSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { v, p, deck, emptyPrompt, MALFORMED, engine, fold, slice, applied, pendingOf, play } from "./fold.fixtures";

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

describe("answers from an answer source", () => {
  it("rejects an illegal answer from the source and leaves the committed state untouched", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [p.drawX.id], energy: 2, deck },
      enemy: { deck },
    });
    const before = stateHash(state);
    const action = { kind: "play", card: ids.player.hand[0], from: "hand" } as const;
    expect(() => engine.apply(state, "player", action, new ScriptedSource([3]))).toThrow(IllegalAnswer);
    expect(stateHash(state)).toBe(before);
    expect(engine.apply(state, "player", action, new ScriptedSource([2])).state.sides.player.hand).toHaveLength(2);
  });

  it("marks only the cancelling side's prompts before the commit point cancellable", () => {
    const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { deck }, enemy: { deck } });
    const seen: Prompt[] = [];
    const ctx = new Context(state, engine.catalog, {
      answer(prompt) {
        seen.push(prompt);
        return firstLegalAnswer(prompt);
      },
    }, { canceller: "player" });
    const ask = (side: Side) =>
      ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side, purpose: { source: null, cardId: null, ability: null, role: "chooseX" }, min: 0, max: 1 });
    ask("player");
    ask("enemy");
    ctx.commitPoint();
    ask("player");
    expect(seen.map((prompt) => [prompt.side, prompt.cancellable])).toEqual([["player", true], ["enemy", false], ["player", false]]);
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
