/** D20: an own-event tax composes with copying a captured, paid stack card. */
import { expect } from "vitest";
import { additionalCost, anyCharacter, energy, energyX, event, optionalCost, target, x } from "../../engine/dsl/builders";
import { NO_DECK_MODS } from "../../engine/dsl/types";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../../engine/fold/slice";
import { gainPoints, gainSpark, sequence } from "../../engine/effects/primitives";
import { stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { boardState } from "../../engine/testing/board";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import echo from "../cards/echo-architect-21965e95";
import nullifier from "../cards/nullifier-6da831c8";

const ECHO = parseCardId(echo.id), NULLIFIER = parseCardId(nullifier.id);
const score = { ...v.event1, id: syntheticId(0x68303), abilities: () => [event(gainPoints(3))] };
const captured = { ...v.event1, id: syntheticId(0x68304), costs: [energy(1), energyX(0)], abilities: () => [
  additionalCost(optionalCost(energy(1))), event(sequence(gainPoints(x()), gainSpark(target(anyCharacter()), x()))),
] };
const local = createEngine(testCatalog([engineCardFromContent(echo), engineCardFromContent(nullifier), score, captured]));
const copies = (events: readonly EngineEvent[]) => events.filter((e): e is Extract<EngineEvent, { kind: "cardCopied" }> => e.kind === "cardCopied");
const payment = (events: readonly EngineEvent[], side: Side) => events.reduce((total, e) => total + (e.kind === "energyChanged" && e.side === side && e.cause === "payment" ? e.change : 0), 0);
const scenarios: NamedScenario[] = [];

function witness(side: Side, own: boolean): ScenarioSpec {
  const payer = own ? side : opponent(side);
  return { board: { active: payer, phase: "day", [side]: { back: [ECHO], ...(own ? { hand: [v.event1.id], energy: 2 } : {}) },
    ...(own ? {} : { [payer]: { hand: [v.event1.id], energy: 1 } }),
  }, steps: ids => [playFromHand(ids, payer)] };
}
function checkWitness(result: ScenarioResult, side: Side, own: boolean): void {
  const payer = own ? side : opponent(side);
  expect(payment(result.events, payer)).toBe(own ? -2 : -1);
  expect(copies(result.events)).toHaveLength(own ? 1 : 0);
  expect(result.state.turnLog.played[payer].map(e => e.instance)).toEqual([result.ids[payer].hand[0]]);
}

function capturedCopy(side: Side): void {
  const other = opponent(side);
  const initial = boardState(local.catalog, { active: side, phase: "day", [side]: {
    back: [ECHO, v.vanilla0.id], hand: [{ cardId: captured.id, deckMods: { ...NO_DECK_MODS, fast: true } }], energy: 5,
  }, [other]: { back: [v.vanilla0.id], hand: [v.interruptEvent.id], energy: 1 } });
  const fold = createFoldAdapter(local, { checkEventPrefix: true });
  let slice: BattleSlice = { committed: initial.state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const events: EngineEvent[] = [];
  const apply = (intent: BattleIntent) => {
    const result = fold.reduce(slice, intent);
    if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
    slice = result.slice; events.push(...result.published);
  };
  const original = initial.ids[side].hand[0];
  const play: BattleIntent = { kind: "battleAction", side, action: { kind: "play", card: original, from: "hand" } };
  apply(play);
  const first = fold.pending(slice); if (first === null) throw new Error("Expected play choice");
  const before = stateHash(slice.committed);
  slice = JSON.parse(JSON.stringify(slice)) as BattleSlice;
  expect(fold.pending(slice)).toEqual(first);
  apply({ kind: "cancel", side, promptId: first.prompt.id });
  expect(stateHash(slice.committed)).toBe(before);
  expect(slice.committed.sides[side].currentEnergy).toBe(5);
  expect(fold.reduce(slice, { kind: "answer", side, promptId: first.prompt.id, value: 2 }).kind).toBe("bounced");
  apply(play);
  const answers = [2, [initial.ids[side].back[1]!], true, [initial.ids[other].back[0]!]];
  for (const value of answers) {
    const pending = fold.pending(slice); if (pending === null) throw new Error("Expected captured-copy choice");
    slice = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    expect(fold.pending(slice)).toEqual(pending);
    expect(fold.reduce(slice, { kind: "answer", side: other, promptId: pending.prompt.id, value }).kind).toBe("bounced");
    apply({ kind: "answer", side, promptId: pending.prompt.id, value });
  }
  expect(fold.pending(slice)).toBeNull();
  const [copy] = copies(events); expect(copies(events)).toHaveLength(1);
  expect(copy).toMatchObject({ original, side }); expect(copy.copy).not.toBe(original);
  const copied = slice.committed.instances[copy.copy], source = slice.committed.instances[original];
  expect(copied.printing).toEqual({ kind: "card", cardId: captured.id });
  expect(copied.variant).toEqual(source.variant); expect(copied.controller).toBe(side); expect(copied.status.created).toBe(true);
  expect(slice.committed.stack).toHaveLength(2);
  for (const item of slice.committed.stack) expect(item).toMatchObject({ kind: "card", controller: side, x: 2, optionalPaid: [true] });
  expect(payment(events, side)).toBe(-5);
  expect(slice.committed.turnLog.played[side].map(e => e.instance)).toEqual([original]);
  while (slice.committed.stack.length > 0) {
    const decision = local.decision(slice.committed); if (decision === null) throw new Error("Expected stack decision");
    apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
  }
  expect(payment(events, side)).toBe(-5);
  expect(events.filter(e => e.kind === "resolved").map(e => e.instance)).toEqual([copy.copy, original]);
  expect(slice.committed.sides[side].score).toBe(4);
  expect(local.view(slice.committed, side).instances[initial.ids[side].back[1]!].characteristics.spark).toBe(2);
  expect(local.view(slice.committed, other).instances[initial.ids[other].back[0]!].characteristics.spark).toBe(2);
  expect(slice.committed.instances[original].zone).toBe("void"); expect(slice.committed.instances[copy.copy]).toBeUndefined();
  const queued = events.findIndex(e => e.kind === "triggerQueued" && e.subject === original);
  const copiedAt = events.findIndex(e => e.kind === "cardCopied" && e.copy === copy.copy);
  expect(queued).toBeGreaterThanOrEqual(0); expect(copiedAt).toBeGreaterThan(queued);
  const loaded = JSON.parse(JSON.stringify(slice)) as BattleSlice;
  expect(stateHash(loaded.committed)).toBe(stateHash(slice.committed)); expect(fold.pending(loaded)).toBeNull();
}

function exclusionsAndStacking(side: Side): void {
  const other = opponent(side);
  const own = runScenario(local, { board: { active: side, phase: "day", [side]: {
    back: [NULLIFIER, ECHO], hand: [score.id, v.vanilla1.id], energy: 5,
  }, [other]: { back: [NULLIFIER] } }, steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1)] });
  expect(payment(own.events, side)).toBe(-5); expect(copies(own.events)).toHaveLength(1);
  expect(own.state.sides[side].score).toBe(6);
  expect(own.state.turnLog.played[side].map(e => e.instance)).toEqual(own.ids[side].hand);
  const opposing = runScenario(local, { board: { active: other, phase: "day", [side]: { back: [NULLIFIER, ECHO] },
    [other]: { back: [NULLIFIER], hand: [score.id], energy: 3 },
  }, steps: ids => [playFromHand(ids, other)] });
  expect(payment(opposing.events, other)).toBe(-3); expect(copies(opposing.events)).toEqual([]);
  expect(opposing.state.sides[other].score).toBe(3);
}
for (const side of ["player", "enemy"] as const) {
  scenarios.push({ name: `${ECHO} ${side} taxed play copies retained context through cancellation and reload`, spec: witness(side, true),
    check: result => { checkWitness(result, side, true); capturedCopy(side); } });
  scenarios.push({ name: `${ECHO} ${side} event scope composes with symmetric taxes and excludes characters`, spec: witness(side, false),
    check: result => { checkWitness(result, side, false); exclusionsAndStacking(side); } });
}
export default { slug: "cards-ready-191", scenarios } satisfies ScenarioModule;
