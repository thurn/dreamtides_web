/** D20: the resolving draw-discard cohort counts effective Events, independently of earlier discards. */
import { expect } from "vitest";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import { parseFigmentId } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import sanctum from "../cards/sanctum-approach-58f96494";
import ethereal from "../figments/ethereal-3eddb1b8";

const scenarios: NamedScenario[] = (["player", "enemy"] as const).flatMap((side) =>
  [false, true].map((amplified): NamedScenario => ({
    name: `${sanctum.id} ${side} ${amplified ? "amplified" : "base"} counts only its own effective Event discard after drawing`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: {
          back: [SYNTHETIC.discardOne.id], energy: 20,
          hand: [
            SYNTHETIC.event0.id,
            { cardId: parseCardId(sanctum.id), amplified },
            { cardId: SYNTHETIC.vanilla1.id, amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
            SYNTHETIC.vanilla2.id,
            SYNTHETIC.vanilla3.id,
          ],
          deck: [SYNTHETIC.vanilla0.id, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id],
        },
      },
      steps: (ids) => [
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side, action: { kind: "play", card: ids[side].hand[1], from: "hand" } },
      ],
      answers: (ids) => [[ids[side].hand[0]], 3, ids[side].hand.slice(2)],
    },
    check: ({ state, ids, events }) => {
      const drawn = events.flatMap((event, index) => event.kind === "cardDrawn" && event.side === side ? [{ instance: event.instance, index }] : []);
      const discarded = events.flatMap((event, index) => event.kind === "discarded" && event.side === side ? [{ instance: event.instance, index }] : []);
      expect(drawn.map((event) => event.instance)).toEqual(ids[side].deck);
      expect(discarded.map((event) => event.instance)).toEqual([ids[side].hand[0], ...ids[side].hand.slice(2)]);
      expect(discarded[0].index).toBeLessThan(drawn[0].index);
      expect(discarded[1].index).toBeGreaterThan(drawn[2].index);
      expect(state.sides[side].hand).toEqual(ids[side].deck);
      const figments = Object.values(state.instances).filter((instance) => instance.printing.kind === "figment");
      expect(figments).toHaveLength(1);
      expect(figments[0]).toMatchObject({
        controller: side, zone: "play", status: { exhausted: true },
        printing: { kind: "figment", figment: parseFigmentId(ethereal.id), spark: amplified ? 2 : 1 },
      });
      const materialized = events.findIndex((event) => event.kind === "materialized" && event.instance === figments[0].id);
      expect(materialized).toBeGreaterThan(discarded[3].index);
    },
  })),
);

export default { slug: "cards-50", scenarios } satisfies ScenarioModule;
