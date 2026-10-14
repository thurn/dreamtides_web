/** D20: first-Warrior cost qualification includes committed plays before source entry. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { BattleState } from "../../engine/state/types";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import hollow from "../cards/tethered-hollow-d95533f4";

const HOLLOW = parseCardId(hollow.id);
const engine = createEngine(testCatalog([engineCardFromContent(hollow)]));
const settle = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0).state;
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  for (const mode of ["established", "source-first", "earlier-warrior"] as const) {
    const established = mode === "established";
    const earlier = mode === "earlier-warrior";
    scenarios.push({
      name: `${hollow.id} ${side} ${mode} preserves first-Warrior committed history`,
      spec: {
        board: { active: side, phase: "day", [side]: {
          energy: 20,
          back: established ? [HOLLOW] : [],
          hand: established ? [v.survivorVictim.id, v.vanilla5.id, v.vanilla5.id]
            : earlier ? [v.vanilla0.id, HOLLOW, v.vanilla5.id] : [HOLLOW, v.vanilla5.id],
        } },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ start, state: first, ids, events }) => {
        let state = settle(first);
        const source = established ? ids[side].back[0]! : ids[side].hand[earlier ? 1 : 0];
        const firstPlayed = ids[side].hand[0];
        expect(events).toContainEqual({ kind: "cardPlayed", instance: firstPlayed, side });
        expect(state.turnLog.played[side].map(record => record.instance)).toEqual([firstPlayed]);
        if (established) expect(start.sides[side].currentEnergy - state.sides[side].currentEnergy).toBe(1);
        if (earlier) expect(start.sides[side].currentEnergy - state.sides[side].currentEnergy).toBe(0);
        // The real source's payment is observed, without asserting its mutable printing cost.
        const sourcePayment = established ? 0 : earlier ? undefined : start.sides[side].currentEnergy - state.sides[side].currentEnergy;
        const payAndSettle = (index: number, slot: number) => {
          const card = ids[side].hand[index];
          const before = state.sides[side].currentEnergy;
          const played = engine.apply(state, side, { kind: "play", card, from: "hand", slot: { rank: "back", index: slot } }, NO_PROMPTS);
          state = settle(played.state);
          expect(played.events).toContainEqual({ kind: "cardPlayed", instance: card, side });
          expect(state.instances[card]).toMatchObject({ zone: "play", owner: side, controller: side });
          expect(state.sides[side].backRank[slot]).toBe(card);
          return before - state.sides[side].currentEnergy;
        };
        if (earlier) {
          const observedSourcePayment = payAndSettle(1, 1);
          expect(Number.isFinite(observedSourcePayment)).toBe(true);
        }
        if (sourcePayment !== undefined) expect(Number.isFinite(sourcePayment)).toBe(true);
        expect(state.instances[source]).toMatchObject({ printing: { kind: "card", cardId: HOLLOW }, zone: "play", controller: side });
        expect(payAndSettle(earlier ? 2 : 1, established || earlier ? 2 : 1)).toBe(established ? 2 : 5);
        if (established) expect(payAndSettle(2, 3)).toBe(5);
        expect(state.turnLog.played[side].map(record => record.instance)).toEqual(ids[side].hand);
        for (const card of ids[side].hand) expect(state.instances[card].zone).toBe("play");
        expect(state.instances[ids[side].hand[established ? 1 : earlier ? 2 : 1]].printing).toEqual({ kind: "card", cardId: v.vanilla5.id });
      },
    });
  }
}

export default { slug: "cards-90", scenarios } satisfies ScenarioModule;
