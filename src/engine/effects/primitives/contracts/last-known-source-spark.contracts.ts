/** Resolving source-spark reads use current play information or retained departure information. */
import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, all, anyCharacter, characterYouControl, energy, everyIn, event, reclaim, self, staticAbility, supported } from "../../../dsl/builders";
import { onDissolved, triggered, whenReclaim } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { effectiveSpark } from "../../../rules/spark";
import { ceaseToExist } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { abandon } from "../abandon";
import { dissolve } from "../dissolve";
import { delayed } from "../floating-trigger";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { materialize } from "../materialize";
import { optional } from "../optional";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

function character(index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return { id: syntheticId(0x46000 + index), cardType: "character", costs: [energy(0)], spark: 2,
    subtype: "Explorer", speed: "standard", status: "authored", abilities };
}
const explorers = all(characterYouControl({ subtype: "Explorer" }));
const watcher = (effect: Parameters<typeof triggered>[1]) => () => [triggered(whenReclaim(), effect)];
const reader = character(0, () => [triggered(whenReclaim(), gainPoints(thisCharacterSpark())),
  activated([energy(0)], gainSpark(self(), 2, "whileSourceInPlay"))]);
const killer = { ...character(1, watcher(dissolve(explorers))), subtype: "Warrior" as const };
const booster = { ...character(2, watcher(gainSpark(explorers, 3))), subtype: "Warrior" as const };
const supporter = { ...character(3, () => [staticAbility(sparkModifier(supported(), 4))]), subtype: "Warrior" as const };
const returning = { ...character(4, watcher(returnToHand(explorers))), subtype: "Warrior" as const };
const reentering = { ...character(5, watcher(sequence(returnToHand(explorers), materialize(everyIn("hand", { subtype: "Explorer" }))))), subtype: "Warrior" as const };
const dying = character(6, () => [triggered(onDissolved(), gainPoints(thisCharacterSpark()))]);
const midEffect = character(7, () => [activated([energy(0)], sequence(gainSpark(self(), 3, "whileSourceInPlay"), abandon(), gainPoints(thisCharacterSpark())))]);
const selfCost = character(8, () => [activated([abandonSelfCost()], gainPoints(thisCharacterSpark()))]);
const activation = character(9, () => [activated([energy(0)], gainPoints(thisCharacterSpark()))]);
const delayedReader = character(10, () => [activated([energy(0)], sequence(
  gainSpark(self(), 3, "whileSourceInPlay"), delayed(whenReclaim(), gainPoints(thisCharacterSpark())),
  dissolve(self()), delayed(whenReclaim(), gainPoints(thisCharacterSpark())),
))]);
const hesitant = character(11, watcher(optional(gainPoints(thisCharacterSpark()))));
const rec = { ...v.event0, id: syntheticId(0x46100), status: "authored" as const, abilities: () => [reclaim(energy(0))] };
const silent = { ...v.interruptEvent, id: syntheticId(0x46101), synthetic: { resolve(ctx: Parameters<typeof ceaseToExist>[0]) {
  const target = ctx.state.sides.player.frontRank[0];
  if (target === null) throw new Error("missing synthetic silent departure");
  ceaseToExist(ctx, target, { silent: true });
} } };
const killingResponse = { ...v.interruptEvent, id: syntheticId(0x46102), status: "authored" as const, costs: [energy(0)],
  abilities: () => [event(dissolve(all(anyCharacter({ subtype: "Explorer" }))))] };
const E = createEngine(testCatalog([reader, killer, booster, supporter, returning, reentering, dying, midEffect, selfCost, activation, delayedReader, hesitant, rec, silent, killingResponse]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
function setup(player: BoardSetup["player"], enemy: BoardSetup["enemy"] = {}) {
  return boardState(E.catalog, { active: "player", phase: "day", scoreToWin: 100,
    player: { deck, void: [rec.id], energy: 5, ...player }, enemy: { deck, hand: [v.interruptEvent.id], energy: 5, ...enemy } });
}
function step(state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, E.catalog);
  if (result.kind !== "done") throw new Error(`unexpected prompt ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`failed fold outcome ${JSON.stringify(result)}`);
  return result.slice;
}
function pending(player: BoardSetup["player"]) {
  const board = setup(player);
  return { ...board, state: step(board.state, { kind: "play", card: board.ids.player.void[0], from: "void" }).state };
}
function saved(state: BattleState): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: parseBattleId("battle-last-known"), siteId: parseSiteId("site-last-known"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-last-known"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: state.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: sliceOf(state) } };
}

describe("last-known source spark", () => {
  it("reads current effective spark when an earlier queued trigger changes a source that stays in play", () => {
    const start = pending({ back: [booster.id, reader.id] });
    const boosted = step(start.state, { kind: "resolveTrigger" }).state;
    const read = step(boosted, { kind: "resolveTrigger" }).state;
    expect(read.sides.player.score).toBe(5);
    expect(effectiveSpark(read, E.catalog, start.ids.player.back[1]!)).toBe(5);
  });

  it("retains permanent gains, Support and a duration before departure ends changes and clears counters", () => {
    const board = setup({ back: [killer.id, supporter.id], front: [reader.id] });
    const source = board.ids.player.front[0]!;
    board.state.instances[source].status.gainedSpark = 3;
    board.state.instances[source].status.counters = 3;
    const active = step(board.state, { kind: "activate", source, ability: 1 }).state;
    const buffed = step(active, { kind: "resolveTop" }).state;
    expect(effectiveSpark(buffed, E.catalog, source)).toBe(11);
    const queued = step(buffed, { kind: "play", card: board.ids.player.void[0], from: "void" }).state;
    const departed = step(queued, { kind: "resolveTrigger" });
    expect(departed.events).toContainEqual({ kind: "leftPlay", instance: source, side: "player", to: "void", spark: 11 });
    expect(departed.state.instances[source]?.status.counters).toBe(0);
    expect(effectiveSpark(departed.state, E.catalog, source)).toBe(5);
    expect(step(departed.state, { kind: "resolveTrigger" }).state.sides.player.score).toBe(11);
  });

  it("uses current spark when the same physical card returns to play before its queued ability reads", () => {
    const start = pending({ back: [reentering.id, supporter.id], front: [reader.id] });
    const source = start.ids.player.front[0]!;
    start.state.instances[source].status.gainedSpark = 3;
    const reentered = step(start.state, { kind: "resolveTrigger" }).state;
    expect(reentered.instances[source]?.zone).toBe("play");
    expect(step(reentered, { kind: "resolveTrigger" }).state.sides.player.score).toBe(5);
  });

  it("captures a Dissolved trigger enqueued after its source has left play", () => {
    const start = pending({ back: [killer.id], front: [dying.id], hand: [v.interruptEvent.id] });
    const source = start.ids.player.front[0]!;
    start.state.instances[source].status.gainedSpark = 3;
    const departed = step(start.state, { kind: "resolveTrigger" });
    expect(departed.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, lastKnownSourceSpark: 5 }));
    expect(step(departed.state, { kind: "resolveTrigger" }).state.sides.player.score).toBe(5);
  });

  it.each([false, true])("retains a created source at public departure step boundaries (silent=%s)", (silently) => {
    const board = setup({ back: silently ? [] : [killer.id] }, { hand: [silent.id] });
    const source = placeFigment(board.state, "player", { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: reader.id, spark: 7 });
    const queued = step(board.state, { kind: "play", card: board.ids.player.void[0], from: "void" }).state;
    let departed: BattleState;
    if (silently) {
      // Isolated public step boundaries exercise silent lifecycle capture, independently of automatic trigger scheduling.
      const cast = step(queued, { kind: "play", card: board.ids.enemy.hand[0], from: "hand" }).state;
      departed = step(cast, { kind: "resolveTop" }).state;
    } else departed = step(queued, { kind: "resolveTrigger" }).state;
    expect(departed.instances[source]).toBeUndefined();
    expect(step(departed, { kind: "resolveTrigger" }).state.sides.player.score).toBe(7);
    expect(E.view(departed, "player").triggerQueue[0]).not.toHaveProperty("lastKnownSourceSpark");
  });

  it("reads departure spark when the currently resolving effect gains spark and then abandons its source", () => {
    const board = setup({ back: [midEffect.id] });
    const source = board.ids.player.back[0]!;
    const active = step(board.state, { kind: "activate", source, ability: 0 }).state;
    const resolved = step(active, { kind: "resolveTop" }).state;
    expect(resolved.instances[source]?.zone).toBe("void");
    expect(resolved.sides.player.score).toBe(5);
  });

  it.each([false, true])("retains a self-abandon cost before its ability enters the stack (created=%s)", (created) => {
    const board = setup({ back: created ? [] : [selfCost.id] });
    const source = created ? placeFigment(board.state, "player", { rank: "back", index: 0 },
      { kind: "figmentCopy", cardId: selfCost.id, spark: 7 }) : board.ids.player.back[0]!;
    board.state.instances[source].status.gainedSpark = 3;
    const active = step(board.state, { kind: "activate", source, ability: 0 }).state;
    if (created) expect(active.instances[source]).toBeUndefined();
    else expect(active.instances[source]?.zone).toBe("void");
    expect(step(deserializeState(serializeState(active)), { kind: "resolveTop" }).state.sides.player.score).toBe(created ? 10 : 5);
  });

  it("retains a waiting activated ability's source spark when another stack item dissolves it", () => {
    const board = setup({ back: [activation.id] }, { hand: [killingResponse.id] });
    const source = board.ids.player.back[0]!;
    board.state.instances[source].status.gainedSpark = 3;
    const active = step(board.state, { kind: "activate", source, ability: 0 }).state;
    const responded = step(active, { kind: "play", card: board.ids.enemy.hand[0], from: "hand" }).state;
    const departed = step(responded, { kind: "resolveTop" }).state;
    expect(step(departed, { kind: "resolveTop" }).state.sides.player.score).toBe(5);
  });

  it("retains delayed triggers created on both sides of departure across separate steps", () => {
    const board = setup({ back: [delayedReader.id] });
    const source = board.ids.player.back[0]!;
    const active = step(board.state, { kind: "activate", source, ability: 0 }).state;
    const waiting = step(active, { kind: "resolveTop" }).state;
    const loaded = deserializeState(serializeState(waiting));
    expect(stateHash(loaded)).toBe(stateHash(waiting));
    const view = E.view(loaded, "player");
    const lists = { player: [...deck, rec.id, delayedReader.id].map((cardId) => ({ cardId })),
      enemy: [...deck, v.interruptEvent.id].map((cardId) => ({ cardId })) };
    const sampled = E.determinize(view, lists, () => 0.5);
    expect(E.view(sampled, "player").floating).toEqual(view.floating);
    const queued = step(sampled, { kind: "play", card: board.ids.player.void[0], from: "void" }).state;
    const first = step(queued, { kind: "resolveTrigger" }).state;
    expect(step(first, { kind: "resolveTrigger" }).state.sides.player.score).toBe(10);
  });

  it("preserves visible departure information through JSON, hashing and determinization, and omits it with a hidden source", () => {
    const start = pending({ back: [returning.id, reader.id] });
    const source = start.ids.player.back[1]!;
    start.state.instances[source].status.gainedSpark = 3;
    const returned = step(start.state, { kind: "resolveTrigger" }).state;
    const loaded = deserializeState(serializeState(returned));
    expect(stateHash(loaded)).toBe(stateHash(returned));
    const lists = { player: [...deck, rec.id, returning.id, reader.id].map((cardId) => ({ cardId })),
      enemy: [...deck, v.interruptEvent.id].map((cardId) => ({ cardId })) };
    const seen = E.view(loaded, "player");
    const sampled = E.determinize(seen, lists, () => 0.5);
    expect(E.view(sampled, "player").triggerQueue).toEqual(seen.triggerQueue);
    expect(step(sampled, { kind: "resolveTrigger" }).state.sides.player.score).toBe(5);
    const different = { ...loaded, triggerQueue: loaded.triggerQueue.map((entry) => ({ ...entry, lastKnownSourceSpark: 6 })) };
    expect(stateHash(different)).not.toBe(stateHash(loaded));
    const hidden = { ...loaded, knownTo: { ...loaded.knownTo, enemy: loaded.knownTo.enemy.filter((id) => id !== source) } };
    expect(E.view(hidden, "enemy").triggerQueue[0]).toMatchObject({ source: null, origin: null });
    expect(E.view(hidden, "enemy").triggerQueue[0]).not.toHaveProperty("lastKnownSourceSpark");
    expect(eventSeenBy({ kind: "triggerQueued", source, controller: "player", ability: 0, node: null, subject: null, lastKnownSourceSpark: 5 }, "enemy", hidden)).toBeNull();
  });

  it("reconstructs a departure's retained value across a resolving prompt and a reloaded fold", () => {
    const board = setup({ back: [killer.id, hesitant.id] });
    const source = board.ids.player.back[1]!;
    board.state.instances[source].status.gainedSpark = 3;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const suspended = applied(fold.reduce(sliceOf(board.state), { kind: "battleAction", side: "player",
      action: { kind: "play", card: board.ids.player.void[0], from: "void" } }));
    const pending = fold.pending(suspended);
    if (pending === null) throw new Error("expected optional award prompt");
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const direct = applied(fold.reduce(suspended, answer));
    const replayed = applied(createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, answer));
    expect(replayed.committed.sides.player.score).toBe(5);
    expect(stateHash(replayed.committed)).toBe(stateHash(direct.committed));
  });

  it("validates retained queued, stacked and delayed values at the saved-state boundary", () => {
    const board = setup({ back: [delayedReader.id, reader.id] });
    const source = board.ids.player.back[0]!;
    const active = step(board.state, { kind: "activate", source, ability: 0 }).state;
    const waiting = step(active, { kind: "resolveTop" }).state;
    const queued = step(waiting, { kind: "play", card: board.ids.player.void[0], from: "void" }).state;
    expect(parseJourneyBattleFoldState(saved(queued))).not.toBeNull();
    for (const bad of [-1, "5", null, Number.POSITIVE_INFINITY, Number.NaN]) {
      for (const where of ["triggerQueue", "floating", "stack"] as const) {
        const fixture = deserializeState(serializeState(queued));
        if (where === "triggerQueue") fixture.triggerQueue = fixture.triggerQueue.map((entry) => ({ ...entry, lastKnownSourceSpark: bad as number }));
        if (where === "floating") fixture.floating = waiting.floating.map((entry) => ({ ...entry, change: { ...entry.change, lastKnownSourceSpark: bad as number } }));
        if (where === "stack") fixture.stack = [{ kind: "ability", source, origin: { kind: "card", cardId: delayedReader.id, variant: { amplified: false } },
          controller: "player", ability: 0, choices: { modes: [], targets: [] }, x: null, optionalPaid: [], lastKnownSourceSpark: bad as number }];
        expect(parseJourneyBattleFoldState(saved(fixture)), `${where}:${String(bad)}`).toBeNull();
      }
    }
  });
});
