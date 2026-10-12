/**
 * D20: Inheritor of Sorrows grants itself Awakened only while its void-event
 * count holds, and the keyword acts only as it enters play: it enters ready
 * when the count already holds, and reaching the count later raises its
 * spark without readying it (RD-hv-umm2.169-1).
 */
import { expect } from "vitest";
import { createCatalog } from "../../engine/catalog";
import { contentCardDefinitions, contentFigmentDefinitions } from "../../engine/content-catalog";
import { effectiveSpark } from "../../engine/rules/spark";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC, SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import inheritor from "../cards/inheritor-of-sorrows-29c4c45d";

const CATALOG = createCatalog([...SYNTHETIC_CARDS, ...contentCardDefinitions()], [], {}, contentFigmentDefinitions());
const INHERITOR = parseCardId(inheritor.id);
const EVENT = SYNTHETIC.event0.id;
const DECK = [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id];

const entries: NamedScenario[] = [false, true].flatMap((amplified): NamedScenario[] => {
  const needed = amplified ? 2 : 3;
  const label = amplified ? "amplified" : "base";
  return [
    {
      name: `${inheritor.id} ${label} enters ready with +4✦ when its void already holds ${String(needed)} events`,
      spec: {
        board: {
          active: "player", phase: "day",
          player: { hand: [{ cardId: INHERITOR, amplified }], void: Array.from({ length: needed }, () => EVENT), energy: 1, deck: DECK },
          enemy: { deck: DECK },
        },
        steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
      },
      check: ({ state, ids }) => {
        const source = ids.player.hand[0];
        expect(state.instances[source]).toMatchObject({ zone: "play", status: { exhausted: false } });
        expect(effectiveSpark(state, CATALOG, source)).toBe(5);
      },
    },
    {
      name: `${inheritor.id} ${label} enters exhausted below the count and stays exhausted when the count is reached`,
      spec: {
        board: {
          active: "player", phase: "day",
          player: {
            hand: [{ cardId: INHERITOR, amplified }, EVENT],
            void: Array.from({ length: needed - 1 }, () => EVENT),
            energy: 1,
            deck: DECK,
          },
          enemy: { deck: DECK },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[1], from: "hand" } },
        ],
      },
      check: ({ state, ids }) => {
        const [source, played] = [ids.player.hand[0], ids.player.hand[1]];
        expect(state.instances[played]?.zone).toBe("void");
        expect(state.sides.player.void).toHaveLength(needed);
        expect(state.instances[source]).toMatchObject({ zone: "play", status: { exhausted: true } });
        expect(effectiveSpark(state, CATALOG, source)).toBe(5);
      },
    },
  ];
});

export default { slug: "cards-57", scenarios: entries } satisfies ScenarioModule;
