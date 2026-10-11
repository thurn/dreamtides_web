/** Advance Gunner's own abandonment cost and Dissolved draw interact (D20). */
import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import gunner from "../cards/advance-gunner-e4ab6a18";

const GUNNER = parseCardId(gunner.id);
const FILLER = SYNTHETIC.vanilla1.id;

const scenarios: NamedScenario[] = [false, true].map((amplified) => ({
  name: `${gunner.id} ${amplified ? "amplified" : "base"} abandonment draws before its source-independent Erode resolves`,
  spec: {
    board: {
      active: "player", phase: "day",
      player: { hand: [{ cardId: GUNNER, amplified }], energy: 2, deck: [FILLER, FILLER, FILLER, FILLER] },
      enemy: { deck: [FILLER, FILLER, FILLER, FILLER] },
    },
    steps: (ids) => [
      playFromHand(ids, "player"),
      { side: "player", action: { kind: "activate", source: ids.player.hand[0], ability: 0 } },
    ],
  },
  check: ({ state, ids, events }) => {
    const source = ids.player.hand[0];
    const drawCount = amplified ? 2 : 1;
    const dissolved = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
    const eroded = events.findIndex((event) => event.kind === "eroded");
    const draws = events.flatMap((event, index) => event.kind === "cardDrawn" && event.side === "player" ? [{ instance: event.instance, index }] : []);
    expect(dissolved).toBeGreaterThanOrEqual(0);
    expect(eroded).toBeGreaterThan(dissolved);
    expect(draws.map((draw) => draw.instance)).toEqual(ids.player.deck.slice(0, drawCount));
    for (const draw of draws) {
      expect(draw.index).toBeGreaterThan(dissolved);
      expect(draw.index).toBeLessThan(eroded);
    }
    expect(events.filter((event) => event.kind === "eroded").map((event) => event.instance)).toEqual([ids.player.deck[drawCount]]);
    expect(state.sides.player.hand).toEqual(ids.player.deck.slice(0, drawCount));
    expect(state.sides.player.void).toEqual([ids.player.deck[drawCount], source]);
    expect(state.instances[source]?.zone).toBe("void");
    expect(state.instances[source]?.variant.amplified).toBe(amplified);
    expect(state.sides.enemy.hand).toEqual([]);
  },
}));

export default { slug: "cards-09", scenarios } satisfies ScenarioModule;
