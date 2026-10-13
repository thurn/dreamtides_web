/** D20: abandonment feeds live spark; Interrupt activations retain their payments across departure. */
import { expect } from "vitest";
import { createCatalog } from "../../engine/catalog";
import { contentCardDefinitions } from "../../engine/content-catalog";
import { effectiveSpark } from "../../engine/rules/spark";
import { opponent } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import remnant from "../cards/ashen-remnant-5639053e";
import sovereign from "../cards/dreadmount-sovereign-82749215";
import champion from "../cards/forsworn-champion-747859fb";
import conqueror from "../cards/ruthless-conqueror-d6ec65a2";

const REMNANT = parseCardId(remnant.id), SOVEREIGN = parseCardId(sovereign.id);
const CHAMPION = parseCardId(champion.id), CONQUEROR = parseCardId(conqueror.id);
const CATALOG = createCatalog([...SYNTHETIC_CARDS, ...contentCardDefinitions()], []);
const REMNANT_SPARK = remnant.spark, SOVEREIGN_SPARK = sovereign.spark;
if (REMNANT_SPARK === null || SOVEREIGN_SPARK === null) throw new Error("Scenario subjects require fixed spark");
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const selfPayment of [false, true]) {
    scenarios.push({
      name: `${conqueror.id} ${side} exhausts then abandons ${selfPayment ? "itself" : "a warrior"} for its coupled trigger and points`,
      spec: {
        board: { active: side, phase: "day", [side]: { back: [CONQUEROR, v.vanilla1.id] } },
        steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 1 } }],
        answers: (ids) => [[ids[side].back[selfPayment ? 0 : 1]!]],
      },
      check: ({ state, events, ids }) => {
        const source = ids[side].back[0]!, paid = ids[side].back[selfPayment ? 0 : 1]!;
        const exhausted = events.findIndex(event => event.kind === "exhaustionChanged" && event.instance === source && event.exhausted);
        const abandoned = events.findIndex(event => event.kind === "abandoned" && event.instance === paid);
        const dissolved = events.findIndex(event => event.kind === "dissolved" && event.instance === paid);
        expect(exhausted).toBeGreaterThanOrEqual(0);
        expect(abandoned).toBeGreaterThan(exhausted);
        expect(dissolved).toBeGreaterThan(abandoned);
        expect(events.filter(event => event.kind === "triggerQueued" && event.source === source)).toEqual([
          expect.objectContaining({ controller: side, subject: paid, ability: 0 }),
        ]);
        expect(events.filter(event => event.kind === "sparkGained" && event.instance === source)).toEqual(selfPayment ? [] : [
          expect.objectContaining({ amount: 1, expiry: { at: "never" } }),
        ]);
        expect(state.instances[source]).toMatchObject({ zone: selfPayment ? "void" : "play", status: { gainedSpark: selfPayment ? 0 : 1 } });
        expect(state.instances[paid].zone).toBe("void");
        expect(state.sides[side].score).toBe(1);
        expect(state.sides[other].score).toBe(0);
        expect(events).toContainEqual({ kind: "abilityResolved", source, side, ability: 1 });
        expect(state.stack).toEqual([]);
      },
    });
  }

  for (const erodedCharacter of [false, true]) {
    scenarios.push({
      name: `${remnant.id} ${side} abandonment and eroded ${erodedCharacter ? "character" : "event"} feed its own live void count`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { back: [REMNANT, REMNANT, v.survivorVictim.id], void: [v.vanilla1.id, v.event0.id], deck: [erodedCharacter ? v.vanilla2.id : v.event1.id, v.vanilla3.id] },
          [other]: { void: [v.vanilla1.id, v.vanilla2.id], deck: [v.vanilla3.id] },
        },
        steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 1 } }],
        answers: (ids) => [[ids[side].back[1]!]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids[side].back[0]!, paid = ids[side].back[1]!, eroded = ids[side].deck[0];
        // A distinct physical copy is "another"; events and the opposing void contribute nothing.
        expect(effectiveSpark(start, CATALOG, source)).toBe(REMNANT_SPARK + 1);
        expect(effectiveSpark(state, CATALOG, source)).toBe(REMNANT_SPARK + 2 + Number(erodedCharacter));
        expect(state.instances[source]).toMatchObject({ zone: "play", status: { gainedSpark: 0 } });
        expect(state.instances[paid].zone).toBe("void");
        expect(state.instances[eroded].zone).toBe("void");
        expect(state.sides[side].void).toEqual([eroded, paid, ...ids[side].void]);
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(1));
        expect(state.sides[other].void).toEqual(ids[other].void);
        expect(state.sides[other].deck).toEqual(ids[other].deck);
        expect(events.filter(event => event.kind === "eroded")).toEqual([{ kind: "eroded", side, instance: eroded }]);
        const abandoned = events.findIndex(event => event.kind === "abandoned" && event.instance === paid);
        expect(abandoned).toBeGreaterThanOrEqual(0);
        expect(events.findIndex(event => event.kind === "eroded" && event.instance === eroded)).toBeGreaterThan(abandoned);
        expect(events.filter(event => event.kind === "sparkGained")).toEqual([]);
        expect(state.stack).toEqual([]);
      },
    });
  }

  scenarios.push({
    name: `${champion.id} ${side} responds to an opponent event with its Interrupt warrior payment`,
    spec: {
      board: { active: other, phase: "day", [side]: { back: [CHAMPION, v.vanilla3.id] }, [other]: { hand: [v.event0.id] } },
      steps: (ids) => [
        { side: other, action: { kind: "play", card: ids[other].hand[0], from: "hand" } },
        { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        { side, action: { kind: "pass" } },
      ],
      answers: (ids) => [[ids[side].back[1]!]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].back[0]!, paid = ids[side].back[1]!, original = ids[other].hand[0];
      expect(events).toContainEqual({ kind: "abandoned", instance: paid, side });
      expect(state.instances[source]).toMatchObject({ zone: "play", status: { gainedSpark: 1 } });
      const gain = events.findIndex(event => event.kind === "sparkGained" && event.instance === source && event.amount === 1);
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(events.findIndex(event => event.kind === "resolved" && event.instance === original)).toBeGreaterThan(gain);
      expect(state.instances[paid].zone).toBe("void");
      expect(state.stack).toEqual([]);
    },
  });

  for (const selfPayment of [false, true]) {
    scenarios.push({
      name: `${sovereign.id} ${side} Interrupt captures ${selfPayment ? "its own" : "a live void scaler's"} spark before departure`,
      spec: {
        board: {
          active: other, phase: "day",
          [side]: { back: [SOVEREIGN, v.vanilla3.id, ...(selfPayment ? [v.survivorVictim.id] : [REMNANT])], void: [v.vanilla1.id, v.event0.id] },
          [other]: { hand: [v.event0.id], void: [v.vanilla2.id, v.vanilla3.id] },
        },
        steps: (ids) => [
          { side: other, action: { kind: "play", card: ids[other].hand[0], from: "hand" } },
          { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
          ...(selfPayment ? [] : [{ side, action: { kind: "pass" } } as const]),
        ],
        answers: (ids) => [[ids[side].back[1]!], [ids[side].back[selfPayment ? 0 : 2]!]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids[side].back[0]!, target = ids[side].back[1]!, paid = ids[side].back[selfPayment ? 0 : 2]!, original = ids[other].hand[0];
        const captured = selfPayment ? SOVEREIGN_SPARK : REMNANT_SPARK + 1;
        expect(effectiveSpark(start, CATALOG, paid)).toBe(captured);
        expect(effectiveSpark(state, CATALOG, paid)).toBe(selfPayment ? SOVEREIGN_SPARK : REMNANT_SPARK);
        expect(events).toContainEqual({ kind: "abandoned", instance: paid, side });
        expect(events).toContainEqual({ kind: "abilityResolved", source, side, ability: 0 });
        expect(events.filter(event => event.kind === "sparkGained")).toEqual([
          expect.objectContaining({ instance: target, amount: captured, expiry: { at: "never" } }),
        ]);
        expect(state.instances[target]).toMatchObject({ zone: "play", status: { gainedSpark: captured } });
        expect(state.instances[paid].zone).toBe("void");
        expect(state.instances[source].zone).toBe(selfPayment ? "void" : "play");
        expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy);
        const gain = events.findIndex(event => event.kind === "sparkGained" && event.instance === target);
        expect(events.findIndex(event => event.kind === "resolved" && event.instance === original)).toBeGreaterThan(gain);
        expect(state.sides[other].void).toEqual([original, ...ids[other].void]);
        expect(state.stack).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-60", scenarios } satisfies ScenarioModule;
