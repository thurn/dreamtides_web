/** Public lab fixtures supply the resources that the printed additional costs can pay. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { abandonCost, additionalCost, banishFromVoidCost, choiceCost, discardCostFilter, event, optionalCost, pointsCost, revealCost, target, enemyCharacter } from "../dsl/builders";
import type { AdditionalCost } from "../dsl/types";
import { createEngine } from "../engine";
import { dissolve, gainPoints, sequence } from "../effects/primitives";
import type { Side } from "../state/ids";
import { invariantViolations } from "./invariants";
import { labBoard } from "./lab-solver";
import { SYNTHETIC, syntheticId, testCatalog } from "./synthetic-cards";

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
      const played = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "confirm") {
            optionalOffered = true;
            return true;
          }
          if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(optionalOffered).toBe(true);
      expect(played.events.filter((event) => event.kind === "abandoned")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "discarded")).toHaveLength(3);
      // Revealed cards stay in hand after the two required Mage discards.
      expect(played.state.sides[side].hand).toHaveLength(2);
      expect(played.state.sides[side].hand.every((id) => engine.catalog.card(played.state.instances[id].printing.kind === "card" ? played.state.instances[id].printing.cardId : fillerEvent.id).subtype === "Mage")).toBe(true);
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
      const played = engine.apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" }, {
        answer(prompt) {
          if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
          throw new Error(`Unexpected ${prompt.kind}`);
        },
      });
      expect(played.events.filter((event) => event.kind === "abandoned")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "discarded")).toHaveLength(1);
      expect(played.events.filter((event) => event.kind === "banished")).toHaveLength(2);
      const other: Side = side === "player" ? "enemy" : "player";
      expect(played.state.sides[other].backRank.every((id) => id === null)).toBe(true);
      expect(played.state.sides[side].score).toBe(1);
      expect(invariantViolations(played.state, engine.catalog)).toEqual([]);
    });
  });
}
