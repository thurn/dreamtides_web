/** Public lab fixtures supply the resources that the printed additional costs can pay. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { abandonCost, abandonXCost, activated, additionalCost, banishFromVoidCost, choiceCost, discardCostFilter, discardHandCost, event, optionalCost, pointsCost, revealCost, target, enemyCharacter, energy, x } from "../dsl/builders";
import type { AdditionalCost } from "../dsl/types";
import { createEngine } from "../engine";
import { dissolve, gainPoints, sequence } from "../effects/primitives";
import type { InstanceId } from "../state/ids";
import { invariantViolations } from "./invariants";
import { cardLabBattle } from "./card-lab";
import { boardState } from "./board";
import { labBoard } from "./lab-solver";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";
import { CHOSEN_HAND_BANISH_CARDS, HAND_BANISH } from "./chosen-hand-banish-cards";

const mage: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(1900), subtype: "Mage" };
const warrior = SYNTHETIC.vanilla1;
const fillerEvent = SYNTHETIC.event1;
const pool = [mage, warrior, fillerEvent];
function source(index: number, costs: readonly AdditionalCost[], targeting = false): EngineCardDefinition {
  return {
    ...SYNTHETIC.event1, id: syntheticId(index), status: "authored",
    abilities: () => [additionalCost(...costs), event(targeting
      ? sequence(dissolve(target(enemyCharacter({ subtype: "Mage" }))), gainPoints(1))
      : gainPoints(1))],
  };
}

for (const side of ["player", "enemy"] as const) {
  describe(`additional-cost lab staging as ${side}`, () => {
    it("preserves controlled figment cost resources across setup reconstruction and card-lab creation", () => {
      const card: EngineCardDefinition = { ...mage, id: syntheticId(0x51210), abilities: () => [activated([energy(1), abandonXCost({ selector: { figment: true }, min: 1 })], dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() }))))] };
      const engine = createEngine(testCatalog([mage, card]));
      const solved = labBoard(engine, card.id, pool, side);
      const reconstructed = boardState(engine.catalog, solved.setup).state;
      const stagedFigments = (state: typeof reconstructed) => Object.values(state.instances).filter(instance => instance.controller === side && instance.printing.kind === "figmentCopy");
      expect(stagedFigments(reconstructed)).toHaveLength(1);
      for (const back of [[], [warrior.id]]) {
        const declared = labBoard(engine, card.id, pool, side, { [side]: { back } });
        const rebuilt = boardState(engine.catalog, declared.setup).state;
        expect(stagedFigments(rebuilt)).toHaveLength(0);
        expect(rebuilt.sides[side].backRank.filter(id => id !== null)).toHaveLength(back.length);
      }
      const otherRank = labBoard(engine, card.id, pool, side, { [side]: { front: [warrior.id] } });
      expect(stagedFigments(boardState(engine.catalog, otherRank.setup).state)).toHaveLength(1);
      const explicit = labBoard(engine, card.id, pool, side, { [side]: { back: [], figments: [{ slot: { rank: "front", index: 0 }, printing: { kind: "figmentCopy", cardId: warrior.id, spark: null } }] } });
      const explicitState = boardState(engine.catalog, explicit.setup).state;
      expect(stagedFigments(explicitState)).toHaveLength(1);
      expect(explicitState.sides[side].frontRank[0]).not.toBeNull();
      const lab = cardLabBattle(engine, { entry: { cardId: card.id }, side, variant: "base" }, pool);
      expect(stagedFigments(lab.slice.committed)).toHaveLength(1);
      const play = engine.apply(reconstructed, side, { kind: "play", card: reconstructed.sides[side].hand[0], from: "hand" }, { answer() { throw new Error("Unexpected prompt"); } });
      const ready = play.state;
      const sourceId = Object.values(ready.instances).find(instance => instance.printing.kind === "card" && instance.printing.cardId === card.id)!.id;
      const result = engine.apply(ready, side, { kind: "activate", source: sourceId, ability: 0 }, { answer(prompt) {
        if (prompt.kind === "chooseNumber") return 1;
        if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
        throw new Error(`Unexpected ${prompt.kind}`);
      } });
      expect(result.events.filter(event => event.kind === "abandoned")).toHaveLength(1);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    });

    it.each([HAND_BANISH.freeCard, HAND_BANISH.paidCharacter])("stages a matching chosen-hand duration candidate for $id", (source) => {
      const engine = createEngine(testCatalog(CHOSEN_HAND_BANISH_CARDS));
      const { state } = labBoard(engine, source.id, [SYNTHETIC.event0, SYNTHETIC.vanilla1], side);
      const played = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, {
        answer(prompt) {
          if (prompt.kind !== "chooseCards") throw new Error(`Unexpected ${prompt.kind}`);
          return [prompt.candidates[0]];
        },
      });
      const banished = played.events.find((event) => event.kind === "banished");
      expect(banished?.kind).toBe("banished");
      if (banished?.kind !== "banished") throw new Error("missing chosen banishment");
      expect(played.state.floating).toContainEqual(expect.objectContaining({
        source: state.sides[side].hand[0], expiry: { at: "sourceLeavesPlay", source: state.sides[side].hand[0] },
        change: { kind: "banishedToHandUntil", instance: banished.instance, banishedAt: played.state.instances[banished.instance].enteredZoneAt },
      }));
      expect(invariantViolations(played.state, engine.catalog)).toEqual([]);
    });
    it.each([2, 3])("stages and pays a variable discard's declared minimum %i", (min) => {
      const card = source(4690 + min, [discardCostFilter({ cardType: "character", subtype: "Mage" }, { count: "x", min })]);
      const engine = createEngine(testCatalog([mage, card]));
      const { state } = labBoard(engine, card.id, pool, side);
      const sourceId = state.sides[side].hand[0];
      const paid = engine.apply(state, side, { kind: "play", card: sourceId, from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "chooseCards") return prompt.candidates.slice(0, min);
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(paid.events.filter((event) => event.kind === "discarded")).toHaveLength(min);
      expect(paid.state.sides[side].score).toBe(1);
      expect(invariantViolations(paid.state, engine.catalog)).toEqual([]);
      expect(state.instances[sourceId].zone).toBe("hand");
    });

    it.each([
      { label: "omitted minimum", cost: discardCostFilter({}, { count: "x" }) },
      { label: "zero minimum", cost: discardCostFilter({}, { count: "x", min: 0 }) },
      { label: "fixed discard", cost: discardCostFilter({}, { count: 2 }) },
      { label: "whole hand", cost: discardHandCost() },
      { label: "reveal", cost: revealCost(2) },
    ])("preserves public $label payment", ({ cost }) => {
      const card = source(4698, [cost]);
      const engine = createEngine(testCatalog([mage, card]));
      const { state } = labBoard(engine, card.id, pool, side);
      const sourceId = state.sides[side].hand[0];
      const before = [...state.sides[side].hand];
      const eligible = before.filter((id) => id !== sourceId);
      let chosen: readonly InstanceId[] = [];
      const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
      const paid = engine.apply(prepared, side, { kind: "play", card: sourceId, from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "chooseCards") {
            chosen = prompt.candidates.slice(0, prompt.min);
            return chosen;
          }
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      const expected = cost.cost !== "discard" ? [] : cost.count === "hand" ? eligible : chosen;
      expect(paid.events.flatMap((event) => event.kind === "discarded" ? [event.instance] : [])).toEqual(expected);
      for (const id of expected) expect(paid.state.instances[id].zone).toBe("void");
      expect(paid.state.sides[side].hand).toEqual(eligible.filter((id) => !expected.includes(id)));
      if (cost.cost === "discard" && cost.count === 2) expect(chosen).toHaveLength(2);
      if (cost.cost === "reveal") {
        expect(chosen).toHaveLength(2);
        expect(paid.events.flatMap((event) => event.kind === "revealed" ? event.instances : [])).toEqual(chosen);
      }
      expect(paid.state.sides[side].score).toBe(1);
      expect(invariantViolations(paid.state, engine.catalog)).toEqual([]);
      expect(state.sides[side].hand).toEqual(before);
      expect(state.instances[sourceId].zone).toBe("hand");
    });

    it("makes both filtered abandon and discard alternatives payable, and pays only the chosen one", () => {
      const card = source(1901, [choiceCost(
        [abandonCost({ subtype: "Mage", sparkAtLeast: 2, costAtMost: 2 }, 2)],
        [discardCostFilter({ cardType: "event", costAtMost: 1 }, { count: 2 })],
      )]);
      const engine = createEngine(testCatalog([mage, card]));
      for (const mode of [0, 1]) {
        const { state } = labBoard(engine, card.id, pool, side);
        const source = state.sides[side].hand[0];
        const played = engine.apply(state, side, { kind: "play", card: source, from: "hand" }, {
          answer(prompt) {
            if (prompt.kind === "chooseMode") {
              expect(prompt.options.map((option) => option.legal)).toEqual([true, true]);
              return mode;
            }
            if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
            throw new Error(`Unexpected ${prompt.kind}`);
          },
        });
        expect(played.events.filter((event) => event.kind === "abandoned")).toHaveLength(mode === 0 ? 2 : 0);
        expect(played.events.filter((event) => event.kind === "discarded")).toHaveLength(mode === 1 ? 2 : 0);
        expect(played.state.sides[side].score).toBe(1);
        expect(invariantViolations(played.state, engine.catalog)).toEqual([]);
        expect(state.instances[source].zone).toBe("hand");
      }
    });

    it("pays compounded required and optional costs with matching distinct hand cards and own characters", () => {
      const card = source(1902, [
        abandonCost({ subtype: "Mage" }),
        discardCostFilter({ cardType: "character", subtype: "Mage" }, { count: 2 }),
        optionalCost(
          discardCostFilter({ cardType: "event" }),
          revealCost(2, { cardType: "character", subtype: "Mage" }),
        ),
      ]);
      const engine = createEngine(testCatalog([mage, card]));
      const { state } = labBoard(engine, card.id, pool, side);
      let optionalOffered = false;
      let revealed: readonly InstanceId[] = [];
      const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
      const played = engine.apply(prepared, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "confirm") {
            optionalOffered = true;
            return true;
          }
          if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") {
            const selected = prompt.candidates.slice(0, prompt.min);
            if (prompt.purpose.role === "revealCost") revealed = selected;
            return selected;
          }
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(optionalOffered).toBe(true);
      expect(played.events.filter((event) => event.kind === "abandoned")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "discarded")).toHaveLength(3);
      expect(revealed).toHaveLength(2);
      for (const id of revealed) expect(played.state.sides[side].hand).toContain(id);
      expect(played.events.flatMap((event) => event.kind === "revealed" ? event.instances : [])).toEqual(revealed);
      expect(played.state.sides[side].score).toBe(1);
      expect(invariantViolations(played.state, engine.catalog)).toEqual([]);
    });

    it("retains targeted opponents, void banishes and points while staging new hand and character costs", () => {
      const card = source(1903, [
        abandonCost({ subtype: "Mage" }),
        discardCostFilter({ cardType: "character", subtype: "Warrior" }),
        revealCost(1, { cardType: "event" }),
        banishFromVoidCost(2, { cardType: "event" }),
        pointsCost(2),
      ], true);
      const engine = createEngine(testCatalog([mage, card]));
      const { state } = labBoard(engine, card.id, pool, side);
      let targets: readonly InstanceId[] = [];
      const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
      const played = engine.apply(prepared, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") {
            const selected = prompt.candidates.slice(0, prompt.min);
            if (prompt.kind === "chooseTargets") targets = selected;
            return selected;
          }
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(played.events.filter((event) => event.kind === "abandoned")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "discarded")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "banished")).toHaveLength(2);
      expect(targets).toHaveLength(1);
      for (const id of targets) expect(played.state.instances[id].zone).not.toBe("play");
      expect(played.state.sides[side].score).toBe(1);
      expect(invariantViolations(played.state, engine.catalog)).toEqual([]);
    });
  });
}
