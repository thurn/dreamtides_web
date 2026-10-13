import { describe, expect, it } from "vitest";
import { createEngine, createCatalog } from "../index";
import { energy } from "../dsl/builders";
import { battleSeed, type Side } from "../state/ids";
import { createFoldAdapter } from "../fold/slice";
import { testCardId, testCardSubtype, testDreamwellCardId, testTutorialAiActionOverrideId } from "../../types/test-identities";
import { aiDecision, runPolicy } from "./decide";
import type { PolicyOverrideContext } from "./overrides";
const first = testCardId("override-first"), second = testCardId("override-second"), dreamwell = testDreamwellCardId("override-trigger");
const engine = createEngine(createCatalog([first, second].map((id, index) => ({ id, cardType: "character" as const, costs: [energy(index === 0 ? 2 : 0)], spark: 2, subtype: testCardSubtype("fixture"), speed: "standard" as const, status: "vanilla" as const, abilities: () => [] })), []));
function scenario(side: Side, energyAvailable = 5, hand = true) {
    const other = side === "player" ? "enemy" : "player";
    const decks = { player: [], enemy: [], [side]: [{ cardId: first }, { cardId: second }] } as const;
    const init = { seed: battleSeed("override-contract"), scoreToWin: 30, startingSide: side, decks, dreamwell: [], setup: { placements: hand ? [{ side, deckIndex: 0, zone: "hand" as const }, { side, deckIndex: 1, zone: "hand" as const }] : [], sides: { player: { currentEnergy: energyAvailable, maxEnergy: energyAvailable, score: 0 }, enemy: { currentEnergy: energyAvailable, maxEnergy: energyAvailable, score: 0 } }, turn: { active: side, phase: "day" as const, round: 1, turnNumber: 1, sideTurns: { [side]: 1, [other]: 0 } as Record<Side, number>, lastNormal: side }, dreamwell: { deck: [], next: 0 } } };
    const opened = createFoldAdapter(engine).start(init);
    if (opened.kind !== "applied")
        throw Error("fixture start bounced");
    const definitions = [first, second].map((cardId, index) => ({ id: testTutorialAiActionOverrideId(`override-${index}`), trigger: { kind: "after-dreamwell" as const, side, cardId: dreamwell }, action: { kind: "play-card" as const, cardId } }));
    const context: PolicyOverrideContext = { definitions, consumed: [], dreamwell: { side, cardId: dreamwell, turnNumber: 1 } };
    const request = aiDecision({ engine, init, slice: opened.slice, pending: null, side, policy: "random", overrides: context, budgets: { response: { iterations: 1 }, turnPlanning: { iterations: 1 } } });
    if (request === null)
        throw Error("fixture has no decision");
    return { init, request, context, state: opened.slice.committed };
}
describe("source-order policy overrides", () => {
    it.each(["player", "enemy"] as const)("selects the first UUID match on %s through an ordinary legal play", side => {
        const fixture = scenario(side), result = runPolicy(engine, fixture.request.request);
        expect(result.override).toMatchObject({ kind: "selected", selection: { id: fixture.context.definitions[0].id, triggerCardId: dreamwell, actionCardId: first } });
        expect(result.choice.kind).toBe("action");
        if (result.choice.kind !== "action" || result.choice.action.kind !== "play")
            throw Error("expected play");
        expect(engine.legalActions(fixture.state, side)).toContainEqual(result.choice.action);
        expect(fixture.state.instances[result.choice.action.card].printing).toEqual({ kind: "card", cardId: first });
    });
    it("a blocked first match yields to policy and does not try a later affordable match", () => {
        const fixture = scenario("enemy", 0), result = runPolicy(engine, fixture.request.request);
        expect(result.override).toMatchObject({ kind: "blocked", id: fixture.context.definitions[0].id, reason: "insufficient-energy" });
        expect(result.choice.kind).toBe("action");
        if (result.choice.kind === "action")
            expect(engine.legalActions(fixture.state, "enemy")).toContainEqual(result.choice.action);
    });
    it("the sole-action route still reports blocked metadata", () => {
        const fixture = scenario("enemy", 5, false);
        expect(fixture.request.forced).toBeNull();
        expect(runPolicy(engine, fixture.request.request).override).toMatchObject({ kind: "blocked", reason: "card-not-in-hand" });
    });
    it("uses a later legal physical copy of the first UUID override", () => {
        const fixture = scenario("enemy", 0), init = { ...fixture.init, decks: { ...fixture.init.decks, enemy: [{ cardId: first }, { cardId: first, deckMods: { sparkBonus: 0, costReduction: 2, fast: false, reclaim: null, typeChange: null } }] }, setup: { ...fixture.init.setup, placements: [{ side: "enemy" as const, deckIndex: 0, zone: "hand" as const }, { side: "enemy" as const, deckIndex: 1, zone: "hand" as const }] } };
        const opened = createFoldAdapter(engine).start(init);
        if (opened.kind !== "applied")
            throw Error("copies refused");
        const request = aiDecision({ engine, init, slice: opened.slice, pending: null, side: "enemy", policy: "random", overrides: fixture.context });
        if (request === null)
            throw Error("no decision");
        expect(runPolicy(engine, request.request).override).toMatchObject({ kind: "selected", selection: { id: fixture.context.definitions[0].id, actionCardId: first, instance: opened.slice.committed.sides.enemy.hand[1] } });
    });
    it("consumption and trigger identity skip only their matching definitions", () => {
        const fixture = scenario("enemy");
        const consumed = { ...fixture.context, consumed: [fixture.context.definitions[0].id] };
        expect(runPolicy(engine, { ...fixture.request.request, overrides: consumed }).override).toMatchObject({ kind: "selected", selection: { actionCardId: second } });
        expect(runPolicy(engine, { ...fixture.request.request, overrides: { ...consumed, dreamwell: { side: "enemy", cardId: testDreamwellCardId("unmatched"), turnNumber: 1 } } }).override).toBeUndefined();
    });
});
