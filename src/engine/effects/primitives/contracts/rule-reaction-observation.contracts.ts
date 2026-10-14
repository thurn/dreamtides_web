/** Corrupt saved descriptors are inert observations, but remain strict resolving work. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { event, staticAbility } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { onDawn, triggered } from "../../../dsl/triggers";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { SIDES, opponent, parseFigmentId, type Side } from "../../../state/ids";
import type { AbilityOrigin, BattleState, QueuedTrigger } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { revealToBoth } from "../../../view/knowledge";
import { parseDreamsignId } from "../../../../types/identifiers";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { playFromZone } from "../play-from-zone";
import { ruleModifier } from "../rule-modifier";
import { SIGN, card, deck, restored, signs, sliceOf, world } from "./rule-modifier-support";

const threshold = ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) });
const listener: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x171001), status: "authored",
  abilities: () => [triggered(onDawn(), gainEnergy(1))] };
const template: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x171002), status: "authored",
  abilities: () => [staticAbility(threshold)] };
const authoredFailure = "synthetic ability factory failure";
const faulty: EngineCardDefinition = { ...template, id: syntheticId(0x171003), abilities: variant => {
  if (variant.deckMods?.costReduction === 99) throw new Error(authoredFailure);
  return [staticAbility(threshold)];
} };
const spell = card(0x171, draw(1));
const emblems = signs.map(sign => sign.id !== SIGN.hourglass ? sign : { ...sign,
  abilities: () => [staticAbility(threshold), event(draw(1)), staticAbility(ruleModifier({ rule: "carryEnergy" })), staticAbility(playFromZone("void", {}))] });

function queued(side: Side) {
  const w = world(side, [listener, template, faulty, spell], { phase: "draw",
    [side]: { back: [listener.id, listener.id, listener.id], hand: [spell.id], deck: [template.id, ...deck],
      dreamsigns: [SIGN.hourglass, SIGN.apple], energy: 10 } }, emblems);
  const result = runStep(w.state, { kind: "advancePhase" }, NO_PROMPTS, w.engine.catalog);
  if (result.kind !== "done") throw new Error("Expected Dawn admission batch");
  expect(result.state.triggerQueue.map(trigger => trigger.kind ?? "ordinary")).toEqual(["ordinary", "ordinary", "ordinary", "ruleReaction"]);
  return { ...w, admitted: result.state };
}

function corrupt(state: BattleState, patch: Partial<QueuedTrigger>) {
  const saved = structuredClone(sliceOf(state));
  Object.assign(saved.committed.triggerQueue[saved.committed.triggerQueue.length - 1], patch);
  return restored(saved);
}

const descriptors: readonly { label: string; patch: Partial<QueuedTrigger> }[] = [
  { label: "out-of-range ability", patch: { ability: 7 } },
  { label: "event ability", patch: { ability: 1 } },
  { label: "other player rule", patch: { ability: 2 } },
  { label: "other static instruction", patch: { ability: 3 } },
  { label: "unknown emblem origin", patch: { origin: { kind: "dreamsign", id: parseDreamsignId("00000000-0000-4000-8000-000000171099") } } },
  { label: "unknown card origin", patch: { origin: { kind: "card", cardId: syntheticId(0x171099), variant: { amplified: false } } } },
  { label: "unknown gained card", patch: { origin: { kind: "card", cardId: template.id, variant: { amplified: false }, gained: [{ cardId: syntheticId(0x171099), variant: { amplified: false } }] } } },
  { label: "unknown gained figment", patch: { origin: { kind: "card", cardId: template.id, variant: { amplified: false }, gained: [{ figment: parseFigmentId("00000000-0000-4000-8000-000000171099") }] } } },
];

describe("rule reaction observation containment", () => {
  it.each(SIDES.flatMap(side => descriptors.map(descriptor => ({ side, ...descriptor }))))("resolves an earlier valid callback despite saved $label for $side", ({ side, patch }) => {
    const w = queued(side), loaded = corrupt(w.admitted, patch);
    const before = stateHash(loaded.committed), serialized = JSON.stringify(loaded);
    const result = runStep(loaded.committed, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
    if (result.kind !== "done") throw new Error("Expected ordinary callback completion");
    expect(result.events.map(event => event.kind)).toEqual(["triggerResolved", "energyChanged"]);
    expect(result.state.sides[side].currentEnergy).toBe(11);
    expect(result.state.triggerQueue).toEqual(loaded.committed.triggerQueue.slice(1));
    expect(result.state.turnLog.dawnProgress).toEqual(loaded.committed.turnLog.dawnProgress);
    expect(stateHash(loaded.committed)).toBe(before);
    expect(JSON.stringify(loaded)).toBe(serialized);
    for (const viewer of SIDES) expect(w.engine.view(result.state, viewer).turnLog.dawnProgress).toEqual({ knownCount: 3 });
    let state = result.state;
    for (let index = 0; index < 2; index++) {
      const next = runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
      if (next.kind !== "done") throw new Error("Expected remaining ordinary callback");
      state = next.state;
    }
    const resolving: BattleSlice = { ...sliceOf(state), inFlight: { step: { kind: "resolveTrigger" }, automatic: true, answers: [] } };
    const resolvingHash = stateHash(state);
    const failure = createFoldAdapter(w.engine).reduce(restored(resolving), { kind: "battleAction", side, action: { kind: "pass" } });
    expect(failure).toMatchObject({ kind: "applied", error: { kind: "engine_error", step: { kind: "resolveTrigger" } } });
    if (failure.kind !== "applied") throw new Error("Expected structured descriptor rejection");
    expect(stateHash(failure.slice.committed)).toBe(resolvingHash);
    expect(failure.slice.committed.triggerQueue).toEqual(state.triggerQueue);
    expect(failure.published).toEqual([]);
    expect(failure.slice.inFlight).toBeNull();
  });

  it.each(SIDES)("observes a valid saved floor without exposing total or an unidentified deck source for %s", side => {
    const w = queued(side), saved = structuredClone(sliceOf(w.admitted));
    saved.committed.turnLog.dawnProgress!.known = { player: 2, enemy: 2 };
    const loaded = restored(saved), before = stateHash(loaded.committed);
    const observed = runStep(loaded.committed, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
    if (observed.kind !== "done") throw new Error("Expected observed ordinary callback");
    expect(observed.state.turnLog.dawnProgress).toEqual({ total: 3, known: { player: 3, enemy: 3 } });
    expect(stateHash(loaded.committed)).toBe(before);
    const hidden = corrupt(saved.committed, { source: w.ids[side].deck[0], origin: { kind: "card", cardId: template.id, variant: { amplified: false } } });
    const unknown = runStep(hidden.committed, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
    if (unknown.kind !== "done") throw new Error("Expected opaque callback completion");
    expect(unknown.state.turnLog.dawnProgress).toEqual({ total: 3, known: { player: 2, enemy: 2 } });
    for (const viewer of SIDES) {
      const view = w.engine.view(unknown.state, viewer);
      expect(view.turnLog.dawnProgress).toEqual({ knownCount: 2 });
      expect(view.triggerQueue.some(trigger => trigger.kind === "ruleReaction")).toBe(false);
    }
    const knownPrivate = structuredClone(hidden.committed);
    revealToBoth(knownPrivate, [w.ids[side].deck[0]]);
    const known = runStep(knownPrivate, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog);
    if (known.kind !== "done") throw new Error("Expected known private callback completion");
    expect(w.engine.view(known.state, side).turnLog.dawnProgress).toEqual({ knownCount: 3 });
    expect(w.engine.view(known.state, opponent(side)).turnLog.dawnProgress).toEqual({ knownCount: 2 });
  });

  it.each(SIDES)("propagates an authored ability factory error outside catalog lookup for %s", side => {
    const w = queued(side);
    const origin: AbilityOrigin = { kind: "card", cardId: faulty.id, variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 99 } } };
    const loaded = corrupt(w.admitted, { origin }), before = stateHash(loaded.committed);
    expect(() => runStep(loaded.committed, { kind: "resolveTrigger" }, NO_PROMPTS, w.engine.catalog)).toThrow(authoredFailure);
    expect(stateHash(loaded.committed)).toBe(before);
  });

  it.each(SIDES)("contains cancellation of a corrupt saved in-flight play for %s", side => {
    const w = queued(side), corrupted = corrupt(w.admitted, { ability: 7 });
    // This inconsistent persisted combination models corruption, not an engine-admitted play with a queued reaction.
    corrupted.committed.turn.phase = "day";
    const saved: BattleSlice = { ...corrupted, inFlight: {
      step: { kind: "play", card: w.ids[side].hand[0], from: "hand" }, automatic: false, answers: [],
    } };
    const loaded = restored(saved), before = stateHash(loaded.committed), serialized = JSON.stringify(loaded);
    const fold = createFoldAdapter(w.engine), pending = fold.pending(loaded);
    expect(pending?.prompt).toMatchObject({ kind: "chooseMode", cancellable: true });
    if (pending === null) throw new Error("Expected persisted route prompt replay");
    const cancelled = fold.reduce(loaded, { kind: "cancel", side, promptId: pending.prompt.id });
    expect(cancelled).toMatchObject({ kind: "applied", error: null, published: [], slice: { inFlight: null } });
    if (cancelled.kind !== "applied") throw new Error("Expected cancellation containment");
    expect(stateHash(cancelled.slice.committed)).toBe(before);
    expect(JSON.stringify(loaded)).toBe(serialized);
    expect(cancelled.slice.committed.triggerQueue).toEqual(loaded.committed.triggerQueue);
  });
});
