/** Public abandonment copying, persisted steps, and observer-safe replay (C5). */
import { describe, expect, it } from "vitest";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { parseDreamsignId } from "../../../../types/identifiers";
import { instanceCard, type EngineCardDefinition, type EngineDreamsignDefinition, type EngineFigmentDefinition } from "../../../catalog";
import { abandonCost, activated, additionalCost, all, characterYouControl, energy, event, everyIn, keyword } from "../../../dsl/builders";
import { either, onDawn, triggered, whenAbandon, whenDissolved } from "../../../dsl/triggers";
import { NO_DECK_MODS, type Variant } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, parseFigmentId, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, Printing } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { INTERACTIVE, NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { Effect } from "../../registry";
import * as p from "../index";
import { decklists } from "./with-materialized-support";

const id = (n: number) => syntheticId(0x615000 + n);
const copy = () => p.copyAbandonedSubjectAsFigment({ zeroSpark: true });
const token: EngineFigmentDefinition = { id: parseFigmentId(id(30)), subtype: "Mage", spark: 3, status: "authored", abilities: () => [keyword("vengeful")] };
const donor: EngineCardDefinition = { ...v.vanilla3, id: id(1), subtype: "Mage", status: "authored",
  abilities: variant => [keyword(variant.amplified ? "awakened" : "vengeful"), activated([], p.storeCounters(2))] };
const spell = (n: number, effect: Effect): EngineCardDefinition => ({ ...v.event0, id: id(n), status: "authored", abilities: () => [event(effect)] });
const cut = spell(2, p.abandon("you", { subtype: "Mage" }));
const seize = spell(3, p.gainControl(all({ controller: "opponent", subtype: "Mage" })));
const buff = spell(4, p.sequence(p.gainSpark(all(characterYouControl({ subtype: "Mage" })), 7), p.setBaseSpark(all(characterYouControl({ subtype: "Mage" })), 12),
  p.grant(all(characterYouControl({ subtype: "Mage" })), "veil")));
const invalid = spell(7, p.sequence(p.gainEnergy(9), copy()));
const paid: EngineCardDefinition = { ...v.vanilla1, id: id(8), status: "authored", abilities: () => [additionalCost(abandonCost({ subtype: "Mage" }))] };
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const figures = (events: readonly EngineEvent[]) => events.flatMap(e => e.kind === "cardCreated" ? [e.instance] : []);
const sourceOf = (state: BattleState, side: Side) => state.sides[side].backRank.filter((x): x is InstanceId => x !== null);
function world(side: Side, effect: Effect = copy(), mine: SideSetup = {}, theirs: SideSetup = {}, extra: readonly EngineCardDefinition[] = [], signs = 1, oncePerTurn = false) {
  const sign: EngineDreamsignDefinition = { id: parseDreamsignId(id(20)), status: "authored", abilities: () => [triggered(whenAbandon(), effect, { oncePerTurn })] };
  const engine = createEngine(testCatalog([donor, cut, seize, buff, invalid, paid, ...extra], { dreamsigns: [sign] }, [token]));
  return { engine, side, sign, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { energy: 20, deck, back: [donor.id], hand: [cut.id], dreamsigns: Array.from({ length: signs }, () => sign.id), ...mine },
    [opponent(side)]: { energy: 20, deck, ...theirs } }) };
}
function step(engine: Engine, state: BattleState, command: Step, answers: AnswerSource = NO_PROMPTS) {
  const result = runStep(state, command, answers, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function cast(engine: Engine, state: BattleState, card: InstanceId, answers: AnswerSource = NO_PROMPTS) {
  const played = step(engine, state, { kind: "play", card, from: "hand" }, answers);
  return step(engine, played.state, { kind: "resolveTop" }, answers);
}
function occasion(f: ReturnType<typeof world>, state = f.state, card = f.ids[f.side].hand[0], answers: AnswerSource = NO_PROMPTS) {
  const result = cast(f.engine, state, card, answers);
  expect(result.events.some(e => e.kind === "abandoned")).toBe(true);
  return result;
}
function resolve(f: ReturnType<typeof world>, state: BattleState) {
  return step(f.engine, state, { kind: "resolveTrigger" });
}
function expectCopy(engine: Engine, state: BattleState, events: readonly EngineEvent[], side: Side, original: Printing) {
  const [made] = figures(events);
  expect(figures(events)).toHaveLength(1);
  const card = state.instances[made];
  expect(card).toMatchObject({ owner: side, controller: side, zone: "play", status: { created: true, gainedSpark: 0, counters: 0, reclaimed: false, ephemeral: false } });
  expect(card.printing).toEqual(original.kind === "card" ? { kind: "figmentCopy", cardId: original.cardId, spark: 0 } : { ...original, spark: 0 });
  expect(engine.view(state, side).instances[made].characteristics?.spark).toBe(0);
  expect(state.sides[side].backRank).toContain(made);
  return made;
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function prompted(f: ReturnType<typeof world>) {
  const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
  let slice = applied(fold.reduce(sliceOf(f.state), { kind: "battleAction", side: f.side, action: { kind: "play", card: f.ids[f.side].hand[0], from: "hand" } }));
  while (fold.pending(slice) === null) {
    const decision = f.engine.decision(slice.committed);
    if (decision === null) throw new Error("no decision before copy prompt");
    slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
  }
  return { fold, slice };
}
const save = (slice: BattleSlice) => ({ init: { seed: "saved", scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice });

for (const side of SIDES) describe(`${side} abandoned-copy binding`, () => {
  it.each([false, true])("copies a regular amplified=%s character's printed abilities and cost", amplified => {
    const f = world(side, copy(), { back: [], hand: [{ cardId: donor.id, amplified }, cut.id] });
    const played = cast(f.engine, f.state, f.ids[side].hand[0]);
    const subject = f.ids[side].hand[0];
    const queued = occasion(f, played.state, f.ids[side].hand[1]);
    expect(queued.state.instances[subject].zone).toBe("void");
    const result = resolve(f, queued.state);
    const made = expectCopy(f.engine, result.state, result.events, side, { kind: "card", cardId: donor.id });
    const printed = instanceCard(f.engine.catalog, result.state.instances[made]);
    expect(printed.costs).toEqual([energy(3)]);
    expect(printed.abilities(result.state.instances[made].variant)).toEqual(donor.abilities({ amplified }));
    expect(result.state.instances[made].variant.amplified).toBe(amplified);
  });

  it.each(["figment", "figmentCopy"] as const)("copies a ceased %s without a live original", kind => {
    for (const spark of kind === "figment" ? [6, -1] : [8]) {
      const printing: Printing = kind === "figment" ? { kind, figment: token.id, spark } : { kind, cardId: donor.id, spark };
      const maker = spell(15, p.materializeFigments(token.id, 1, { spark }));
      const f = kind === "figment"
        ? world(side, copy(), { back: [], hand: [maker.id, cut.id] }, {}, [maker])
        : world(side, copy(), { back: [], figments: [{ slot: { rank: "back", index: 0 }, printing }] });
      const made = kind === "figment" ? cast(f.engine, f.state, f.ids[side].hand[0]).state : f.state;
      const subject = sourceOf(made, side)[0];
      const queued = occasion(f, made, f.ids[side].hand[kind === "figment" ? 1 : 0]);
      expect(queued.state.instances[subject]).toBeUndefined();
      const saved = parseEngineBattleFold(JSON.parse(JSON.stringify(save(sliceOf(queued.state)))));
      if (saved === null) throw new Error("signed finite abandoned printing failed to load");
      const result = resolve(f, saved.slice.committed);
      expectCopy(f.engine, result.state, result.events, side, printing);
      expect(result.state.instances[subject]).toBeUndefined();
    }
  });

  it.each([false, true])("preserves complete D39 values for converted event=%s with explicit zero precedence", converted => {
    const subjectCard: EngineCardDefinition = converted ? { ...v.event1, id: id(10), status: "authored", abilities: () => [event(p.gainEnergy(1))] } : donor;
    const variant: Variant = { amplified: true, transfigurations: ["Resonant"], deckMods: { ...NO_DECK_MODS, sparkBonus: 4, costReduction: 1,
      fast: true, reclaim: 2, typeChange: { cardType: "character", subtype: "Mage" } } };
    const f = world(side, copy(), { back: [], hand: [{ cardId: subjectCard.id, ...variant }, cut.id] }, {}, converted ? [subjectCard] : []);
    const input = JSON.stringify(variant), subject = f.ids[side].hand[0];
    const played = cast(f.engine, f.state, subject);
    const queued = occasion(f, played.state, f.ids[side].hand[1]);
    expect(queued.state.triggerQueue[0].abandonedCopy?.variant).toEqual(variant);
    const result = resolve(f, queued.state);
    const made = expectCopy(f.engine, result.state, result.events, side, { kind: "card", cardId: subjectCard.id });
    expect(result.state.instances[made].variant).toEqual(variant);
    const printed = instanceCard(f.engine.catalog, result.state.instances[made]);
    expect([printed.cardType, printed.subtype, printed.speed]).toEqual(["character", "Mage", "fast"]);
    expect(printed.costs).toEqual([energy(converted ? 0 : 2)]);
    expect(printed.abilities(variant)).toContainEqual(expect.objectContaining({ kind: "reclaim" }));
    expect(JSON.stringify(variant)).toBe(input);
  });

  it("keeps the trigger controller when a stolen source abandons itself into its owner's void", () => {
    const watcher = { ...donor, id: id(11), abilities: () => [triggered(whenAbandon(), copy())] };
    const f = world(side, copy(), { back: [], hand: [seize.id, cut.id] }, { back: [watcher.id] }, [watcher], 0);
    const subject = f.ids[opponent(side)].back[0]!;
    const stolen = cast(f.engine, f.state, f.ids[side].hand[0]);
    expect(stolen.state.instances[subject].controller).toBe(side);
    const queued = occasion(f, stolen.state, f.ids[side].hand[1]);
    expect(queued.state.instances[subject]).toMatchObject({ owner: opponent(side), controller: opponent(side), zone: "void" });
    const result = resolve(f, queued.state);
    expectCopy(f.engine, result.state, result.events, side, { kind: "card", cardId: watcher.id });
  });

  it("copies no temporary spark, stored counters, gained keywords, or exhaustion", () => {
    const f = world(side, copy(), { hand: [buff.id, cut.id] });
    const subject = f.ids[side].back[0]!;
    const stored = step(f.engine, f.state, { kind: "activate", source: subject, ability: 1 });
    const counted = step(f.engine, stored.state, { kind: "resolveTop" });
    const modified = cast(f.engine, counted.state, f.ids[side].hand[0]);
    expect(modified.state.instances[subject].status).toMatchObject({ counters: 2, gainedSpark: 7 });
    expect(f.engine.view(modified.state, side).instances[subject].characteristics?.spark).toBe(19);
    const queued = occasion(f, modified.state, f.ids[side].hand[1]);
    const result = resolve(f, queued.state), made = expectCopy(f.engine, result.state, result.events, side, { kind: "card", cardId: donor.id });
    expect(f.engine.view(result.state, side).instances[made].characteristics?.keywords).toEqual(["vengeful"]);
    expect(result.state.instances[made].status.gainedAbilities).toBeUndefined();
    expect(result.state.instances[made].status.exhausted).toBe(true);
  });

  it("respects a filled rank and positions reserved by a pending played character", () => {
    for (const reserved of [false, true]) {
      const f = world(side, p.sequence(p.materializeFigments(token.id, reserved ? 1 : 10), copy()),
        { back: [donor.id, ...Array.from({ length: reserved ? 8 : 9 }, () => v.vanilla1.id)], hand: [reserved ? paid.id : cut.id] });
      const played = step(f.engine, f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" });
      const queued = reserved ? played : step(f.engine, played.state, { kind: "resolveTop" });
      const result = resolve(f, queued.state);
      expect(figures(result.events).filter(x => result.state.instances[x].printing.kind === "figmentCopy")).toEqual([]);
      expect(result.events).toContainEqual({ kind: "capacityReached", side, instance: null, missing: 1 });
      expect(sourceOf(result.state, side)).toHaveLength(reserved ? 9 : 10);
      if (reserved) expect(step(f.engine, result.state, { kind: "resolveTop" }).state.instances[f.ids[side].hand[0]].zone).toBe("play");
    }
  });

  it("lets two held sources with the same UUID each use their own once allowance", () => {
    const f = world(side, copy(), { back: [donor.id, donor.id], hand: [cut.id, cut.id] }, {}, [], 2, true);
    const first = occasion(f, f.state, f.ids[side].hand[0], new ScriptedSource([[f.ids[side].back[0]!]]));
    expect(first.state.triggerQueue.map(t => t.source)).toEqual([{ kind: "dreamsign", side, index: 0 }, { kind: "dreamsign", side, index: 1 }]);
    const a = resolve(f, first.state), b = resolve(f, a.state);
    expect([...figures(a.events), ...figures(b.events)]).toHaveLength(2);
    const second = occasion(f, b.state, f.ids[side].hand[1], new ScriptedSource([[f.ids[side].back[1]!]]));
    expect(second.state.triggerQueue).toEqual([]);
    expect(sourceOf(second.state, side)).toHaveLength(2);
  });

  it("binds a future delayed body to its own later abandonment only", () => {
    const second = { ...donor, id: id(16) };
    const f = world(side, p.delayed(whenAbandon(), copy()), { back: [donor.id, second.id], hand: [cut.id, cut.id] }, {}, [second]);
    const first = occasion(f, f.state, f.ids[side].hand[0], new ScriptedSource([[f.ids[side].back[0]!]]));
    expect(first.state.triggerQueue[0].abandonedCopy).toBeUndefined();
    const installed = resolve(f, first.state);
    expect(figures(installed.events)).toEqual([]);
    const queued = occasion(f, installed.state, f.ids[side].hand[1]);
    expect(queued.state.triggerQueue[0].abandonedCopy).toBeUndefined();
    expect(queued.state.triggerQueue[1].abandonedCopy?.printing).toEqual({ kind: "card", cardId: second.id });
    const outer = resolve(f, queued.state), result = resolve(f, outer.state);
    expectCopy(f.engine, result.state, result.events, side, { kind: "card", cardId: second.id });
  });

  it("refuses non-abandon and stale bindings atomically without capturing ordinary departures", () => {
    const f = world(side, copy(), { hand: [cut.id, invalid.id] });
    const queued = occasion(f), result = resolve(f, queued.state);
    const committed = step(f.engine, result.state, { kind: "play", card: f.ids[side].hand[1], from: "hand" }).state;
    const before = serializeState(committed);
    expect(() => step(f.engine, committed, { kind: "resolveTop" })).toThrow();
    expect(serializeState(committed)).toBe(before);
    for (const trigger of [onDawn(), either(onDawn(), whenAbandon()), whenDissolved(characterYouControl())]) {
      const wrong = { ...donor, id: id(12), abilities: () => [triggered(trigger, copy())] };
      const kill = spell(13, p.dissolve(all(characterYouControl({ subtype: "Mage" }))));
      const w = world(side, copy(), { back: [wrong.id], hand: [kill.id] }, {}, [wrong, kill], 0);
      if (trigger.on === "dissolve") {
        const departed = cast(w.engine, w.state, w.ids[side].hand[0]);
        expect(departed.state.triggerQueue[0].abandonedCopy).toBeUndefined();
        expect(() => resolve(w, departed.state)).toThrow();
      } else {
        const dawn = boardState(w.engine.catalog, { active: side, phase: "draw", [side]: { back: [wrong.id], deck }, [opponent(side)]: { deck } });
        const announced = step(w.engine, dawn.state, { kind: "advancePhase" });
        expect(announced.state.triggerQueue[0].abandonedCopy).toBeUndefined();
        const beforeResolution = serializeState(announced.state);
        expect(() => resolve(w, announced.state)).toThrow();
        expect(serializeState(announced.state)).toBe(beforeResolution);
      }
    }
  });

  it("preserves known copies through both views and samples without a hidden or ceased subject alias", () => {
    for (const ceased of [true, false]) {
      const hidingCut = spell(17, p.sequence(p.abandon("you", { subtype: "Mage" }), p.shuffleInto([everyIn("void", { subtype: "Mage" })])));
      const f = world(side, copy(), ceased ? { back: [], figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figmentCopy", cardId: donor.id, spark: 5 } }] } : { hand: [hidingCut.id] }, {}, [hidingCut]);
      const subject = f.ids[side].back[0]!, first = occasion(f), queued = first.state;
      const tuple = queued.triggerQueue[0].abandonedCopy;
      for (const viewer of SIDES) {
        const view = f.engine.view(queued, viewer);
        expect(view.triggerQueue[0]).toMatchObject({ subject: null, abandonedCopy: tuple });
        const sampled = f.engine.determinize(view, decklists(queued), () => 0.41);
        expect(f.engine.view(sampled, viewer).triggerQueue).toEqual(view.triggerQueue);
        const result = resolve(f, sampled);
        expectCopy(f.engine, result.state, result.events, side, tuple!.printing);
        for (const event of first.events.filter(e => e.kind === "triggerQueued")) expect(eventSeenBy(event, viewer, queued)).not.toHaveProperty("abandonedCopy");
      }
      expect(ceased ? queued.instances[subject] === undefined : queued.instances[subject].zone === "deck").toBe(true);
      expect(determinizationDivergences(f.engine, queued, decklists(queued), battleSeed("abandoned-copy"), 0)).toEqual([]);
    }
    const hidden = { ...donor, id: id(14), abilities: () => [triggered(whenAbandon(), copy(), { zone: "hand" })] };
    const f = world(side, copy(), { hand: [cut.id, hidden.id] }, {}, [hidden], 0);
    const queued = occasion(f), view = f.engine.view(queued.state, opponent(side));
    expect(view.triggerQueue[0]).toMatchObject({ source: null, origin: null });
    expect(view.triggerQueue[0]).not.toHaveProperty("abandonedCopy");
    expect(f.engine.determinize(view, decklists(queued.state), () => 0.41).triggerQueue).toEqual([]);
  });

  it("keeps joint copy and named bindings coherent after a ceased or hidden abandonment", () => {
    const subjectCard: EngineCardDefinition = { ...donor, id: id(18), abilities: () => [triggered(onDawn(), p.gainEnergy(2))] };
    const hide = spell(19, p.sequence(p.abandon("you", { subtype: "Mage" }), p.shuffleInto([everyIn("void", { subtype: "Mage" })])));
    for (const ceased of [true, false]) {
      const f = world(side, p.sequence(copy(), p.triggerAbandonedNamed("dawn")), ceased
        ? { back: [], figments: [{ slot: { rank: "back", index: 0 }, printing: { kind: "figmentCopy", cardId: subjectCard.id, spark: 5 } }] }
        : { back: [subjectCard.id], hand: [hide.id] }, {}, [subjectCard, hide]);
      const queued = occasion(f).state, before = serializeState(queued), binding = queued.triggerQueue[0];
      expect(binding.abandonedCopy).toBeDefined();
      expect(binding.abandonedNamed).toBeDefined();
      expect(parseEngineBattleFold(save(sliceOf(queued)))).not.toBeNull();
      for (const viewer of SIDES) {
        const shown = f.engine.view(queued, viewer);
        expect(shown.triggerQueue[0]).toMatchObject({ subject: null, abandonedCopy: binding.abandonedCopy });
        expect(shown.triggerQueue[0].abandonedNamed).toBeDefined();
        const sampled = f.engine.determinize(shown, decklists(queued), () => 0.41);
        expect(f.engine.view(sampled, viewer).triggerQueue).toEqual(shown.triggerQueue);
        const copied = resolve(f, sampled);
        expectCopy(f.engine, copied.state, copied.events, side, binding.abandonedCopy!.printing);
        expect(copied.state.triggerQueue).toHaveLength(1);
        const energyBefore = copied.state.sides[side].currentEnergy, named = resolve(f, copied.state);
        expect(named.state.sides[side].currentEnergy).toBe(energyBefore + 2);
        expect(figures(named.events)).toEqual([]);
        expect(named.state.triggerQueue).toEqual([]);
      }
      expect(serializeState(queued)).toBe(before);
    }
  });

  it("keeps detached complete copy values in clones, structural saves and state hashes", () => {
    const f = world(side), queued = occasion(f).state, before = serializeState(queued);
    const loaded = parseEngineBattleFold(save(sliceOf(deserializeState(before))));
    expect(loaded).not.toBeNull();
    const cloned = cloneState(queued);
    expect(stateHash(cloned)).toBe(stateHash(queued));
    const tuple = cloned.triggerQueue[0].abandonedCopy;
    if (tuple === undefined) throw new Error("missing copied values");
    const changed = JSON.parse(before) as BattleState;
    changed.triggerQueue[0] = { ...changed.triggerQueue[0], abandonedCopy: { ...tuple, variant: { amplified: true } } };
    expect(stateHash(changed)).not.toBe(stateHash(queued));
    expect(resolve(f, cloned)).toEqual(resolve(f, loaded!.slice.committed));
    expect(serializeState(queued)).toBe(before);
  });

  it("replays a suspended copy once and refuses stale, concurrent, cancelled and failed continuations", () => {
    const f = world(side, p.sequence(copy(), p.optional(p.gainEnergy(1))));
    const queued = occasion(f).state, before = serializeState(queued);
    const suspended = runStep(queued, { kind: "resolveTrigger" }, INTERACTIVE, f.engine.catalog);
    expect(suspended.kind).toBe("suspended");
    expect(serializeState(queued)).toBe(before);
    expect(() => runStep(queued, { kind: "resolveTrigger" }, { answer() { throw new Error("interrupted"); } }, f.engine.catalog)).toThrow("interrupted");
    expect(serializeState(queued)).toBe(before);
    const { fold, slice: live } = prompted(f);
    const loaded = parseEngineBattleFold(JSON.parse(JSON.stringify(save(live))));
    if (loaded === null) throw new Error("copy save rejected");
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true }), pending = cold.pending(loaded.slice)!;
    expect(pending.prompt).toEqual(fold.pending(live)!.prompt);
    const answer = { kind: "answer", side, promptId: pending.prompt.id, value: true } as const;
    const saved = JSON.stringify(loaded.slice);
    expect(cold.reduce(loaded.slice, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(loaded.slice, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(cold.reduce(loaded.slice, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(cold.reduce({ ...loaded.slice, attempt: loaded.slice.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const result = cold.reduce(loaded.slice, answer), finished = applied(result);
    expect(fold.reduce(live, answer)).toEqual(result);
    expect(cold.reduce(finished, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(JSON.stringify(loaded.slice)).toBe(saved);
    expect(sourceOf(finished.committed, side)).toHaveLength(1);
    expect(serializeState(queued)).toBe(before);
    const cancellable = world(side, copy(), { back: [donor.id, donor.id], hand: [paid.id] });
    const cancelFold = createFoldAdapter(cancellable.engine), start = sliceOf(cancellable.state);
    const choosing = applied(cancelFold.reduce(start, { kind: "battleAction", side, action: { kind: "play", card: cancellable.ids[side].hand[0], from: "hand" } }));
    const payment = cancelFold.pending(choosing)!;
    expect(payment.prompt.cancellable).toBe(true);
    const cancelled = applied(cancelFold.reduce(choosing, { kind: "cancel", side, promptId: payment.prompt.id }));
    expect(serializeState(cancelled.committed)).toBe(serializeState(start.committed));
    expect(cancelled.committed.triggerQueue).toEqual([]);
    const fault = world(side, p.sequence(copy(), p.materializeFigments(parseFigmentId(id(998)))));
    const failure = occasion(fault).state, failureStart = serializeState(failure);
    expect(() => resolve(fault, failure)).toThrow();
    expect(serializeState(failure)).toBe(failureStart);
  });
});

it("rejects malformed zero-spark constructor options", () => {
  for (const value of [undefined, null, {}, { zeroSpark: false }]) expect(() => p.copyAbandonedSubjectAsFigment(value as never)).toThrow();
});

it("guards exact saved tuples and refuses unknown catalog identities before any copy allocation", () => {
  const f = world("player", p.sequence(copy(), p.optional(p.gainEnergy(1)))), pending = prompted(f).slice, queued = pending.committed;
  const tuple = queued.triggerQueue[0].abandonedCopy!;
  const payload = (value: unknown, extra: Record<string, unknown> = {}) => {
    const saved = JSON.parse(JSON.stringify(save(pending))) as { slice: { committed: { triggerQueue: Record<string, unknown>[] } } };
    saved.slice.committed.triggerQueue[0] = { ...saved.slice.committed.triggerQueue[0], abandonedCopy: value, ...extra };
    return saved;
  };
  for (const printing of [tuple.printing, { kind: "figment", figment: token.id, spark: -2 }, { kind: "figmentCopy", cardId: donor.id, spark: -3 }, { kind: "figmentCopy", cardId: donor.id, spark: null }]) {
    expect(parseEngineBattleFold(payload({ printing, variant: { amplified: false } }))).not.toBeNull();
  }
  const invalid = [null, {}, { ...tuple, owner: "player" }, { ...tuple, printing: { kind: "card", cardId: "bad" } },
    { ...tuple, printing: { ...tuple.printing, owner: "player" } }, { ...tuple, printing: { kind: "figment", figment: token.id, spark: NaN } },
    { ...tuple, printing: { kind: "figmentCopy", cardId: donor.id, spark: "invalid" } }, { ...tuple, variant: {} },
    { ...tuple, variant: { amplified: "true" } }, { ...tuple, variant: { amplified: false, unknown: 1 } },
    { ...tuple, variant: { amplified: false, transfigurations: ["bad"] } }, { ...tuple, variant: { amplified: false, deckMods: { ...NO_DECK_MODS, extra: 1 } } },
    { ...tuple, variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Mage", extra: 1 } } } }];
  for (const value of invalid) {
    const saved: unknown = payload(value), before = JSON.stringify(saved);
    expect(parseEngineBattleFold(saved)).toBeNull();
    expect(parseEngineBattleFold(JSON.parse(before) as unknown)).toBeNull();
    expect(JSON.stringify(saved)).toBe(before);
  }
  for (const spark of [NaN, Infinity, -Infinity]) {
    const saved = payload({ ...tuple, printing: { kind: "figmentCopy", cardId: donor.id, spark } });
    expect(parseEngineBattleFold(saved)).toBeNull();
    // JSON encodes a nonfinite number as null, a valid inherited-spark printing.
    expect(parseEngineBattleFold(JSON.parse(JSON.stringify(saved)) as unknown)).not.toBeNull();
  }
  for (const extra of [{ kind: "ruleReaction" }, { kind: "dreamwellBonus" }, { subject: null }, { gain: { amount: 1, expiry: { at: "never" } } }, { discardedCount: 1 },
    { handCopy: { printing: { kind: "card", cardId: donor.id }, variant: { amplified: false }, ephemeral: false, copier: "player", originalHiddenFrom: [] } }]) {
    expect(parseEngineBattleFold(payload(tuple, extra))).toBeNull();
  }
  for (const printing of [{ kind: "card", cardId: id(999) }, { kind: "figment", figment: parseFigmentId(id(999)), spark: 2 }, { kind: "card", cardId: v.event0.id }]) {
    const loaded = parseEngineBattleFold(payload({ printing, variant: { amplified: false } }));
    if (loaded === null) throw new Error("well-shaped tuple rejected structurally");
    const committed = loaded.slice.committed, before = serializeState(committed), events: EngineEvent[] = [];
    expect(() => runStep(committed, { kind: "resolveTrigger" }, NO_PROMPTS, f.engine.catalog, { observeEvent: e => events.push(e) })).toThrow();
    expect(serializeState(committed)).toBe(before);
    const fold = createFoldAdapter(createEngine(f.engine.catalog)), refused = fold.reduce(loaded.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    if (refused.kind !== "applied") throw new Error("expected recoverable copy error");
    expect(refused.error).not.toBeNull();
    expect(refused.published).toEqual([]);
    expect(serializeState(refused.slice.committed)).toBe(before);
    expect(refused.slice.inFlight).toBeNull();
    expect(events.filter(e => e.kind === "cardCreated" || e.kind === "materialized")).toEqual([]);
    for (const viewer of SIDES) for (const e of events) expect(eventSeenBy(e, viewer, committed)).not.toHaveProperty("abandonedCopy");
  }
});
