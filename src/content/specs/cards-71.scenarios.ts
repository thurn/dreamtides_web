/** D20: Stored counters join these cards' payments to their other abilities. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../engine/fold/slice";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { SIDES, opponent } from "../../engine/state/ids";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { invariantViolations } from "../../engine/testing/invariants";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import desolation from "../cards/desolation-s-edge-8855e20c";
import spirit from "../cards/spirit-field-reclaimer-78673e2b";

const desolationId = parseCardId(desolation.id);
const spiritId = parseCardId(spirit.id);
const engine = createEngine(testCatalog([engineCardFromContent(desolation), engineCardFromContent(spirit)]));
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected applied intent: ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const scenarios: NamedScenario[] = SIDES.flatMap((side): NamedScenario[] => {
  const other = opponent(side);
  return [
    ...[0, 1].map((stored): NamedScenario => ({
      name: `${desolation.id} ${side} stores ${stored} and self-abandons to dissolve the inclusive cost band on both battlefields`,
      spec: {
        board: { active: side, phase: "day", scoreToWin: 100,
          [side]: { back: [desolationId, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] },
          [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], hand: [v.interruptEvent.id], energy: 1 },
        },
        steps: (ids) => stored === 0 ? [] : [
          { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
          { side: other, action: { kind: "pass" } },
        ],
      },
      check: ({ state, ids, events }) => {
        const source = ids[side].back[0]!;
        expect(state.instances[source].status.counters).toBe(stored);
        expect(state.instances[source].status.exhausted).toBe(stored === 1);
        expect(events.filter((e) => e.kind === "countersChanged" && e.instance === source)).toHaveLength(stored);
        const paid = engine.apply(state, side, { kind: "activate", source, ability: 1 }, NO_PROMPTS);
        expect(paid.state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
        expect(paid.state.stack).toHaveLength(1);
        expect(paid.state.stack[0]).toMatchObject({ source, controller: side });
        const restored = deserializeState(serializeState(paid.state));
        expect(stateHash(restored)).toBe(stateHash(paid.state));
        const resolved = createEngine(engine.catalog).apply(restored, other, { kind: "pass" }, NO_PROMPTS);
        for (const ofSide of SIDES) {
          const subjects = ofSide === side ? ids[side].back.slice(1) : ids[other].back;
          expect(subjects.map((id) => resolved.state.instances[id!].zone)).toEqual([0, 1, 2, 3].map((cost) => cost <= stored ? "void" : "play"));
        }
        expect(resolved.events.filter((e) => e.kind === "dissolved")).toHaveLength((stored + 1) * 2);
        expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
      },
    })),
    {
      name: `${spirit.id} ${side} pays from both voids and its live counter benefit follows Support adjacency through cancellation and reload`,
      spec: {
        board: { active: side, phase: "day", scoreToWin: 100,
          [side]: { front: [v.vanilla2.id, v.vanilla3.id, v.vanilla1.id], back: [null, spiritId], void: [v.vanilla1.id, v.event0.id], energy: 3 },
          [other]: { void: [v.vanilla2.id, v.event0.id], hand: [v.interruptEvent.id], energy: 1 },
        },
        steps: () => [],
      },
      check: ({ state, ids }) => {
        const source = ids[side].back[1]!;
        const action = { kind: "activate" as const, source, ability: 1 };
        const sparks = (slice: BattleSlice) => ids[side].front.map((id) => engine.view(slice.committed, side).instances[id!].characteristics.spark);
        const fold = createFoldAdapter(engine);
        const committed = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
        const initial: BattleSlice = { committed, inFlight: null, publishedEvents: 0, attempt: 0 };
        expect(sparks(initial)).toEqual([2, 3, 1]);
        const waiting = applied(fold.reduce(initial, { kind: "battleAction", side, action }));
        const pending = fold.pending(waiting)!;
        expect(pending.prompt).toMatchObject({ kind: "chooseCards", side, purpose: { role: "banishAnyVoidCost" }, min: 1, max: 1 });
        if (pending.prompt.kind !== "chooseCards") throw new Error("Expected a void-character payment choice");
        expect(new Set(pending.prompt.candidates)).toEqual(new Set([ids[side].void[0], ids[other].void[0]]));
        const restored = JSON.parse(JSON.stringify(waiting)) as BattleSlice;
        const fresh = createFoldAdapter(createEngine(engine.catalog));
        expect(fresh.pending(restored)).toEqual(pending);
        const cancelled = applied(fresh.reduce(restored, { kind: "cancel", side, promptId: pending.prompt.id }));
        expect(cancelled.committed).toEqual(committed);
        expect(sparks(cancelled)).toEqual([2, 3, 1]);
        expect(fresh.reduce(cancelled, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].void[0]] }).kind).toBe("bounced");
        expect(fresh.reduce(restored, { kind: "answer", side: other, promptId: pending.prompt.id, value: [ids[side].void[0]] }).kind).toBe("bounced");
        expect(fresh.reduce(restored, { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].void[1]] }).kind).toBe("bounced");
        let settled = cancelled;
        for (const [index, owner] of [side, other].entries()) {
          const opened = applied(fresh.reduce(settled, { kind: "battleAction", side, action }));
          const prompt = fresh.pending(opened)!.prompt;
          const paid = applied(fresh.reduce(opened, { kind: "answer", side, promptId: prompt.id, value: [ids[owner].void[0]] }));
          expect(paid.committed.instances[ids[owner].void[0]].zone).toBe("banished");
          expect(paid.committed.sides[owner].banished).toContain(ids[owner].void[0]);
          expect(paid.committed.sides[side].currentEnergy).toBe(2 - index);
          expect(paid.committed.instances[source].status.counters).toBe(index);
          settled = applied(fresh.reduce(paid, { kind: "battleAction", side: other, action: { kind: "pass" } }));
          expect(settled.committed.instances[source].status.counters).toBe(index + 1);
          expect(sparks(settled)).toEqual([3 + index, 4 + index, 1]);
          expect(settled.committed.instances[ids[side].void[1]].zone).toBe("void");
          expect(settled.committed.instances[ids[other].void[1]].zone).toBe("void");
        }
        const moved = applied(fresh.reduce(settled, { kind: "battleAction", side, action: { kind: "reposition", card: source, to: { rank: "front", index: 4 } } }));
        expect(moved.committed.instances[source].status.counters).toBe(2);
        expect(sparks(moved)).toEqual([2, 3, 1]);
        expect(invariantViolations(moved.committed, engine.catalog)).toEqual([]);
      },
    },
  ];
});

export default { slug: "cards-71", scenarios } satisfies ScenarioModule;
