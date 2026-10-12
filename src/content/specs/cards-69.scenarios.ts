/** D20: void listeners retain physical variants; void statics compose with live counts and base spark. */
import { expect } from "vitest";
import { createCatalog } from "../../engine/catalog";
import { contentCardDefinitions } from "../../engine/content-catalog";
import { effectiveSpark } from "../../engine/rules/spark";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC, SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import delver from "../cards/duskwall-delver-7def28c4";
import emperor from "../cards/emperor-of-eternity-455ef341";
import wrath from "../cards/god-of-wrath-8451340c";
import walker from "../cards/barren-path-walker-f46490a5";

const DELVER = parseCardId(delver.id), EMPEROR = parseCardId(emperor.id);
const WRATH = parseCardId(wrath.id), WALKER = parseCardId(walker.id);
const DELVER_COST = delver.energyCost, EMPEROR_COST = emperor.energyCost;
const WRATH_SPARK = wrath.spark, EMPEROR_SPARK = emperor.spark;
if (DELVER_COST === null || EMPEROR_COST === null || WRATH_SPARK === null || EMPEROR_SPARK === null) throw new Error("Scenario subjects require fixed costs and spark");
const CATALOG = createCatalog([...SYNTHETIC_CARDS, ...contentCardDefinitions()], []);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = side === "player" ? "enemy" : "player";
  for (const amplified of [false, true]) {
    for (const payment of ["accept", "decline", "unpayable"] as const) {
      scenarios.push({
        name: `${delver.id} ${side} ${amplified ? "amplified" : "base"} ignores its own dissolve, then ${payment} its allied dissolve return`,
        spec: {
          board: {
            active: side, phase: "day",
            [side]: {
              back: [SYNTHETIC.vanilla1.id],
              hand: [{ cardId: DELVER, amplified }, SYNTHETIC.dissolveVictim.id, SYNTHETIC.dissolveVictim.id],
              energy: DELVER_COST + (payment === "unpayable" ? 0 : 1),
            },
          },
          steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1), playFromHand(ids, side, 2)],
          answers: (ids) => [[ids[side].hand[0]], ...(payment === "unpayable" ? [] : [payment === "accept"])],
        },
        check: ({ start, state, ids, events, answers }) => {
          const source = ids[side].hand[0], victim = ids[side].back[0]!;
          const accepted = payment === "accept";
          expect(state.instances[source]).toMatchObject({
            zone: accepted ? "play" : "void", owner: side, controller: side, variant: { amplified },
            status: { exhausted: accepted ? !amplified : false, reclaimed: false },
          });
          expect(state.sides[side].currentEnergy).toBe(payment === "decline" ? 1 : 0);
          expect(events.filter((event) => event.kind === "triggerQueued" && event.source === source)).toEqual([
            expect.objectContaining({ controller: side, subject: victim }),
          ]);
          // The only return is the same physical card, following the ally's dissolve and optional payment.
          const entries = events.filter((event) => event.kind === "materialized" && event.instance === source);
          expect(entries).toHaveLength(accepted ? 2 : 1);
          expect(events.filter((event) => event.kind === "cardPlayed" && event.instance === source)).toHaveLength(1);
          expect(start.instances[source].variant).toEqual(state.instances[source].variant);
          expect(answers.filter(({ value }) => typeof value === "boolean")).toHaveLength(payment === "unpayable" ? 0 : 1);
        },
      });
    }
  }

  scenarios.push({
    name: `${delver.id} ${side} void listener ignores the opponent's dissolved character`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { void: [DELVER], hand: [SYNTHETIC.dissolveVictim.id], energy: 1 },
        [other]: { back: [SYNTHETIC.vanilla1.id] },
      },
      steps: (ids) => [playFromHand(ids, side)],
    },
    check: ({ state, ids, events }) => {
      expect(state.instances[ids[side].void[0]].zone).toBe("void");
      expect(state.sides[side].currentEnergy).toBe(1);
      expect(events.filter((event) => event.kind === "triggerQueued")).toEqual([]);
    },
  });

  for (const amplified of [false, true]) {
    for (const dissolved of [false, true]) {
      scenarios.push({
        name: `${emperor.id} ${side} ${amplified ? "amplified" : "base"} ${dissolved ? "void anthem tracks allied dissolves above base spark" : "anthem is inactive in hand and play"}`,
        spec: {
          board: {
            active: side, phase: "day",
            [side]: {
              back: [WRATH, WALKER, SYNTHETIC.vanilla1.id],
              void: [SYNTHETIC.vanilla1.id, SYNTHETIC.event0.id],
              hand: [{ cardId: EMPEROR, amplified }, SYNTHETIC.dissolveVictim.id, SYNTHETIC.dissolveVictim.id],
              energy: EMPEROR_COST,
            },
            [other]: { back: [SYNTHETIC.vanilla1.id], void: [EMPEROR, SYNTHETIC.vanilla2.id] },
          },
          steps: (ids) => [playFromHand(ids, side), ...(dissolved ? [playFromHand(ids, side, 1), playFromHand(ids, side, 2)] : [])],
          answers: (ids) => dissolved ? [[ids[side].hand[0]], [ids[side].back[2]!]] : [],
        },
        check: ({ start, state, ids }) => {
          const god = ids[side].back[0]!, scaling = ids[side].back[1]!, source = ids[side].hand[0];
          const bonus = dissolved ? (amplified ? 2 : 1) : 0;
          // A void event and every opposing void card are excluded from the live character count.
          expect(effectiveSpark(start, CATALOG, scaling)).toBe(11);
          expect(effectiveSpark(start, CATALOG, god)).toBe(WRATH_SPARK);
          expect(effectiveSpark(state, CATALOG, scaling)).toBe(10 + (dissolved ? 3 : 1) + bonus);
          expect(effectiveSpark(state, CATALOG, god)).toBe(WRATH_SPARK + bonus);
          expect(effectiveSpark(state, CATALOG, ids[other].back[0]!)).toBe(2);
          expect(state.instances[source]).toMatchObject({ zone: dissolved ? "void" : "play", variant: { amplified } });
          // Static spark covers characters in play; the void source retains only its printed spark.
          expect(effectiveSpark(state, CATALOG, source)).toBe(dissolved ? EMPEROR_SPARK : 10);
        },
      });
    }
  }
}

export default { slug: "cards-69", scenarios } satisfies ScenarioModule;
