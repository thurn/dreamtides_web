import type { EngineEvent } from "../../../events";
import { describe, expect, it } from "vitest";
import { activated, discardCost, energy, noCardsIn, staticAbility } from "../../../dsl/builders";
import { boardState } from "../../../testing/board";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { drawCard } from "../../../rules/resources";
import type { ChooseModePrompt } from "../../../prompts/types";
import { revealDeckTop } from "../reveal-deck-top";
import { gainPoints } from "../gain-points";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { parseJourneyBattleFoldState, actionFromUnknown } from "../../../../rules/battle/fold";
import { runStep } from "../../../steps/runner";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { Feasible } from "../../../steps/errors";
import { ScriptedSource, NO_PROMPTS } from "../../../steps/sources";
import { cloneState } from "../../../state/clone";
import { applyDebugOp } from "../../../debug/debug-actions";
import { eventLogRecords } from "../../../log";
import { DECK_TOP, DECK_TOP_CARDS, engine, placed, sliceOf, applied, adapter, v } from "./deck-top-support";

function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: { battleId: "battle-1", siteId: "site-1", nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [] },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}

describe("playFromZone deck recovery", () => {
  it("cancels payment atomically, survives saved reload, and rejects stale, invalid, and concurrent inputs", () => {
    const { state, ids } = placed();
    const fold = adapter();
    const action = { kind: "play", card: ids.player.deck[0], from: "deck" } as const;
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", purpose: { role: "discardCost" } });
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    expect(pending.display.sides.player.currentEnergy).toBe(8);
    expect(engine.view(pending.display, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[0], index: 0 }]);
    expect(parseJourneyBattleFoldState(savedJourney(opened))).not.toBeNull();
    const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(reloaded)).toEqual(pending);
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(fold.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[0]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(cold.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.player.hand[0]] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.deck[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(reloaded, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const answered = applied(cold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[0]] }));
    expect(answered.committed.sides.player.currentEnergy).toBe(7);
    expect(cold.reduce(answered, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[0]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(actionFromUnknown(action)).toEqual(action);
    expect(actionFromUnknown({ ...action, from: "banished" })).toBeNull();
  });

  it("keeps a dry-run's state, payments and next-top knowledge private", () => {
    const { state, ids } = placed();
    const before = cloneState(state);
    expect(() => runStep(state, { kind: "play", from: "deck", card: ids.player.deck[0] }, new ScriptedSource([[ids.player.hand[0]]]), engine.catalog, { dryRun: true })).toThrow(Feasible);
    expect(state).toEqual(before);
  });

  it("rejects a partial saved operation and recovers its committed state without spending twice", () => {
    const { state, ids } = placed();
    const fold = adapter();
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", from: "deck", card: ids.player.deck[0] } }));
    const pending = fold.pending(opened)!;
    const partial: BattleSlice = { ...opened, inFlight: { ...opened.inFlight!, answers: [{ fingerprint: promptFingerprint(pending.prompt), value: [ids.player.deck[1]] }] } };
    expect(fold.pending(partial)).toBeNull();
    const result = fold.reduce(partial, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[0]] });
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("bounced recovery");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed).toEqual(state);
    expect(result.slice.inFlight).toBeNull();
  });

  it("defers a reveal condition enabled by activation costs until abilityActivated completes", () => {
    const payer = { ...DECK_TOP.revealer, id: syntheticId(0x51530), abilities: () => [
      staticAbility(revealDeckTop(), { while: noCardsIn("hand") }), activated([discardCost(1), energy(1)], gainPoints(0)),
    ] };
    const activating = createEngine(testCatalog([payer]));
    const { state, ids } = boardState(activating.catalog, { active: "player", phase: "day", player: { back: [payer.id], hand: [v.vanilla1.id], deck: [v.vanilla2.id], energy: 2 } });
    const observations: { kind: EngineEvent["kind"]; known: readonly unknown[] }[] = [];
    const result = runStep(state, { kind: "activate", source: ids.player.back[0]!, ability: 1 }, NO_PROMPTS, activating.catalog, {
      observeEvent: (event, snapshot) => observations.push({ kind: event.kind, known: activating.view(snapshot(), "enemy").sides.player.deck.known }),
    });
    expect(result.kind).toBe("done");
    const reveal = observations.findIndex((row) => row.kind === "revealed");
    expect(reveal).toBeGreaterThan(observations.findIndex((row) => row.kind === "abilityActivated"));
    for (const row of observations.slice(0, reveal)) expect(row.known).toEqual([]);
    expect(observations[reveal].known).toEqual([{ id: ids.player.deck[0], index: 0 }]);
  });

  it("defers a changed top during a suspended play and replays its hidden display before completion", () => {
    const shifting = { ...DECK_TOP.draw, id: syntheticId(0x51531), synthetic: { play: (ctx: import("../../../steps/types").StepContext, self: import("../../../state/ids").InstanceId) => {
      drawCard(ctx, "player");
      ctx.choose<ChooseModePrompt>({ kind: "chooseMode", side: "player", purpose: { source: self, cardId: syntheticId(0x51531), ability: 0, role: "playRoute" }, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
      return {};
    } } };
    const shiftingEngine = createEngine(testCatalog([...DECK_TOP_CARDS, shifting]));
    const { state, ids } = boardState(shiftingEngine.catalog, { active: "player", phase: "day", player: { back: [DECK_TOP.revealer.id], hand: [shifting.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] } });
    const fold = createFoldAdapter(shiftingEngine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", from: "hand", card: ids.player.hand[0] } }));
    const pending = fold.pending(opened)!;
    expect(shiftingEngine.view(pending.display, "enemy").sides.player.deck.known).toEqual([]);
    expect(shiftingEngine.view(pending.display, "player").sides.player.deck.known).toEqual([]);
    const cold = createFoldAdapter(createEngine(shiftingEngine.catalog), { checkEventPrefix: true });
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    expect(cold.pending(saved)).toEqual(pending);
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const answered = cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
    if (answered.kind !== "applied") throw new Error("answer bounced");
    expect(answered.error).toBeNull();
    expect(answered.published.findIndex((event) => event.kind === "revealed")).toBeGreaterThan(answered.published.findIndex((event) => event.kind === "cardPlayed"));
  });

  it("rolls back an error after a published draw/reveal prompt without retaining an invalid deck position", () => {
    const failing = { ...DECK_TOP.draw, id: syntheticId(0x51532), abilities: () => [], synthetic: { resolve: (ctx: import("../../../steps/types").StepContext, item: import("../../../state/types").CardStackItem) => {
      drawCard(ctx, item.controller);
      ctx.choose<ChooseModePrompt>({ kind: "chooseMode", side: item.controller, purpose: { source: item.instance, cardId: syntheticId(0x51532), ability: 0, role: "chooseCost" }, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
      throw new Error("synthetic failure after published revelation");
    } } };
    const failingEngine = createEngine(testCatalog([...DECK_TOP_CARDS, failing]));
    const { state, ids } = boardState(failingEngine.catalog, { active: "player", phase: "day", player: { back: [DECK_TOP.revealer.id], hand: [failing.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] } });
    const fold = createFoldAdapter(failingEngine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const pending = fold.pending(opened)!;
    expect(failingEngine.view(pending.display, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[1], index: 0 }]);
    const failed = fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
    if (failed.kind !== "applied") throw new Error("error recovery bounced");
    expect(failed.error).not.toBeNull();
    expect(failed.slice.committed.sides).toEqual(opened.committed.sides);
    expect(failingEngine.view(failed.slice.committed, "enemy").sides.player.deck.known).toEqual([{ id: ids.player.deck[0], index: 0 }]);
  });

  it("publishes only fresh debug top revelation, logs it, replays history on reload and undoes it", () => {
    const { state } = placed({ player: { deck: [v.vanilla1.id, v.vanilla2.id] } });
    const edited = applyDebugOp(engine, sliceOf(state), { kind: "addCard", side: "player", card: DECK_TOP.revealer.id, zone: "play" });
    if (edited.kind !== "applied") throw new Error("debug edit rejected");
    expect(edited.published).toEqual([{ kind: "revealed", side: "player", zone: "deck", instances: [state.sides.player.deck[0]] }]);
    expect(eventLogRecords(edited.published, state.version)).toEqual([{ event: "engine.revealed", version: state.version, detail: edited.published[0] }]);
    const saved = JSON.parse(JSON.stringify(edited.slice)) as BattleSlice;
    const changed = applyDebugOp(engine, saved, { kind: "setEnergy", side: "player", energy: 9 });
    if (changed.kind !== "applied") throw new Error("debug change rejected");
    expect(changed.published).toEqual([]);
    const undo = applyDebugOp(engine, changed.slice, { kind: "undo", keep: 1 });
    if (undo.kind !== "applied") throw new Error("debug undo rejected");
    expect(undo.slice.committed).toEqual(edited.slice.committed);
    const reset = applyDebugOp(engine, undo.slice, { kind: "undo", keep: 0 });
    if (reset.kind !== "applied") throw new Error("debug reset rejected");
    expect(reset.slice.committed).toEqual(state);
    expect(reset.published).toEqual([]);
  });
});
