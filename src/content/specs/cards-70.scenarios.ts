/** D20: Dawn and paid abandonment fund the same physical source's other ability. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { event, target, anyCharacter } from "../../engine/dsl/builders";
import { returnToHand } from "../../engine/effects/primitives";
import { createEngine } from "../../engine/engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../engine/fold/slice";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, SIDES, type InstanceId, type Side } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import { invariantViolations } from "../../engine/testing/invariants";
import { playFromHand, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseCardId } from "../../types/card-identity";
import mirror from "../cards/mirrorlight-architect-ccbefadc";
import steel from "../cards/steel-abomination-d89f4c33";

const MIRROR = parseCardId(mirror.id), STEEL = parseCardId(steel.id);
const removal = { ...v.interruptEvent, id: syntheticId(0x18201), status: "authored" as const,
  abilities: () => [event(returnToHand(target(anyCharacter())))],
};
const engine = createEngine(testCatalog([engineCardFromContent(mirror), engineCardFromContent(steel), removal]));
const deck = Array.from({ length: 8 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const activate = (source: InstanceId, ability: number) => ({ kind: "activate" as const, source, ability });
function nextDawn(state: BattleState, side: Side) {
  const away = passUntil(engine, state, at(engine, opponent(side), "day"));
  return passUntil(engine, away.state, at(engine, side, "day"));
}

for (const side of SIDES) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const maximum = amplified ? 2 : 1;
    const matching = amplified ? v.vanilla2.id : v.vanilla1.id;
    scenarios.push({
      name: `${mirror.id} ${side} ${amplified ? "amplified" : "base"} earns Dawn counters and privately materializes the second bounded physical card through reload`,
      spec: {
        board: { active: side, phase: "day", [side]: { hand: [{ cardId: MIRROR, amplified }, v.vanilla0.id, matching, matching, v.vanilla3.id, v.event0.id], energy: 5, deck },
          [other]: { hand: [v.interruptEvent.id], energy: 1, deck } },
        steps: ids => [playFromHand(ids, side)],
      },
      check: ({ state, ids }) => {
        const source = ids[side].hand[0], chosen = ids[side].hand[3];
        expect(state.instances[source].status.counters).toBe(0);
        const dawn = nextDawn(state, side);
        expect(dawn.events.filter(e => e.kind === "countersChanged" && e.instance === source)).toEqual([{ kind: "countersChanged", instance: source, counters: maximum }]);
        const fold = createFoldAdapter(engine, { checkEventPrefix: true });
        const paid = applied(fold.reduce(sliceOf(dawn.state), { kind: "battleAction", side, action: activate(source, 1) }));
        expect(paid.committed.instances[source].status).toMatchObject({ counters: maximum, exhausted: true });
        const waiting = applied(fold.reduce(paid, { kind: "battleAction", side: other, action: { kind: "pass" } }));
        const pending = fold.pending(waiting)!;
        expect(pending.prompt).toMatchObject({ kind: "chooseCards", side, privateTo: side, min: 1, max: 1, cancellable: false, purpose: { cardId: MIRROR, source, ability: 1, role: "materializeChosen" } });
        if (pending.prompt.kind !== "chooseCards") throw new Error("Expected a private hand choice");
        expect(pending.prompt.candidates).toEqual(ids[side].hand.slice(1, 4));
        const loaded = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
        const fresh = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
        expect(fresh.pending(loaded)).toEqual(pending);
        expect(fresh.reduce(loaded, { kind: "answer", side: other, promptId: pending.prompt.id, value: [chosen] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
        expect(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].hand[4]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
        expect(fresh.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
        const outcome = fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [chosen] });
        const done = applied(outcome);
        if (outcome.kind !== "applied") throw new Error("Expected arrival");
        expect(outcome.published.filter(e => e.kind === "materialized")).toEqual([{ kind: "materialized", side, instance: chosen, slot: { rank: "back", index: 1 } }]);
        expect(outcome.published.filter(e => e.kind === "cardPlayed" || e.kind === "energyChanged")).toEqual([]);
        expect(done.committed.instances[chosen]).toMatchObject({ zone: "play", controller: side, owner: side, status: { exhausted: true } });
        expect(done.committed.sides[side].backRank.slice(0, 2)).toEqual([source, chosen]);
        expect(done.committed.instances[ids[side].hand[2]].zone).toBe("hand");
        expect(done.committed.instances[source].status).toMatchObject({ counters: maximum, exhausted: true });
        expect(done.committed.sides[side].currentEnergy).toBe(dawn.state.sides[side].currentEnergy);
        expect(done.committed.sides[other]).toEqual(dawn.state.sides[other]);
        expect(done.committed.stack).toEqual([]);
        expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
      },
    });
  }
  scenarios.push({
    name: `${mirror.id} ${side} Fast Night activation at zero materializes only a zero-cost character`,
    spec: { board: { active: side, phase: "night", [side]: { back: [MIRROR], hand: [v.vanilla0.id, v.vanilla1.id], deck }, [other]: { deck } },
      steps: ids => [{ side, action: activate(ids[side].back[0]!, 1) }] },
    check: ({ state, start, ids, events }) => {
      const source = ids[side].back[0]!, chosen = ids[side].hand[0];
      expect(state.instances[source].status).toMatchObject({ counters: 0, exhausted: true });
      expect(state.instances[chosen]).toMatchObject({ zone: "play", status: { exhausted: true } });
      expect(state.instances[ids[side].hand[1]].zone).toBe("hand");
      expect(events.filter(e => e.kind === "materialized")).toEqual([{ kind: "materialized", side, instance: chosen, slot: { rank: "back", index: 1 } }]);
      expect(events.filter(e => e.kind === "cardPlayed" || e.kind === "energyChanged")).toEqual([]);
      expect(state.sides[side].currentEnergy).toBe(start.sides[side].currentEnergy);
      expect(engine.legalActions(state, side)).not.toContainEqual(activate(source, 1));
    },
  }, {
    name: `${mirror.id} ${side} an actual response removes its earned Dawn counter before the hand maximum is read`,
    spec: { board: { active: side, phase: "day", [side]: { hand: [MIRROR, v.vanilla0.id, v.vanilla0.id, v.vanilla1.id], energy: 3, deck }, [other]: { hand: [v.interruptEvent.id], energy: 1, deck } }, steps: () => [] },
    check: ({ start }) => {
      // This case alone adds a synthetic removal Interrupt to its declared public board.
      const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [MIRROR, v.vanilla0.id, v.vanilla0.id, v.vanilla1.id], energy: start.sides[side].currentEnergy, deck }, [other]: { hand: [removal.id], energy: 1, deck } });
      const ids = setup.ids, source = ids[side].hand[0], chosen = ids[side].hand[2];
      const played = engine.apply(setup.state, side, { kind: "play", card: source, from: "hand" }, NO_PROMPTS);
      const settled = passUntil(engine, played.state, next => next.stack.length === 0);
      const dawn = nextDawn(settled.state, side);
      expect(dawn.state.instances[source].status.counters).toBe(1);
      const paid = engine.apply(dawn.state, side, activate(source, 1), NO_PROMPTS);
      const fold = createFoldAdapter(engine);
      const waiting = applied(fold.reduce(sliceOf(paid.state), { kind: "battleAction", side: other, action: { kind: "play", card: ids[other].hand[0], from: "hand" } }));
      expect(waiting.committed.instances[source]).toMatchObject({ zone: "hand", status: { counters: 0 } });
      const pending = fold.pending(waiting)!;
      expect(pending.prompt).toMatchObject({ kind: "chooseCards", side, privateTo: side, purpose: { role: "materializeChosen" }, candidates: ids[side].hand.slice(1, 3) });
      const loaded = JSON.parse(JSON.stringify(waiting)) as BattleSlice, fresh = createFoldAdapter(createEngine(engine.catalog));
      expect(fresh.pending(loaded)).toEqual(pending);
      const finished = applied(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [chosen] }));
      expect(finished.committed.instances[chosen]).toMatchObject({ zone: "play", status: { exhausted: true } });
      expect(finished.committed.instances[ids[side].hand[3]].zone).toBe("hand");
      expect(finished.committed.instances[source]).toMatchObject({ zone: "hand", status: { counters: 0 } });
      expect(finished.committed.sides[side].currentEnergy).toBe(dawn.state.sides[side].currentEnergy);
      expect(finished.committed.stack).toEqual([]);
      expect(invariantViolations(finished.committed, engine.catalog)).toEqual([]);
    },
  }, {
    name: `${steel.id} ${side} cancellable other-character payments earn counters that self-abandon converts to points after reload`,
    spec: { board: { active: side, phase: "day", [side]: { back: [STEEL, v.vanilla1.id, v.vanilla1.id], energy: 2, deck }, [other]: { back: [v.vanilla1.id], hand: [v.interruptEvent.id], energy: 1, deck } }, steps: () => [] },
    check: ({ state, ids }) => {
      const source = ids[side].back[0]!, first = ids[side].back[1]!, second = ids[side].back[2]!;
      const fold = createFoldAdapter(engine), initial = sliceOf(state), action = activate(source, 0);
      const waiting = applied(fold.reduce(initial, { kind: "battleAction", side, action })), pending = fold.pending(waiting)!;
      expect(pending.prompt).toMatchObject({ kind: "chooseCards", side, cancellable: true, purpose: { role: "abandonCost" }, candidates: [first, second], min: 1, max: 1 });
      const loaded = JSON.parse(JSON.stringify(waiting)) as BattleSlice, fresh = createFoldAdapter(createEngine(engine.catalog));
      expect(fresh.pending(loaded)).toEqual(pending);
      expect(fresh.reduce(loaded, { kind: "answer", side, promptId: pending.prompt.id, value: [source] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fresh.reduce(loaded, { kind: "answer", side: other, promptId: pending.prompt.id, value: [first] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      const cancelled = applied(fresh.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(state);
      const reopened = applied(fresh.reduce(cancelled, { kind: "battleAction", side, action })), newPrompt = fresh.pending(reopened)!;
      expect(fresh.reduce(reopened, { kind: "answer", side, promptId: pending.prompt.id, value: [first] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const paid = applied(fresh.reduce(reopened, { kind: "answer", side, promptId: newPrompt.prompt.id, value: [first] }));
      expect(paid.committed.sides[side].currentEnergy).toBe(1);
      expect(paid.committed.instances[source].status.counters).toBe(0);
      const once = applied(fresh.reduce(paid, { kind: "battleAction", side: other, action: { kind: "pass" } }));
      expect(once.committed.instances[source].status.counters).toBe(1);
      const twicePaid = engine.apply(once.committed, side, action, NO_PROMPTS);
      const twice = engine.apply(twicePaid.state, other, { kind: "pass" }, NO_PROMPTS);
      expect(twice.state.instances[source].status.counters).toBe(2);
      expect(twice.state.sides[side].currentEnergy).toBe(0);
      const abandoned = engine.apply(twice.state, side, activate(source, 1), NO_PROMPTS);
      expect(abandoned.state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
      const restored = deserializeState(serializeState(abandoned.state));
      expect(stateHash(restored)).toBe(stateHash(abandoned.state));
      const done = createEngine(engine.catalog).apply(restored, other, { kind: "pass" }, NO_PROMPTS);
      expect(done.state.sides[side].score).toBe(state.sides[side].score + 2);
      expect(done.events.filter(e => e.kind === "pointsScored")).toEqual([{ kind: "pointsScored", side, amount: 2, cause: "effect" }]);
      expect([first, second, source].map(id => done.state.instances[id].zone)).toEqual(["void", "void", "void"]);
      expect(done.state.sides[other]).toEqual(state.sides[other]);
      expect(done.state.stack).toEqual([]);
      expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
    },
  }, {
    name: `${steel.id} ${side} self-abandon with zero stored counters resolves for zero points without energy`,
    spec: { board: { active: side, phase: "day", [side]: { back: [STEEL], score: 4, deck }, [other]: { hand: [v.interruptEvent.id], energy: 1, deck } },
      steps: ids => [{ side, action: activate(ids[side].back[0]!, 1) }, { side: other, action: { kind: "pass" } }] },
    check: ({ state, start, ids, events }) => {
      const source = ids[side].back[0]!;
      expect(state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
      expect(events).toContainEqual({ kind: "abilityResolved", side, source, ability: 1 });
      expect(events.filter(e => e.kind === "pointsScored" || e.kind === "energyChanged" || e.kind === "countersChanged")).toEqual([]);
      expect(state.sides[side].score).toBe(start.sides[side].score);
      expect(state.sides[other]).toEqual(start.sides[other]);
      expect(state.stack).toEqual([]);
    },
  });
}
export default { slug: "cards-70", scenarios } satisfies ScenarioModule;
