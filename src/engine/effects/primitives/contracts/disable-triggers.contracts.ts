/** Selective disabling contracts use synthetic definitions and public engine/fold operations. */
import { describe, expect, it } from "vitest";
import type { Condition, Duration } from "../../../dsl/types";
import * as p from "../index";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, anyCharacter, energy, enemyCharacter, event, energyX, exhaustSelf, keyword, self, staticAbility, target, everyIn } from "../../../dsl/builders";
import { atEndOfTurn, onMaterialized, triggered, whenYouPlay } from "../../../dsl/triggers";
import { eventLogRecords } from "../../../log";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { canActivate, instanceOrigin, originAbilities } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { comparableView } from "../../../testing/determinization-fidelity";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { runStep } from "../../../steps/runner";
import { boardState, type BoardSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { resolveEffect } from "../../interpreter";
import { disableTriggers } from "../disable-triggers";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { rematerialize } from "../rematerialize";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";
function card(index: number, cardType: "event" | "character", abilities: EngineCardDefinition["abilities"], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return { id: syntheticId(0x56200 + index), cardType, costs: [energy(0)], spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Warrior" : "", speed, status: "authored", abilities };
}
const bearer = card(0, "character", () => [keyword("vengeful"), activated([energy(1), exhaustSelf()], gainPoints(1)),
  triggered(onMaterialized(), gainPoints(3)), triggered(whenYouPlay({ cardType: "event" }), gainPoints(2)), staticAbility(sparkModifier(self(), 1))]);
const arbiter = card(1, "character", (variant) => [triggered(onMaterialized(), disableTriggers(target(enemyCharacter()), "whileSourceInPlay", null,
  variant.amplified ? "triggeredAndActivated" : "triggered"))]);
const suppress = card(2, "event", (variant) => [event(disableTriggers(target(anyCharacter()), "permanent", null,
  variant.amplified ? "triggeredAndActivated" : "triggered"))], "interrupt");
const conditional = card(3, "event", () => [event(disableTriggers(target(anyCharacter()), "permanent", { cond: "energyAtLeast", amount: 3 }, "triggeredAndActivated"))]);
const wake = card(4, "event", () => [event(rematerialize(target(anyCharacter())))]);
const queued = card(5, "event", () => [event(sequence(rematerialize(target(anyCharacter())), disableTriggers(all(anyCharacter()), "permanent", null, "triggeredAndActivated")))]);
const remove = card(6, "event", () => [event(dissolve(target(anyCharacter())))]);
const bounce = card(7, "event", () => [event(returnToHand(target(anyCharacter())))]);
const chooser = card(8, "character", () => [activated([energy(1), exhaustSelf()], gainSpark(target(enemyCharacter()), 1))]);
const failure: EngineCardDefinition = { ...card(9, "event", () => []), synthetic: { resolve(ctx, item) {
  resolveEffect(ctx, disableTriggers(all(anyCharacter()), "permanent", null, "triggeredAndActivated"), {
    controller: item.controller, source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
  });
  throw new Error("Synthetic interruption after disabling");
} } };
const conceal = card(10, "event", () => [event(p.shuffleInto([everyIn("void")]))]);
const drawDeck = card(11, "event", () => [event(p.draw({ value: "countCards", zone: "deck", player: "you" }))]);
const reshuffle = card(12, "event", () => [event(p.shuffleInto([everyIn("hand")]))]);
const copySource = card(13, "event", () => [event(p.createCopyInHand(everyIn("void")))]);
const sourceConditions: readonly (Condition | null)[] = [null,
  ...(["play", "deck", "hand", "void", "stack", "banished"] as const).map((zone): Condition => ({ cond: "sourceIn", zone })),
  { cond: "sourceWasReclaimed" }, { cond: "energyAtLeast", amount: 3 },
];
const sources = sourceConditions.map((condition, index) => card(20 + index, "event", () => [event(disableTriggers(all(anyCharacter()), "permanent", condition, "triggeredAndActivated"))]));
const durations: readonly Duration[] = ["untilEndOfTurn", "untilYourNextTurn", "untilNextDay", { duration: "untilOpponentPays", cost: 1 }];
const lastingSources = durations.map((duration, index) => card(40 + index, "event", () => [event(disableTriggers(all(anyCharacter()), duration, null, "triggeredAndActivated"))]));
const handConceal = card(14, "event", () => [event(p.shuffleInto([], { chooseFromHand: 1 }))]);
const concealOpponent = card(15, "event", () => [event(p.sequence(p.shuffleInto([everyIn("void", {}, { player: "opponent" })]), p.draw(1, "opponent")))]);
const defaultSource = card(16, "event", () => [event(disableTriggers(all(anyCharacter()), "permanent"))]);
const identitySource = card(50, "character", () => [activated([energy(0)], disableTriggers(all(anyCharacter()), "permanent",
  { cond: "controls", selector: { controller: "you", another: true }, atLeast: 2 }, "triggeredAndActivated"))]);
const xSource = { ...card(51, "character", () => [activated([energy(0)], disableTriggers(all(anyCharacter()), "permanent",
  { cond: "controls", selector: { controller: "you", sparkAtLeast: { value: "x" } }, atLeast: 1 }, "triggeredAndActivated"))]), costs: [energyX()] };
const capturedSource = card(52, "character", () => [activated([energy(0)], disableTriggers(all(anyCharacter()), "permanent", null, "triggeredAndActivated"))]);
const capture = card(17, "event", () => [event(p.withMaterialized(p.materialize(everyIn("void", { cardType: "character" })), p.delayed(atEndOfTurn(), gainPoints(1))))]);
const engine = createEngine(testCatalog([bearer, arbiter, suppress, conditional, wake, queued, remove, bounce, chooser, failure,
  conceal, drawDeck, reshuffle, copySource, identitySource, xSource, handConceal, concealOpponent, defaultSource, capture, capturedSource, ...sources, ...lastingSources]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
function board(player: BoardSetup["player"], enemy: BoardSetup["enemy"], active: Side = "player") {
  return boardState(engine.catalog, { active, phase: "day", player: { deck, energy: 8, ...player }, enemy: { deck, energy: 8, ...enemy } });
}
function play(state: BattleState, side: Side, instance: InstanceId, answers: readonly InstanceId[][] = []) {
  const source = new ScriptedSource(answers);
  const cast = engine.apply(state, side, { kind: "play", card: instance, from: "hand" }, source);
  const done = passUntil(engine, cast.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  return { state: done.state, events: [...cast.events, ...done.events] };
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected successful fold intent");
  return outcome.slice;
}
function saved(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}
function silence(side: Side, amplified: boolean) {
  const other = opponent(side);
  const initial = board({ back: [bearer.id, bearer.id], hand: [{ cardId: suppress.id, amplified }, wake.id] },
    { back: [bearer.id, bearer.id], hand: [{ cardId: suppress.id, amplified }, wake.id] }, side);
  const targetId = initial.ids[other].back[0]!;
  const result = play(initial.state, side, initial.ids[side].hand[0], [[targetId]]);
  return { ...initial, ...result, targetId, side, other };
}
describe("selective ability disabling", () => {
  it.each(SIDES.flatMap((side) => [false, true].map((amplified) => ({ side, amplified }))))("preserves abilities but suppresses the requested kinds ($side, combined=$amplified)", ({ side, amplified }) => {
    const { state, ids, targetId, other, events } = silence(side, amplified);
    const change = state.floating.find((effect) => effect.change.kind === "disableTriggers")!.change;
    expect(change).toEqual({ kind: "disableTriggers", instance: targetId, ...(amplified ? { mode: "triggeredAndActivated" } : {}) });
    expect(events.filter((event) => event.kind === "effectStarted").map((event) => event.change)).toEqual([change]);
    expect(originAbilities(engine.catalog, instanceOrigin(state.instances[targetId])).map((ability) => ability.kind)).toEqual(["keyword", "activated", "triggered", "triggered", "static"]);
    expect(hasKeyword(state, engine.catalog, targetId, "vengeful")).toBe(true);
    expect(effectiveSpark(state, engine.catalog, targetId)).toBe(3);
    for (const viewer of SIDES) expect(engine.view(state, viewer).floating.map((effect) => effect.change)).toEqual([change]);
    const ready = passUntil(engine, state, at(engine, other, "day")).state;
    const offered = engine.legalActions(ready, other).filter((action) => action.kind === "activate");
    expect(offered).toContainEqual({ kind: "activate", source: ids[other].back[1], ability: 1 });
    expect(offered.some((action) => action.kind === "activate" && action.source === targetId)).toBe(!amplified);
    expect(canActivate(ready, engine.catalog, other, targetId, 1)).toBe(!amplified);
    const awakened = play(ready, other, ids[other].hand[1], [[targetId]]);
    expect(awakened.events.some((event) => event.kind === "triggerQueued" && event.source === targetId)).toBe(false);
    expect(eventLogRecords(events, state.version).filter((record) => record.event === "engine.abilitiesDisabled").map((record) => record.detail.change)).toEqual([change]);
  });

  it("rejects forged activation before targets and payment, leaving the committed state intact", () => {
    const { state: start, ids } = board({ back: [chooser.id], hand: [{ cardId: suppress.id, amplified: true }] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    const source = ids.player.back[0]!;
    const state = play(start, "player", ids.player.hand[0], [[source]]).state;
    const before = stateHash(state);
    expect(() => runStep(state, { kind: "activate", source, ability: 0 }, NO_PROMPTS, engine.catalog)).toThrow(/cannot be activated/);
    expect(stateHash(state)).toBe(before);
    expect(state.sides.player.currentEnergy).toBe(8);
    expect(state.instances[source].status.exhausted).toBe(false);
    const fold = createFoldAdapter(engine);
    expect(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } })).toEqual({ kind: "bounced", reason: "illegalAction" });
  });

  it("resolves an activated ability already on the stack when disabling begins", () => {
    const { state, ids } = board({ back: [bearer.id] }, { hand: [{ cardId: suppress.id, amplified: true }] });
    const source = ids.player.back[0]!;
    const begun = engine.apply(state, "player", { kind: "activate", source, ability: 1 }, NO_PROMPTS);
    const interrupted = engine.apply(begun.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO_PROMPTS);
    const disabled = interrupted;
    expect(disabled.state.floating[0]?.change).toEqual({ kind: "disableTriggers", instance: source, mode: "triggeredAndActivated" });
    expect(disabled.events.findIndex((event) => event.kind === "effectStarted")).toBeLessThan(disabled.events.findIndex((event) => event.kind === "abilityResolved"));
    const resolved = passUntil(engine, disabled.state, (next) => next.stack.length === 0).state;
    expect(resolved.sides.player.score).toBe(1);
    expect(resolved.sides.player.currentEnergy).toBe(7);
    expect(resolved.instances[source].status.exhausted).toBe(true);
  });

  it("resolves a trigger queued before disabling began and suppresses the next occurrence", () => {
    const { state, ids } = board({ back: [bearer.id], hand: [queued.id, wake.id] }, {});
    const source = ids.player.back[0]!;
    const first = play(state, "player", ids.player.hand[0]).state;
    expect(first.sides.player.score).toBe(5); // The play trigger and rematerialization trigger both precede disabling.
    const second = play(first, "player", ids.player.hand[1]).state;
    expect(second.sides.player.score).toBe(first.sides.player.score);
    expect(second.floating).toHaveLength(1);
    expect(second.instances[source].zone).toBe("play");
  });

  it.each(SIDES)("reads conditions in the effect controller's context for %s", (side) => {
    const { state: initial, ids } = board({ back: [bearer.id], hand: [conditional.id, wake.id] }, { back: [bearer.id], hand: [conditional.id, wake.id] }, side);
    const targetId = ids[opponent(side)].back[0]!;
    const state = play(initial, side, ids[side].hand[0], [[targetId]]).state;
    expect(canActivate(passUntil(engine, state, at(engine, opponent(side), "day")).state, engine.catalog, opponent(side), targetId, 1)).toBe(false);
    const low = structuredClone(state);
    low.sides[side].currentEnergy = 2;
    const ready = passUntil(engine, low, at(engine, opponent(side), "day")).state;
    expect(canActivate(ready, engine.catalog, opponent(side), targetId, 1)).toBe(true);
    const awakened = play(ready, opponent(side), ids[opponent(side)].hand[1], [[targetId]]);
    expect(awakened.events.some((event) => event.kind === "triggerQueued" && event.source === targetId)).toBe(true);
    const restored = structuredClone(awakened.state);
    restored.sides[side].currentEnergy = 3;
    expect(canActivate(restored, engine.catalog, opponent(side), targetId, 1)).toBe(false);
  });

  it.each(SIDES)("ends on source departure and does not resume on source reentry for %s", (side) => {
    const { state: initial, ids } = board({ hand: [{ cardId: arbiter.id, amplified: true }, bounce.id] }, { hand: [{ cardId: arbiter.id, amplified: true }, bounce.id], back: [bearer.id] }, side);
    // Mirror the character placement for the second controller without changing physical identity contracts.
    const setup = side === "player" ? { state: initial, ids } : board({ back: [bearer.id] }, { hand: [{ cardId: arbiter.id, amplified: true }, bounce.id] }, side);
    const source = setup.ids[side].hand[0];
    const targetId = setup.ids[opponent(side)].back[0]!;
    const disabled = play(setup.state, side, source).state;
    const effect = disabled.floating[0];
    expect(effect.expiry).toEqual({ at: "sourceLeavesPlay", source });
    const returned = play(disabled, side, setup.ids[side].hand[1], [[source]]);
    expect(returned.state.floating).toEqual([]);
    expect(eventLogRecords(returned.events, returned.state.version)).toContainEqual({ event: "engine.effectEnded", version: returned.state.version, detail: { kind: "effectEnded", effect: effect.id } });
    expect(returned.events).toContainEqual({ kind: "effectEnded", effect: effect.id });
    const otherDay = passUntil(engine, returned.state, at(engine, opponent(side), "day")).state;
    expect(canActivate(otherDay, engine.catalog, opponent(side), targetId, 1)).toBe(true);
    const sourceDay = passUntil(engine, otherDay, at(engine, side, "day")).state;
    const reentered = play(sourceDay, side, source).state;
    expect(reentered.floating).toHaveLength(1); // Reentry creates its own new occurrence.
    expect(reentered.floating[0]?.id).not.toBe(effect.id);
    expect(reentered.floating[0]?.change).toMatchObject({ instance: targetId, mode: "triggeredAndActivated" });
  });

  it("skips a while-source effect resolving after its source departed", () => {
    const departed: EngineCardDefinition = { ...card(10, "event", () => []), synthetic: { resolve(ctx, item) {
      resolveEffect(ctx, disableTriggers(all(anyCharacter()), "whileSourceInPlay", null, "triggeredAndActivated"), {
        controller: item.controller, source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
    } } };
    const local = createEngine(testCatalog([departed, bearer]));
    const { state, ids } = boardState(local.catalog, { active: "player", phase: "day", player: { hand: [departed.id], back: [bearer.id], deck }, enemy: { deck } });
    const done = local.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(done.state.floating).toEqual([]);
  });

  it("loads absent and valid modes, rejects malformed or incomplete modes, and keeps replay behavior", () => {
    const { state, targetId, other } = silence("player", true);
    const loaded = parseJourneyBattleFoldState(saved(sliceOf(state)))!;
    expect(loaded).not.toBeNull();
    expect(stateHash(loaded.engine.slice.committed)).toBe(stateHash(state));
    const ready = passUntil(engine, loaded.engine.slice.committed, at(engine, other, "day")).state;
    expect(canActivate(ready, engine.catalog, other, targetId, 1)).toBe(false);
    for (const mode of [undefined, "triggered", "triggeredAndActivated"] as const) {
      const altered = structuredClone(state);
      if (mode !== "triggeredAndActivated") altered.floating = altered.floating.map(({ sourceObservedBy: _observed, ...effect }) => effect);
      const change = altered.floating[0].change;
      if (change.kind !== "disableTriggers") throw new Error("missing disable");
      altered.floating[0] = { ...altered.floating[0], change: { kind: "disableTriggers", instance: targetId, ...(mode === undefined ? {} : { mode }) } };
      const savedState = parseJourneyBattleFoldState(saved(sliceOf(altered)))!.engine.slice.committed;
      expect(canActivate(passUntil(engine, savedState, at(engine, other, "day")).state, engine.catalog, other, targetId, 1)).toBe(mode !== "triggeredAndActivated");
    }
    const partial = JSON.parse(JSON.stringify(saved(sliceOf(state)))) as { engine: { slice: { committed: { floating: { change: { instance?: string } }[] } } } };
    delete partial.engine.slice.committed.floating[0].change.instance;
    expect(parseJourneyBattleFoldState(partial)).toBeNull();
    for (const mode of [null, false, 1, "all", [], {}]) {
      const malformed = JSON.parse(JSON.stringify(saved(sliceOf(state)))) as { engine: { slice: { committed: { floating: { change: { mode: unknown } }[] } } } };
      malformed.engine.slice.committed.floating[0].change.mode = mode;
      expect(parseJourneyBattleFoldState(malformed)).toBeNull();
    }
  });

  it("reloads a suspended activation, rejects concurrent and stale input, and pays only on completion", () => {
    const { state, ids } = board({ back: [chooser.id], hand: [suppress.id] }, { back: [v.vanilla1.id, v.vanilla2.id] });
    const source = ids.player.back[0]!;
    const defaultDisabled = play(state, "player", ids.player.hand[0], [[source]]).state;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } } as const;
    const started = applied(fold.reduce(sliceOf(defaultDisabled), intent));
    expect(started.committed.sides.player.currentEnergy).toBe(8);
    expect(started.committed.instances[source].status.exhausted).toBe(false);
    const loaded = parseJourneyBattleFoldState(saved(started))!.engine.slice;
    const pending = fold.pending(loaded)!;
    expect(pending.prompt.kind).toBe("chooseTargets");
    expect(fold.reduce(loaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(loaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.enemy.back[0]!] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = applied(fold.reduce(loaded, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(started.committed));
    const restarted = applied(fold.reduce(cancelled, intent));
    expect(fold.reduce(restarted, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.back[0]!] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.back[0]!] } as const;
    const done = applied(fold.reduce(loaded, answer));
    const direct = applied(fold.reduce(started, answer));
    expect(stateHash(done.committed)).toBe(stateHash(direct.committed));
    expect(done.committed.sides.player.currentEnergy).toBe(7);
    expect(done.committed.instances[source].status.exhausted).toBe(true);
  });

  it("rolls back a floating start when its resolving step throws", () => {
    const { state, ids } = board({ back: [bearer.id], hand: [failure.id] }, { hand: [v.interruptEvent.id] });
    const fold = createFoldAdapter(engine);
    const cast = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const failed = fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (failed.kind !== "applied") throw new Error("Expected contained error");
    expect(failed.error).not.toBeNull();
    expect(failed.slice.committed).toEqual(cast.committed);
    expect(failed.slice.committed.floating).toEqual([]);
    expect(failed.published).toEqual([]);
  });
});
/** Public play and shuffle create an anonymous source obligation, with decklists from the synthetic setup. */
function concealed(side: Side, source = sources[0], reclaimed = false) {
  const setup = { back: [bearer.id], hand: [source.id, conceal.id, drawDeck.id, reshuffle.id, source.id], deck };
  const initial = board(setup, setup, side);
  const entries = (owner: Side) => Object.values(initial.state.instances).filter((instance) => instance.owner === owner)
    .flatMap((instance) => instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId }] : []);
  const lists = { player: entries("player"), enemy: entries("enemy") };
  const sourceId = initial.ids[side].hand[0];
  const started = play(initial.state, side, sourceId);
  // A synthetic public-zone observation of a prior Reclaim play, before concealment.
  if (reclaimed) started.state.instances[sourceId].status.playedViaReclaim = true;
  const hidden = play(started.state, side, initial.ids[side].hand[1]);
  return { ...initial, ...hidden, sourceId, targetId: initial.ids[side].back[0]!, lists };
}
function handCard(state: BattleState, side: Side, definition: EngineCardDefinition): InstanceId {
  const id = state.sides[side].hand.find((id) => {
    const printing = state.instances[id].printing;
    return printing.kind === "card" && printing.cardId === definition.id;
  });
  if (id === undefined) throw new Error("Synthetic hand card missing");
  return id;
}
function sampledAgreement(state: BattleState, lists: Parameters<typeof engine.determinize>[1], viewer: Side) {
  const seen = engine.view(state, viewer);
  const sample = engine.determinize(seen, lists, () => 0.99);
  expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(seen));
  expect(engine.legalActions(sample, state.turn.active).filter((action) => action.kind === "activate")).toEqual(engine.legalActions(state, state.turn.active).filter((action) => action.kind === "activate"));
  return { seen, sample };
}

describe("anonymous combined disabling obligations", () => {
  it.each(SIDES.flatMap((side) => sourceConditions.map((condition, index) => ({ side, condition, index }))))("retains source conditions and legal activations for $side, condition $index", ({ side, condition, index }) => {
    const { state, sourceId, targetId, lists } = concealed(side, sources[index], condition?.cond === "sourceWasReclaimed");
    expect(state.instances[sourceId].zone).toBe("deck");
    for (const viewer of SIDES) {
      const { seen, sample } = sampledAgreement(state, lists, viewer);
      expect(seen.instances[sourceId]).toBeUndefined();
      expect(seen.floating.map(({ change, id, expiry }) => ({ change, id, expiry }))).toEqual(state.floating.map(({ change, id, expiry }) => ({ change, id, expiry })));
      expect(seen.floating.every((effect) => effect.source === null && effect.rememberedSource !== undefined)).toBe(true);
      expect(seen.floating[0].change).toEqual({ kind: "disableTriggers", instance: targetId, mode: "triggeredAndActivated", ...(condition === null ? {} : { while: condition }) });
      expect(engine.view(engine.determinize(engine.view(sample, viewer), lists, () => 0.5), viewer)).toEqual(seen);
      const malformed = { ...seen, disabledActivations: [targetId, targetId] };
      expect(() => engine.determinize(malformed, lists, () => 0.25)).toThrow(/invalid aggregate/);
    }
    const loaded = parseJourneyBattleFoldState(saved(sliceOf(state)))!.engine.slice.committed;
    expect(engine.legalActions(loaded, side)).toEqual(engine.legalActions(state, side));
  });

  it.each(SIDES)("reevaluates deck conditions after a sampled source draws and is shuffled back for %s", (side) => {
    const { state, lists, targetId } = concealed(side, sources[2]);
    {
      const { sample } = sampledAgreement(state, lists, side);
      const afterDraw = play(sample, side, handCard(sample, side, drawDeck)).state;
      expect(canActivate(afterDraw, engine.catalog, side, targetId, 1)).toBe(true);
      const afterShuffle = play(afterDraw, side, handCard(afterDraw, side, reshuffle)).state;
      expect(canActivate(afterShuffle, engine.catalog, side, targetId, 1)).toBe(false);
    }
  });

  it("keeps source identity when another-selector conditions read a character's later public reentry", () => {
    const initial = board({ back: [identitySource.id, bearer.id], hand: [bounce.id, handConceal.id, drawDeck.id], deck }, {});
    const sourceId = initial.ids.player.back[0]!;
    const targetId = initial.ids.player.back[1]!;
    const lists = { player: [identitySource, bearer, bounce, handConceal, drawDeck, ...deck.map((id) => engine.catalog.card(id))].map(({ id }) => ({ cardId: id })), enemy: deck.map((cardId) => ({ cardId })) };
    const started = engine.apply(initial.state, "player", { kind: "activate", source: sourceId, ability: 0 }, NO_PROMPTS);
    const ready = passUntil(engine, started.state, (state) => state.stack.length === 0).state;
    const bounced = play(ready, "player", initial.ids.player.hand[0], [[sourceId]]).state;
    const hidden = play(bounced, "player", initial.ids.player.hand[1], [[sourceId]]).state;
    {
      const { sample } = sampledAgreement(hidden, lists, "player");
      const drawn = play(sample, "player", handCard(sample, "player", drawDeck)).state;
      const returned = play(drawn, "player", handCard(drawn, "player", identitySource)).state;
      expect(canActivate(returned, engine.catalog, "player", targetId, 1)).toBe(true);
    }
  });

  it.each(SIDES.flatMap((side) => sources.map((definition) => ({ side, definition }))))("retains combined effects from a created source that ceases ($side, $definition.id)", ({ side, definition }) => {
    const initial = board({ back: [bearer.id], hand: [copySource.id], void: [definition.id] }, { back: [bearer.id], hand: [copySource.id], void: [definition.id] }, side);
    const copied = play(initial.state, side, initial.ids[side].hand[0]).state;
    const source = copied.sides[side].hand[0];
    const done = play(copied, side, source).state;
    expect(done.instances[source]).toBeUndefined();
    const lists = { player: [{ cardId: bearer.id }, { cardId: copySource.id }, { cardId: definition.id }], enemy: [{ cardId: bearer.id }, { cardId: copySource.id }, { cardId: definition.id }] };
    for (const viewer of SIDES) {
      const { seen, sample } = sampledAgreement(done, lists, viewer);
      expect(seen.floating.every((effect) => effect.source === null)).toBe(true);
      expect(new Set(sample.floating.map((effect) => effect.source)).size).toBe(1);
      const targetId = initial.ids[side].back[0]!;
      const fold = createFoldAdapter(engine);
      if (!canActivate(sample, engine.catalog, side, targetId, 1)) expect(fold.reduce(sliceOf(sample), { kind: "battleAction", side, action: { kind: "activate", source: targetId, ability: 1 } })).toEqual({ kind: "bounced", reason: "illegalAction" });
    }
  });

  it("keeps masked overlapping source truths private with valid expiry futures", () => {
    const initial = board({ back: [bearer.id], hand: [concealOpponent.id], deck: [] }, { void: [sources[2].id, sources[2].id], deck: [] });
    const targetId = initial.ids.player.back[0]!;
    initial.state.floating = initial.ids.enemy.void.map((source, index) => ({ id: index === 0 ? "e1" : "e2", controller: "enemy", source, timestamp: 0,
      expiry: index === 0 ? { at: "paid", effect: "e3" } : { at: "never" }, change: { kind: "disableTriggers", instance: targetId, mode: "triggeredAndActivated", while: { cond: "sourceIn", zone: "deck" } } }));
    initial.state.payable = [{ id: "e3", payer: "player", cost: 1, source: initial.ids.enemy.void[0], affects: [targetId] }];
    initial.state.nextEffect = 4;
    const state = play(initial.state, "player", initial.ids.player.hand[0]).state;
    const alternate = structuredClone(state);
    const [hand] = state.sides.enemy.hand, [deckSource] = state.sides.enemy.deck;
    alternate.sides.enemy.hand = [deckSource]; alternate.sides.enemy.deck = [hand];
    alternate.instances[hand].zone = "deck"; alternate.instances[deckSource].zone = "hand";
    const seen = engine.view(state, "player");
    expect(engine.view(alternate, "player")).toEqual(seen);
    expect(seen.disabledActivations).toEqual([targetId]);
    const lists = { player: [{ cardId: bearer.id }, { cardId: concealOpponent.id }, ...deck.map((cardId) => ({ cardId }))], enemy: [{ cardId: sources[2].id }, { cardId: sources[2].id }] };
    const afterPay = (state: BattleState) => engine.view(engine.apply(state, "player", { kind: "payToEnd", effect: "e3" }, NO_PROMPTS).state, "player").disabledActivations;
    expect(afterPay(state)).not.toEqual(afterPay(alternate));
    const futures = new Set<string>();
    for (const random of [0.01, 0.6, 0.99]) {
      const sample = engine.determinize(seen, lists, () => random);
      expect(comparableView(engine.view(sample, "player"))).toEqual(comparableView(seen));
      expect(stateHash(engine.determinize(engine.view(alternate, "player"), lists, () => random))).toBe(stateHash(sample));
      futures.add(JSON.stringify(afterPay(sample)));
    }
    expect([...futures].every((future) => [JSON.stringify(afterPay(state)), JSON.stringify(afterPay(alternate))].includes(future))).toBe(true);
  });

  it.each(SIDES)("samples legacy unknown printing and opponent ownership without private attribution for %s", (side) => {
    const { state, sourceId, lists } = concealed(side, sources[2]);
    delete state.rememberedCards;
    for (const viewer of SIDES) {
      const { seen } = sampledAgreement(state, lists, viewer);
      const altered = structuredClone(state);
      const other = altered.sides[side].deck.find((id) => id !== sourceId)!;
      altered.instances[sourceId] = { ...state.instances[sourceId], printing: state.instances[other].printing };
      altered.instances[other] = { ...state.instances[other], printing: state.instances[sourceId].printing };
      altered.floating = altered.floating.map((effect) => ({ ...effect, source: other }));
      expect(engine.view(altered, viewer)).toEqual(seen);
      expect(stateHash(engine.determinize(engine.view(altered, viewer), lists, () => 0.25))).toBe(stateHash(engine.determinize(seen, lists, () => 0.25)));
    }
  });

  it.each(SIDES.flatMap((side) => lastingSources.map((definition, index) => ({ side, definition, index }))))("retains expiry and restores activation ($side, duration $index)", ({ side, definition, index }) => {
    const { state, lists, targetId } = concealed(side, definition);
    for (const viewer of SIDES) sampledAgreement(state, lists, viewer);
    const ended = index === 3
      ? engine.apply(passUntil(engine, state, at(engine, opponent(side), "day")).state, opponent(side), { kind: "payToEnd", effect: state.payable[0].id }, NO_PROMPTS).state
      : passUntil(engine, state, (state) => state.floating.length === 0).state;
    expect(ended.floating).toEqual([]);
    const ready = passUntil(engine, ended, at(engine, side, "day")).state;
    expect(canActivate(ready, engine.catalog, side, targetId, 1)).toBe(true);
  });

  it("reads the retained source's new X after a normal public replay", () => {
    const initial = board({ back: [xSource.id, bearer.id], hand: [bounce.id, handConceal.id, drawDeck.id], deck }, {});
    const [sourceId, targetId] = initial.ids.player.back;
    const started = engine.apply(initial.state, "player", { kind: "activate", source: sourceId!, ability: 0 }, NO_PROMPTS);
    const ready = passUntil(engine, started.state, (state) => state.stack.length === 0).state;
    const bounced = play(ready, "player", initial.ids.player.hand[0], [[sourceId!]]).state;
    const hidden = play(bounced, "player", initial.ids.player.hand[1], [[sourceId!]]).state;
    const lists = { player: [xSource, bearer, bounce, handConceal, drawDeck, ...deck.map((id) => engine.catalog.card(id))].map(({ id }) => ({ cardId: id })), enemy: deck.map((cardId) => ({ cardId })) };
    const { sample } = sampledAgreement(hidden, lists, "player");
    const drawn = play(sample, "player", handCard(sample, "player", drawDeck)).state;
    const cast = engine.apply(drawn, "player", { kind: "play", card: handCard(drawn, "player", xSource), from: "hand" }, new ScriptedSource([4]));
    const returned = passUntil(engine, cast.state, (state) => state.stack.length === 0).state;
    expect(canActivate(returned, engine.catalog, "player", targetId!, 1)).toBe(true);
  });

  it("preserves a formerly public opponent-owned source and keeps unknown ownership anonymous", () => {
    const initial = board({ back: [bearer.id], hand: [sources[0].id, concealOpponent.id] }, { deck: [] });
    initial.state.instances[initial.ids.player.hand[0]] = { ...initial.state.instances[initial.ids.player.hand[0]], owner: "enemy" };
    const sourceId = initial.ids.player.hand[0];
    const state = play(play(initial.state, "player", sourceId).state, "player", initial.ids.player.hand[1]).state;
    const lists = { player: [{ cardId: bearer.id }, { cardId: concealOpponent.id }, ...deck.map((cardId) => ({ cardId }))], enemy: [{ cardId: sources[0].id }] };
    const { sample } = sampledAgreement(state, lists, "player");
    const reconstructed = sample.floating[0].source;
    expect(typeof reconstructed).toBe("string");
    if (typeof reconstructed !== "string") throw new Error("Missing reconstructed source");
    expect(sample.instances[reconstructed].owner).toBe("enemy");
    delete state.rememberedCards;
    sampledAgreement(state, lists, "player");
  });

  it("rejects impossible and bounded aggregate constraints without changing the input view", () => {
    const { state, lists, targetId } = concealed("player", sources[1]);
    const seen = engine.view(state, "player"), before = JSON.stringify(seen);
    expect(() => engine.determinize({ ...seen, disabledActivations: [targetId] }, lists, () => 0.25)).toThrow(/impossible aggregate/);
    const low = structuredClone(state); low.sides.player.currentEnergy = 2;
    low.floating = low.floating.map((effect) => effect.change.kind === "disableTriggers" ? { ...effect, change: { ...effect.change, while: { cond: "energyAtLeast", amount: 3 } } } : effect);
    const bounded = { ...engine.view(low, "player"), config: { ...seen.config, resolutionCap: 1 }, disabledActivations: [targetId] };
    expect(() => engine.determinize(bounded, lists, () => 0.25)).toThrow(/battle work cap/);
    expect(JSON.stringify(seen)).toBe(before);
  });

  it("preserves triggered-only hidden-source view shape and activated legality", () => {
    const { state, lists, targetId } = concealed("player", defaultSource);
    const seen = engine.view(state, "player");
    expect(seen.floating).toEqual([]); expect(seen.disabledActivations).toBeUndefined();
    expect(canActivate(engine.determinize(seen, lists, () => 0.25), engine.catalog, "player", targetId, 1)).toBe(true);
  });

  it("keeps a controller energy condition dynamic after anonymous reconstruction", () => {
    const { state, lists, targetId } = concealed("player", sources[8]);
    const { sample } = sampledAgreement(state, lists, "player");
    sample.sides.player.currentEnergy = 2;
    expect(canActivate(sample, engine.catalog, "player", targetId, 1)).toBe(true);
    sample.sides.player.currentEnergy = 3;
    expect(canActivate(sample, engine.catalog, "player", targetId, 1)).toBe(false);
  });

  it("preserves a shared anonymous source and captured cohort without a remembered printing", () => {
    const initial = board({ back: [bearer.id], hand: [capture.id, bounce.id, handConceal.id], void: [capturedSource.id], deck: [...deck, capturedSource.id] }, {});
    const sourceId = initial.ids.player.void[0];
    const captured = play(initial.state, "player", initial.ids.player.hand[0]).state;
    const begun = engine.apply(captured, "player", { kind: "activate", source: sourceId, ability: 0 }, NO_PROMPTS);
    const ready = passUntil(engine, begun.state, (state) => state.stack.length === 0).state;
    const bounced = play(ready, "player", initial.ids.player.hand[1], [[sourceId]]).state;
    const hidden = play(bounced, "player", initial.ids.player.hand[2]).state; delete hidden.rememberedCards;
    const lists = { player: [bearer, capture, bounce, handConceal, capturedSource, capturedSource, ...deck.map((id) => engine.catalog.card(id))].map(({ id }) => ({ cardId: id })), enemy: deck.map((cardId) => ({ cardId })) };
    let draw = 0; const sample = engine.determinize(engine.view(hidden, "player"), lists, () => (++draw % 2 === 0 ? 0.01 : 0.99));
    expect(engine.view(sample, "player")).toEqual(engine.view(hidden, "player"));
    const trigger = sample.floating.find(({ change }) => change.kind === "trigger")!.change;
    expect(trigger.kind === "trigger" ? trigger.captured : []).toContain(sample.floating.find(({ change }) => change.kind === "disableTriggers")!.source);
  });

});
