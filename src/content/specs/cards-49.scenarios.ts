/**
 * D20: the Captain's activated draw-discard ability supplies the discard
 * that its own once-per-turn figment trigger observes.
 */
import { expect } from "vitest";
import { parseFigmentId } from "../../engine/state/ids";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import captain from "../cards/radiants-captain-724a1362";
import shadow from "../figments/shadow-86125402";

export default {
  slug: "cards-49",
  scenarios: [{
    name: `${captain.id} its activation draws before discarding and triggers its own shadow figment`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: {
          back: [parseCardId(captain.id)],
          hand: [SYNTHETIC.vanilla1.id],
          deck: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id],
          energy: 2,
        },
      },
      steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }],
      answers: (ids) => [[ids.player.hand[0]]],
    },
    check: ({ state, ids, events }) => {
      const source = ids.player.back[0]!;
      const drawn = events.findIndex((event) => event.kind === "cardDrawn" && event.instance === ids.player.deck[0]);
      const discarded = events.findIndex((event) => event.kind === "discarded" && event.instance === ids.player.hand[0]);
      const triggered = events.findIndex((event) => event.kind === "triggerResolved" && event.source === source && event.applied);
      expect(drawn).toBeGreaterThanOrEqual(0);
      expect(discarded).toBeGreaterThan(drawn);
      expect(triggered).toBeGreaterThan(discarded);
      expect(state.sides.player.currentEnergy).toBe(0);
      expect(state.instances[source]?.status.exhausted).toBe(true);
      expect(state.sides.player.hand).toEqual([ids.player.deck[0]]);
      expect(state.sides.player.void).toEqual([ids.player.hand[0]]);
      const figments = Object.values(state.instances).filter((instance) => instance.printing.kind === "figment");
      expect(figments).toHaveLength(1);
      expect(figments[0]).toMatchObject({
        controller: "player", zone: "play",
        printing: { kind: "figment", figment: parseFigmentId(shadow.id), spark: 2 },
      });
      expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source)).toHaveLength(1);
    },
  }],
} satisfies ScenarioModule;
