/**
 * Contracts of the Expert policy, for either side: it answers top-level
 * decisions with a legal action and prompts with a legal answer, the same
 * request always gets the same answer, overrides rule out a card's plays,
 * and Day repositions are valued once per distinct destination.
 */
import { describe, expect, it } from "vitest";
import { isLegalAnswer } from "../prompts/answers";
import type { Prompt } from "../prompts/types";
import { allowedBy } from "../rules/actions";
import { battleSeed, opponent, SIDES } from "../state/ids";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { runPolicy } from "./decide";
import { distinctDayActions } from "./expert";
import { overridden } from "./expert-overrides";
import { board, deck, engine, entries, topLevelRequest } from "./policy.fixtures";

const { vanilla1, vanilla3, vanilla5, dissolveVictim } = SYNTHETIC;
const decklists = { player: entries(deck), enemy: entries(deck) };

describe("the Expert policy", () => {
  for (const side of SIDES) {
    it(`answers its Day, its Dusk and a prompt legally and reproducibly, for ${side}`, () => {
      const other = opponent(side);
      const day = board({ active: side, phase: "day", [side]: { deck, hand: [vanilla3.id, dissolveVictim.id], back: [vanilla1.id], energy: 3 }, [other]: { deck, front: [vanilla1.id] } }).state;
      const dusk = engine.apply(board({ active: other, phase: "day", [side]: { deck, back: [null, null, vanilla5.id] }, [other]: { deck, front: [vanilla3.id] } }).state, other, { kind: "pass" }, { answer: () => { throw new Error("no prompt"); } }).state;
      for (const state of [day, dusk]) {
        const request = topLevelRequest(state, side, "expert", decklists, { iterations: 64 });
        const result = runPolicy(engine, request);
        expect(result.choice.kind).toBe("action");
        if (result.choice.kind === "action") {
          const { action } = result.choice;
          expect(engine.legalActions(state, side).some((legal) => allowedBy(legal, action, state))).toBe(true);
        }
        expect(result.trace.policy).toBe("expert");
        expect(runPolicy(engine, request).choice).toEqual(result.choice);
      }
      const prompt: Prompt = { side, cancellable: false, kind: "chooseTargets", purpose: { source: null, cardId: null, ability: null, role: "target" }, candidates: [], min: 0, max: 0 };
      const answered = runPolicy(engine, { ...topLevelRequest(day, side, "expert", decklists), decision: { kind: "prompt", prompt }, seed: battleSeed("expert-prompt") });
      expect(answered.choice.kind === "answer" && isLegalAnswer(prompt, answered.choice.value)).toBe(true);
    });

    it(`keeps one Day reposition per distinct destination, for ${side}`, () => {
      const { state } = board({ active: side, phase: "day", [side]: { deck, back: [vanilla1.id, null, null, vanilla1.id] }, [opponent(side)]: { deck, front: [null, vanilla3.id] } });
      const legal = engine.legalActions(state, side);
      const kept = distinctDayActions(state, legal, side);
      const mover = state.sides[side].backRank[0];
      const front = kept.filter((action) => action.kind === "reposition" && action.card === mover && action.to.rank === "front");
      // Lane 0 holds its own support, lane 1 an enemy, lanes 2 and 3 the other character's support, lane 4 stands for every bare lane.
      expect(front.map((action) => action.kind === "reposition" ? action.to.index : null)).toEqual([0, 1, 2, 3, 4]);
      expect(kept.filter((action) => action.kind !== "reposition")).toEqual(legal.filter((action) => action.kind !== "reposition"));
    });
  }

  it("rules out the plays of an overridden card only", () => {
    const { state, ids } = board({ active: "player", phase: "day", player: { deck, hand: [vanilla1.id, vanilla3.id], energy: 3 } });
    const view = engine.view(state, "player");
    const [banned, allowed] = ids.player.hand;
    const overrides = [{ cardId: vanilla1.id, rule: "neverPlay" as const, note: "synthetic" }];
    expect(overridden(view, { kind: "play", card: banned ?? "i0", from: "hand" }, overrides)).toBe(true);
    expect(overridden(view, { kind: "play", card: allowed ?? "i0", from: "hand" }, overrides)).toBe(false);
    expect(overridden(view, { kind: "pass" }, overrides)).toBe(false);
  });
});
