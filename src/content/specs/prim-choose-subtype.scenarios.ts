/**
 * Scenario specs for the chooseSubtype primitive bead: Momentum's Edge's
 * catalog definition, base and amplified. Its ▸Materialized choice makes it
 * the chosen character type, and its own static ability then gives every
 * character of that type, itself and the opponent's included, +1✦ (+2✦
 * amplified): two abilities working together (rules § Keywords and Effects
 * → Choose a character type).
 */
import { expect } from "vitest";
import { createCatalog } from "../../engine/catalog";
import { contentCardDefinitions, contentFigmentDefinitions } from "../../engine/content-catalog";
import { characteristics } from "../../engine/continuous/characteristics";
import { effectiveSpark } from "../../engine/rules/spark";
import type { InstanceId } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC, SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import momentumsEdge from "../cards/momentum-s-edge-5832785d";

const EDGE = parseCardId(momentumsEdge.id);
const WARRIOR = SYNTHETIC.vanilla1.id;
/** The scenario engine's cards and figments: the content beside the synthetic cards. */
const CATALOG = createCatalog([...SYNTHETIC_CARDS, ...contentCardDefinitions()], [], {}, contentFigmentDefinitions());
/** The Warrior's mode among the character types that catalog offers. */
const WARRIOR_MODE = CATALOG.characterTypes.indexOf("Warrior");

function placed(ids: readonly (InstanceId | null)[], index = 0): InstanceId {
  const id = ids[index];
  if (id === undefined || id === null) throw new Error(`the board places no card at ${String(index)}`);
  return id;
}

function anthem(amplified: boolean): NamedScenario {
  const bonus = amplified ? 2 : 1;
  return {
    name: `${momentumsEdge.id} ${amplified ? "amplified" : "base"} becomes the chosen Warrior and gives every Warrior +${String(bonus)} spark`,
    spec: {
      board: {
        active: "player",
        phase: "day",
        player: { hand: [{ cardId: EDGE, amplified }], back: [WARRIOR], energy: 2, deck: [WARRIOR, WARRIOR] },
        enemy: { back: [WARRIOR, SYNTHETIC.vanilla2.id], deck: [WARRIOR, WARRIOR] },
      },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [WARRIOR_MODE],
    },
    check: ({ state, ids, events }) => {
      const edge = placed(ids.player.hand);
      expect(state.instances[edge]?.zone).toBe("play");
      expect(events.filter((event) => event.kind === "subtypeChosen").map((event) => event.subtype)).toEqual(["Warrior"]);
      expect(characteristics(state, CATALOG).of(edge).subtype).toBe("Warrior");
      expect(effectiveSpark(state, CATALOG, edge)).toBe(2 + bonus);
      expect(effectiveSpark(state, CATALOG, placed(ids.player.back))).toBe(1 + bonus);
      expect(effectiveSpark(state, CATALOG, placed(ids.enemy.back))).toBe(1 + bonus);
      expect(effectiveSpark(state, CATALOG, placed(ids.enemy.back, 1))).toBe(2 + bonus);
    },
  };
}

export default {
  slug: "prim-choose-subtype",
  scenarios: [anthem(false), anthem(true)],
} satisfies ScenarioModule;
