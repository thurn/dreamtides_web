import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { discardedCount, energy, event, reclaim } from "../../../dsl/builders";
import { triggered, whenDiscardBatch } from "../../../dsl/triggers";
import { eventSeenBy } from "../../../events";
import { NO_DECK_MODS } from "../../../dsl/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { type CardId, type InstanceId } from "../../../state/ids";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { discardChosen } from "../discard-chosen";
import { draw } from "../draw";
import { v, deck, knowing } from "./cards-support";

/** Synthetic chosen-hand effects, independent of catalog text and printed defaults. */
const chosenDiscard: EngineCardDefinition = {
  id: syntheticId(960), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(discardChosen())],
};

const chosenEventDiscard: EngineCardDefinition = {
  ...chosenDiscard, id: syntheticId(961), abilities: () => [event(discardChosen({ cardType: "event" }))],
};

const reclaimChosenDiscard: EngineCardDefinition = {
  ...chosenDiscard, id: syntheticId(962), abilities: () => [event(discardChosen()), reclaim(energy(1))],
};

const chosenDiscardThenFail: EngineCardDefinition = {
  ...chosenDiscard, id: syntheticId(963), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discardChosen(), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after chosen discard");
    },
  },
};

const chosenBatchWatcher: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(0xc6201),
  abilities: () => [triggered(whenDiscardBatch(), draw(discardedCount()), { oncePerTurn: true })],
};

describe("discardChosen", () => {
  const chosenEngine = createEngine(testCatalog([chosenDiscard, chosenEventDiscard, reclaimChosenDiscard, chosenDiscardThenFail, chosenBatchWatcher]));
  const setup = (card = chosenDiscard.id, hand: readonly CardId[] = [v.event1.id, v.vanilla1.id, v.event1.id]): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [card], deck, energy: 3 }, enemy: { hand, deck },
  });
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };
  const suspend = (board = setup()) => {
    const fold = createFoldAdapter(chosenEngine, { checkEventPrefix: true });
    const { state, ids } = boardState(chosenEngine.catalog, board);
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const slice = applied(fold.reduce(start, { kind: "battleAction", side: board.active, action: playFromHand(ids, board.active).action }));
    const pending = fold.pending(slice)!;
    return { fold, slice, pending, ids };
  };

  it("privately lets the controller choose an opponent hand instance, preserving duplicate UUIDs and publishing its discard", () => {
    const { fold, slice, pending, ids } = suspend();
    const prompt = pending.prompt as ChooseCardsPrompt;
    expect(prompt).toMatchObject({ side: "player", privateTo: "player", min: 1, max: 1, cancellable: false, candidates: ids.enemy.hand });
    expect(prompt.purpose.role).toBe("discardChosen");
    expect(prompt.candidates[0]).not.toBe(prompt.candidates[2]);
    expect(view(pending.display, "player", chosenEngine.catalog).instances[ids.enemy.hand[2]]).toBeDefined();
    expect((promptView(prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual(ids.enemy.hand);
    expect(view(pending.display, "player", chosenEngine.catalog).instances[ids.enemy.deck[0]]).toBeUndefined();
    const outcome = fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[2]] });
    const done = applied(outcome);
    expect(done.committed.sides.enemy.hand).toEqual(ids.enemy.hand.slice(0, 2));
    expect(done.committed.sides.enemy.void).toEqual([ids.enemy.hand[2]]);
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(outcome.published.filter((e) => e.kind === "discarded")).toEqual([{ kind: "discarded", side: "enemy", instance: ids.enemy.hand[2] }]);
    expect(invariantViolations(done.committed, chosenEngine.catalog)).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("publishes one holder batch and resolves their watcher after a private chosen discard for %s", (side) => {
    const holder = side === "player" ? "enemy" : "player";
    const board: BoardSetup = { active: side, phase: "day",
      [side]: { back: [chosenBatchWatcher.id], hand: [chosenDiscard.id], deck },
      [holder]: { back: [chosenBatchWatcher.id], hand: [v.vanilla1.id, v.event1.id], deck } };
    const { fold, slice, pending, ids } = suspend(board);
    expect(pending.prompt).toMatchObject({ side, privateTo: side, min: 1, max: 1, candidates: ids[holder].hand });
    expect((promptView(pending.prompt, holder, pending.display) as ChooseCardsPrompt).candidates).toEqual(ids[holder].hand);
    expect(view(pending.display, side, chosenEngine.catalog).instances[ids[holder].hand[0]]).toBeDefined();
    expect(view(pending.display, side, chosenEngine.catalog).instances[ids[holder].deck[0]]).toBeUndefined();
    const chosen = ids[holder].hand[0];
    const outcome = fold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value: [chosen] });
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("chosen batch bounced");
    expect(outcome.published.filter((e) => e.kind === "discarded")).toEqual([{ kind: "discarded", side: holder, instance: chosen }]);
    const batches = outcome.published.filter((e) => e.kind === "discardBatch");
    expect(batches).toEqual([{ kind: "discardBatch", side: holder, count: 1 }]);
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(batches[0], viewer, done.committed)).toEqual(batches[0]);
    expect(outcome.published.filter((e) => e.kind === "triggerQueued")).toEqual([expect.objectContaining({ source: ids[holder].back[0], controller: holder, subject: null, discardedCount: 1 })]);
    expect(outcome.published.filter((e) => e.kind === "triggerResolved")).toEqual([expect.objectContaining({ source: ids[holder].back[0], controller: holder, applied: true })]);
    expect(outcome.published.filter((e) => e.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side: holder, instance: ids[holder].deck[0] }]);
    expect(done.committed.sides[holder].hand).toEqual([ids[holder].hand[1], ids[holder].deck[0]]);
    expect(done.committed.oncePerTurn).toHaveLength(1);
    expect(done.committed.triggerQueue).toEqual([]);
    expect(invariantViolations(done.committed, chosenEngine.catalog)).toEqual([]);
  });

  it("filters effective event types and does nothing for empty or unmatched hands", () => {
    const { pending, ids } = suspend(setup(chosenEventDiscard.id));
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual([ids.enemy.hand[0], ids.enemy.hand[2]]);
    for (const hand of [[], [v.vanilla1.id, v.vanilla2.id]]) {
      const result = runScenario(chosenEngine, { board: setup(chosenEventDiscard.id, hand), steps: (ids) => [playFromHand(ids, "player")] });
      expect(result.answers).toEqual([]);
      expect(result.events.filter((e) => e.kind === "discarded" || e.kind === "discardBatch")).toEqual([]);
      expect(result.state.sides.enemy.hand).toEqual(result.ids.enemy.hand);
    }
    const lone = runScenario(chosenEngine, { board: setup(chosenEventDiscard.id, [v.vanilla1.id, v.event1.id]), steps: (ids) => [playFromHand(ids, "player")] });
    expect(lone.answers).toEqual([expect.objectContaining({ auto: true })]);
    expect(lone.state.sides.enemy.void).toEqual([lone.ids.enemy.hand[1]]);
  });

  it("filters the hand's effective types, including deck-entry type changes", () => {
    const board: BoardSetup = {
      ...setup(chosenEventDiscard.id),
      enemy: { deck, hand: [
        { cardId: v.vanilla1.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } },
        { cardId: v.event1.id, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Warrior" } } },
        v.event0.id,
      ] },
    };
    const { pending, ids } = suspend(board);
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual([ids.enemy.hand[0], ids.enemy.hand[2]]);
  });

  it("uses the normal discard zone contract for a created card and a card held by a foreign controller", () => {
    for (const created of [true, false]) {
      const { state, ids } = boardState(chosenEngine.catalog, setup());
      const chosen = ids.enemy.hand[2];
      state.instances[chosen].status.created = created;
      if (!created) state.instances[chosen] = { ...state.instances[chosen], owner: "player" };
      const result = chosenEngine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[chosen]]));
      if (created) {
        expect(result.state.instances[chosen]).toBeUndefined();
        expect(result.events.some(e => e.kind === "ceasedToExist" && e.instance === chosen)).toBe(true);
      } else {
        expect(result.state.sides.player.void).toContain(chosen);
        expect(result.state.sides.enemy.void).not.toContain(chosen);
      }
      expect(result.events.filter(e => e.kind === "discarded")).toEqual([{ kind: "discarded", side: "enemy", instance: chosen }]);
      expect(invariantViolations(result.state, chosenEngine.catalog)).toEqual([]);
    }
  });

  it("works symmetrically for the enemy controller without exposing the player's deck", () => {
    const board: BoardSetup = { active: "enemy", phase: "day", enemy: { hand: [chosenDiscard.id], deck }, player: { hand: [v.vanilla1.id, v.event1.id], deck } };
    const { pending, fold, slice, ids } = suspend(board);
    expect(pending.prompt).toMatchObject({ side: "enemy", privateTo: "enemy", candidates: ids.player.hand });
    expect((promptView(pending.prompt, "player", pending.display) as ChooseCardsPrompt).candidates).toEqual(ids.player.hand);
    expect(view(pending.display, "enemy", chosenEngine.catalog).instances[ids.player.deck[0]]).toBeUndefined();
    const done = applied(fold.reduce(slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [ids.player.hand[0]] }));
    expect(done.committed.sides.player.void).toEqual([ids.player.hand[0]]);
  });

  it("discards each scripted legal hand choice with the same payment contract", () => {
    for (const index of [0, 1]) {
      const { state, ids } = boardState(chosenEngine.catalog, setup(chosenDiscard.id, [v.vanilla1.id, v.vanilla5.id]));
      const chosen = ids.enemy.hand[index];
      const answers = new ScriptedSource([[chosen]]);
      const result = chosenEngine.apply(state, "player", playFromHand(ids, "player").action, answers);
      answers.assertExhausted();
      expect(result.state.sides.enemy.hand).toEqual(ids.enemy.hand.filter((id) => id !== chosen));
      expect(result.state.sides.enemy.void).toEqual([chosen]);
      expect(result.events.filter((e) => e.kind === "discarded")).toEqual([{ kind: "discarded", side: "enemy", instance: chosen }]);
      expect(result.state.sides.player.void).toEqual(ids.player.hand);
      expect(invariantViolations(result.state, chosenEngine.catalog)).toEqual([]);
    }
  });

  it("reconstructs an identical private prompt on reload, rejects illegal, foreign, stale and concurrent inputs, and commits once", () => {
    const { slice, pending, ids } = suspend(setup(chosenEventDiscard.id));
    const committed = stateHash(slice.committed);
    expect(slice.committed.sides.enemy.hand).toEqual(ids.enemy.hand);
    expect(slice.committed.knownTo.player).toEqual([]);
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(chosenEngine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const laterAttempt = { ...saved, attempt: saved.attempt + 1 };
    expect(fresh.reduce(laterAttempt, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const answer = (side: "player" | "enemy", value: readonly InstanceId[]) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [ids.enemy.hand[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], ids.enemy.hand.slice(0, 2), [ids.enemy.hand[1]], [ids.player.deck[0]], [ids.enemy.hand[0], ids.enemy.hand[0]]]) {
      expect(answer("player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(committed);
    const done = applied(answer("player", [ids.enemy.hand[2]]));
    expect(done.committed.sides.enemy.hand).toEqual(ids.enemy.hand.slice(0, 2));
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const next = applied(fresh.reduce(done, { kind: "battleAction", side: "player", action: { kind: "pass" } }));
    expect(fresh.reduce(next, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] })).toMatchObject({ kind: "bounced" });
  });

  it("rolls back the discard but keeps the prompt's private knowledge on an error after selection without partial event publication", () => {
    const { slice, pending, ids } = suspend(setup(chosenDiscardThenFail.id));
    const outcome = createFoldAdapter(chosenEngine, { checkEventPrefix: true }).reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[2]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(knowing(slice.committed, "player", ids.enemy.hand));
    expect(outcome.slice.committed.sides.enemy.void).toEqual([]);
  });

  it("composes with Reclaim, paying its cost and banishing the reclaimed source after another chosen discard", () => {
    const { state, ids } = boardState(chosenEngine.catalog, setup(reclaimChosenDiscard.id));
    const first = chosenEngine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.enemy.hand[0]]]));
    const second = chosenEngine.apply(first.state, "player", { kind: "play", from: "void", card: ids.player.hand[0] }, new ScriptedSource([[ids.enemy.hand[2]]]));
    expect(second.state.sides.player.currentEnergy).toBe(first.state.sides.player.currentEnergy - 1);
    expect(second.state.sides.player.banished).toContain(ids.player.hand[0]);
    expect([...second.state.sides.enemy.void].sort()).toEqual([ids.enemy.hand[0], ids.enemy.hand[2]].sort());
    expect(invariantViolations(second.state, chosenEngine.catalog)).toEqual([]);
  });
});
