import { describe, expect, it } from "vitest";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import type { CardId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { eventRedactionViolations } from "../../../testing/redaction";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { passUntil } from "../../../testing/trigger-harness";
import { view } from "../../../view/view";
import { engine, failing, genesis, knowingOnly, leftDeck, mill, mixedDeck, plainDeck, thenDiscover, twin, v } from "./random-selection-support";

const STREAM = "random:selection";

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

const twinOn = (deck: readonly CardId[], back: readonly CardId[] = []) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [twin.id], back, deck, energy: 5 }, enemy: { deck: plainDeck } });

describe("randomSelection deck knowledge", () => {
  it("leaves the deck unshuffled and has each viewer lose track only of known cards whose new place the visible removals leave open", () => {
    // Known events at 0 and 2; the three characters at 1, 3, 4 are the only matches.
    const { state: placed, ids } = twinOn([v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla0.id]);
    const [top, , middle] = ids.player.deck;
    const state = knowingOnly(knowingOnly(placed, "player", [top, middle]), "enemy", [middle]);
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    const entered = leftDeck(state, result.state, "player");
    expect(entered).toHaveLength(2);
    expect(result.state.sides.player.deck).toEqual(state.sides.player.deck.filter((id) => !entered.includes(id)));
    expect(result.state.knownTo.player).toEqual([top]);
    expect(result.state.knownTo.enemy).toEqual([]);
    expect(view(result.state, "player", engine.catalog).instances[middle]).toBeUndefined();
    expect(view(result.state, "player", engine.catalog).instances[top]).toBeDefined();
    for (const id of entered) expect(view(result.state, "enemy", engine.catalog).instances[id]).toMatchObject({ zone: "play" });
    for (const id of result.state.sides.player.deck) expect(view(result.state, "enemy", engine.catalog).instances[id]).toBeUndefined();
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("keeps known places that every possible removal determines, for both viewers", () => {
    const { state: placed, ids } = twinOn([v.event0.id, v.event1.id, v.vanilla1.id, v.vanilla2.id, v.vanilla0.id]);
    const known = ids.player.deck.slice(0, 2);
    const state = knowingOnly(knowingOnly(placed, "player", known), "enemy", known);
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    expect(result.state.knownTo.player).toEqual(known);
    expect(result.state.knownTo.enemy).toEqual(known);
  });

  it("counts only the picks that actually left: a pick held back by capacity stays hidden in place and is no removal", () => {
    // Both characters are picked; only the first in deck order fits the last slot.
    const { state: placed, ids } = twinOn([v.vanilla1.id, v.event0.id, v.vanilla2.id], Array.from({ length: 9 }, () => v.vanilla1.id));
    const [first, known, held] = ids.player.deck;
    const state = knowingOnly(placed, "player", [known]);
    const result = engine.apply(state, "player", playFromHand(ids, "player").action, NO_PROMPTS);
    expect(result.state.sides.player.backRank[9]).toBe(first);
    expect(result.state.sides.player.deck).toEqual([known, held]);
    expect(result.state.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + 2);
    expect(result.state.knownTo.player).toEqual([]);
    const capacity = result.events.find((e) => e.kind === "capacityReached");
    expect(capacity).toEqual({ kind: "capacityReached", side: "player", instance: held, missing: 1 });
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(capacity!, viewer, result.state)).toEqual({ ...capacity, instance: null });
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });
});

describe("randomSelection replay and recovery", () => {
  it("replays a reloaded prompt after the picks with the same picks, once, and bounces stale input", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [thenDiscover.id], deck: mixedDeck }, enemy: { deck: plainDeck } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(slice)!;
    const picks = leftDeck(state, pending.display, "player").filter((id) => pending.display.instances[id].zone === "play");
    expect(picks).toHaveLength(2);
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", privateTo: "player", purpose: { role: "discover" } });
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const reloaded = fresh.pending(saved)!;
    expect(reloaded).toEqual(pending);
    const chosen = (pending.prompt as ChooseCardsPrompt).candidates[0];
    const intent = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: [chosen] };
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, intent)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(fresh.reduce(saved, intent));
    expect(done).toEqual(applied(fold.reduce(slice, intent)));
    expect(done.committed.sides.player.backRank.slice(0, 2)).toEqual(picks);
    expect(done.committed.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + 2);
    expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("resolves a serialized stack item with its captured cost to the same picks as the original", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [genesis.id], back: [v.vanilla1.id], deck: [v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.vanilla1.id], energy: 5 }, enemy: { hand: [mill.id], energy: 1, deck: plainDeck } });
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([[ids.player.back[0]!]]));
    expect(played.state.stack).toHaveLength(1);
    const reloaded = JSON.parse(JSON.stringify(played.state)) as BattleState;
    const original = passUntil(engine, played.state, (next) => next.stack.length === 0);
    const again = passUntil(engine, reloaded, (next) => next.stack.length === 0);
    expect(stateHash(again.state)).toBe(stateHash(original.state));
    const entered = original.state.sides.player.backRank.filter(Boolean);
    expect(entered).toHaveLength(1);
    expect(ids.player.deck.slice(0, 3)).toContain(entered[0]);
  });

  it("rolls back an error after random materialization, keeping no partial zones, ranks, RNG draws, knowledge or published changes", () => {
    const { state: placed, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], deck: [v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla0.id] }, enemy: { deck: plainDeck } });
    const state = knowingOnly(placed, "player", [ids.player.deck[2]]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const outcome = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic error");
    expect(outcome.error.message).toContain("after random materialization");
    const committed = outcome.slice.committed;
    expect(outcome.published.filter((e) => e.kind === "materialized")).toEqual([]);
    expect(committed.sides.player.deck).toEqual(ids.player.deck);
    expect(committed.sides.player.backRank.filter(Boolean)).toEqual([]);
    expect(committed.rng[STREAM] ?? 0).toBe(state.rng[STREAM] ?? 0);
    expect(committed.knownTo).toEqual(state.knownTo);
    expect(outcome.slice.inFlight).toBeNull();
    expect(invariantViolations(committed, engine.catalog)).toEqual([]);
  });
});
