/** D20: own erosion supplies a static play permission; dissolved source eligibility is read in its void. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import { hasKeyword } from "../../engine/rules/keywords";
import { opponent } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import soul from "../cards/eternal-soul-4e1c0192";
import guide from "../cards/winterbough-guide-96e2c30c";

const SOUL = parseCardId(soul.id), GUIDE = parseCardId(guide.id);
const deck = Array.from({ length: 10 }, () => v.vanilla1.id);
const engine = createEngine(testCatalog([soul, guide].map(engineCardFromContent)));
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const amount = amplified ? 2 : 1;
    scenarios.push({
      name: `${guide.id} ${side} ${amplified ? "amplified" : "base"} erosion supplies its own once-per-turn normal play`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { hand: [{ cardId: GUIDE, amplified }], void: [v.vanilla2.id, v.survivorVictim.id], energy: 8, deck },
          [other]: { void: [v.vanilla1.id], deck },
        },
        steps: (ids) => [
          playFromHand(ids, side),
          { side, action: { kind: "play", card: ids[side].deck[0], from: "void" } },
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].hand[0], played = ids[side].deck[0];
        expect(events.filter((event) => event.kind === "eroded" && event.side === side).map((event) => event.kind === "eroded" ? event.instance : null)).toEqual(ids[side].deck.slice(0, amount));
        expect(state.instances[source]).toMatchObject({ zone: "play", variant: { amplified } });
        expect(state.instances[played]).toMatchObject({ zone: "play", owner: side, controller: side, status: { reclaimed: false } });
        expect(events).toContainEqual({ kind: "cardPlayed", instance: played, side });
        expect(state.sides[side].currentEnergy).toBe(5);
        expect(engine.legalActions(state, side).filter((action) => action.kind === "play" && action.from === "void")).toEqual([]);
        expect(state.instances[ids[side].void[0]].zone).toBe("void");
        expect(state.instances[ids[other].void[0]].zone).toBe("void");
        const away = passUntil(engine, state, at(engine, other, "day"));
        const dawn = passUntil(engine, away.state, at(engine, side, "day"));
        expect(dawn.events).toContainEqual(expect.objectContaining({ kind: "cardDrawn", side, instance: ids[side].deck[amount] }));
        expect(dawn.events.filter((event) => event.kind === "eroded" && event.side === side).map((event) => event.kind === "eroded" ? event.instance : null)).toEqual(ids[side].deck.slice(amount + 1, 2 * amount + 1));
        expect(engine.legalActions(dawn.state, side)).toContainEqual({ kind: "play", card: ids[side].void[0], from: "void" });
        expect(engine.legalActions(dawn.state, side)).not.toContainEqual({ kind: "play", card: ids[side].void[1], from: "void" });
      },
    });
  }
  for (const chooseSource of [true, false]) {
    scenarios.push({
      name: `${soul.id} ${side} grants plain Reclaim to ${chooseSource ? "its dissolved source" : "another own Survivor"}`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { back: [SOUL], hand: [v.dissolveVictim.id], void: [v.survivorVictim.id, v.vanilla1.id], energy: 2, deck },
          [other]: { void: [v.survivorVictim.id], deck },
        },
        steps: (ids) => [playFromHand(ids, side)],
        answers: (ids) => [[chooseSource ? ids[side].back[0]! : ids[side].void[0]]],
      },
      check: ({ state, ids, events, answers }) => {
        const source = ids[side].back[0]!, survivor = ids[side].void[0];
        const chosen = chooseSource ? source : survivor;
        expect(state.instances[source]).toMatchObject({ zone: "void", owner: side });
        expect(events).toContainEqual({ kind: "dissolved", instance: source, side });
        expect(answers.map((answer) => answer.value)).toContainEqual([chosen]);
        expect(hasKeyword(state, engine.catalog, chosen, "reclaim")).toBe(true);
        for (const untouched of [chooseSource ? survivor : source, ids[side].void[1], ids[other].void[0]]) {
          expect(state.instances[untouched].zone).toBe("void");
          expect(hasKeyword(state, engine.catalog, untouched, "reclaim")).toBe(false);
        }
        expect(engine.legalActions(state, side)).toContainEqual({ kind: "play", card: chosen, from: "void" });
        expect(state.sides[side].currentEnergy).toBe(2);
      },
    });
  }
}

export default { slug: "cards-93", scenarios } satisfies ScenarioModule;
