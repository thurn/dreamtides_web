/** D20: actual event-count/copy and discarded-card/next-payment emblem compositions. */
import { expect } from "vitest";
import { activated, additionalCost, discardCost, energy, event, target, anyCharacter } from "../../engine/dsl/builders";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { discard } from "../../engine/effects/primitives/discard";
import { dissolve } from "../../engine/effects/primitives/dissolve";
import { gainPoints } from "../../engine/effects/primitives/gain-points";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import { runScenario, playFromHand, type ScenarioModule, type NamedScenario, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseDreamsignId } from "../../types/identifiers";

const BLACK = parseDreamsignId("257c160f-7d70-4ebd-bb0f-f83e61907310");
const ACORN = parseDreamsignId("c706d0ba-2f41-4b14-95d8-db168ac6246c");
const paidDiscard = { ...v.event1, id: syntheticId(0x66601), status: "authored" as const,
  costs: [energy(3)], abilities: () => [additionalCost(discardCost()), event(gainPoints(1))] };
const discardTwo = { ...v.event0, id: syntheticId(0x66602), status: "authored" as const,
  abilities: () => [event(discard(2))] };
const targeted = { ...v.event1, id: syntheticId(0x66603), status: "authored" as const,
  costs: [energy(3)], abilities: () => [event(dissolve(target(anyCharacter())))] };
const fastDiscard = { ...v.discardOne, id: syntheticId(0x66604),
  abilities: () => [activated([discardCost()], gainPoints(1), { speed: "fast" })] };
const engine = createEngine(testCatalog([paidDiscard, discardTwo, targeted, fastDiscard], { dreamsigns: contentDreamsignDefinitions() }));
const deck = Array.from({ length: 8 }, () => v.event0.id);
const scenarios: NamedScenario[] = [];
const costs = (events: readonly EngineEvent[]) => events.filter((e) => e.kind === "effectStarted" && e.change.kind === "cost");
const copies = (events: readonly EngineEvent[]) => events.filter((e) => e.kind === "cardCopied");
const signs = () => ({ dreamsigns: [ACORN, ACORN], back: [v.discardOne.id],
  hand: [v.vanilla1.id, v.vanilla1.id, v.vanilla3.id, v.vanilla3.id], energy: 10, deck });
function witness(side: Side): ScenarioSpec {
  return { board: { active: side, phase: "day", [side]: signs(), [opponent(side)]: { deck } },
    steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
    answers: (ids) => [[ids[side].hand[0]]] };
}
for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  scenarios.push({ name: `${BLACK} ${side} actual second-event copies exclude characters and created copies`,
    spec: { board: { active: side, phase: "day", [side]: { dreamsigns: [BLACK, BLACK],
      hand: [v.event0.id, v.vanilla0.id, v.event0.id, v.event0.id], energy: 10, deck }, [other]: { deck } },
      steps: (ids) => [playFromHand(ids, side), { side, action: { kind: "play", card: ids[side].hand[1], from: "hand", slot: { rank: "back", index: 0 } } },
        playFromHand(ids, side, 2), playFromHand(ids, side, 3)] },
    check: (r) => {
      expect(copies(r.events).map((e) => e.original)).toEqual([r.ids[side].hand[2], r.ids[side].hand[2]]);
      expect(r.state.turnLog.played[side].map((e) => e.instance)).toEqual(r.ids[side].hand);
      expect(r.state.sides[side].currentEnergy).toBe(10);
      expect(copies(r.events).every((e) => e.side === side)).toBe(true);
      const b = runScenario(engine, { board: { active: other, phase: "dusk", [side]: {
        dreamsigns: [BLACK], hand: [v.interruptEvent.id, v.interruptEvent.id, v.interruptEvent.id], energy: 10, deck }, [other]: { deck } },
        steps: (ids) => [playFromHand(ids, side), playFromHand(ids, side, 1)] });
      expect(copies(b.events).map((e) => e.original)).toEqual([b.ids[side].hand[1]]);
      const loaded = deserializeState(serializeState(b.state));
      expect(stateHash(loaded)).toBe(stateHash(b.state));
      const next = passUntil(engine, loaded, at(engine, side, "day"));
      const first = engine.apply(next.state, side, { kind: "play", card: b.ids[side].hand[2], from: "hand" }, NO_PROMPTS);
      expect(copies(first.events)).toEqual([]);
      expect(first.state.turnLog.played[side].map((e) => e.instance)).toEqual([b.ids[side].hand[2]]);
    } });
  scenarios.push({ name: `${ACORN} ${side} discard payment creates a next-play allowance for each physical source`,
    spec: witness(side), check: (w) => {
      expect(costs(w.events)).toHaveLength(2);
      expect(w.state.floating.filter((e) => e.change.kind === "cost").map((e) => e.change)).toEqual([
        { kind: "cost", player: side, filter: {}, amount: -2, next: true }, { kind: "cost", player: side, filter: {}, amount: -2, next: true }]);
      const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { dreamsigns: [ACORN, ACORN],
        hand: [paidDiscard.id, v.vanilla1.id, v.vanilla1.id, targeted.id, v.vanilla3.id], back: [v.discardOne.id], energy: 10, deck },
        [other]: { back: [v.vanilla1.id, v.vanilla1.id], deck } });
      const paid = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, new ScriptedSource([[b.ids[side].hand[1]]]));
      expect(paid.state.sides[side].currentEnergy).toBe(7);
      expect(costs(paid.events)).toHaveLength(2);
      const again = engine.apply(paid.state, side, { kind: "activate", source: b.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[b.ids[side].hand[2]]]));
      expect(costs(again.events)).toEqual([]);
      const fold = createFoldAdapter(engine);
      const initial: BattleSlice = { committed: again.state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const opened = fold.reduce(initial, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[3], from: "hand" } });
      if (opened.kind !== "applied" || opened.error !== null) throw new Error("targeted play must open");
      const reloaded = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
      const prompt = fold.pending(reloaded)?.prompt;
      expect(prompt?.kind).toBe("chooseTargets");
      if (prompt === undefined || prompt === null) throw new Error("target prompt missing");
      const cancelled = fold.reduce(reloaded, { kind: "cancel", side, promptId: prompt.id });
      if (cancelled.kind !== "applied" || cancelled.error !== null) throw new Error("targeted play must cancel");
      expect(stateHash(cancelled.slice.committed)).toBe(stateHash(again.state));
      const played = engine.apply(cancelled.slice.committed, side, { kind: "play", card: b.ids[side].hand[4], from: "hand", slot: { rank: "back", index: 1 } }, NO_PROMPTS);
      expect(played.state.sides[side].currentEnergy).toBe(7);
      expect(played.state.floating.filter((e) => e.change.kind === "cost")).toEqual([]);
      expect(played.events.filter((e) => e.kind === "effectEnded")).toHaveLength(2);
      expect(played.state.sides[other].currentEnergy).toBe(0);
    } });
  scenarios.push({ name: `${ACORN} ${side} batch and hand-limit discards use one allowance and expire each turn`,
    spec: witness(side), check: (w) => {
      expect(costs(w.events)).toHaveLength(2);
      const batch = runScenario(engine, { board: { active: side, phase: "day", [side]: {
        dreamsigns: [ACORN, ACORN], hand: [discardTwo.id, v.vanilla1.id, v.vanilla1.id, v.event0.id], deck }, [other]: { dreamsigns: [ACORN], deck } },
        steps: (ids) => [playFromHand(ids, side)], answers: (ids) => [[ids[side].hand[1], ids[side].hand[2]]] });
      expect(batch.events.filter((e) => e.kind === "discarded")).toHaveLength(2);
      expect(costs(batch.events)).toHaveLength(2);
      expect(batch.state.oncePerTurn).toHaveLength(2);
      expect(batch.state.floating.filter((e) => e.change.kind === "cost").every((e) => e.controller === side && e.expiry.at === "endOfTurn")).toBe(true);
      const zero = engine.apply(batch.state, side, { kind: "play", card: batch.ids[side].hand[3], from: "hand" }, NO_PROMPTS);
      expect(zero.state.floating).toEqual([]);
      const h = boardState(engine.catalog, { active: side, phase: "night", [side]: {
        dreamsigns: [ACORN], hand: [v.event0.id, v.event0.id], deck }, [other]: { deck } });
      const fixed = { ...h.state, config: { ...h.state.config, handLimit: 1, autoAnswerForcedPrompts: false } };
      const limited = passUntil(engine, fixed, at(engine, other, "day"), new ScriptedSource([[h.ids[side].hand[0]]]));
      expect(limited.events.filter((e) => e.kind === "discarded")).toHaveLength(1);
      expect(costs(limited.events)).toHaveLength(1);
      expect(limited.events.filter((e) => e.kind === "effectEnded")).toHaveLength(1);
      expect(limited.state.floating).toEqual([]);
      expect(limited.state.oncePerTurn).toEqual([]);
      const f = boardState(engine.catalog, { active: other, phase: "dusk", [side]: {
        dreamsigns: [ACORN], back: [fastDiscard.id], hand: [v.event0.id, v.event0.id], deck }, [other]: { deck } });
      const triggered = engine.apply(f.state, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[f.ids[side].hand[0]]]));
      expect(costs(triggered.events)).toHaveLength(1);
      const expired = passUntil(engine, triggered.state, at(engine, side, "day"));
      expect(expired.state.floating).toEqual([]);
      const refreshed = engine.apply(expired.state, side, { kind: "activate", source: f.ids[side].back[0]!, ability: 0 }, new ScriptedSource([[f.ids[side].hand[1]]]));
      expect(costs(refreshed.events)).toHaveLength(1);
    } });
}
export default { slug: "dreamsigns-ready-249", scenarios } satisfies ScenarioModule;
