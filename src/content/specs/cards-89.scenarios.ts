/** D20: the source's materialized Survivor completes its later grouped draw. */
import { expect } from "vitest";
import { opponent, parseFigmentId, type Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import captain from "../cards/duneguard-captain-16f4962d";
import survivor from "../figments/survivor-5256888f";

const CAPTAIN = parseCardId(captain.id), SURVIVOR = parseFigmentId(survivor.id);
const deck = Array.from({ length: 12 }, () => v.vanilla0.id);

function nextDay(side: Side): ScenarioStep[] {
  return Array.from({ length: 3 }, () => [
    { side, action: { kind: "pass" as const } },
    { side: opponent(side), action: { kind: "pass" as const } },
  ]).flat();
}

const scenarios: NamedScenario[] = [];
for (const side of ["player", "enemy"] as const) {
  for (const amplified of [false, true]) {
    scenarios.push({
      name: `${captain.id} ${side} ${amplified ? "amplified" : "base"} own figment completes a controlled Survivor group`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { hand: [{ cardId: CAPTAIN, amplified }], back: [v.survivorVictim.id, v.vanilla0.id], energy: 1, deck },
          [opponent(side)]: { back: [v.survivorVictim.id, v.survivorVictim.id, v.survivorVictim.id, v.survivorVictim.id], deck },
        },
        steps: (ids) => [
          playFromHand(ids, side), ...nextDay(side),
          { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } },
          ...nextDay(side),
          { side, action: { kind: "activate", source: ids[side].hand[0], ability: 0 } },
          ...nextDay(side),
          { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } },
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0];
        const resolved = events.filter((event) => event.kind === "abilityResolved" && event.source === source);
        expect(resolved).toEqual([1, 0, 1].map((ability) => ({ kind: "abilityResolved", source, side, ability })));
        const firstDrawEnd = events.indexOf(resolved[0]);
        const nextPhase = events.findIndex((event, index) => index > firstDrawEnd && event.kind === "phaseChanged");
        expect(events.slice(firstDrawEnd, nextPhase).filter((event) => event.kind === "cardDrawn")).toEqual([]);
        const made = events.find((event) => event.kind === "materialized" && state.instances[event.instance]?.printing.kind === "figment");
        if (made?.kind !== "materialized") throw new Error("expected the source's physical Survivor figment");
        expect(state.instances[made.instance]).toMatchObject({ printing: { kind: "figment", figment: SURVIVOR, spark: amplified ? 2 : 1 }, controller: side, zone: "play" });
        expect(events.slice(events.indexOf(resolved[2])).filter((event) => event.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: ids[side].deck[3] }]);
        // Three normal turn draws accompany the one final ability draw.
        expect(state.sides[side].hand).toEqual(ids[side].deck.slice(0, 4));
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(4));
        expect(state.sides[opponent(side)].hand).toEqual(ids[opponent(side)].deck.slice(0, 3));
        expect(state.sides[opponent(side)].deck).toEqual(ids[opponent(side)].deck.slice(3));
        expect(state.instances[source]).toMatchObject({ controller: side, zone: "play", variant: { amplified }, status: { exhausted: true } });
      },
    });
  }
}

export default { slug: "cards-89", scenarios } satisfies ScenarioModule;
