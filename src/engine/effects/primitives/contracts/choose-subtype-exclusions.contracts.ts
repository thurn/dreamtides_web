import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, cardsMovedBy, costOf, energy, event, self, staticAbility, target } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { effectiveSpark } from "../../../rules/spark";
import type { Side } from "../../../state/ids";
import { boardState, type BoardSetup } from "../../../testing/board";
import type { ResolvingEffect } from "../../registry";
import { createEngine } from "../../../engine";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { exhaust } from "../exhaust";
import { giveAllTypes } from "../give-all-types";
import { gainSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const mage: EngineCardDefinition = {
  id: syntheticId(0x7800), cardType: "character", costs: [energy(1)], spark: 2,
  subtype: "Mage", speed: "standard", status: "vanilla", abilities: () => [],
};
const warrior: EngineCardDefinition = { ...mage, id: syntheticId(0x7801), subtype: "Warrior" };

const shifter: EngineCardDefinition = { ...mage, id: syntheticId(0x7803), subtype: "*", status: "authored",
  abilities: () => [staticAbility(giveAllTypes(self()))],
};
function fixture(effect: ResolvingEffect, side: Side, back = [mage.id, warrior.id, warrior.id, shifter.id]) {
  const spell: EngineCardDefinition = { id: syntheticId(0x7802), cardType: "event", costs: [energy(1)], spark: null,
    subtype: "", speed: "fast", status: "authored", abilities: () => [event(effect)],
  };
  const engine = createEngine(testCatalog([mage, warrior, shifter, spell]));
  const board: BoardSetup = { active: side, phase: "day", [side]: { hand: [spell.id], back, energy: 3 } };
  return { engine, board, mode: engine.catalog.characterTypes.indexOf("Mage") };
}
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}

describe("chosen subtype exclusions", () => {
  for (const side of ["player", "enemy"] as const) {
    it(`leaves the chosen type untouched and exhausts the other UUID for ${side}`, () => {
      const effect = chooseSubtype({ then: exhaust(all(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }))) });
      const { engine, board, mode } = fixture(effect, side);
      const snapshot = JSON.stringify(effect);
      Object.freeze(effect.then);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode] });
      expect(result.ids[side].back.map(id => result.state.instances[id!].status.exhausted)).toEqual([false, true, true, false]);
      expect(JSON.stringify(effect)).toBe(snapshot);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it(`preserves literal exclusions and an instruction without a type choice for ${side}`, () => {
      const effect = sequence(exhaust(all(anyCharacter({ notSubtype: "Warrior" }))),
        chooseSubtype({ then: gainSpark(all(anyCharacter({ subtype: CHOSEN_SUBTYPE, notSubtype: "Warrior" })), 1) }));
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode] });
      expect(result.ids[side].back.map(id => result.state.instances[id!].status.exhausted)).toEqual([true, false, false, false]);
      expect(result.ids[side].back.map(id => effectiveSpark(result.state, engine.catalog, id!))).toEqual([3, 2, 2, 2]);
    });

    it(`continues when the chosen exclusion leaves no eligible target for ${side}`, () => {
      const effect = chooseSubtype({ then: sequence(exhaust(target(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }))), gainPoints(1)) });
      const { engine, board, mode } = fixture(effect, side, [mage.id, shifter.id]);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode] });
      expect(result.answers).toHaveLength(1);
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(true);
      expect(result.state.sides[side].score).toBe(1);
      expect(result.ids[side].back.every(id => !result.state.instances[id!].status.exhausted)).toBe(true);
    });

    for (const shared of [true, false]) {
      it(`retains ${shared ? "shared" : "distinct"} exclusion targets through saved choice and intent replay for ${side}`, () => {
        const first = target(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }));
        const second = shared ? first : target(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }));
        const effect = chooseSubtype({ then: sequence(gainSpark(first, 1), gainSpark(second, 2)) });
        const snapshot = JSON.stringify(effect);
        Object.freeze(first.selector);
        Object.freeze(first);
        const { engine, board, mode } = fixture(effect, side);
        const { state, ids } = boardState(engine.catalog, board);
        const initial = JSON.stringify(state);
        const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
        let fold = createFoldAdapter(engine, { checkEventPrefix: true });
        let current = start;
        const intents: BattleIntent[] = [];
        const publications: unknown[] = [];
        const reduce = (intent: BattleIntent) => {
          const result = fold.reduce(current, intent);
          current = applied(result);
          intents.push(intent);
          if (result.kind === "applied") publications.push(...result.published);
        };
        reduce({ kind: "battleAction", side, action: playFromHand(ids, side).action });
        reduce({ kind: "answer", side, promptId: fold.pending(current)!.prompt.id, value: mode });
        const pending = fold.pending(current)!.prompt;
        expect(pending.kind).toBe("chooseTargets");
        if (pending.kind !== "chooseTargets") throw new Error("expected exclusion targets");
        expect(pending.candidates).toEqual([ids[side].back[1], ids[side].back[2]]);
        const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
        fold = createFoldAdapter(engine, { checkEventPrefix: true });
        expect(fold.pending(saved)!.prompt).toEqual(pending);
        current = saved;
        const answer = { kind: "answer" as const, side, promptId: pending.id, value: [ids[side].back[1]!] };
        expect(fold.reduce(current, { ...answer, value: [ids[side].back[0]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        reduce(answer);
        if (!shared) reduce({ kind: "answer", side, promptId: fold.pending(current)!.prompt.id, value: [ids[side].back[2]!] });
        expect(effectiveSpark(current.committed, engine.catalog, ids[side].back[1]!)).toBe(shared ? 5 : 3);
        expect(effectiveSpark(current.committed, engine.catalog, ids[side].back[2]!)).toBe(shared ? 2 : 4);
        let replay = start;
        const replayEvents: unknown[] = [];
        const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
        for (const intent of intents) {
          const result = fresh.reduce(replay, intent);
          replay = applied(result);
          if (result.kind === "applied") replayEvents.push(...result.published);
        }
        expect(replay).toEqual(current);
        expect(replayEvents).toEqual(publications);
        expect(JSON.stringify(effect)).toBe(snapshot);
        expect(JSON.stringify(state)).toBe(initial);
        expect(invariantViolations(current.committed, engine.catalog)).toEqual([]);
      });
    }

    it(`rechecks a shared exclusion target after it gains all types for ${side}`, () => {
      const subject = target(anyCharacter({ notSubtype: CHOSEN_SUBTYPE }));
      const effect = chooseSubtype({ then: sequence(giveAllTypes(subject), gainSpark(subject, 3)) });
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: ids => [mode, [ids[side].back[1]!]] });
      expect(effectiveSpark(result.state, engine.catalog, result.ids[side].back[1]!)).toBe(2);
      expect(result.answers).toHaveLength(2);
      expect(result.events.some(event => event.kind === "noLegalTarget")).toBe(true);
    });

    it(`retains a moved-card capture for the exclusion instruction for ${side}`, () => {
      const move = returnToHand(all(anyCharacter({ notSubtype: CHOSEN_SUBTYPE })));
      const effect = chooseSubtype({ then: sequence(move, gainPoints(costOf(cardsMovedBy(move)))) });
      const { engine, board, mode } = fixture(effect, side);
      const result = runScenario(engine, { board, steps: ids => [playFromHand(ids, side)], answers: () => [mode] });
      expect(result.state.sides[side].hand).toEqual([result.ids[side].back[1], result.ids[side].back[2]]);
      expect(result.state.instances[result.ids[side].back[0]!].zone).toBe("play");
      expect(result.state.instances[result.ids[side].back[3]!].zone).toBe("play");
      expect(result.state.sides[side].score).toBe(2);
    });

    it(`binds a static exclusion to its source's choice while preserving all-types semantics for ${side}`, () => {
      const source: EngineCardDefinition = { ...mage, id: syntheticId(0x7804), status: "authored", abilities: () => [
        triggered(onMaterialized(), chooseSubtype({ self: true })),
        staticAbility(sparkModifier(all(anyCharacter({ notSubtype: CHOSEN_SUBTYPE })), 1)),
      ] };
      const engine = createEngine(testCatalog([mage, warrior, shifter, source]));
      const result = runScenario(engine, {
        board: { active: side, phase: "day", [side]: { back: [source.id, mage.id, warrior.id, shifter.id], hand: [source.id], energy: 3 } },
        steps: ids => [playFromHand(ids, side)], answers: () => [engine.catalog.characterTypes.indexOf("Mage")],
      });
      expect(result.ids[side].back.map(id => effectiveSpark(result.start, engine.catalog, id!))).toEqual([2, 2, 2, 2]);
      expect(result.ids[side].back.map(id => effectiveSpark(result.state, engine.catalog, id!))).toEqual([2, 2, 3, 2]);
      expect(effectiveSpark(result.state, engine.catalog, result.ids[side].hand[0])).toBe(2);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });
  }
});
