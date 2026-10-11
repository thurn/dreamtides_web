/** D20: the paid discard changes the same card's static spark before its matching draw. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import scavenger from "../cards/remnant-scavenger-017a7b4b";
import flameforged from "../cards/flameforged-8896c178";

const SCAVENGER = parseCardId(scavenger.id), FLAMEFORGED = parseCardId(flameforged.id);
const engine = createEngine(testCatalog([scavenger, flameforged].map(engineCardFromContent)));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);

export default {
  slug: "prim-draw-matching",
  scenarios: [
    {
      name: `${scavenger.id} its paid small-character discard increases static spark while it draws past nonmatching cards`,
      spec: {
        board: { active: "player", phase: "day", player: { back: [SCAVENGER], hand: [v.vanilla2.id, v.event0.id], void: [v.vanilla2.id, v.vanilla3.id, v.event0.id], deck: [v.event1.id, v.vanilla3.id, v.vanilla1.id, v.vanilla2.id] }, enemy: { deck } },
        steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 1 } }],
        answers: (ids) => [[ids.player.hand[0]]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids.player.back[0]!, discarded = ids.player.hand[0], drawn = ids.player.deck[2];
        expect(engine.view(start, "player").instances[source].characteristics.spark).toBe(3);
        expect(engine.view(state, "player").instances[source].characteristics.spark).toBe(4);
        expect(state.instances[source].status.exhausted).toBe(true);
        expect(state.sides.player.void).toEqual([discarded, ...ids.player.void]);
        expect(state.sides.player.hand).toEqual([ids.player.hand[1], drawn]);
        expect(state.sides.player.deck).toEqual(ids.player.deck.filter((id) => id !== drawn));
        expect(state.turnLog.drawn.player).toBe(1);
        const discard = events.findIndex((e) => e.kind === "discarded" && e.instance === discarded);
        const draw = events.findIndex((e) => e.kind === "cardDrawn" && e.instance === drawn);
        expect(discard).toBeGreaterThanOrEqual(0);
        expect(draw).toBeGreaterThan(discard);
      },
    },
    {
      name: `${flameforged.id} its event-only discard raises static spark and it draws the first deck event`,
      spec: {
        board: { active: "player", phase: "day", player: { back: [FLAMEFORGED], hand: [v.event0.id, v.event1.id, v.vanilla1.id], void: [v.event0.id, v.vanilla2.id], deck: [v.vanilla2.id, v.event0.id, v.event1.id] }, enemy: { deck } },
        steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }],
        answers: (ids) => [[ids.player.hand[1]]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids.player.back[0]!, discarded = ids.player.hand[1], drawn = ids.player.deck[1];
        expect(engine.view(start, "player").instances[source].characteristics.spark).toBe(3);
        expect(engine.view(state, "player").instances[source].characteristics.spark).toBe(4);
        expect(state.instances[source].status.exhausted).toBe(true);
        expect(state.sides.player.void).toEqual([discarded, ...ids.player.void]);
        expect(state.sides.player.hand).toEqual([ids.player.hand[0], ids.player.hand[2], drawn]);
        expect(state.sides.player.deck).toEqual([ids.player.deck[0], ids.player.deck[2]]);
        expect(state.turnLog.drawn.player).toBe(1);
        const discard = events.findIndex((e) => e.kind === "discarded" && e.instance === discarded);
        const draw = events.findIndex((e) => e.kind === "cardDrawn" && e.instance === drawn);
        expect(discard).toBeGreaterThanOrEqual(0);
        expect(draw).toBeGreaterThan(discard);
      },
    },
  ],
} satisfies ScenarioModule;
