import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { event, plus, times } from "../../../dsl/builders";
import { onDawn, triggered } from "../../../dsl/triggers";
import type { PlayerRef, ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { playFromHand } from "../../../testing/scenario";
import { SYNTHETIC, SYNTHETIC_CARDS, syntheticId } from "../../../testing/synthetic-cards";
import { parseDreamsignId, parsePromptId } from "../../../../types/identifiers";
import { discard } from "../discard";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { loseEnergy } from "../lose-energy";
import { sequence } from "../sequence";

function card(index: number, amount: ValueExpr, player: PlayerRef = "you"): EngineCardDefinition {
  return { ...SYNTHETIC.event0, id: syntheticId(0x23100 + index), status: "authored", abilities: () => [event(loseEnergy(amount, player))] };
}
const loss = card(0, 5);
const otherLoss = card(1, 5, "opponent");
const zero = card(2, 0);
const negative = card(3, -3);
const surplus = { ...card(4, 5), abilities: () => [event(sequence(gainEnergy(8), loseEnergy(5)))] };
const dynamic = { ...card(5, 1), abilities: () => [event(sequence(draw(1), loseEnergy(plus(times({ value: "handSize", player: "you" }, 2), 1), "opponent")))] };
const followedByDraw = { ...card(6, 5), abilities: () => [event(sequence(loseEnergy(5), draw(1)))] };
const suspended = { ...card(7, 5), abilities: () => [event(sequence(loseEnergy(5), draw(1), discard(1)))] };
const sign = { id: parseDreamsignId("00000000-0000-4000-8000-000000023101"), status: "authored" as const,
  abilities: () => [triggered(onDawn(), sequence(loseEnergy(1), draw(1)))] };
const inert = { id: parseDreamsignId("00000000-0000-4000-8000-000000023102"), status: "vanilla" as const, abilities: () => [] };
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, loss, otherLoss, zero, negative, surplus, dynamic, followedByDraw, suspended], [], { dreamsigns: [sign, inert] }));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const energyEvents = (events: readonly EngineEvent[]) => events.filter((item) => item.kind === "energyChanged");
const sliceOf = (committed: BattleSlice["committed"]): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected fold outcome ${JSON.stringify(outcome)}`);
  return outcome;
}

describe("loseEnergy", () => {
  it("floors current energy, preserves maximum, and reports actual effect loss for both PlayerRefs and controllers", () => {
    for (const controller of SIDES) {
      for (const ref of ["you", "opponent"] as const) {
        for (const current of [0, 2, 7]) {
          const subject = ref === "you" ? loss : otherLoss;
          const target = ref === "you" ? controller : opponent(controller);
          const { state, ids } = boardState(engine.catalog, { active: controller, phase: "day",
            player: { energy: 4 }, enemy: { energy: 4 }, [controller]: { energy: 4, hand: [subject.id] } });
          state.sides[target].currentEnergy = current;
          const before = serializeState(state);
          const result = engine.apply(state, controller, playFromHand(ids, controller).action, NO_PROMPTS);
          expect(result.state.sides[target]).toMatchObject({ currentEnergy: Math.max(0, current - 5), maxEnergy: 4 });
          expect(result.state.sides[opponent(target)]).toMatchObject({ currentEnergy: 4, maxEnergy: 4 });
          expect(energyEvents(result.events)).toEqual([
            { kind: "energyChanged", side: target, current: Math.max(0, current - 5), max: 4, change: Math.max(0, current - 5) - current, maxChange: 0, cause: "effect" },
          ]);
          expect(serializeState(state)).toBe(before);
        }
      }
    }
  });

  it("treats zero and negative amounts as zero loss and allows current energy above maximum", () => {
    for (const subject of [zero, negative, surplus]) {
      const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { energy: 3, hand: [subject.id] } });
      const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
      expect(result.state.sides.player).toMatchObject({ currentEnergy: subject === surplus ? 6 : 3, maxEnergy: 3 });
      expect(energyEvents(result.events)).toEqual(subject === surplus ? [
        { kind: "energyChanged", side: "player", current: 11, max: 3, change: 8, maxChange: 0, cause: "effect" },
        { kind: "energyChanged", side: "player", current: 6, max: 3, change: -5, maxChange: 0, cause: "effect" },
      ] : [{ kind: "energyChanged", side: "player", current: 3, max: 3, change: 0, maxChange: 0, cause: "effect" }]);
    }
  });

  it("draws after an insufficient or zero loss without a payment or prompt", () => {
    for (const side of SIDES) {
      for (const current of [0, 2]) {
        const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { energy: current, hand: [followedByDraw.id], deck } });
        const result = engine.apply(state, side, playFromHand(ids, side).action, NO_PROMPTS);
        const effect = result.events.filter((item) => item.kind === "energyChanged" || item.kind === "cardDrawn");
        expect(effect).toEqual([
          { kind: "energyChanged", side, current: 0, max: current, change: 0 - current, maxChange: 0, cause: "effect" },
          { kind: "cardDrawn", side, instance: ids[side].deck[0] },
        ]);
        expect(result.state.sides[side].hand).toEqual([ids[side].deck[0]]);
        expect(result.answers).toEqual([]);
      }
    }
  });

  it("evaluates composed amounts after preceding instructions and replays serialized input identically", () => {
    const { state, ids } = boardState(engine.catalog, { active: "enemy", phase: "day",
      enemy: { hand: [dynamic.id, SYNTHETIC.vanilla2.id], deck }, player: { energy: 9 } });
    const action = playFromHand(ids, "enemy").action;
    const first = engine.apply(state, "enemy", action, NO_PROMPTS);
    const again = engine.apply(deserializeState(serializeState(state)), "enemy", action, NO_PROMPTS);
    // One card remains after play, then draw makes two: 2 * 2 + 1.
    expect(first.state.sides.player).toMatchObject({ currentEnergy: 4, maxEnergy: 9 });
    expect(energyEvents(first.events)).toEqual([{ kind: "energyChanged", side: "player", current: 4, max: 9, change: -5, maxChange: 0, cause: "effect" }]);
    expect(again.events).toEqual(first.events);
    expect(stateHash(again.state)).toBe(stateHash(first.state));
    expect(state.sides.player.currentEnergy).toBe(9);
  });

  it("resolves ordered emblem Dawn sources and restores current energy at a normal subsequent refresh", () => {
    for (const side of SIDES) {
      const created = engine.createBattle({ seed: battleSeed("loss-emblem"), scoreToWin: 100, startingSide: side,
        decks: { player: deck.map(cardId => ({ cardId })), enemy: deck.map(cardId => ({ cardId })) }, dreamwell: [],
        dreamsigns: { [side]: [inert.id, sign.id] }, setup: {
          placements: [], sides: { player: { currentEnergy: 0, maxEnergy: 4, score: 0 }, enemy: { currentEnergy: 0, maxEnergy: 4, score: 0 } },
          turn: { active: side, phase: "dawn", round: 1, turnNumber: 1, sideTurns: side === "player" ? { player: 1, enemy: 0 } : { player: 0, enemy: 1 }, lastNormal: side },
          dreamwell: { deck: [], next: 0 },
        } }, NO_PROMPTS);
      const trigger = created.events.find(item => item.kind === "triggerResolved");
      expect(trigger).toMatchObject({ source: { kind: "dreamsign", side, index: 1 }, controller: side, applied: true });
      expect(created.state.sides[side].dreamsigns[1].id).toBe(sign.id);
      expect(created.state.sides[side]).toMatchObject({ currentEnergy: 0, maxEnergy: 4 });
      expect(created.state.sides[side].hand).toHaveLength(1);
      let state = created.state;
      const later: EngineEvent[] = [];
      for (let count = 0; count < 12; count++) {
        const decision = engine.decision(state);
        if (decision === null) throw new Error("Missing normal turn decision");
        const result = engine.apply(state, decision.side, { kind: "pass" }, NO_PROMPTS);
        state = result.state;
        later.push(...result.events);
        if (later.some(item => item.kind === "triggerResolved" && item.controller === side)) break;
      }
      expect(energyEvents(later).filter(item => item.side === side)).toEqual([
        { kind: "energyChanged", side, current: 4, max: 4, change: 4, maxChange: 0, cause: "refresh" },
        { kind: "energyChanged", side, current: 3, max: 4, change: -1, maxChange: 0, cause: "effect" },
      ]);
      expect(state.sides[side]).toMatchObject({ currentEnergy: 3, maxEnergy: 4 });
    }
  });

  it("reconstructs loss and draw at a suspended prefix, rejects competing inputs, and rolls back a failed replay", () => {
    for (const side of SIDES) {
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { energy: 2, hand: [suspended.id, SYNTHETIC.vanilla2.id], deck } });
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const first = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: playFromHand(ids, side).action }));
      const restored = JSON.parse(JSON.stringify(first.slice)) as BattleSlice;
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      const pending = fresh.pending(restored);
      if (pending === null || restored.inFlight === null) throw new Error("Missing discard suspension");
      expect(pending).toEqual(fold.pending(first.slice));
      expect(pending.display.sides[side]).toMatchObject({ currentEnergy: 0, maxEnergy: 2 });
      expect(pending.display.sides[side].hand).toContain(ids[side].deck[0]);
      expect(restored.committed.sides[side].currentEnergy).toBe(2);
      const before = JSON.stringify(restored);
      for (const intent of [
        { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: [ids[side].hand[1]] },
        { kind: "answer", side, promptId: parsePromptId("0:0:99"), value: [ids[side].hand[1]] },
        { kind: "answer", side, promptId: pending.prompt.id, value: [] },
        { kind: "battleAction", side: opponent(side), action: { kind: "pass" } },
      ] as const) expect(fresh.reduce(restored, intent).kind).toBe("bounced");
      expect(JSON.stringify(restored)).toBe(before);
      const answer = { kind: "answer", side, promptId: pending.prompt.id, value: [ids[side].hand[1]] } as const;
      const completed = applied(fresh.reduce(restored, answer));
      const original = applied(fold.reduce(first.slice, answer));
      expect(completed.slice.committed).toEqual(original.slice.committed);
      expect(completed.published).toEqual(original.published);
      expect(completed.published.some(item => item.kind === "energyChanged" || item.kind === "cardDrawn")).toBe(false);
      expect(completed.slice.committed.sides[side]).toMatchObject({ currentEnergy: 0, maxEnergy: 2 });
      expect(fresh.reduce(completed.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const corrupt = { ...restored, inFlight: { ...restored.inFlight, answers: [{ fingerprint: promptFingerprint({ ...pending.prompt, purpose: { ...pending.prompt.purpose, role: "youMay" } }), value: false }] } };
      const failed = fresh.reduce(corrupt, answer);
      expect(failed.kind === "applied" && failed.error?.kind).toBe("engine_error");
      if (failed.kind === "applied") {
        expect(failed.slice.committed).toEqual(restored.committed);
        expect(failed.slice.committed.sides[side].currentEnergy).toBe(2);
        expect(failed.slice.inFlight).toBeNull();
      }
    }
  });
});
