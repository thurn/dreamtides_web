/** D20: a dissolution creates an Ember; Ember deaths grow its creator, whose own departure creates another. */
import { expect } from "vitest";
import { parseFigmentId, type Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import apparition from "../cards/fiery-apparition-6d6ce556";
import ember from "../figments/ember-361b4942";
import { SYNTHETIC_ABANDONER } from "./abandonment-fixture";

const SOURCE = parseCardId(apparition.id), EMBER = parseFigmentId(ember.id);
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
function scenario(side: Side, amplified: boolean, enemyEmber: boolean): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  const outputSpark = amplified ? 2 : 1;
  const gains = enemyEmber ? 2 : 1;
  return {
    name: `${apparition.id} ${side} ${amplified ? "amplified" : "base"} coupled dissolution ${enemyEmber ? "with" : "without"} an opposing Ember`,
    spec: {
      board: { active: side, phase: "day",
        [side]: { hand: [{ cardId: SOURCE, amplified }, v.dissolveVictim.id, v.dissolveFigmentCopy.id], back: [SYNTHETIC_ABANDONER.id, v.vanilla1.id], energy: (apparition.energyCost ?? 0) + 10, deck },
        [other]: { back: [v.vanilla2.id], deck, figments: enemyEmber ? [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: EMBER, spark: null } }] : [] },
      },
      steps: ids => [
        playFromHand(ids, side),
        playFromHand(ids, side, 1),
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        // The compound synthetic event copies the harmless Warrior driver, then dissolves every figment.
        playFromHand(ids, side, 2),
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
      ],
      answers: ids => [[ids[other].back[0]!], [ids[side].back[1]!], [ids[side].back[0]!], [ids[side].hand[0]]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].hand[0], driver = ids[side].back[0]!, fodder = ids[side].back[1]!;
      const foreignDeath = events.findIndex(e => e.kind === "dissolved" && e.instance === ids[other].back[0]);
      const fodderDeath = events.findIndex(e => e.kind === "dissolved" && e.instance === fodder);
      const created = events.flatMap(e => e.kind === "cardCreated" && e.printing.kind === "figment" && e.printing.figment === EMBER ? [e] : []);
      expect(created).toHaveLength(2);
      const [first, last] = created;
      for (const entry of created) expect(entry).toMatchObject({ side, zone: "play", printing: { spark: outputSpark } });
      const firstEntry = events.findIndex(e => e.kind === "materialized" && e.instance === first.instance);
      const firstDeath = events.findIndex(e => e.kind === "dissolved" && e.instance === first.instance);
      expect(foreignDeath).toBeGreaterThanOrEqual(0);
      expect(fodderDeath).toBeGreaterThan(foreignDeath);
      expect(firstEntry).toBeGreaterThan(fodderDeath);
      expect(firstDeath).toBeGreaterThan(firstEntry);
      expect(state.instances[first.instance]).toBeUndefined();
      expect(events.flatMap(e => e.kind === "sparkGained" && e.instance === source ? [e.amount] : [])).toEqual(Array.from({ length: gains }, () => 1));
      const gainEvents = events.flatMap((e, index) => e.kind === "sparkGained" && e.instance === source ? [{ event: e, index }] : []);
      for (const gain of gainEvents) {
        expect(gain.index).toBeGreaterThan(firstDeath);
        expect(gain.event.expiry).toEqual({ at: "never" });
      }
      if (enemyEmber) {
        const foreignEmber = ids[other].back[1]!;
        expect(events).toContainEqual({ kind: "dissolved", instance: foreignEmber, side: other });
        expect(state.instances[foreignEmber]).toBeUndefined();
      }
      const copies = events.flatMap(e => e.kind === "cardCreated" && e.printing.kind === "figmentCopy" && e.printing.cardId === SYNTHETIC_ABANDONER.id ? [e.instance] : []);
      expect(copies).toHaveLength(1);
      expect(events).toContainEqual({ kind: "dissolved", instance: copies[0], side });
      expect(state.instances[copies[0]]).toBeUndefined();
      const departure = events.findIndex(e => e.kind === "leftPlay" && e.instance === source);
      expect(departure).toBeGreaterThan(gainEvents[gains - 1].index);
      expect(events).toContainEqual({ kind: "leftPlay", instance: source, side, to: "void", spark: (apparition.spark ?? 0) + gains });
      expect(events.findIndex(e => e.kind === "materialized" && e.instance === last.instance)).toBeGreaterThan(departure);
      expect(state.instances[last.instance]).toMatchObject({ controller: side, zone: "play", status: { exhausted: false }, printing: { kind: "figment", figment: EMBER, spark: outputSpark } });
      expect(events.filter(e => e.kind === "exhaustionChanged" && (e.instance === first.instance || e.instance === last.instance))).toEqual([]);
      expect(state.instances[source]).toMatchObject({ zone: "void", status: { gainedSpark: gains } });
      expect(state.instances[driver].zone).toBe("play");
      expect(state.stack).toEqual([]);
    },
  };
}

export default { slug: "cards-65", scenarios: (["player", "enemy"] as const).flatMap(side => [false, true].flatMap(amplified => [false, true].map(enemyEmber => scenario(side, amplified, enemyEmber)))) } satisfies ScenarioModule;
