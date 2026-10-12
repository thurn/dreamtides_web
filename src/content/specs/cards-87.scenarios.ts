/** D20: captured sacrifice cost, pre-payment void targets and a Dawn figment feeding its source. */
import { expect } from "vitest";
import { opponent, parseFigmentId, type Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import bloodbroker from "../cards/bloodbroker-a7820b34";
import crescendo from "../cards/crescendo-channeler-867b98cf";
import prophet from "../cards/prophet-of-the-consumed-8a5d7d67";
import warrior from "../figments/warrior-bb1a5acd";

const BLOODBROKER = parseCardId(bloodbroker.id), PROPHET = parseCardId(prophet.id), CRESCENDO = parseCardId(crescendo.id);
const WARRIOR = parseFigmentId(warrior.id);
const deck = Array.from({ length: 5 }, () => v.vanilla0.id);
// Two Days and their Dusk responses reach the source controller's next Day.
function nextDay(side: Side): ScenarioStep[] {
  return Array.from({ length: 3 }, () => [
    { side, action: { kind: "pass" as const } },
    { side: opponent(side), action: { kind: "pass" as const } },
  ]).flat();
}

const scenarios: NamedScenario[] = [];
for (const side of ["player", "enemy"] as const) {
  for (const figment of [false, true]) {
    const wanted = figment ? v.vanilla1.id : v.vanilla3.id;
    scenarios.push({
      name: `${bloodbroker.id} ${side} captures its ${figment ? "ceased figment" : "abandoned warrior"} cost for an exact one-higher discovery`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: {
            back: figment ? [BLOODBROKER] : [BLOODBROKER, v.vanilla2.id],
            figments: figment ? [{ slot: { rank: "back", index: 1 }, printing: { kind: "figment", figment: WARRIOR, spark: null } }] : [],
            deck: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.survivorVictim.id],
          },
        },
        steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
      },
      check: ({ state, ids, events, answers }) => {
        const source = ids[side].back[0]!, payment = ids[side].back[1]!;
        const chosen = ids[side].deck[figment ? 1 : 3];
        expect(answers.map((answer) => answer.value)).toEqual([[payment], [chosen]]);
        expect(state.instances[chosen]).toMatchObject({ printing: { kind: "card", cardId: wanted }, controller: side, zone: "play", status: { exhausted: true } });
        expect(state.instances[source].status.exhausted).toBe(true);
        expect(events).toContainEqual(expect.objectContaining({ kind: "abandoned", instance: payment, side }));
        expect(events).toContainEqual({ kind: "cardDiscovered", side, instance: chosen });
        if (figment) expect(state.instances[payment]).toBeUndefined();
        else expect(state.instances[payment].zone).toBe("void");
        expect(state.sides[side].hand).toEqual([]);
        expect(state.sides[side].currentEnergy).toBe(0);
      },
    });
  }
  for (const amplified of [false, true]) {
    scenarios.push({
      name: `${prophet.id} ${side} ${amplified ? "amplified" : "base"} self-abandonment materializes its earlier void target`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: PROPHET, amplified }], void: [v.survivorVictim.id, v.vanilla2.id], energy: 2, deck }, [opponent(side)]: { deck } },
        steps: (ids) => [playFromHand(ids, side), ...nextDay(side), { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } }],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0], target = ids[side].void[1];
        expect(state.instances[source]).toMatchObject({ zone: "void", variant: { amplified } });
        expect(state.instances[target]).toMatchObject({ zone: "play", owner: side, controller: side, status: { exhausted: !amplified } });
        expect(state.instances[ids[side].void[0]].zone).toBe("void");
        const abandoned = events.findIndex((e) => e.kind === "abandoned" && e.instance === source);
        const entered = events.findIndex((e) => e.kind === "materialized" && e.instance === target);
        expect(abandoned).toBeGreaterThanOrEqual(0);
        expect(entered).toBeGreaterThan(abandoned);
        expect(events.filter((e) => e.kind === "materialized" && e.instance === source)).toHaveLength(1);
        expect(events.filter((e) => e.kind === "cardPlayed" && e.instance === target)).toEqual([]);
        expect(state.floating).toEqual([]);
      },
    });
    scenarios.push({
      name: `${crescendo.id} ${side} ${amplified ? "amplified" : "base"} own Dawn figment feeds its subsequent warrior count`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: CRESCENDO, amplified }], back: [v.survivorVictim.id], energy: 6, deck }, [opponent(side)]: { back: [v.vanilla1.id], deck } },
        steps: (ids) => [playFromHand(ids, side), ...nextDay(side), { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } }],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0];
        const made = events.find((e) => e.kind === "materialized" && state.instances[e.instance]?.printing.kind === "figment");
        if (made?.kind !== "materialized") throw new Error("expected a physical Dawn figment");
        expect(state.instances[made.instance]).toMatchObject({ printing: { kind: "figment", figment: WARRIOR, spark: amplified ? 2 : 1 }, controller: side, zone: "play" });
        expect(events.filter((e) => e.kind === "energyChanged" && e.side === side && e.cause === "effect")).toEqual([expect.objectContaining({ change: 2 })]);
        expect(state.instances[source].status.exhausted).toBe(true);
        expect(state.instances[source].variant.amplified).toBe(amplified);
        expect(state.sides[opponent(side)].currentEnergy).toBe(0);
      },
    });
  }
}

export default { slug: "cards-87", scenarios } satisfies ScenarioModule;
