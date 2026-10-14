/** D20: stored counters feed a paid-X target bound and random opponent-deck transfer. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../engine/catalog";
import { engineCardFromContent } from "../../engine/content-catalog";
import { energy } from "../../engine/dsl/builders";
import { createEngine } from "../../engine/engine";
import type { Prompt } from "../../engine/prompts/types";
import { opponent } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import { InlineSource, NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import elder from "../cards/dawnhorn-elder-691883df";
import herald from "../cards/eclipse-herald-764b62f6";
import lookout from "../cards/celestial-lookout-374ec185";

const HERALD = parseCardId(herald.id), LOOKOUT = parseCardId(lookout.id);
// This private synthetic definition is used only by the public private-catalog run below.
const event2: EngineCardDefinition = { ...v.event1, id: syntheticId(0x18400), costs: [energy(2)] };
const engine = createEngine(testCatalog([elder, herald, lookout].map(engineCardFromContent).concat(event2)));
const settle = (state: BattleState) => passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const amount = amplified ? 2 : 1;
    const matching = amplified ? v.vanilla2 : v.vanilla1;
    scenarios.push({
      name: `${herald.id} ${side} ${amplified ? "amplified" : "base"} paid X remains positive after spending all counters and includes lower spark`,
      spec: {
        board: { active: side, phase: "day",
          [side]: { hand: [{ cardId: HERALD, amplified }], energy: 10 },
          [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] },
        },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state: played, ids, events: playEvents }) => {
        const source = ids[side].hand[0], chosen = ids[other].back[1]!;
        let state = settle(played).state;
        expect(state.instances[source].printing).toEqual({ kind: "card", cardId: HERALD });
        expect(state.instances[source].variant.amplified).toBe(amplified);
        const beforeStore = state.sides[side].currentEnergy;
        const storage = engine.apply(state, side, { kind: "activate", source, ability: 0 }, NO_PROMPTS);
        const stored = settle(storage.state);
        state = stored.state;
        expect(state.instances[source].status.counters).toBe(amount);
        expect(state.sides[side].currentEnergy).toBe(beforeStore - 3);
        expect([...storage.events, ...stored.events]).toContainEqual({ kind: "countersChanged", instance: source, counters: amount });
        const roles: string[] = [];
        const answer = (prompt: Prompt) => {
          roles.push(prompt.purpose.role);
          expect(prompt.side).toBe(side);
          expect(prompt.purpose.source).toBe(source);
          if (prompt.kind === "chooseNumber") {
            expect(prompt).toMatchObject({ min: 0, max: amount, purpose: { role: "chooseX" } });
            return amount;
          }
          if (prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind}`);
          expect(prompt.candidates).toEqual(ids[other].back.slice(0, amount + 1));
          expect(prompt.candidates).not.toContain(ids[other].back[3]);
          return [chosen];
        };
        let sawPayment = false;
        const paid = engine.apply(state, side, { kind: "activate", source, ability: 1 }, new InlineSource({ player: answer, enemy: answer }), (committed, step) => {
          if (step.kind !== "activate") return;
          sawPayment = true;
          expect(committed.stack).toContainEqual(expect.objectContaining({ kind: "ability", source, controller: side, x: amount }));
          expect(committed.instances[source].status.counters).toBe(0);
        });
        expect(sawPayment).toBe(true);
        expect(roles).toEqual(["chooseX", "target"]);
        expect(paid.state.instances[source].status.counters).toBe(0);
        expect(paid.state.sides[side].currentEnergy).toBe(state.sides[side].currentEnergy);
        expect(paid.events).toContainEqual({ kind: "countersChanged", instance: source, counters: 0 });
        const done = settle(paid.state);
        expect(done.state.instances[chosen]).toMatchObject({ printing: { cardId: v.vanilla1.id }, zone: "void", owner: other });
        expect(done.state.sides[other].void).toContain(chosen);
        for (const untouched of ids[other].back.filter(id => id !== null && id !== chosen)) expect(done.state.instances[untouched!].zone).toBe("play");
        expect([...paid.events, ...done.events].filter(event => event.kind === "dissolved")).toEqual([
          expect.objectContaining({ kind: "dissolved", instance: chosen, side: other, removal: { kind: "effect", controller: side, victimCost: 1 } }),
        ]);
        expect(playEvents).toContainEqual({ kind: "cardPlayed", instance: source, side });
      },
    });
    scenarios.push({
      name: `${lookout.id} ${side} ${amplified ? "amplified" : "base"} character storage pays X for a physical exact-cost opponent-deck materialization`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: LOOKOUT, amplified }], energy: 10 } },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state: sharedPlayed, ids: sharedIds }) => {
        expect(sharedPlayed.instances[sharedIds[side].hand[0]]).toMatchObject({ printing: { cardId: LOOKOUT }, zone: "play", status: { counters: 0 } });
        // The shared scenario catalog has no cost-2 synthetic event. Run the full
        // composition through the public scenario producer with this private catalog.
        const wrongType = amplified ? event2 : v.event1;
        const fixture = runScenario(engine, {
          board: { active: side, phase: "day",
            [side]: { hand: [{ cardId: LOOKOUT, amplified }, v.event0.id, v.vanilla0.id], deck: [matching.id, v.event0.id], energy: 10 },
            [other]: { deck: [wrongType.id, v.vanilla0.id, matching.id, matching.id, v.vanilla3.id] },
          },
          steps: ids => [playFromHand(ids, side)],
        });
        const { ids } = fixture;
        const source = ids[side].hand[0];
        let state = settle(fixture.state).state;
        expect(state.instances[source]).toMatchObject({ printing: { cardId: LOOKOUT }, zone: "play", variant: { amplified }, status: { counters: 0 } });
        const eventPlayed = engine.apply(state, side, playFromHand(ids, side, 1).action, NO_PROMPTS);
        state = settle(eventPlayed.state).state;
        expect(state.instances[source].status.counters).toBe(0);
        const characterPlayed = engine.apply(state, side, { kind: "play", card: ids[side].hand[2], from: "hand", slot: { rank: "back", index: 1 } }, NO_PROMPTS);
        const triggered = settle(characterPlayed.state);
        state = triggered.state;
        expect(state.instances[source].status.counters).toBe(amount);
        expect([...characterPlayed.events, ...triggered.events]).toContainEqual({ kind: "countersChanged", instance: source, counters: amount });
        expect([...characterPlayed.events, ...triggered.events].filter(event => event.kind === "triggerQueued" && event.source === source)).toEqual([
          expect.objectContaining({ controller: side, ability: 0, subject: ids[side].hand[2] }),
        ]);
        const answers = new ScriptedSource([amount]);
        let sawPayment = false;
        const paid = engine.apply(state, side, { kind: "activate", source, ability: 1 }, answers, (committed, step) => {
          if (step.kind !== "activate") return;
          sawPayment = true;
          expect(committed.stack).toContainEqual(expect.objectContaining({ kind: "ability", source, controller: side, x: amount }));
          expect(committed.instances[source].status.counters).toBe(0);
        });
        expect(sawPayment).toBe(true);
        answers.assertExhausted();
        expect(paid.answers.map(answer => answer.value)).toEqual([amount]);
        expect(paid.state.instances[source].status.counters).toBe(0);
        expect(paid.state.sides[side].currentEnergy).toBe(state.sides[side].currentEnergy);
        expect(paid.events).toContainEqual({ kind: "countersChanged", instance: source, counters: 0 });
        const done = settle(paid.state);
        const resolutionEvents = [...paid.events, ...done.events];
        const arrivals = resolutionEvents.filter(event => event.kind === "materialized");
        expect(arrivals).toHaveLength(1);
        const picked = arrivals[0].instance;
        expect(ids[other].deck.slice(2, 4)).toContain(picked);
        expect(done.state.instances[picked]).toMatchObject({ printing: { kind: "card", cardId: matching.id }, owner: other, controller: side, zone: "play", status: { exhausted: true } });
        expect(done.state.sides[side].backRank).toContain(picked);
        expect(done.state.sides[side].deck).toEqual(ids[side].deck);
        expect(done.state.sides[other].deck).toEqual(ids[other].deck.filter(id => id !== picked));
        expect(resolutionEvents.filter(event => event.kind === "cardPlayed" || event.kind === "triggerQueued")).toEqual([]);
        expect(resolutionEvents.filter(event => event.kind === "countersChanged")).toEqual([{ kind: "countersChanged", instance: source, counters: 0 }]);
        expect(done.state.instances[source].status.counters).toBe(0);
      },
    });
  }
}

export default { slug: "cards-72", scenarios } satisfies ScenarioModule;
