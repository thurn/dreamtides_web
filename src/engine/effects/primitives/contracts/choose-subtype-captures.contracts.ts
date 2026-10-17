import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { anyCharacter, cardsMovedBy, costOf, energy, event, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { resolveEffect } from "../../interpreter";
import { effectiveSpark } from "../../../rules/spark";
import type { InstanceId, Side } from "../../../state/ids";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { ResolvingEffect } from "../../registry";
import { chooseOne } from "../choose-one";
import { forDuration } from "../for-duration";
import { grant } from "../grant";
import { sparkModifier } from "../spark-modifier";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { drawMatching } from "../draw-matching";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { sequence } from "../sequence";

const mage: EngineCardDefinition = {
  id: syntheticId(0x7780), cardType: "character", costs: [energy(3)], spark: 2,
  subtype: "Mage", speed: "standard", status: "vanilla", abilities: () => [],
};
const other: EngineCardDefinition = { ...mage, id: syntheticId(0x7781), subtype: "Warrior" };
function fixture(effect: ResolvingEffect, side: Side, failAfter = false) {
  const card: EngineCardDefinition = {
    id: syntheticId(0x7782), cardType: "event", costs: [energy(1)], spark: null,
    subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)],
    ...(failAfter ? { synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, effect, {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after chosen-subtype captures");
    } } } satisfies Pick<EngineCardDefinition, "synthetic"> : {}),
  };
  const engine = createEngine(testCatalog([mage, other, card]));
  const board = { active: side, phase: "day" as const, [side]: { hand: [card.id], back: [mage.id, mage.id], deck: [other.id, mage.id], energy: 2 } };
  const mode = engine.catalog.characterTypes.indexOf("Mage");
  return { engine, board, mode };
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}

describe("chooseSubtype graph bindings", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`captures a chosen-type draw's copiable cost for ${side}`, () => {
      const draw = drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE });
      const effect = chooseSubtype({ then: sequence(draw, gainPoints(costOf(cardsMovedBy(draw)))) });
      const { engine, board, mode } = fixture(effect, side);
      const snapshot = JSON.stringify(effect);
      Object.freeze(draw.filter);
      Object.freeze(draw);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode] });
      expect(result.state.sides[side].hand).toEqual([result.ids[side].deck[1]]);
      expect(result.state.sides[side].score).toBe(3);
      expect(JSON.stringify(effect)).toBe(snapshot);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it(`retains nested and enclosing captures through saved-step replay for ${side}`, () => {
      const draw = drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE });
      const subject = target(anyCharacter({ subtype: CHOSEN_SUBTYPE }));
      const effect = sequence(chooseSubtype({ then: sequence(draw,
        chooseSubtype({ then: sequence(gainPoints(costOf(cardsMovedBy(draw))), gainSpark(subject, 1), gainSpark(subject, 2)) }),
      ) }), gainPoints(costOf(cardsMovedBy(draw))));
      const { engine, board, mode } = fixture(effect, side);
      const { state, ids } = boardState(engine.catalog, board);
      const snapshot = JSON.stringify(state);
      const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      let current = applied(fold.reduce(start, { kind: "battleAction", side, action: playFromHand(ids, side).action }));
      const answer = (value: number | readonly InstanceId[]) => {
        const prompt = fold.pending(current)!.prompt;
        current = applied(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value }));
      };
      answer(mode);
      expect(fold.pending(current)!.display.sides[side].hand).toEqual([ids[side].deck[1]]);
      answer(mode);
      const pending = fold.pending(current)!.prompt;
      const reloaded = JSON.parse(JSON.stringify(current)) as BattleSlice;
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(fresh.pending(reloaded)!.prompt).toEqual(pending);
      const intent = { kind: "answer" as const, side, promptId: pending.id, value: [ids[side].back[0]!] };
      expect(fresh.reduce(reloaded, { ...intent, side: side === "player" ? "enemy" : "player" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      expect(fresh.reduce(reloaded, { ...intent, value: [ids[side].deck[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
      expect(fresh.reduce(reloaded, { kind: "cancel", side, promptId: pending.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
      expect(fresh.reduce(reloaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      const result = fresh.reduce(reloaded, intent);
      const done = applied(result);
      expect(result).toEqual(fold.reduce(current, intent));
      expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const scenario = runScenario(engine, {
        board, steps: placed => [playFromHand(placed, side)], answers: () => [mode, mode, [ids[side].back[0]!]],
      });
      expect(done.committed).toEqual(scenario.state);
      expect(done.committed.sides[side].score).toBe(6);
      expect(done.committed.sides[side].hand).toEqual([ids[side].deck[1]]);
      expect(effectiveSpark(done.committed, engine.catalog, ids[side].back[0]!)).toBe(5);
      expect(JSON.stringify(state)).toBe(snapshot);
      expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
    });

    it(`rolls captured gameplay back after a mid-step error and replay for ${side}`, () => {
      const draw = drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE });
      const effect = chooseSubtype({ then: sequence(draw, gainPoints(costOf(cardsMovedBy(draw))),
        chooseSubtype({ then: gainSpark(target(anyCharacter({ subtype: CHOSEN_SUBTYPE })), 1) })) });
      const { engine, board, mode } = fixture(effect, side, true);
      const { state, ids } = boardState(engine.catalog, board);
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      let current = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
        { kind: "battleAction", side, action: playFromHand(ids, side).action }));
      for (let choice = 0; choice < 2; choice++) {
        const prompt = fold.pending(current)!.prompt;
        current = applied(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value: mode }));
        expect(fold.pending(current)!.display.sides[side].score).toBe(3);
      }
      const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      const prompt = fresh.pending(saved)!.prompt;
      const intent = { kind: "answer" as const, side, promptId: prompt.id, value: [ids[side].back[0]!] };
      const failed = fresh.reduce(saved, intent);
      expect(failed).toEqual(fold.reduce(current, intent));
      if (failed.kind !== "applied") throw new Error("expected failed step recovery");
      expect(failed.error).not.toBeNull();
      expect(failed.published).toEqual([]);
      expect(failed.slice.inFlight).toBeNull();
      expect(failed.slice.committed.sides[side]).toEqual(current.committed.sides[side]);
      expect(failed.slice.committed.instances).toEqual(current.committed.instances);
    });

    it(`reuses an enclosing mode when its chosen-type subtree is substituted for ${side}`, () => {
      const modal = chooseOne(drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE }), gainPoints(9));
      const { engine, board, mode } = fixture(sequence(modal, chooseSubtype({ then: modal })), side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [0, mode] });
      expect(result.state.sides[side].hand).toEqual([result.ids[side].deck[1]]);
      expect(result.state.sides[side].score).toBe(0);
      expect(result.answers).toHaveLength(2);
    });

    it(`reuses an enclosing target across chosen-type replacement for ${side}`, () => {
      const subject = target(anyCharacter({ anyOf: [{ subtype: CHOSEN_SUBTYPE }, { subtype: "Mage" }] }));
      const effect = sequence(gainSpark(subject, 1), chooseSubtype({ then: gainSpark(subject, 2) }));
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, {
        board, steps: ids => [playFromHand(ids, side)], answers: ids => [[ids[side].back[0]!], mode],
      });
      expect(result.answers).toHaveLength(2);
      expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[0]!)).toBe(5);
      expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[1]!)).toBe(2);
    });

    it(`joins substituted changes to one enclosing payable duration for ${side}`, () => {
      const subject = target(anyCharacter({ subtype: CHOSEN_SUBTYPE }));
      const effect = forDuration({ duration: "untilOpponentPays", cost: 2 }, chooseSubtype({ then: sequence(sparkModifier(subject, 2), grant(subject, "vengeful")) }));
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: ids => [mode, [ids[side].back[0]!]] });
      expect(result.state.floating).toHaveLength(2);
      expect(result.state.floating[0].expiry).toMatchObject({ at: "paid" });
      expect(result.state.floating[0].expiry).toEqual(result.state.floating[1].expiry);
      expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[0]!)).toBe(4);
    });

    it(`keeps a captured draw and trailing effect when the chosen type has no legal target for ${side}`, () => {
      const draw = drawMatching({ cardType: "character", subtype: CHOSEN_SUBTYPE });
      const effect = chooseSubtype({ then: sequence(draw, gainSpark(target(anyCharacter({ subtype: CHOSEN_SUBTYPE })), 1), gainPoints(costOf(cardsMovedBy(draw)))) });
      const { engine, board } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [engine.catalog.characterTypes.indexOf("Warrior")] });
      expect(result.answers).toHaveLength(1);
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(true);
      expect(result.state.sides[side].score).toBe(3);
      expect(result.state.sides[side].hand).toEqual([result.ids[side].deck[0]]);
    });

    for (const shared of [true, false]) {
      it(`keeps ${shared ? "shared" : "distinct equal-looking"} chosen-type target references for ${side}`, () => {
        const first = target(anyCharacter({ subtype: CHOSEN_SUBTYPE }));
        const second = shared ? first : target(anyCharacter({ subtype: CHOSEN_SUBTYPE }));
        const effect = chooseSubtype({ then: sequence(gainSpark(first, 1), gainSpark(second, 2)) });
        const { engine, board, mode } = fixture(effect, side);
        const result = runScenario(engine, {
          board, steps: ids => [playFromHand(ids, side)],
          answers: ids => [mode, [ids[side].back[0]!], ...(shared ? [] : [[ids[side].back[1]!]])],
        });
        expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[0]!)).toBe(shared ? 5 : 3);
        expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[1]!)).toBe(shared ? 2 : 4);
        expect(result.answers).toHaveLength(shared ? 2 : 3);
      });
    }
  }
});
