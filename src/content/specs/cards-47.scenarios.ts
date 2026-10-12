/** D20: Carrion's activated abandon feeds its own creation trigger, including a created successor. */
import { expect } from "vitest";
import { createCatalog } from "../../engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions, contentDreamwellDefinitions, contentFigmentDefinitions } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import { SIDES, opponent, parseFigmentId } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC, SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { invariantViolations } from "../../engine/testing/invariants";
import { parseCardId } from "../../types/card-identity";
import carrion from "../cards/carrion-lord-a5056a4c";
import monstrosity from "../figments/monstrosity-ec9f97b2";

const CARRION = parseCardId(carrion.id), MONSTROSITY = parseFigmentId(monstrosity.id);
// The exported catalog factories and composition match the existing scenario runner.
const engine = createEngine(createCatalog(
  [...SYNTHETIC_CARDS, ...contentCardDefinitions()], contentDreamwellDefinitions(),
  { avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions() }, contentFigmentDefinitions(),
));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = SIDES.flatMap((side) => [false, true].map((amplified): NamedScenario => ({
  name: `${carrion.id} ${side} ${amplified ? "amplified" : "base"} selected abandonment creates a figment whose abandonment creates its successor`,
  spec: {
    board: { active: side, phase: "day", [side]: { hand: [{ cardId: CARRION, amplified }], back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 14, deck }, [opponent(side)]: { deck } },
    steps: (ids) => [playFromHand(ids, side), { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } }],
    answers: (ids) => [[ids[side].back[0]!]],
  },
  check: ({ state, ids, events }) => {
    const source = ids[side].hand[0], selected = ids[side].back[0]!;
    const abandoned = events.findIndex((e) => e.kind === "abandoned" && e.instance === selected && e.side === side);
    const triggered = events.findIndex((e) => e.kind === "triggerQueued" && e.source === source && e.controller === side && e.ability === 0);
    const first = events.find((e) => {
      if (e.kind !== "materialized") return false;
      const printing = state.instances[e.instance]?.printing;
      return printing?.kind === "figment" && printing.figment === MONSTROSITY;
    });
    if (first?.kind !== "materialized") throw new Error("expected the triggered figment's physical materialization");
    expect(abandoned).toBeGreaterThanOrEqual(0);
    expect(triggered).toBeGreaterThan(abandoned);
    expect(events.indexOf(first)).toBeGreaterThan(triggered);
    expect(state.instances[selected].zone).toBe("void");
    expect(state.instances[ids[side].back[1]!].zone).toBe("play");
    expect(state.instances[first.instance]).toMatchObject({ owner: side, controller: side, zone: "play", printing: { kind: "figment", figment: MONSTROSITY } });
    const firstPrinting = state.instances[first.instance].printing;
    const answers = new ScriptedSource([[first.instance]]);
    const next = engine.apply(state, side, { kind: "activate", source, ability: 1 }, answers);
    answers.assertExhausted();
    const ceased = next.events.findIndex((e) => e.kind === "ceasedToExist" && e.instance === first.instance);
    const secondAbandon = next.events.findIndex((e) => e.kind === "abandoned" && e.instance === first.instance && e.side === side);
    const secondTrigger = next.events.findIndex((e) => e.kind === "triggerQueued" && e.source === source && e.controller === side && e.ability === 0);
    const successor = next.events.find((e) => {
      if (e.kind !== "materialized") return false;
      const printing = next.state.instances[e.instance]?.printing;
      return printing?.kind === "figment" && printing.figment === MONSTROSITY;
    });
    if (successor?.kind !== "materialized") throw new Error("expected the successor figment's physical materialization");
    expect(secondAbandon).toBeGreaterThanOrEqual(0);
    expect(ceased).toBeGreaterThan(secondAbandon);
    expect(secondTrigger).toBeGreaterThan(secondAbandon);
    expect(next.events.indexOf(successor)).toBeGreaterThan(ceased);
    expect(next.events.indexOf(successor)).toBeGreaterThan(secondTrigger);
    expect(next.state.instances[first.instance]).toBeUndefined();
    expect(successor.instance).not.toBe(first.instance);
    expect(next.state.instances[successor.instance]).toMatchObject({ owner: side, controller: side, zone: "play", printing: firstPrinting });
    expect(next.state.instances[source].variant.amplified).toBe(amplified);
    expect(invariantViolations(next.state, engine.catalog)).toEqual([]);
  },
})));

export default { slug: "cards-47", scenarios } satisfies ScenarioModule;
