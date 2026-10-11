/** D20: preselected targets remain in play while the actual amplified source pays by returning itself. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import rower from "../cards/rower-of-changing-seas-de946f5a";
import stone from "../cards/stoneborn-leviathan-07ceb104";

const ROW = parseCardId(rower.id), STONE = parseCardId(stone.id);
const engine = createEngine(testCatalog([rower, stone].map(engineCardFromContent)));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);

export default {
  slug: "prim-return-cost",
  scenarios: [
    {
      name: `${rower.id} returns its amplified source after reserving two exhausted targets, then awakens both`,
      spec: {
        board: { active: "player", phase: "day", player: { hand: [{ cardId: ROW, amplified: true }, v.vanilla1.id, v.vanilla2.id], energy: 5, deck }, enemy: { deck } },
        steps: (ids) => [
          ...ids.player.hand.map((card) => ({ side: "player" as const, action: { kind: "play" as const, card, from: "hand" as const } })),
          { side: "player", action: { kind: "activate", source: ids.player.hand[0], ability: 0 } },
        ],
        answers: (ids) => [[ids.player.hand[1], ids.player.hand[2]]],
      },
      check: ({ state, events, ids }) => {
        const source = ids.player.hand[0];
        expect(state.sides.player.hand).toEqual([source]);
        expect(state.instances[source].variant.amplified).toBe(true);
        for (const target of ids.player.hand.slice(1)) {
          expect(events.some((e) => e.kind === "materialized" && e.instance === target && e.side === "player")).toBe(true);
          expect(state.instances[target].status.exhausted).toBe(false);
          expect(state.instances[target].zone).toBe("play");
        }
        expect(events.filter((e) => e.kind === "returnedToHand")).toEqual([{ kind: "returnedToHand", instance: source, side: "player" }]);
        expect(state.sides.player.currentEnergy).toBe(0);
        expect(engine.view(state, "player").stack).toEqual([]);
      },
    },
    {
      name: `${stone.id} pays its energy and amplified self-return before its independent ability gives the reserved target two spark`,
      spec: {
        board: { active: "player", phase: "day", player: { hand: [{ cardId: STONE, amplified: true }, v.vanilla1.id], energy: 4, deck }, enemy: { deck } },
        steps: (ids) => [
          ...ids.player.hand.map((card) => ({ side: "player" as const, action: { kind: "play" as const, card, from: "hand" as const } })),
          { side: "player", action: { kind: "activate", source: ids.player.hand[0], ability: 0 } },
        ],
        answers: (ids) => [[ids.player.hand[1]]],
      },
      check: ({ state, events, ids }) => {
        const source = ids.player.hand[0], target = ids.player.hand[1];
        expect(state.sides.player.hand).toEqual([source]);
        expect(state.sides.player.currentEnergy).toBe(0);
        expect(state.instances[target].status.gainedSpark).toBe(2);
        expect(engine.view(state, "player").instances[target].characteristics.spark).toBe(3);
        const returned = events.findIndex((e) => e.kind === "returnedToHand" && e.instance === source);
        const activated = events.findIndex((e) => e.kind === "abilityActivated" && e.source === source);
        const gained = events.findIndex((e) => e.kind === "sparkGained" && e.instance === target);
        expect(returned).toBeGreaterThanOrEqual(0);
        expect(activated).toBeGreaterThan(returned);
        expect(gained).toBeGreaterThan(activated);
      },
    },
  ],
} satisfies ScenarioModule;
