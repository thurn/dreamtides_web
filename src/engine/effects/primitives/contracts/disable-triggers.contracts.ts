/** Selective disabling contracts use synthetic definitions and public engine/fold operations. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, anyCharacter, energy, enemyCharacter, event, exhaustSelf, keyword, self, staticAbility, target } from "../../../dsl/builders";
import { onMaterialized, triggered, whenYouPlay } from "../../../dsl/triggers";
import { eventLogRecords } from "../../../log";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { canActivate, instanceOrigin, originAbilities } from "../../../rules/activation";
import { hasKeyword } from "../../../rules/keywords";
import { effectiveSpark } from "../../../rules/spark";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
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
const engine = createEngine(testCatalog([bearer, arbiter, suppress, conditional, wake, queued, remove, bounce, chooser, failure]));
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
