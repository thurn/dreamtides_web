import { describe, expect, it } from "vitest";
import { enemyCharacter, target } from "../../../dsl/builders";
import { createFoldAdapter } from "../../../fold/slice";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { chosenModes, collectTargets, everyNode, everyTarget } from "../../interpreter";
import { banish } from "../banish";
import { chooseOne } from "../choose-one";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { engine, v, deck, dissolveOrBanish } from "./flow-support";

describe("flow primitives", () => {
  it("chooseOne chooses its mode at play time, before the commit point and before targets", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.chooseDissolveOrPoints.id], deck },
      enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck },
    });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = fold.reduce(
      { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side: "player", action: { kind: "play", card: state.sides.player.hand[0], from: "hand" } },
    );
    if (opened.kind !== "applied") throw new Error("play bounced");
    expect(fold.pending(opened.slice)?.prompt).toMatchObject({
      kind: "chooseMode",
      cancellable: true,
      options: [{ mode: 0, legal: true }, { mode: 1, legal: true }],
    });
  });

  it("a targeted mode collects its target at play time and resolves against it", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDissolveOrPoints.id], deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [0, [ids.enemy.back[1]!]],
    });
    expect(state.instances[ids.enemy.back[1]!]?.zone).toBe("void");
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(state.sides.player.score).toBe(0);
  });

  it("a mode whose required target has no candidate is not legal", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDissolveOrPoints.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    // The only legal mode is answered automatically.
    expect(answers[0]).toMatchObject({ value: 1, auto: true });
    expect(state.sides.player.score).toBe(1);
    const { state: noTargets } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [dissolveOrBanish.id], deck },
      enemy: { deck },
    });
    expect(engine.legalActions(noTargets, "player").some((action) => action.kind === "play")).toBe(false);
  });

  it("splits a card's modes and targets among its event abilities", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.modalThenBounce.id], back: [v.vanilla1.id], deck }, enemy: { back: [v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      // Mode 1 dissolves the only enemy (answered automatically); the bounce takes the player's character.
      answers: (ids) => [1, [ids.player.back[0]!]],
    });
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("void");
    expect(state.instances[ids.player.back[0]!]?.zone).toBe("hand");
    expect(state.sides.player.score).toBe(0);
  });

  it("collects only the chosen mode's targets, while validation walks every mode", () => {
    const first = target(enemyCharacter());
    const second = target(enemyCharacter());
    const effect = chooseOne(dissolve(first), gainPoints(1), banish(second));
    expect(collectTargets(effect, chosenModes(effect, [2]))).toEqual([second]);
    expect(collectTargets(effect, chosenModes(effect, [1]))).toEqual([]);
    expect(everyTarget(effect)).toEqual([first, second]);
    expect(everyNode(effect)).toHaveLength(4);
    expect(() => chosenModes(effect, [3])).toThrow();
  });

  it("chooseOne resolves only the chosen mode", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDrawOrPoints.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [1],
    });
    expect(state.sides.player).toMatchObject({ score: 1, hand: [] });
  });
});
