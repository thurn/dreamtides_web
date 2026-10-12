/** D20: the permanent spark gained by this character increases its own Dissolved draw. */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import duelist from "../cards/tranquil-duelist-fc0c6f10";

const DUELIST = parseCardId(duelist.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = (["player", "enemy"] as const).map((side) => {
  const other = side === "player" ? "enemy" : "player";
  return {
    name: `${duelist.id} ${side} two spark activations increase its own Dissolved draw to four`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { back: [DUELIST], hand: [SYNTHETIC.dissolveVictim.id], energy: 8, deck },
        [other]: { deck },
      },
      steps: (ids) => [
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } },
      ],
    },
    check: ({ state, ids, events }) => {
      const source = ids[side].back[0]!;
      const departure = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
      const gains = events.flatMap((event, index) => event.kind === "sparkGained" && event.instance === source ? [{ index, amount: event.amount }] : []);
      expect(gains.map((gain) => gain.amount)).toEqual([1, 1]);
      expect(gains.every((gain) => gain.index < departure)).toBe(true);
      expect(departure).toBeGreaterThanOrEqual(0);
      const draws = events.flatMap((event, index) => event.kind === "cardDrawn" && event.side === side ? [{ index, instance: event.instance }] : []);
      expect(draws.map((draw) => draw.instance)).toEqual(ids[side].deck.slice(0, 4));
      expect(draws.every((draw) => draw.index > departure)).toBe(true);
      expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, 4));
      expect(state.sides[other].hand).toEqual([]);
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(state.instances[source]?.zone).toBe("void");
      expect(events.filter((event) => event.kind === "triggerResolved" && event.source === source && event.ability === 1 && event.applied)).toHaveLength(1);
    },
  };
});

export default { slug: "cards-62", scenarios } satisfies ScenarioModule;
