/** Strict live void-cost targeting and prepared/resolving X. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, countCards, energyX, event, fromVoid, x } from "../../../dsl/builders";
import { targetCandidates } from "../../interpreter";
import { SIDES, opponent } from "../../../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { returnFromVoid } from "../return-from-void";
import { labBoard } from "../../../testing/lab-solver";
import { triggered, onMaterialized } from "../../../dsl/triggers";
import { triggerSubjectCost } from "../../../dsl/builders";

const zeroEvent: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560100) };
const zeroOther: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x560101), subtype: "Explorer" };
const catalog = testCatalog([zeroEvent, zeroOther]);
describe("strict void copiable-cost bounds", () => {
  it.each(SIDES.flatMap(side => [0, 1, 3].map(limit => ({ side, limit }))))("excludes equal and greater costs for $side/limit=$limit", ({ side, limit }) => {
    const initial = boardState(catalog, { active: side, phase: "day", [side]: { back: [v.vanilla5.id], void: [v.vanilla0.id, v.vanilla1.id, v.vanilla3.id, v.vanilla5.id, zeroEvent.id, zeroOther.id] }, [opponent(side)]: { void: [v.vanilla0.id] } });
    const spec = fromVoid({ cardType: "character", subtype: "Warrior" }, { costLessThan: limit });
    const eligible = limit === 0 ? [] : initial.ids[side].void.slice(0, limit === 1 ? 1 : 2);
    expect(targetCandidates(initial.state, catalog, spec, side, initial.ids[side].back[0]!)).toEqual(eligible);
    expect(targetCandidates(initial.state, catalog, fromVoid(spec.filter, { costLessThan: limit, another: true }), side, initial.ids[side].void[0])).toEqual(eligible.filter(id => id !== initial.ids[side].void[0]));
    expect(targetCandidates(initial.state, catalog, fromVoid(spec.filter, { player: "opponent", costLessThan: limit }), side, initial.ids[side].back[0]!)).toEqual(limit === 0 ? [] : initial.ids[opponent(side)].void);
  });

  it.each(SIDES)("prepares explicit X before strict activation targets for %s", side => {
    const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x560110), abilities: () => [activated([energyX(0)], returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: x() })))] };
    const engine = createEngine(testCatalog([source]));
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [source.id], void: [v.vanilla0.id, v.vanilla1.id, v.vanilla3.id], energy: 3 } });
    const state = { ...initial.state, config: { ...initial.state.config, autoAnswerForcedPrompts: false } };
    const answers = new ScriptedSource([2, [initial.ids[side].void[1]]]);
    const activatedStep = runStep(state, { kind: "activate", source: initial.ids[side].back[0]!, ability: 0 }, answers, engine.catalog);
    if (activatedStep.kind !== "done") throw new Error("Unexpected activation prompt");
    answers.assertExhausted();
    expect(activatedStep.state.sides[side].currentEnergy).toBe(1);
    const done = runStep(activatedStep.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (done.kind !== "done") throw new Error("Unexpected resolution prompt");
    expect(done.state.instances[initial.ids[side].void[1]].zone).toBe("hand");
    expect(done.state.instances[initial.ids[side].void[2]].zone).toBe("void");
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("rechecks a live count after the card leaves hand for %s", side => {
    const card: EngineCardDefinition = { ...v.event0, id: syntheticId(0x560111), abilities: () => [event(returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: countCards("hand") })))] };
    const engine = createEngine(testCatalog([card]));
    const initial = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id, v.vanilla5.id], void: [v.vanilla1.id] } });
    const state = { ...initial.state, config: { ...initial.state.config, autoAnswerForcedPrompts: false } };
    const cast = runStep(state, { kind: "play", card: initial.ids[side].hand[0], from: "hand" }, new ScriptedSource([[initial.ids[side].void[0]]]), engine.catalog);
    if (cast.kind !== "done") throw new Error("Unexpected play prompt");
    const resolved = runStep(cast.state, { kind: "resolveTop" }, NO_PROMPTS, engine.catalog);
    if (resolved.kind !== "done") throw new Error("Unexpected resolution prompt");
    expect(resolved.state.instances[initial.ids[side].void[0]].zone).toBe("void");
    expect(resolved.events).toContainEqual({ kind: "noLegalTarget", source: initial.ids[side].hand[0] });
  });

  it.each(SIDES)("stages strict constants and retained Materialized subject bounds for %s", side => {
    const source: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(0x560112), abilities: () => [triggered(onMaterialized(), returnFromVoid(fromVoid({ subtype: "Warrior" }, { costLessThan: triggerSubjectCost() })))] };
    const engine = createEngine(testCatalog([source]));
    const { setup } = labBoard(engine, { cardId: source.id }, [source], side);
    const board = boardState(engine.catalog, setup);
    expect(board.state.sides[side].void.length).toBeGreaterThan(0);
    expect(targetCandidates(board.state, engine.catalog, fromVoid({ subtype: "Warrior" }, { costLessThan: 3 }), side, board.ids[side].hand[0])).toEqual(board.ids[side].void);
  });
});
